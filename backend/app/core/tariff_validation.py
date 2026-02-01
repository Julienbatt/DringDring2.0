from decimal import Decimal

from fastapi import HTTPException



def validate_tariff_rule(rule_type: str, rule: dict, share: dict | None = None) -> None:
    if not isinstance(rule, dict):
        raise HTTPException(status_code=400, detail="Invalid tariff rule format")

    if rule_type == "bags" or rule_type == "bags_price":
        _validate_bags_rule(rule, share or {})
        return
    if rule_type == "order_amount":
        _validate_order_amount_rule(rule, share or {})
        return

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported tariff rule type '{rule_type}'",
    )


def _validate_bags_rule(rule: dict, share: dict) -> None:
    pricing = rule.get("pricing") if isinstance(rule.get("pricing"), dict) else rule
    # Support aliases: price_per_2_bags OR amount_per_bag OR price_per_bag
    has_price = any(k in pricing for k in ["price_per_2_bags", "amount_per_bag", "price_per_bag"])
    has_discount = "cms_discount" in pricing
    has_cms_price = "cms_price_per_2_bags" in pricing
    
    if not has_price or not (has_discount or has_cms_price):
        raise HTTPException(
            status_code=400,
            detail="Invalid tariff rule: missing pricing keys",
        )

    _validate_shares(rule, share)
    cms_shares = rule.get("shares_cms") if isinstance(rule.get("shares_cms"), dict) else None
    if cms_shares:
        _validate_shares_dict(cms_shares, label="shares_cms")

    # Read price with fallback
    price_val = pricing.get("price_per_2_bags", pricing.get("price_per_bag", pricing.get("amount_per_bag", 0)))
    price_per_2_bags = Decimal(str(price_val))
    cms_discount = Decimal(str(pricing.get("cms_discount", 0)))
    if price_per_2_bags < 0:
        raise HTTPException(status_code=400, detail="Invalid price_per_2_bags")
    if cms_discount < 0:
        raise HTTPException(status_code=400, detail="Invalid cms_discount")
    if has_cms_price:
        cms_price = Decimal(str(pricing.get("cms_price_per_2_bags", 0)))
        if cms_price < 0:
            raise HTTPException(status_code=400, detail="Invalid cms_price_per_2_bags")
    
    # [NEW] Strict validation
    if cms_discount > price_per_2_bags:
        raise HTTPException(status_code=400, detail="CMS discount cannot exceed price")


def _validate_order_amount_rule(rule: dict, share: dict) -> None:
    pricing = rule.get("pricing") if isinstance(rule.get("pricing"), dict) else rule
    thresholds = pricing.get("thresholds")
    if isinstance(thresholds, list) and thresholds:
        _validate_shares(rule, share)

        for threshold in thresholds:
            t_min = Decimal(str(threshold.get("min", 0)))
            t_max_raw = threshold.get("max")
            t_price = Decimal(str(threshold.get("price", 0)))

            if t_min < 0:
                raise HTTPException(status_code=400, detail="Invalid threshold min")
            if t_price < 0:
                raise HTTPException(status_code=400, detail="Invalid threshold price")
            if t_max_raw is not None:
                t_max = Decimal(str(t_max_raw))
                if t_max < t_min:
                    raise HTTPException(status_code=400, detail="Invalid threshold max")

        return

    if "percent_of_order" not in pricing:
        raise HTTPException(
            status_code=400,
            detail="Invalid tariff rule: missing percent_of_order",
        )

    _validate_shares(rule, share)

    percent_of_order = Decimal(str(pricing["percent_of_order"]))
    minimum_fee = Decimal(str(pricing.get("minimum_fee", 0)))
    maximum_fee_raw = pricing.get("maximum_fee")
    if percent_of_order < 0:
        raise HTTPException(status_code=400, detail="Invalid percent_of_order")
    if minimum_fee < 0:
        raise HTTPException(status_code=400, detail="Invalid minimum_fee")
    if maximum_fee_raw is not None and Decimal(str(maximum_fee_raw)) < 0:
        raise HTTPException(status_code=400, detail="Invalid maximum_fee")


def _validate_shares(rule: dict, share: dict) -> None:
    shares = rule.get("shares") if isinstance(rule.get("shares"), dict) else None
    shares = shares or share
    _validate_shares_dict(shares, label="shares")


def _validate_shares_dict(shares: dict, *, label: str) -> None:
    
    # [NEW] Strict validation: Check for unknown keys
    # We expect either 'admin_region' or 'velocite' (legacy)
    known_keys = {"client", "shop", "city", "admin_region", "velocite"}
    unknown_keys = set(shares.keys()) - known_keys
    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tariff rule: unknown {label} keys {unknown_keys}",
        )

    # Required: client, shop, city AND (admin_region OR velocite)
    base_required = {"client", "shop", "city"}
    if not base_required.issubset(shares):
         raise HTTPException(
            status_code=400,
            detail=f"Invalid tariff rule: missing base {label} keys (client, shop, city)",
        )
    
    if "admin_region" not in shares and "velocite" not in shares:
         raise HTTPException(
            status_code=400,
            detail=f"Invalid tariff rule: missing admin share in {label} (admin_region or velocite)",
        )

    total = Decimal("0")
    for key, value in shares.items():
        # [NEW] Strict validation: Check for negative shares
        d_val = Decimal(str(value))
        if d_val < 0:
             raise HTTPException(
                status_code=400,
                detail=f"Invalid tariff rule: {label} '{key}' cannot be negative",
            )
        total += d_val

    if abs(total - Decimal("100")) > Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail=f"Tariff {label} must sum to 100",
        )
