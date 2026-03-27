import csv
import io
import logging
import re
import zipfile
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from app.core.guards import (
    require_admin_user,
    require_city_user,
    require_hq_or_admin_user,
    require_hq_user,
    require_shop_user,
)
from app.core.identity import resolve_identity
from app.core.billing_reference import generate_reference
from app.core.security import get_current_user, get_current_user_claims
from app.db.session import get_db_connection
from app.pdf.client_monthly_report import build_client_monthly_pdf
from app.pdf.invoice_report import build_recipient_invoice_pdf
from app.pdf.shop_monthly_report import build_shop_monthly_pdf
from app.schemas.me import MeResponse
from app.storage.supabase_storage import download_file_bytes, download_pdf_bytes
from app.core.utils import parse_month, split_address_parts

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/reports", tags=["reporting"])


@router.get("/city-billing")
def get_city_billing(
    user: MeResponse = Depends(require_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    """
    Returns monthly billing data.
    RLS applies territorial filtering automatically.
    PostgreSQL numeric fields are converted explicitly
    to ensure reliable JSON serialization.
    """
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            month_date = parse_month(month)
            cur.execute(
                """
                SELECT * FROM view_city_billing
                WHERE date_trunc('month', billing_month) = date_trunc('month', %s::date)
                """,
                (month_date,),
            )
            return _rows_to_dicts(cur)


@router.get("/city-billing-shops")
def get_city_billing_shops(
    user: MeResponse = Depends(require_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    """
    Returns monthly billing data split by shop.
    RLS applies territorial filtering automatically.
    """
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            month_date = parse_month(month)
            cur.execute(
                """
                SELECT * FROM view_city_billing_shops
                WHERE date_trunc('month', billing_month) = date_trunc('month', %s::date)
                """,
                (month_date,),
            )
            return _rows_to_dicts(cur)


@router.get("/city-billing-deliveries")
def get_city_billing_deliveries(
    city_id: str,
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    """
    Returns detailed deliveries for a city and month.
    """
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if identity.role == "city":
                if not identity.city_id or str(identity.city_id) != str(city_id):
                    raise HTTPException(status_code=403, detail="City access required")
            elif identity.role == "hq":
                if not identity.hq_id:
                    raise HTTPException(status_code=400, detail="HQ id missing")
                cur.execute(
                    """
                    SELECT 1
                    FROM shop s
                    WHERE s.city_id = %s
                      AND s.hq_id = %s
                    LIMIT 1
                    """,
                    (city_id, str(identity.hq_id)),
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=403, detail="City access required")
            elif identity.role == "admin_region":
                if not identity.admin_region_id:
                    raise HTTPException(status_code=400, detail="Admin region id missing")
                cur.execute(
                    """
                    SELECT 1
                    FROM city
                    WHERE id = %s
                      AND admin_region_id = %s
                    """,
                    (city_id, str(identity.admin_region_id)),
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=403, detail="City access required")
            elif identity.role != "super_admin":
                raise HTTPException(status_code=403, detail="City access required")

            month_date = parse_month(month)
            cur.execute(
                """
                SELECT
                    d.id AS delivery_id,
                    d.delivery_date,
                    s.id AS shop_id,
                    s.name AS shop_name,
                    s.hq_id AS hq_id,
                    c.name AS city_name,
                    l.client_name,
                    l.address,
                    l.postal_code,
                    l.city_name AS delivery_city,
                    l.bags,
                    l.is_cms,
                    l.time_window,
                    f.total_price,
                    f.share_admin_region,
                    f.share_city,
                    f.share_client
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
                WHERE s.city_id = %s
                  AND date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                ORDER BY s.name, d.delivery_date
                """,
                (city_id, month_date),
            )
            return _rows_to_dicts(cur)


@router.get("/hq-billing/zip", deprecated=True)
def get_hq_billing_zip(
    user: MeResponse = Depends(require_hq_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    preview: bool = Query(default=False),
):
    """
    Download a ZIP containing all frozen shop PDFs for the HQ for a specific month.
    """
    month_date = parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if preview:
                cur.execute(
                    """
                    SELECT s.id, s.name, c.name
                    FROM shop s
                    JOIN city c ON c.id = s.city_id
                    JOIN delivery d ON d.shop_id = s.id
                    LEFT JOIN LATERAL (
                        SELECT status
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE s.hq_id = %s
                      AND date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                      AND COALESCE(st.status, '') <> 'cancelled'
                    GROUP BY s.id, s.name, c.name
                    ORDER BY s.name
                    """,
                    (str(user.hq_id), month_date),
                )
                shops = cur.fetchall()
                if not shops:
                    raise HTTPException(status_code=404, detail="No deliveries for this period")

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    for shop_id, shop_name, shop_city in shops:
                        try:
                            cur.execute(
                                """
                                SELECT
                                    d.delivery_date,
                                    l.client_name,
                                    l.city_name,
                                    l.bags,
                                    f.total_price,
                                    f.share_admin_region,
                                    f.share_city
                                FROM delivery d
                                JOIN delivery_logistics l ON l.delivery_id = d.id
                                JOIN delivery_financial f ON f.delivery_id = d.id
                                LEFT JOIN LATERAL (
                                    SELECT status
                                    FROM delivery_status
                                    WHERE delivery_id = d.id
                                    ORDER BY updated_at DESC
                                    LIMIT 1
                                ) st ON true
                                WHERE d.shop_id = %s
                                  AND d.delivery_date >= %s::date
                                  AND d.delivery_date < (%s::date + INTERVAL '1 month')
                                  AND COALESCE(st.status, '') <> 'cancelled'
                                ORDER BY d.delivery_date
                                """,
                                (shop_id, month_date, month_date),
                            )
                            deliveries = cur.fetchall()
                            if not deliveries:
                                zip_file.writestr(
                                    f"EMPTY_{shop_name}.txt",
                                    "No deliveries for this period.",
                                )
                                continue
                            pdf_buffer = build_shop_monthly_pdf(
                                shop_name=shop_name,
                                shop_city=shop_city,
                                hq_name=None,
                                period_month=month_date,
                                frozen_at=None,
                                frozen_by=None,
                                frozen_by_name=None,
                                deliveries=deliveries,
                                is_preview=True,
                            )
                            safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                            filename = f"{safe_shop}_{month}_PREVIEW.pdf"
                            zip_file.writestr(filename, pdf_buffer.getvalue())
                        except Exception as e:
                            zip_file.writestr(f"ERROR_{shop_name}.txt", f"Could not generate PDF: {str(e)}")
            else:
                # 1. Select all frozen PDFs for this HQ/Month
                cur.execute(
                    """
                    SELECT
                        s.name,
                        bp.pdf_url
                    FROM view_hq_billing_shops v
                    JOIN shop s ON s.id = v.shop_id
                    JOIN billing_period bp
                      ON bp.shop_id = s.id
                     AND bp.period_month = v.billing_month
                    WHERE date_trunc('month', v.billing_month) = date_trunc('month', %s::date)
                      AND bp.pdf_url IS NOT NULL
                    """,
                    (month_date,),
                )
                rows = cur.fetchall()

                if not rows:
                    raise HTTPException(status_code=404, detail="No billing documents found for this period")

                # 2. Build ZIP
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    for shop_name, pdf_url in rows:
                        try:
                            # Fetch PDF bytes from storage
                            # pdf_url is the path inside 'billing-pdf' bucket
                            pdf_bytes = download_pdf_bytes(bucket="billing-pdf", path=pdf_url)
                            
                            safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                            filename = f"{safe_shop}_{month}.pdf"
                            
                            zip_file.writestr(filename, pdf_bytes)
                        except Exception as e:
                            print(f"Error zipping PDF for {shop_name}: {e}")
                            # We might want to continue or fail. Let's add a placeholder error file
                            zip_file.writestr(f"ERROR_{shop_name}.txt", f"Could not retrieve PDF: {str(e)}")

            zip_buffer.seek(0)
            
            filename = f"Billing_HQ_{month}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                },
            )


@router.get("/admin-billing/zip", deprecated=True)
def get_admin_billing_zip(
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    preview: bool = Query(default=False),
):
    """
    Download a ZIP of all frozen shop PDFs for an admin region.
    """
    month_date = parse_month(month)

    if user.role != "super_admin":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = str(user.admin_region_id)
    else:
        target_region_id = str(admin_region_id) if admin_region_id else None

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if preview:
                vat_rate = _get_vat_rate(cur, month_date)
                if target_region_id:
                    cur.execute(
                        """
                        SELECT s.id, s.name, c.name
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        JOIN delivery d ON d.shop_id = s.id
                        WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                          AND c.admin_region_id = %s
                          AND s.hq_id IS NULL
                        GROUP BY s.id, s.name, c.name
                        ORDER BY s.name
                        """,
                        (month_date, target_region_id),
                    )
                else:
                    cur.execute(
                        """
                        SELECT s.id, s.name, c.name
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        JOIN delivery d ON d.shop_id = s.id
                        WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                          AND s.hq_id IS NULL
                        GROUP BY s.id, s.name, c.name
                        ORDER BY s.name
                        """,
                        (month_date,),
                    )
                shops = cur.fetchall()
                if not shops:
                    raise HTTPException(status_code=404, detail="No deliveries for this period")

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    for shop_id, shop_name, shop_city in shops:
                        try:
                            cur.execute(
                                """
                                SELECT
                                    d.delivery_date,
                                    l.client_name,
                                    l.city_name,
                                    l.bags,
                                    f.total_price,
                                    f.share_admin_region,
                                    f.share_city
                                FROM delivery d
                                JOIN delivery_logistics l ON l.delivery_id = d.id
                                JOIN delivery_financial f ON f.delivery_id = d.id
                                WHERE d.shop_id = %s
                                  AND d.delivery_date >= %s::date
                                  AND d.delivery_date < (%s::date + INTERVAL '1 month')
                                ORDER BY d.delivery_date
                                """,
                                (shop_id, month_date, month_date),
                            )
                            deliveries = cur.fetchall()
                            if not deliveries:
                                zip_file.writestr(
                                    f"EMPTY_{shop_name}.txt",
                                    "No deliveries for this period.",
                                )
                                continue
                            invoice_rows = [
                                (
                                    delivery_date,
                                    shop_name,
                                    client_name,
                                    city_label,
                                    bags,
                                    share_admin_region,
                                )
                                for (
                                    delivery_date,
                                    client_name,
                                    city_label,
                                    bags,
                                    _total_price,
                                    share_admin_region,
                                    _share_city,
                                ) in deliveries
                            ]
                            pdf_buffer = build_recipient_invoice_pdf(
                                recipient_label="Commerce",
                                recipient_name=shop_name,
                                period_month=month_date,
                                rows=invoice_rows,
                                vat_rate=vat_rate,
                                is_preview=True,
                                payment_message=f"Facturation commerce DringDring {month_date.strftime('%Y-%m')}",
                            )
                            safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                            filename = f"{safe_shop}_{month}_PREVIEW.pdf"
                            zip_file.writestr(filename, pdf_buffer.getvalue())
                        except Exception as e:
                            zip_file.writestr(
                                f"ERROR_{shop_name}.txt",
                                f"Could not generate PDF: {str(e)}",
                            )
            else:
                if target_region_id:
                    cur.execute(
                        """
                        SELECT s.id, s.name, c.name
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        JOIN billing_period bp
                          ON bp.shop_id = s.id
                         AND bp.period_month = %s
                        WHERE c.admin_region_id = %s
                          AND s.hq_id IS NULL
                        """,
                        (month_date, target_region_id),
                    )
                else:
                    cur.execute(
                        """
                        SELECT s.id, s.name, c.name
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        JOIN billing_period bp
                          ON bp.shop_id = s.id
                         AND bp.period_month = %s
                        WHERE s.hq_id IS NULL
                        """,
                        (month_date,),
                    )
                shops = cur.fetchall()

                if not shops:
                    raise HTTPException(status_code=404, detail="No billing documents found for this period")

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    vat_rate = _get_vat_rate(cur, month_date)
                    for shop_id, shop_name, shop_city in shops:
                        try:
                            cur.execute(
                                """
                                SELECT
                                    d.delivery_date,
                                    l.client_name,
                                    l.city_name,
                                    l.bags,
                                    f.total_price,
                                    f.share_admin_region,
                                    f.share_city
                                FROM delivery d
                                JOIN delivery_logistics l ON l.delivery_id = d.id
                                JOIN delivery_financial f ON f.delivery_id = d.id
                                WHERE d.shop_id = %s
                                  AND d.delivery_date >= %s::date
                                  AND d.delivery_date < (%s::date + INTERVAL '1 month')
                                ORDER BY d.delivery_date
                                """,
                                (shop_id, month_date, month_date),
                            )
                            deliveries = cur.fetchall()
                            if not deliveries:
                                zip_file.writestr(
                                    f"EMPTY_{shop_name}.txt",
                                    "No deliveries for this period.",
                                )
                                continue
                            invoice_rows = [
                                (
                                    delivery_date,
                                    shop_name,
                                    client_name,
                                    city_label,
                                    bags,
                                    share_admin_region,
                                )
                                for (
                                    delivery_date,
                                    client_name,
                                    city_label,
                                    bags,
                                    _total_price,
                                    share_admin_region,
                                    _share_city,
                                ) in deliveries
                            ]
                            pdf_buffer = build_recipient_invoice_pdf(
                                recipient_label="Commerce",
                                recipient_name=shop_name,
                                period_month=month_date,
                                rows=invoice_rows,
                                vat_rate=vat_rate,
                                is_preview=False,
                                payment_message=f"Facturation commerce DringDring {month_date.strftime('%Y-%m')}",
                            )
                            safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                            filename = f"{safe_shop}_{month}.pdf"
                            zip_file.writestr(filename, pdf_buffer.getvalue())
                        except Exception as e:
                            zip_file.writestr(
                                f"ERROR_{shop_name}.txt",
                                f"Could not generate PDF: {str(e)}",
                            )

            zip_buffer.seek(0)
            filename = f"Billing_Admin_{month}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                },
            )


@router.get("/city-billing/zip", deprecated=True)
def get_city_billing_zip(
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    preview: bool = Query(default=False),
):
    """
    Download a ZIP of all city (commune) PDFs for an admin region.
    """
    month_date = parse_month(month)

    if user.role != "super_admin":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = str(user.admin_region_id)
    else:
        target_region_id = str(admin_region_id) if admin_region_id else None

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            vat_rate = _get_vat_rate(cur, month_date)
            if target_region_id:
                cur.execute(
                    """
                    SELECT DISTINCT c.id, c.name
                    FROM city c
                    JOIN shop s ON s.city_id = c.id
                    JOIN delivery d ON d.shop_id = s.id
                    LEFT JOIN LATERAL (
                        SELECT status
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                      AND c.admin_region_id = %s
                      AND COALESCE(st.status, '') <> 'cancelled'
                    ORDER BY c.name
                    """,
                    (month_date, target_region_id),
                )
            else:
                cur.execute(
                    """
                    SELECT DISTINCT c.id, c.name
                    FROM city c
                    JOIN shop s ON s.city_id = c.id
                    JOIN delivery d ON d.shop_id = s.id
                    LEFT JOIN LATERAL (
                        SELECT status
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                      AND COALESCE(st.status, '') <> 'cancelled'
                    ORDER BY c.name
                    """,
                    (month_date,),
                )
            cities = cur.fetchall()

            if not cities:
                raise HTTPException(status_code=404, detail="No city billing documents found for this period")

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for city_id, city_name in cities:
                    try:
                        if not preview:
                            _assert_city_period_fully_frozen(cur, city_id, month_date)
                        cur.execute(
                            """
                            SELECT
                                s.id AS shop_id,
                                s.name AS shop_name,
                                d.delivery_date,
                                l.client_name,
                                l.city_name,
                                l.bags,
                                f.total_price,
                                f.share_city,
                                f.share_admin_region
                            FROM delivery d
                            JOIN shop s ON s.id = d.shop_id
                            JOIN delivery_logistics l ON l.delivery_id = d.id
                            JOIN delivery_financial f ON f.delivery_id = d.id
                            LEFT JOIN LATERAL (
                                SELECT status
                                FROM delivery_status
                                WHERE delivery_id = d.id
                                ORDER BY updated_at DESC
                                LIMIT 1
                            ) st ON true
                            WHERE s.city_id = %s
                              AND date_trunc('month', d.delivery_date) = %s::date
                              AND COALESCE(st.status, '') <> 'cancelled'
                            ORDER BY s.name, d.delivery_date
                            """,
                            (city_id, month_date),
                        )
                        rows = cur.fetchall()
                        if not rows:
                            zip_file.writestr(
                                f"EMPTY_{city_name}.txt",
                                "No deliveries for this period.",
                            )
                            continue
                        invoice_rows = [
                            (
                                delivery_date,
                                shop_name,
                                client_name,
                                city_label,
                                bags,
                                share_city,
                            )
                            for (
                                _shop_id,
                                shop_name,
                                delivery_date,
                                client_name,
                                city_label,
                                bags,
                                _total_price,
                                share_city,
                                _share_admin_region,
                            ) in rows
                        ]
                        pdf_buffer = build_recipient_invoice_pdf(
                            recipient_label="Commune partenaire",
                            recipient_name=city_name,
                            period_month=month_date,
                            rows=invoice_rows,
                            vat_rate=vat_rate,
                            is_preview=preview,
                            payment_message=f"Facturation commune DringDring {month_date.strftime('%Y-%m')}",
                        )
                        safe_city = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in city_name)
                        filename = f"{safe_city}_{month}.pdf"
                        zip_file.writestr(filename, pdf_buffer.getvalue())
                    except Exception as exc:
                        zip_file.writestr(
                            f"ERROR_{city_name}.txt",
                            f"Could not generate PDF: {str(exc)}",
                        )

            zip_buffer.seek(0)
            filename = f"Billing_Cities_{month}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                },
            )


@router.get("/client-billing/zip", deprecated=True)
def get_client_billing_zip(
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
    preview: bool = Query(default=False),
):
    """
    Download a ZIP of client PDFs for an admin region.
    """
    month_date = parse_month(month)

    if user.role != "super_admin":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = str(user.admin_region_id)
    else:
        target_region_id = str(admin_region_id) if admin_region_id else None

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            vat_rate = _get_vat_rate(cur, month_date)
            if target_region_id:
                cur.execute(
                    """
                    SELECT DISTINCT c.id, c.name, c.address, c.postal_code, c.city_name
                    FROM client c
                    JOIN city ct ON ct.id = c.city_id
                    JOIN delivery d ON d.client_id = c.id
                    WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                      AND ct.admin_region_id = %s
                    ORDER BY c.name
                    """,
                    (month_date, target_region_id),
                )
            else:
                cur.execute(
                    """
                    SELECT DISTINCT c.id, c.name, c.address, c.postal_code, c.city_name
                    FROM client c
                    JOIN delivery d ON d.client_id = c.id
                    WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                    ORDER BY c.name
                    """,
                    (month_date,),
                )
            clients = cur.fetchall()

            if not clients:
                raise HTTPException(status_code=404, detail="No client billing documents found for this period")

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for client_id, client_name, client_address, postal_code, city_name in clients:
                    try:
                        cur.execute(
                            """
                            SELECT
                                d.delivery_date,
                                s.name AS shop_name,
                                l.bags,
                                f.total_price,
                                f.share_client
                            FROM delivery d
                            JOIN shop s ON s.id = d.shop_id
                            JOIN delivery_logistics l ON l.delivery_id = d.id
                            JOIN delivery_financial f ON f.delivery_id = d.id
                            WHERE d.client_id = %s
                              AND date_trunc('month', d.delivery_date) = %s::date
                            ORDER BY d.delivery_date
                            """,
                            (client_id, month_date),
                        )
                        rows = cur.fetchall()
                        if not rows:
                            zip_file.writestr(
                                f"EMPTY_{client_name}.txt",
                                "No deliveries for this period.",
                            )
                            continue
                        pdf_buffer = build_client_monthly_pdf(
                            client_name=client_name,
                            client_address=client_address,
                            client_postal_code=postal_code,
                            client_city=city_name,
                            period_month=month_date,
                            deliveries=rows,
                            vat_rate=vat_rate,
                            is_preview=preview,
                        )
                        safe_client = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in client_name)
                        filename = f"{safe_client}_{month}.pdf"
                        zip_file.writestr(filename, pdf_buffer.getvalue())
                    except Exception as exc:
                        zip_file.writestr(
                            f"ERROR_{client_name}.txt",
                            f"Could not generate PDF: {str(exc)}",
                        )

            zip_buffer.seek(0)
            filename = f"Billing_Clients_{month}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename=\"{filename}\"',
                },
            )


@router.get("/hq-billing")
def get_hq_billing(
    user: MeResponse = Depends(require_hq_or_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
):
    """
    HQ official billing status by shop for a single month.
    """
    try:
        month_date = parse_month(month)

        filter_clause = ""
        filter_params: list[str] = []
        amount_expr = "SUM(f.total_price)"
        if user.role == "hq":
            if not user.hq_id:
                raise HTTPException(status_code=400, detail="HQ id missing")
            filter_clause = "WHERE s.hq_id = %s"
            filter_params.append(str(user.hq_id))
            if admin_region_id:
                filter_clause += " AND c.admin_region_id = %s"
                filter_params.append(str(admin_region_id))
            amount_expr = "SUM(f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END)"
        elif user.role == "admin_region":
            if not user.admin_region_id:
                raise HTTPException(status_code=400, detail="Admin region id missing")
            filter_clause = "WHERE c.admin_region_id = %s"
            filter_params.append(str(user.admin_region_id))
        elif user.role == "super_admin" and admin_region_id:
            filter_clause = "WHERE c.admin_region_id = %s"
            filter_params.append(str(admin_region_id))

        try:
            with get_db_connection(jwt_claims) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        WITH period AS (
                            SELECT date_trunc('month', %s::date)::date AS month
                        )
                          SELECT
                              s.id AS shop_id,
                              s.name AS shop_name,
                              s.hq_id AS hq_id,
                              h.name AS hq_name,
                              c.id AS city_id,
                              c.parent_city_id AS parent_city_id,
                              c.name AS city_name,
                              ar.id AS admin_region_id,
                              ar.name AS admin_region_name,
                            COUNT(d.id) AS total_deliveries,
                            COALESCE(SUM(l.bags), 0) AS total_bags,
                            COALESCE({amount_expr}, 0) AS total_subvention_due,
                            COALESCE(SUM(f.total_price), 0) AS total_volume_chf,
                            bp.id IS NOT NULL AS is_frozen,
                            bp.frozen_at,
                            bp.frozen_by,
                            COALESCE(bp.frozen_by_name, u.email) AS frozen_by_email,
                            bp.pdf_url,
                            bp.pdf_sha256
                        FROM shop s
                        JOIN city c ON c.id = s.city_id
                        LEFT JOIN admin_region ar ON ar.id = c.admin_region_id
                        LEFT JOIN hq h ON h.id = s.hq_id
                        LEFT JOIN delivery d
                          ON d.shop_id = s.id
                         AND date_trunc('month', d.delivery_date) = (SELECT month FROM period)
                        LEFT JOIN LATERAL (
                            SELECT status
                            FROM delivery_status
                            WHERE delivery_id = d.id
                            ORDER BY updated_at DESC
                            LIMIT 1
                        ) st ON true
                        LEFT JOIN delivery_logistics l ON l.delivery_id = d.id
                        LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                        LEFT JOIN billing_period bp
                          ON bp.shop_id = s.id
                         AND bp.period_month = (SELECT month FROM period)
                        LEFT JOIN auth.users u ON u.id = bp.frozen_by
                        {filter_clause}
                        AND (d.id IS NULL OR COALESCE(st.status, '') <> 'cancelled')
                        GROUP BY
                            s.id,
                            s.name,
                            s.hq_id,
                            h.name,
                            c.id,
                            c.parent_city_id,
                            c.name,
                            ar.id,
                            ar.name,
                            bp.id,
                            bp.frozen_at,
                            bp.frozen_by,
                            bp.frozen_by_name,
                            u.email,
                            bp.pdf_url,
                            bp.pdf_sha256
                        ORDER BY c.name, s.name
                        """,
                        (month_date, *filter_params),
                    )
                    rows = _rows_to_dicts(cur)
        except Exception as exc:
            logger.exception("get_hq_billing query failed for month=%s", month)
            raise HTTPException(
                status_code=500,
                detail="HQ billing query failed",
            ) from exc

        for row in rows:
            frozen_by_id = row.pop("frozen_by", None)
            frozen_by_email = row.pop("frozen_by_email", None)
            row["frozen_by"] = (
                {"id": frozen_by_id, "email": frozen_by_email}
                if row.get("is_frozen")
                else None
            )

        return jsonable_encoder({"month": month, "rows": rows})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_hq_billing failed for month=%s", month)
        raise HTTPException(
            status_code=500,
            detail="HQ billing failed",
        ) from exc


@router.get("/hq-billing-deliveries")
def get_hq_billing_deliveries(
    user: MeResponse = Depends(require_hq_or_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
):
    """
    Returns detailed deliveries for HQ/admin billing.
    """
    month_date = parse_month(month)
    include_basket_value = user.role == "hq"

    filter_clause = ""
    filter_params: list[str] = []
    if user.role == "hq":
        if not user.hq_id:
            raise HTTPException(status_code=400, detail="HQ id missing")
        filter_clause = "AND s.hq_id = %s"
        filter_params.append(str(user.hq_id))
        if admin_region_id:
            filter_clause += " AND c.admin_region_id = %s"
            filter_params.append(str(admin_region_id))
    elif user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        filter_clause = "AND c.admin_region_id = %s"
        filter_params.append(str(user.admin_region_id))
    elif user.role == "super_admin" and admin_region_id:
        filter_clause = "AND c.admin_region_id = %s"
        filter_params.append(str(admin_region_id))

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                  SELECT
                      d.id AS delivery_id,
                      d.delivery_date,
                      s.id AS shop_id,
                      s.name AS shop_name,
                      c.id AS city_id,
                      c.name AS city_name,
                      p.id AS parent_city_id,
                      p.name AS parent_city_name,
                    l.client_name,
                    l.address,
                    l.postal_code,
                    l.city_name AS delivery_city,
                    l.bags,
                    l.is_cms,
                    CASE WHEN %s THEN l.basket_value ELSE NULL END AS basket_value,
                    l.time_window,
                    f.total_price,
                    f.share_city,
                    f.share_admin_region,
                    f.share_client,
                    (f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END) AS amount_due
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                  JOIN city c ON c.id = s.city_id
                  LEFT JOIN city p ON p.id = c.parent_city_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                LEFT JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                {filter_clause}
                ORDER BY s.name, d.delivery_date
                """,
                (include_basket_value, month_date, *filter_params),
            )
            return _rows_to_dicts(cur)


@router.get("/hq-billing-shops")
def get_hq_billing_shops(
    user: MeResponse = Depends(require_hq_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
):
    """
    HQ aggregated billing, grouped by shop.
    RLS enforces hq_id filtering.
    """
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            month_date = parse_month(month)
            cur.execute(
                """
                SELECT
                    h.name AS hq_name,
                    s.id AS shop_id,
                    s.name AS shop_name,
                    c.name AS city_name,
                    c.admin_region_id AS admin_region_id,
                    ar.name AS admin_region_name,
                    date_trunc('month', d.delivery_date)::date AS billing_month,
                    COUNT(d.id) AS total_deliveries,
                    SUM(f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END) AS total_subvention_due,
                    SUM(f.total_price) AS total_volume_chf,
                    (bp.id IS NOT NULL) AS is_frozen
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN city c ON c.id = s.city_id
                LEFT JOIN admin_region ar ON ar.id = c.admin_region_id
                LEFT JOIN hq h ON h.id = s.hq_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                LEFT JOIN billing_period bp
                  ON bp.shop_id = s.id
                 AND bp.period_month = date_trunc('month', d.delivery_date)::date
                WHERE s.hq_id = %s
                  AND date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                  AND (%s::uuid IS NULL OR c.admin_region_id = %s)
                GROUP BY
                    h.name,
                    s.id,
                    s.name,
                    c.name,
                    c.admin_region_id,
                    ar.name,
                    date_trunc('month', d.delivery_date)::date,
                    bp.id
                ORDER BY c.name, s.name
                """,
                (str(user.hq_id), month_date, admin_region_id, admin_region_id),
            )
            return _rows_to_dicts(cur)


@router.get("/shop-monthly-pdf")
def get_shop_monthly_pdf(
    shop_id: str,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    preview: bool = Query(default=False),
    user: MeResponse = Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(month)
    
    # 1. Access Control
    identity = resolve_identity(user.user_id, user.email, jwt_claims)
    
    # If Shop User: must match requested shop
    if identity.role == "shop":
        if not identity.shop_id or str(identity.shop_id) != str(shop_id):
             raise HTTPException(status_code=403, detail="Access denied to this shop")
    # If City User: must match city of shop
    elif identity.role == "city":
        if not identity.city_id:
             raise HTTPException(status_code=403, detail="City access required")
        # Optimization: We could check city match here w/ DB, but we do it below or rely on RLS logic implicitly
        # For safety let's do a quick DB check below if needed, or trust we check it when fetching shop.
    # Otherwise must be HQ/Admin
    elif identity.role not in {"hq", "admin_region", "super_admin"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.name, c.name, h.name, c.admin_region_id, s.address
                FROM shop s
                JOIN city c ON c.id = s.city_id
                LEFT JOIN hq h ON h.id = s.hq_id
                WHERE s.id = %s
                """,
                (shop_id,),
            )
            shop_row = cur.fetchone()
            if not shop_row:
                raise HTTPException(status_code=404, detail="Shop not found")

            shop_name, shop_city, hq_name, admin_region_id, shop_address = shop_row
            is_independent = hq_name is None or "indep" in (hq_name or "").lower()

            if not admin_region_id:
                raise HTTPException(status_code=400, detail="Admin region missing for shop")

            billing = _get_admin_region_billing(cur, str(admin_region_id))
            recipient_street, recipient_house_num = split_address_parts(shop_address)

            # 2. Check Exists & Frozen
            cur.execute(
                """
                SELECT
                    bp.frozen_at,
                    bp.frozen_by,
                    COALESCE(bp.frozen_by_name, u.email),
                    bp.pdf_url
                FROM billing_period bp
                LEFT JOIN auth.users u ON u.id = bp.frozen_by
                WHERE bp.shop_id = %s
                  AND bp.period_month = %s
                """,
                (shop_id, period_month),
            )
            frozen = cur.fetchone()

            # 3. Preview mode (no freeze required)
            if preview:
                cur.execute(
                    """
                    SELECT
                        d.delivery_date,
                        l.client_name,
                        l.city_name,
                        l.bags,
                        f.total_price,
                        f.share_admin_region,
                        f.share_city,
                        (f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END) AS amount_due
                    FROM delivery d
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    JOIN delivery_financial f ON f.delivery_id = d.id
                    WHERE d.shop_id = %s
                        AND d.delivery_date >= %s::date
                        AND d.delivery_date < (%s::date + INTERVAL '1 month')
                    ORDER BY d.delivery_date
                    """,
                    (shop_id, period_month, period_month),
                )
                deliveries = cur.fetchall()
                if not deliveries:
                    raise HTTPException(status_code=404, detail="No deliveries for this period")

                vat_rate = _get_vat_rate(cur, period_month)
                if is_independent:
                    reference_seed = f"SHOP_INDEP{shop_id}{period_month.strftime('%Y%m')}"
                    reference = generate_reference(billing["billing_iban"] or "", reference_seed)
                    invoice_rows = [
                        (
                            delivery_date,
                            shop_name,
                            client_name,
                            city_label,
                            bags,
                            amount_due,
                        )
                        for (
                            delivery_date,
                            client_name,
                            city_label,
                            bags,
                            _total_price,
                            _share_admin_region,
                            _share_city,
                            amount_due,
                        ) in deliveries
                    ]
                    pdf_buffer = build_recipient_invoice_pdf(
                        recipient_label="Commerce",
                        recipient_name=shop_name,
                        recipient_street=recipient_street,
                        recipient_house_num=recipient_house_num,
                        period_month=period_month,
                        rows=invoice_rows,
                        vat_rate=vat_rate,
                        is_preview=True,
                        payment_message=f"Facturation commerce DringDring {period_month.strftime('%Y-%m')}",
                        reference=reference,
                        creditor_iban=billing["billing_iban"],
                        creditor_name=billing["billing_name"],
                        creditor_street=billing["billing_street"],
                        creditor_house_num=billing["billing_house_num"],
                        creditor_postal_code=billing["billing_postal_code"],
                        creditor_city=billing["billing_city"],
                        creditor_country=billing["billing_country"],
                        logo_bytes=billing["logo_bytes"],
                    )
                    safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                    filename = f"Facture_Commerce_{safe_shop}_{month}_PREVIEW.pdf"
                else:
                    report_deliveries = [
                        (
                            delivery_date,
                            client_name,
                            city_label,
                            bags,
                            total_price,
                            share_admin_region,
                            share_city,
                        )
                        for (
                            delivery_date,
                            client_name,
                            city_label,
                            bags,
                            total_price,
                            share_admin_region,
                            share_city,
                            _amount_due,
                        ) in deliveries
                    ]
                    pdf_buffer = build_shop_monthly_pdf(
                        shop_name=shop_name,
                        shop_city=shop_city,
                        hq_name=hq_name,
                        period_month=period_month,
                        frozen_at=None,
                        frozen_by=None,
                        frozen_by_name=None,
                        deliveries=report_deliveries,
                        is_preview=True,
                    )
                    safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                    filename = f"DringDring_Shop_{safe_shop}_{month}_PREVIEW.pdf"
                return StreamingResponse(
                    pdf_buffer,
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                    },
                )

            if is_independent and frozen:
                reference_seed = f"SHOP_INDEP{shop_id}{period_month.strftime('%Y%m')}"
                reference = generate_reference(billing["billing_iban"] or "", reference_seed)
                cur.execute(
                    """
                    SELECT
                        d.delivery_date,
                        l.client_name,
                        l.city_name,
                        l.bags,
                        f.total_price,
                        f.share_admin_region,
                        f.share_city,
                        (f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END) AS amount_due
                    FROM delivery d
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    JOIN delivery_financial f ON f.delivery_id = d.id
                    WHERE d.shop_id = %s
                        AND d.delivery_date >= %s::date
                        AND d.delivery_date < (%s::date + INTERVAL '1 month')
                    ORDER BY d.delivery_date
                    """,
                    (shop_id, period_month, period_month),
                )
                deliveries = cur.fetchall()
                if not deliveries:
                    raise HTTPException(status_code=404, detail="No deliveries for this period")
                vat_rate = _get_vat_rate(cur, period_month)
                invoice_rows = [
                    (
                        delivery_date,
                        shop_name,
                        client_name,
                        city_label,
                        bags,
                        amount_due,
                    )
                    for (
                        delivery_date,
                        client_name,
                        city_label,
                        bags,
                        _total_price,
                        _share_admin_region,
                        _share_city,
                        amount_due,
                    ) in deliveries
                ]
                pdf_buffer = build_recipient_invoice_pdf(
                    recipient_label="Commerce",
                    recipient_name=shop_name,
                    recipient_street=recipient_street,
                    recipient_house_num=recipient_house_num,
                    period_month=period_month,
                    rows=invoice_rows,
                    vat_rate=vat_rate,
                    is_preview=False,
                    payment_message=f"Facturation commerce DringDring {period_month.strftime('%Y-%m')}",
                    reference=reference,
                    creditor_iban=billing["billing_iban"],
                    creditor_name=billing["billing_name"],
                    creditor_street=billing["billing_street"],
                    creditor_house_num=billing["billing_house_num"],
                    creditor_postal_code=billing["billing_postal_code"],
                    creditor_city=billing["billing_city"],
                    creditor_country=billing["billing_country"],
                    logo_bytes=billing["logo_bytes"],
                )
                safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in shop_name)
                filename = f"Facture_Commerce_{safe_shop}_{month}.pdf"
                return StreamingResponse(
                    pdf_buffer,
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f'attachment; filename=\"{filename}\"',
                    },
                )

            # 4. Serve stored PDF if available (WORM)
            if frozen and frozen[3]: # pdf_url exists
                pdf_url = frozen[3]
                # Split bucket/path if needed.
                # The storage function expects 'path' inside 'billing-pdf' bucket if we hardcode bucket?
                # Actually upload_pdf_bytes used bucket="billing-pdf".
                # pdf_url stored was just the path "shop/{id}/{month}.pdf".
                try:
                    pdf_bytes = download_pdf_bytes(bucket="billing-pdf", path=pdf_url)

                    filename = f"DringDring_Shop_{shop_id}_{month}_FROZEN.pdf" # Fallback name
                    # We could try to fetch shop name for better filename,
                    # but for performance/simplicity ID is fine or we do one more query.
                    # Let's do one more query for nice filename if we want.
                    cur.execute("SELECT name FROM shop WHERE id = %s", (shop_id,))
                    srow = cur.fetchone()
                    if srow:
                        safe_shop = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in srow[0])
                        filename = f"DringDring_Shop_{safe_shop}_{month}_FROZEN.pdf"

                    return StreamingResponse(
                        io.BytesIO(pdf_bytes),
                        media_type="application/pdf",
                        headers={
                            "Content-Disposition": f'attachment; filename="{filename}"',
                        },
                    )
                except Exception as e:
                    # Fallback or Error?
                    # If it's frozen but file missing, that's critical data loss -> 500
                    print(f"Error downloading WORM PDF: {e}")
                    raise HTTPException(status_code=500, detail="Stored PDF not found")

            # 5. Enforce WORM if not preview
            if frozen and not frozen[3]:
                raise HTTPException(status_code=500, detail="WORM Violation: Period frozen but PDF missing from storage record.")

            raise HTTPException(
                status_code=409,
                detail="Billing period not frozen (No Official PDF)",
            )


@router.get("/hq-monthly-pdf")
def get_hq_monthly_pdf(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    user: MeResponse = Depends(require_hq_or_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    hq_id: str | None = Query(default=None),
    admin_region_id: str | None = Query(default=None),
    allow_unfrozen: bool = Query(default=False),
):
    period_month = parse_month(month)

    filter_clause_parts: list[str] = []
    filter_params: list[str] = []
    hq_target_id: str | None = None
    region_target_id: str | None = None
    if user.role == "hq":
        if not user.hq_id:
            raise HTTPException(status_code=400, detail="HQ id missing")
        hq_target_id = str(user.hq_id)
        filter_clause_parts.append("AND s.hq_id = %s")
        filter_params.append(hq_target_id)
        if admin_region_id:
            region_target_id = str(admin_region_id)
            filter_clause_parts.append("AND c.admin_region_id = %s")
            filter_params.append(region_target_id)
    elif user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        if not hq_id:
            raise HTTPException(status_code=400, detail="HQ id required")
        hq_target_id = str(hq_id)
        region_target_id = str(user.admin_region_id)
        filter_clause_parts.append("AND s.hq_id = %s")
        filter_clause_parts.append("AND c.admin_region_id = %s")
        filter_params.append(hq_target_id)
        filter_params.append(region_target_id)
    elif user.role == "super_admin":
        if not hq_id:
            raise HTTPException(status_code=400, detail="HQ id required")
        hq_target_id = str(hq_id)
        filter_clause_parts.append("AND s.hq_id = %s")
        filter_params.append(hq_target_id)
        if admin_region_id:
            region_target_id = str(admin_region_id)
            filter_clause_parts.append("AND c.admin_region_id = %s")
            filter_params.append(region_target_id)

    vat_rate = Decimal("0.081")
    delivery_rows: list[tuple] = []
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if not hq_target_id:
                raise HTTPException(status_code=400, detail="HQ id missing")

            if not region_target_id:
                cur.execute(
                    """
                    SELECT DISTINCT c.admin_region_id
                    FROM shop s
                    JOIN city c ON c.id = s.city_id
                    WHERE s.hq_id = %s
                    """,
                    (hq_target_id,),
                )
                admin_region_rows = cur.fetchall()
                if not admin_region_rows:
                    raise HTTPException(status_code=404, detail="HQ not found")
                if len(admin_region_rows) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="HQ spans multiple regions; admin_region_id required",
                    )
                region_target_id = str(admin_region_rows[0][0])

            billing = _get_admin_region_billing(cur, region_target_id)

            cur.execute(
                f"""
                SELECT
                    h.name AS hq_name,
                    s.id AS shop_id,
                    s.name AS shop_name,
                    c.name AS city_name,
                    COUNT(d.id) AS total_deliveries,
                    COALESCE(
                        SUM(
                            f.share_admin_region
                            + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END
                        ),
                        0
                    ) AS total_hq_due,
                    BOOL_OR(bp.id IS NOT NULL) AS is_frozen
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN city c ON c.id = s.city_id
                LEFT JOIN hq h ON h.id = s.hq_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                LEFT JOIN billing_period bp
                  ON bp.shop_id = s.id
                 AND bp.period_month = date_trunc('month', d.delivery_date)::date
                WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                {" ".join(filter_clause_parts)}
                GROUP BY h.name, s.id, s.name, c.name
                ORDER BY s.name
                """,
                (period_month, *filter_params),
            )
            rows = cur.fetchall()
            vat_rate = _get_vat_rate(cur, period_month)

            cur.execute(
                f"""
                SELECT
                    d.delivery_date,
                    s.name AS shop_name,
                    l.client_name,
                    c.name AS city_name,
                    l.bags,
                    (f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END) AS amount_due
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN city c ON c.id = s.city_id
                LEFT JOIN hq h ON h.id = s.hq_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                {" ".join(filter_clause_parts)}
                ORDER BY s.name, d.delivery_date
                """,
                (period_month, *filter_params),
            )
            delivery_rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No data for this period")

    has_unfrozen = any(not row[6] for row in rows)
    if has_unfrozen and not allow_unfrozen:
        raise HTTPException(
            status_code=409,
            detail="One or more shops are not frozen for this period",
        )

    if not delivery_rows:
        raise HTTPException(status_code=404, detail="No deliveries for this period")

    hq_name = rows[0][0] or "Groupe HQ"
    invoice_rows = [
        (
            delivery_date,
            shop_name,
            client_name,
            city_name,
            bags,
            amount_due,
        )
        for (
            delivery_date,
            shop_name,
            client_name,
            city_name,
            bags,
            amount_due,
        ) in delivery_rows
    ]

    reference_seed = f"HQ{hq_target_id}{region_target_id}{period_month.strftime('%Y%m')}"
    reference = generate_reference(billing["billing_iban"] or "", reference_seed)

    pdf_buffer = build_recipient_invoice_pdf(
        recipient_label="HQ",
        recipient_name=hq_name,
        period_month=period_month,
        rows=invoice_rows,
        vat_rate=vat_rate,
        is_preview=has_unfrozen or allow_unfrozen,
        payment_message=f"Facturation HQ DringDring {period_month.strftime('%Y-%m')}",
        reference=reference,
        creditor_iban=billing["billing_iban"],
        creditor_name=billing["billing_name"],
        creditor_street=billing["billing_street"],
        creditor_house_num=billing["billing_house_num"],
        creditor_postal_code=billing["billing_postal_code"],
        creditor_city=billing["billing_city"],
        creditor_country=billing["billing_country"],
        logo_bytes=billing["logo_bytes"],
    )

    safe_hq = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in hq_name)
    suffix = "PROVISIONNEL" if (has_unfrozen or allow_unfrozen) else "FROZEN"
    filename = f"Facture_HQ_{safe_hq}_{month}_{suffix}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/city-monthly-pdf")
def get_city_monthly_pdf(
    city_id: str,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    preview: bool = Query(default=False),
    user=Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    identity = resolve_identity(
        user_id=user.user_id,
        email=user.email,
        jwt_claims=jwt_claims,
    )
    if identity.role == "city":
        if not identity.city_id or str(identity.city_id) != str(city_id):
            raise HTTPException(
                status_code=403,
                detail="City access required",
            )
    elif identity.role not in {"hq", "admin_region", "super_admin"}:
        raise HTTPException(
            status_code=403,
            detail="City access required",
        )

    period_month = parse_month(month)

    vat_rate = Decimal("0.081")
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if not preview:
                _assert_city_period_fully_frozen(cur, city_id, period_month)

            cur.execute(
                """
                SELECT name, admin_region_id, address
                FROM city
                WHERE id = %s
                """,
                (city_id,),
            )
            city_row = cur.fetchone()
            if not city_row:
                raise HTTPException(status_code=404, detail="City not found")
            city_name, admin_region_id, city_address = city_row

            if not admin_region_id:
                raise HTTPException(status_code=400, detail="Admin region missing for city")

            billing = _get_admin_region_billing(cur, str(admin_region_id))

            cur.execute(
                """
                SELECT
                    s.id AS shop_id,
                    s.name AS shop_name,
                    d.delivery_date,
                    l.client_name,
                    l.city_name,
                    l.bags,
                    f.total_price,
                    f.share_city,
                    f.share_admin_region
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN delivery_logistics l ON l.delivery_id = d.id
                JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE s.city_id = %s
                  AND date_trunc('month', d.delivery_date) = %s::date
                  AND COALESCE(st.status, '') <> 'cancelled'
                ORDER BY s.name, d.delivery_date
                """,
                (city_id, period_month),
            )
            rows = cur.fetchall()
            vat_rate = _get_vat_rate(cur, period_month)

    if not rows:
        raise HTTPException(status_code=404, detail="No deliveries for this period")

    invoice_rows = [
        (
            delivery_date,
            shop_name,
            client_name,
            city_label,
            bags,
            share_city,
        )
        for (
            _shop_id,
            shop_name,
            delivery_date,
            client_name,
            city_label,
            bags,
            _total_price,
            share_city,
            _share_admin_region,
        ) in rows
    ]

    reference_seed = f"COMMUNE{city_id}{period_month.strftime('%Y%m')}"
    reference = generate_reference(billing["billing_iban"] or "", reference_seed)
    city_postal_code, city_only_name = _extract_postal_city_from_address(city_address)
    city_street, city_house_num = split_address_parts(city_address)

    pdf_buffer = build_recipient_invoice_pdf(
        recipient_label="Commune partenaire",
        recipient_name=city_name,
        period_month=period_month,
        rows=invoice_rows,
        vat_rate=vat_rate,
        is_preview=preview,
        recipient_street=city_street,
        recipient_house_num=city_house_num,
        recipient_postal_code=city_postal_code,
        recipient_city=city_only_name,
        payment_message=f"Facturation commune DringDring {period_month.strftime('%Y-%m')}",
        reference=reference,
        creditor_iban=billing["billing_iban"],
        creditor_name=billing["billing_name"],
        creditor_street=billing["billing_street"],
        creditor_house_num=billing["billing_house_num"],
        creditor_postal_code=billing["billing_postal_code"],
        creditor_city=billing["billing_city"],
        creditor_country=billing["billing_country"],
        logo_bytes=billing["logo_bytes"],
    )

    safe_city = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in city_name)
    suffix = "PROVISIONNEL" if preview else "FROZEN"
    filename = f"Facture_Commune_{safe_city}_{month}_{suffix}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/city-billing/export")
def export_city_billing(
    user: MeResponse = Depends(require_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            month_date = parse_month(month)
            cur.execute(
                """
                SELECT * FROM view_city_billing_shops
                WHERE date_trunc('month', billing_month) = date_trunc('month', %s::date)
                """,
                (month_date,),
            )
            return _export_csv(
                cur,
                export_columns=[
                    "shop_name",
                    "city_name",
                    "billing_month",
                    "total_deliveries",
                    "total_subvention_due",
                    "total_volume_chf",
                ],
                column_labels={
                    "shop_name": "Commerce",
                    "city_name": "Commune partenaire",
                    "billing_month": "Periode",
                    "total_deliveries": "Livraisons",
                    "total_subvention_due": "Subvention (CHF)",
                    "total_volume_chf": "Total CHF",
                },
                filename_base="facturation-commune",
                month_column="billing_month",
            )


@router.get("/shop-periods")
def list_shop_periods_report(
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


@router.get("/shop-export")
def export_shop_deliveries_report(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    period_month = parse_month(month)

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


@router.get("/hq-billing/export")
def export_hq_billing(
    user: MeResponse = Depends(require_hq_or_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    admin_region_id: str | None = Query(default=None),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            month_date = parse_month(month)

            filter_clause = ""
            filter_params: list[str] = []
            amount_expr = "SUM(f.share_city + f.share_admin_region)"

            if user.role == "hq":
                if not user.hq_id:
                    raise HTTPException(status_code=400, detail="HQ id missing")
                filter_clause = "AND s.hq_id = %s"
                filter_params.append(str(user.hq_id))
                if admin_region_id:
                    filter_clause += " AND c.admin_region_id = %s"
                    filter_params.append(str(admin_region_id))
                amount_expr = "SUM(f.share_admin_region + CASE WHEN l.is_cms THEN 0 ELSE COALESCE(f.share_client, 0) END)"
            elif user.role == "admin_region":
                if not user.admin_region_id:
                    raise HTTPException(status_code=400, detail="Admin region id missing")
                filter_clause = "AND c.admin_region_id = %s"
                filter_params.append(str(user.admin_region_id))
            elif user.role == "super_admin" and admin_region_id:
                filter_clause = "AND c.admin_region_id = %s"
                filter_params.append(str(admin_region_id))

            cur.execute(
                f"""
                SELECT
                    s.name AS shop_name,
                    c.name AS city_name,
                    date_trunc('month', d.delivery_date)::date AS billing_month,
                    COUNT(d.id) AS total_deliveries,
                    COALESCE({amount_expr}, 0) AS total_subvention_due,
                    COALESCE(SUM(f.total_price), 0) AS total_volume_chf
                FROM delivery d
                JOIN shop s ON s.id = d.shop_id
                JOIN city c ON c.id = s.city_id
                JOIN delivery_financial f ON f.delivery_id = d.id
                LEFT JOIN LATERAL (
                    SELECT status
                    FROM delivery_status
                    WHERE delivery_id = d.id
                    ORDER BY updated_at DESC
                    LIMIT 1
                ) st ON true
                WHERE date_trunc('month', d.delivery_date) = date_trunc('month', %s::date)
                  AND COALESCE(st.status, '') <> 'cancelled'
                {filter_clause}
                GROUP BY
                    s.name,
                    c.name,
                    date_trunc('month', d.delivery_date)::date
                ORDER BY c.name, s.name
                """,
                (month_date, *filter_params),
            )
            return _export_csv(
                cur,
                export_columns=[
                    "shop_name",
                    "city_name",
                    "billing_month",
                    "total_deliveries",
                    "total_subvention_due",
                    "total_volume_chf",
                ],
                column_labels={
                    "shop_name": "Commerce",
                    "city_name": "Commune partenaire",
                    "billing_month": "Periode",
                    "total_deliveries": "Livraisons",
                    "total_subvention_due": "Montant du (CHF)",
                    "total_volume_chf": "Total CHF",
                },
                filename_base="facturation-groupe",
                month_column="billing_month",
            )


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


def _assert_city_period_fully_frozen(cur, city_id: str, period_month: date) -> None:
    cur.execute(
        """
        SELECT
            COUNT(*) AS total,
            COUNT(bp.shop_id) AS frozen
        FROM shop s
        LEFT JOIN billing_period bp
          ON bp.shop_id = s.id
         AND bp.period_month = %s
        WHERE s.city_id = %s
        """,
        (period_month, city_id),
    )
    total, frozen = cur.fetchone()

    if total == 0:
        raise HTTPException(status_code=404, detail="No shops for this city")

    if total != frozen:
        raise HTTPException(
            status_code=409,
            detail="Not all shops are frozen for this period",
        )


def _export_csv(cur, export_columns, column_labels, filename_base, month_column=None):
    columns = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([column_labels.get(col, col) for col in export_columns])

    for row in rows:
        row_dict = dict(zip(columns, row))
        csv_row = []
        for col in export_columns:
            csv_row.append(_csv_value(row_dict.get(col)))
        writer.writerow(csv_row)

    filename = _build_filename(filename_base, rows, columns, month_column)
    response = Response(content=output.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


def _csv_value(value):
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _build_filename(filename_base, rows, columns, month_column):
    suffix = None
    if rows and month_column:
        row_dicts = [dict(zip(columns, row)) for row in rows]
        months = [_format_month(row.get(month_column)) for row in row_dicts]
        months = [value for value in months if value]
        if months:
            suffix = sorted(months)[-1]
    if suffix:
        return f"{filename_base}-{suffix}.csv"
    return f"{filename_base}.csv"


def _format_month(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m")
    if isinstance(value, date):
        return value.strftime("%Y-%m")
    try:
        as_text = str(value)
    except Exception:
        return ""
    if len(as_text) >= 7:
        return as_text[:7]
    return ""




def _extract_postal_city_from_address(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    matches = re.findall(r"(\d{4})\s+([^\n,]+)$", value.strip(), flags=re.MULTILINE)
    if not matches:
        return None, None
    postal_code, city = matches[-1]
    city_clean = city.strip()
    city_clean = re.sub(r"^(ville|commune)\s+de\s+", "", city_clean, flags=re.IGNORECASE)
    if " - " in city_clean:
        city_clean = city_clean.split(" - ", 1)[0].strip()
    return (postal_code.strip() or None, city_clean or None)


def _get_admin_region_billing(cur, admin_region_id: str) -> dict:
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
            billing_logo_path,
            address,
            name
        FROM admin_region
        WHERE id = %s
        """,
        (admin_region_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Admin region not found")

    (
        billing_name,
        billing_iban,
        billing_street,
        billing_house_num,
        billing_postal_code,
        billing_city,
        billing_country,
        billing_logo_path,
        admin_region_address,
        admin_region_name,
    ) = row

    if billing_street is None and admin_region_address:
        billing_street, billing_house_num = split_address_parts(admin_region_address)

    if not billing_name:
        billing_name = admin_region_name
    if not billing_country:
        billing_country = "CH"

    logo_bytes = None
    if billing_logo_path:
        try:
            logo_bytes = download_file_bytes(bucket="billing-logos", path=billing_logo_path)
        except RuntimeError:
            logo_bytes = None

    return {
        "billing_name": billing_name,
        "billing_iban": billing_iban,
        "billing_street": billing_street,
        "billing_house_num": billing_house_num,
        "billing_postal_code": billing_postal_code,
        "billing_city": billing_city,
        "billing_country": billing_country,
        "logo_bytes": logo_bytes,
    }


