-- v50: Add NOT NULL constraint on delivery.shop_id to prevent orphan deliveries
-- Safe to apply: all existing deliveries already have a shop_id set.

ALTER TABLE delivery ALTER COLUMN shop_id SET NOT NULL;
