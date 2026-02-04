from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.core.guards import require_shop_user, require_admin_user, require_customer_user
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/clients", tags=["clients"])

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
    active: bool = True

class ClientCreate(ClientBase):
    pass

class ClientSelfUpdate(BaseModel):
    name: str
    address: str
    postal_code: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
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

# --- Routes ---

@router.put("/{client_id}", response_model=dict)
def update_client(
    client_id: str,
    client: ClientCreate,
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
            else:
                cur.execute("SELECT name FROM city WHERE id = %s", (client.city_id,))
                city_row = cur.fetchone()
                if not city_row:
                    raise HTTPException(status_code=400, detail="Invalid city_id")
                city_name = city_row[0]

            cur.execute(
                """
                UPDATE client
                SET name = %s, address = %s, postal_code = %s, city_id = %s, city_name = %s,
                    active = %s, is_cms = %s, floor = %s, door_code = %s, phone = %s
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
                    client.phone,
                    client.lat,
                    client.lng,
                    client_id,
                ),
            )
            conn.commit()

    return {"id": client_id, "message": "Client updated successfully"}

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
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            admin_region_id = get_shop_admin_region(cur, shop_id)

            # Select all clients in that Admin Region
            cur.execute(
                """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_name, c.city_id::text as city_id, c.is_cms, 
                       c.floor, c.door_code, c.phone, c.active, c.lat, c.lng
                FROM client c
                JOIN city cc ON c.city_id = cc.id
                WHERE cc.admin_region_id = %s
                  AND c.active = true
                ORDER BY c.name
                """,
                (admin_region_id,),
            )
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]

@router.get("/admin", response_model=List[ClientResponse])
def list_admin_clients(
    admin_region_id: Optional[str] = None,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
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
                       c.floor, c.door_code, c.phone, c.active, c.lat, c.lng,
                       city.name as city_real_name
                FROM client c
                JOIN city ON c.city_id = city.id
                WHERE city.admin_region_id = %s
                  AND c.active = true
                ORDER BY c.name
                """
                params = (target_region_id,)
            else:
                query = """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_id::text as city_id, c.city_name, c.is_cms,
                       c.floor, c.door_code, c.phone, c.active, c.lat, c.lng,
                       city.name as city_real_name
                FROM client c
                JOIN city ON c.city_id = city.id
                WHERE c.active = true
                ORDER BY city.name, c.name
                """
                params = ()

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
                       c.floor, c.door_code, c.phone, c.active, c.lat, c.lng
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
            cur.execute(
                """
                UPDATE client
                SET name = %s,
                    address = %s,
                    postal_code = %s,
                    phone = %s,
                    floor = %s,
                    door_code = %s,
                    lat = %s,
                    lng = %s
                WHERE id = %s
                """,
                (
                    payload.name,
                    payload.address,
                    payload.postal_code,
                    payload.phone,
                    payload.floor,
                    payload.door_code,
                    payload.lat,
                    payload.lng,
                    client_id,
                ),
            )
            cur.execute(
                """
                SELECT c.id::text as id, c.name, COALESCE(c.address, '') as address, c.postal_code, c.city_name, c.city_id::text as city_id, c.is_cms,
                       c.floor, c.door_code, c.phone, c.active, c.lat, c.lng
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
            else:
                cur.execute("SELECT name FROM city WHERE id = %s", (client.city_id,))
                city_row = cur.fetchone()
                if not city_row:
                    raise HTTPException(status_code=400, detail="Invalid city_id")
                city_name = city_row[0]

            client_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO client (id, name, address, postal_code, city_name, city_id, active, is_cms, floor, door_code, phone, lat, lng)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    client.phone,
                    client.lat,
                    client.lng,
                ),
            )
            conn.commit()

    return {"id": client_id, "message": "Client created successfully"}

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

            client_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO client (id, name, address, postal_code, city_name, city_id, active, is_cms, floor, door_code, phone, lat, lng)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (client_id, client.name, client.address, client.postal_code, city_name, client.city_id, client.active, client.is_cms,
                 client.floor, client.door_code, client.phone, client.lat, client.lng)
            )
            conn.commit()

    return {"id": client_id, "message": "Client created successfully"}
