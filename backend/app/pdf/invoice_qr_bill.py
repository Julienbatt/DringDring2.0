"""
Enhanced invoice report builder with Swiss QR Bill support.

This module provides invoice generation with strict Swiss QR Bill compliance.
"""

from datetime import date
import re
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfgen import canvas as pdf_canvas

from app.pdf.logo import build_logo_flowables, build_logo_image
from app.pdf.swiss_qr_renderer import render_swiss_qr_bill
from app.core.config import settings

_POSTAL_CITY_RE = re.compile(r"\b(?P<postal>\d{4})\s+(?P<city>.+)$")
_STREET_NUM_RE = re.compile(r"^(?P<street>.+?)\s+(?P<num>\d+[A-Za-z0-9/\-]*)$")


def _normalize_city_for_qr(value: str | None) -> str | None:
    city = (value or "").strip()
    if not city:
        return None
    city = re.sub(r"^\d{4}\s+", "", city)
    if " - " in city:
        city = city.split(" - ", 1)[0].strip()
    return city[:35].rstrip() or None


def _limit_for_qr(value: str | None, max_len: int) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    return text[:max_len].rstrip()


def build_recipient_invoice_with_qr_bill(
    *,
    recipient_label: str,
    recipient_name: str,
    recipient_street: str | None = None,
    recipient_house_num: str | None = None,
    recipient_postal_code: str | None = None,
    recipient_city: str | None = None,
    period_month: date,
    rows: list[tuple],
    vat_rate: Decimal | int | float | str | None = None,
    is_preview: bool = False,
    payment_message: str | None = None,
    reference: str | None = None,
    creditor_iban: str | None = None,
    creditor_name: str | None = None,
    creditor_street: str | None = None,
    creditor_house_num: str | None = None,
    creditor_postal_code: str | None = None,
    creditor_city: str | None = None,
    creditor_country: str | None = None,
    logo_bytes: bytes | None = None,
) -> BytesIO:
    """
    Build a recipient invoice PDF with Swiss QR Bill payment section.
    
    This function generates a professional invoice with:
    - Header with logo and invoice details
    - Itemized delivery table
    - Totals with VAT breakdown
    - Swiss QR Bill payment section (SIX compliant)
    
    Args:
        recipient_label: Type of recipient (e.g., "Commerce", "HQ", "Commune")
        recipient_name: Name of the recipient
        recipient_street: Street name (for QR bill debtor)
        recipient_house_num: House number (for QR bill debtor)
        recipient_postal_code: Postal code (for QR bill debtor)
        recipient_city: City (for QR bill debtor)
        period_month: Billing period (first day of month)
        rows: List of delivery rows (date, shop, client, city, bags, amount)
        vat_rate: VAT rate (default: 0.081)
        is_preview: Whether this is a preview (non-frozen period)
        payment_message: Custom payment message
        reference: Payment reference number
        
    Returns:
        BytesIO buffer containing the PDF
    """
    buffer = BytesIO()
    
    # Reserve space for the QR bill only on the final page.
    qr_bill_height = 105 * mm + 5 * mm
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    
    styles = getSampleStyleSheet()
    note_heading_style = ParagraphStyle(
        "note_heading",
        parent=styles["Heading3"],
        fontSize=9,
        leading=11,
        spaceAfter=2,
    )
    note_style = ParagraphStyle(
        "note",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
    note_italic_style = ParagraphStyle(
        "note_italic",
        parent=styles["Italic"],
        fontSize=8,
        leading=10,
    )
    address_style = ParagraphStyle(
        "recipient_address",
        parent=styles["Normal"],
        fontSize=9,
        leading=11,
    )
    elements: list = []
    
    # Header with left (default) and right (regional) logos.
    left_logo = build_logo_image(width_cm=3.6)
    right_logo = build_logo_image(width_cm=6.6, logo_bytes=logo_bytes) if logo_bytes else None
    left_logo_max_height = 2.1 * cm
    right_logo_max_height = 2.9 * cm
    if left_logo and left_logo.drawHeight > left_logo_max_height:
        scale = left_logo_max_height / left_logo.drawHeight
        left_logo.drawHeight = left_logo_max_height
        left_logo.drawWidth = left_logo.drawWidth * scale
    if right_logo and right_logo.drawHeight > right_logo_max_height:
        scale = right_logo_max_height / right_logo.drawHeight
        right_logo.drawHeight = right_logo_max_height
        right_logo.drawWidth = right_logo.drawWidth * scale
    logo_row_height = max(
        left_logo.drawHeight if left_logo else 0,
        right_logo.drawHeight if right_logo else 0,
    )
    left_col_width = doc.width * 0.55
    right_col_width = doc.width * 0.45
    if left_logo and right_logo:
        left_logo.hAlign = "LEFT"
        right_logo.hAlign = "RIGHT"
        logo_table = Table(
            [[left_logo, right_logo]],
            colWidths=[left_col_width, right_col_width],
            rowHeights=[logo_row_height],
        )
        logo_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("BOX", (0, 0), (-1, -1), 0, colors.white),
                    ("INNERGRID", (0, 0), (-1, -1), 0, colors.white),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        elements.append(logo_table)
        elements.append(Spacer(1, 10))
    elif left_logo:
        elements.extend([left_logo, Spacer(1, 12)])
    elif right_logo:
        right_logo.hAlign = "RIGHT"
        elements.extend([right_logo, Spacer(1, 12)])
    else:
        elements.extend(build_logo_flowables())

    recipient_street_value = recipient_street
    recipient_house_num_value = recipient_house_num
    recipient_postal_code_value = recipient_postal_code
    recipient_city_value = recipient_city

    if recipient_street_value:
        match = _POSTAL_CITY_RE.search(recipient_street_value)
        if match:
            extracted_postal = match.group("postal").strip()
            extracted_city = match.group("city").strip()
            recipient_street_value = recipient_street_value[:match.start()].strip().rstrip(",")
            if not recipient_postal_code_value:
                recipient_postal_code_value = extracted_postal
            if not recipient_city_value:
                recipient_city_value = extracted_city

    if recipient_street_value and not recipient_house_num_value:
        match = _STREET_NUM_RE.match(recipient_street_value.strip())
        if match:
            recipient_street_value = match.group("street").strip()
            recipient_house_num_value = match.group("num").strip()

    recipient_street_value = _limit_for_qr(recipient_street_value, 35)
    recipient_house_num_value = _limit_for_qr(recipient_house_num_value, 16)
    recipient_postal_code_value = _limit_for_qr(recipient_postal_code_value, 16)
    recipient_city_value = _normalize_city_for_qr(recipient_city_value)

    recipient_lines = [recipient_name]
    recipient_street_line = None
    if recipient_street_value:
        recipient_street_line = recipient_street_value
        if recipient_house_num_value:
            recipient_street_line = f"{recipient_street_value} {recipient_house_num_value}"
    if recipient_street_line:
        recipient_lines.append(recipient_street_line)
    recipient_city_line = None
    if recipient_postal_code_value or recipient_city_value:
        recipient_city_line = f"{recipient_postal_code_value or ''} {recipient_city_value or ''}".strip()
    if recipient_city_line:
        recipient_lines.append(recipient_city_line)

    if recipient_lines:
        recipient_html = "<br/>".join(recipient_lines)
        address_table = Table(
            [["", Paragraph(recipient_html, address_style)]],
            colWidths=[left_col_width, right_col_width],
        )
        address_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        elements.append(address_table)
        elements.append(Spacer(1, 10))

    elements.append(Paragraph("<b>Facture mensuelle</b>", styles["Heading2"]))
    elements.append(
        Paragraph(
            f"Periode : {period_month.strftime('%B %Y')}",
            styles["Normal"],
        )
    )
    
    status_label = "PERIODE NON GELEE (PREVIEW)" if is_preview else "PERIODE GELEE"
    elements.append(Paragraph(f"<b>Statut :</b> {status_label}", styles["Normal"]))
    elements.append(Spacer(1, 12))
    
    # Delivery table
    table_text_style = ParagraphStyle(
        "table_text",
        parent=styles["Normal"],
        fontSize=8,
        leading=9,
    )
    table_header_style = ParagraphStyle(
        "table_header",
        parent=styles["Normal"],
        fontSize=8,
        leading=9,
    )
    table_data = [
        [
            Paragraph("<b>Date</b>", table_header_style),
            Paragraph("<b>Commerce</b>", table_header_style),
            Paragraph("<b>Client</b>", table_header_style),
            Paragraph("<b>Commune partenaire</b>", table_header_style),
            Paragraph("<b>Sacs</b>", table_header_style),
            Paragraph("<b>Montant du (CHF)</b>", table_header_style),
        ]
    ]
    
    total_due = Decimal("0.00")
    
    for (
        delivery_date,
        shop_name,
        client_name,
        commune_name,
        bags,
        amount_due,
    ) in rows:
        due_value = Decimal(str(amount_due or 0))
        total_due += due_value
        
        table_data.append(
            [
                delivery_date.strftime("%d.%m.%Y"),
                Paragraph(shop_name or "", table_text_style),
                Paragraph(client_name or "", table_text_style),
                Paragraph(commune_name or "", table_text_style),
                str(bags or 0),
                f"{due_value:.2f}",
            ]
        )

    table_col_widths = [
        doc.width * 0.14,
        doc.width * 0.30,
        doc.width * 0.20,
        doc.width * 0.18,
        doc.width * 0.06,
        doc.width * 0.12,
    ]
    table = Table(table_data, repeatRows=1, colWidths=table_col_widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (4, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 10))

    totals_block: list = []
    totals_block.append(Paragraph("<b>Totaux</b>", styles["Heading3"]))

    if vat_rate:
        vat_rate_decimal = Decimal(str(vat_rate))
        divisor = Decimal("1.00") + vat_rate_decimal
        amount_ht = (total_due / divisor).quantize(Decimal("0.01"))
        vat_amount = (total_due - amount_ht).quantize(Decimal("0.01"))
        totals_block.append(
            Paragraph(
                f"Montant HT : CHF {amount_ht:.2f}",
                styles["Normal"],
            )
        )
        totals_block.append(
            Paragraph(
                f"TVA ({vat_rate_decimal * 100:.1f}%) : CHF {vat_amount:.2f}",
                styles["Normal"],
            )
        )

    totals_block.append(
        Paragraph(
            f"<b>Montant total TTC : CHF {total_due:.2f}</b>",
            styles["Normal"],
        )
    )
    totals_block.append(Spacer(1, 8))
    totals_block.append(Paragraph("<b>Informations de paiement</b>", note_heading_style))
    totals_block.append(
        Paragraph(
            "Veuillez utiliser le bulletin de versement QR en bas de page pour effectuer le paiement.",
            note_style,
        )
    )

    if is_preview:
        totals_block.append(Spacer(1, 6))
        totals_block.append(
            Paragraph(
                "<i>Document provisoire (periode non gelee). "
                "Les montants peuvent evoluer.</i>",
                note_italic_style,
            )
        )
    else:
        totals_block.append(Spacer(1, 6))
        totals_block.append(
            Paragraph(
                "<i>Ce document est genere automatiquement par DringDring a partir "
                "de donnees gelees. Toute modification ulterieure est impossible.</i>",
                note_italic_style,
            )
        )

    elements.append(KeepTogether(totals_block))
    
    # Build main content
    def add_qr_bill(canvas):
        """Add Swiss QR Bill to the bottom of the final page."""
        iban = creditor_iban or settings.BILLING_CREDITOR_IBAN
        name = creditor_name or settings.BILLING_CREDITOR_NAME
        street = creditor_street or settings.BILLING_CREDITOR_STREET
        house_num = creditor_house_num or settings.BILLING_CREDITOR_HOUSE_NUM
        postal_code = creditor_postal_code or settings.BILLING_CREDITOR_POSTAL_CODE
        city = creditor_city or settings.BILLING_CREDITOR_CITY
        country = creditor_country or settings.BILLING_CREDITOR_COUNTRY

        # Only add QR bill if we have creditor details configured
        if not iban or not name:
            return
        
        render_swiss_qr_bill(
            canvas,
            y_position=0,  # Bottom of page
            # Creditor
            creditor_iban=iban,
            creditor_name=name,
            creditor_street=street,
            creditor_house_num=house_num,
            creditor_postal_code=postal_code or "",
            creditor_city=city or "",
            creditor_country=country,
            # Debtor
            debtor_name=recipient_name,
            debtor_street=recipient_street_value,
            debtor_house_num=recipient_house_num_value,
            debtor_postal_code=recipient_postal_code_value,
            debtor_city=recipient_city_value,
            debtor_country="CH",
            # Payment details
            amount=total_due,
            currency="CHF",
            reference=reference,
            message=payment_message or f"Facturation DringDring {period_month.strftime('%Y-%m')}",
            language="fr",
        )

    class _QrBillCanvas(pdf_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total_pages = len(self._saved_page_states)
            for page_number, state in enumerate(self._saved_page_states, start=1):
                self.__dict__.update(state)
                if page_number == total_pages:
                    add_qr_bill(self)
                super().showPage()
            super().save()

    elements.append(Spacer(1, qr_bill_height))
    doc.build(elements, canvasmaker=_QrBillCanvas)
    buffer.seek(0)
    return buffer
