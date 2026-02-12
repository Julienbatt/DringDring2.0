from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel
import uuid
import logging

import httpx

from app.core.guards import require_admin_user, require_hq_user
from app.core.config import settings
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/shops", tags=["shops"])
logger = logging.getLogger(__name__)

# --- Schemas ---

class ShopBase(BaseModel):
    name: str
    city_id: str
    hq_id: Optional[str] = None
    tariff_version_id: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class ShopCreate(ShopBase):
    pass

class ShopUpdate(ShopBase):
    pass

class ShopResponse(ShopBase):
    id: str
    city_name: Optional[str] = None
    hq_name: Optional[str] = None

class HQResponse(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class HQCreate(BaseModel):
    name: str
    address: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class TariffResponse(BaseModel):
    id: str
    name: str
    rule: Optional[str] = None
    # valid_from could be added if needed

# --- Routes ---

@router.get("/admin", response_model=List[ShopResponse])
def list_admin_shops(
    admin_region_id: Optional[str] = None, # Drill-down context
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    # Security: Enforce region for non-super admins
    target_region_id = admin_region_id
    if user.role != 'super_admin':
        if not user.admin_region_id:
             raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = user.admin_region_id

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if target_region_id:
                query = """
                SELECT s.id::text AS id,
                       s.name,
                       s.city_id::text AS city_id,
                       s.hq_id::text AS hq_id,
                       s.tariff_version_id::text AS tariff_version_id,
                       s.address, s.lat, s.lng, s.contact_person, s.email, s.phone,
                       c.name as city_name, h.name as hq_name
                FROM shop s
                JOIN city c ON s.city_id = c.id
                LEFT JOIN hq h ON s.hq_id = h.id
                WHERE c.admin_region_id = %s
                ORDER BY s.name
                LIMIT %s OFFSET %s
                """
                params = (target_region_id, limit, offset)
            else:
                # Super Admin global view
                query = """
                SELECT s.id::text AS id,
                       s.name,
                       s.city_id::text AS city_id,
                       s.hq_id::text AS hq_id,
                       s.tariff_version_id::text AS tariff_version_id,
                       s.address, s.lat, s.lng, s.contact_person, s.email, s.phone,
                       c.name as city_name, h.name as hq_name
                FROM shop s
                LEFT JOIN city c ON s.city_id = c.id
                LEFT JOIN hq h ON s.hq_id = h.id
                ORDER BY s.name
                LIMIT %s OFFSET %s
                """
                params = (limit, offset)

            cur.execute(query, params)
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]

@router.get("/hqs", response_model=List[HQResponse])
def list_hqs(
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            def has_column(table: str, column: str) -> bool:
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = %s
                      AND column_name = %s
                    """,
                    (table, column),
                )
                return cur.fetchone() is not None

            address_select = "address" if has_column("hq", "address") else "NULL::text as address"
            contact_select = "contact_person" if has_column("hq", "contact_person") else "NULL::text as contact_person"
            email_select = "email" if has_column("hq", "email") else "NULL::text as email"
            phone_select = "phone" if has_column("hq", "phone") else "NULL::text as phone"

            cur.execute(
                f"SELECT id::text as id, name, {address_select}, {contact_select}, {email_select}, {phone_select} FROM hq ORDER BY name LIMIT %s OFFSET %s",
                (limit, offset),
            )
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]

@router.post("/hqs", response_model=dict)
def create_hq(
    payload: HQCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="HQ name required")
    if not payload.address.strip():
        raise HTTPException(status_code=400, detail="HQ address required")
    hq_id = str(uuid.uuid4())
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hq (id, name, address, contact_person, email, phone)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    hq_id,
                    payload.name.strip(),
                    payload.address.strip(),
                    payload.contact_person,
                    payload.email,
                    payload.phone,
                ),
            )
            conn.commit()
    return {"id": hq_id, "message": "HQ created successfully"}

@router.put("/hqs/{hq_id}", response_model=dict)
def update_hq(
    hq_id: str,
    payload: HQCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="HQ name required")
    if not payload.address.strip():
        raise HTTPException(status_code=400, detail="HQ address required")
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hq
                SET name = %s,
                    address = %s,
                    contact_person = %s,
                    email = %s,
                    phone = %s
                WHERE id = %s
                """,
                (
                    payload.name.strip(),
                    payload.address.strip(),
                    payload.contact_person,
                    payload.email,
                    payload.phone,
                    hq_id,
                ),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="HQ not found")
            conn.commit()
    return {"id": hq_id, "message": "HQ updated successfully"}

@router.delete("/hqs/{hq_id}", response_model=dict)
def delete_hq(
    hq_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM shop WHERE hq_id = %s LIMIT 1", (hq_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="HQ has linked commerces")
            cur.execute("DELETE FROM hq WHERE id = %s", (hq_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="HQ not found")
            conn.commit()
    return {"id": hq_id, "message": "HQ deleted successfully"}

@router.get("/tariffs", response_model=List[TariffResponse])
def list_tariffs(
    admin_region_id: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT DISTINCT ON (t.id) 
                       v.id::text as id, t.name, v.rule::text as rule
                FROM tariff_grid t
                JOIN tariff_version v ON v.tariff_grid_id = t.id
                WHERE t.active = true
                  AND v.valid_to IS NULL
            """
            
            params = []
            if user.role != 'super_admin' and user.admin_region_id:
                query += " AND t.admin_region_id = %s"
                params.append(user.admin_region_id)
            elif user.role == 'super_admin' and admin_region_id:
                query += " AND t.admin_region_id = %s"
                params.append(admin_region_id)
            
            query += " ORDER BY t.id, v.valid_from DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, tuple(params))
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]


@router.get("/hq", response_model=List[ShopResponse])
def list_hq_shops(
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_hq_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    if not user.hq_id:
        raise HTTPException(status_code=400, detail="HQ id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id::text AS id,
                       s.name,
                       s.city_id::text AS city_id,
                       s.hq_id::text AS hq_id,
                       s.tariff_version_id::text AS tariff_version_id,
                       s.address, s.lat, s.lng, s.contact_person, s.email, s.phone,
                       c.name as city_name, h.name as hq_name
                FROM shop s
                JOIN city c ON s.city_id = c.id
                LEFT JOIN hq h ON h.id = s.hq_id
                WHERE s.hq_id = %s
                ORDER BY s.name
                LIMIT %s OFFSET %s
                """,
                (str(user.hq_id), limit, offset),
            )
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]

@router.get("/{shop_id}", response_model=ShopResponse)
def get_shop(
    shop_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id::text as id,
                       s.name,
                       s.city_id::text as city_id,
                       s.hq_id::text as hq_id,
                       s.tariff_version_id::text as tariff_version_id,
                       s.address, s.contact_person, s.email, s.phone,
                       c.name as city_name, h.name as hq_name
                FROM shop s
                LEFT JOIN city c ON s.city_id = c.id
                LEFT JOIN hq h ON s.hq_id = h.id
                WHERE s.id = %s
                """,
                (shop_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shop not found")
            
            columns = [desc[0] for desc in cur.description]
            shop_data = dict(zip(columns, row))
            
            # Security check: Ensure shop belongs to the admin's region
            if user.role != 'super_admin' and user.admin_region_id:
                # We need to verify the city of the shop is in the admin's region
                cur.execute("SELECT admin_region_id FROM city WHERE id = %s", (shop_data['city_id'],))
                city_row = cur.fetchone()
                if not city_row or str(city_row[0]) != str(user.admin_region_id):
                     raise HTTPException(status_code=403, detail="Access denied to this shop")

            return shop_data

@router.post("", response_model=dict)
def create_shop(
    shop: ShopCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = str(uuid.uuid4())
    if not shop.tariff_version_id:
        raise HTTPException(status_code=400, detail="Tariff version required for shop")
    
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT admin_region_id FROM city WHERE id = %s", (shop.city_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Commune partenaire not found")
            admin_region_id = row[0]

            # Verify region ownership
            if user.role != 'super_admin':
                 if not user.admin_region_id or str(admin_region_id) != str(user.admin_region_id):
                      raise HTTPException(status_code=403, detail="Cannot create shop in this city")

            cur.execute(
                """
                INSERT INTO shop (id, name, city_id, hq_id, tariff_version_id, address, lat, lng, contact_person, email, phone)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (shop_id, shop.name, shop.city_id, shop.hq_id, shop.tariff_version_id, shop.address, shop.lat, shop.lng, shop.contact_person, shop.email, shop.phone)
            )
            conn.commit()

    user_created = False
    user_error = None
    user_email = shop.email.strip() if shop.email else None
    if user_email and settings.SUPABASE_SERVICE_KEY and settings.SUPABASE_URL:
        try:
            use_password_flow = bool(settings.DEFAULT_USER_PASSWORD)
            url = (
                f"{settings.SUPABASE_URL}/auth/v1/admin/users"
                if use_password_flow
                else f"{settings.SUPABASE_URL}/auth/v1/invite"
            )
            headers = {
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            }
            metadata = {
                "role": "shop",
                "shop_id": shop_id,
                "city_id": shop.city_id,
                "admin_region_id": str(admin_region_id) if admin_region_id else None,
                "hq_id": shop.hq_id,
            }
            payload = (
                {
                    "email": user_email,
                    "password": settings.DEFAULT_USER_PASSWORD,
                    "email_confirm": True,
                    "app_metadata": metadata,
                }
                if use_password_flow
                else {"email": user_email, "data": metadata}
            )
            if not use_password_flow and settings.FRONTEND_URL:
                payload["redirect_to"] = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback"
            response = httpx.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code < 400:
                user_created = True
            else:
                user_error = response.text
                logger.warning("Shop user create failed: %s", response.text)
        except Exception as exc:  # pragma: no cover - external call
            user_error = str(exc)
            logger.warning("Shop user create error: %s", exc)

    return {
        "id": shop_id,
        "message": "Shop created successfully",
        "user_created": user_created,
        "user_email": user_email,
        "user_error": user_error,
    }

@router.put("/{shop_id}", response_model=dict)
def update_shop(
    shop_id: str,
    shop: ShopUpdate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if not shop.tariff_version_id:
        raise HTTPException(status_code=400, detail="Tariff version required for shop")
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            # Check existence and permission
            cur.execute(
                """
                SELECT s.id, c.admin_region_id 
                FROM shop s
                JOIN city c ON s.city_id = c.id
                WHERE s.id = %s
                """, 
                (shop_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shop not found")
            
            existing_region_id = row[1]

            if user.role != 'super_admin' and user.admin_region_id:
                if str(existing_region_id) != str(user.admin_region_id):
                    raise HTTPException(status_code=403, detail="Access denied")
                
                # Also verify the NEW city belongs to the same region
                cur.execute("SELECT admin_region_id FROM city WHERE id = %s", (shop.city_id,))
                new_city_row = cur.fetchone()
                if not new_city_row or str(new_city_row[0]) != str(user.admin_region_id):
                     raise HTTPException(status_code=403, detail="Cannot move shop to a city outside your region")

            cur.execute(
                """
                UPDATE shop 
                SET name = %s, city_id = %s, hq_id = %s, tariff_version_id = %s,
                    address = %s, lat = %s, lng = %s, contact_person = %s, email = %s, phone = %s
                WHERE id = %s
                """,
                (shop.name, shop.city_id, shop.hq_id, shop.tariff_version_id, 
                 shop.address, shop.lat, shop.lng, shop.contact_person, shop.email, shop.phone, shop_id)
            )
            conn.commit()

    return {"id": shop_id, "message": "Shop updated successfully"}

@router.delete("/{shop_id}", response_model=dict)
def delete_shop(
    shop_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, c.admin_region_id
                FROM shop s
                JOIN city c ON s.city_id = c.id
                WHERE s.id = %s
                """,
                (shop_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shop not found")
            existing_region_id = row[1]
            if user.role != 'super_admin' and user.admin_region_id:
                if str(existing_region_id) != str(user.admin_region_id):
                    raise HTTPException(status_code=403, detail="Access denied")

            cur.execute("SELECT 1 FROM delivery WHERE shop_id = %s LIMIT 1", (shop_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Commerce has linked deliveries")

            cur.execute("SELECT 1 FROM billing_period WHERE shop_id = %s LIMIT 1", (shop_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Commerce has linked billing periods")

            cur.execute("DELETE FROM shop WHERE id = %s", (shop_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=403, detail="Commerce delete blocked")
            conn.commit()

    return {"id": shop_id, "message": "Shop deleted successfully"}
