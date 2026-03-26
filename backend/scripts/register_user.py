import os
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

print("Script Starting...")
sys.stdout.flush()


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

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_ANON_KEY.")
    sys.exit(1)

def register_user(email, password):
    url = f"{SUPABASE_URL}/auth/v1/signup"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    data = json.dumps({
        "email": email,
        "password": password,
        "data": {
            "role": "super_admin"
        }
    }).encode("utf-8")
    
    print(f"Attempting signup for {email} to {url}...")
    sys.stdout.flush()
    
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            response_body = response.read().decode("utf-8")
            print(f"Status Code: {status_code}")
            if status_code == 200:
                print("Signup Successful!")
                print(response_body)
            else:
                print("Signup Failed.")
                print(f"Response: {response_body}")
            sys.stdout.flush()
                
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code}")
        print(e.read().decode("utf-8"))
        sys.stdout.flush()
    except Exception as e:
        print(f"Error: {e}")
        sys.stdout.flush()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python register_user.py <email> <password>")
        sys.exit(1)
    register_user(sys.argv[1], sys.argv[2])
