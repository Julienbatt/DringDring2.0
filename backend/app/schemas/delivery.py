from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date


class DeliveryCreate(BaseModel):
    # Rattachements territoriaux
    shop_id: UUID
    hq_id: UUID
    admin_region_id: UUID
    city_id: UUID
    canton_id: UUID

    # Logistique
    delivery_date: date
    address: str
    postal_code: str
    city_name: str

    time_window: str
    bags: int = Field(ge=1, le=20)

    # Inputs tarifaires
    order_amount: Optional[float] = None
    basket_value: Optional[float] = None
    is_cms: bool = False
    floor: Optional[str] = None
    door_code: Optional[str] = None


class ShopDeliveryCreate(BaseModel):
    client_id: UUID
    delivery_date: date
    time_window: str
    bags: int = Field(ge=1, le=20)
    order_amount: Optional[float] = None
    basket_value: Optional[float] = None
    notes: Optional[str] = None
    floor: Optional[str] = None
    door_code: Optional[str] = None


class ShopDeliveryUpdate(BaseModel):
    delivery_date: Optional[date] = None
    time_window: Optional[str] = None
    bags: Optional[int] = Field(default=None, ge=1, le=20)
    order_amount: Optional[float] = None
    basket_value: Optional[float] = None
    notes: Optional[str] = None
    floor: Optional[str] = None
    door_code: Optional[str] = None


class ShopDeliveryCancel(BaseModel):
    reason: Optional[str] = None
