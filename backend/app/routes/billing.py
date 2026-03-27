from datetime import date, datetime
import csv
import hashlib
import io
import zipfile
import re

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.core.guards import require_admin_user
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse
from app.core.billing_processing import freeze_shop_billing_period
from app.core.billing_reference import generate_reference
from app.core.billing_aggregator import aggregate_billing_run
from app.core.config import settings
from app.core.utils import parse_month, split_address_parts
from app.pdf.invoice_qr_bill import build_recipient_invoice_with_qr_bill
from app.storage.supabase_storage import download_file_bytes, upload_pdf_bytes

router = APIRouter(prefix="/billing", tags=["billing"])

def _resolve_admin_region_id(user: MeResponse, admin_region_id: str | None) -> str:
    if user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        return str(user.admin_region_id)
    if user.role == "super_admin":
        if not admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        return str(admin_region_id)
    raise HTTPException(status_code=403, detail="Admin access required")




def _normalize_qr_city(value: str | None) -> str | None:
    city = (value or "").strip()
    if not city:
        return None
    city = re.sub(r"^\d{4}\s+", "", city)
    city = re.sub(r"^(ville|commune)\s+de\s+", "", city, flags=re.IGNORECASE)
    if " - " in city:
        city = city.split(" - ", 1)[0].strip()
    return city or None


def _extract_postal_city_from_address(address: str | None) -> tuple[str | None, str | None]:
    if not address:
        return None, None
    value = address.strip()
    if not value:
        return None, None
    # Keep the trailing "1950 Sion" block from full address strings.
    matches = re.findall(r"(\d{4})\s+([^\n,]+)$", value, flags=re.MULTILINE)
    if not matches:
        return None, None
    postal, city = matches[-1]
    city = _normalize_qr_city(city)
    return (postal.strip() or None, city or None)


def _safe_pdf_filename(value: str | None, fallback: str) -> str:
    base = (value or "").strip()
    if not base:
        return f"{fallback}.pdf"
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", base)
    base = base.strip("_")
    if not base:
        base = fallback
    return f"{base}.pdf"


def _build_billing_document_pdf_bytes(document_id: str, preview: int, jwt_claims: str) -> tuple[bytes, str]:
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id,
                    d.recipient_type,
                    d.recipient_id,
                    d.period_month,
                    d.amount_ttc,
                    d.vat_rate,
                    d.status,
                    d.pdf_url,
                    d.recipient_name_snapshot,
                    d.recipient_street_snapshot,
                    d.recipient_house_num_snapshot,
                    d.recipient_postal_code_snapshot,
                    d.recipient_city_snapshot,
                    d.recipient_country_snapshot,
                    CASE
                        WHEN d.recipient_type = 'INTERNAL' THEN COALESCE(ar.billing_name, ar.name, 'Association')
                        ELSE COALESCE(h.name, c.name, s.name, 'Destinataire')
                    END AS recipient_name,
                    h.address, h.contact_person, h.email, h.phone,
                    c.address, c.contact_person, c.email, c.phone,
                    s.address, s.contact_person, s.email, s.phone,
                    c.id AS city_id,
                    s.city_id AS shop_city_id,
                    r.admin_region_id,
                    ar.billing_name,
                    ar.billing_iban,
                    ar.billing_street,
                    ar.billing_house_num,
                    ar.billing_postal_code,
                    ar.billing_city,
                    ar.billing_country,
                    ar.address,
                    ar.internal_billing_name,
                    ar.internal_billing_iban,
                    ar.internal_billing_street,
                    ar.internal_billing_house_num,
                    ar.internal_billing_postal_code,
                    ar.internal_billing_city,
                    ar.internal_billing_country,
                    ar.internal_billing_logo_path,
                    ar.billing_logo_path,
                    d.creditor_name_snapshot,
                    d.creditor_iban_snapshot,
                    d.creditor_street_snapshot,
                    d.creditor_house_num_snapshot,
                    d.creditor_postal_code_snapshot,
                    d.creditor_city_snapshot,
                    d.creditor_country_snapshot,
                    d.reference_snapshot,
                    d.payment_message_snapshot
                FROM billing_document d
                JOIN billing_run r ON r.id = d.run_id
                JOIN admin_region ar ON ar.id = r.admin_region_id
                LEFT JOIN hq h ON d.recipient_type = 'HQ' AND h.id = d.recipient_id
                LEFT JOIN city c ON d.recipient_type = 'COMMUNE' AND c.id = d.recipient_id
                LEFT JOIN shop s ON d.recipient_type = 'SHOP_INDEP' AND s.id = d.recipient_id
                WHERE d.id = %s
                """,
                (document_id,),
            )
            doc = cur.fetchone()
            if not doc:
                raise HTTPException(status_code=404, detail="Billing document not found")

            (
                _doc_id,
                recipient_type,
                recipient_id,
                period_month,
                amount_ttc,
                vat_rate,
                status,
                pdf_url,
                recipient_name_snapshot,
                recipient_street_snapshot,
                recipient_house_num_snapshot,
                recipient_postal_code_snapshot,
                recipient_city_snapshot,
                recipient_country_snapshot,
                recipient_name_fallback,
                hq_address,
                hq_contact,
                hq_email,
                hq_phone,
                city_address,
                city_contact,
                city_email,
                city_phone,
                shop_address,
                shop_contact,
                shop_email,
                shop_phone,
                city_id,
                shop_city_id,
                admin_region_id,
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
                internal_billing_logo_path,
                billing_logo_path,
                creditor_name_snapshot,
                creditor_iban_snapshot,
                creditor_street_snapshot,
                creditor_house_num_snapshot,
                creditor_postal_code_snapshot,
                creditor_city_snapshot,
                creditor_country_snapshot,
                reference_snapshot,
                payment_message_snapshot,
            ) = doc

            cur.execute(
                """
                SELECT
                    (l.meta->>'delivery_date')::date,
                    l.meta->>'shop_name',
                    l.meta->>'client_name',
                    l.meta->>'commune_name',
                    l.meta->>'bags',
                    l.amount_due
                FROM billing_document_line l
                WHERE l.document_id = %s
                ORDER BY (l.meta->>'delivery_date')::date
                """,
                (document_id,),
            )
            rows = cur.fetchall()

    recipient_label = {
        "COMMUNE": "Commune partenaire",
        "HQ": "HQ",
        "SHOP_INDEP": "Commerce independant",
        "INTERNAL": "Interne",
    }.get(recipient_type, "Destinataire")

    is_internal = recipient_type == "INTERNAL"
    recipient_name = recipient_name_snapshot or recipient_name_fallback

    address = (
        admin_region_address
        if is_internal
        else city_address if recipient_type == "COMMUNE" else hq_address if recipient_type == "HQ" else shop_address
    )
    fallback_postal_code = None
    fallback_city = None
    if is_internal:
        fallback_postal_code = billing_postal_code
        fallback_city = billing_city
    elif recipient_type == "COMMUNE" and city_id:
        address_postal, address_city = _extract_postal_city_from_address(city_address)
        if address_postal:
            fallback_postal_code = address_postal
        if address_city:
            fallback_city = address_city
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                if not fallback_postal_code:
                    cur.execute(
                        """
                        SELECT postal_code
                        FROM city_postal_code
                        WHERE city_id = %s
                        ORDER BY postal_code
                        LIMIT 1
                        """,
                        (city_id,),
                    )
                    row = cur.fetchone()
                    fallback_postal_code = row[0] if row else None
                if not fallback_city:
                    cur.execute("SELECT name FROM city WHERE id = %s", (city_id,))
                    row = cur.fetchone()
                    fallback_city = row[0] if row else None
    elif recipient_type == "SHOP_INDEP" and shop_city_id:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name FROM city WHERE id = %s", (shop_city_id,))
                row = cur.fetchone()
                fallback_city = row[0] if row else None

    if not is_internal and billing_street is None and admin_region_address:
        billing_street, billing_house_num = split_address_parts(admin_region_address)

    recipient_postal_code = recipient_postal_code_snapshot or fallback_postal_code
    recipient_city = recipient_city_snapshot or fallback_city
    if recipient_type == "COMMUNE":
        recipient_city = _normalize_qr_city(recipient_city) or _normalize_qr_city(fallback_city) or recipient_city

    debtor_street = recipient_street_snapshot
    debtor_house_num = recipient_house_num_snapshot
    if not debtor_street or not debtor_house_num:
        address_street, address_house_num = split_address_parts(address)
        debtor_street = debtor_street or address_street
        debtor_house_num = debtor_house_num or address_house_num
    if is_internal and billing_street and not debtor_street:
        debtor_street = billing_street
        debtor_house_num = billing_house_num

    filename = f"facture-{recipient_label}-{recipient_name}-{period_month.strftime('%Y-%m')}.pdf"
    filename = filename.replace(" ", "_")
    if not preview and status == "frozen" and pdf_url:
        try:
            pdf_bytes = download_file_bytes(bucket="billing-pdf", path=pdf_url)
            return pdf_bytes, filename
        except RuntimeError:
            pdf_bytes = None

    creditor_name = creditor_name_snapshot or (internal_billing_name if is_internal else billing_name)
    creditor_iban = creditor_iban_snapshot or (internal_billing_iban if is_internal else billing_iban)
    creditor_street = creditor_street_snapshot or (internal_billing_street if is_internal else billing_street)
    creditor_house_num = creditor_house_num_snapshot or (internal_billing_house_num if is_internal else billing_house_num)
    creditor_postal_code = creditor_postal_code_snapshot or (
        internal_billing_postal_code if is_internal else billing_postal_code
    )
    creditor_city = creditor_city_snapshot or (internal_billing_city if is_internal else billing_city)
    creditor_country = creditor_country_snapshot or (
        internal_billing_country if is_internal else billing_country
    )

    if creditor_street is None:
        fallback_address = settings.BILLING_CREDITOR_ADDRESS
        if settings.BILLING_CREDITOR_STREET:
            creditor_street = settings.BILLING_CREDITOR_STREET
            if not creditor_house_num and settings.BILLING_CREDITOR_HOUSE_NUM:
                creditor_house_num = settings.BILLING_CREDITOR_HOUSE_NUM
        elif fallback_address:
            creditor_street, creditor_house_num = split_address_parts(fallback_address)

    if not creditor_postal_code and settings.BILLING_CREDITOR_POSTAL_CODE:
        creditor_postal_code = settings.BILLING_CREDITOR_POSTAL_CODE
    if not creditor_city and settings.BILLING_CREDITOR_CITY:
        creditor_city = settings.BILLING_CREDITOR_CITY
    if not creditor_country and settings.BILLING_CREDITOR_COUNTRY:
        creditor_country = settings.BILLING_CREDITOR_COUNTRY
    if not creditor_name and settings.BILLING_CREDITOR_NAME:
        creditor_name = settings.BILLING_CREDITOR_NAME
    if not creditor_iban and settings.BILLING_CREDITOR_IBAN:
        creditor_iban = settings.BILLING_CREDITOR_IBAN

    has_billing_override = (
        creditor_name
        and creditor_iban
        and creditor_postal_code
        and creditor_city
    )

    reference_seed = f"{recipient_type}{recipient_id}{period_month.strftime('%Y%m')}"
    reference = reference_snapshot or generate_reference(creditor_iban or "", reference_seed)
    payment_message = payment_message_snapshot or f"Facturation DringDring {period_month.strftime('%Y-%m')}"

    logo_path = internal_billing_logo_path if is_internal else billing_logo_path
    logo_bytes = None
    if logo_path:
        try:
            logo_bytes = download_file_bytes(bucket="billing-logos", path=logo_path)
        except RuntimeError:
            logo_bytes = None

    buffer = build_recipient_invoice_with_qr_bill(
        recipient_label=recipient_label,
        recipient_name=recipient_name,
        recipient_street=debtor_street,
        recipient_house_num=debtor_house_num,
        recipient_postal_code=recipient_postal_code,
        recipient_city=recipient_city,
        period_month=period_month,
        rows=rows,
        vat_rate=vat_rate,
        is_preview=bool(preview),
        payment_message=payment_message,
        reference=reference,
        creditor_iban=creditor_iban if has_billing_override else None,
        creditor_name=creditor_name if has_billing_override else None,
        creditor_street=creditor_street if has_billing_override else None,
        creditor_house_num=creditor_house_num if has_billing_override else None,
        creditor_postal_code=creditor_postal_code if has_billing_override else None,
        creditor_city=creditor_city if has_billing_override else None,
        creditor_country=creditor_country if has_billing_override else None,
        logo_bytes=logo_bytes,
    )
    buffer.seek(0)
    pdf_bytes = buffer.getvalue()

    if not preview:
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        pdf_path = pdf_url or f"billing-documents/{period_month.strftime('%Y-%m')}/{document_id}.pdf"
        upload_pdf_bytes(bucket="billing-pdf", path=pdf_path, data=pdf_bytes)
        with get_db_connection(jwt_claims) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE billing_document
                        SET pdf_url = %s,
                            pdf_sha256 = %s,
                            pdf_generated_at = now(),
                            status = 'frozen'
                        WHERE id = %s
                        """,
                        (pdf_path, pdf_hash, document_id),
                    )

    return pdf_bytes, filename

@router.post("/region/freeze")
def freeze_region_billing(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Bulk freeze for all shops in the region for the given month.
    """
    period_month = parse_month(month)
    
    results = []
    
    if user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = str(user.admin_region_id)
    elif user.role == "super_admin":
        target_region_id = str(admin_region_id) if admin_region_id else None
    else:
        target_region_id = None

    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                # 1. Get all shops for this region (super_admin can pass a region, otherwise all)
                if target_region_id:
                    cur.execute(
                        """
                        SELECT s.id, s.name
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        WHERE c.admin_region_id = %s
                        """,
                        (target_region_id,),
                    )
                else:
                    cur.execute("SELECT id, name FROM shop")
                shops = cur.fetchall()
                
                if not shops:
                    return {"message": "No shops found in region", "processed": 0}

                # 2. Iterate and freeze
                for shop_id, shop_name in shops:
                    try:
                        freeze_shop_billing_period(
                            cur=cur,
                            shop_id=str(shop_id),
                            period_month=period_month,
                            frozen_by_user_id=user.user_id,
                            frozen_by_email=user.email,
                            frozen_comment="Regional Bulk Freeze"
                        )
                        results.append({
                            "shop_id": shop_id,
                            "name": shop_name,
                            "status": "frozen",
                            "error": None
                        })
                    except HTTPException as e:
                        # Capture known errors (e.g. 409 already frozen, 400 no deliveries)
                        results.append({
                            "shop_id": shop_id,
                            "name": shop_name,
                            "status": "skipped",
                            "error": str(e.detail)
                        })
                    except Exception as e:
                        results.append({
                            "shop_id": shop_id,
                            "name": shop_name,
                            "status": "failed",
                            "error": str(e)
                        })
                        
    return {
        "month": month,
        "total_shops": len(shops),
        "results": results
    }


@router.post("/region/aggregate")
def aggregate_region_billing(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Build payor-centric billing documents for the region and month.
    """
    period_month = parse_month(month)

    if user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = str(user.admin_region_id)
    elif user.role == "super_admin":
        target_region_id = str(admin_region_id) if admin_region_id else None
    else:
        target_region_id = None

    if not target_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    summary = aggregate_billing_run(
        admin_region_id=target_region_id,
        period_month=period_month,
        created_by=user.user_id,
        jwt_claims=jwt_claims,
    )

    return {
        "month": month,
        "admin_region_id": target_region_id,
        "summary": summary,
    }


@router.get("/documents")
def list_billing_documents(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    recipient_type: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(month)
    target_region_id = _resolve_admin_region_id(user, admin_region_id)

    filters = ["r.admin_region_id = %s", "d.period_month = %s"]
    params: list = [target_region_id, period_month]
    if recipient_type:
        filters.append("d.recipient_type = %s")
        params.append(recipient_type)

    sql = f"""
        SELECT
            d.id::text,
            d.recipient_type,
            d.recipient_id::text,
            d.period_month::text,
            d.amount_ht,
            d.amount_vat,
            d.amount_ttc,
            d.vat_rate,
            d.status,
            d.pdf_url,
            COALESCE(
                d.recipient_name_snapshot,
                CASE
                    WHEN d.recipient_type = 'INTERNAL' THEN COALESCE(ar.billing_name, ar.name, 'Association')
                    ELSE COALESCE(h.name, c.name, s.name, 'Destinataire')
                END
            ) AS recipient_name,
            h.id::text AS hq_id,
            c.id::text AS city_id,
            s.id::text AS shop_id,
            COUNT(l.id) AS deliveries
        FROM billing_document d
        JOIN billing_run r ON r.id = d.run_id
        JOIN admin_region ar ON ar.id = r.admin_region_id
        LEFT JOIN hq h ON d.recipient_type = 'HQ' AND h.id = d.recipient_id
        LEFT JOIN city c ON d.recipient_type = 'COMMUNE' AND c.id = d.recipient_id
        LEFT JOIN shop s ON d.recipient_type = 'SHOP_INDEP' AND s.id = d.recipient_id
        LEFT JOIN billing_document_line l ON l.document_id = d.id
        WHERE {" AND ".join(filters)}
        GROUP BY d.id, h.id, c.id, s.id, ar.billing_name, ar.name, d.recipient_name_snapshot
        ORDER BY d.recipient_type, recipient_name
    """

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    documents = [
        {
            "id": row[0],
            "recipient_type": row[1],
            "recipient_id": row[2],
            "period_month": row[3],
            "amount_ht": float(row[4] or 0),
            "amount_vat": float(row[5] or 0),
            "amount_ttc": float(row[6] or 0),
            "vat_rate": float(row[7] or 0),
            "status": row[8],
            "pdf_url": row[9],
            "recipient_name": row[10],
            "hq_id": row[11],
            "city_id": row[12],
            "shop_id": row[13],
            "deliveries": int(row[14] or 0),
        }
        for row in rows
    ]

    return {"month": month, "rows": documents}


@router.get("/documents/lines")
def list_billing_document_lines(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    recipient_type: str | None = Query(default=None),
    recipient_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(month)
    target_region_id = _resolve_admin_region_id(user, admin_region_id)

    filters = ["r.admin_region_id = %s", "d.period_month = %s"]
    params: list = [target_region_id, period_month]
    if recipient_type:
        filters.append("d.recipient_type = %s")
        params.append(recipient_type)
    if recipient_id:
        filters.append("d.recipient_id = %s")
        params.append(recipient_id)

    sql = f"""
        SELECT
            l.id::text,
            d.id::text AS document_id,
            d.recipient_type,
            d.recipient_id::text,
            l.shop_id::text,
            l.delivery_id::text,
            l.amount_due,
            l.meta->>'delivery_date' AS delivery_date,
            l.meta->>'client_name' AS client_name,
            l.meta->>'commune_name' AS commune_name,
            l.meta->>'bags' AS bags,
            l.meta->>'shop_name' AS shop_name
        FROM billing_document_line l
        JOIN billing_document d ON d.id = l.document_id
        JOIN billing_run r ON r.id = d.run_id
        WHERE {" AND ".join(filters)}
        ORDER BY l.meta->>'delivery_date'
    """

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    lines = [
        {
            "id": row[0],
            "document_id": row[1],
            "recipient_type": row[2],
            "recipient_id": row[3],
            "shop_id": row[4],
            "delivery_id": row[5],
            "amount_due": float(row[6] or 0),
            "delivery_date": row[7],
            "client_name": row[8],
            "commune_name": row[9],
            "bags": row[10],
            "shop_name": row[11],
        }
        for row in rows
    ]

    return lines


@router.get("/documents/export")
def export_billing_documents(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    recipient_type: str | None = Query(default=None),
    recipient_id: str | None = Query(default=None),
    detail: int = Query(default=0),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(month)
    target_region_id = _resolve_admin_region_id(user, admin_region_id)

    filters = ["r.admin_region_id = %s", "d.period_month = %s"]
    params: list = [target_region_id, period_month]
    if recipient_type:
        filters.append("d.recipient_type = %s")
        params.append(recipient_type)
    if recipient_id:
        filters.append("d.recipient_id = %s")
        params.append(recipient_id)

    if detail:
        sql = f"""
            SELECT
                d.recipient_type,
                COALESCE(
                    d.recipient_name_snapshot,
                    CASE
                        WHEN d.recipient_type = 'INTERNAL' THEN COALESCE(ar.billing_name, ar.name, 'Association')
                        ELSE COALESCE(h.name, c.name, s.name, 'Destinataire')
                    END
                ) AS recipient_name,
                l.meta->>'delivery_date' AS delivery_date,
                l.meta->>'shop_name' AS shop_name,
                l.meta->>'client_name' AS client_name,
                l.meta->>'commune_name' AS commune_name,
                l.meta->>'bags' AS bags,
                l.amount_due,
                l.delivery_id::text AS delivery_id
            FROM billing_document_line l
            JOIN billing_document d ON d.id = l.document_id
            JOIN billing_run r ON r.id = d.run_id
            JOIN admin_region ar ON ar.id = r.admin_region_id
            LEFT JOIN hq h ON d.recipient_type = 'HQ' AND h.id = d.recipient_id
            LEFT JOIN city c ON d.recipient_type = 'COMMUNE' AND c.id = d.recipient_id
            LEFT JOIN shop s ON d.recipient_type = 'SHOP_INDEP' AND s.id = d.recipient_id
            WHERE {" AND ".join(filters)}
            ORDER BY l.meta->>'delivery_date'
        """

        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Type",
                "Payeur",
                "Date",
                "Commerce",
                "Client",
                "Commune partenaire",
                "Sacs",
                "Montant a facturer",
                "Delivery ID",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                    row[6],
                    f"{float(row[7] or 0):.2f}",
                    row[8],
                ]
            )

        output.seek(0)
        filename = f"facturation-details-{month}.csv"
        headers = {"Content-Disposition": f"attachment; filename={filename}"}
        return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)

    sql = f"""
        SELECT
            d.recipient_type,
            COALESCE(
                d.recipient_name_snapshot,
                CASE
                    WHEN d.recipient_type = 'INTERNAL' THEN COALESCE(ar.billing_name, ar.name, 'Association')
                    ELSE COALESCE(h.name, c.name, s.name, 'Destinataire')
                END
            ) AS recipient_name,
            d.amount_ht,
            d.amount_vat,
            d.amount_ttc,
            COUNT(l.id) AS deliveries
        FROM billing_document d
        JOIN billing_run r ON r.id = d.run_id
        JOIN admin_region ar ON ar.id = r.admin_region_id
        LEFT JOIN hq h ON d.recipient_type = 'HQ' AND h.id = d.recipient_id
        LEFT JOIN city c ON d.recipient_type = 'COMMUNE' AND c.id = d.recipient_id
        LEFT JOIN shop s ON d.recipient_type = 'SHOP_INDEP' AND s.id = d.recipient_id
        LEFT JOIN billing_document_line l ON l.document_id = d.id
        WHERE {" AND ".join(filters)}
        GROUP BY d.id, h.id, c.id, s.id, ar.billing_name, ar.name, d.recipient_name_snapshot
        ORDER BY d.recipient_type, recipient_name
    """

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Type",
            "Destinataire",
            "Livraisons",
            "Montant HT",
            "Montant TVA",
            "Montant TTC",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row[0],
                row[1],
                int(row[5] or 0),
                f"{float(row[2] or 0):.2f}",
                f"{float(row[3] or 0):.2f}",
                f"{float(row[4] or 0):.2f}",
            ]
        )

    output.seek(0)
    filename = f"facturation-documents-{month}.csv"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/documents/{document_id}/pdf")
def download_billing_document_pdf(
    document_id: str,
    preview: int = Query(default=1),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    pdf_bytes, filename = _build_billing_document_pdf_bytes(
        document_id=document_id,
        preview=preview,
        jwt_claims=jwt_claims,
    )
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.get("/documents/zip")
def download_billing_documents_zip(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    recipient_type: str = Query(pattern=r"^(COMMUNE|HQ|SHOP_INDEP)$"),
    admin_region_id: str | None = Query(default=None),
    preview: int = Query(default=1),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(month)
    target_region_id = _resolve_admin_region_id(user, admin_region_id)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id::text
                FROM billing_document d
                JOIN billing_run r ON r.id = d.run_id
                WHERE r.admin_region_id = %s
                  AND d.period_month = %s
                  AND d.recipient_type = %s
                """,
                (target_region_id, period_month, recipient_type),
            )
            doc_ids = [row[0] for row in cur.fetchall()]

    if not doc_ids:
        raise HTTPException(status_code=404, detail="No billing documents found for this period")

    zip_buffer = io.BytesIO()
    used_names: set[str] = set()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for doc_id in doc_ids:
            pdf_bytes, filename = _build_billing_document_pdf_bytes(
                document_id=doc_id,
                preview=preview,
                jwt_claims=jwt_claims,
            )
            base = filename[:-4] if filename.lower().endswith(".pdf") else filename
            safe_name = _safe_pdf_filename(base, doc_id)
            if safe_name in used_names:
                safe_name = _safe_pdf_filename(f"{base}_{doc_id}", doc_id)
            used_names.add(safe_name)
            archive.writestr(safe_name, pdf_bytes)

    zip_buffer.seek(0)
    filename = f"factures-{recipient_type.lower()}-{period_month.strftime('%Y-%m')}.zip"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)
