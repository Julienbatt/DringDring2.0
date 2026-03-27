from datetime import date
from decimal import Decimal

from app.core.config import settings


DEFAULT_VAT_RATE = Decimal(str(settings.DEFAULT_VAT_RATE))


def get_vat_rate(cur, period_month: date) -> Decimal:
    """Return the VAT rate for *period_month* from the database.

    Falls back to ``DEFAULT_VAT_RATE`` when the ``app_settings`` table
    does not exist or contains no matching row.
    """
    cur.execute("SELECT to_regclass('public.app_settings')")
    table = cur.fetchone()
    if not table or table[0] is None:
        return DEFAULT_VAT_RATE
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
        return DEFAULT_VAT_RATE
    return Decimal(str(row[0]))
