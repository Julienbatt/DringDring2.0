from datetime import date, datetime, timezone, timedelta, time
from decimal import Decimal
import csv
import hashlib
import io
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.guards import (
    require_hq_or_admin_user_for_shop,
    require_shop_user,
    require_courier_user,
    require_customer_user,
    require_admin_user,
)
from app.core.config import settings
from app.core.geo import compute_co2_saved_kg, compute_distance_km, geocode_swiss_address
from app.core.security import get_current_user_claims
from app.core.tariff_engine import compute_financials, compute_total_price, parse_rule
from app.core.tariff_validation import validate_tariff_rule
from app.db.session import get_db_connection
from app.pdf.shop_monthly_report import build_shop_monthly_pdf
from app.schemas.delivery import DeliveryCreate, ShopDeliveryCreate, ShopDeliveryUpdate, ShopDeliveryCancel
from app.schemas.me import MeResponse
from app.storage.supabase_storage import upload_pdf_bytes

router = APIRouter(prefix="/deliveries", tags=["deliveries"])
logger = logging.getLogger(__name__)

EDITABLE_STATUSES = {"created", "assigned"}
DELIVERY_EDIT_GRACE_HOURS = 48


@router.post("", status_code=status.HTTP_201_CREATED)
def create_delivery(
    payload: DeliveryCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    delivery_id = uuid4()

    try:
        with get_db_connection(jwt_claims) as conn:
            with conn:
                with conn.cursor() as cur:
                    _assert_period_not_frozen(
                        cur, str(payload.shop_id), payload.delivery_date
                    )

                    # FETCH TERRITORY from Shop ID (Security / Integrity)
                    cur.execute(
                        """
                        SELECT s.hq_id, s.city_id, s.tariff_version_id, c.canton_id, c.admin_region_id,
                               s.lat, s.lng, s.address
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        WHERE s.id = %s
                        """,
                        (str(payload.shop_id),)
                    )
                    shop_row = cur.fetchone()
                    if not shop_row:
                        raise HTTPException(status_code=404, detail="Shop not found")

                    hq_id, shop_city_id, tariff_version_id, canton_id, admin_region_id_from_city, shop_lat, shop_lng, shop_address = shop_row

                    # Fallback or strict lookup for admin_region if not stored in city?
                    # The vision says city belongs to admin_region.
                    # Let's assume the query above returns it (requires city schema check, but safer to query)
                    
                    # If city table doesn't have admin_region_id directly, we need to join or look up.
                    # Let's double check via a more robust query finding active region for canton if needed,
                    # BUT ideally city->admin_region is 1:1.
                    # As a safe bet conforming to `create_delivery_for_shop` logic:
                    
                    cur.execute(
                        """
                        SELECT id FROM admin_region
                        WHERE canton_id = %s AND active = true
                        LIMIT 1
                        """,
                        (canton_id,)
                    )
                    ar_row = cur.fetchone()
                    if not ar_row:
                         # Fallback to city's if exists, or error
                         if not admin_region_id_from_city:
                             raise HTTPException(status_code=400, detail="No active Admin Region found for this shop's canton")
                         admin_region_id = admin_region_id_from_city
                    else:
                         admin_region_id = ar_row[0]


                    if str(payload.hq_id) != str(hq_id):
                        raise HTTPException(
                            status_code=400,
                            detail="HQ mismatch for shop",
                        )
                    if str(payload.canton_id) != str(canton_id):
                        raise HTTPException(
                            status_code=400,
                            detail="Canton mismatch for shop",
                        )
                    if str(payload.admin_region_id) != str(admin_region_id):
                        raise HTTPException(
                            status_code=400,
                            detail="Admin region mismatch for shop",
                        )

                    resolved_city_id = str(payload.city_id)
                    postal_lookup = _resolve_city_by_postal_code(cur, payload.postal_code)
                    if postal_lookup:
                        lookup_city_id, lookup_parent_id, lookup_admin_region_id = postal_lookup
                        if lookup_admin_region_id and str(lookup_admin_region_id) != str(admin_region_id):
                            raise HTTPException(
                                status_code=400,
                                detail="Postal code not in admin region",
                            )
                        if str(lookup_city_id) != str(shop_city_id) and str(lookup_parent_id) != str(shop_city_id):
                            raise HTTPException(
                                status_code=400,
                                detail="Postal code not in shop commune",
                            )
                        resolved_city_id = str(lookup_city_id)
                    else:
                        payload_parent_id = _get_city_parent_id(cur, str(payload.city_id))
                        if str(payload.city_id) != str(shop_city_id) and str(payload_parent_id) != str(shop_city_id):
                            raise HTTPException(
                                status_code=400,
                                detail="City mismatch for shop",
                            )

                    conn.commit()

                    if (shop_lat is None or shop_lng is None) and shop_address:
                        geocoded = geocode_swiss_address(shop_address)
                        if geocoded:
                            shop_lat, shop_lng = geocoded
                            cur.execute(
                                "UPDATE shop SET lat = %s, lng = %s WHERE id = %s",
                                (shop_lat, shop_lng, str(payload.shop_id)),
                            )

                    distance_km = None
                    co2_saved_kg = None
                    if shop_lat is not None and shop_lng is not None:
                        query = f"{payload.address}, {payload.postal_code} {payload.city_name}".strip(", ")
                        geocoded = geocode_swiss_address(query) if query else None
                        if geocoded:
                            client_lat, client_lng = geocoded
                            distance_km = compute_distance_km(
                                shop_lat, shop_lng, client_lat, client_lng
                            )
                            distance_km *= settings.RETURN_TRIP_MULTIPLIER
                            co2_saved_kg = compute_co2_saved_kg(distance_km)

                    _insert_delivery_record(
                        cur,
                        delivery_id=delivery_id,
                        shop_id=str(payload.shop_id),
                        hq_id=str(hq_id), # Governance: Trust shop hierarchy
                        admin_region_id=str(admin_region_id),
                        city_id=resolved_city_id,
                        canton_id=str(canton_id),
                        delivery_date=payload.delivery_date,
                        client_id=None,
                        distance_km=distance_km,
                        co2_saved_kg=co2_saved_kg,
                    )

                    import random
                    import string
                    
                    chars = string.ascii_uppercase + string.digits
                    short_code = ''.join(random.choice(chars) for _ in range(3))

                    _insert_delivery_logistics(
                        cur,
                        delivery_id=delivery_id,
                        client_name=None,
                        address=payload.address,
                        postal_code=payload.postal_code,
                        city_name=payload.city_name,
                        time_window=payload.time_window,
                        bags=payload.bags,
                        order_amount=payload.order_amount,
                        basket_value=payload.basket_value,
                        is_cms=payload.is_cms,
                        notes=None,
                        short_code=short_code,
                    )

                    _insert_delivery_status(cur, delivery_id=delivery_id)

                    # Financials (Vision: "Création d'un snapshot financier")
                    # 1. Fetch Tariff from Shop (if any)
                    cur.execute("SELECT tariff_version_id FROM shop WHERE id = %s", (str(payload.shop_id),))
                    shop_row = cur.fetchone()
                    tariff_version_id = shop_row[0] if shop_row else None

                    if not tariff_version_id:
                        # Governance requirement: "Tarification pilier" -> Strict enforcement
                        raise HTTPException(
                            status_code=400,
                            detail="Tariff version not configured for shop (Governance/Critical)"
                        )

                    # 2. Fetch Rule
                    cur.execute(
                        "SELECT rule_type, rule, share FROM tariff_version WHERE id = %s",
                        (tariff_version_id,)
                    )
                    tv_row = cur.fetchone()
                    if tv_row:
                        r_type, r_val, s_val = tv_row
                        # 3. Compute
                        total, s_cli, s_shop, s_city, s_admin = compute_financials(
                            rule_type=r_type,
                            rule=parse_rule(r_val),
                            share=parse_rule(s_val),
                            bags=payload.bags,
                            order_amount=payload.order_amount,
                            is_cms=payload.is_cms
                        )
                        standard_total = compute_total_price(
                            rule_type=r_type,
                            rule=parse_rule(r_val),
                            bags=payload.bags,
                            order_amount=payload.order_amount,
                            is_cms=False,
                        )
                        cms_subsidy = max(Decimal("0.00"), Decimal(str(standard_total)) - Decimal(str(total))) if payload.is_cms else Decimal("0.00")
                        # Business rule: no separate shop share; fold into admin_region share.
                        if s_shop:
                            s_admin = s_admin + s_shop
                            s_shop = 0
                        # 4. Insert Snapshot
                        _insert_delivery_financial(
                            cur,
                            delivery_id=delivery_id,
                            tariff_version_id=tariff_version_id,
                            total_price=total,
                            client_share=s_cli,
                            shop_share=s_shop,
                            city_share=s_city,
                            admin_share=s_admin,
                            cms_subsidy=cms_subsidy,
                        )

    except Exception as exc:
        logger.exception("create_delivery failed")
        raise HTTPException(status_code=500, detail="Unable to create delivery") from exc

    return {"delivery_id": str(delivery_id), "short_code": short_code}


@router.post("/shop", status_code=status.HTTP_201_CREATED)
def create_delivery_for_shop(
    payload: ShopDeliveryCreate,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    delivery_id = uuid4()
    shop_id = user.shop_id

    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    try:
        with get_db_connection(jwt_claims) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT s.hq_id, s.city_id, s.tariff_version_id, c.canton_id,
                               s.lat, s.lng, s.address
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        WHERE s.id = %s
                        """,
                        (shop_id,),
                    )
                    row = cur.fetchone()

                    if not row:
                        raise HTTPException(status_code=404, detail="Shop not found")

                    hq_id, city_id, tariff_version_id, canton_id, shop_lat, shop_lng, shop_address = row
                    if not tariff_version_id:
                        raise HTTPException(
                            status_code=400,
                            detail="Tariff version not configured for shop",
                        )

                    cur.execute(
                        """
                        SELECT cl.id, cl.name, cl.address, cl.postal_code, cl.city_name,
                               cl.is_cms, cl.city_id, cl.lat, cl.lng, c.parent_city_id
                        FROM client cl
                        JOIN city c ON c.id = cl.city_id
                        WHERE cl.id = %s
                        """,
                        (str(payload.client_id),),
                    )
                    client_row = cur.fetchone()
                    if not client_row:
                        raise HTTPException(status_code=404, detail="Client not found")

                    (
                        client_id,
                        client_name,
                        client_address,
                        client_postal_code,
                        client_city_name,
                        client_is_cms,
                        client_city_id,
                        client_lat,
                        client_lng,
                        client_parent_city_id,
                    ) = client_row

                    if str(client_city_id) != str(city_id) and str(client_parent_city_id) != str(city_id):
                        raise HTTPException(
                            status_code=400,
                            detail="Client not in shop city",
                        )

                    cur.execute(
                        """
                        SELECT id
                        FROM admin_region
                        WHERE canton_id = %s AND active = true
                        ORDER BY name
                        LIMIT 1
                        """,
                        (canton_id,),
                    )
                    admin_region_row = cur.fetchone()
                    if not admin_region_row:
                        raise HTTPException(
                            status_code=400,
                            detail="Admin region not configured for canton",
                        )
                    admin_region_id = admin_region_row[0]

                    _assert_period_not_frozen(cur, str(shop_id), payload.delivery_date)

                    cur.execute(
                        """
                        SELECT
                            id,
                            rule_type,
                            rule,
                            share
                        FROM tariff_version
                        WHERE id = %s
                          AND valid_from <= %s
                          AND (valid_to IS NULL OR valid_to >= %s)
                        LIMIT 1
                        """,
                        (str(tariff_version_id), payload.delivery_date, payload.delivery_date),
                    )
                    tariff_version = cur.fetchone()
                    if not tariff_version:
                        raise HTTPException(
                            status_code=400,
                            detail="No active tariff version for this date",
                        )

                    conn.commit()

                    if (shop_lat is None or shop_lng is None) and shop_address:
                        geocoded = geocode_swiss_address(shop_address)
                        if geocoded:
                            shop_lat, shop_lng = geocoded
                            cur.execute(
                                "UPDATE shop SET lat = %s, lng = %s WHERE id = %s",
                                (shop_lat, shop_lng, str(shop_id)),
                            )

                    if (client_lat is None or client_lng is None) and client_address:
                        query = f"{client_address}, {client_postal_code} {client_city_name}".strip(", ")
                        geocoded = geocode_swiss_address(query) if query else None
                        if geocoded:
                            client_lat, client_lng = geocoded
                            cur.execute(
                                "UPDATE client SET lat = %s, lng = %s WHERE id = %s",
                                (client_lat, client_lng, str(client_id)),
                            )

                    distance_km = None
                    co2_saved_kg = None
                    if shop_lat is not None and shop_lng is not None and client_lat is not None and client_lng is not None:
                        distance_km = compute_distance_km(shop_lat, shop_lng, client_lat, client_lng)
                        distance_km *= settings.RETURN_TRIP_MULTIPLIER
                        co2_saved_kg = compute_co2_saved_kg(distance_km)

                    client = {
                        "id": str(client_id),
                        "name": client_name,
                        "address": client_address,
                        "postal_code": client_postal_code,
                        "city_name": client_city_name,
                        "is_cms": client_is_cms,
                    }

                    _create_delivery_core(
                        cur=cur,
                        delivery_id=delivery_id,
                        shop_id=str(shop_id),
                        hq_id=str(hq_id),
                        admin_region_id=str(admin_region_id),
                        city_id=str(client_city_id),
                        canton_id=str(canton_id),
                        client=client,
                        payload=payload,
                        tariff_version=tariff_version,
                        distance_km=distance_km,
                        co2_saved_kg=co2_saved_kg,
                    )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("create_delivery_for_shop failed")
        raise HTTPException(status_code=500, detail="Unable to create delivery") from exc

    return {"delivery_id": str(delivery_id)}


@router.post("/shop/freeze")
def freeze_billing_period(
    shop_id: str,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    frozen_comment: str | None = None,
    user: MeResponse = Depends(require_hq_or_admin_user_for_shop),
    jwt_claims: str = Depends(get_current_user_claims),
):
    from app.core.billing_processing import freeze_shop_billing_period
    
    period_month = _parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                return freeze_shop_billing_period(
                    cur=cur,
                    shop_id=shop_id,
                    period_month=period_month,
                    frozen_by_user_id=user.user_id,
                    frozen_by_email=user.email,
                    frozen_comment=frozen_comment,
                )


@router.post("/shop/preview")
def preview_delivery_for_shop(
    payload: ShopDeliveryCreate,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.city_id, s.tariff_version_id
                FROM shop s
                WHERE s.id = %s
                """,
                (shop_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shop not found")

            city_id, tariff_version_id = row
            if not tariff_version_id:
                raise HTTPException(
                    status_code=400,
                    detail="Tariff version not configured for shop",
                )

            cur.execute(
                """
                SELECT is_cms, city_id
                FROM client
                WHERE id = %s
                """,
                (str(payload.client_id),),
            )
            client_row = cur.fetchone()
            if not client_row:
                raise HTTPException(status_code=404, detail="Client not found")

            client_is_cms, client_city_id = client_row
            parent_id = _get_city_parent_id(cur, str(client_city_id))
            if str(client_city_id) != str(city_id) and str(parent_id) != str(city_id):
                raise HTTPException(
                    status_code=400,
                    detail="Client not in shop city",
                )

            cur.execute(
                """
                SELECT
                    id,
                    rule_type,
                    rule,
                    share
                FROM tariff_version
                WHERE id = %s
                  AND valid_from <= %s
                  AND (valid_to IS NULL OR valid_to >= %s)
                LIMIT 1
                """,
                (str(tariff_version_id), payload.delivery_date, payload.delivery_date),
            )
            tariff_version = cur.fetchone()
            if not tariff_version:
                raise HTTPException(
                    status_code=400,
                    detail="No active tariff version for this date",
                )

            tariff_version_id, rule_type, rule, share = tariff_version
            rule_data = parse_rule(rule)
            share_data = parse_rule(share)
            validate_tariff_rule(rule_type, rule_data, share_data)

            total_price, s_client, s_shop, s_city, s_admin = compute_financials(
                bags=payload.bags,
                order_amount=payload.order_amount,
                rule_type=rule_type,
                rule=rule_data,
                share=share_data,
                is_cms=client_is_cms,
            )
            if s_shop:
                s_admin = s_admin + s_shop
                s_shop = 0

            return {
                "total_price": str(total_price),
                "share_client": str(s_client),
                "share_shop": str(s_shop),
                "share_city": str(s_city),
                "share_admin_region": str(s_admin),
            }




@router.get("/shop/configuration")
def get_shop_configuration(
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tv.rule_type
                FROM shop s
                JOIN tariff_version tv ON tv.id = s.tariff_version_id
                WHERE s.id = %s
                """,
                (shop_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Configuration not found")
            
            rule_type = (row[0] or "").strip().lower()
            return {"rule_type": rule_type}

@router.get("/shop")
def list_shop_deliveries(
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    month_date = _parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id AS delivery_id,
                    d.delivery_date,
                    d.client_id,
                    l.client_name,
                    l.address,
                    l.city_name,
                    l.time_window,
                    l.short_code,
                    l.bags,
                    l.order_amount,
                    l.basket_value,
                    l.is_cms,
                    l.notes,
                    st.status,
                    st.updated_at AS status_updated_at,
                    f.total_price,
                    f.share_admin_region
                FROM delivery d
                JOIN delivery_logistics l ON l.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status, updated_at
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                WHERE d.shop_id = %s
                  AND date_trunc('month', d.delivery_date)
                    = date_trunc('month', %s::date)
                ORDER BY d.delivery_date DESC
                """,
                (shop_id, month_date),
            )
            rows = _rows_to_dicts(cur)
            is_frozen = _is_period_frozen(cur, shop_id, month_date)
            return {"rows": rows, "is_frozen": is_frozen}


@router.get("/shop/export", deprecated=True)
def export_shop_deliveries(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    period_month = _parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.delivery_date,
                    l.client_name,
                    l.address,
                    l.city_name,
                    l.bags,
                    l.basket_value,
                    f.share_admin_region,
                    st.status,
                    d.id::text AS delivery_id
                FROM delivery d
                JOIN delivery_logistics l ON l.delivery_id = d.id
                LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE d.shop_id = %s
                  AND date_trunc('month', d.delivery_date)
                    = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                ORDER BY d.delivery_date
                """,
                (shop_id, period_month),
            )
            rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(
        [
            "Date",
            "Client",
            "Adresse",
            "Commune partenaire",
            "Sacs",
            "Valeur des courses (CHF)",
            "Montant facture (TTC)",
            "Statut",
            "Delivery ID",
        ]
    )
    for (
        delivery_date,
        client_name,
        address,
        city_name,
        bags,
        basket_value,
        share_admin_region,
        status,
        delivery_id,
    ) in rows:
        if isinstance(delivery_date, (datetime, date)):
            delivery_date_value = delivery_date.strftime("%Y-%m-%d")
        else:
            delivery_date_value = str(delivery_date or "")
        writer.writerow(
            [
                delivery_date_value,
                client_name or "",
                address or "",
                city_name or "",
                bags or 0,
                "" if basket_value is None else f"{float(basket_value or 0):.2f}",
                f"{float(share_admin_region or 0):.2f}",
                status or "",
                delivery_id or "",
            ]
        )

    output.seek(0)
    filename = f"livraisons-commerce-{month}.csv"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.patch("/shop/{delivery_id}")
def update_shop_delivery(
    delivery_id: str,
    payload: ShopDeliveryUpdate,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                return _apply_delivery_update(
                    cur=cur,
                    delivery_id=delivery_id,
                    payload=payload,
                    shop_id=str(shop_id),
                )


@router.post("/shop/{delivery_id}/cancel")
def cancel_shop_delivery(
    delivery_id: str,
    payload: ShopDeliveryCancel,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                return _apply_delivery_cancel(
                    cur=cur,
                    delivery_id=delivery_id,
                    shop_id=str(shop_id),
                    reason=payload.reason,
                )


@router.patch("/admin/{delivery_id}")
def update_delivery_admin(
    delivery_id: str,
    payload: ShopDeliveryUpdate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                shop_id = _assert_admin_delivery_access(cur, delivery_id, user)
                return _apply_delivery_update(
                    cur=cur,
                    delivery_id=delivery_id,
                    payload=payload,
                    shop_id=shop_id,
                )


@router.post("/admin/{delivery_id}/cancel")
def cancel_delivery_admin(
    delivery_id: str,
    payload: ShopDeliveryCancel,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                shop_id = _assert_admin_delivery_access(cur, delivery_id, user)
                return _apply_delivery_cancel(
                    cur=cur,
                    delivery_id=delivery_id,
                    shop_id=shop_id,
                    reason=payload.reason,
                )


@router.get("/shop/periods", deprecated=True)
def list_shop_periods(
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    bp.period_month,
                    bp.frozen_at,
                    bp.frozen_by,
                    bp.frozen_by_name,
                    bp.frozen_comment as comment,
                    bp.pdf_url,
                    bp.pdf_sha256,
                    bp.pdf_generated_at,
                    bp.shop_id,
                    s.name as shop_name,
                    COUNT(d.id) AS deliveries,
                    COALESCE(SUM(f.share_admin_region), 0) AS amount_ttc
                FROM billing_period bp
                JOIN shop s ON s.id = bp.shop_id
                LEFT JOIN delivery d
                    ON d.shop_id = bp.shop_id
                    AND date_trunc('month', d.delivery_date)::date = bp.period_month
                LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                WHERE bp.shop_id = %s
                GROUP BY
                    bp.period_month,
                    bp.frozen_at,
                    bp.frozen_by,
                    bp.frozen_by_name,
                    bp.frozen_comment,
                    bp.pdf_url,
                    bp.pdf_sha256,
                    bp.pdf_generated_at,
                    bp.shop_id,
                    s.name
                ORDER BY bp.period_month DESC
                """,
                (shop_id,),
            )
            return _rows_to_dicts(cur)


@router.post("/{delivery_id}/status")
def update_delivery_status(
    delivery_id: str,
    status: str = Query(..., pattern="^(picked_up|delivered|issue)$"),
    user: MeResponse = Depends(require_courier_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Courier status update.
    Transition logic:
    - created -> picked_up
    - picked_up -> delivered
    """
    try:
        with get_db_connection(jwt_claims) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT
                            d.courier_id,
                            COALESCE((
                                SELECT status
                                FROM delivery_status
                                WHERE delivery_id = d.id
                                ORDER BY updated_at DESC
                                LIMIT 1
                            ), 'created') AS current_status
                        FROM delivery d
                        WHERE d.id = %s
                        """,
                        (delivery_id,),
                    )
                    row = cur.fetchone()
                    if not row:
                        raise HTTPException(status_code=404, detail="Delivery not found")

                    assigned_courier_id, current_status = row

                    if not assigned_courier_id:
                        raise HTTPException(
                            status_code=409,
                            detail="Courier not assigned",
                        )

                    cur.execute(
                        """
                        SELECT id
                        FROM courier
                        WHERE user_id = %s
                           OR (email IS NOT NULL AND lower(email) = lower(%s))
                        LIMIT 1
                        """,
                        (user.user_id, user.email),
                    )
                    courier_row = cur.fetchone()
                    if not courier_row:
                        raise HTTPException(status_code=403, detail="Courier access required")

                    courier_id = courier_row[0]
                    if str(courier_id) != str(assigned_courier_id):
                        raise HTTPException(status_code=403, detail="Not assigned to this delivery")

                    if current_status == status:
                        return {
                            "delivery_id": delivery_id,
                            "status": status,
                            "previous_status": current_status,
                        }

                    valid_transitions = {
                        "created": {"picked_up", "issue"},
                        "assigned": {"picked_up", "issue"},
                        "picked_up": {"delivered", "issue"},
                        "issue": {"picked_up", "delivered"},
                    }

                    if status not in valid_transitions.get(current_status, set()):
                        raise HTTPException(
                            status_code=409,
                            detail="Invalid status transition",
                        )

                    cur.execute(
                        """
                        INSERT INTO delivery_status (delivery_id, status)
                        VALUES (%s, %s)
                        """,
                        (delivery_id, status),
                    )
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        logger.exception("update_courier_status failed for delivery_id=%s", delivery_id)
        raise HTTPException(status_code=500, detail="Unable to update delivery status") from exc

    return {"delivery_id": delivery_id, "status": status, "previous_status": current_status}


@router.get("/courier")
def list_courier_deliveries(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    user: MeResponse = Depends(require_courier_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_date = date if date else datetime.now().date().isoformat()

    try:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM courier
                    WHERE user_id = %s
                       OR (email IS NOT NULL AND lower(email) = lower(%s))
                    LIMIT 1
                    """,
                    (user.user_id, user.email),
                )
                courier_row = cur.fetchone()
                if not courier_row:
                    raise HTTPException(
                        status_code=403,
                        detail="Courier access required",
                    )
                courier_id = courier_row[0]

                cur.execute(
                    """
                    SELECT
                        d.id AS delivery_id,
                        d.delivery_date,
                        s.name AS shop_name,
                        s.address AS shop_address,
                        l.client_name,
                        l.address AS client_address,
                        l.postal_code AS client_postal_code,
                        l.city_name AS client_city,
                        l.time_window,
                        l.bags,
                        st.status,
                        st.updated_at AS status_updated_at
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    LEFT JOIN LATERAL (
                        SELECT status, updated_at
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE d.delivery_date = %s::date
                      AND d.courier_id = %s
                    ORDER BY d.delivery_date, s.name
                    """,
                    (target_date, courier_id),
                )
                return _rows_to_dicts(cur)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        logger.exception("list_courier_deliveries failed for date=%s", target_date)
        raise HTTPException(status_code=500, detail="Unable to load deliveries") from exc


@router.get("/customer")
def list_customer_deliveries(
    user: MeResponse = Depends(require_customer_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id AS delivery_id,
                    d.delivery_date,
                    s.name AS shop_name,
                    l.time_window,
                    l.bags,
                    st.status,
                    st.updated_at AS status_updated_at
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status, updated_at
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE d.client_id = %s
                ORDER BY d.delivery_date DESC
                """,
                (user.client_id,),
            )
            return _rows_to_dicts(cur)


def _parse_month(month):
    if month is None:
        today = date.today()
        return today.replace(day=1)
    try:
        return datetime.strptime(month, "%Y-%m").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid month format") from exc


def _get_latest_status(cur, delivery_id: str) -> tuple[str | None, datetime | None]:
    cur.execute(
        """
        SELECT status, updated_at
        FROM delivery_status
        WHERE delivery_id = %s
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        (delivery_id,),
    )
    row = cur.fetchone()
    if not row:
        return None, None
    return row[0], row[1]


def _is_period_frozen(cur, shop_id: str, period_month: date) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM billing_period
        WHERE shop_id = %s
          AND period_month = %s
        """,
        (shop_id, period_month),
    )
    return cur.fetchone() is not None


def _assert_period_not_frozen(cur, shop_id: str, delivery_date: date) -> None:
    period_month = delivery_date.replace(day=1)
    if _is_period_frozen(cur, shop_id, period_month):
        raise HTTPException(
            status_code=409,
            detail="This billing period is frozen",
        )


def _rows_to_dicts(cur):
    columns = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    results = []
    for row in rows:
        item = {}
        for col, val in zip(columns, row):
            item[col] = str(val) if isinstance(val, Decimal) else val
        results.append(item)
    return results


def _assert_admin_delivery_access(cur, delivery_id: str, user: MeResponse) -> str:
    cur.execute(
        """
        SELECT d.shop_id, c.admin_region_id
        FROM delivery d
        JOIN shop s ON s.id = d.shop_id
        JOIN city c ON c.id = s.city_id
        WHERE d.id = %s
        """,
        (delivery_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Delivery not found")

    shop_id, admin_region_id = row
    if user.role != "super_admin":
        if not user.admin_region_id or str(admin_region_id) != str(user.admin_region_id):
            raise HTTPException(status_code=403, detail="Not in your region")
    return str(shop_id)


def _can_edit_delivery(
    status: str | None,
    updated_at: datetime | None,
    delivery_date: date | None,
) -> bool:
    if status in EDITABLE_STATUSES:
        return True
    if status == "delivered" and updated_at:
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        grace_until = updated_at + timedelta(hours=DELIVERY_EDIT_GRACE_HOURS)
        return datetime.now(timezone.utc) <= grace_until
    if status == "delivered" and delivery_date:
        delivered_at = datetime.combine(delivery_date, time.min, tzinfo=timezone.utc)
        grace_until = delivered_at + timedelta(hours=DELIVERY_EDIT_GRACE_HOURS)
        return datetime.now(timezone.utc) <= grace_until
    return False


def _apply_delivery_update(
    *,
    cur,
    delivery_id: str,
    payload: ShopDeliveryUpdate,
    shop_id: str,
):
    cur.execute(
        """
        SELECT
            d.shop_id,
            d.delivery_date,
            d.client_id,
            l.time_window,
            l.bags,
            l.order_amount,
            l.basket_value,
            l.notes,
            l.is_cms
        FROM delivery d
        JOIN delivery_logistics l ON l.delivery_id = d.id
        WHERE d.id = %s
        """,
        (delivery_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Delivery not found")

    (
        delivery_shop_id,
        delivery_date,
        client_id,
        time_window,
        bags,
        order_amount,
        basket_value,
        notes,
        is_cms,
    ) = row

    if str(delivery_shop_id) != str(shop_id):
        raise HTTPException(status_code=403, detail="Not in your shop")

    status, status_updated_at = _get_latest_status(cur, delivery_id)
    can_edit_basic = _can_edit_delivery(status, status_updated_at, delivery_date)

    old_month = delivery_date.replace(day=1)
    new_delivery_date = payload.delivery_date or delivery_date
    new_month = new_delivery_date.replace(day=1)

    old_frozen = _is_period_frozen(cur, shop_id, old_month)
    new_frozen = _is_period_frozen(cur, shop_id, new_month)
    is_frozen = old_frozen or new_frozen

    if not can_edit_basic:
        # Allow delivered edits while the period is not frozen ("before freeze")
        if not (status in {"delivered", "cancelled"} and not is_frozen):
            raise HTTPException(status_code=409, detail="Delivery is locked")

    if status in EDITABLE_STATUSES and is_frozen:
        raise HTTPException(status_code=409, detail="Billing period is frozen")

    new_time_window = payload.time_window if payload.time_window is not None else time_window
    new_bags = payload.bags if payload.bags is not None else bags
    new_order_amount = (
        payload.order_amount if payload.order_amount is not None else order_amount
    )
    new_basket_value = (
        payload.basket_value if payload.basket_value is not None else basket_value
    )
    new_notes = payload.notes if payload.notes is not None else notes

    cur.execute(
        """
        SELECT tariff_version_id
        FROM shop
        WHERE id = %s
        """,
        (shop_id,),
    )
    shop_row = cur.fetchone()
    tariff_version_id = shop_row[0] if shop_row else None
    if not tariff_version_id:
        raise HTTPException(
            status_code=400,
            detail="Tariff version not configured for shop",
        )

    cur.execute(
        """
        SELECT id, rule_type, rule, share
        FROM tariff_version
        WHERE id = %s
          AND valid_from <= %s
          AND (valid_to IS NULL OR valid_to >= %s)
        LIMIT 1
        """,
        (str(tariff_version_id), new_delivery_date, new_delivery_date),
    )
    tariff_version = cur.fetchone()
    if not tariff_version:
        raise HTTPException(
            status_code=400,
            detail="No active tariff version for this date",
        )

    tariff_version_id, rule_type, rule, share = tariff_version
    rule_data = parse_rule(rule)
    share_data = parse_rule(share)
    validate_tariff_rule(rule_type, rule_data, share_data)

    total_price, s_client, s_shop, s_city, s_admin = compute_financials(
        bags=new_bags,
        order_amount=new_order_amount,
        rule_type=rule_type,
        rule=rule_data,
        share=share_data,
        is_cms=is_cms,
    )
    standard_total = compute_total_price(
        rule_type=rule_type,
        rule=rule_data,
        bags=new_bags,
        order_amount=new_order_amount,
        is_cms=False,
    )
    cms_subsidy = max(Decimal("0.00"), Decimal(str(standard_total)) - Decimal(str(total_price))) if is_cms else Decimal("0.00")
    if s_shop:
        s_admin = s_admin + s_shop
        s_shop = 0

    cur.execute(
        """
        UPDATE delivery
        SET delivery_date = %s,
            client_id = %s
        WHERE id = %s
        """,
        (new_delivery_date, client_id, delivery_id),
    )

    cur.execute(
        """
        UPDATE delivery_logistics
        SET time_window = %s,
            bags = %s,
            order_amount = %s,
            basket_value = %s,
            notes = %s
        WHERE delivery_id = %s
        """,
        (new_time_window, new_bags, new_order_amount, new_basket_value, new_notes, delivery_id),
    )

    cur.execute(
        """
        UPDATE delivery_financial
        SET tariff_version_id = %s,
            total_price = %s,
            share_client = %s,
            share_shop = %s,
            share_city = %s,
            share_admin_region = %s,
            cms_subsidy = %s
        WHERE delivery_id = %s
        """,
        (
            tariff_version_id,
            total_price,
            s_client,
            s_shop,
            s_city,
            s_admin,
            cms_subsidy,
            delivery_id,
        ),
    )
    if cur.rowcount == 0:
        _insert_delivery_financial(
            cur,
            delivery_id=delivery_id,
            tariff_version_id=tariff_version_id,
            total_price=total_price,
            client_share=s_client,
            shop_share=s_shop,
            city_share=s_city,
            admin_share=s_admin,
            cms_subsidy=cms_subsidy,
        )

    return {
        "delivery_id": delivery_id,
        "status": status,
        "delivery_date": new_delivery_date,
        "bags": new_bags,
        "order_amount": new_order_amount,
        "basket_value": new_basket_value,
        "share_admin_region": str(s_admin),
    }


def _apply_delivery_cancel(
    *,
    cur,
    delivery_id: str,
    shop_id: str,
    reason: str | None,
):
    cur.execute(
        """
        SELECT d.shop_id, d.delivery_date, l.notes
        FROM delivery d
        JOIN delivery_logistics l ON l.delivery_id = d.id
        WHERE d.id = %s
        """,
        (delivery_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Delivery not found")

    delivery_shop_id, delivery_date, notes = row
    if str(delivery_shop_id) != str(shop_id):
        raise HTTPException(status_code=403, detail="Not in your shop")

    status, status_updated_at = _get_latest_status(cur, delivery_id)
    can_edit_basic = _can_edit_delivery(status, status_updated_at, delivery_date)
    is_frozen = _is_period_frozen(cur, shop_id, delivery_date.replace(day=1))

    if not can_edit_basic:
        # Allow delivered cancels while the period is not frozen ("before freeze")
        if not (status in {"delivered", "cancelled"} and not is_frozen):
            raise HTTPException(status_code=409, detail="Delivery is locked")

    if status in EDITABLE_STATUSES and is_frozen:
        raise HTTPException(status_code=409, detail="Billing period is frozen")

    if reason:
        prefix = notes + "\n" if notes else ""
        notes = f"{prefix}Annulation: {reason}".strip()
        cur.execute(
            """
            UPDATE delivery_logistics
            SET notes = %s
            WHERE delivery_id = %s
            """,
            (notes, delivery_id),
        )

    cur.execute(
        """
        INSERT INTO delivery_status (delivery_id, status)
        VALUES (%s, 'cancelled')
        """,
        (delivery_id,),
    )

    return {"delivery_id": delivery_id, "status": "cancelled"}


def _create_delivery_core(
    *,
    cur,
    delivery_id,
    shop_id: str,
    hq_id: str,
    admin_region_id: str,
    city_id: str,
    canton_id: str,
    client: dict,
    payload: ShopDeliveryCreate,
    tariff_version,
    distance_km: float | None = None,
    co2_saved_kg: float | None = None,
):
    tariff_version_id, rule_type, rule, share = tariff_version
    rule_data = parse_rule(rule)
    share_data = parse_rule(share)
    validate_tariff_rule(rule_type, rule_data, share_data)

    total_price, s_client, s_shop, s_city, s_admin = compute_financials(
        bags=payload.bags,
        order_amount=payload.order_amount,
        rule_type=rule_type,
        rule=rule_data,
        share=share_data,
        is_cms=client["is_cms"],
    )
    standard_total = compute_total_price(
        rule_type=rule_type,
        rule=rule_data,
        bags=payload.bags,
        order_amount=payload.order_amount,
        is_cms=False,
    )
    cms_subsidy = max(Decimal("0.00"), Decimal(str(standard_total)) - Decimal(str(total_price))) if client["is_cms"] else Decimal("0.00")
    if s_shop:
        s_admin = s_admin + s_shop
        s_shop = 0

    _insert_delivery_record(
        cur,
        delivery_id=delivery_id,
        shop_id=shop_id,
        hq_id=hq_id,
        admin_region_id=admin_region_id,
        city_id=city_id,
        canton_id=canton_id,
        delivery_date=payload.delivery_date,
        client_id=client["id"],
        distance_km=distance_km,
        co2_saved_kg=co2_saved_kg,
    )

    import random
    import string
    
    # Generate Short Code (3 chars, Uppercase + Digits)
    # Ex: A7X, 3B9
    # Collision probability is low enough for daily operations per shop
    chars = string.ascii_uppercase + string.digits
    short_code = ''.join(random.choice(chars) for _ in range(3))

    _insert_delivery_logistics(
        cur,
        delivery_id=delivery_id,
        client_name=client["name"],
        address=client["address"],
        postal_code=client["postal_code"],
        city_name=client["city_name"],
        time_window=payload.time_window,
        bags=payload.bags,
        order_amount=payload.order_amount,
        basket_value=payload.basket_value,
        is_cms=client["is_cms"],
        notes=payload.notes,
        short_code=short_code,
    )

    cur.execute(
        """
        INSERT INTO delivery_financial (
            delivery_id,
            tariff_version_id,
            total_price,
            share_client,
            share_shop,
            share_city,
            share_admin_region,
            cms_subsidy
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            delivery_id,
            tariff_version_id,
            total_price,
            s_client,
            s_shop,
            s_city,
            s_admin,
            cms_subsidy,
        ),
    )

    _insert_delivery_status(cur, delivery_id=delivery_id)


def _insert_delivery_record(
    cur,
    *,
    delivery_id,
    shop_id: str,
    hq_id: str,
    admin_region_id: str,
    city_id: str,
    canton_id: str,
    delivery_date: date,
    client_id: str | None,
    distance_km: float | None = None,
    co2_saved_kg: float | None = None,
):
    if client_id is None:
        cur.execute(
            """
            INSERT INTO delivery (
                id,
                shop_id,
                hq_id,
                admin_region_id,
                city_id,
                canton_id,
                delivery_date,
                distance_km,
                co2_saved_kg
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                delivery_id,
                shop_id,
                hq_id,
                admin_region_id,
                city_id,
                canton_id,
                delivery_date,
                distance_km,
                co2_saved_kg,
            ),
        )
        return

    cur.execute(
        """
        INSERT INTO delivery (
            id,
            shop_id,
            hq_id,
            admin_region_id,
            city_id,
            canton_id,
            delivery_date,
            client_id,
            distance_km,
            co2_saved_kg
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            delivery_id,
            shop_id,
            hq_id,
            admin_region_id,
            city_id,
            canton_id,
            delivery_date,
            client_id,
            distance_km,
            co2_saved_kg,
        ),
    )


def _insert_delivery_logistics(
    cur,
    *,
    delivery_id,
    client_name: str | None,
    address: str,
    postal_code: str,
    city_name: str,
    time_window: str,
    bags: int,
    order_amount: Decimal | float | None,
    basket_value: Decimal | float | None,
    is_cms: bool,
    notes: str | None = None,
    short_code: str | None = None,
):
    # Snapshot client details at delivery time.
    if client_name is None:
        cur.execute(
            """
            INSERT INTO delivery_logistics (
                delivery_id,
                address,
                postal_code,
                city_name,
                time_window,
                bags,
                order_amount,
                basket_value,
                is_cms,
                short_code
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                delivery_id,
                address,
                postal_code,
                city_name,
                time_window,
                bags,
                order_amount,
                basket_value,
                is_cms,
                short_code,
            ),
        )
        return

    cur.execute(
        """
        INSERT INTO delivery_logistics (
            delivery_id,
            client_name,
            address,
            postal_code,
            city_name,
            time_window,
            bags,
            order_amount,
            basket_value,
            is_cms,
            notes,
            short_code
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            delivery_id,
            client_name,
            address,
            postal_code,
            city_name,
            time_window,
            bags,
            order_amount,
            basket_value,
            is_cms,
            notes,
            short_code
        ),
    )




def _insert_delivery_status(cur, *, delivery_id):
    cur.execute(
        """
        INSERT INTO delivery_status (delivery_id, status)
        VALUES (%s, 'created')
        """,
        (delivery_id,),
    )

def _insert_delivery_financial(
    cur,
    *,
    delivery_id,
    tariff_version_id: str | None,
    total_price: Decimal,
    client_share: Decimal,
    shop_share: Decimal,
    city_share: Decimal,
    admin_share: Decimal,
    cms_subsidy: Decimal,
):
    cur.execute(
        """
        INSERT INTO delivery_financial (
            delivery_id,
            tariff_version_id,
            total_price,
            share_client,
            share_shop,
            share_city,
            share_admin_region,
            cms_subsidy
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            delivery_id,
            tariff_version_id,
            total_price,
            client_share,
            shop_share,
            city_share,
            admin_share,
            cms_subsidy,
        ),
    )


def _resolve_city_by_postal_code(cur, postal_code: str):
    if not postal_code:
        return None
    cur.execute(
        """
        SELECT c.id, c.parent_city_id, c.admin_region_id
        FROM city_postal_code pc
        JOIN city c ON c.id = pc.city_id
        WHERE pc.postal_code = %s
        LIMIT 1
        """,
        (postal_code,),
    )
    return cur.fetchone()


def _get_city_parent_id(cur, city_id: str):
    if not city_id:
        return None
    cur.execute("SELECT parent_city_id FROM city WHERE id = %s", (city_id,))
    row = cur.fetchone()
    return row[0] if row else None
