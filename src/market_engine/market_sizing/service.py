from __future__ import annotations

import math
from typing import Any

from market_engine.models import EstimateResult, Interval


def _interval(value: dict[str, float], label: str) -> Interval:
    try:
        interval = Interval(float(value["low"]), float(value["base"]), float(value["high"]))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"{label} must be a finite ordered Low/Base/High interval") from error
    if not all(math.isfinite(entry) for entry in (interval.low, interval.base, interval.high)):
        raise ValueError(f"{label} must be a finite ordered Low/Base/High interval")
    if interval.low < 0:
        raise ValueError(f"{label} must contain non-negative values")
    return interval


def _rate_interval(value: dict[str, float], label: str) -> Interval:
    interval = _interval(value, label)
    if interval.high > 1:
        raise ValueError(f"{label} must remain between 0 and 1")
    return interval


def _horizon_years(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("horizon_months must be a positive whole number")
    months = float(value)
    if not math.isfinite(months) or months <= 0 or not months.is_integer():
        raise ValueError("horizon_months must be a positive whole number")
    return months / 12


def _componentwise_lte(left: Interval, right: Interval) -> bool:
    return left.low <= right.low and left.base <= right.base and left.high <= right.high


def estimate_market(audience: EstimateResult, scenario: dict[str, Any]) -> dict[str, Any]:
    if audience.status != "estimated" or audience.count is None:
        raise ValueError("market sizing requires an estimated audience")
    if scenario["market_unit"] != audience.primary_unit:
        raise ValueError("scenario market_unit must match audience primary_unit; implicit conversion is forbidden")
    horizon_years = _horizon_years(scenario["horizon_months"])
    annual_spend = _interval(
        scenario["annual_addressable_spend_per_entity"],
        "annual_addressable_spend_per_entity",
    )
    serviceability = _rate_interval(scenario["serviceability_rate"], "serviceability_rate")
    attainable = _rate_interval(scenario["attainable_share"], "attainable_share")
    capacity = _interval(scenario["operational_capacity_entities"], "operational_capacity_entities")
    annual_arpu = _interval(scenario["realized_arpu"], "realized_arpu")
    spend = annual_spend.scale(horizon_years)
    arpu = annual_arpu.scale(horizon_years)
    tam_entities = audience.count
    sam_entities = tam_entities.multiply(serviceability)
    demand_som = sam_entities.multiply(attainable)
    som_entities = Interval(
        min(demand_som.low, capacity.low),
        min(demand_som.base, capacity.base),
        min(demand_som.high, capacity.high),
    )
    tam_revenue = tam_entities.multiply(spend)
    sam_revenue = sam_entities.multiply(spend)
    capacity_revenue = capacity.multiply(arpu)
    demand_revenue = sam_revenue.multiply(attainable)
    som_revenue = Interval(
        min(demand_revenue.low, capacity_revenue.low),
        min(demand_revenue.base, capacity_revenue.base),
        min(demand_revenue.high, capacity_revenue.high),
    )
    if not _componentwise_lte(sam_entities, tam_entities) or not _componentwise_lte(som_entities, sam_entities):
        raise ValueError("market entity hierarchy must satisfy SOM <= SAM <= TAM")
    if not _componentwise_lte(sam_revenue, tam_revenue) or not _componentwise_lte(som_revenue, sam_revenue):
        raise ValueError("market revenue hierarchy must satisfy SOM <= SAM <= TAM")
    return {
        "name": scenario["name"],
        "market_unit": scenario["market_unit"],
        "currency": scenario["currency"],
        "horizon_months": scenario["horizon_months"],
        "horizon_years": horizon_years,
        "audience_model_version": audience.model_version,
        "tam_entities": tam_entities.rounded(100).to_dict(),
        "sam_entities": sam_entities.rounded(100).to_dict(),
        "som_entities": som_entities.rounded(10).to_dict(),
        "tam_revenue": tam_revenue.rounded(1_000_000).to_dict(),
        "sam_revenue": sam_revenue.rounded(1_000_000).to_dict(),
        "som_revenue": som_revenue.rounded(1_000_000).to_dict(),
        "formula":"TAM revenue=N×annual spend×(horizon_months/12); SAM revenue=TAM revenue×serviceability; SOM revenue=min(SAM revenue×attainable share, operational capacity×realized ARPU×(horizon_months/12))",
        "assumptions": {k:v for k,v in scenario.items() if k not in {"name","query","product_definition"}},
        "warning":"Revenue assumptions are scenario inputs, not population statistics.",
    }
