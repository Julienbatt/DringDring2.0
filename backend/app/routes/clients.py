from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import uuid
import logging

import httpx

from app.core.guards import require_shop_user, require_admin_user, require_customer_user
from app.core.config import settings
from app.core.security import get_current_user_claims, get_current_user
from app.db.session import get_db_connection
from app.schemas.me import MeResponse
from app.core.phone import normalize_phone, is_valid_swiss_phone

router = APIRouter(prefix="/clients", tags=["clients"])
logger = logging.getLogger(__name__)

# --- Schemas ---

class ClientBase(BaseModel):
    name: str
    address: str
    postal_code: str
    city_id: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_cms: bool = False
    floor: Optional[str] = None
    door_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    active: bool = True
    account_invite_status: Optional[str] = None
    account_invite_error: Optional[str] = None
    account_invited_at: Optional[datetime] = None

class ClientCreate(ClientBase):
    create_account: bool = False

class ClientUpdate(ClientBase):
    pass

class ClientSelfUpdate(BaseModel):
    name: str
    address: str
    postal_code: str
    city_name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    floor: Optional[str] = None
    door_code: Optional[str] = None

class ClientSelfCreate(BaseModel):
    name: str
    address: str
    postal_code: str
    city_name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    floor: Optional[str] = None
    door_code: Optional[str] = None

class ClientResponse(ClientBase):
    id: str
    city_name: Optional[str] = None
    # For admin view that joins with actual city name
    city_real_name: Optional[str] = None

# --- Helpers ---

def get_shop_admin_region(cur, shop_id: str) -> str:
    cur.execute(
        """
        SELECT c.admin_region_id
        FROM shop s
        JOIN city c ON s.city_id = c.id
        WHERE s.id = %s
        """,
        (shop_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Shop not found or disconnected from region")
    return row[0]

def validate_city_in_region(cur, city_id: str, admin_region_id: str) -> str:
    """
    Verifies that a city belongs to the given admin region.
    Returns the city name if valid.
    PROD-READY: Checks constraints before insert.
    """
    cur.execute("SELECT admin_region_id, name FROM city WHERE id = %s", (city_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid city_id")
    
    city_region_id, city_name = row
    if str(city_region_id) != str(admin_region_id):
        raise HTTPException(status_code=403, detail="City does not belong to the allowed region")
    
    return city_name


def get_city_name_and_region(cur, city_id: str) -> tuple[str, str]:
    cur.execute("SELECT name, admin_region_id::text FROM city WHERE id = %s", (city_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid city_id")
    return row[0], row[1]


def resolve_city_for_client(cur, postal_code: str, city_name: str):
    """
    Resolve city using postal_code first, then city name.
    If multiple matches exist (city name), return the first one (alphabetical).
    """
    if postal_code:
        cur.execute(
            """
            SELECT c.id, c.name, c.admin_region_id
            FROM city_postal_code pc
            JOIN city c ON c.id = pc.city_id
            WHERE pc.postal_code = %s
            LIMIT 1
            """,
            (postal_code,),
        )
        row = cur.fetchone()
        if row:
            return row
    if city_name:
        cur.execute(
            """
            SELECT c.id, c.name, c.admin_region_id
            FROM city c
            WHERE lower(c.name) = lower(%s)
            ORDER BY c.name
            LIMIT 1
            """,
            (city_name,),
        )
        row = cur.fetchone()
        if row:
            return row
    return None


def ensure_unique_active_client_email_in_region(
    cur,
    email: Optional[str],
    admin_region_id: Optional[str],
    exclude_client_id: Optional[str] = None,
):
    if not email or not admin_region_id:
        return

    normalized_email = email.strip().lower()
    if not normalized_email:
        return

    query = """
        SELECT c.id::text
        FROM client c
        JOIN city ci ON ci.id = c.city_id
        WHERE c.active = true
          AND ci.admin_region_id::text = %s
          AND lower(c.email) = %s
    """
    params: list = [admin_region_id, normalized_email]

    if exclude_client_id:
        query += " AND c.id::text <> %s"
        params.append(exclude_client_id)

    query += " LIMIT 1"
    cur.execute(query, tuple(params))
    existing = cur.fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Un client actif avec cet email existe deja dans cette region",
        )




def invite_customer_account(user_email: str, client_id: str):
    if not user_email or not settings.SUPABASE_SERVICE_KEY or not settings.SUPABASE_URL:
        return False, "Supabase service key missing"

    url = f"{settings.SUPABASE_URL}/auth/v1/invite"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "email": user_email,
        "data": {
            "role": "customer",
            "client_id": client_id,
        },
    }
    if settings.FRONTEND_URL:
        payload["redirect_to"] = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback"
    response = httpx.post(url, headers=headers, json=payload, timeout=10)
    if response.status_code < 400:
        return True, None
    return False, response.text

# --- Routes ---

@router.put("/{client_id}", response_model=dict)
def update_client(
    client_id: str,
    client: ClientUpdate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    admin_region_id = user.admin_region_id
    if user.role != 'super_admin' and not admin_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            # Check ownership via city->region relation
            cur.execute(
                """
                SELECT city.admin_region_id 
                FROM client 
                JOIN city ON client.city_id = city.id
                WHERE client.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            # Check authorization (is the client in the admin's region?)
            if user.role != 'super_admin' and str(row[0]) != str(admin_region_id):
                raise HTTPException(status_code=403, detail="Client not in your region")

            # Validate city ownership for admin_region; super_admin can target any city.
            if user.role != 'super_admin':
                city_name = validate_city_in_region(cur, client.city_id, admin_region_id)
                target_admin_region_id = str(admin_region_id)
            else:
                city_name, target_admin_region_id = get_city_name_and_region(cur, client.city_id)

            normalized_phone = normalize_phone(client.phone)
            if not is_valid_swiss_phone(normalized_phone):
                raise HTTPException(status_code=400, detail="Numero de telephone invalide. Format attendu: +41...")
            ensure_unique_active_client_email_in_region(
                cur,
                client.email,
                target_admin_region_id,
                exclude_client_id=client_id,
            )

            cur.execute(
                """
                UPDATE client
                SET name = %s, address = %s, postal_code = %s, city_id = %s, city_name = %s,
                    active = %s, is_cms = %s, floor = %s, door_code = %s, phone = %s, email = %s
                    , lat = %s, lng = %s
                WHERE id = %s
                """,
                (
                    client.name,
                    client.address,
                    client.postal_code,
                    client.city_id,
                    city_name,
                    client.active,
                    client.is_cms,
                    client.floor,
                    client.door_code,
                    normalized_phone,
                    client.email,
                    client.lat,
                    client.lng,
                    client_id,
                ),
            )
            conn.commit()

    return {"id": client_id, "message": "Client updated successfully"}


@router.post("/{client_id}/invite-account", response_model=dict)
def invite_existing_client_account(
    client_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    admin_region_id = user.admin_region_id
    if user.role != "super_admin" and not admin_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.email, city.admin_region_id
                FROM client c
                JOIN city ON c.city_id = city.id
                WHERE c.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            client_email, client_region_id = row
            if user.role != "super_admin" and str(client_region_id) != str(admin_region_id):
                raise HTTPException(status_code=403, detail="Client not in your region")

            if not client_email:
                raise HTTPException(status_code=400, detail="Email client requis pour inviter un compte")

            try:
                invited, invite_error = invite_customer_account(client_email.strip(), client_id)
            except Exception as exc:
                invited, invite_error = False, str(exc)

            if invited:
                cur.execute(
                    """
                    UPDATE client
                    SET account_invite_status = 'invited',
                        account_invite_error = NULL,
                        account_invited_at = now()
                    WHERE id = %s
                    """,
                    (client_id,),
                )
                conn.commit()
                return {
                    "id": client_id,
                    "status": "invited",
                    "message": "Invitation envoyee",
                }

            cur.execute(
                """
                UPDATE client
                SET account_invite_status = 'failed',
                    account_invite_error = %s
                WHERE id = %s
                """,
                (invite_error or "invite failed", client_id),
            )
            conn.commit()
            return {
                "id": client_id,
                "status": "failed",
                "message": "Invitation en echec",
                "error": invite_error or "invite failed",
            }


@router.delete("/{client_id}", response_model=dict)
def delete_client(
    client_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    admin_region_id = user.admin_region_id
    if user.role != 'super_admin' and not admin_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT city.admin_region_id
                FROM client
                JOIN city ON client.city_id = city.id
                WHERE client.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            if user.role != 'super_admin' and str(row[0]) != str(admin_region_id):
                raise HTTPException(status_code=403, detail="Client not in your region")

            cur.execute(
                """
                UPDATE client
                SET active = false
                WHERE id = %s
                """,
                (client_id,),
            )
            conn.commit()

    return {"id": client_id, "message": "Client deleted successfully"}


@router.get("/shop", response_model=List[ClientResponse])
def list_shop_clients(
    limit: int | None = None,
    offset: int = 0,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if offset < 0:
        offset = 0
    if limit is not None:
        if limit < 1:
            limit = 1
        limit = min(limit, 20000)
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            admin_region_id = get_shop_admin_region(cur, shop_id)

            # Select all clients in that Admin Region
            query = """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_name, c.city_id::text as city_id, c.is_cms, 
                       c.floor, c.door_code, c.phone, c.email, c.active, c.lat, c.lng,
                       c.account_invite_status, c.account_invite_error, c.account_invited_at
                FROM client c
                JOIN city cc ON c.city_id = cc.id
                WHERE cc.admin_region_id = %s
                  AND c.active = true
                ORDER BY c.name
            """
            params = [admin_region_id]
            if limit is not None:
                query += " LIMIT %s OFFSET %s"
                params.extend([limit, offset])
            cur.execute(query, tuple(params))
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]

@router.get("/admin", response_model=List[ClientResponse])
def list_admin_clients(
    admin_region_id: Optional[str] = None,
    limit: int | None = None,
    offset: int = 0,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if offset < 0:
        offset = 0
    if limit is not None:
        if limit < 1:
            limit = 1
        limit = min(limit, 20000)
    if user.role != 'super_admin':
        if not user.admin_region_id:
            raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = user.admin_region_id
    else:
        target_region_id = admin_region_id

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if target_region_id:
                query = """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_id::text as city_id, c.city_name, c.is_cms,
                       c.floor, c.door_code, c.phone, c.email, c.active, c.lat, c.lng,
                       c.account_invite_status, c.account_invite_error, c.account_invited_at,
                       city.name as city_real_name
                FROM client c
                JOIN city ON c.city_id = city.id
                WHERE city.admin_region_id = %s
                  AND c.active = true
                ORDER BY c.name
                """
                params = [target_region_id]
            else:
                query = """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_id::text as city_id, c.city_name, c.is_cms,
                       c.floor, c.door_code, c.phone, c.email, c.active, c.lat, c.lng,
                       c.account_invite_status, c.account_invite_error, c.account_invited_at,
                       city.name as city_real_name
                FROM client c
                JOIN city ON c.city_id = city.id
                WHERE c.active = true
                ORDER BY city.name, c.name
                """
                params = []

            if limit is not None:
                query += " LIMIT %s OFFSET %s"
                params.extend([limit, offset])

            cur.execute(query, params)
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row)) for row in rows]


@router.get("/me", response_model=ClientResponse)
def get_my_client(
    user: MeResponse = Depends(require_customer_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    client_id = user.client_id
    if not client_id:
        raise HTTPException(status_code=403, detail="Client access required")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_name, c.city_id::text as city_id, c.is_cms,
                       c.floor, c.door_code, c.phone, c.email, c.active, c.lat, c.lng
                FROM client c
                WHERE c.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            columns = [desc[0] for desc in cur.description]
            return dict(zip(columns, row))


@router.post("/me", response_model=ClientResponse)
def create_my_client(
    payload: ClientSelfCreate,
    user: MeResponse = Depends(get_current_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    if user.client_id:
        raise HTTPException(status_code=400, detail="Client already linked")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            resolved = resolve_city_for_client(cur, payload.postal_code, payload.city_name)
            if not resolved:
                raise HTTPException(status_code=400, detail="Commune introuvable pour ce NPA/Ville")
            city_id, city_name, admin_region_id = resolved

            normalized_phone = normalize_phone(payload.phone)
            if not is_valid_swiss_phone(normalized_phone):
                raise HTTPException(status_code=400, detail="Numero de telephone invalide. Format attendu: +41...")
            ensure_unique_active_client_email_in_region(
                cur,
                payload.email,
                str(admin_region_id),
            )

            client_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO client (id, name, address, postal_code, city_name, city_id, active, is_cms, floor, door_code, phone, email, lat, lng)
                VALUES (%s, %s, %s, %s, %s, %s, true, false, %s, %s, %s, %s, %s, %s)
                """,
                (
                    client_id,
                    payload.name,
                    payload.address,
                    payload.postal_code,
                    city_name,
                    city_id,
                    payload.floor,
                    payload.door_code,
                    normalized_phone,
                    payload.email,
                    payload.lat,
                    payload.lng,
                ),
            )
            cur.execute(
                """
                UPDATE public.profiles
                SET client_id = %s, city_id = %s, admin_region_id = %s
                WHERE id = %s
                """,
                (client_id, city_id, admin_region_id, user.user_id),
            )
            conn.commit()

            return {
                "id": client_id,
                "name": payload.name,
                "address": payload.address,
                "postal_code": payload.postal_code,
                "city_id": str(city_id),
                "city_name": city_name,
                "is_cms": False,
                "floor": payload.floor,
                "door_code": payload.door_code,
                "phone": normalized_phone,
                "email": payload.email,
                "active": True,
                "lat": payload.lat,
                "lng": payload.lng,
            }

@router.get("/me/support")
def get_my_client_support(
    user: MeResponse = Depends(require_customer_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    client_id = user.client_id
    if not client_id:
        raise HTTPException(status_code=403, detail="Client access required")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ar.id::text, ar.name, ar.contact_email, ar.contact_person, ar.phone
                FROM client c
                JOIN city ci ON ci.id = c.city_id
                JOIN admin_region ar ON ar.id = ci.admin_region_id
                WHERE c.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Admin region not found for client")

    return {
        "admin_region_id": row[0],
        "admin_region_name": row[1],
        "contact_email": row[2],
        "contact_person": row[3],
        "phone": row[4],
    }

@router.put("/me", response_model=ClientResponse)
def update_my_client(
    payload: ClientSelfUpdate,
    user: MeResponse = Depends(require_customer_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    client_id = user.client_id
    if not client_id:
        raise HTTPException(status_code=403, detail="Client access required")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            normalized_phone = normalize_phone(payload.phone)
            if not is_valid_swiss_phone(normalized_phone):
                raise HTTPException(status_code=400, detail="Numero de telephone invalide. Format attendu: +41...")
            resolved = resolve_city_for_client(cur, payload.postal_code, payload.city_name)
            if not resolved:
                raise HTTPException(status_code=400, detail="Commune introuvable pour ce NPA/Ville")
            city_id, city_name, admin_region_id = resolved
            ensure_unique_active_client_email_in_region(
                cur,
                payload.email,
                str(admin_region_id),
                exclude_client_id=client_id,
            )

            cur.execute(
                """
                UPDATE client
                SET name = %s,
                    address = %s,
                    postal_code = %s,
                    city_id = %s,
                    city_name = %s,
                    phone = %s,
                    floor = %s,
                    door_code = %s,
                    lat = %s,
                    lng = %s,
                    email = %s
                WHERE id = %s
                """,
                (
                    payload.name,
                    payload.address,
                    payload.postal_code,
                    city_id,
                    city_name,
                    normalized_phone,
                    payload.floor,
                    payload.door_code,
                    payload.lat,
                    payload.lng,
                    payload.email,
                    client_id,
                ),
            )
            cur.execute(
                """
                UPDATE public.profiles
                SET city_id = %s, admin_region_id = %s
                WHERE id = %s
                """,
                (city_id, admin_region_id, user.user_id),
            )
            cur.execute(
                """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_name, c.city_id::text as city_id, c.is_cms,
                       c.floor, c.door_code, c.phone, c.email, c.active, c.lat, c.lng
                FROM client c
                WHERE c.id = %s
                """,
                (client_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            columns = [desc[0] for desc in cur.description]
            conn.commit()
            return dict(zip(columns, row))

@router.post("", response_model=dict)
def create_client(
    client: ClientCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    admin_region_id = user.admin_region_id
    if user.role != 'super_admin' and not admin_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if user.role != 'super_admin':
                city_name = validate_city_in_region(cur, client.city_id, admin_region_id)
                target_admin_region_id = str(admin_region_id)
            else:
                city_name, target_admin_region_id = get_city_name_and_region(cur, client.city_id)

            normalized_phone = normalize_phone(client.phone)
            if not is_valid_swiss_phone(normalized_phone):
                raise HTTPException(status_code=400, detail="Numero de telephone invalide. Format attendu: +41...")
            ensure_unique_active_client_email_in_region(
                cur,
                client.email,
                target_admin_region_id,
            )

            client_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO client (id, name, address, postal_code, city_name, city_id, active, is_cms, floor, door_code, phone, email, lat, lng, account_invite_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    client_id,
                    client.name,
                    client.address,
                    client.postal_code,
                    city_name,
                    client.city_id,
                    client.active,
                    client.is_cms,
                    client.floor,
                    client.door_code,
                    normalized_phone,
                    client.email,
                    client.lat,
                    client.lng,
                    "not_requested",
                ),
            )
            conn.commit()

    user_created = False
    user_error = None
    user_email = client.email.strip() if client.email else None
    if client.create_account and user_email:
        try:
            user_created, user_error = invite_customer_account(user_email, client_id)
            if not user_created and user_error:
                logger.warning("Client invite failed: %s", user_error)
        except Exception as exc:  # pragma: no cover - external call
            user_error = str(exc)
            logger.warning("Client invite error: %s", exc)

    if client.create_account:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                if user_created:
                    cur.execute(
                        """
                        UPDATE client
                        SET account_invite_status = 'invited',
                            account_invite_error = NULL,
                            account_invited_at = now()
                        WHERE id = %s
                        """,
                        (client_id,),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE client
                        SET account_invite_status = 'failed',
                            account_invite_error = %s
                        WHERE id = %s
                        """,
                        (user_error,),
                    )
                conn.commit()

    return {
        "id": client_id,
        "message": "Client created successfully",
        "user_created": user_created,
        "user_email": user_email,
        "user_error": user_error,
    }

@router.post("/shop", response_model=dict)
def create_shop_client(
    client: ClientCreate,
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Allow Shop to create a client. 
    Must ensure the City of the new Client is in the same Admin Region as the Shop.
    """
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            admin_region_id = get_shop_admin_region(cur, shop_id)
            city_name = validate_city_in_region(cur, client.city_id, admin_region_id)

            normalized_phone = normalize_phone(client.phone)
            if not is_valid_swiss_phone(normalized_phone):
                raise HTTPException(status_code=400, detail="Numero de telephone invalide. Format attendu: +41...")
            ensure_unique_active_client_email_in_region(
                cur,
                client.email,
                str(admin_region_id),
            )

            client_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO client (id, name, address, postal_code, city_name, city_id, active, is_cms, floor, door_code, phone, email, lat, lng, account_invite_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (client_id, client.name, client.address, client.postal_code, city_name, client.city_id, client.active, client.is_cms,
                 client.floor, client.door_code, normalized_phone, client.email, client.lat, client.lng, "not_requested")
            )
            conn.commit()

    user_created = False
    user_error = None
    user_email = client.email.strip() if client.email else None
    if client.create_account and user_email:
        try:
            user_created, user_error = invite_customer_account(user_email, client_id)
            if not user_created and user_error:
                logger.warning("Client invite failed: %s", user_error)
        except Exception as exc:  # pragma: no cover - external call
            user_error = str(exc)
            logger.warning("Client invite error: %s", exc)

    if client.create_account:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                if user_created:
                    cur.execute(
                        """
                        UPDATE client
                        SET account_invite_status = 'invited',
                            account_invite_error = NULL,
                            account_invited_at = now()
                        WHERE id = %s
                        """,
                        (client_id,),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE client
                        SET account_invite_status = 'failed',
                            account_invite_error = %s
                        WHERE id = %s
                        """,
                        (user_error,),
                    )
                conn.commit()

    return {
        "id": client_id,
        "message": "Client created successfully",
        "user_created": user_created,
        "user_email": user_email,
        "user_error": user_error,
    }
