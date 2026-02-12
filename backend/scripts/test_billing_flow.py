
import sys
import os
import io
import uuid
import datetime
import decimal
import asyncio
from unittest.mock import patch, MagicMock

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from httpx import AsyncClient, ASGITransport
import psycopg

from app.main import app
from app.core.config import settings
from app.core.security import get_current_user_claims

conn = None


def get_conn():
    global conn
    if conn is None:
        conn = psycopg.connect(settings.DATABASE_URL, autocommit=True)
    return conn

def get_user_id(email):
    with get_conn().cursor() as cur:
        cur.execute("SELECT id FROM auth.users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"User not found: {email}. Did you run seed.py?")
        return str(row[0])

def get_client_id(city="Sion"):
    with get_conn().cursor() as cur:
        # Find a client in Sion (active shop city)
        cur.execute("SELECT id FROM client WHERE city_name = %s LIMIT 1", (city,))
        row = cur.fetchone()
        if not row:
             # Fallback to any client
            cur.execute("SELECT id FROM client LIMIT 1")
            row = cur.fetchone()
        return str(row[0])

SHOP_EMAIL = "shop_metropole@dringdring.ch"
HQ_EMAIL = "migros@dringdring.ch"
transport = ASGITransport(app=app)


def prepare_context():
    print("Fetching Test Data...")
    shop_user_id = get_user_id(SHOP_EMAIL)
    hq_user_id = get_user_id(HQ_EMAIL)
    client_id = get_client_id("Sion")
    print(f"Users found. Shop: {shop_user_id}, HQ: {hq_user_id}")

    today = datetime.date.today()
    current_month_str = today.strftime("%Y-%m")
    delivery_date = today.strftime("%Y-%m-%d")

    with get_conn().cursor() as cur:
        cur.execute("SELECT shop_id FROM profiles WHERE id = %s", (shop_user_id,))
        row = cur.fetchone()
        if not row or row[0] is None:
            raise RuntimeError(f"No shop_id linked to profile {shop_user_id}")
        shop_id = row[0]

        cur.execute(
            "DELETE FROM billing_period WHERE shop_id = %s AND period_month = %s",
            (shop_id, f"{current_month_str}-01"),
        )

        cur.execute(
            """
            UPDATE tariff_version
            SET share = '{"client": 33.33, "shop": 33.33, "city": 33.34, "admin_region": 0.0}'::jsonb
            WHERE id = (SELECT tariff_version_id FROM shop WHERE id = %s)
            """,
            (shop_id,),
        )

    return {
        "shop_user_id": shop_user_id,
        "hq_user_id": hq_user_id,
        "client_id": client_id,
        "shop_id": shop_id,
        "current_month_str": current_month_str,
        "delivery_date": delivery_date,
    }

async def run_test():
    ctx = prepare_context()
    shop_user_id = ctx["shop_user_id"]
    hq_user_id = ctx["hq_user_id"]
    client_id = ctx["client_id"]
    shop_id = ctx["shop_id"]
    current_month_str = ctx["current_month_str"]
    delivery_date = ctx["delivery_date"]

    patcher_upload = patch("app.core.billing_processing.upload_pdf_bytes")
    patcher_jwt = patch("app.core.security.jwt.decode")
    mock_upload = patcher_upload.start()
    mock_jwt_decode = patcher_jwt.start()
    mock_upload.return_value = f"shop/{shop_id}/{current_month_str}.pdf"

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            print("\nStarting E2E Billing Verification (Async + JWT Mock)")

            print(f"\nStep 1: Login as Shop ({SHOP_EMAIL}) and create delivery")
            mock_jwt_decode.return_value = {
                "sub": shop_user_id,
                "email": SHOP_EMAIL,
                "role": "authenticated",
                "app_metadata": {"role": "shop", "shop_id": str(shop_id)},
                "user_metadata": {},
            }

            payload = {
                "client_id": client_id,
                "delivery_date": delivery_date,
                "time_window": "08:00-12:00",
                "bags": 5,
                "order_amount": None,
            }
            headers = {"Authorization": "Bearer mock_token"}

            res = await client.post("/api/v1/deliveries/shop", json=payload, headers=headers)
            if res.status_code != 201:
                print(f"Failed to create delivery: {res.text}")
                return False
            print("Delivery created successfully")

            print(f"\nStep 2: Login as HQ ({HQ_EMAIL}) and review billing")
            with get_conn().cursor() as cur:
                cur.execute("SELECT hq_id FROM profiles WHERE id = %s", (hq_user_id,))
                hq_row = cur.fetchone()
                if not hq_row or hq_row[0] is None:
                    print(f"No hq_id linked to profile {hq_user_id}")
                    return False
                hq_id = str(hq_row[0])

            mock_jwt_decode.return_value = {
                "sub": hq_user_id,
                "email": HQ_EMAIL,
                "role": "authenticated",
                "app_metadata": {"role": "hq", "hq_id": hq_id},
                "user_metadata": {},
            }

            res = await client.get(f"/api/v1/reports/hq-billing?month={current_month_str}", headers=headers)
            if res.status_code != 200:
                print(f"Failed to fetch HQ billing: {res.text}")
                return False

            data = res.json()
            shop_row = next((r for r in data["rows"] if r["shop_id"] == str(shop_id)), None)
            if not shop_row:
                print("Shop not found in HQ billing report")
                return False

            print(f"   Found Shop: {shop_row['shop_name']}")
            print(f"   Deliveries: {shop_row['total_deliveries']}")
            print(f"   Status: {'Frozen' if shop_row['is_frozen'] else 'Open'}")

            print("\nStep 3: HQ freezes the period")
            res = await client.post(
                f"/api/v1/deliveries/shop/freeze?shop_id={shop_id}&month={current_month_str}&frozen_comment=AutoTest",
                headers=headers,
            )
            if res.status_code != 200:
                print(f"Failed to freeze period: {res.text}")
                return False

            json_res = res.json()
            print(f"Period Frozen. PDF Path: {json_res.get('pdf_path')}")

            if mock_upload.called:
                print("Backend attempted to upload PDF to Storage (Mocked)")
            else:
                print("Upload was not called!")
                return False

            print("\nStep 4: Shop tries to modify frozen period")
            mock_jwt_decode.return_value = {
                "sub": shop_user_id,
                "email": SHOP_EMAIL,
                "role": "authenticated",
                "app_metadata": {"role": "shop", "shop_id": str(shop_id)},
                "user_metadata": {},
            }

            res = await client.post("/api/v1/deliveries/shop", json=payload, headers=headers)
            if res.status_code == 409:
                print("System successfully BLOCKED creation (409 Conflict)")
            else:
                print(f"Unexpected status code: {res.status_code}. Should be 409.")
                return False

            print("\nALL CHECKS PASSED!")
            return True
    finally:
        patcher_upload.stop()
        patcher_jwt.stop()

if __name__ == "__main__":
    try:
        success = asyncio.run(run_test())
        if not success:
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if conn is not None:
            conn.close()
