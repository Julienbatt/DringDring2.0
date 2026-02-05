import os
import sys
from pathlib import Path

import httpx

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))


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
    default_password = os.getenv("DEFAULT_USER_PASSWORD") or backend_env.get("DEFAULT_USER_PASSWORD") or "password"
    database_url = os.getenv("DATABASE_URL") or backend_env.get("DATABASE_URL")
    force = os.getenv("FORCE_MASS_RESET") == "1"
    return supabase_url, service_key, default_password, database_url, force


def _is_staging(url: str) -> bool:
    lowered = url.lower()
    return "staging" in lowered or "dev" in lowered or "test" in lowered


def sync_courier_users():
    supabase_url, service_key, default_password, database_url, force = _get_settings()
    if not supabase_url or not service_key:
        print("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in env.")
        sys.exit(1)

    if not _is_staging(supabase_url) and not force:
        print("Refusing to reset passwords outside staging/dev. Set FORCE_MASS_RESET=1 to override.")
        sys.exit(1)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    rest_headers = {
        **headers,
        "Accept": "application/json",
    }
    rest_base = f"{supabase_url}/rest/v1"

    # Fetch couriers via REST
    couriers = []
    try:
        res = httpx.get(
            f"{rest_base}/courier",
            headers=rest_headers,
            params={
                "select": "id,email,admin_region_id,user_id,first_name,last_name",
                "order": "last_name.asc,first_name.asc",
            },
            timeout=20,
        )
        res.raise_for_status()
        couriers = res.json()
    except Exception as exc:
        print(f"Failed to fetch couriers: {exc}")
        sys.exit(1)

    # Fetch auth users via Admin API (paged)
    auth_by_email = {}
    page = 1
    while True:
        res = httpx.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers=headers,
            params={"per_page": 1000, "page": page},
            timeout=20,
        )
        res.raise_for_status()
        users = res.json().get("users", [])
        if not users:
            break
        for u in users:
            email = (u.get("email") or "").lower()
            if email:
                auth_by_email[email] = u.get("id")
        page += 1

    created = 0
    updated = 0
    skipped = 0
    missing_email = []
    failed = 0

    for row in couriers:
        courier_id = row.get("id")
        email = row.get("email")
        admin_region_id = row.get("admin_region_id")
        first_name = row.get("first_name")
        last_name = row.get("last_name")

        if not email:
            missing_email.append((courier_id, first_name, last_name))
            continue

        email_lower = email.lower()
        auth_user_id = auth_by_email.get(email_lower)

        if not auth_user_id:
            payload = {
                "email": email,
                "password": default_password,
                "email_confirm": True,
                "app_metadata": {
                    "role": "courier",
                    "admin_region_id": str(admin_region_id) if admin_region_id else None,
                },
            }
            try:
                res = httpx.post(f"{supabase_url}/auth/v1/admin/users", headers=headers, json=payload, timeout=15)
                if res.status_code >= 400:
                    failed += 1
                    print(f"Create failed for {email}: {res.status_code} {res.text}")
                    continue
                auth_user_id = res.json().get("id")
                if not auth_user_id:
                    failed += 1
                    print(f"Create failed for {email}: missing id in response")
                    continue
                created += 1
            except Exception as exc:
                failed += 1
                print(f"Create failed for {email}: {exc}")
                continue

        # Set password to default and update app_metadata role
        try:
            res = httpx.put(
                f"{supabase_url}/auth/v1/admin/users/{auth_user_id}",
                headers=headers,
                json={
                    "password": default_password,
                    "app_metadata": {
                        "role": "courier",
                        "admin_region_id": str(admin_region_id) if admin_region_id else None,
                    },
                },
                timeout=15,
            )
            if res.status_code >= 400:
                failed += 1
                print(f"Update failed for {email}: {res.status_code} {res.text}")
                continue
            updated += 1
        except Exception as exc:
            failed += 1
            print(f"Update failed for {email}: {exc}")
            continue

        # Link courier.user_id + ensure profile
        try:
            httpx.patch(
                f"{rest_base}/courier",
                headers=rest_headers,
                params={"id": f"eq.{courier_id}"},
                json={"user_id": auth_user_id},
                timeout=20,
            ).raise_for_status()
        except Exception as exc:
            failed += 1
            print(f"Failed to link courier {email}: {exc}")
            continue

        try:
            httpx.post(
                f"{rest_base}/profiles",
                headers={**rest_headers, "Prefer": "resolution=merge-duplicates"},
                json={
                    "id": auth_user_id,
                    "role": "courier",
                    "admin_region_id": admin_region_id,
                },
                timeout=20,
            ).raise_for_status()
        except Exception as exc:
            failed += 1
            print(f"Failed to upsert profile for {email}: {exc}")
            continue

    print(f"Done. Created {created}, updated {updated}, failed {failed}.")
    if missing_email:
        print("Couriers without email (cannot create auth users):")
        for courier_id, first_name, last_name in missing_email:
            print(f"- {courier_id} {first_name} {last_name}")


if __name__ == "__main__":
    sync_courier_users()
