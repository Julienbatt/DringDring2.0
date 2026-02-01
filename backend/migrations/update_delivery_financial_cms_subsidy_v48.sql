-- Add CMS subsidy tracking to delivery_financial
ALTER TABLE delivery_financial
ADD COLUMN IF NOT EXISTS cms_subsidy DECIMAL(10, 2) NOT NULL DEFAULT 0;
