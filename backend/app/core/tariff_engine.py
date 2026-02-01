from decimal import Decimal
import json

from fastapi import HTTPException


def parse_rule(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}


def compute_financials(
    *,
    rule_type: str,
    rule: dict,
    share: dict,
    bags: int,
    order_amount: Decimal | float | None,
    is_cms: bool,
):
    if bags < 1:
        raise HTTPException(status_code=400, detail="Bags must be >= 1")

    shares = _resolve_shares(rule, share, is_cms=is_cms)
    if not shares:
        raise HTTPException(status_code=400, detail="Tariff shares missing")

    pct_client = Decimal(str(shares.get("client", 0)))
    pct_shop = Decimal(str(shares.get("shop", 0)))
    pct_city = Decimal(str(shares.get("city", 0)))
    pct_admin = Decimal(str(shares.get("admin_region", shares.get("velocite", 0))))

    total_pct = pct_client + pct_shop + pct_city + pct_admin
    if abs(total_pct - Decimal("100")) > Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail="Tariff shares must sum to 100",
        )

    total_price = _compute_total_price(
        rule_type=rule_type,
        rule=rule,
        bags=bags,
        order_amount=order_amount,
        is_cms=is_cms,
    )

    s_client = round(total_price * (pct_client / 100), 2)
    s_shop = round(total_price * (pct_shop / 100), 2)
    s_city = round(total_price * (pct_city / 100), 2)
    s_admin = total_price - (s_client + s_shop + s_city)

    return total_price, s_client, s_shop, s_city, s_admin


def compute_total_price(
    *,
    rule_type: str,
    rule: dict,
    bags: int,
    order_amount: Decimal | float | None,
    is_cms: bool,
):
    return _compute_total_price(
        rule_type=rule_type,
        rule=rule,
        bags=bags,
        order_amount=order_amount,
        is_cms=is_cms,
    )


def _compute_total_price(
    *,
    rule_type: str,
    rule: dict,
    bags: int,
    order_amount: Decimal | float | None,
    is_cms: bool,
):
    pricing = _resolve_pricing(rule)

    if rule_type == "bags" or rule_type == "bags_price":
        price_per_2_bags_raw = pricing.get("price_per_2_bags")
        if price_per_2_bags_raw is None:
            price_per_bag_raw = pricing.get(
                "price_per_bag",
                pricing.get("amount_per_bag"),
            )
            if price_per_bag_raw is not None:
                price_per_2_bags = Decimal(str(price_per_bag_raw)) * 2
            else:
                price_per_2_bags = Decimal("0")
        else:
            price_per_2_bags = Decimal(str(price_per_2_bags_raw))

        blocks = (bags + 1) // 2
        if is_cms:
            cms_price_raw = pricing.get("cms_price_per_2_bags")
            if cms_price_raw is not None:
                unit_price = Decimal(str(cms_price_raw))
            else:
                cms_discount = Decimal(str(pricing.get("cms_discount", 0)))
                unit_price = max(Decimal("0.00"), price_per_2_bags - cms_discount)
        else:
            unit_price = price_per_2_bags
        return unit_price * blocks

    if rule_type == "order_amount":
        if order_amount is None:
            raise HTTPException(
                status_code=400,
                detail="order_amount required for order_amount tariff",
            )
        
        # Support for Threshold List (Step Pricing) - Priority
        thresholds = pricing.get("thresholds") # List of {min, max, price}
        if isinstance(thresholds, list) and thresholds:
            amount = Decimal(str(order_amount))
            for t in thresholds:
                t_min = Decimal(str(t.get("min", 0)))
                t_max = Decimal(str(t.get("max", "Infinity"))) if t.get("max") else Decimal("Infinity")
                t_price = Decimal(str(t.get("price", 0)))
                
                if t_min <= amount < t_max:
                    return t_price
            
            # Fallback if no range matches (Should not happen if last max is infinite)
            # Return last threshold price or 0
            return Decimal(str(thresholds[-1].get("price", 0)))

        # Legacy / Linear Logic
        percent_of_order = Decimal(str(pricing.get("percent_of_order", 0)))
        minimum_fee = Decimal(str(pricing.get("minimum_fee", 0)))
        maximum_fee_raw = pricing.get("maximum_fee")
        total_price = Decimal(str(order_amount)) * (percent_of_order / 100)
        if minimum_fee:
            total_price = max(minimum_fee, total_price)
        if maximum_fee_raw is not None:
            maximum_fee = Decimal(str(maximum_fee_raw))
            total_price = min(maximum_fee, total_price)
        return total_price

    raise HTTPException(
        status_code=400,
        detail="Unsupported tariff rule type",
    )


def _resolve_pricing(rule: dict) -> dict:
    pricing = rule.get("pricing")
    if isinstance(pricing, dict):
        return pricing
    return rule


def _resolve_shares(rule: dict, share: dict, *, is_cms: bool) -> dict:
    if is_cms:
        cms_shares = rule.get("shares_cms")
        if isinstance(cms_shares, dict) and cms_shares:
            return cms_shares
    shares = rule.get("shares")
    if isinstance(shares, dict) and shares:
        return shares
    if isinstance(share, dict):
        return share
    return {}
