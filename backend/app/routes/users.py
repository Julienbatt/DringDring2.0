from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import logging

from app.core.config import settings
from app.core.guards import require_super_admin
from app.core.security import get_current_user_claims
from app.db.session import get_db_connection
from app.schemas.me import MeResponse

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)

class UserUpdate(BaseModel):
    role: str
    admin_region_id: Optional[str] = None
    shop_id: Optional[str] = None
    city_id: Optional[str] = None
    hq_id: Optional[str] = None

@router.get("")
def list_users(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=200, ge=1, le=1000),
    user: MeResponse = Depends(require_super_admin)
):
    """
    List users from Supabase Auth via Admin API.
    Only for Super Admin.
    """
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users?page={page}&per_page={per_page}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
    }

    try:
        response = httpx.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        users_data = response.json().get("users", [])
        
        # Transform for frontend
        results = []
        for u in users_data:
            meta = u.get("app_metadata", {})
            user_meta = u.get("user_metadata", {})
            results.append({
                "id": u["id"],
                "email": u.get("email"),
                "role": meta.get("role") or user_meta.get("role") or "authenticated",
                "last_sign_in_at": u.get("last_sign_in_at"),
                "created_at": u.get("created_at"),
                "shop_id": meta.get("shop_id") or user_meta.get("shop_id"),
                "city_id": meta.get("city_id") or user_meta.get("city_id"),
                "admin_region_id": meta.get("admin_region_id") or user_meta.get("admin_region_id")
            })
            
        return results
        
    except Exception as e:
        logger.exception("Failed to fetch users")
        raise HTTPException(status_code=500, detail="Unable to fetch users")

@router.put("/{user_id}")
def update_user_role(
    user_id: str,
    payload: UserUpdate,
    user: MeResponse = Depends(require_super_admin),
    jwt_claims: str = Depends(get_current_user_claims),
):
    """
    Update user app_metadata to set role and context IDs.
    """
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json"
    }
    
    # Validation: Ensure consistency between Role and IDs
    if payload.role == "shop" and not payload.shop_id:
        raise HTTPException(status_code=400, detail="shop_id required for 'shop' role")
    if payload.role == "city" and not payload.city_id:
        raise HTTPException(status_code=400, detail="city_id required for 'city' role")
    if payload.role == "hq" and not payload.hq_id:
        raise HTTPException(status_code=400, detail="hq_id required for 'hq' role")
    if payload.role == "admin_region" and not payload.admin_region_id:
        raise HTTPException(status_code=400, detail="admin_region_id required for 'admin_region' role")

    # Construct app_metadata update
    app_metadata = {
        "role": payload.role,
        "admin_region_id": payload.admin_region_id,
        "shop_id": payload.shop_id,
        "city_id": payload.city_id,
        "hq_id": payload.hq_id
    }
    
    # Clean None values? Supabase might merge or need explicit null.
    # Usually better to set null if we want to clear it.
    
    body = {
        "app_metadata": app_metadata
    }

    try:
        response = httpx.put(url, headers=headers, json=body, timeout=10)
        response.raise_for_status()
        with get_db_connection(jwt_claims) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO public.profiles (id, role, admin_region_id, shop_id, city_id, hq_id)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET role = EXCLUDED.role,
                            admin_region_id = EXCLUDED.admin_region_id,
                            shop_id = EXCLUDED.shop_id,
                            city_id = EXCLUDED.city_id,
                            hq_id = EXCLUDED.hq_id
                        """,
                        (
                            user_id,
                            payload.role,
                            payload.admin_region_id,
                            payload.shop_id,
                            payload.city_id,
                            payload.hq_id,
                        ),
                    )
        return {"message": "User updated", "user": response.json()}
    except Exception as e:
        logger.exception("Failed to update user")
        raise HTTPException(status_code=500, detail="Unable to update user")
