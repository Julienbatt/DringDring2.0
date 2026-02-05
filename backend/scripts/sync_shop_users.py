import os
import sys
import json
from pathlib import Path

import httpx
import psycopg

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from app.core.config import settings


def _load_env_file(path: Path) -> dict:
    data = {}
    if not path.exists():
        return data
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def _get_settings():
    backend_env = _load_env_file(Path(__file__).resolve().parent.parent / ".env")
    supabase_url = os.getenv("SUPABASE_URL") or backend_env.get("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or backend_env.get("SUPABASE_SERVICE_KEY")
    default_password = os.getenv("DEFAULT_USER_PASSWORD") or backend_env.get("DEFAULT_USER_PASSWORD") or "password123"
    database_url = os.getenv("DATABASE_URL") or backend_env.get("DATABASE_URL")
    return supabase_url, service_key, default_password, database_url


def sync_shop_users():
    supabase_url, service_key, default_password, database_url = _get_settings()
    if not supabase_url or not service_key or not database_url:
        print("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY / DATABASE_URL in env.")
        sys.exit(1)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, s.email, s.city_id, s.hq_id, c.admin_region_id
                FROM shop s
                JOIN city c ON s.city_id = c.id
                WHERE s.email IS NOT NULL AND s.email <> ''
                ORDER BY s.name
                """
            )
            shops = cur.fetchall()

            cur.execute("SELECT email FROM auth.users WHERE email IS NOT NULL")
            existing_emails = {row[0].lower() for row in cur.fetchall()}

            # Map existing auth users by email -> id
            cur.execute("SELECT id, email FROM auth.users WHERE email IS NOT NULL")
            auth_by_email = {row[1].lower(): row[0] for row in cur.fetchall()}

    created = 0
    skipped = 0
    failed = 0

    for shop_id, email, city_id, hq_id, admin_region_id in shops:
        if email.lower() in existing_emails:
            skipped += 1
            continue

        payload = {
            "email": email,
            "password": default_password,
            "email_confirm": True,
            "app_metadata": {
                "role": "shop",
                "shop_id": str(shop_id),
                "city_id": str(city_id),
                "admin_region_id": str(admin_region_id) if admin_region_id else None,
                "hq_id": str(hq_id) if hq_id else None,
            },
        }
        try:
            res = httpx.post(f"{supabase_url}/auth/v1/admin/users", headers=headers, json=payload, timeout=15)
            if res.status_code < 400:
                created += 1
            else:
                failed += 1
                print(f"Create failed for {email}: {res.status_code} {res.text}")
        except Exception as exc:
            failed += 1
            print(f"Create failed for {email}: {exc}")

    # Ensure profiles exist for all shop users
    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            fixed_profiles = 0
            for shop_id, email, city_id, hq_id, admin_region_id in shops:
                user_id = auth_by_email.get(email.lower())
                if not user_id:
                    continue
                cur.execute(
                    """
                    INSERT INTO public.profiles (id, role, shop_id, city_id, admin_region_id, hq_id)
                    VALUES (%s, 'shop', %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        role = 'shop',
                        shop_id = EXCLUDED.shop_id,
                        city_id = EXCLUDED.city_id,
                        admin_region_id = EXCLUDED.admin_region_id,
                        hq_id = EXCLUDED.hq_id
                    """,
                    (user_id, shop_id, city_id, admin_region_id, hq_id),
                )
                fixed_profiles += 1

    print(f"Done. Created {created}, skipped {skipped}, failed {failed}, profiles fixed {fixed_profiles}.")


if __name__ == "__main__":
    sync_shop_users()
