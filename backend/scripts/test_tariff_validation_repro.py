
import sys
import os
from decimal import Decimal

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from fastapi import HTTPException
from app.core.tariff_validation import validate_tariff_rule

def run_case(name, rule_type, rule, share, should_fail=False):
    print(f"Testing: {name}...", end=" ")
    try:
        validate_tariff_rule(rule_type, rule, share)
        if should_fail:
            print("FAILED (Expected error, but got success)")
        else:
            print("PASSED")
    except HTTPException as e:
        if should_fail:
            print(f"PASSED (Caught expected error: {e.detail})")
        else:
            print(f"FAILED (Unexpected error: {e.detail})")
    except Exception as e:
        print(f"FAILED (Unexpected exception: {e})")

def main():
    # 1. Valid Case
    valid_rule = {
        "pricing": {
            "price_per_2_bags": 10.0,
            "cms_discount": 2.0
        }
    }
    valid_share = {
        "client": 50,
        "shop": 40,
        "city": 5,
        "admin_region": 5
    }
    run_case("Valid Rule", "bags", valid_rule, valid_share, should_fail=False)

    # 2. Invalid: CMS discount > Price
    invalid_discount = {
        "pricing": {
            "price_per_2_bags": 10.0,
            "cms_discount": 15.0 # Error: discount > price
        }
    }
    run_case("Invalid: Discount > Price", "bags", invalid_discount, valid_share, should_fail=True)

    # 3. Invalid: Negative Share
    invalid_share = {
        "client": 110,
        "shop": -10, # Error: negative share
        "city": 0,
        "admin_region": 0
    }
    run_case("Invalid: Negative Share", "bags", valid_rule, invalid_share, should_fail=True)

    # 4. Invalid: Unknown Share Key
    unknown_share_key = {
        "client": 50,
        "shop": 40,
        "city": 5,
        "admin_region": 5,
        "hacker_fund": 0 # Error: unknown key
    }
    run_case("Invalid: Unknown Share Key", "bags", valid_rule, unknown_share_key, should_fail=True)


if __name__ == "__main__":
    main()
