from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from .paths import DEFAULT_DB


class EngineRepository:
    def __init__(self, path: str | Path = DEFAULT_DB, read_only: bool = True) -> None:
        self.path = Path(path)
        if not self.path.exists():
            raise FileNotFoundError(f"engine database not built: {self.path}")
        self.connection = duckdb.connect(str(self.path), read_only=read_only)

    def close(self) -> None:
        self.connection.close()

    def queryable_features(self) -> set[str]:
        return {row[0] for row in self.connection.execute("SELECT feature_code FROM feature_definition WHERE queryable").fetchall()}

    def feature_units(self) -> dict[str, str]:
        return dict(self.connection.execute("SELECT feature_code, entity_unit FROM feature_definition WHERE queryable").fetchall())

    def baseline_for(
        self,
        unit: str,
        industry_code: str | None,
        geography_code: str,
        as_of_date: str | None,
        conditions: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        rows = self.connection.execute(
            """
            SELECT control_id, count_low, count_base, count_high, period, release_id,
                   dimensions_json, evidence_locator, method_code, geography_code
            FROM baseline_cell
            WHERE entity_unit = ?
              AND geography_code = ?
              AND (? IS NULL OR period <= ?)
              AND ((? IS NOT NULL AND json_extract_string(dimensions_json, '$.industry_code') = ?)
                   OR (? IS NULL AND json_extract_string(dimensions_json, '$.industry_code') IS NULL))
            ORDER BY CASE
                       WHEN control_id IN ('CTL-POP-RESIDENT-2024-12','CTL-MINOR-0-18-2024-12','CTL-HH-TOTAL-2024','CTL-EST-ALL-2024') THEN 0
                       ELSE 1
                     END,
                     period DESC, control_id
            """,
            [unit, geography_code, as_of_date, as_of_date,
             industry_code, industry_code, industry_code],
        ).fetchall()
        if not rows:
            return None

        selected: tuple[Any, ...] | None = None
        selected_matches: list[dict[str, Any]] = []
        selected_score = -1
        for candidate in rows:
            dimensions = json.loads(candidate[6])
            matches, conflicts = self._direct_dimension_matches(dimensions, conditions)
            if conflicts:
                continue
            score = len(matches)
            if score > selected_score:
                selected = candidate
                selected_matches = matches
                selected_score = score
        if selected is None:
            return None
        row = selected
        return {
            "control_id": row[0],
            "count": float(row[2]),
            "count_interval": {"low":float(row[1]),"base":float(row[2]),"high":float(row[3])},
            "period": row[4],
            "release_id": row[5],
            "dimensions": json.loads(row[6]),
            "evidence_locator": row[7],
            "method_code": row[8],
            "geography_code": row[9],
            "matched_conditions": selected_matches,
        }

    @staticmethod
    def _direct_dimension_matches(
        dimensions: dict[str, Any],
        conditions: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], bool]:
        """Match only filters that exactly describe a registered direct cell.

        A broader or differently bounded cell must never stand in for an exact
        age/household-size request. Metadata dimensions such as universe and
        preliminary status describe the source cell and are not inferred query
        filters.
        """
        mapped_dimensions = {
            "age": {"age_min", "age_max"},
            "household_size": {"household_size", "household_size_min"},
            "children_age": {"children_age_max"},
        }
        matches: list[dict[str, Any]] = []
        for feature, keys in mapped_dimensions.items():
            feature_conditions = [condition for condition in conditions if condition["feature"] == feature]
            if not feature_conditions or not keys.intersection(dimensions):
                continue
            if len(feature_conditions) != 1:
                return [], True
            condition = feature_conditions[0]
            value = condition.get("value")
            exact = False
            if feature == "age":
                exact = (
                    condition["op"] == "between"
                    and isinstance(value, list)
                    and len(value) == 2
                    and dimensions.get("age_min") == value[0]
                    and dimensions.get("age_max") == value[1]
                ) or (
                    condition["op"] == "gte"
                    and dimensions.get("age_min") == value
                    and "age_max" not in dimensions
                )
            elif feature == "household_size":
                exact = (
                    condition["op"] == "eq"
                    and dimensions.get("household_size") == value
                ) or (
                    condition["op"] == "gte"
                    and dimensions.get("household_size_min") == value
                )
            elif feature == "children_age":
                exact = (
                    condition["op"] == "between"
                    and isinstance(value, list)
                    and len(value) == 2
                    and value[0] == 0
                    and dimensions.get("children_age_max") == value[1]
                )
            if not exact:
                return [], True
            matches.append(condition)
        return matches, False

    def probability_model(
        self,
        condition: dict[str, Any],
        *,
        entity_unit: str,
        context: dict[str, Any],
    ) -> dict[str, Any] | None:
        rows = self.connection.execute(
            """
            SELECT model_code, applies_when_json, value_json,
                   probability_low, probability_base, probability_high,
                   formula, components_json, method_code, validation_gaps_json
            FROM probability_model
            WHERE feature = ? AND operator = ? AND entity_unit = ?
            ORDER BY model_code
            """,
            [condition["feature"], condition["op"], entity_unit],
        ).fetchall()
        wanted = condition.get("value")
        for row in rows:
            applies_when = json.loads(row[1])
            registered_value = json.loads(row[2])
            context_matches = all(context.get(key) == expected for key, expected in applies_when.items())
            if registered_value == wanted and context_matches:
                return {
                    "model_code": row[0],
                    "applies_when": applies_when,
                    "probability": {"low": row[3], "base": row[4], "high": row[5]},
                    "formula": row[6],
                    "components": json.loads(row[7]),
                    "method_code": row[8],
                    "validation_gaps": json.loads(row[9]),
                }
        return None

    def source(self, release_id: str) -> dict[str, Any]:
        row = self.connection.execute(
            """
            SELECT s.publisher, s.dataset_title, s.official_url, s.source_tier,
                   r.release_id, r.version_label, r.reference_period_start,
                   r.reference_period_end, r.publication_date, r.checksum
            FROM source_release r JOIN data_source s USING(source_id)
            WHERE r.release_id = ?
            """,
            [release_id],
        ).fetchone()
        if row is None:
            return {"release_id": release_id, "status": "unregistered"}
        return dict(zip([
            "publisher", "dataset_title", "official_url", "source_tier", "release_id",
            "version_label", "reference_period_start", "reference_period_end",
            "publication_date", "checksum"
        ], row, strict=True))

    def get_archetype(self, archetype_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            """
            SELECT a.archetype_id, a.category_code, a.name_ko, a.one_line_definition,
                   a.primary_entity_unit, a.rule_json, a.observable_traits_json,
                   a.inferred_needs_json, a.channels_json, a.overlap_note, a.version,
                   e.status, e.count_low, e.count_base, e.count_high,
                   e.share_low, e.share_base, e.share_high, e.denominator,
                   e.reference_period, e.method_code, e.formula, e.source_release_ids_json,
                   e.confidence_score, e.confidence_grade, e.validation_gaps_json,
                   r.source_kind, r.source_persona_key, r.provenance
            FROM archetype a JOIN archetype_estimate e USING(archetype_id)
            JOIN archetype_representative r USING(archetype_id)
            WHERE a.archetype_id = ?
            """, [archetype_id]
        ).fetchone()
        if row is None:
            return None
        keys = ["archetype_id","category_code","name_ko","one_line_definition","primary_entity_unit","rule",
                "observable_traits","inferred_needs","channels","overlap_note","version","estimate_status",
                "count_low","count_base","count_high","share_low","share_base","share_high","denominator",
                "reference_period","method_code","formula","source_release_ids","confidence_score","confidence_grade",
                "validation_gaps","representative_kind","representative_key","representative_provenance"]
        result = dict(zip(keys, row, strict=True))
        for key in ("rule","observable_traits","inferred_needs","channels","source_release_ids","validation_gaps"):
            result[key] = json.loads(result[key])
        return result

    def list_archetypes(self, *, category: str | None = None, unit: str | None = None, status: str | None = None, confidence_min: int = 0, limit: int = 100, offset: int = 0) -> dict[str, Any]:
        where = ["(? IS NULL OR category_code = ?)", "(? IS NULL OR primary_entity_unit = ?)", "(? IS NULL OR status = ?)", "confidence_score >= ?"]
        params: list[Any] = [category, category, unit, unit, status, status, max(confidence_min, 0)]
        predicate = " AND ".join(where)
        total = self.connection.execute(f"SELECT count(*) FROM archetype a JOIN archetype_estimate e USING(archetype_id) WHERE {predicate}", params).fetchone()[0]
        rows = self.connection.execute(
            f"SELECT archetype_id, category_code, name_ko, primary_entity_unit, status, count_base, confidence_grade FROM archetype a JOIN archetype_estimate e USING(archetype_id) WHERE {predicate} ORDER BY archetype_id LIMIT ? OFFSET ?",
            params + [min(max(limit, 1), 500), max(offset, 0)],
        ).fetchall()
        keys = ["archetype_id","category_code","name_ko","primary_entity_unit","estimate_status","count_base","confidence_grade"]
        return {"total":total,"limit":min(max(limit,1),500),"offset":max(offset,0),"items":[dict(zip(keys,row,strict=True)) for row in rows]}
