from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import re

from app.db.session import get_db_connection
from app.core.billing_reference import generate_reference
from app.core.utils import split_address_parts


@dataclass
class RecipientLine:
    shop_id: str | None
    delivery_id: str | None
    amount_due: Decimal
    meta: dict


def _get_vat_rate(cur, period_month: date) -> Decimal:
    cur.execute("SELECT to_regclass('public.app_settings')")
    table = cur.fetchone()
    if not table or table[0] is None:
        return Decimal("0.081")
    cur.execute(
        """
        SELECT value_numeric
        FROM public.app_settings
        WHERE key = 'vat_rate'
          AND effective_from <= %s
        ORDER BY effective_from DESC
        LIMIT 1
        """,
        (period_month,),
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return Decimal("0.081")
    return Decimal(str(row[0]))


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _split_vat(amount_ttc: Decimal, vat_rate: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    if amount_ttc <= 0:
        return Decimal("0.00"), Decimal("0.00"), Decimal("0.00")
    divisor = Decimal("1.0") + vat_rate
    amount_ht = amount_ttc / divisor
    amount_vat = amount_ttc - amount_ht
    return _quantize(amount_ht), _quantize(amount_vat), _quantize(amount_ttc)


_POSTAL_CITY_RE = re.compile(r"\\b(?P<postal>\\d{4})\\s+(?P<city>.+)$")


def _split_address_full(value: str | None) -> tuple[str | None, str | None, str | None, str | None]:
    if not value:
        return None, None, None, None
    address = value.strip()
    if not address:
        return None, None, None, None
    postal_code = None
    city = None
    match = _POSTAL_CITY_RE.search(address)
    if match:
        postal_code = match.group("postal").strip()
        city = match.group("city").strip()
        address = address[:match.start()].strip().rstrip(",")
    street, house_num = split_address_parts(address)
    return street, house_num, postal_code, city


def _resolve_recipient_snapshot(
    cur,
    *,
    recipient_type: str,
    recipient_id: str,
    billing_name: str | None,
    billing_street: str | None,
    billing_house_num: str | None,
    billing_postal_code: str | None,
    billing_city: str | None,
    billing_country: str | None,
) -> dict:
    if recipient_type == "INTERNAL":
        return {
            "name": billing_name or "Association",
            "street": billing_street,
            "house_num": billing_house_num,
            "postal_code": billing_postal_code,
            "city": billing_city,
            "country": billing_country or "CH",
        }

    if recipient_type == "COMMUNE":
        cur.execute("SELECT name, address FROM city WHERE id = %s", (recipient_id,))
        row = cur.fetchone()
        city_name = row[0] if row else None
        address = row[1] if row else None
        cur.execute(
            """
            SELECT postal_code
            FROM city_postal_code
            WHERE city_id = %s
            ORDER BY postal_code
            LIMIT 1
            """,
            (recipient_id,),
        )
        postal_row = cur.fetchone()
        street, house_num, postal_code, city_from_address = _split_address_full(address)
        if not postal_code and postal_row:
            postal_code = postal_row[0]
        return {
            "name": city_name or "Commune",
            "street": street,
            "house_num": house_num,
            "postal_code": postal_code,
            "city": city_from_address or city_name,
            "country": "CH",
        }

    if recipient_type == "HQ":
        cur.execute("SELECT name, address FROM hq WHERE id = %s", (recipient_id,))
        row = cur.fetchone()
        name = row[0] if row else None
        address = row[1] if row else None
        street, house_num, postal_code, city = _split_address_full(address)
        return {
            "name": name or "HQ",
            "street": street,
            "house_num": house_num,
            "postal_code": postal_code,
            "city": city,
            "country": "CH",
        }

    if recipient_type == "SHOP_INDEP":
        cur.execute(
            """
            SELECT s.name, s.address, c.name
            FROM shop s
            LEFT JOIN city c ON c.id = s.city_id
            WHERE s.id = %s
            """,
            (recipient_id,),
        )
        row = cur.fetchone()
        name = row[0] if row else None
        address = row[1] if row else None
        city_name = row[2] if row else None
        street, house_num, postal_code, city = _split_address_full(address)
        return {
            "name": name or "Commerce",
            "street": street,
            "house_num": house_num,
            "postal_code": postal_code,
            "city": city or city_name,
            "country": "CH",
        }

    return {
        "name": "Destinataire",
        "street": None,
        "house_num": None,
        "postal_code": None,
        "city": None,
        "country": "CH",
    }


def _is_independent_hq(hq_id: str | None, hq_name: str | None) -> bool:
    if hq_id is None:
        return True
    if hq_name is None:
        return True
    return "indep" in hq_name.lower()


def aggregate_billing_run(
    *,
    admin_region_id: str,
    period_month: date,
    created_by: str | None,
    jwt_claims: str,
) -> dict:
    """
    Builds payor-centric billing documents for a region + month.
    Returns a summary of created documents/lines.
    """
    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                # Advisory lock prevents concurrent billing runs for the same region/month.
                # The lock is automatically released at end of transaction.
                cur.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s || '/' || %s))",
                    (admin_region_id, period_month),
                )

                cur.execute(
                    """
                    INSERT INTO billing_run (
                        admin_region_id,
                        period_month,
                        status,
                        created_by,
                        updated_by
                    )
                    VALUES (%s, %s, 'draft', %s, %s)
                    ON CONFLICT (admin_region_id, period_month)
                    DO UPDATE SET updated_at = now(), updated_by = EXCLUDED.updated_by
                    RETURNING id
                    """,
                    (admin_region_id, period_month, created_by, created_by),
                )
                run_id = cur.fetchone()[0]

                cur.execute(
                    """
                    SELECT
                        billing_name,
                        billing_iban,
                        billing_street,
                        billing_house_num,
                        billing_postal_code,
                        billing_city,
                        billing_country,
                        address,
                        internal_billing_name,
                        internal_billing_iban,
                        internal_billing_street,
                        internal_billing_house_num,
                        internal_billing_postal_code,
                        internal_billing_city,
                        internal_billing_country
                    FROM admin_region
                    WHERE id = %s
                    """,
                    (admin_region_id,),
                )
                billing_row = cur.fetchone()
                if billing_row:
                    (
                        billing_name,
                        billing_iban,
                        billing_street,
                        billing_house_num,
                        billing_postal_code,
                        billing_city,
                        billing_country,
                        admin_region_address,
                        internal_billing_name,
                        internal_billing_iban,
                        internal_billing_street,
                        internal_billing_house_num,
                        internal_billing_postal_code,
                        internal_billing_city,
                        internal_billing_country,
                    ) = billing_row
                else:
                    billing_name = None
                    billing_iban = None
                    billing_street = None
                    billing_house_num = None
                    billing_postal_code = None
                    billing_city = None
                    billing_country = None
                    admin_region_address = None
                    internal_billing_name = None
                    internal_billing_iban = None
                    internal_billing_street = None
                    internal_billing_house_num = None
                    internal_billing_postal_code = None
                    internal_billing_city = None
                    internal_billing_country = None

                if billing_street is None and admin_region_address:
                    billing_street, billing_house_num = split_address_parts(admin_region_address)

                cur.execute(
                    """
                    SELECT recipient_type, recipient_id::text
                    FROM billing_document
                    WHERE run_id = %s
                      AND status = 'frozen'
                    """,
                    (run_id,),
                )
                frozen_recipients = {(row[0], row[1]) for row in cur.fetchall()}

                cur.execute(
                    """
                    DELETE FROM billing_document_line
                    WHERE document_id IN (
                        SELECT id FROM billing_document
                        WHERE run_id = %s
                          AND status <> 'frozen'
                    )
                    """,
                    (run_id,),
                )
                cur.execute(
                    "DELETE FROM billing_document WHERE run_id = %s AND status <> 'frozen'",
                    (run_id,),
                )

                recipient_snapshot_cache: dict[tuple[str, str], dict] = {}

                def _get_recipient_snapshot(recipient_type: str, recipient_id: str) -> dict:
                    key = (recipient_type, recipient_id)
                    cached = recipient_snapshot_cache.get(key)
                    if cached is not None:
                        return cached
                    snapshot = _resolve_recipient_snapshot(
                        cur,
                        recipient_type=recipient_type,
                        recipient_id=recipient_id,
                        billing_name=billing_name,
                        billing_street=billing_street,
                        billing_house_num=billing_house_num,
                        billing_postal_code=billing_postal_code,
                        billing_city=billing_city,
                        billing_country=billing_country,
                    )
                    recipient_snapshot_cache[key] = snapshot
                    return snapshot

                vat_rate = _get_vat_rate(cur, period_month)

                cur.execute(
                    """
                    SELECT
                        d.id AS delivery_id,
                        d.delivery_date,
                        s.id AS shop_id,
                        s.name AS shop_name,
                        s.hq_id,
                        h.name AS hq_name,
                        c.id AS city_id,
                        c.name AS city_name,
                        c.parent_city_id,
                        pc.name AS parent_city_name,
                        l.client_name,
                        COALESCE(l.city_name, c.name) AS delivery_city_name,
                        l.is_cms,
                        l.bags,
                        f.total_price,
                        f.share_client,
                        f.share_city,
                        f.share_admin_region,
                        f.cms_subsidy
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN city c ON c.id = d.city_id
                    LEFT JOIN city pc ON pc.id = c.parent_city_id
                    LEFT JOIN hq h ON h.id = s.hq_id
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    JOIN delivery_financial f ON f.delivery_id = d.id
                    LEFT JOIN LATERAL (
                        SELECT ds.status
                        FROM delivery_status ds
                        WHERE ds.delivery_id = d.id
                        ORDER BY ds.updated_at DESC
                        LIMIT 1
                    ) ls ON true
                    WHERE d.delivery_date >= %s::date
                      AND d.delivery_date < (%s::date + INTERVAL '1 month')
                      AND c.admin_region_id = %s
                      AND COALESCE(ls.status, '') <> 'cancelled'
                    ORDER BY d.delivery_date
                    """,
                    (period_month, period_month, admin_region_id),
                )

                payor_lines: dict[tuple[str, str], list[RecipientLine]] = defaultdict(list)
                internal_lines: list[RecipientLine] = []

                for (
                    delivery_id,
                    delivery_date,
                    shop_id,
                    shop_name,
                    hq_id,
                    hq_name,
                    city_id,
                    city_name,
                    parent_city_id,
                    parent_city_name,
                    client_name,
                    delivery_city_name,
                    is_cms,
                    bags,
                    total_price,
                    share_client,
                    share_city,
                    share_admin_region,
                    cms_subsidy,
                ) in cur.fetchall():
                    commune_id = parent_city_id or city_id
                    commune_name = parent_city_name or city_name

                    share_client_amount = Decimal(str(share_client or 0))
                    share_city_amount = Decimal(str(share_city or 0))
                    share_admin_amount = Decimal(str(share_admin_region or 0))
                    total_price_amount = Decimal(str(total_price or 0))
                    cms_subsidy_amount = Decimal(str(cms_subsidy or 0))

                    meta = {
                        "delivery_date": delivery_date.isoformat(),
                        "client_name": client_name,
                        "commune_name": commune_name,
                        "bags": bags,
                        "total_price": float(total_price) if total_price is not None else None,
                        "shop_name": shop_name,
                        "delivery_city_name": delivery_city_name,
                        "is_cms": bool(is_cms),
                        "cms_subsidy": float(cms_subsidy_amount),
                    }

                    if commune_id and share_city_amount > 0:
                        payor_lines[("COMMUNE", str(commune_id))].append(
                            RecipientLine(
                                shop_id=str(shop_id),
                                delivery_id=str(delivery_id),
                                amount_due=share_city_amount,
                                meta=meta,
                            )
                        )

                    if share_admin_amount > 0:
                        payor_amount = share_admin_amount + (Decimal("0.00") if is_cms else share_client_amount)
                        if _is_independent_hq(str(hq_id) if hq_id else None, hq_name):
                            payor_lines[("SHOP_INDEP", str(shop_id))].append(
                                RecipientLine(
                                    shop_id=str(shop_id),
                                    delivery_id=str(delivery_id),
                                    amount_due=payor_amount,
                                    meta=meta,
                                )
                            )
                        else:
                            payor_lines[("HQ", str(hq_id))].append(
                                RecipientLine(
                                    shop_id=str(shop_id),
                                    delivery_id=str(delivery_id),
                                    amount_due=payor_amount,
                                    meta=meta,
                                )
                            )

                    if total_price_amount > 0:
                        internal_lines.append(
                            RecipientLine(
                                shop_id=str(shop_id),
                                delivery_id=str(delivery_id),
                                amount_due=total_price_amount,
                                meta=meta,
                            )
                        )

                document_count = 0
                line_count = 0

                for (recipient_type, recipient_id), lines in payor_lines.items():
                    if (recipient_type, recipient_id) in frozen_recipients:
                        continue
                    total_ttc = sum((line.amount_due for line in lines), Decimal("0.00"))
                    amount_ht, amount_vat, amount_ttc = _split_vat(total_ttc, vat_rate)
                    reference_seed = f"{recipient_type}{recipient_id}{period_month.strftime('%Y%m')}"
                    reference_snapshot = generate_reference(billing_iban or "", reference_seed)
                    payment_message_snapshot = f"Facturation DringDring {period_month.strftime('%Y-%m')}"
                    recipient_snapshot = _get_recipient_snapshot(recipient_type, recipient_id)

                    cur.execute(
                        """
                        INSERT INTO billing_document (
                            run_id,
                            recipient_type,
                            recipient_id,
                            recipient_name_snapshot,
                            recipient_street_snapshot,
                            recipient_house_num_snapshot,
                            recipient_postal_code_snapshot,
                            recipient_city_snapshot,
                            recipient_country_snapshot,
                            period_month,
                            amount_ht,
                            amount_vat,
                            amount_ttc,
                            vat_rate,
                            creditor_name_snapshot,
                            creditor_iban_snapshot,
                            creditor_street_snapshot,
                            creditor_house_num_snapshot,
                            creditor_postal_code_snapshot,
                            creditor_city_snapshot,
                            creditor_country_snapshot,
                            reference_snapshot,
                            payment_message_snapshot,
                            status,
                            created_by,
                            updated_by
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft', %s, %s)
                        RETURNING id
                        """,
                        (
                            run_id,
                            recipient_type,
                            recipient_id,
                            recipient_snapshot.get("name"),
                            recipient_snapshot.get("street"),
                            recipient_snapshot.get("house_num"),
                            recipient_snapshot.get("postal_code"),
                            recipient_snapshot.get("city"),
                            recipient_snapshot.get("country"),
                            period_month,
                            amount_ht,
                            amount_vat,
                            amount_ttc,
                            vat_rate,
                            billing_name,
                            billing_iban,
                            billing_street,
                            billing_house_num,
                            billing_postal_code,
                            billing_city,
                            billing_country,
                            reference_snapshot,
                            payment_message_snapshot,
                            created_by,
                            created_by,
                        ),
                    )
                    document_id = cur.fetchone()[0]
                    document_count += 1

                    from psycopg.types.json import Jsonb

                    for line in lines:
                        cur.execute(
                            """
                            INSERT INTO billing_document_line (
                                document_id,
                                shop_id,
                                delivery_id,
                                amount_due,
                                meta
                            )
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                document_id,
                                line.shop_id,
                                line.delivery_id,
                                line.amount_due,
                                Jsonb(line.meta),
                            ),
                        )
                        line_count += 1

                if (
                    internal_lines
                    and internal_billing_name
                    and internal_billing_iban
                    and ("INTERNAL", str(admin_region_id)) not in frozen_recipients
                ):
                    total_ttc = sum((line.amount_due for line in internal_lines), Decimal("0.00"))
                    amount_ht, amount_vat, amount_ttc = _split_vat(total_ttc, vat_rate)
                    reference_seed = f"INTERNAL{admin_region_id}{period_month.strftime('%Y%m')}"
                    reference_snapshot = generate_reference(internal_billing_iban, reference_seed)
                    payment_message_snapshot = f"Facturation interne DringDring {period_month.strftime('%Y-%m')}"
                    recipient_snapshot = _get_recipient_snapshot("INTERNAL", str(admin_region_id))

                    cur.execute(
                        """
                        INSERT INTO billing_document (
                            run_id,
                            recipient_type,
                            recipient_id,
                            recipient_name_snapshot,
                            recipient_street_snapshot,
                            recipient_house_num_snapshot,
                            recipient_postal_code_snapshot,
                            recipient_city_snapshot,
                            recipient_country_snapshot,
                            period_month,
                            amount_ht,
                            amount_vat,
                            amount_ttc,
                            vat_rate,
                            creditor_name_snapshot,
                            creditor_iban_snapshot,
                            creditor_street_snapshot,
                            creditor_house_num_snapshot,
                            creditor_postal_code_snapshot,
                            creditor_city_snapshot,
                            creditor_country_snapshot,
                            reference_snapshot,
                            payment_message_snapshot,
                            status,
                            created_by,
                            updated_by
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft', %s, %s)
                        RETURNING id
                        """,
                        (
                            run_id,
                            "INTERNAL",
                            admin_region_id,
                            recipient_snapshot.get("name"),
                            recipient_snapshot.get("street"),
                            recipient_snapshot.get("house_num"),
                            recipient_snapshot.get("postal_code"),
                            recipient_snapshot.get("city"),
                            recipient_snapshot.get("country"),
                            period_month,
                            amount_ht,
                            amount_vat,
                            amount_ttc,
                            vat_rate,
                            internal_billing_name,
                            internal_billing_iban,
                            internal_billing_street,
                            internal_billing_house_num,
                            internal_billing_postal_code,
                            internal_billing_city,
                            internal_billing_country,
                            reference_snapshot,
                            payment_message_snapshot,
                            created_by,
                            created_by,
                        ),
                    )
                    document_id = cur.fetchone()[0]
                    document_count += 1

                    from psycopg.types.json import Jsonb

                    for line in internal_lines:
                        cur.execute(
                            """
                            INSERT INTO billing_document_line (
                                document_id,
                                shop_id,
                                delivery_id,
                                amount_due,
                                meta
                            )
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                document_id,
                                line.shop_id,
                                line.delivery_id,
                                line.amount_due,
                                Jsonb(line.meta),
                            ),
                        )
                        line_count += 1

                return {
                    "run_id": str(run_id),
                    "documents": document_count,
                    "lines": line_count,
                    "vat_rate": str(vat_rate),
                }
