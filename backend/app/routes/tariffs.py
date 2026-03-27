from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Json
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone

from app.core.guards import require_admin_user, require_tariff_reader
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/tariffs", tags=["tariffs"])

class TariffCreate(BaseModel):
    name: str
    rule_type: str # 'bags_price' or 'order_amount'
    rule: Dict[str, Any] # JSON
    share: Dict[str, Any] # JSON config for shares (client, shop...)
    admin_region_id: Optional[str] = None

class TariffResponse(BaseModel):
    id: str # Grid ID
    name: str # Grid Name
    current_version_id: Optional[str]
    rule_type: Optional[str]
    rule: Optional[Dict[str, Any]]
    share: Optional[Dict[str, Any]]
    admin_region_id: str

@router.get("")
def list_tariffs(
    admin_region_id: Optional[str] = None,
    user: MeResponse = Depends(require_tariff_reader), 
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            if user.role == "shop":
                query = """
                    SELECT DISTINCT ON (g.id)
                        g.id, g.name, g.admin_region_id,
                        v.id as version_id, v.rule_type, v.rule, v.share
                    FROM shop s
                    JOIN tariff_version v ON v.id = s.tariff_version_id
                    JOIN tariff_grid g ON g.id = v.tariff_grid_id
                    WHERE s.id = %s
                      AND g.active = true
                      AND v.valid_to IS NULL
                    ORDER BY g.id
                """
                params = (user.shop_id,)
            elif user.role == "city":
                query = """
                    SELECT DISTINCT ON (g.id)
                        g.id, g.name, g.admin_region_id,
                        v.id as version_id, v.rule_type, v.rule, v.share
                    FROM shop s
                    JOIN tariff_version v ON v.id = s.tariff_version_id
                    JOIN tariff_grid g ON g.id = v.tariff_grid_id
                    WHERE s.city_id = %s
                      AND g.active = true
                      AND v.valid_to IS NULL
                    ORDER BY g.id
                """
                params = (user.city_id,)
            elif user.role == "hq":
                query = """
                    SELECT DISTINCT ON (g.id)
                        g.id, g.name, g.admin_region_id,
                        v.id as version_id, v.rule_type, v.rule, v.share
                    FROM shop s
                    JOIN tariff_version v ON v.id = s.tariff_version_id
                    JOIN tariff_grid g ON g.id = v.tariff_grid_id
                    WHERE s.hq_id = %s
                      AND g.active = true
                      AND v.valid_to IS NULL
                    ORDER BY g.id
                """
                params = (user.hq_id,)
            else:
                query = """
                    SELECT 
                        g.id, g.name, g.admin_region_id,
                        v.id as version_id, v.rule_type, v.rule, v.share
                    FROM tariff_grid g
                    LEFT JOIN tariff_version v
                      ON v.tariff_grid_id = g.id
                     AND v.valid_to IS NULL
                    WHERE g.active = true
                """
                params = []

                if user.role == "admin_region":
                    query += " AND g.admin_region_id = %s"
                    params.append(user.admin_region_id)
                elif user.role == "super_admin" and admin_region_id:
                    query += " AND g.admin_region_id = %s"
                    params.append(admin_region_id)

                query += " ORDER BY g.name"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            
    results = []
    for row in rows:
        grid_id, name, region_id, v_id, r_type, r_val, s_val = row
        results.append({
            "id": grid_id,
            "name": name,
            "admin_region_id": region_id,
            "current_version_id": v_id,
            "rule_type": r_type,
            "rule": r_val,
            "share": s_val
        })

    return results

@router.post("")
def create_tariff(
    tariff: TariffCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    # Determine region
    if user.role == 'super_admin':
        # Super admin must provide region context? 
        # For MVP, let's say Super Admin creates for *his* context region or fail.
        # But wait, tariffs are regional. 
        if tariff.admin_region_id:
            region_id = tariff.admin_region_id
        elif user.admin_region_id:
            region_id = user.admin_region_id
        else:
             # If Super Admin doesn't have a region context, we might restrict creation 
             # or require region_id in payload.
             # Let's assume user HAS admin_region_id (Drill down) or reject.
             raise HTTPException(status_code=400, detail="Super Admin must be in a region context to create tariffs (Drill-down).")
    else:
        region_id = user.admin_region_id

    grid_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            try:
                # 1. Create Grid
                cur.execute(
                    "INSERT INTO tariff_grid (id, name, admin_region_id) VALUES (%s, %s, %s)",
                    (grid_id, tariff.name, region_id)
                )
                
                # 2. Create Initial Version
                # Serialize JSON dicts using psycopg3's Jsonb
                from psycopg.types.json import Jsonb
                
                cur.execute(
                    """
                    INSERT INTO tariff_version (
                        id, tariff_grid_id, rule_type, rule, share, valid_from
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        version_id, 
                        grid_id, 
                        tariff.rule_type, 
                        Jsonb(tariff.rule), 
                        Jsonb(tariff.share), 
                        now
                    )
                )
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise
                
    return {"id": grid_id, "message": "Tariff created"}

@router.put("/{grid_id}")
def update_tariff(
    grid_id: str,
    tariff: TariffCreate,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Update a tariff grid by creating a NEW version.
    This preserves history strictly (WORM-like for versions).
    """
    # 1. Verify existence and ownership
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT admin_region_id FROM tariff_grid WHERE id = %s", (grid_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tariff Grid not found")
            
            grid_region_id = row[0]
            if user.role != 'super_admin' and str(user.admin_region_id) != str(grid_region_id):
                raise HTTPException(status_code=403, detail="Not authorized for this tariff grid")

            # 2. Update Grid Name if changed
            cur.execute(
                "UPDATE tariff_grid SET name = %s WHERE id = %s",
                (tariff.name, grid_id)
            )

            # 3. Close previous versions (set valid_to = now)
            # Logic: We assume the new version starts NOW, so previous ones end NOW.
            version_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            
            cur.execute(
                """
                UPDATE tariff_version 
                SET valid_to = %s 
                WHERE tariff_grid_id = %s 
                  AND (valid_to IS NULL OR valid_to > %s)
                """,
                (now, grid_id, now)
            )

            # 4. Create NEW Version
            from psycopg.types.json import Jsonb

            cur.execute(
                """
                INSERT INTO tariff_version (
                    id, tariff_grid_id, rule_type, rule, share, valid_from
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    version_id,
                    grid_id,
                    tariff.rule_type,
                    Jsonb(tariff.rule),
                    Jsonb(tariff.share),
                    now
                )
            )
            
            # 5. Propagate: Update all shops using this Grid to the new version
            # We identify shops by checking if their current tariff_version belongs to this grid.
            cur.execute(
                """
                UPDATE shop s
                SET tariff_version_id = %s
                FROM tariff_version old_tv
                WHERE s.tariff_version_id = old_tv.id
                  AND old_tv.tariff_grid_id = %s
                """,
                (version_id, grid_id)
            )
            
            conn.commit()

    return {"id": grid_id, "version_id": version_id, "message": "Tariff updated and propagated to shops"}

@router.delete("/{grid_id}")
def delete_tariff(
    grid_id: str,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    with get_db_connection(jwt_claims) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT admin_region_id FROM tariff_grid WHERE id = %s", (grid_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tariff Grid not found")

            grid_region_id = row[0]
            if user.role != 'super_admin' and str(user.admin_region_id) != str(grid_region_id):
                raise HTTPException(status_code=403, detail="Not authorized for this tariff grid")

            cur.execute(
                """
                SELECT 1
                FROM shop s
                JOIN tariff_version tv ON s.tariff_version_id = tv.id
                WHERE tv.tariff_grid_id = %s
                LIMIT 1
                """,
                (grid_id,),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Tariff grid is used by shops")

            cur.execute("UPDATE tariff_grid SET active = false WHERE id = %s", (grid_id,))
            conn.commit()

    return {"id": grid_id, "message": "Tariff grid disabled"}
