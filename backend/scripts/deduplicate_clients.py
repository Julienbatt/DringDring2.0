import os
import sys
from argparse import ArgumentParser

try:
    import psycopg
except ModuleNotFoundError:
    psycopg = None

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from app.core.config import settings


def _get_db_url() -> str:
    return os.getenv("DATABASE_URL_STAGING") or settings.DATABASE_URL


def _connect_db():
    if psycopg is None:
        raise RuntimeError("psycopg not installed")
    return psycopg.connect(_get_db_url(), autocommit=True, prepare_threshold=0)


def deduplicate_clients(dry_run: bool) -> int:
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH ranked AS (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                lower(trim(name)),
                                lower(trim(coalesce(address, ''))),
                                trim(coalesce(postal_code, '')),
                                city_id
                            ORDER BY id
                        ) AS rn
                    FROM client
                    WHERE active = true
                )
                SELECT COUNT(*) FROM ranked WHERE rn > 1
                """
            )
            dup_count = cur.fetchone()[0]

            if dry_run:
                print(f"Found {dup_count} duplicate active clients.")
                return dup_count

            cur.execute(
                """
                WITH ranked AS (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                lower(trim(name)),
                                lower(trim(coalesce(address, ''))),
                                trim(coalesce(postal_code, '')),
                                city_id
                            ORDER BY id
                        ) AS rn
                    FROM client
                    WHERE active = true
                )
                UPDATE client
                SET active = false
                WHERE id IN (
                    SELECT id FROM ranked WHERE rn > 1
                )
                """
            )
            print(f"Deactivated {dup_count} duplicate clients.")
            return dup_count
    finally:
        conn.close()


def main():
    parser = ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Only report duplicates without updating.")
    args = parser.parse_args()
    deduplicate_clients(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
