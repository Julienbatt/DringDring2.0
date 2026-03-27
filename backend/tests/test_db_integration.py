"""Read-only integration tests against the real database.

These tests verify that SQL queries, joins, and schema assumptions
are correct against the actual staging database. They perform ONLY
SELECT operations — no INSERT, UPDATE, or DELETE.

Skipped automatically if DATABASE_URL_STAGING is not set (e.g., in CI).
"""

import os
import pytest
from datetime import date
from decimal import Decimal

# Skip entire module if no staging DB is configured
STAGING_URL = os.environ.get("DATABASE_URL_STAGING", "")
pytestmark = pytest.mark.skipif(not STAGING_URL, reason="DATABASE_URL_STAGING not set")


@pytest.fixture(scope="module")
def db_conn():
    """Module-scoped read-only DB connection."""
    import psycopg
    conn = psycopg.connect(STAGING_URL)
    yield conn
    conn.close()


@pytest.fixture
def cur(db_conn):
    """Per-test cursor, rolled back after each test for safety."""
    cur = db_conn.cursor()
    yield cur
    db_conn.rollback()  # Safety: rollback any accidental writes
    cur.close()


# ============================================================
# SCHEMA VALIDATION
# ============================================================

class TestSchemaIntegrity:
    """Verify critical tables and columns exist."""

    REQUIRED_TABLES = [
        "admin_region", "city", "client", "courier", "delivery",
        "shop", "tariff_grid", "tariff_version", "billing_document",
        "app_settings",
    ]

    def test_required_tables_exist(self, cur):
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )
        tables = {r[0] for r in cur.fetchall()}
        for t in self.REQUIRED_TABLES:
            assert t in tables, f"Required table '{t}' is missing"

    @pytest.mark.parametrize("table,column", [
        ("delivery", "id"),
        ("delivery", "shop_id"),
        ("delivery", "delivery_date"),
        ("delivery", "client_id"),
        ("delivery", "city_id"),
        ("shop", "id"),
        ("shop", "hq_id"),
        ("shop", "city_id"),
        ("client", "id"),
        ("client", "city_id"),
        ("tariff_version", "rule_type"),
        ("tariff_version", "rule"),
        ("tariff_version", "share"),
        ("admin_region", "billing_iban"),
        ("app_settings", "key"),
        ("app_settings", "value_numeric"),
        ("app_settings", "effective_from"),
    ])
    def test_required_columns_exist(self, cur, table, column):
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s AND column_name = %s",
            (table, column),
        )
        assert cur.fetchone() is not None, f"Column '{table}.{column}' is missing"


# ============================================================
# QUERY PATTERNS — verify key queries used by routes
# ============================================================

class TestDeliveryQueries:
    """Verify delivery-related queries work against real schema."""

    def test_delivery_count(self, cur):
        cur.execute("SELECT count(*) FROM delivery")
        count = cur.fetchone()[0]
        assert isinstance(count, int)
        assert count >= 0

    def test_delivery_with_shop_join(self, cur):
        """Query pattern from dispatch/deliveries endpoint."""
        cur.execute("""
            SELECT d.id, d.delivery_date, s.name AS shop_name
            FROM delivery d
            JOIN shop s ON s.id = d.shop_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        for row in rows:
            assert row[0] is not None  # delivery id
            assert row[1] is not None  # delivery_date
            assert row[2] is not None  # shop_name

    def test_delivery_with_client_join(self, cur):
        """Query pattern from reporting endpoints."""
        cur.execute("""
            SELECT d.id, d.delivery_date, cl.name AS client_name, c.name AS city_name
            FROM delivery d
            JOIN client cl ON cl.id = d.client_id
            JOIN city c ON c.id = d.city_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        for row in rows:
            assert row[0] is not None

    def test_delivery_logistics_join(self, cur):
        """Verify delivery_logistics table exists and joins work."""
        cur.execute(
            "SELECT to_regclass('public.delivery_logistics')"
        )
        result = cur.fetchone()
        if result and result[0] is not None:
            cur.execute("""
                SELECT d.id, dl.bags, dl.order_amount
                FROM delivery d
                LEFT JOIN delivery_logistics dl ON dl.delivery_id = d.id
                LIMIT 5
            """)
            rows = cur.fetchall()
            assert isinstance(rows, list)


class TestTariffQueries:
    """Verify tariff-related queries work."""

    def test_tariff_grid_list(self, cur):
        cur.execute("""
            SELECT tg.id, tg.name, tg.admin_region_id,
                   tv.rule_type, tv.rule, tv.share
            FROM tariff_grid tg
            LEFT JOIN tariff_version tv ON tv.tariff_grid_id = tg.id
                AND (tv.valid_to IS NULL OR tv.valid_to > CURRENT_DATE)
            ORDER BY tg.name
        """)
        rows = cur.fetchall()
        assert isinstance(rows, list)

    def test_tariff_version_jsonb(self, cur):
        """Verify JSONB rule/share columns are parseable."""
        cur.execute("""
            SELECT rule_type, rule, share
            FROM tariff_version
            WHERE rule IS NOT NULL
            LIMIT 5
        """)
        rows = cur.fetchall()
        for rule_type, rule, share in rows:
            assert rule_type in ("bags_price", "order_amount", "bags"), \
                f"Unknown rule_type: {rule_type}"
            assert isinstance(rule, dict), "rule should be a dict (JSONB)"
            if share is not None:
                assert isinstance(share, dict), "share should be a dict (JSONB)"


class TestVatRateQuery:
    """Verify the VAT rate query pattern from core/vat.py."""

    def test_app_settings_table_exists(self, cur):
        cur.execute("SELECT to_regclass('public.app_settings')")
        result = cur.fetchone()
        assert result is not None

    def test_vat_rate_query(self, cur):
        cur.execute("""
            SELECT value_numeric, effective_from
            FROM public.app_settings
            WHERE key = 'vat_rate'
            ORDER BY effective_from DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            rate, effective = row
            assert isinstance(rate, Decimal)
            assert rate > 0
            assert rate < 1  # VAT rate should be < 100%
            assert isinstance(effective, date)


class TestAdminRegionQueries:
    """Verify admin region queries used by billing."""

    def test_admin_region_billing_fields(self, cur):
        cur.execute("""
            SELECT id, name, billing_name, billing_iban,
                   billing_street, billing_postal_code, billing_city
            FROM admin_region
            LIMIT 5
        """)
        rows = cur.fetchall()
        assert len(rows) > 0, "Expected at least one admin_region"
        for row in rows:
            assert row[0] is not None  # id
            assert row[1] is not None  # name

    def test_region_to_city_join(self, cur):
        """Verify the city→admin_region relationship."""
        cur.execute("""
            SELECT c.id, c.name, c.admin_region_id, ar.name AS region_name
            FROM city c
            JOIN admin_region ar ON ar.id = c.admin_region_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        assert len(rows) > 0


class TestShopQueries:
    """Verify shop-related queries."""

    def test_shop_with_city_and_region(self, cur):
        """Query pattern from shops/admin endpoint."""
        cur.execute("""
            SELECT s.id, s.name, c.name AS city_name, ar.name AS region_name
            FROM shop s
            JOIN city c ON c.id = s.city_id
            JOIN admin_region ar ON ar.id = c.admin_region_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        assert isinstance(rows, list)

    def test_shop_tariff_join(self, cur):
        cur.execute("""
            SELECT s.id, s.name, tv.rule_type
            FROM shop s
            LEFT JOIN tariff_version tv ON tv.id = s.tariff_version_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        assert isinstance(rows, list)


class TestClientQueries:
    """Verify client-related queries."""

    def test_client_with_city(self, cur):
        cur.execute("""
            SELECT cl.id, cl.name, c.name AS city_name
            FROM client cl
            JOIN city c ON c.id = cl.city_id
            LIMIT 5
        """)
        rows = cur.fetchall()
        assert len(rows) > 0

    def test_client_active_filter(self, cur):
        """Verify active filter commonly used in routes."""
        cur.execute(
            "SELECT to_regclass('public.client')"
        )
        # Check if 'active' column exists
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'client' AND column_name = 'active'"
        )
        has_active = cur.fetchone() is not None
        if has_active:
            cur.execute("SELECT count(*) FROM client WHERE active = true")
            count = cur.fetchone()[0]
            assert count >= 0
