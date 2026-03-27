from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO, StringIO
import re

from app.core.vat import DEFAULT_VAT_RATE

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

try:
    from qrbill import QRBill
    from qrbill.bill import CombinedAddress, StructuredAddress
    QRBILL_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    CombinedAddress = None  # type: ignore[assignment]
    StructuredAddress = None  # type: ignore[assignment]
    QRBill = None  # type: ignore[assignment]
    QRBILL_AVAILABLE = False

try:
    from svglib.svglib import svg2rlg
    SVG_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    svg2rlg = None  # type: ignore[assignment]
    SVG_AVAILABLE = False

from app.core.config import settings


def _clean(value: str | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _limit(value: str | None, max_len: int) -> str:
    text = _clean(value)
    if len(text) <= max_len:
        return text
    return text[:max_len].rstrip()


def _normalize_city(value: str | None) -> str:
    city = _clean(value)
    city = re.sub(r"^\d{4}\s+", "", city)
    if " - " in city:
        city = city.split(" - ", 1)[0].strip()
    return city


def _clean_iban(value: str | None) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", _clean(value))


def _format_amount(amount: Decimal | int | float | str | None) -> str:
    if amount is None:
        return ""
    return f"{Decimal(str(amount)):.2f}"


def _quantize(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _vat_breakdown(
    amount: Decimal | int | float | str | None,
    rate: Decimal,
) -> tuple[Decimal, Decimal, Decimal] | None:
    if amount is None:
        return None
    amount_ttc = Decimal(str(amount))
    if amount_ttc == 0:
        return amount_ttc, Decimal("0.00"), Decimal("0.00")
    divisor = Decimal("1.00") + rate
    amount_ht = _quantize(amount_ttc / divisor)
    vat_amount = _quantize(amount_ttc - amount_ht)
    return amount_ttc, amount_ht, vat_amount


def _build_qr_payload(
    *,
    iban: str,
    creditor_name: str,
    creditor_address: str,
    creditor_postal_code: str,
    creditor_city: str,
    creditor_country: str,
    amount: Decimal | int | float | str | None,
    currency: str,
    debtor_name: str | None,
    debtor_address: str | None,
    debtor_postal_code: str | None,
    debtor_city: str | None,
    debtor_country: str,
    message: str | None,
) -> str:
    creditor_city_line = " ".join([_clean(creditor_postal_code), _clean(creditor_city)]).strip()
    debtor_city_line = " ".join([_clean(debtor_postal_code), _clean(debtor_city)]).strip()

    lines = [
        "SPC",
        "0200",
        "1",
        _clean_iban(iban),
        "K",
        _clean(creditor_name),
        _clean(creditor_address),
        creditor_city_line,
        _clean(creditor_country or "CH"),
        "",
        "",
        "",
        "",
        "",
        "",
        _format_amount(amount),
        _clean(currency),
    ]

    if debtor_name:
        lines.extend(
            [
                "K",
                _clean(debtor_name),
                _clean(debtor_address),
                debtor_city_line,
                _clean(debtor_country or "CH"),
            ]
        )
    else:
        lines.extend(["", "", "", "", ""])

    lines.extend(
        [
            "NON",
            "",
            _clean(message),
            "EPD",
            "",
            "",
            "",
        ]
    )

    return "\n".join(lines)


def _build_qrbill_instance(
    *,
    iban: str,
    creditor_name: str,
    creditor_address: str,
    creditor_postal_code: str,
    creditor_city: str,
    creditor_country: str,
    amount: Decimal | int | float | str | None,
    currency: str,
    debtor_name: str | None,
    debtor_address: str | None,
    debtor_postal_code: str | None,
    debtor_city: str | None,
    debtor_country: str,
    reference: str | None,
    message: str | None,
) -> QRBill:
    if not QRBILL_AVAILABLE or QRBill is None:
        raise ValueError("Swiss QR Bill generator not available")

    def split_street(value: str) -> tuple[str, str | None]:
        parts = value.strip().rsplit(" ", 1)
        if len(parts) == 2 and any(ch.isdigit() for ch in parts[1]):
            return parts[0], parts[1]
        return value.strip(), None

    creditor_country_clean = _clean(creditor_country or "CH")
    street, house_num = split_street(_clean(creditor_address))
    creditor_name_clean = _limit(creditor_name, 70)
    creditor_street_clean = _limit(street or creditor_address, 35)
    creditor_house_num_clean = _limit(house_num, 16) or None
    creditor_postal_clean = _limit(creditor_postal_code, 16)
    creditor_city_clean = _limit(_normalize_city(creditor_city), 35)
    creditor = None
    if creditor_postal_clean and creditor_city_clean:
        creditor = {
            "name": creditor_name_clean,
            "street": creditor_street_clean,
            "house_num": creditor_house_num_clean,
            "pcode": creditor_postal_clean,
            "city": creditor_city_clean,
            "country": creditor_country_clean,
        }
    else:
        creditor_line2 = " ".join([creditor_postal_clean, creditor_city_clean]).strip()
        if creditor_street_clean and creditor_line2:
            creditor = {
                "name": creditor_name_clean,
                "line1": _limit(creditor_street_clean, 35),
                "line2": _limit(creditor_line2, 35),
                "country": creditor_country_clean,
            }
    if creditor is None:
        raise ValueError("Creditor address missing for QR bill")

    debtor = None
    if debtor_name:
        debtor_country_clean = _clean(debtor_country or "CH")
        debtor_street, debtor_house_num = split_street(_clean(debtor_address))
        debtor_name_clean = _limit(debtor_name, 70)
        debtor_street_clean = _limit(debtor_street or debtor_address, 35)
        debtor_house_num_clean = _limit(debtor_house_num, 16) or None
        debtor_postal_clean = _limit(debtor_postal_code, 16)
        debtor_city_clean = _limit(_normalize_city(debtor_city), 35)
        if debtor_postal_clean and debtor_city_clean:
            debtor = {
                "name": debtor_name_clean,
                "street": debtor_street_clean,
                "house_num": debtor_house_num_clean,
                "pcode": debtor_postal_clean,
                "city": debtor_city_clean,
                "country": debtor_country_clean,
            }
        else:
            debtor_line2 = " ".join([debtor_postal_clean, debtor_city_clean]).strip()
            if debtor_street_clean and debtor_line2:
                debtor = {
                    "name": debtor_name_clean,
                    "line1": _limit(debtor_street_clean, 35),
                    "line2": _limit(debtor_line2, 35),
                    "country": debtor_country_clean,
                }

    amount_value = Decimal(str(amount)) if amount is not None else None
    bill = QRBill(
        account=_clean_iban(iban),
        creditor=creditor,
        amount=amount_value,
        currency=_clean(currency) or "CHF",
        debtor=debtor,
        reference_number=_clean(reference) or None,
        additional_information=_clean(message),
        language="fr",
    )
    return bill


def _build_qr_payload_qrbill(
    *,
    iban: str,
    creditor_name: str,
    creditor_address: str,
    creditor_postal_code: str,
    creditor_city: str,
    creditor_country: str,
    amount: Decimal | int | float | str | None,
    currency: str,
    debtor_name: str | None,
    debtor_address: str | None,
    debtor_postal_code: str | None,
    debtor_city: str | None,
    debtor_country: str,
    reference: str | None,
    message: str | None,
) -> str:
    bill = _build_qrbill_instance(
        iban=iban,
        creditor_name=creditor_name,
        creditor_address=creditor_address,
        creditor_postal_code=creditor_postal_code,
        creditor_city=creditor_city,
        creditor_country=creditor_country,
        amount=amount,
        currency=currency,
        debtor_name=debtor_name,
        debtor_address=debtor_address,
        debtor_postal_code=debtor_postal_code,
        debtor_city=debtor_city,
        debtor_country=debtor_country,
        reference=reference,
        message=message,
    )
    return bill.qr_data()


def _build_qrbill_svg_flowable(
    *,
    iban: str,
    creditor_name: str,
    creditor_address: str,
    creditor_postal_code: str,
    creditor_city: str,
    creditor_country: str,
    amount: Decimal | int | float | str | None,
    currency: str,
    debtor_name: str | None,
    debtor_address: str | None,
    debtor_postal_code: str | None,
    debtor_city: str | None,
    debtor_country: str,
    reference: str | None,
    message: str | None,
) -> Drawing | None:
    if not (QRBILL_AVAILABLE and SVG_AVAILABLE and svg2rlg is not None):
        return None
    bill = _build_qrbill_instance(
        iban=iban,
        creditor_name=creditor_name,
        creditor_address=creditor_address,
        creditor_postal_code=creditor_postal_code,
        creditor_city=creditor_city,
        creditor_country=creditor_country,
        amount=amount,
        currency=currency,
        debtor_name=debtor_name,
        debtor_address=debtor_address,
        debtor_postal_code=debtor_postal_code,
        debtor_city=debtor_city,
        debtor_country=debtor_country,
        reference=reference,
        message=message,
    )

    svg_buffer = StringIO()
    bill.as_svg(svg_buffer, full_page=False)
    svg_bytes = svg_buffer.getvalue().encode("utf-8")
    drawing = svg2rlg(BytesIO(svg_bytes))
    if drawing is None:
        return None
    target_width = 17.0 * cm
    if drawing.width:
        scale = target_width / drawing.width
        drawing.scale(scale, scale)
    return drawing


def build_payment_flowables(
    *,
    amount: Decimal | int | float | str | None,
    vat_rate: Decimal | int | float | str | None = None,
    debtor_name: str | None = None,
    debtor_address: str | None = None,
    debtor_postal_code: str | None = None,
    debtor_city: str | None = None,
    reference: str | None = None,
    message: str | None = None,
    styles,
):
    creditor_name = _clean(settings.BILLING_CREDITOR_NAME)
    iban = _clean_iban(settings.BILLING_CREDITOR_IBAN)
    creditor_address = _clean(settings.BILLING_CREDITOR_ADDRESS)
    creditor_postal_code = _clean(settings.BILLING_CREDITOR_POSTAL_CODE)
    creditor_city = _clean(settings.BILLING_CREDITOR_CITY)
    creditor_country = _clean(settings.BILLING_CREDITOR_COUNTRY) or "CH"
    payment_message = message or settings.BILLING_PAYMENT_MESSAGE

    vat_rate = Decimal(str(vat_rate)) if vat_rate is not None else DEFAULT_VAT_RATE
    vat_label = f"TVA {(vat_rate * Decimal('100')).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)}%"

    elements = [
        Paragraph("<b>Informations de paiement</b>", styles["Heading3"]),
        Paragraph(f"<i>Montants TTC avec detail {vat_label}.</i>", styles["Italic"]),
    ]

    if not creditor_name or not iban:
        elements.append(
            Paragraph(
                "<i>Coordonnees de paiement a configurer (IBAN/beneficiaire).</i>",
                styles["Italic"],
            )
        )
        elements.append(Spacer(1, 12))
        return elements

    text_rows = [
        ["Beneficiaire", creditor_name],
        ["IBAN", iban],
    ]
    vat_breakdown = _vat_breakdown(amount, vat_rate)
    if vat_breakdown:
        amount_ttc, amount_ht, vat_amount = vat_breakdown
        text_rows.extend(
            [
                ["Montant HT", f"CHF {_format_amount(amount_ht)}"],
                [vat_label, f"CHF {_format_amount(vat_amount)}"],
                ["Montant TTC", f"CHF {_format_amount(amount_ttc)}"],
            ]
        )
    else:
        text_rows.append(["Montant", f"CHF {_format_amount(amount)}"])
    if reference:
        text_rows.append(["Reference", reference])
    if payment_message:
        text_rows.append(["Communication", payment_message])

    text_table = Table(text_rows, colWidths=[4.2 * cm, 10.5 * cm])
    text_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#111827")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    try:
        qr_payload = _build_qr_payload_qrbill(
            iban=iban,
            creditor_name=creditor_name,
            creditor_address=creditor_address,
            creditor_postal_code=creditor_postal_code,
            creditor_city=creditor_city,
            creditor_country=creditor_country,
            amount=amount,
            currency="CHF",
            debtor_name=debtor_name,
            debtor_address=debtor_address,
            debtor_postal_code=debtor_postal_code,
            debtor_city=debtor_city,
            debtor_country="CH",
            reference=reference,
            message=payment_message,
        )
    except Exception:
        qr_payload = _build_qr_payload(
            iban=iban,
            creditor_name=creditor_name,
            creditor_address=creditor_address,
            creditor_postal_code=creditor_postal_code,
            creditor_city=creditor_city,
            creditor_country=creditor_country,
            amount=amount,
            currency="CHF",
            debtor_name=debtor_name,
            debtor_address=debtor_address,
            debtor_postal_code=debtor_postal_code,
            debtor_city=debtor_city,
            debtor_country="CH",
            message=payment_message,
        )

    # NOTE: We intentionally render the Swiss QR payload via ReportLab's QR widget
    # so we can guarantee the Swiss cross overlay is visible in the PDF.

    qr_code = qr.QrCodeWidget(qr_payload, barLevel="H")
    bounds = qr_code.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    size = 4.6 * cm
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(qr_code)

    cross_size = size * (7 / 46)
    cross_scale = cross_size / 19
    cross_origin_x = (size - cross_size) / 2
    cross_origin_y = (size - cross_size) / 2
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

    layout = Table([[text_table, drawing]], colWidths=[12.2 * cm, 4.6 * cm])
    layout.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    elements.append(layout)
    elements.append(Spacer(1, 12))
    return elements
