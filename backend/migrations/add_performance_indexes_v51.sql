-- Performance indexes for delivery-heavy queries
-- Safe to run on a live database (CREATE INDEX CONCURRENTLY is non-blocking)
-- Run each statement individually (CONCURRENTLY cannot run inside a transaction)

-- delivery: most queries filter by shop + date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_shop_date
    ON delivery (shop_id, delivery_date);

-- delivery: client-based lookups (customer portal, client billing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_client
    ON delivery (client_id);

-- delivery: city-based lookups (city billing reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_city
    ON delivery (city_id);

-- delivery: region-based lookups (admin dashboard, stats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_region
    ON delivery (admin_region_id);

-- delivery: date range queries (monthly reports, stats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_date
    ON delivery (delivery_date);

-- delivery_status: LATERAL subquery fetching latest status per delivery
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_status_latest
    ON delivery_status (delivery_id, updated_at DESC);
