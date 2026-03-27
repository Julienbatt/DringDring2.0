from datetime import date, datetime, timedelta
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.identity import resolve_identity
from app.core.guards import (
    require_city_user,
    require_shop_user,
    require_customer_user,
    require_hq_user,
)
from app.core.security import get_current_user, get_current_user_claims
from app.core.utils import parse_month
from app.db.session import get_db_connection

router = APIRouter(prefix="/stats", tags=["stats"])



def _previous_month_start(month_start: date) -> date:
    return (month_start.replace(day=1) - timedelta(days=1)).replace(day=1)


def _shift_month(month_start: date, delta: int) -> date:
    year = month_start.year + (month_start.month - 1 + delta) // 12
    month = (month_start.month - 1 + delta) % 12 + 1
    return date(year, month, 1)


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = math.ceil(p * len(ordered)) - 1
    idx = max(0, min(idx, len(ordered) - 1))
    return float(ordered[idx])


@router.get("/eco")
def get_eco_stats(
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: Optional[str] = None,
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )

    if identity.role == "super_admin":
        target_region = admin_region_id
        role_filter = ("admin_region_id", target_region) if target_region else None
    elif identity.role == "admin_region":
        if not identity.admin_region_id:
            raise HTTPException(status_code=403, detail="Admin region access required")
        role_filter = ("admin_region_id", identity.admin_region_id)
    elif identity.role == "hq":
        if not identity.hq_id:
            raise HTTPException(status_code=403, detail="HQ access required")
        role_filter = ("hq_id", identity.hq_id)
    elif identity.role == "city":
        if not identity.city_id:
            raise HTTPException(status_code=403, detail="City access required")
        role_filter = ("city_id", identity.city_id)
    elif identity.role == "customer":
        if not identity.client_id:
            raise HTTPException(status_code=403, detail="Client access required")
        role_filter = ("client_id", identity.client_id)
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    month_start = parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            where = [
                "d.delivery_date >= %s",
                "d.delivery_date < (%s::date + interval '1 month')",
            ]
            params = [month_start, month_start]

            if role_filter and role_filter[1]:
                where.append(f"d.{role_filter[0]} = %s")
                params.append(role_filter[1])

            cur.execute(
                f"""
                SELECT
                    COALESCE(SUM(COALESCE(d.distance_km, 0)), 0) AS distance_km,
                    COALESCE(SUM(COALESCE(d.co2_saved_kg, 0)), 0) AS co2_saved_kg,
                    COUNT(*) AS deliveries
                FROM delivery d
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE {" AND ".join(where)}
                  AND COALESCE(st.status, '') <> 'cancelled'
                """,
                tuple(params),
            )
            row = cur.fetchone()
            return {
                "distance_km": float(row[0] or 0),
                "co2_saved_kg": float(row[1] or 0),
                "deliveries": int(row[2] or 0),
                "month": month_start.isoformat()[:7],
            }


@router.get("/shop")
def get_shop_stats(
    user=Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=403, detail="Shop access required")

    month_start = parse_month(month)
    prev_month_start = _previous_month_start(month_start)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.id,
                        d.delivery_date::date AS delivery_day,
                        d.client_id,
                        l.client_name,
                        l.is_cms,
                        COALESCE(l.bags, 0) AS bags,
                        COALESCE(l.basket_value, 0) AS basket_value,
                        COALESCE(f.share_admin_region, 0) AS amount_due,
                        COALESCE(f.cms_subsidy, 0) AS cms_subsidy,
                        COALESCE(st.status, '') AS status
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
                ),
                client_counts AS (
                    SELECT client_id, COUNT(*) AS deliveries
                    FROM base
                    WHERE client_id IS NOT NULL
                    GROUP BY client_id
                ),
                daily_counts AS (
                    SELECT delivery_day, COUNT(*) AS deliveries
                    FROM base
                    GROUP BY delivery_day
                ),
                peak_day AS (
                    SELECT delivery_day, deliveries
                    FROM daily_counts
                    ORDER BY deliveries DESC, delivery_day DESC
                    LIMIT 1
                )
                SELECT
                    (SELECT COUNT(*) FROM base) AS total_deliveries,
                    (SELECT COUNT(DISTINCT client_id) FROM base WHERE client_id IS NOT NULL) AS unique_clients,
                    (SELECT COUNT(*) FROM client_counts WHERE deliveries > 1) AS repeat_clients,
                    (SELECT COALESCE(SUM(bags), 0) FROM base) AS total_bags,
                    (SELECT COALESCE(AVG(bags), 0) FROM base) AS average_bags,
                    (SELECT COALESCE(SUM(amount_due), 0) FROM base) AS total_volume_chf,
                    (SELECT COALESCE(SUM(cms_subsidy), 0) FROM base) AS cms_subsidy_chf,
                    (SELECT COALESCE(SUM(basket_value), 0) FROM base) AS total_basket_value,
                    (SELECT COALESCE(AVG(NULLIF(basket_value, 0)), 0) FROM base) AS average_basket_value,
                    (SELECT COUNT(*) FROM base WHERE is_cms IS TRUE) AS cms_deliveries,
                    (SELECT COUNT(*) FROM daily_counts) AS active_days,
                    (SELECT delivery_day FROM peak_day) AS peak_day,
                    (SELECT deliveries FROM peak_day) AS peak_day_deliveries
                """,
                (str(shop_id), month_start),
            )
            stats_row = cur.fetchone()

            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.client_id,
                        l.client_name,
                        COALESCE(l.bags, 0) AS bags,
                        COALESCE(st.status, '') AS status
                    FROM delivery d
                    JOIN delivery_logistics l ON l.delivery_id = d.id
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
                      AND d.client_id IS NOT NULL
                      AND COALESCE(st.status, '') <> 'cancelled'
                )
                SELECT
                    client_id::text,
                    COALESCE(MAX(client_name), 'Client') AS client_name,
                    COUNT(*) AS deliveries,
                    COALESCE(SUM(bags), 0) AS bags
                FROM base
                GROUP BY client_id
                ORDER BY deliveries DESC, bags DESC
                LIMIT 3
                """,
                (str(shop_id), month_start),
            )
            top_clients = [
                {
                    "client_id": row[0],
                    "client_name": row[1],
                    "deliveries": int(row[2] or 0),
                    "bags": int(row[3] or 0),
                }
                for row in cur.fetchall()
            ]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM delivery d
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
                """,
                (str(shop_id), prev_month_start),
            )
            prev_deliveries = int(cur.fetchone()[0] or 0)

    total_deliveries = int(stats_row[0] or 0)
    unique_clients = int(stats_row[1] or 0)
    repeat_clients = int(stats_row[2] or 0)
    total_bags = int(stats_row[3] or 0)
    average_bags = float(stats_row[4] or 0)
    total_volume_chf = float(stats_row[5] or 0)
    cms_subsidy_chf = float(stats_row[6] or 0)
    total_basket_value = float(stats_row[7] or 0)
    average_basket_value = float(stats_row[8] or 0)
    cms_deliveries = int(stats_row[9] or 0)
    active_days = int(stats_row[10] or 0)
    peak_day = stats_row[11].isoformat() if stats_row[11] else None
    peak_day_deliveries = int(stats_row[12] or 0)

    repeat_rate = (repeat_clients / unique_clients * 100) if unique_clients else 0.0
    deliveries_change_pct = None
    if prev_deliveries:
        deliveries_change_pct = (total_deliveries - prev_deliveries) / prev_deliveries * 100

    deliveries_per_active_day = (
        total_deliveries / active_days if active_days else 0.0
    )
    cms_share_pct = (cms_deliveries / total_deliveries * 100) if total_deliveries else 0.0

    return {
        "month": month_start.isoformat()[:7],
        "previous_month": prev_month_start.isoformat()[:7],
        "total_deliveries": total_deliveries,
        "unique_clients": unique_clients,
        "repeat_clients": repeat_clients,
        "repeat_rate_pct": round(repeat_rate, 1),
        "total_bags": total_bags,
        "average_bags": round(average_bags, 2),
        "total_volume_chf": round(total_volume_chf, 2),
        "cms_subsidy_chf": round(cms_subsidy_chf, 2),
        "cms_deliveries": cms_deliveries,
        "cms_share_pct": round(cms_share_pct, 1),
        "total_basket_value_chf": round(total_basket_value, 2),
        "average_basket_value_chf": round(average_basket_value, 2),
        "active_days": active_days,
        "deliveries_per_active_day": round(deliveries_per_active_day, 2),
        "peak_day": peak_day,
        "peak_day_deliveries": peak_day_deliveries,
        "previous_month_deliveries": prev_deliveries,
        "deliveries_change_pct": round(deliveries_change_pct, 1)
        if deliveries_change_pct is not None
        else None,
        "top_clients": top_clients,
    }


@router.get("/city")
def get_city_stats(
    user=Depends(require_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    city_id = user.city_id
    if not city_id:
        raise HTTPException(status_code=403, detail="City access required")

    month_start = parse_month(month)
    prev_month_start = _previous_month_start(month_start)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.id,
                        d.delivery_date::date AS delivery_day,
                        d.client_id,
                        d.shop_id,
                        l.is_cms,
                        COALESCE(l.bags, 0) AS bags,
                        COALESCE(f.share_city, 0) AS share_city,
                        COALESCE(f.total_price, 0) AS total_price,
                        COALESCE(f.cms_subsidy, 0) AS cms_subsidy,
                        COALESCE(st.status, '') AS status
                    FROM delivery d
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    JOIN city c ON c.id = d.city_id
                    LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                    LEFT JOIN LATERAL (
                        SELECT status
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE (c.id = %s OR c.parent_city_id = %s)
                      AND date_trunc('month', d.delivery_date)
                        = date_trunc('month', %s::date)
                      AND COALESCE(st.status, '') <> 'cancelled'
                ),
                daily_counts AS (
                    SELECT delivery_day, COUNT(*) AS deliveries
                    FROM base
                    GROUP BY delivery_day
                )
                SELECT
                    (SELECT COUNT(*) FROM base) AS total_deliveries,
                    (SELECT COUNT(DISTINCT client_id) FROM base WHERE client_id IS NOT NULL) AS unique_clients,
                    (SELECT COUNT(DISTINCT shop_id) FROM base) AS active_shops,
                    (SELECT COUNT(*) FROM base WHERE is_cms IS TRUE) AS cms_deliveries,
                    (SELECT COUNT(DISTINCT client_id) FROM base WHERE is_cms IS TRUE AND client_id IS NOT NULL) AS cms_unique_clients,
                    (SELECT COALESCE(SUM(bags), 0) FROM base) AS total_bags,
                    (SELECT COALESCE(AVG(bags), 0) FROM base) AS average_bags,
                    (SELECT COUNT(*) FROM daily_counts) AS active_days,
                    (SELECT COALESCE(SUM(share_city), 0) FROM base) AS total_subvention,
                    (SELECT COALESCE(SUM(total_price), 0) FROM base) AS total_volume,
                    (SELECT COALESCE(SUM(cms_subsidy), 0) FROM base) AS cms_subsidy_total
                """,
                (str(city_id), str(city_id), month_start),
            )
            stats_row = cur.fetchone()

            cur.execute(
                """
                SELECT COUNT(*)
                FROM delivery d
                JOIN city c ON c.id = d.city_id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE (c.id = %s OR c.parent_city_id = %s)
                  AND date_trunc('month', d.delivery_date)
                    = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                """,
                (str(city_id), str(city_id), prev_month_start),
            )
            prev_deliveries = int(cur.fetchone()[0] or 0)

    total_deliveries = int(stats_row[0] or 0)
    unique_clients = int(stats_row[1] or 0)
    active_shops = int(stats_row[2] or 0)
    cms_deliveries = int(stats_row[3] or 0)
    cms_unique_clients = int(stats_row[4] or 0)
    total_bags = int(stats_row[5] or 0)
    average_bags = float(stats_row[6] or 0)
    active_days = int(stats_row[7] or 0)
    total_subvention = float(stats_row[8] or 0)
    total_volume = float(stats_row[9] or 0)
    cms_subsidy_total = float(stats_row[10] or 0)

    cms_share_pct = (cms_deliveries / total_deliveries * 100) if total_deliveries else 0.0
    deliveries_change_pct = None
    if prev_deliveries:
        deliveries_change_pct = (total_deliveries - prev_deliveries) / prev_deliveries * 100

    deliveries_per_active_day = (
        total_deliveries / active_days if active_days else 0.0
    )

    return {
        "month": month_start.isoformat()[:7],
        "previous_month": prev_month_start.isoformat()[:7],
        "total_deliveries": total_deliveries,
        "unique_clients": unique_clients,
        "active_shops": active_shops,
        "cms_deliveries": cms_deliveries,
        "cms_share_pct": round(cms_share_pct, 1),
        "cms_unique_clients": cms_unique_clients,
        "total_bags": total_bags,
        "average_bags": round(average_bags, 2),
        "active_days": active_days,
        "deliveries_per_active_day": round(deliveries_per_active_day, 2),
        "previous_month_deliveries": prev_deliveries,
        "deliveries_change_pct": round(deliveries_change_pct, 1)
        if deliveries_change_pct is not None
        else None,
        "total_subvention_chf": round(total_subvention, 2),
        "total_volume_chf": round(total_volume, 2),
        "cms_subsidy_chf": round(cms_subsidy_total, 2),
    }


@router.get("/hq")
def get_hq_stats(
    user=Depends(require_hq_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: Optional[str] = Query(default=None),
):
    hq_id = user.hq_id
    if not hq_id:
        raise HTTPException(status_code=403, detail="HQ access required")

    month_start = parse_month(month)
    prev_month_start = _previous_month_start(month_start)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.id,
                        d.delivery_date::date AS delivery_day,
                        d.client_id,
                        s.id AS shop_id,
                        s.city_id AS city_id,
                        l.is_cms,
                        COALESCE(l.bags, 0) AS bags,
                        COALESCE(l.basket_value, 0) AS basket_value,
                        COALESCE(f.total_price, 0) AS total_price,
                        COALESCE(f.share_city, 0) AS share_city,
                        COALESCE(f.share_admin_region, 0) AS share_admin_region,
                        COALESCE(f.cms_subsidy, 0) AS cms_subsidy,
                        COALESCE(st.status, '') AS status
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN city c ON c.id = s.city_id
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                    LEFT JOIN LATERAL (
                        SELECT status
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE s.hq_id = %s
                      AND date_trunc('month', d.delivery_date)
                        = date_trunc('month', %s::date)
                      AND COALESCE(st.status, '') <> 'cancelled'
                      AND (%s::uuid IS NULL OR c.admin_region_id = %s)
                ),
                daily_counts AS (
                    SELECT delivery_day, COUNT(*) AS deliveries
                    FROM base
                    GROUP BY delivery_day
                )
                SELECT
                    (SELECT COUNT(*) FROM base) AS total_deliveries,
                    (SELECT COUNT(DISTINCT client_id) FROM base WHERE client_id IS NOT NULL) AS unique_clients,
                    (SELECT COUNT(DISTINCT shop_id) FROM base) AS active_shops,
                    (SELECT COUNT(DISTINCT city_id) FROM base) AS active_cities,
                    (SELECT COALESCE(SUM(bags), 0) FROM base) AS total_bags,
                    (SELECT COALESCE(AVG(bags), 0) FROM base) AS average_bags,
                    (SELECT COALESCE(SUM(total_price), 0) FROM base) AS total_volume,
                    (SELECT COALESCE(SUM(share_city + share_admin_region), 0) FROM base) AS total_subvention,
                    (SELECT COALESCE(SUM(basket_value), 0) FROM base) AS total_basket_value,
                    (SELECT COALESCE(AVG(NULLIF(basket_value, 0)), 0) FROM base) AS average_basket_value,
                    (SELECT COUNT(*) FROM base WHERE is_cms IS TRUE) AS cms_deliveries,
                    (SELECT COALESCE(SUM(cms_subsidy), 0) FROM base) AS cms_subsidy_chf,
                    (SELECT COUNT(*) FROM daily_counts) AS active_days
                """,
                (str(hq_id), month_start, admin_region_id, admin_region_id),
            )
            stats_row = cur.fetchone()

            cur.execute(
                """
                SELECT COUNT(*)
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN city c ON c.id = s.city_id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE s.hq_id = %s
                  AND date_trunc('month', d.delivery_date)
                    = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                  AND (%s::uuid IS NULL OR c.admin_region_id = %s)
                """,
                (str(hq_id), prev_month_start, admin_region_id, admin_region_id),
            )
            prev_deliveries = int(cur.fetchone()[0] or 0)

    total_deliveries = int(stats_row[0] or 0)
    unique_clients = int(stats_row[1] or 0)
    active_shops = int(stats_row[2] or 0)
    active_cities = int(stats_row[3] or 0)
    total_bags = int(stats_row[4] or 0)
    average_bags = float(stats_row[5] or 0)
    total_volume = float(stats_row[6] or 0)
    total_subvention = float(stats_row[7] or 0)
    total_basket_value = float(stats_row[8] or 0)
    average_basket_value = float(stats_row[9] or 0)
    cms_deliveries = int(stats_row[10] or 0)
    cms_subsidy_chf = float(stats_row[11] or 0)
    active_days = int(stats_row[12] or 0)

    deliveries_change_pct = None
    if prev_deliveries:
        deliveries_change_pct = (total_deliveries - prev_deliveries) / prev_deliveries * 100

    deliveries_per_active_day = (
        total_deliveries / active_days if active_days else 0.0
    )
    cms_share_pct = (cms_deliveries / total_deliveries * 100) if total_deliveries else 0.0

    return {
        "month": month_start.isoformat()[:7],
        "previous_month": prev_month_start.isoformat()[:7],
        "total_deliveries": total_deliveries,
        "unique_clients": unique_clients,
        "active_shops": active_shops,
        "active_cities": active_cities,
        "total_bags": total_bags,
        "average_bags": round(average_bags, 2),
        "total_volume_chf": round(total_volume, 2),
        "total_subvention_chf": round(total_subvention, 2),
        "total_basket_value_chf": round(total_basket_value, 2),
        "average_basket_value_chf": round(average_basket_value, 2),
        "cms_deliveries": cms_deliveries,
        "cms_share_pct": round(cms_share_pct, 1),
        "cms_subsidy_chf": round(cms_subsidy_chf, 2),
        "active_days": active_days,
        "deliveries_per_active_day": round(deliveries_per_active_day, 2),
        "previous_month_deliveries": prev_deliveries,
        "deliveries_change_pct": round(deliveries_change_pct, 1)
        if deliveries_change_pct is not None
        else None,
    }


@router.get("/customer")
def get_customer_stats(
    user=Depends(require_customer_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    client_id = user.client_id
    if not client_id:
        raise HTTPException(status_code=403, detail="Client access required")

    month_start = parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.id,
                        d.delivery_date,
                        d.shop_id,
                        s.name AS shop_name,
                        COALESCE(l.bags, 0) AS bags,
                        COALESCE(d.distance_km, 0) AS distance_km
                    FROM delivery d
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    JOIN shop s ON s.id = d.shop_id
                    WHERE d.client_id = %s
                      AND date_trunc('month', d.delivery_date)
                        = date_trunc('month', %s::date)
                ),
                shop_counts AS (
                    SELECT shop_id, shop_name, COUNT(*) AS deliveries
                    FROM base
                    GROUP BY shop_id, shop_name
                ),
                day_counts AS (
                    SELECT EXTRACT(DOW FROM delivery_date)::int AS day_of_week,
                           COUNT(*) AS deliveries
                    FROM base
                    GROUP BY day_of_week
                ),
                top_shop AS (
                    SELECT shop_id, shop_name, deliveries
                    FROM shop_counts
                    ORDER BY deliveries DESC, shop_name
                    LIMIT 1
                ),
                top_day AS (
                    SELECT day_of_week, deliveries
                    FROM day_counts
                    ORDER BY deliveries DESC, day_of_week DESC
                    LIMIT 1
                )
                SELECT
                    (SELECT COUNT(*) FROM base) AS total_deliveries,
                    (SELECT COALESCE(SUM(bags), 0) FROM base) AS total_bags,
                    (SELECT COALESCE(SUM(distance_km), 0) FROM base) AS total_distance_km,
                    (SELECT shop_id::text FROM top_shop) AS top_shop_id,
                    (SELECT shop_name FROM top_shop) AS top_shop_name,
                    (SELECT deliveries FROM top_shop) AS top_shop_deliveries,
                    (SELECT day_of_week FROM top_day) AS top_day,
                    (SELECT deliveries FROM top_day) AS top_day_deliveries
                """,
                (str(client_id), month_start),
            )
            row = cur.fetchone()

    return {
        "month": month_start.isoformat()[:7],
        "total_deliveries": int(row[0] or 0),
        "total_bags": int(row[1] or 0),
        "total_distance_km": float(row[2] or 0),
        "top_shop_id": row[3],
        "top_shop_name": row[4],
        "top_shop_deliveries": int(row[5] or 0) if row[5] is not None else 0,
        "top_day": int(row[6]) if row[6] is not None else None,
        "top_day_deliveries": int(row[7] or 0) if row[7] is not None else 0,
    }


@router.get("/rewards")
def get_admin_region_rewards(
    admin_region_id: Optional[str] = None,
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )

    if identity.role == "super_admin":
        target_region_id = admin_region_id
    elif identity.role == "admin_region":
        target_region_id = identity.admin_region_id
    else:
        raise HTTPException(status_code=403, detail="Admin region access required")

    if not target_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    window_months = 6
    today = date.today().replace(day=1)
    period_end = _shift_month(today, 1)
    period_start = _shift_month(period_end, -window_months)
    last_3m_start = _shift_month(period_end, -3)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(DISTINCT date_trunc('month', d.delivery_date)::date)
                FROM delivery d
                WHERE d.admin_region_id = %s
                  AND d.delivery_date >= %s
                  AND d.delivery_date < %s
                """,
                (str(target_region_id), period_start, period_end),
            )
            months_available = int(cur.fetchone()[0] or 0)

            cur.execute(
                """
                WITH base AS (
                    SELECT
                        d.shop_id,
                        date_trunc('month', d.delivery_date)::date AS month_bucket
                    FROM delivery d
                    WHERE d.admin_region_id = %s
                      AND d.delivery_date >= %s
                      AND d.delivery_date < %s
                ),
                per_shop AS (
                    SELECT
                        shop_id,
                        COUNT(*) AS deliveries_total,
                        COUNT(DISTINCT month_bucket) AS active_months,
                        SUM(CASE WHEN month_bucket >= %s THEN 1 ELSE 0 END) AS deliveries_last_3m,
                        SUM(CASE WHEN month_bucket < %s THEN 1 ELSE 0 END) AS deliveries_prev_3m
                    FROM base
                    GROUP BY shop_id
                )
                SELECT
                    s.id::text,
                    s.name,
                    p.deliveries_total,
                    p.active_months,
                    p.deliveries_last_3m,
                    p.deliveries_prev_3m
                FROM per_shop p
                JOIN shop s ON s.id = p.shop_id
                ORDER BY p.deliveries_total DESC, s.name
                """,
                (str(target_region_id), period_start, period_end, last_3m_start, last_3m_start),
            )
            rows = cur.fetchall()

    max_deliveries = max([int(row[2] or 0) for row in rows], default=0)
    scored = []
    for row in rows:
        deliveries_total = int(row[2] or 0)
        active_months = int(row[3] or 0)
        deliveries_last = int(row[4] or 0)
        deliveries_prev = int(row[5] or 0)
        volume_norm = deliveries_total / max_deliveries if max_deliveries else 0.0
        growth_rate = (deliveries_last - deliveries_prev) / max(deliveries_prev, 1)
        growth_norm = max(0.0, min(growth_rate, 1.0))
        regularity = active_months / window_months
        score = round(0.6 * volume_norm + 0.25 * growth_norm + 0.15 * regularity, 4)
        scored.append(
            {
                "shop_id": row[0],
                "shop_name": row[1],
                "deliveries_total": deliveries_total,
                "active_months": active_months,
                "deliveries_last_3m": deliveries_last,
                "deliveries_prev_3m": deliveries_prev,
                "score": score,
            }
        )

    scores = [row["score"] for row in scored]
    thresholds = {
        "bronze": _percentile(scores, 0.6),
        "silver": _percentile(scores, 0.8),
        "gold": _percentile(scores, 0.92),
    }

    def tier_for(score: float) -> str:
        if score >= thresholds["gold"]:
            return "Gold"
        if score >= thresholds["silver"]:
            return "Silver"
        if score >= thresholds["bronze"]:
            return "Bronze"
        return "Base"

    scored.sort(key=lambda row: (row["score"], row["deliveries_total"]), reverse=True)
    for idx, row in enumerate(scored, start=1):
        row["rank"] = idx
        row["tier"] = tier_for(row["score"])

    tier_counts = {"Gold": 0, "Silver": 0, "Bronze": 0, "Base": 0}
    for row in scored:
        tier_counts[row["tier"]] += 1

    return {
        "ready": months_available >= window_months,
        "months_available": months_available,
        "window_months": window_months,
        "period_start": period_start.isoformat(),
        "period_end": _shift_month(period_end, -1).isoformat(),
        "thresholds": thresholds,
        "tiers": tier_counts,
        "rows": scored,
    }
