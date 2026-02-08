"""
Swiss QR Bill Renderer - SIX Interbank Clearing Compliant

This module provides a strict implementation of the Swiss QR Bill standard
using ReportLab Canvas for absolute positioning to guarantee millimeter-perfect
dimensions required by Swiss banking standards.

References:
- SIX Implementation Guidelines v2.2
- Swiss QR Bill Specification
"""

from decimal import Decimal
from io import BytesIO
import re

from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing, Rect

# Import QR data generation from existing module
from app.pdf.payment_details import (
    _clean,
    _clean_iban,
    _format_amount,
    _build_qr_payload_qrbill,
)


# ============================================================================
# LAYOUT CONSTANTS (SIX Specification)
# ============================================================================

# Page dimensions (A4)
A4_WIDTH = 210 * mm
A4_HEIGHT = 297 * mm

# Payment section dimensions (A6 landscape at bottom of A4)
PAYMENT_SECTION_WIDTH = 210 * mm
PAYMENT_SECTION_HEIGHT = 105 * mm

# QR Code dimensions
QR_SIZE = 46 * mm
QR_MARGIN_LEFT = 5 * mm  # From left edge of payment section
QR_BASELINE_Y = 35 * mm  # Align QR top near the right "Compte / Payable a" block.

# Swiss Cross dimensions (centered in QR)
SWISS_CROSS_SIZE = 7 * mm

# Receipt section (left part)
RECEIPT_WIDTH = 62 * mm
RECEIPT_MARGIN_LEFT = 5 * mm

# Payment section (right part)
PAYMENT_MARGIN_LEFT = RECEIPT_WIDTH + 5 * mm

# Vertical positions (from bottom of payment section)
TITLE_Y = 95 * mm
SECTION_START_Y = 85 * mm

# Font sizes (per SIX spec)
FONT_TITLE = ("Helvetica-Bold", 11)
FONT_LABEL_RECEIPT = ("Helvetica-Bold", 6)
FONT_TEXT_RECEIPT = ("Helvetica", 8)
FONT_LABEL_PAYMENT = ("Helvetica-Bold", 8)
FONT_TEXT_PAYMENT = ("Helvetica", 10)

# Scissors line
SCISSORS_LINE_Y = PAYMENT_SECTION_HEIGHT
SCISSORS_DASH_PATTERN = [2, 2]


# ============================================================================
# ADDRESS PARSING
# ============================================================================

def _split_street_number(address: str) -> tuple[str, str | None]:
    """
    Split a combined address into street and house number.
    
    Examples:
        "Avenue de la Gare 12" -> ("Avenue de la Gare", "12")
        "Rue du Rhône 15A" -> ("Rue du Rhône", "15A")
        "Chemin des Fleurs" -> ("Chemin des Fleurs", None)
    """
    address = address.strip()
    parts = address.rsplit(" ", 1)
    
    if len(parts) == 2 and any(ch.isdigit() for ch in parts[1]):
        return parts[0], parts[1]
    
    return address, None


# ============================================================================
# QR CODE GENERATION
# ============================================================================

def _generate_qr_code_with_cross(qr_data: str, size: float) -> Drawing:
    """
    Generate a QR code with the Swiss Cross overlay.
    
    Args:
        qr_data: The QR code payload (Swiss Payment Code)
        size: Size of the QR code in points
        
    Returns:
        ReportLab Drawing with QR code and Swiss Cross
    """
    # Create QR code widget
    qr_code = qr.QrCodeWidget(qr_data, barLevel="H")
    bounds = qr_code.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    
    # Create drawing with proper scaling
    scale = size / width
    drawing = Drawing(size, size, transform=[scale, 0, 0, scale, 0, 0])
    drawing.add(qr_code)
    
    # Add Swiss Cross overlay (work in unscaled QR units)
    cross_size = SWISS_CROSS_SIZE / scale
    cross_scale = cross_size / 19  # Standard cross proportions
    cross_origin_x = (width - cross_size) / 2
    cross_origin_y = (height - cross_size) / 2
    
    # Black square background
    drawing.add(
        Rect(
            cross_origin_x,
            cross_origin_y,
            cross_size,
            cross_size,
            fillColor=colors.black,
            strokeColor=None,
        )
    )
    
    # White cross (vertical bar)
    drawing.add(
        Rect(
            cross_origin_x + 8.3 * cross_scale,
            cross_origin_y + 4 * cross_scale,
            3.3 * cross_scale,
            11 * cross_scale,
            fillColor=colors.white,
            strokeColor=None,
        )
    )
    
    # White cross (horizontal bar)
    drawing.add(
        Rect(
            cross_origin_x + 4.4 * cross_scale,
            cross_origin_y + 7.9 * cross_scale,
            11 * cross_scale,
            3.3 * cross_scale,
            fillColor=colors.white,
            strokeColor=None,
        )
    )
    
    return drawing


# ============================================================================
# TEXT RENDERING HELPERS
# ============================================================================

def _draw_label_value(
    canvas,
    x: float,
    y: float,
    label: str,
    value: str,
    label_font: tuple,
    value_font: tuple,
    line_height: float = 3 * mm,
):
    """Draw a label and its value with proper spacing."""
    canvas.setFont(*label_font)
    canvas.drawString(x, y, label)
    
    canvas.setFont(*value_font)
    canvas.drawString(x, y - line_height, value)


def _draw_multiline_text(
    canvas,
    x: float,
    y: float,
    lines: list[str],
    font: tuple,
    line_height: float = 3 * mm,
):
    """Draw multiple lines of text."""
    canvas.setFont(*font)
    current_y = y
    for line in lines:
        if line:
            canvas.drawString(x, current_y, line)
        current_y -= line_height


# ============================================================================
# MAIN RENDERER
# ============================================================================

def render_swiss_qr_bill(
    canvas,
    y_position: float = 0,
    *,
    # Creditor
    creditor_iban: str,
    creditor_name: str,
    creditor_street: str | None = None,
    creditor_house_num: str | None = None,
    creditor_postal_code: str,
    creditor_city: str,
    creditor_country: str = "CH",
    # Debtor
    debtor_name: str | None = None,
    debtor_street: str | None = None,
    debtor_house_num: str | None = None,
    debtor_postal_code: str | None = None,
    debtor_city: str | None = None,
    debtor_country: str = "CH",
    # Payment details
    amount: Decimal | int | float | str | None = None,
    currency: str = "CHF",
    reference: str | None = None,
    message: str | None = None,
    # Options
    language: str = "fr",
) -> None:
    """
    Render a complete Swiss QR Bill at the specified position.
    
    This function draws a banking-compliant Swiss QR Bill with:
    - Receipt section (left)
    - Payment section (right)
    - QR code with Swiss Cross
    - Scissors line separator
    
    Args:
        canvas: ReportLab Canvas object
        y_position: Y coordinate for bottom of payment section (default: 0 = bottom of page)
        creditor_*: Creditor (beneficiary) details
        debtor_*: Debtor (payer) details
        amount: Payment amount (None for open amount)
        currency: Currency code (default: CHF)
        reference: Payment reference (QRR or SCOR format)
        message: Additional payment message
        language: Language for labels (fr, de, it, en)
    """
    # Labels by language
    labels = {
        "fr": {
            "receipt": "Recepisse",
            "payment_part": "Section paiement",
            "account": "Compte / Payable a",
            "reference": "Reference",
            "payable_by": "Payable par",
            "currency": "Monnaie",
            "amount": "Montant",
            "acceptance_point": "Point de depot",
        },
        "de": {
            "receipt": "Empfangsschein",
            "payment_part": "Zahlteil",
            "account": "Konto / Zahlbar an",
            "reference": "Referenz",
            "payable_by": "Zahlbar durch",
            "currency": "Waehrung",
            "amount": "Betrag",
            "acceptance_point": "Annahmestelle",
        },
    }

    lang = labels.get(language, labels["fr"])
    
    # Parse addresses if needed
    if creditor_street and not creditor_house_num:
        creditor_street, creditor_house_num = _split_street_number(creditor_street)
    
    if debtor_street and not debtor_house_num and debtor_street:
        debtor_street, debtor_house_num = _split_street_number(debtor_street)
    
    # Build creditor address lines
    creditor_address_combined = creditor_street or ""
    if creditor_house_num:
        creditor_address_combined = f"{creditor_street} {creditor_house_num}"
    
    creditor_lines = [
        _clean_iban(creditor_iban),
        _clean(creditor_name),
        creditor_address_combined,
        f"{_clean(creditor_postal_code)} {_clean(creditor_city)}",
    ]
    
    # Build debtor address lines (only if we have meaningful address data)
    has_debtor = bool(
        debtor_name
        and (debtor_street or debtor_postal_code or debtor_city)
    )
    debtor_lines = []
    debtor_address_combined = ""
    if has_debtor:
        debtor_address_combined = debtor_street or ""
        if debtor_house_num:
            debtor_address_combined = f"{debtor_street} {debtor_house_num}"
        
        debtor_lines = [
            _clean(debtor_name),
            debtor_address_combined,
            f"{_clean(debtor_postal_code)} {_clean(debtor_city)}",
        ]
    
    # Format amount
    amount_str = _format_amount(amount) if amount is not None else ""
    
    # ========================================================================
    # SCISSORS LINE
    # ========================================================================
    canvas.saveState()
    canvas.setDash(SCISSORS_DASH_PATTERN)
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.6)
    canvas.line(0, y_position + SCISSORS_LINE_Y, PAYMENT_SECTION_WIDTH, y_position + SCISSORS_LINE_Y)
    canvas.restoreState()
    
    # TODO: Add scissors symbol (can be drawn with paths or use a symbol font)
    
    # ========================================================================
    # RECEIPT SECTION (LEFT)
    # ========================================================================
    receipt_x = RECEIPT_MARGIN_LEFT
    receipt_y = y_position + TITLE_Y
    
    # Title
    canvas.setFont(*FONT_TITLE)
    canvas.drawString(receipt_x, receipt_y, lang["receipt"])
    
    # Account / Payable to
    y = receipt_y - 15 * mm
    _draw_label_value(
        canvas, receipt_x, y,
        lang["account"],
        "",
        FONT_LABEL_RECEIPT,
        FONT_TEXT_RECEIPT,
    )
    
    y -= 3 * mm
    _draw_multiline_text(
        canvas, receipt_x, y,
        creditor_lines,
        FONT_TEXT_RECEIPT,
    )
    
    # Reference
    if reference:
        y -= len(creditor_lines) * 3 * mm + 5 * mm
        _draw_label_value(
            canvas, receipt_x, y,
            lang["reference"],
            _clean(reference),
            FONT_LABEL_RECEIPT,
            FONT_TEXT_RECEIPT,
        )
    
    # Payable by
    if debtor_lines:
        y -= 10 * mm
        _draw_label_value(
            canvas, receipt_x, y,
            lang["payable_by"],
            "",
            FONT_LABEL_RECEIPT,
            FONT_TEXT_RECEIPT,
        )
        
        y -= 3 * mm
        _draw_multiline_text(
            canvas, receipt_x, y,
            debtor_lines,
            FONT_TEXT_RECEIPT,
        )
    
    # Currency and Amount (bottom left of receipt)
    y = y_position + 10 * mm
    _draw_label_value(
        canvas, receipt_x, y,
        lang["currency"],
        currency,
        FONT_LABEL_RECEIPT,
        FONT_TEXT_RECEIPT,
    )
    
    _draw_label_value(
        canvas, receipt_x + 15 * mm, y,
        lang["amount"],
        amount_str,
        FONT_LABEL_RECEIPT,
        FONT_TEXT_RECEIPT,
    )
    
    # Acceptance point label (bottom right of receipt)
    canvas.setFont(*FONT_LABEL_RECEIPT)
    canvas.drawRightString(RECEIPT_WIDTH - 5 * mm, y_position + 5 * mm, lang["acceptance_point"])
    
    # ========================================================================
    # PAYMENT SECTION (RIGHT)
    # ========================================================================
    payment_x = PAYMENT_MARGIN_LEFT
    payment_y = y_position + TITLE_Y
    
    # Title
    canvas.setFont(*FONT_TITLE)
    canvas.drawString(payment_x, payment_y, lang["payment_part"])
    
    # QR Code
    try:
        qr_data = _build_qr_payload_qrbill(
            iban=creditor_iban,
            creditor_name=creditor_name,
            creditor_address=creditor_address_combined,
            creditor_postal_code=creditor_postal_code,
            creditor_city=creditor_city,
            creditor_country=creditor_country,
            amount=amount,
            currency=currency,
            debtor_name=debtor_name if has_debtor else None,
            debtor_address=debtor_address_combined,
            debtor_postal_code=debtor_postal_code if has_debtor else None,
            debtor_city=debtor_city if has_debtor else None,
            debtor_country=debtor_country,
            reference=reference,
            message=message,
        )
        
        qr_drawing = _generate_qr_code_with_cross(qr_data, QR_SIZE)
        qr_drawing.drawOn(canvas, payment_x, y_position + QR_BASELINE_Y)
        
    except Exception as e:
        # Fallback: draw error message
        canvas.setFont("Helvetica", 8)
        canvas.drawString(payment_x, y_position + 50 * mm, f"QR Error: {str(e)}")
    
    # Currency and Amount (below QR)
    y = y_position + 10 * mm
    _draw_label_value(
        canvas, payment_x, y,
        lang["currency"],
        currency,
        FONT_LABEL_PAYMENT,
        FONT_TEXT_PAYMENT,
    )
    
    _draw_label_value(
        canvas, payment_x + 18 * mm, y,
        lang["amount"],
        amount_str,
        FONT_LABEL_PAYMENT,
        FONT_TEXT_PAYMENT,
    )
    
    # Account / Payable to (right side)
    info_x = payment_x + QR_SIZE + 5 * mm
    y = payment_y - 10 * mm
    
    _draw_label_value(
        canvas, info_x, y,
        lang["account"],
        "",
        FONT_LABEL_PAYMENT,
        FONT_TEXT_PAYMENT,
    )
    
    y -= 4 * mm
    _draw_multiline_text(
        canvas, info_x, y,
        creditor_lines,
        FONT_TEXT_PAYMENT,
        line_height=4 * mm,
    )
    
    # Reference
    if reference:
        y -= len(creditor_lines) * 4 * mm + 6 * mm
        _draw_label_value(
            canvas, info_x, y,
            lang["reference"],
            _clean(reference),
            FONT_LABEL_PAYMENT,
            FONT_TEXT_PAYMENT,
        )
    
    # Payable by
    if debtor_lines:
        y -= 12 * mm
        _draw_label_value(
            canvas, info_x, y,
            lang["payable_by"],
            "",
            FONT_LABEL_PAYMENT,
            FONT_TEXT_PAYMENT,
        )
        
        y -= 4 * mm
        _draw_multiline_text(
            canvas, info_x, y,
            debtor_lines,
            FONT_TEXT_PAYMENT,
            line_height=4 * mm,
        )


# ============================================================================
# CONVENIENCE FUNCTION FOR STANDALONE PDF
# ============================================================================

def generate_qr_bill_pdf(
    output_path: str | BytesIO,
    **kwargs,
) -> None:
    """
    Generate a standalone Swiss QR Bill PDF.
    
    Args:
        output_path: File path or BytesIO buffer
        **kwargs: All arguments for render_swiss_qr_bill
    """
    c = pdf_canvas.Canvas(output_path, pagesize=(A4_WIDTH, A4_HEIGHT))
    
    # Draw QR bill at bottom of page
    render_swiss_qr_bill(c, y_position=0, **kwargs)
    
    c.showPage()
    c.save()
