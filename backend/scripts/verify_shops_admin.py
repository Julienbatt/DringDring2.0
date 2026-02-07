import urllib.request
import urllib.parse
import json
import ssl
import sys
import os

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000/api/v1").rstrip("/")
EMAIL = os.getenv("TEST_EMAIL")
PASSWORD = os.getenv("TEST_PASSWORD")

def verify_shops_access():
    if not EMAIL or not PASSWORD:
        print("Missing TEST_EMAIL or TEST_PASSWORD environment variables.")
        print("Example: TEST_EMAIL=admin@dringdring.ch TEST_PASSWORD=*** python3 backend/scripts/verify_shops_admin.py")
        return

    print("1. Logging in...")
    auth_data = {
        "email": EMAIL,
        "password": PASSWORD
    }
    
    # Bypass SSL for local dev if needed (often not needed for http localhost)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        f"{BASE_URL}/me/login",
        data=json.dumps(auth_data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            if response.status != 200:
                print(f"Login failed: {response.status}")
                return
            data = json.loads(response.read().decode('utf-8'))
            access_token = data.get("access_token")
            print("Login successful, token obtained.")
    except Exception as e:
        print(f"Login error: {e}")
        return

    print("2. Testing GET /shops/admin ...")
    req_shops = urllib.request.Request(
        f"{BASE_URL}/shops/admin",
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
    )
    
    try:
        with urllib.request.urlopen(req_shops, context=ctx) as response:
            if response.status == 200:
                shops = json.loads(response.read().decode('utf-8'))
                print("SUCCESS: /shops/admin returned 200 OK")
                print(f"Returned {len(shops)} shops.")
            else:
                print(f"FAILURE: Status {response.status}")
                print(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_shops_access()
