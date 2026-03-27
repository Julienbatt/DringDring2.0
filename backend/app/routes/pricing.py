from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID

from app.core.security import get_current_user_claims
from app.core.tariff_engine import compute_financials, compute_total_price, parse_rule
from app.core.tariff_validation import validate_tariff_rule
from app.db.session import get_db_connection

router = APIRouter(prefix="/deliveries", tags=["pricing"])


@router.post("/{delivery_id}/calculate", status_code=status.HTTP_201_CREATED)
def calculate_delivery(
    delivery_id: UUID,
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:

            # --------------------------------------------------
            # 1. Idempotence: prevent any recalculation.
            # --------------------------------------------------
            cur.execute(
                "SELECT 1 FROM delivery_financial WHERE delivery_id = %s",
                (str(delivery_id),)
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Delivery financials already calculated"
                )

            # --------------------------------------------------
            # 2. Charger delivery + logistics
            # --------------------------------------------------
            cur.execute(
                """
                SELECT
                    d.delivery_date,
                    d.shop_id,
                    l.bags,
                    l.is_cms,
                    l.order_amount
                FROM delivery d
                JOIN delivery_logistics l ON l.delivery_id = d.id
                WHERE d.id = %s
                """,
                (str(delivery_id),)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Delivery or logistics not found")

            delivery_date, shop_id, bags, is_cms, order_amount = row

            # --------------------------------------------------
            # 3. Select active tariff version.
            # --------------------------------------------------
            cur.execute(
                """
                SELECT tariff_version_id
                FROM shop
                WHERE id = %s
                """,
                (str(shop_id),)
            )
            shop_row = cur.fetchone()
            if not shop_row or not shop_row[0]:
                raise HTTPException(
                    status_code=400,
                    detail="Tariff version not configured for shop"
                )

            tariff_version_id = shop_row[0]

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
                (str(tariff_version_id), delivery_date, delivery_date)
            )
            tariff_version = cur.fetchone()
            if not tariff_version:
                raise HTTPException(
                    status_code=400,
                    detail="No active tariff version for this date"
                )

            tariff_version_id, rule_type, rule, share = tariff_version
            rule_data = parse_rule(rule)
            share_data = parse_rule(share)
            validate_tariff_rule(rule_type, rule_data, share_data)

            total_price, s_client, s_shop, s_city, s_admin = compute_financials(
                bags=bags,
                order_amount=order_amount,
                rule_type=rule_type,
                rule=rule_data,
                share=share_data,
                is_cms=is_cms,
            )

            cms_subsidy = None
            if is_cms:
                standard_total = compute_total_price(
                    rule_type=rule_type,
                    rule=rule_data,
                    bags=bags,
                    order_amount=order_amount,
                    is_cms=False,
                )
                cms_total = compute_total_price(
                    rule_type=rule_type,
                    rule=rule_data,
                    bags=bags,
                    order_amount=order_amount,
                    is_cms=True,
                )
                cms_subsidy = max(standard_total - cms_total, 0)

            # --------------------------------------------------
            # 5. Snapshot financier (INSERT unique)
            # --------------------------------------------------
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
                    str(delivery_id),
                    str(tariff_version_id),
                    total_price,
                    s_client,
                    s_shop,
                    s_city,
                    s_admin,
                    cms_subsidy,
                )
            )

    return {
        "status": "calculated",
        "total_price": float(total_price),
        "shares": {
            "client": float(s_client),
            "shop": float(s_shop),
            "city": float(s_city),
            "admin_region": float(s_admin),
        }
    }
