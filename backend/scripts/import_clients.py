import csv
import os
import sys
try:
    import psycopg
except ModuleNotFoundError:
    psycopg = None
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from app.core.config import settings

CSV_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'clients_Sion.csv')
DEFAULT_CITY_NAME = 'Sion'


def _get_db_url() -> str:
    return os.getenv("DATABASE_URL_STAGING") or settings.DATABASE_URL


def _clean(value):
    if value is None:
        return None
    val = str(value).strip()
    val = val.replace("\r", " ").replace("\n", " ")
    if val in ('', '-', '–', '—'):
        return None
    return val


def _normalize_phone(value):
    raw = _clean(value)
    if not raw:
        return None
    # Keep leading +, strip other non-digits
    if raw.startswith('+'):
        digits = '+' + ''.join(ch for ch in raw if ch.isdigit())
        return digits if len(digits) > 1 else None
    digits = ''.join(ch for ch in raw if ch.isdigit())
    if not digits:
        return None
    # Swiss normalization
    if digits.startswith('0'):
        return '+41' + digits[1:]
    if digits.startswith('7'):
        return '+417' + digits[1:]
    if digits.startswith('27'):
        return '+4127' + digits[2:]
    if digits.startswith('2'):
        return '+41' + digits
    return '+' + digits


def _connect_db():
    # Pooler endpoints can reject server-side prepared statements.
    try:
        if psycopg is None:
            raise RuntimeError("psycopg not installed")
        return psycopg.connect(_get_db_url(), autocommit=True, prepare_threshold=0)
    except Exception as err:
        raise err


def _psql_path():
    return "/Applications/Postgres.app/Contents/Versions/latest/bin/psql"


def _load_city_map_with_psql(db_url: str):
    output = subprocess.check_output(
        [_psql_path(), db_url, "-A", "-F", "|", "-t", "-c", "select id,name from city;"],
        text=True,
    )
    city_map = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        city_id, name = line.split("|", 1)
        city_map[name] = city_id
    return city_map


def _import_with_psql(rows, db_url: str):
    city_map = _load_city_map_with_psql(db_url)
    default_city_id = city_map.get(DEFAULT_CITY_NAME)
    if not default_city_id:
        raise RuntimeError(f"City '{DEFAULT_CITY_NAME}' not found.")

    # Prepare normalized CSV for COPY
    fd, tmp_path = tempfile.mkstemp(prefix="clients_import_", suffix=".csv")
    Path(tmp_path).write_text(
        "name,address,postal_code,city_name,city_id,is_cms,floor,door_code,phone,active\n",
        encoding="utf-8",
    )
    count = 0
    seen_keys = set()
    with open(tmp_path, "a", encoding="utf-8", newline="") as out:
        writer = csv.writer(out, lineterminator="\n")
        for row in rows:
            name = _clean(row.get("Nom Complet"))
            if not name:
                continue
            addr_1 = _clean(row.get("Adresse 1"))
            num_1 = _clean(row.get("Numéro 1"))
            address = " ".join([part for part in [addr_1, num_1] if part]).strip()
            if not address:
                address = "Adresse inconnue"
            etage = _clean(row.get("Etage 1"))
            code_entree = _clean(row.get("Code entrée"))
            tel = _normalize_phone(row.get("Tél"))
            postal_code = _clean(row.get("NPA 1")) or ""
            city_text = _clean(row.get("Lieu 1")) or DEFAULT_CITY_NAME
            cms_val = str(row.get("CMS", "")).lower().strip()
            is_cms = cms_val in ["oui", "yes", "true", "1"]
            city_id_to_use = city_map.get(city_text, default_city_id)
            key = (
                name.lower().strip(),
                address.lower().strip(),
                postal_code.strip(),
                str(city_id_to_use),
            )
            if key in seen_keys:
                continue
            seen_keys.add(key)
            writer.writerow([
                name,
                address,
                postal_code,
                city_text,
                city_id_to_use,
                is_cms,
                etage,
                code_entree,
                tel,
                True,
            ])
            count += 1

    try:
        subprocess.run([_psql_path(), db_url, "-v", "ON_ERROR_STOP=1",
                        "-c", "TRUNCATE TABLE client CASCADE;"], check=True)
        subprocess.run([
            _psql_path(),
            db_url,
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "\\copy client (name,address,postal_code,city_name,city_id,is_cms,floor,door_code,phone,active) "
            f"from '{tmp_path}' with (format csv, header true)"
        ], check=True)
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass
    print(f"Done. Imported {count} clients (psql fallback).")


def import_clients():
    print("Connecting to DB...")
    try:
        db_url = _get_db_url()
        conn = _connect_db()
        with conn.cursor() as cur:
            # 0. Clean table for fresh import (DEV ONLY)
            print("Cleaning table 'client'...")
            cur.execute("TRUNCATE TABLE client CASCADE")

            # 1. Ensure City Exists
            cur.execute("SELECT id FROM city WHERE name = %s", (DEFAULT_CITY_NAME,))
            row = cur.fetchone()
            if not row:
                print(f"City '{DEFAULT_CITY_NAME}' not found. Check previous logs.")
                cur.execute("SELECT id FROM city LIMIT 1")
                row = cur.fetchone()
                if not row:
                    print("No city found at all.")
                    return
            default_city_id = row[0]
            print(f"Using default City ID: {default_city_id}")

            # 2. Read CSV with encoding fallback
            encodings = ['utf-8', 'latin-1', 'cp1252']
            rows = []

            for enc in encodings:
                try:
                    print(f"Trying encoding: {enc}")
                    with open(CSV_FILE, 'r', encoding=enc) as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                    print(f"Successfully read {len(rows)} rows with {enc}")
                    break
                except UnicodeDecodeError:
                    print(f"Failed with {enc}")
                    continue
                except Exception as e:
                    print(f"Error reading with {enc}: {e}")
                    continue

            if not rows:
                print("Could not read CSV.")
                return

            print(f"Importing {len(rows)} clients...")
            count = 0
            seen_keys = set()
            for row in rows:
                try:
                    name = _clean(row.get('Nom Complet'))
                    if not name:
                        continue

                    addr_1 = _clean(row.get('Adresse 1'))
                    num_1 = _clean(row.get('Numéro 1'))
                    address = " ".join([part for part in [addr_1, num_1] if part]).strip()
                    if not address:
                        address = "Adresse inconnue"

                    etage = _clean(row.get('Etage 1'))
                    code_entree = _clean(row.get('Code entrée'))
                    tel = _normalize_phone(row.get('Tél'))

                    postal_code = _clean(row.get('NPA 1')) or ''
                    city_text = _clean(row.get('Lieu 1')) or DEFAULT_CITY_NAME

                    cms_val = str(row.get('CMS', '')).lower().strip()
                    is_cms = (cms_val in ['oui', 'yes', 'true', '1'])

                    cur.execute("SELECT id FROM city WHERE name = %s", (city_text,))
                    city_lookup = cur.fetchone()
                    city_id_to_use = city_lookup[0] if city_lookup else default_city_id

                    key = (
                        name.lower().strip(),
                        address.lower().strip(),
                        postal_code.strip(),
                        str(city_id_to_use),
                    )
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    cur.execute(
                        """
                        INSERT INTO client (
                            name, address, postal_code, city_name, city_id, is_cms,
                            floor, door_code, phone, active
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true)
                        """,
                        (
                            name,
                            address,
                            postal_code,
                            city_text,
                            city_id_to_use,
                            is_cms,
                            etage,
                            code_entree,
                            tel,
                        ),
                    )
                    count += 1
                except Exception as row_err:
                    print(f"Failed to insert row {count}: {row_err} - Data: {row}")

            print(f"Done. Imported {count} clients.")

    except Exception as e:
        err_text = str(e)
        if "nodename nor servname provided" in err_text:
            print("DB DNS resolution failed. Falling back to psql import...")
        elif "prepared statement" in err_text:
            print("DB prepared statement error (pooler). Falling back to psql import...")
        if "psycopg not installed" in err_text or "No module named" in err_text:
            print("psycopg missing. Falling back to psql import...")
        if (
            "nodename nor servname provided" in err_text
            or "prepared statement" in err_text
            or "psycopg not installed" in err_text
            or "No module named" in err_text
        ):
            with open(CSV_FILE, "r", encoding="utf-8", errors="replace") as f:
                rows = list(csv.DictReader(f))
            _import_with_psql(rows, _get_db_url())
            return
        print(f"Global Error: {e}")


if __name__ == "__main__":
    import_clients()
