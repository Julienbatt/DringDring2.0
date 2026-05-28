-- Add per-delivery floor and door_code snapshot (mirrors client.floor / client.door_code added in v5)
ALTER TABLE public.delivery_logistics
ADD COLUMN IF NOT EXISTS floor TEXT;

ALTER TABLE public.delivery_logistics
ADD COLUMN IF NOT EXISTS door_code TEXT;
