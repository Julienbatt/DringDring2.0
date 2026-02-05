from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import uuid
from typing import Optional, List

from app.core.guards import require_admin_or_city_user
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/cities", tags=["cities"])

class CityCreate(BaseModel):
    name: str
    canton_id: Optional[str] = None
    admin_region_id: Optional[str] = None # Required for Super Admin, Ignored for Admin Region
    parent_city_id: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    postal_codes: Optional[List[str]] = None

@router.get("")
def list_cities(
    admin_region_id: Optional[str] = None, # Drill-down context
    limit: int = 500,
    offset: int = 0,
    user: MeResponse = Depends(require_admin_or_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    if limit < 1:
        limit = 1
    if offset < 0:
        offset = 0
    limit = min(limit, 2000)
    # Security Context Enforcement
    if user.role == 'city':
        if not user.city_id:
            raise HTTPException(status_code=403, detail="City access required")
        target_city_id = user.city_id
        target_region_id = user.admin_region_id
    elif user.role != 'super_admin':
        if not user.admin_region_id:
             raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = user.admin_region_id
    else:
        target_region_id = admin_region_id
        
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            def has_column(column: str) -> bool:
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'city'
                      AND column_name = %s
                    """,
                    (column,),
                )
                return cur.fetchone() is not None

            if not has_column("parent_city_id"):
                raise HTTPException(
                    status_code=500,
                    detail="parent_city_id column missing; run update_city_hierarchy_v32.sql",
                )

            address_select = "MAX(c.address) as address" if has_column("address") else "NULL::text as address"
            contact_select = "MAX(c.contact_person) as contact_person" if has_column("contact_person") else "NULL::text as contact_person"
            email_select = "MAX(c.email) as email" if has_column("email") else "NULL::text as email"
            phone_select = "MAX(c.phone) as phone" if has_column("phone") else "NULL::text as phone"

            if user.role == 'city':
                query = f"""
                SELECT c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                       cn.name as canton_name, ar.name as admin_region_name,
                       p.name as parent_city_name,
                       {address_select}, {contact_select}, {email_select}, {phone_select},
                       COALESCE(array_agg(DISTINCT pc.postal_code) FILTER (WHERE pc.postal_code IS NOT NULL), '{{}}') as postal_codes
                FROM city c
                LEFT JOIN city p ON p.id = c.parent_city_id
                LEFT JOIN canton cn ON c.canton_id = cn.id
                LEFT JOIN admin_region ar ON c.admin_region_id = ar.id
                LEFT JOIN city_postal_code pc ON pc.city_id = c.id
                WHERE c.id = %s OR c.parent_city_id = %s
                GROUP BY c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                         cn.name, ar.name, p.name
                ORDER BY c.name
                LIMIT %s OFFSET %s
                """
                params = (target_city_id, target_city_id, limit, offset)
            elif target_region_id:
                query = f"""
                SELECT c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                       cn.name as canton_name, ar.name as admin_region_name,
                       p.name as parent_city_name,
                       {address_select}, {contact_select}, {email_select}, {phone_select},
                       COALESCE(array_agg(DISTINCT pc.postal_code) FILTER (WHERE pc.postal_code IS NOT NULL), '{{}}') as postal_codes
                FROM city c
                LEFT JOIN city p ON p.id = c.parent_city_id
                LEFT JOIN canton cn ON c.canton_id = cn.id
                LEFT JOIN admin_region ar ON c.admin_region_id = ar.id
                LEFT JOIN city_postal_code pc ON pc.city_id = c.id
                WHERE c.admin_region_id = %s
                GROUP BY c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                         cn.name, ar.name, p.name
                ORDER BY c.name
                LIMIT %s OFFSET %s
                """
                params = (target_region_id, limit, offset)
            else:
                # Super Admin Global View
                query = f"""
                SELECT c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                       cn.name as canton_name, ar.name as admin_region_name,
                       p.name as parent_city_name,
                       {address_select}, {contact_select}, {email_select}, {phone_select},
                       COALESCE(array_agg(DISTINCT pc.postal_code) FILTER (WHERE pc.postal_code IS NOT NULL), '{{}}') as postal_codes
                FROM city c
                LEFT JOIN city p ON p.id = c.parent_city_id
                LEFT JOIN canton cn ON c.canton_id = cn.id
                LEFT JOIN admin_region ar ON c.admin_region_id = ar.id
                LEFT JOIN city_postal_code pc ON pc.city_id = c.id
                GROUP BY c.id, c.name, c.canton_id, c.admin_region_id, c.parent_city_id,
                         cn.name, ar.name, p.name
                ORDER BY ar.name, c.name
                LIMIT %s OFFSET %s
                """
                params = (limit, offset)

            cur.execute(query, params)
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
def create_city(
    city: CityCreate,
    user: MeResponse = Depends(require_admin_or_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    # Determine region
    if user.role == 'city':
        if not user.admin_region_id or not user.city_id:
            raise HTTPException(status_code=403, detail="City access required")
        target_region_id = user.admin_region_id
    elif user.role != 'super_admin':
        if not user.admin_region_id:
             raise HTTPException(status_code=400, detail="Admin region id missing")
        target_region_id = user.admin_region_id
    else:
        if not city.admin_region_id:
             raise HTTPException(status_code=400, detail="admin_region_id required for Super Admin")
        target_region_id = city.admin_region_id

    city_id = str(uuid.uuid4())
    
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            def has_column(column: str) -> bool:
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'city'
                      AND column_name = %s
                    """,
                    (column,),
                )
                return cur.fetchone() is not None

            if not has_column("parent_city_id"):
                raise HTTPException(
                    status_code=500,
                    detail="parent_city_id column missing; run update_city_hierarchy_v32.sql",
                )

            # Check canton existence if provided
            canton_id_to_use = None
            if city.canton_id:
                cur.execute("SELECT id FROM canton WHERE id = %s", (city.canton_id,))
                if not cur.fetchone():
                     raise HTTPException(status_code=400, detail="Canton not found")
                canton_id_to_use = city.canton_id

            parent_city_id = None
            if user.role == 'city':
                if city.parent_city_id and str(city.parent_city_id) != str(user.city_id):
                    raise HTTPException(status_code=403, detail="City can only add zones under itself")
                parent_city_id = user.city_id
            elif city.parent_city_id:
                cur.execute(
                    "SELECT id, admin_region_id, parent_city_id FROM city WHERE id = %s",
                    (city.parent_city_id,),
                )
                parent_row = cur.fetchone()
                if not parent_row:
                    raise HTTPException(status_code=400, detail="Parent city not found")
                if parent_row[2] is not None:
                    raise HTTPException(status_code=400, detail="Parent city must be a commune")
                if str(parent_row[1]) != str(target_region_id):
                    raise HTTPException(status_code=400, detail="Parent city not in same region")
                parent_city_id = city.parent_city_id
            
            # Check region existence (mostly for SA check)
            cur.execute("SELECT id FROM admin_region WHERE id = %s", (target_region_id,))
            if not cur.fetchone():
                 raise HTTPException(status_code=400, detail="Admin Region not found")
                 
            columns = ["id", "name", "canton_id", "admin_region_id"]
            values = [city_id, city.name, canton_id_to_use, target_region_id]
            if has_column("parent_city_id"):
                columns.append("parent_city_id")
                values.append(parent_city_id)

            optional_fields = {
                "address": city.address,
                "contact_person": city.contact_person,
                "email": city.email,
                "phone": city.phone,
            }

            for column, value in optional_fields.items():
                if has_column(column):
                    columns.append(column)
                    values.append(value)

            placeholders = ", ".join(["%s"] * len(values))
            columns_sql = ", ".join(columns)

            cur.execute(
                f"""
                INSERT INTO city ({columns_sql})
                VALUES ({placeholders})
                RETURNING id
                """,
                tuple(values)
            )

            postal_codes = [pc.strip() for pc in (city.postal_codes or []) if pc and pc.strip()]
            for postal_code in postal_codes:
                cur.execute(
                    "SELECT city_id FROM city_postal_code WHERE postal_code = %s",
                    (postal_code,),
                )
                existing = cur.fetchone()
                if existing and str(existing[0]) != str(city_id):
                    raise HTTPException(status_code=400, detail=f"Postal code already used: {postal_code}")
                cur.execute(
                    "INSERT INTO city_postal_code (city_id, postal_code) VALUES (%s, %s)",
                    (city_id, postal_code),
                )
            conn.commit()
            
    return {"id": city_id, "message": "City created successfully"}

@router.put("/{city_id}")
def update_city(
    city_id: str,
    city: CityCreate,
    user: MeResponse = Depends(require_admin_or_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    # Verify existence and permissions
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            def has_column(column: str) -> bool:
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'city'
                      AND column_name = %s
                    """,
                    (column,),
                )
                return cur.fetchone() is not None

            # Check city and region ownership
            cur.execute("SELECT admin_region_id, parent_city_id FROM city WHERE id = %s", (city_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="City not found")
            
            existing_region_id = row[0]
            existing_parent_id = row[1]

            update_admin_region = False
            if user.role == 'city':
                if not user.city_id or not user.admin_region_id:
                    raise HTTPException(status_code=403, detail="City access required")
                if str(existing_region_id) != str(user.admin_region_id):
                    raise HTTPException(status_code=403, detail="City access required")
                if str(city_id) != str(user.city_id) and str(existing_parent_id) != str(user.city_id):
                    raise HTTPException(status_code=403, detail="City access required")
            elif user.role != 'super_admin':
                if not user.admin_region_id:
                    raise HTTPException(status_code=400, detail="Admin region id missing")
                if not existing_region_id:
                    update_admin_region = True
                    existing_region_id = user.admin_region_id
                elif str(user.admin_region_id) != str(existing_region_id):
                    if existing_parent_id:
                        cur.execute(
                            "SELECT admin_region_id FROM city WHERE id = %s",
                            (existing_parent_id,),
                        )
                        parent_row = cur.fetchone()
                        if parent_row and str(parent_row[0]) == str(user.admin_region_id):
                            update_admin_region = True
                            existing_region_id = user.admin_region_id
                        else:
                            raise HTTPException(status_code=403, detail="Not authorized for this city")
                    else:
                        raise HTTPException(status_code=403, detail="Not authorized for this city")

            parent_city_id = existing_parent_id
            fields_set = getattr(city, "__fields_set__", set())
            parent_provided = "parent_city_id" in fields_set

            if user.role == 'city':
                if str(city_id) == str(user.city_id):
                    parent_city_id = None
                else:
                    if city.parent_city_id and str(city.parent_city_id) != str(user.city_id):
                        raise HTTPException(status_code=403, detail="City can only assign its own parent")
                    parent_city_id = user.city_id
            elif parent_provided:
                requested_parent = city.parent_city_id or None
                if requested_parent:
                    if str(requested_parent) == str(city_id):
                        raise HTTPException(status_code=400, detail="Parent city cannot be itself")
                    cur.execute(
                        "SELECT id, admin_region_id, parent_city_id FROM city WHERE id = %s",
                        (requested_parent,),
                    )
                    parent_row = cur.fetchone()
                    if not parent_row:
                        raise HTTPException(status_code=400, detail="Parent city not found")
                    if parent_row[2] is not None:
                        raise HTTPException(status_code=400, detail="Parent city must be a commune")
                    if str(parent_row[1]) != str(existing_region_id):
                        raise HTTPException(status_code=400, detail="Parent city not in same region")
                parent_city_id = requested_parent

            # Update
            set_clauses = ["name = %s"]
            values = [city.name]

            if has_column("address"):
                set_clauses.append("address = %s")
                values.append(city.address)
            if has_column("contact_person"):
                set_clauses.append("contact_person = %s")
                values.append(city.contact_person)
            if has_column("email"):
                set_clauses.append("email = %s")
                values.append(city.email)
            if has_column("phone"):
                set_clauses.append("phone = %s")
                values.append(city.phone)
            if update_admin_region:
                set_clauses.append("admin_region_id = %s")
                values.append(existing_region_id)
            if has_column("parent_city_id") and (user.role == 'city' or parent_provided):
                set_clauses.append("parent_city_id = %s")
                values.append(parent_city_id)

            set_sql = ", ".join(set_clauses)
            cur.execute(
                f"""
                UPDATE city
                SET {set_sql}
                WHERE id = %s
                """,
                tuple(values + [city_id])
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=403, detail="City update blocked")

            if city.postal_codes is not None:
                cur.execute("DELETE FROM city_postal_code WHERE city_id = %s", (city_id,))
                postal_codes = [pc.strip() for pc in (city.postal_codes or []) if pc and pc.strip()]
                for postal_code in postal_codes:
                    cur.execute(
                        "SELECT city_id FROM city_postal_code WHERE postal_code = %s",
                        (postal_code,),
                    )
                    existing = cur.fetchone()
                    if existing and str(existing[0]) != str(city_id):
                        raise HTTPException(status_code=400, detail=f"Postal code already used: {postal_code}")
                    cur.execute(
                        "INSERT INTO city_postal_code (city_id, postal_code) VALUES (%s, %s)",
                        (city_id, postal_code),
                    )
            conn.commit()
            
    return {"id": city_id, "message": "City updated successfully"}


@router.delete("/{city_id}")
def delete_city(
    city_id: str,
    user: MeResponse = Depends(require_admin_or_city_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT admin_region_id, parent_city_id FROM city WHERE id = %s", (city_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="City not found")

            existing_region_id, existing_parent_id = row

            if user.role == 'city':
                if not user.city_id:
                    raise HTTPException(status_code=403, detail="City access required")
                if str(existing_parent_id) != str(user.city_id):
                    raise HTTPException(status_code=403, detail="City access required")
            elif user.role != 'super_admin' and str(user.admin_region_id) != str(existing_region_id):
                raise HTTPException(status_code=403, detail="Not authorized for this city")

            cur.execute("SELECT 1 FROM city WHERE parent_city_id = %s LIMIT 1", (city_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Remove zones before deleting commune")

            cur.execute("SELECT 1 FROM shop WHERE city_id = %s LIMIT 1", (city_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="City has linked commerces")

            cur.execute("SELECT 1 FROM client WHERE city_id = %s LIMIT 1", (city_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="City has linked clients")

            cur.execute("SELECT 1 FROM delivery WHERE city_id = %s LIMIT 1", (city_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="City has linked deliveries")

            cur.execute("DELETE FROM city WHERE id = %s", (city_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=403, detail="City delete blocked")

            conn.commit()

    return {"id": city_id, "message": "City deleted successfully"}

from app.core.guards import require_shop_user

@router.get("/shop")
def list_shop_cities(
    user: MeResponse = Depends(require_shop_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    shop_id = user.shop_id
    if not shop_id:
        raise HTTPException(status_code=400, detail="Shop id missing")

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
             # Get Shop's Admin Region
            cur.execute(
                """
                SELECT c.admin_region_id
                FROM shop s
                JOIN city c ON s.city_id = c.id
                WHERE s.id = %s
                """,
                (shop_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shop not found or disconnected")
            admin_region_id = row[0]

            cur.execute(
                """
                SELECT c.id, c.name
                FROM city c
                WHERE c.admin_region_id = %s
                ORDER BY c.name
                """,
                (admin_region_id,)
            )
            rows = cur.fetchall()
            
    results = []
    for row in rows:
        results.append({"id": row[0], "name": row[1]})
        
    return results
