import re
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException


def parse_month(month: Optional[str]) -> date:
    """Parse a 'YYYY-MM' string into a date (first day of month).

    If *month* is ``None``, returns the first day of the current month.
    Raises an HTTP 400 if the format is invalid.
    """
    if not month:
        today = date.today()
        return today.replace(day=1)
    try:
        return datetime.strptime(month, "%Y-%m").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid month format") from exc


def split_address_parts(value: str | None) -> tuple[str | None, str | None]:
    """Split an address string into ``(street, house_num)``.

    Tries number-first then street-first patterns.  Returns
    ``(value, None)`` when no house number can be detected, and
    ``(None, None)`` for empty / ``None`` input.
    """
    if not value:
        return None, None
    address = value.strip()
    if not address:
        return None, None
    match = re.match(r"^(?P<num>\d+[A-Za-z0-9/\-]*)\s+(?P<street>.+)$", address)
    if match:
        return match.group("street"), match.group("num")
    match = re.match(r"^(?P<street>.+?)\s+(?P<num>\d+[A-Za-z0-9/\-]*)$", address)
    if match:
        return match.group("street"), match.group("num")
    return address, None
