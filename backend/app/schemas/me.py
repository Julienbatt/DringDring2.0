from pydantic import BaseModel, field_validator
from typing import Optional


class MeResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    role: Optional[str] = None
    city_id: Optional[str] = None
    hq_id: Optional[str] = None
    shop_id: Optional[str] = None
    admin_region_id: Optional[str] = None
    client_id: Optional[str] = None
    courier_id: Optional[str] = None
    can_dispatch: bool = False

    @field_validator(
        "city_id",
        "hq_id",
        "shop_id",
        "admin_region_id",
        "client_id",
        "courier_id",
        mode="before",
    )
    @classmethod
    def _coerce_uuid(cls, value):
        if value is None:
            return None
        return str(value)
