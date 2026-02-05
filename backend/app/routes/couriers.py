from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import uuid
import logging
import re

from app.core.guards import require_admin_user, require_dispatch_user, require_shop_user # Maybe just admin_region for now? user said "Admin Region"
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/couriers", tags=["couriers"])
logger = logging.getLogger(__name__)


def _normalize_phone_number(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"[^\d+]", "", value.strip())
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


def _is_valid_ch_phone(value: str | None) -> bool:
    if not value:
        return False
    digits = re.sub(r"\D", "", value)
    return digits.startswith("41") and len(digits) == 11

class CourierCreate(BaseModel):
    first_name: str
    last_name: str
    courier_number: str
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    vehicle_type: Optional[str] = 'bike'
    active: bool = True
    can_dispatch: bool = False
    admin_region_id: Optional[str] = None

class CourierResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    courier_number: str
    phone_number: Optional[str]
    email: Optional[str]
    vehicle_type: Optional[str]
    active: bool
    can_dispatch: bool
    admin_region_name: Optional[str] # Context for Super Admin
    
@router.get("")
def list_couriers(
    admin_region_id: Optional[str] = None, # Drill-down context for Super Admin
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_dispatch_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    # Security: Only Super Admin can specify a region to view.
    # For others, we FORCE their own region.
    if user.role != 'super_admin':
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin Context missing")
        # Override any requested region with the user's actual region
        target_region_id = user.admin_region_id
    else:
        # Super Admin: if param provided, use it (Drill-Down). If not, None (See all).
        target_region_id = admin_region_id
    
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'vehicle_type'
                """
            )
            has_vehicle_type = cur.fetchone() is not None
            vehicle_select = "c.vehicle_type" if has_vehicle_type else "NULL::text"
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'can_dispatch'
                """
            )
            has_can_dispatch = cur.fetchone() is not None
            can_dispatch_select = "c.can_dispatch" if has_can_dispatch else "FALSE::boolean"

            if target_region_id:
                 # Filter by specific region (Drill-Down OR Admin Region view)
                 query = """
                    SELECT c.id, c.first_name, c.last_name, c.courier_number, c.phone_number, c.email, c.active, {vehicle_select} as vehicle_type, {can_dispatch_select} as can_dispatch, ar.name as admin_region_name
                    FROM courier c
                    LEFT JOIN admin_region ar ON c.admin_region_id = ar.id
                    WHERE c.admin_region_id = %s
                    ORDER BY c.last_name, c.first_name
                    LIMIT %s OFFSET %s
                 """
                 params = (target_region_id, limit, offset)
            else:
                 # Super Admin seeing ALL (No drill-down)
                 query = """
                    SELECT c.id, c.first_name, c.last_name, c.courier_number, c.phone_number, c.email, c.active, {vehicle_select} as vehicle_type, {can_dispatch_select} as can_dispatch, ar.name as admin_region_name
                    FROM courier c
                    LEFT JOIN admin_region ar ON c.admin_region_id = ar.id
                    ORDER BY ar.name, c.last_name, c.first_name
                    LIMIT %s OFFSET %s
                 """
                 params = (limit, offset)

            try:
                cur.execute(query.format(vehicle_select=vehicle_select, can_dispatch_select=can_dispatch_select), params)
            except Exception as exc:
                if "vehicle_type" in str(exc):
                    cur.execute(query.format(vehicle_select="NULL::text", can_dispatch_select=can_dispatch_select), params)
                else:
                    raise
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
def create_courier(
    courier: CourierCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    admin_region_id = user.admin_region_id

    if user.role == 'super_admin':
        if courier.admin_region_id:
            admin_region_id = courier.admin_region_id
        elif not admin_region_id:
            raise HTTPException(status_code=400, detail="admin_region_id required for Super Admin")
    else:
        if not admin_region_id:
            raise HTTPException(status_code=403, detail="Must be part of an admin region")

    courier_id = str(uuid.uuid4())
    normalized_phone = _normalize_phone_number(courier.phone_number)
    if not normalized_phone or not _is_valid_ch_phone(normalized_phone):
        raise HTTPException(
            status_code=400,
            detail="Telephone requis au format +41XXXXXXXXX.",
        )
    
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'vehicle_type'
                """
            )
            has_vehicle_type = cur.fetchone() is not None
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'can_dispatch'
                """
            )
            has_can_dispatch = cur.fetchone() is not None
            try:
                if has_vehicle_type:
                    if has_can_dispatch:
                        cur.execute(
                            """
                            INSERT INTO courier (
                                id, first_name, last_name, courier_number, phone_number, email, active, 
                                vehicle_type, can_dispatch, admin_region_id
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                courier_id,
                                courier.first_name,
                                courier.last_name,
                                courier.courier_number,
                                normalized_phone,
                                courier.email,
                                courier.active,
                                courier.vehicle_type,
                                courier.can_dispatch,
                                admin_region_id
                            )
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO courier (
                                id, first_name, last_name, courier_number, phone_number, email, active, 
                                vehicle_type, admin_region_id
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                courier_id,
                                courier.first_name,
                                courier.last_name,
                                courier.courier_number,
                                normalized_phone,
                                courier.email,
                                courier.active,
                                courier.vehicle_type,
                                admin_region_id
                            )
                        )
                else:
                    if has_can_dispatch:
                        cur.execute(
                            """
                            INSERT INTO courier (
                                id, first_name, last_name, courier_number, phone_number, email, active, 
                                can_dispatch, admin_region_id
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                courier_id,
                                courier.first_name,
                                courier.last_name,
                                courier.courier_number,
                                normalized_phone,
                                courier.email,
                                courier.active,
                                courier.can_dispatch,
                                admin_region_id
                            )
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO courier (
                                id, first_name, last_name, courier_number, phone_number, email, active, 
                                admin_region_id
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                courier_id,
                                courier.first_name,
                                courier.last_name,
                                courier.courier_number,
                                normalized_phone,
                                courier.email,
                                courier.active,
                                admin_region_id
                            )
                        )
                conn.commit()
            except Exception as e:
                conn.rollback()
                if "unique constraint" in str(e).lower():
                     raise HTTPException(status_code=400, detail="Ce numéro de coursier existe déjà.")
                raise e
            
    return {"id": courier_id, "message": "Courier created successfully"}

@router.put("/{courier_id}")
def update_courier(
    courier_id: str,
    courier: CourierCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    # Verify existence and permissions (Admin Region check)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'vehicle_type'
                """
            )
            has_vehicle_type = cur.fetchone() is not None
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'courier'
                  AND column_name = 'can_dispatch'
                """
            )
            has_can_dispatch = cur.fetchone() is not None
            # Check existence
            cur.execute("SELECT admin_region_id, phone_number FROM courier WHERE id = %s", (courier_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Courier not found")
            existing_phone = row[1]

            # Admin region safety: never allow cross-region edits
            if user.role != 'super_admin':
                if not user.admin_region_id:
                    raise HTTPException(status_code=403, detail="Admin region context required")
                if courier.admin_region_id and str(courier.admin_region_id) != str(user.admin_region_id):
                    raise HTTPException(status_code=403, detail="Cannot assign courier to different region")
            
            where_sql = "WHERE id = %s"
            where_params = [courier_id]
            if user.role != 'super_admin':
                where_sql += " AND admin_region_id = %s"
                where_params.append(user.admin_region_id)

            normalized_phone = _normalize_phone_number(courier.phone_number)
            if courier.phone_number:
                if not normalized_phone or not _is_valid_ch_phone(normalized_phone):
                    if courier.phone_number != (existing_phone or ""):
                        raise HTTPException(
                            status_code=400,
                            detail="Telephone invalide. Format attendu: +41XXXXXXXXX.",
                        )
            phone_value = normalized_phone if normalized_phone else (None if courier.phone_number == "" else existing_phone)

            if has_vehicle_type:
                if has_can_dispatch:
                    cur.execute(
                        f"""
                        UPDATE courier 
                        SET first_name = %s, last_name = %s, courier_number = %s, 
                            phone_number = %s, email = %s, active = %s, vehicle_type = %s,
                            can_dispatch = %s
                        {where_sql}
                        """,
                        [
                            courier.first_name,
                            courier.last_name,
                            courier.courier_number,
                            phone_value,
                            courier.email,
                            courier.active,
                            courier.vehicle_type,
                            courier.can_dispatch,
                            *where_params,
                        ],
                    )
                else:
                    cur.execute(
                        f"""
                        UPDATE courier 
                        SET first_name = %s, last_name = %s, courier_number = %s, 
                            phone_number = %s, email = %s, active = %s, vehicle_type = %s
                        {where_sql}
                        """,
                        [
                            courier.first_name,
                            courier.last_name,
                            courier.courier_number,
                            phone_value,
                            courier.email,
                            courier.active,
                            courier.vehicle_type,
                            *where_params,
                        ],
                    )
            else:
                if has_can_dispatch:
                    cur.execute(
                        f"""
                        UPDATE courier 
                        SET first_name = %s, last_name = %s, courier_number = %s, 
                            phone_number = %s, email = %s, active = %s, can_dispatch = %s
                        {where_sql}
                        """,
                        [
                            courier.first_name,
                            courier.last_name,
                            courier.courier_number,
                            phone_value,
                            courier.email,
                            courier.active,
                            courier.can_dispatch,
                            *where_params,
                        ],
                    )
                else:
                    cur.execute(
                        f"""
                        UPDATE courier 
                        SET first_name = %s, last_name = %s, courier_number = %s, 
                            phone_number = %s, email = %s, active = %s
                        {where_sql}
                        """,
                        [
                            courier.first_name,
                            courier.last_name,
                            courier.courier_number,
                            phone_value,
                            courier.email,
                            courier.active,
                            *where_params,
                        ],
                    )
            if cur.rowcount == 0:
                raise HTTPException(status_code=403, detail="Not authorized for this courier")
            conn.commit()
            
    return {"id": courier_id, "message": "Courier updated successfully"}

