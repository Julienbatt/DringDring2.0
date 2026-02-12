from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel
import uuid
import logging
from typing import Optional

from app.core.guards import require_super_admin_user, require_admin_user
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse
from app.storage.supabase_storage import upload_file_bytes

router = APIRouter(prefix="/regions", tags=["regions"])
logger = logging.getLogger(__name__)

class AdminRegionCreate(BaseModel):
    name: str
    canton_id: Optional[str] = None
    address: Optional[str] = None
    contact_email: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True


class AdminRegionBillingUpdate(BaseModel):
    billing_name: Optional[str] = None
    billing_iban: Optional[str] = None
    billing_street: Optional[str] = None
    billing_house_num: Optional[str] = None
    billing_postal_code: Optional[str] = None
    billing_city: Optional[str] = None
    billing_country: Optional[str] = None


class AdminRegionInternalBillingUpdate(BaseModel):
    internal_billing_name: Optional[str] = None
    internal_billing_iban: Optional[str] = None
    internal_billing_street: Optional[str] = None
    internal_billing_house_num: Optional[str] = None
    internal_billing_postal_code: Optional[str] = None
    internal_billing_city: Optional[str] = None
    internal_billing_country: Optional[str] = None


def _resolve_admin_region_id(user: MeResponse, admin_region_id: str | None) -> str:
    if user.role == "admin_region":
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        return str(user.admin_region_id)
    if user.role == "super_admin":
        if not admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        return str(admin_region_id)
    raise HTTPException(status_code=403, detail="Admin access required")

@router.get("/cantons")
def list_cantons(
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, code FROM canton ORDER BY name")
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

    results = []
    for row in rows:
        item = {}
        for col, val in zip(columns, row):
            item[col] = val
        results.append(item)
    return results

@router.get("")
def list_admin_regions(
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_super_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ar.id, ar.name, ar.active, ar.address, ar.contact_email, ar.contact_person, ar.phone,
                       c.name as canton_name
                FROM admin_region ar
                LEFT JOIN canton c ON ar.canton_id = c.id
                ORDER BY ar.name
                LIMIT %s OFFSET %s
                """
                ,
                (limit, offset),
            )
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

    results = []
    for row in rows:
        item = {}
        for col, val in zip(columns, row):
            item[col] = val
        results.append(item)
    return results

@router.post("")
def create_admin_region(
    region: AdminRegionCreate,
    user: MeResponse = Depends(require_super_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    region_id = str(uuid.uuid4())
    
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            # Verify canton if provided
            canton_id_to_use = None
            if region.canton_id:
                cur.execute("SELECT id FROM canton WHERE id = %s", (region.canton_id,))
                if not cur.fetchone():
                     raise HTTPException(status_code=400, detail="Canton not found")
                canton_id_to_use = region.canton_id
            
            cur.execute(
                """
                INSERT INTO admin_region (id, name, canton_id, address, contact_email, contact_person, phone, active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (region_id, region.name, canton_id_to_use, region.address, region.contact_email, region.contact_person, region.phone, region.active)
            )
            conn.commit()
            
    return {"id": region_id, "message": "Admin Region created successfully"}


@router.get("/me/billing")
def get_admin_region_billing(
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
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
                    billing_logo_path
                FROM admin_region
                WHERE id = %s
                """,
                (target_region_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Admin region not found")

    return {
        "billing_name": row[0],
        "billing_iban": row[1],
        "billing_street": row[2],
        "billing_house_num": row[3],
        "billing_postal_code": row[4],
        "billing_city": row[5],
        "billing_country": row[6],
        "billing_logo_path": row[7],
    }


@router.put("/me/billing")
def update_admin_region_billing(
    payload: AdminRegionBillingUpdate,
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    billing_name = (payload.billing_name or "").strip() or None
    billing_iban = (payload.billing_iban or "").strip() or None
    billing_street = (payload.billing_street or "").strip() or None
    billing_house_num = (payload.billing_house_num or "").strip() or None
    billing_postal_code = (payload.billing_postal_code or "").strip() or None
    billing_city = (payload.billing_city or "").strip() or None
    billing_country = (payload.billing_country or "").strip() or None

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET billing_name = %s,
                    billing_iban = %s,
                    billing_street = %s,
                    billing_house_num = %s,
                    billing_postal_code = %s,
                    billing_city = %s,
                    billing_country = %s
                WHERE id = %s
                RETURNING
                    billing_name,
                    billing_iban,
                    billing_street,
                    billing_house_num,
                    billing_postal_code,
                    billing_city,
                    billing_country,
                    billing_logo_path
                """,
                (
                    billing_name,
                    billing_iban,
                    billing_street,
                    billing_house_num,
                    billing_postal_code,
                    billing_city,
                    billing_country,
                    target_region_id,
                ),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {
        "billing_name": row[0],
        "billing_iban": row[1],
        "billing_street": row[2],
        "billing_house_num": row[3],
        "billing_postal_code": row[4],
        "billing_city": row[5],
        "billing_country": row[6],
        "billing_logo_path": row[7],
    }


@router.post("/me/logo")
async def upload_admin_region_logo(
    file: UploadFile = File(...),
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    content_type = (file.content_type or "").lower()
    extension = None
    if content_type in {"image/png", "image/x-png"}:
        extension = ".png"
    elif content_type in {"image/jpeg", "image/jpg"}:
        extension = ".jpg"
    else:
        raise HTTPException(status_code=400, detail="Unsupported logo format (PNG/JPEG only)")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    logo_path = f"admin-region/{target_region_id}/logo{extension}"

    try:
        upload_file_bytes(
            bucket="billing-logos",
            path=logo_path,
            data=data,
            content_type=content_type,
        )
    except RuntimeError as exc:
        logger.exception("upload_billing_logo failed for region_id=%s", target_region_id)
        raise HTTPException(status_code=502, detail="Logo upload failed") from exc

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET billing_logo_path = %s
                WHERE id = %s
                RETURNING billing_logo_path
                """,
                (logo_path, target_region_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {"billing_logo_path": row[0]}


@router.delete("/me/logo")
def clear_admin_region_logo(
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET billing_logo_path = NULL
                WHERE id = %s
                RETURNING billing_logo_path
                """,
                (target_region_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {"billing_logo_path": row[0]}


@router.get("/me/internal-billing")
def get_admin_region_internal_billing(
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    internal_billing_name,
                    internal_billing_iban,
                    internal_billing_street,
                    internal_billing_house_num,
                    internal_billing_postal_code,
                    internal_billing_city,
                    internal_billing_country,
                    internal_billing_logo_path
                FROM admin_region
                WHERE id = %s
                """,
                (target_region_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Admin region not found")

    return {
        "internal_billing_name": row[0],
        "internal_billing_iban": row[1],
        "internal_billing_street": row[2],
        "internal_billing_house_num": row[3],
        "internal_billing_postal_code": row[4],
        "internal_billing_city": row[5],
        "internal_billing_country": row[6],
        "internal_billing_logo_path": row[7],
    }


@router.put("/me/internal-billing")
def update_admin_region_internal_billing(
    payload: AdminRegionInternalBillingUpdate,
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    internal_billing_name = (payload.internal_billing_name or "").strip() or None
    internal_billing_iban = (payload.internal_billing_iban or "").strip() or None
    internal_billing_street = (payload.internal_billing_street or "").strip() or None
    internal_billing_house_num = (payload.internal_billing_house_num or "").strip() or None
    internal_billing_postal_code = (payload.internal_billing_postal_code or "").strip() or None
    internal_billing_city = (payload.internal_billing_city or "").strip() or None
    internal_billing_country = (payload.internal_billing_country or "").strip() or None

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET internal_billing_name = %s,
                    internal_billing_iban = %s,
                    internal_billing_street = %s,
                    internal_billing_house_num = %s,
                    internal_billing_postal_code = %s,
                    internal_billing_city = %s,
                    internal_billing_country = %s
                WHERE id = %s
                RETURNING
                    internal_billing_name,
                    internal_billing_iban,
                    internal_billing_street,
                    internal_billing_house_num,
                    internal_billing_postal_code,
                    internal_billing_city,
                    internal_billing_country,
                    internal_billing_logo_path
                """,
                (
                    internal_billing_name,
                    internal_billing_iban,
                    internal_billing_street,
                    internal_billing_house_num,
                    internal_billing_postal_code,
                    internal_billing_city,
                    internal_billing_country,
                    target_region_id,
                ),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {
        "internal_billing_name": row[0],
        "internal_billing_iban": row[1],
        "internal_billing_street": row[2],
        "internal_billing_house_num": row[3],
        "internal_billing_postal_code": row[4],
        "internal_billing_city": row[5],
        "internal_billing_country": row[6],
        "internal_billing_logo_path": row[7],
    }


@router.post("/me/internal-logo")
async def upload_admin_region_internal_logo(
    file: UploadFile = File(...),
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    content_type = (file.content_type or "").lower()
    extension = None
    if content_type in {"image/png", "image/x-png"}:
        extension = ".png"
    elif content_type in {"image/jpeg", "image/jpg"}:
        extension = ".jpg"
    else:
        raise HTTPException(status_code=400, detail="Unsupported logo format (PNG/JPEG only)")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    logo_path = f"admin-region/{target_region_id}/internal-logo{extension}"

    try:
        upload_file_bytes(
            bucket="billing-logos",
            path=logo_path,
            data=data,
            content_type=content_type,
        )
    except RuntimeError as exc:
        logger.exception("upload_internal_billing_logo failed for region_id=%s", target_region_id)
        raise HTTPException(status_code=502, detail="Logo upload failed") from exc

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET internal_billing_logo_path = %s
                WHERE id = %s
                RETURNING internal_billing_logo_path
                """,
                (logo_path, target_region_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {"internal_billing_logo_path": row[0]}


@router.delete("/me/internal-logo")
def clear_admin_region_internal_logo(
    admin_region_id: str | None = Query(default=None),
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    target_region_id = _resolve_admin_region_id(user, admin_region_id)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE admin_region
                SET internal_billing_logo_path = NULL
                WHERE id = %s
                RETURNING internal_billing_logo_path
                """,
                (target_region_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin region not found")
            conn.commit()

    return {"internal_billing_logo_path": row[0]}
