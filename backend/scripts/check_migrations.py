#!/usr/bin/env python3
"""
Guard migration naming/versioning quality.

Rules:
- scan backend/migrations/update_*.sql
- extract suffix `_v<digits>.sql`
- fail on duplicate versions except known historical duplicates.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "migrations"
PATTERN = re.compile(r"^update_.+_v(\d+)\.sql$")

# Keep historical collisions explicit and controlled.
KNOWN_DUPLICATE_VERSIONS = {43, 44, 45, 46, 49}


def main() -> int:
    if not MIGRATIONS_DIR.exists():
        print(f"ERROR: migrations directory not found: {MIGRATIONS_DIR}")
        return 1

    versions: dict[int, list[str]] = defaultdict(list)
    skipped = 0

    for path in sorted(MIGRATIONS_DIR.glob("update_*.sql")):
        match = PATTERN.match(path.name)
        if not match:
            skipped += 1
            continue
        version = int(match.group(1))
        versions[version].append(path.name)

    duplicates = {v: names for v, names in versions.items() if len(names) > 1}
    unexpected = {v: names for v, names in duplicates.items() if v not in KNOWN_DUPLICATE_VERSIONS}

    print(f"Checked {sum(len(v) for v in versions.values())} versioned migration files.")
    if skipped:
        print(f"Note: {skipped} update_*.sql file(s) do not match _v<digits> naming.")

    if duplicates:
        print("Detected duplicate migration versions:")
        for version in sorted(duplicates):
            print(f"  v{version}: {', '.join(duplicates[version])}")

    if unexpected:
        print("ERROR: unexpected duplicate migration versions found.")
        return 1

    print("Migration versioning check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
