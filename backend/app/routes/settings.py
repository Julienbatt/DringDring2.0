from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.guards import require_admin_user, require_super_admin_user
from app.core.security import get_current_user_claims
from app.core.utils import parse_month
from app.db.session import get_db_connection
from app.schemas.me import MeResponse


router = APIRouter(prefix="/settings", tags=["settings"])


class VatRatePayload(BaseModel):
    rate: float = Field(..., gt=0, lt=1)
    effective_from: str = Field(..., pattern=r"^\d{4}-\d{2}$")



@router.get("/vat-rate")
def get_vat_rate(
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    period_month = parse_month(month)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.app_settings')")
            table = cur.fetchone()
            if not table or table[0] is None:
                return {"rate": 0.081, "effective_from": period_month.strftime("%Y-%m")}

            cur.execute(
                """
                SELECT value_numeric, effective_from
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
        return {"rate": 0.081, "effective_from": period_month.strftime("%Y-%m")}

    return {
        "rate": float(row[0]),
        "effective_from": row[1].strftime("%Y-%m"),
    }


@router.post("/vat-rate")
def set_vat_rate(
    payload: VatRatePayload,
    user: MeResponse = Depends(require_super_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    period_month = parse_month(payload.effective_from)
    rate_value = Decimal(str(payload.rate))

    if rate_value <= 0 or rate_value >= 1:
        raise HTTPException(status_code=400, detail="Invalid VAT rate")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.app_settings')")
            table = cur.fetchone()
            if not table or table[0] is None:
                raise HTTPException(status_code=400, detail="Settings table missing")

            cur.execute(
                """
                INSERT INTO public.app_settings (key, value_numeric, effective_from)
                VALUES ('vat_rate', %s, %s)
                ON CONFLICT (key, effective_from)
                DO UPDATE SET value_numeric = EXCLUDED.value_numeric
                """,
                (rate_value, period_month),
            )
            conn.commit()

    return {
        "rate": float(rate_value),
        "effective_from": period_month.strftime("%Y-%m"),
    }
