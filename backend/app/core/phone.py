import re
from typing import Optional


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if not cleaned:
        return None
    if cleaned.startswith("00"):
        cleaned = f"+{cleaned[2:]}"
    if cleaned.startswith("+"):
        digits = re.sub(r"\D", "", cleaned)
        return f"+{digits}"
    digits = re.sub(r"\D", "", cleaned)
    if digits.startswith("41"):
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 10:
        return f"+41{digits[1:]}"
    return None


def is_valid_swiss_phone(value: Optional[str]) -> bool:
    if not value:
        return False
    digits = re.sub(r"\D", "", value)
    return digits.startswith("41") and len(digits) == 11
