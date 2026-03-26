import os
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path


def load_env_file(path):
    data = {}
    if not path.exists():
        return data
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


backend_env = load_env_file(Path(__file__).resolve().parent.parent / ".env")
frontend_env = load_env_file(Path(__file__).resolve().parent.parent.parent / "frontend" / ".env.local")

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or backend_env.get("SUPABASE_URL")
    or frontend_env.get("NEXT_PUBLIC_SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_ANON_KEY")
    or backend_env.get("SUPABASE_ANON_KEY")
    or frontend_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
API_URL = os.getenv("API_URL") or backend_env.get("API_URL") or "http://localhost:8000/api/v1"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_ANON_KEY.")
    sys.exit(1)


def login(email, password):
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    data = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def call_me(access_token):
    url = f"{API_URL}/me"
    headers = {"Authorization": f"Bearer {access_token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req) as response:
        return response.getcode()


def main():
    if len(sys.argv) < 3:
        print("Usage: python verify_api_login.py <email> <password>")
        sys.exit(1)
    email = sys.argv[1]
    password = sys.argv[2]
    try:
        token_data = login(email, password)
    except urllib.error.HTTPError as exc:
        print(f"Login failed: {exc.code} {exc.read().decode('utf-8')}")
        return
    access_token = token_data.get("access_token")
    if not access_token:
        print("Login succeeded but no access token returned.")
        return
    try:
        status = call_me(access_token)
        print(f"/me status: {status}")
    except urllib.error.HTTPError as exc:
        print(f"/me failed: {exc.code} {exc.read().decode('utf-8')}")
    except Exception as exc:
        print(f"/me error: {exc}")


if __name__ == "__main__":
    main()
