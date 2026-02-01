from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List
from datetime import date, timedelta
from pydantic import BaseModel
from uuid import UUID

from app.core.guards import require_admin_user
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/dispatch", tags=["dispatch"])

class DispatchDeliveryRow(BaseModel):
    id: UUID
    delivery_date: date
    shop_id: UUID
    shop_name: str
    shop_address: Optional[str]
    client_name: Optional[str]
    client_address: str
    client_city: str
    client_phone: Optional[str]
    client_floor: Optional[str]
    client_door_code: Optional[str]
    time_window: str
    notes: Optional[str]
    bags: Optional[int]
    short_code: Optional[str]
    status: Optional[str]
    courier_id: Optional[UUID]
    courier_name: Optional[str]
    courier_phone_number: Optional[str]

class AssignCourierPayload(BaseModel):
    courier_id: UUID

@router.get("/deliveries")
def list_dispatch_deliveries(
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    admin_region_id: Optional[str] = None, # Drill-down for Super Admin
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    List deliveries for the admin region to dispatch.
    Defaults to today + tomorrow if no dates provided.
    """
    target_region_id = user.admin_region_id
    
    if user.role == "super_admin":
        if admin_region_id:
             target_region_id = admin_region_id
        elif not target_region_id:
             # Fallback: if no region context, we cannot show dispatch list properly as it requires region filtering
             # or we show ALL (but that might vary by region logic).
             # Let's require it.
             raise HTTPException(status_code=400, detail="Super Admin must specify admin_region_id context")

    if not target_region_id:
        raise HTTPException(status_code=400, detail="Admin region id missing")

    if month:
        try:
            month_date = date.fromisoformat(f"{month}-01")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid month format") from exc
        month_end = (month_date.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        date_from = month_date
        date_to = month_end
    else:
        if not date_from:
            date_from = date.today()
        if not date_to:
            date_to = date.today() + timedelta(days=1)

    try:
        with get_db_connection(jwt_claims) as conn:
            with conn.cursor() as cur:
                # Join with Shop to get Shop layout
                # Join with delivery_logistics for details
                # Join with delivery_status for current status
                # Join with Courier to get contact info
                # Join with Client to get phone, floor, door code
                cur.execute(
                    f"""
                    SELECT
                        d.id,
                        d.delivery_date,
                        d.shop_id,
                        s.name as shop_name,
                        s.address as shop_address,
                        l.client_name,
                        l.address as client_address,
                        l.city_name as client_city,
                        cl.phone as client_phone,
                        cl.floor as client_floor,
                        cl.door_code as client_door_code,
                        l.time_window,
                        l.notes as notes,
                        l.bags as bags,
                        l.short_code as short_code,
                        st.status,
                        st.updated_at AS status_updated_at,
                        d.courier_id,
                        co.first_name as courier_first_name,
                        co.last_name as courier_last_name,
                        co.phone_number as courier_phone_number
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN city c ON c.id = s.city_id
                    JOIN delivery_logistics l ON l.delivery_id = d.id
                    LEFT JOIN client cl ON cl.id = d.client_id
                    LEFT JOIN courier co ON co.id = d.courier_id
                    LEFT JOIN LATERAL (
                        SELECT status, updated_at
                        FROM delivery_status
                        WHERE delivery_id = d.id
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) st ON true
                    WHERE c.admin_region_id = %s
                      AND d.delivery_date >= %s
                      AND d.delivery_date <= %s
                    ORDER BY d.delivery_date, l.time_window
                    """,
                    (target_region_id, date_from, date_to),
                )
                
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                
                results = []
                for row in rows:
                    item = {}
                    for col, val in zip(columns, row):
                         item[col] = val
                    # Composite name for convenience
                    if item.get("courier_first_name"):
                        item["courier_name"] = f"{item['courier_first_name']} {item['courier_last_name']}"
                    else:
                        item["courier_name"] = None
                    results.append(item)
                    
                return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/deliveries/{delivery_id}/complete")
def complete_delivery(
    delivery_id: UUID,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    user_region_id = user.admin_region_id

    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT c.admin_region_id
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN city c ON c.id = s.city_id
                    WHERE d.id = %s
                    """,
                    (str(delivery_id),)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Delivery not found")
                
                delivery_region_id = row[0]

                if user.role != 'super_admin':
                    if not user_region_id or str(delivery_region_id) != str(user_region_id):
                        raise HTTPException(status_code=403, detail="Not in your region")

                cur.execute(
                    """
                    INSERT INTO delivery_status (delivery_id, status)
                    VALUES (%s, 'delivered')
                    """,
                    (str(delivery_id),)
                )

    return {"status": "success"}

@router.patch("/deliveries/{delivery_id}/assign")
def assign_courier(
    delivery_id: UUID,
    payload: AssignCourierPayload,
    user: MeResponse = Depends(require_admin_user),
    jwt_claims: str = Depends(get_current_user_claims),
):
    # For assignment, simpler: we check the delivery's region, and verify user has access to it.
    user_region_id = user.admin_region_id
    # Super admin has global access, unless we want to enforce context.
    # We will enforce region match inside logic.
         
    with get_db_connection(jwt_claims) as conn:
        with conn:
            with conn.cursor() as cur:
                # Security check: does delivery belong to admin region?
                # RLS might handle it, but explicit check is safer for logic
                cur.execute(
                    """
                    SELECT c.admin_region_id 
                    FROM delivery d
                    JOIN shop s ON s.id = d.shop_id
                    JOIN city c ON c.id = s.city_id
                    WHERE d.id = %s
                    """,
                    (str(delivery_id),)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Delivery not found")
                
                delivery_region_id = row[0]

                if user.role != 'super_admin':
                     if not user_region_id or str(delivery_region_id) != str(user_region_id):
                          raise HTTPException(status_code=403, detail="Not in your region")

                cur.execute(
                    """
                    UPDATE delivery
                    SET courier_id = %s
                    WHERE id = %s
                    """,
                    (str(payload.courier_id), str(delivery_id))
                )
                
                # Mark as assigned; delivery can still be edited until picked up.
                cur.execute(
                    """
                    INSERT INTO delivery_status (delivery_id, status)
                    VALUES (%s, 'assigned')
                    """,
                    (str(delivery_id),)
                )
                
    return {"status": "success", "courier_id": str(payload.courier_id)}
