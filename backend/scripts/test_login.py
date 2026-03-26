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

def run_login(email, password):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY.")
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    data = json.dumps({
        "email": email,
        "password": password
    }).encode("utf-8")
    
    print(f"Attempting login for {email} to {url}...")
    sys.stdout.flush()
    
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            response_body = response.read().decode("utf-8")
            print(f"Status Code: {status_code}")
            if status_code == 200:
                print("Login Successful!")
                # print("Response:", response_body) # redacted
            else:
                print("Login Failed.")
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
    try:
        if len(sys.argv) < 3:
            print("Usage: python test_login.py <email> <password>")
            sys.exit(1)
        run_login(sys.argv[1], sys.argv[2])
    except Exception as exc:
        print(str(exc))
        sys.exit(1)
