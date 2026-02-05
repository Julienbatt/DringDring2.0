-- Add can_dispatch flag for couriers who can operate dispatch when needed
ALTER TABLE courier
ADD COLUMN IF NOT EXISTS can_dispatch BOOLEAN NOT NULL DEFAULT FALSE;
