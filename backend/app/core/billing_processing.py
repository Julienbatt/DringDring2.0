from datetime import date, datetime, timezone
import hashlib
import logging
from fastapi import HTTPException

from app.db.session import get_db_connection
from app.pdf.invoice_qr_bill import build_recipient_invoice_with_qr_bill
from app.pdf.shop_monthly_report import build_shop_monthly_pdf
from app.storage.supabase_storage import upload_pdf_bytes, download_file_bytes
from app.core.billing_reference import generate_reference
from app.core.utils import split_address_parts
from app.core.vat import get_vat_rate

logger = logging.getLogger(__name__)


def freeze_shop_billing_period(
    cur,
    shop_id: str,
    period_month: date,
    frozen_by_user_id: str,
    frozen_by_email: str,
    frozen_comment: str | None = None,
):
    """
    Core logic to freeze a billing period for a shop.
    Generates the PDF, uploads it, and inserts/updates the billing_period record.
    Must be called within an active transaction cursor `cur`.
    """
    # 1. Check if already frozen
    cur.execute(
        """
        SELECT 1
        FROM billing_period
        WHERE shop_id = %s
          AND period_month = %s
        """,
        (shop_id, period_month),
    )
    if cur.fetchone():
        # Already frozen, we can choose to return existing or raise.
        # For bulk ops, better to skip or be idempotent.
        # Here we raise to matching existing behavior, or caller handles check.
        raise HTTPException(status_code=409, detail="Already frozen")

    # 2. Fetch Shop Data (with address for QR bill)
    cur.execute(
        """
        SELECT
            s.name,
            c.name,
            h.name,
            s.address,
            cpc.postal_code,
            c.admin_region_id,
            ar.billing_name,
            ar.billing_iban,
            ar.billing_street,
            ar.billing_house_num,
            ar.billing_postal_code,
            ar.billing_city,
            ar.billing_country,
            ar.address,
            ar.billing_logo_path
        FROM shop s
        JOIN city c ON c.id = s.city_id
        LEFT JOIN hq h ON h.id = s.hq_id
        JOIN admin_region ar ON ar.id = c.admin_region_id
        LEFT JOIN LATERAL (
            SELECT postal_code
            FROM city_postal_code cpc
            WHERE cpc.city_id = c.id
            ORDER BY postal_code
            LIMIT 1
        ) cpc ON true
        WHERE s.id = %s
        """,
        (shop_id,),
    )
    shop_row = cur.fetchone()
    if not shop_row:
        raise HTTPException(status_code=404, detail="Shop not found")
    (
        shop_name,
        shop_city,
        hq_name,
        shop_address,
        shop_postal_code,
        _admin_region_id,
        billing_name,
        billing_iban,
        billing_street,
        billing_house_num,
        billing_postal_code,
        billing_city,
        billing_country,
        admin_region_address,
        billing_logo_path,
    ) = shop_row

    logo_bytes = None
    if billing_logo_path:
        try:
            logo_bytes = download_file_bytes(bucket="billing-logos", path=billing_logo_path)
        except RuntimeError:
            logo_bytes = None

    if billing_street is None and admin_region_address:
        billing_street, billing_house_num = split_address_parts(admin_region_address)
    has_billing_override = (
        billing_name
        and billing_iban
        and billing_postal_code
        and billing_city
    )

    # 3. Fetch Deliveries
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
        (shop_id, period_month, period_month),
    )
    deliveries = cur.fetchall()
    if not deliveries:
        # Cannot freeze empty period? Or logic says "No deliveries for this period"
        raise HTTPException(
            status_code=400,
            detail="No deliveries for this period",
        )

    # 4. Global Frozen TS
    frozen_at = datetime.now(timezone.utc)

    # 5. Build PDF
    is_independent = hq_name is None or "indep" in hq_name.lower()
    if is_independent:
        vat_rate = float(get_vat_rate(cur, period_month))

        invoice_rows = [
            (
                delivery_date,
                shop_name,
                client_name,
                city_name,
                bags,
                share_admin_region,
            )
            for (
                delivery_date,
                client_name,
                city_name,
                bags,
                _total_price,
                share_admin_region,
                _share_city,
            ) in deliveries
        ]
        
        reference_seed = f"{period_month.strftime('%Y%m')}{shop_id}"
        reference = generate_reference(billing_iban or "", reference_seed)
        
        # Use new Swiss QR Bill compliant invoice
        pdf_buffer = build_recipient_invoice_with_qr_bill(
            recipient_label="Commerce",
            recipient_name=shop_name,
            recipient_street=shop_address,
            recipient_postal_code=shop_postal_code,
            recipient_city=shop_city,
            period_month=period_month,
            rows=invoice_rows,
            vat_rate=vat_rate,
            is_preview=False,
            payment_message=f"Facturation commerce DringDring {period_month.strftime('%Y-%m')}",
            reference=reference,
            creditor_iban=billing_iban if has_billing_override else None,
            creditor_name=billing_name if has_billing_override else None,
            creditor_street=billing_street if has_billing_override else None,
            creditor_house_num=billing_house_num if has_billing_override else None,
            creditor_postal_code=billing_postal_code if has_billing_override else None,
            creditor_city=billing_city if has_billing_override else None,
            creditor_country=billing_country if has_billing_override else None,
            logo_bytes=logo_bytes,
        )
    else:
        pdf_buffer = build_shop_monthly_pdf(
            shop_name=shop_name,
            shop_city=shop_city,
            hq_name=hq_name,
            period_month=period_month,
            frozen_at=frozen_at,
            frozen_by=frozen_by_user_id,
            frozen_by_name=frozen_by_email,
            deliveries=deliveries,
        )
    pdf_bytes = pdf_buffer.getvalue()
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    
    # Format: YYYY-MM
    month_str = period_month.strftime("%Y-%m")
    pdf_path = f"shop/{shop_id}/{month_str}.pdf"

    # 6. Upload
    try:
        upload_pdf_bytes(
            bucket="billing-pdf",
            path=pdf_path,
            data=pdf_bytes,
        )
    except RuntimeError as exc:
        logger.exception("freeze_shop_billing_period PDF upload failed for shop_id=%s", shop_id)
        raise HTTPException(
            status_code=502,
            detail="PDF upload failed",
        ) from exc

    # 7. Insert Record
    cur.execute(
        """
        INSERT INTO billing_period (
            shop_id,
            period_month,
            frozen_at,
            frozen_by,
            frozen_by_name,
            pdf_url,
            pdf_sha256,
            pdf_generated_at,
            frozen_comment
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (shop_id, period_month) DO NOTHING
        """,
        (
            shop_id,
            period_month,
            frozen_at,
            frozen_by_user_id,
            frozen_by_email,
            pdf_path,
            pdf_hash,
            frozen_at,
            frozen_comment,
        ),
    )

    return {"status": "frozen", "pdf_path": pdf_path, "pdf_sha256": pdf_hash}
