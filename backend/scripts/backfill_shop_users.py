import os
import sys
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set

import httpx
import psycopg

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from app.core.config import settings  # noqa: E402


@dataclass
class ShopRow:
    id: str
    name: str
    email: str
    city_id: str
    admin_region_id: Optional[str]
    hq_id: Optional[str]


def fetch_shops(conn: psycopg.Connection) -> List[ShopRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.id::text,
                   s.name,
                   s.email,
                   s.city_id::text,
                   c.admin_region_id::text,
                   s.hq_id::text
            FROM shop s
            JOIN city c ON c.id = s.city_id
            WHERE s.email IS NOT NULL
              AND s.email <> ''
            ORDER BY s.name
            """
        )
        rows = cur.fetchall()
    return [
        ShopRow(
            id=row[0],
            name=row[1],
            email=row[2],
            city_id=row[3],
            admin_region_id=row[4],
            hq_id=row[5],
        )
        for row in rows
    ]


def list_auth_users(client: httpx.Client) -> Set[str]:
    users: List[Dict] = []
    page = 1
    while True:
        resp = client.get("/auth/v1/admin/users", params={"per_page": 1000, "page": page})
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            users.extend(data.get("users", []))
            next_page = data.get("next_page")
        elif isinstance(data, list):
            users.extend(data)
            next_page = None
        else:
            next_page = None
        if not next_page or next_page == page:
            break
        page = int(next_page)

    emails = set()
    for user in users:
        email = (user.get("email") or "").strip().lower()
        if email:
            emails.add(email)
    return emails


def create_user(client: httpx.Client, shop: ShopRow) -> Optional[str]:
    metadata = {
        "role": "shop",
        "shop_id": shop.id,
        "city_id": shop.city_id,
        "admin_region_id": shop.admin_region_id,
        "hq_id": shop.hq_id,
    }
    use_password_flow = bool(settings.DEFAULT_USER_PASSWORD)
    payload = (
        {
            "email": shop.email,
            "password": settings.DEFAULT_USER_PASSWORD,
            "email_confirm": True,
            "app_metadata": metadata,
        }
        if use_password_flow
        else {"email": shop.email, "data": metadata}
    )
    if not use_password_flow and settings.FRONTEND_URL:
        payload["redirect_to"] = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback"
    endpoint = "/auth/v1/admin/users" if use_password_flow else "/auth/v1/invite"
    resp = client.post(endpoint, json=payload)
    if resp.status_code < 400:
        return None
    return resp.text


def chunk(items: Iterable[ShopRow]) -> Iterable[ShopRow]:
    for item in items:
        yield item


def main() -> None:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in backend/.env")
        sys.exit(1)

    conn = psycopg.connect(settings.DATABASE_URL)
    try:
        shops = fetch_shops(conn)
    finally:
        conn.close()

    client = httpx.Client(
        base_url=settings.SUPABASE_URL,
        headers={
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        timeout=20,
    )

    try:
        existing_emails = list_auth_users(client)
        candidates = [
            shop
            for shop in shops
            if shop.email.strip().lower() not in existing_emails
        ]

        created = 0
        skipped = len(shops) - len(candidates)
        failures: List[str] = []

        for shop in chunk(candidates):
            error = create_user(client, shop)
            if error:
                failures.append(f"{shop.email}: {error}")
            else:
                created += 1

        print(f"Shops scanned: {len(shops)}")
        print(f"Existing auth users: {skipped}")
        print(f"Created users: {created}")
        print(f"Failures: {len(failures)}")
        if failures:
            print("Failure samples:")
            for line in failures[:5]:
                print(f"- {line}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
