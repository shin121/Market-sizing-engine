from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Interval:
    low: float
    base: float
    high: float

    def __post_init__(self) -> None:
        if not (self.low <= self.base <= self.high):
            raise ValueError("interval must satisfy low <= base <= high")

    def multiply(self, other: "Interval") -> "Interval":
        if min(self.low, other.low) < 0:
            raise ValueError("market sizing intervals cannot contain negative values")
        return Interval(self.low * other.low, self.base * other.base, self.high * other.high)

    def scale(self, scalar: float) -> "Interval":
        return Interval(self.low * scalar, self.base * scalar, self.high * scalar)

    def rounded(self, nearest: int | None) -> "Interval":
        if nearest is None:
            return self
        return Interval(*(round(v / nearest) * nearest for v in (self.low, self.base, self.high)))

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass
class EstimateResult:
    interpreted_query: dict[str, Any]
    primary_unit: str
    count: Interval | None
    share: Interval | None
    denominator: dict[str, Any]
    related_unit_counts: dict[str, Any]
    formula_tree: dict[str, Any]
    sources: list[dict[str, Any]]
    assumptions: list[dict[str, Any]]
    confidence_score: int
    confidence_grade: str
    validation_gaps: list[dict[str, Any]]
    overlap_warning: str
    model_version: str
    as_of_period: str
    status: str
    human_readable_explanation_ko: str

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["count_low"] = self.count.low if self.count else None
        result["count_base"] = self.count.base if self.count else None
        result["count_high"] = self.count.high if self.count else None
        result["share_low"] = self.share.low if self.share else None
        result["share_base"] = self.share.base if self.share else None
        result["share_high"] = self.share.high if self.share else None
        return result
