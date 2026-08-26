from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Sequence
from uuid import UUID, uuid5

import duckdb
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .paths import ROOT
from .phase2 import PHASE2_DB, PHASE2_VERSION


LOADER_VERSION = "postgres-baseline-backfill-v1"
PHASE1_VERSION = "kr-v0.1.0"
UUID_NAMESPACE = UUID("b38664d1-4a2a-5f8f-b865-9bb4353b1793")
SOURCE_RUN_KEYS = (
    "RUN-20260824T170155Z",
    "RUN-P2-20260824T170416Z",
    "phase2-acceptance",
    "feedback-service",
)
DEFAULT_MANIFEST_JSON = ROOT / "reports" / "phase3_postgres_backfill_manifest.json"
DEFAULT_MANIFEST_MD = ROOT / "reports" / "phase3_postgres_backfill_manifest.md"

EXPECTED_COUNTS = {
    "domain": 24,
    "axis": 384,
    "feature": 480,
    "behavior": 240,
    "segmentation_model": 24,
    "primary_subtype": 90,
    "parent_allocation": 450,
    "archetype": 1_440,
    "activation_json": 90,
}

SOURCE_TABLES = (
    "activation_mapping",
    "archetype",
    "archetype_estimate",
    "archetype_hierarchy",
    "archetype_representative",
    "baseline_cell",
    "category",
    "cluster_definition",
    "cluster_representative",
    "data_source",
    "domain_association",
    "domain_behavior_template",
    "domain_coverage_audit",
    "domain_dimension",
    "domain_feature",
    "domain_feature_source",
    "domain_profile_summary",
    "domain_registry",
    "domain_tag",
    "feature_definition",
    "latent_dimension",
    "parent_decomposition_decision",
    "phase2_acceptance_result",
    "phase2_parent_estimate",
    "pipeline_run",
    "posterior_update",
    "probability_model",
    "required_parent_case",
    "required_parent_case_allocation",
    "segment_observation",
    "segmentation_model",
    "source_release",
    "subtype_allocation",
    "subtype_confidence",
    "subtype_definition",
    "subtype_membership_summary",
    "subtype_profile",
    "subtype_tag_allocation",
)

TARGET_FINGERPRINT_TABLES = (
    "data_source",
    "source_release",
    "geography",
    "time_period",
    "feature_definition",
    "evidence",
    "category",
    "population_cell",
    "minor_population_cell",
    "household_cell",
    "business_cell",
    "archetype",
    "archetype_rule",
    "archetype_profile",
    "archetype_representative",
    "estimate",
    "estimate_component",
    "assumption",
    "estimate_assumption",
    "confidence_assessment",
    "validation_gap",
    "domain_registry",
    "domain_dimension",
    "domain_feature",
    "domain_feature_source",
    "domain_behavior_template",
    "domain_tag",
    "domain_profile_summary",
    "domain_association",
    "domain_coverage_audit",
    "archetype_hierarchy",
    "latent_dimension",
    "segmentation_model",
    "cluster_definition",
    "cluster_representative",
    "subtype_definition",
    "parent_decomposition_decision",
    "phase2_parent_estimate",
    "subtype_allocation",
    "required_parent_case",
    "required_parent_case_allocation",
    "subtype_membership_summary",
    "subtype_profile",
    "subtype_confidence",
    "subtype_tag_allocation",
    "activation_mapping",
    "segment_observation",
    "posterior_update",
    "phase2_acceptance_result",
)

GAP_CATALOG: dict[str, tuple[str, str, str]] = {
    "business_web_presence_unobserved": (
        "high",
        "60–69세 음식점 기업체의 자체 홈페이지 보유 여부를 직접 공동관측하지 못함",
        "업종×대표자연령×자체홈페이지 보유를 함께 측정한 확률표본 또는 사업체 웹 감사",
    ),
    "owner_attribute_unobserved": (
        "medium",
        "공표표는 대표자 60세 이상만 제공하여 60–69세를 직접 분리하지 못함",
        "전국사업체조사 또는 소상공인실태조사 공개 마이크로데이터의 상세 연령대",
    ),
    "missing_joint_distribution": (
        "high",
        "조건들의 결합분포가 없음",
        "동일 표본에서 조건을 공동관측한 공식 교차표 또는 확률표본",
    ),
    "unknown_unit_conversion": (
        "medium",
        "사람·가구·사업체·기업체 간 변환을 확인할 자료가 없음",
        "명시적인 단위 연결자료와 민감도 범위",
    ),
    "other": (
        "low",
        "직접 기준셀은 그 정의 범위만 지원하며 추가 행동·욕구 특성을 설명하지 않음",
        "질문에 필요한 공식 공동분포",
    ),
}


class PostgresBackfillError(RuntimeError):
    """Base class for PostgreSQL baseline loading failures."""


class BaselineDriftError(PostgresBackfillError):
    """Raised when a published version or loaded target changed in place."""


class BaselineVerificationError(PostgresBackfillError):
    """Raised when target counts or reconciliation fail."""


def deterministic_uuid(kind: str, key: str) -> UUID:
    return uuid5(UUID_NAMESPACE, f"{kind}:{key}")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_value(value: Any, fallback: Any = None) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback if fallback is not None else value
    return value


def _normalise(value: Any) -> Any:
    if isinstance(value, Jsonb):
        return _normalise(value.obj)
    if isinstance(value, dict):
        return {str(key): _normalise(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, (list, tuple)):
        return [_normalise(item) for item in value]
    if isinstance(value, (datetime, date, UUID, Decimal, Path)):
        return str(value)
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return str(value)
        return float(format(value, ".17g"))
    if isinstance(value, str) and value[:1] in {"{", "["}:
        try:
            return _normalise(json.loads(value))
        except json.JSONDecodeError:
            return value
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(_normalise(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _content_hash(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _parse_date(value: Any) -> date | None:
    if value in {None, "", "latest_registered"}:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value)[:10])


def _parse_datetime(value: Any, fallback: datetime) -> datetime:
    if value in {None, ""}:
        return fallback
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _timestamp_from_run_id(raw_run_id: str, fallback: datetime) -> datetime:
    match = re.search(r"(20\d{6}T\d{6})Z", raw_run_id)
    if not match:
        return fallback
    return datetime.strptime(match.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)


def _duck_rows(connection: duckdb.DuckDBPyConnection, table: str) -> list[dict[str, Any]]:
    cursor = connection.execute(f'SELECT * FROM "{table}"')
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def _source_semantic_fingerprint(connection: duckdb.DuckDBPyConnection) -> tuple[str, dict[str, int]]:
    payload: dict[str, Any] = {"loader_version": LOADER_VERSION, "tables": {}}
    counts: dict[str, int] = {}
    for table in SOURCE_TABLES:
        rows = _duck_rows(connection, table)
        encoded = sorted(_canonical_json(row) for row in rows)
        payload["tables"][table] = encoded
        counts[table] = len(rows)

    minor_path = ROOT / "data" / "processed" / "minor_population_cells.parquet"
    minor_cursor = connection.execute(f"SELECT * FROM read_parquet('{minor_path.as_posix()}')")
    minor_columns = [item[0] for item in minor_cursor.description]
    minor_rows = [dict(zip(minor_columns, row, strict=True)) for row in minor_cursor.fetchall()]
    payload["minor_population_cells"] = sorted(_canonical_json(row) for row in minor_rows)
    counts["minor_population_cells"] = len(minor_rows)

    history_path = ROOT / "data" / "processed" / "population_history_2020_2024.parquet"
    history_cursor = connection.execute(f"SELECT * FROM read_parquet('{history_path.as_posix()}')")
    history_columns = [item[0] for item in history_cursor.description]
    history_rows = [dict(zip(history_columns, row, strict=True)) for row in history_cursor.fetchall()]
    payload["population_history"] = sorted(_canonical_json(row) for row in history_rows)
    counts["population_history"] = len(history_rows)
    return _content_hash(payload), counts


def _adapt(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return Jsonb(value)
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def _upsert_rows(
    cursor: psycopg.Cursor[Any],
    table: str,
    rows: Sequence[dict[str, Any]],
    conflict_columns: Sequence[str],
    *,
    immutable_columns: Iterable[str] = (),
) -> None:
    if not rows:
        return
    columns = list(rows[0])
    immutable = set(immutable_columns) | set(conflict_columns) | {"created_at"}
    update_columns = [column for column in columns if column not in immutable]
    insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table),
        sql.SQL(",").join(map(sql.Identifier, columns)),
        sql.SQL(",").join(sql.Placeholder() for _ in columns),
    )
    conflict = sql.SQL(" ON CONFLICT ({}) ").format(sql.SQL(",").join(map(sql.Identifier, conflict_columns)))
    if update_columns:
        action = sql.SQL("DO UPDATE SET {} ").format(
            sql.SQL(",").join(
                sql.SQL("{}=EXCLUDED.{}").format(sql.Identifier(column), sql.Identifier(column))
                for column in update_columns
            )
        )
    else:
        action = sql.SQL("DO NOTHING ")
    query = insert + conflict + action
    cursor.executemany(query, [tuple(_adapt(row[column]) for column in columns) for row in rows])


def _upsert_by_external_key(
    cursor: psycopg.Cursor[Any],
    table: str,
    id_column: str,
    external_key_column: str,
    rows: Sequence[dict[str, Any]],
) -> dict[str, int]:
    identities: dict[str, int] = {}
    for row in rows:
        external_key = str(row[external_key_column])
        cursor.execute(
            sql.SQL("SELECT {} FROM {} WHERE {}=%s").format(
                sql.Identifier(id_column), sql.Identifier(table), sql.Identifier(external_key_column)
            ),
            [external_key],
        )
        existing = cursor.fetchone()
        semantic_columns = [column for column in row if column != id_column]
        if existing is None:
            columns = list(row)
            cursor.execute(
                sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING {}").format(
                    sql.Identifier(table),
                    sql.SQL(",").join(map(sql.Identifier, columns)),
                    sql.SQL(",").join(sql.Placeholder() for _ in columns),
                    sql.Identifier(id_column),
                ),
                tuple(_adapt(row[column]) for column in columns),
            )
            identity = int(cursor.fetchone()[id_column])
        else:
            identity = int(existing[id_column])
            update_columns = [column for column in semantic_columns if column not in {external_key_column, "created_at"}]
            if update_columns:
                cursor.execute(
                    sql.SQL("UPDATE {} SET {} WHERE {}=%s").format(
                        sql.Identifier(table),
                        sql.SQL(",").join(
                            sql.SQL("{}=%s").format(sql.Identifier(column)) for column in update_columns
                        ),
                        sql.Identifier(id_column),
                    ),
                    tuple(_adapt(row[column]) for column in update_columns) + (identity,),
                )
        identities[external_key] = identity
    return identities


def _upsert_preserving_identifier(
    cursor: psycopg.Cursor[Any],
    table: str,
    id_column: str,
    external_key_column: str,
    rows: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Upsert through a partial unique external key while retaining an adopted primary key."""
    identities: dict[str, Any] = {}
    for row in rows:
        external_key = str(row[external_key_column])
        cursor.execute(
            sql.SQL("SELECT {} FROM {} WHERE {}=%s").format(
                sql.Identifier(id_column), sql.Identifier(table), sql.Identifier(external_key_column)
            ),
            [external_key],
        )
        existing = cursor.fetchone()
        if existing is None:
            columns = list(row)
            cursor.execute(
                sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING {}").format(
                    sql.Identifier(table),
                    sql.SQL(",").join(map(sql.Identifier, columns)),
                    sql.SQL(",").join(sql.Placeholder() for _ in columns),
                    sql.Identifier(id_column),
                ),
                tuple(_adapt(row[column]) for column in columns),
            )
            identity = cursor.fetchone()[id_column]
        else:
            identity = existing[id_column]
            update_columns = [
                column
                for column in row
                if column not in {id_column, external_key_column, "created_at"}
            ]
            if update_columns:
                cursor.execute(
                    sql.SQL("UPDATE {} SET {} WHERE {}=%s").format(
                        sql.Identifier(table),
                        sql.SQL(",").join(
                            sql.SQL("{}=%s").format(sql.Identifier(column)) for column in update_columns
                        ),
                        sql.Identifier(id_column),
                    ),
                    tuple(_adapt(row[column]) for column in update_columns) + (identity,),
                )
        identities[external_key] = identity
    return identities


def _required_tables(cursor: psycopg.Cursor[Any]) -> None:
    required = {
        "model_version",
        "pipeline_run",
        "data_source",
        "category",
        "archetype",
        "domain_registry",
        "subtype_definition",
        "activation_mapping",
    }
    cursor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()"
    )
    present = {row["table_name"] for row in cursor.fetchall()}
    missing = sorted(required - present)
    if missing:
        raise PostgresBackfillError(f"PostgreSQL migrations are incomplete; missing tables: {missing}")
    cursor.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='pipeline_run'
        """
    )
    if "external_run_key" not in {row["column_name"] for row in cursor.fetchall()}:
        raise PostgresBackfillError("migration 003_workbench.sql must be applied before baseline backfill")


def _extract_required_features(value: Any) -> list[str]:
    features: set[str] = set()

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            feature = node.get("feature")
            if isinstance(feature, str):
                features.add(feature)
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(value)
    return sorted(features)


def _confidence_components(total: int) -> tuple[int, int, int, int, int]:
    """Allocate a legacy 0-100 total across the canonical 30/15/20/20/15 rubric."""
    maxima = (30, 15, 20, 20, 15)
    exact = [total * maximum / 100 for maximum in maxima]
    allocated = [math.floor(value) for value in exact]
    remainder = total - sum(allocated)
    order = sorted(range(len(maxima)), key=lambda index: (exact[index] - allocated[index], maxima[index]), reverse=True)
    for index in order[:remainder]:
        allocated[index] += 1
    return tuple(allocated)  # type: ignore[return-value]


def _grade_for_score(score: int) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    if score >= 40:
        return "D"
    return "E"


def _period_bounds(value: str) -> tuple[str, date, date]:
    parsed = date.fromisoformat(value[:10])
    return "point", parsed, parsed


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path.resolve())


def _run_key(value: Any) -> str:
    return str(value) if value not in {None, ""} else "RUN-P2-20260824T170416Z"


class _BaselineLoader:
    def __init__(
        self,
        duck: duckdb.DuckDBPyConnection,
        cursor: psycopg.Cursor[Any],
        *,
        semantic_sha256: str,
        duckdb_sha256: str,
        source_counts: dict[str, int],
    ) -> None:
        self.duck = duck
        self.cursor = cursor
        self.semantic_sha256 = semantic_sha256
        self.duckdb_sha256 = duckdb_sha256
        self.source_counts = source_counts
        self.rows = {table: _duck_rows(duck, table) for table in SOURCE_TABLES}
        self.now = datetime.now(timezone.utc)
        self.model_ids: dict[str, UUID] = {}
        self.run_ids: dict[str, UUID] = {}
        self.category_ids: dict[str, int] = {}
        self.feature_ids: dict[str, int] = {}
        self.period_ids: dict[str, int] = {}
        self.evidence_ids: dict[str, int] = {}
        self.geography_id = 0

    @property
    def phase1_run_id(self) -> UUID:
        return self.run_ids["RUN-20260824T170155Z"]

    @property
    def phase2_run_id(self) -> UUID:
        return self.run_ids["RUN-P2-20260824T170416Z"]

    def model_id(self, version: str | None) -> UUID:
        resolved = version or PHASE2_VERSION
        if resolved not in self.model_ids:
            raise PostgresBackfillError(f"unregistered source model version: {resolved}")
        return self.model_ids[resolved]

    def run_id(self, raw_run_id: Any) -> UUID:
        key = _run_key(raw_run_id)
        if key not in self.run_ids:
            raise PostgresBackfillError(f"unregistered source pipeline run: {key}")
        return self.run_ids[key]

    def load_model_versions_and_runs(self) -> None:
        versions = {PHASE1_VERSION, PHASE2_VERSION}
        for table in SOURCE_TABLES:
            for row in self.rows[table]:
                value = row.get("model_version")
                if value:
                    versions.add(str(value))

        seed_by_version = {PHASE1_VERSION: 20260824, "kr-v0.2.0": 20260824, PHASE2_VERSION: 20260824}
        model_rows = [
            {
                "model_version_id": deterministic_uuid("model_version", version),
                "version": version,
                "methodology_hash": _content_hash({"version": version, "source": "immutable DuckDB baseline"}),
                "source_manifest_hash": self.semantic_sha256,
                "parameter_json": {
                    "baseline_source": str(PHASE2_DB.relative_to(ROOT)),
                    "loader_version": LOADER_VERSION,
                    "source_model_version": version,
                },
                "random_seed": seed_by_version.get(version, 20260824),
                "data_version": version,
            }
            for version in sorted(versions)
        ]
        _upsert_rows(
            self.cursor,
            "model_version",
            model_rows,
            ["version"],
            immutable_columns=("model_version_id", "created_by_run_id"),
        )
        self.cursor.execute("SELECT version, model_version_id FROM model_version WHERE version = ANY(%s)", [sorted(versions)])
        self.model_ids = {row["version"]: row["model_version_id"] for row in self.cursor.fetchall()}

        raw_phase1 = self.rows["pipeline_run"][0]
        phase1_started = _parse_datetime(raw_phase1["started_at"], self.now)
        phase1_finished = _parse_datetime(raw_phase1["finished_at"], phase1_started)
        source_run_specs: dict[str, dict[str, Any]] = {
            str(raw_phase1["run_id"]): {
                "pipeline_name": raw_phase1["pipeline_name"],
                "started_at": phase1_started,
                "finished_at": phase1_finished,
                "model_version": str(raw_phase1["model_version"]),
                "input_manifest": _json_value(raw_phase1["input_manifest"], {}),
                "output_manifest": _json_value(raw_phase1["output_manifest"], {}),
                "row_counts": _json_value(raw_phase1["row_counts"], {}),
                "quality_metrics": _json_value(raw_phase1["quality_metrics"], {}),
            },
            "RUN-P2-20260824T170416Z": {
                "pipeline_name": "phase2_baseline_import",
                "started_at": _timestamp_from_run_id("RUN-P2-20260824T170416Z", phase1_finished),
                "finished_at": _timestamp_from_run_id("RUN-P2-20260824T170416Z", phase1_finished),
                "model_version": PHASE2_VERSION,
                "input_manifest": {"source": "reports/phase2_build_checkpoint.json"},
                "output_manifest": {"database": str(PHASE2_DB.relative_to(ROOT))},
                "row_counts": {
                    table: len(self.rows[table])
                    for table in SOURCE_TABLES
                    if table not in {"pipeline_run"}
                },
                "quality_metrics": {},
            },
            "phase2-acceptance": {
                "pipeline_name": "phase2_acceptance_import",
                "started_at": min(
                    _parse_datetime(row["executed_at"], phase1_finished)
                    for row in self.rows["phase2_acceptance_result"]
                ),
                "finished_at": max(
                    _parse_datetime(row["executed_at"], phase1_finished)
                    for row in self.rows["phase2_acceptance_result"]
                ),
                "model_version": PHASE2_VERSION,
                "input_manifest": {"source_table": "phase2_acceptance_result"},
                "output_manifest": {},
                "row_counts": {"phase2_acceptance_result": len(self.rows["phase2_acceptance_result"])},
                "quality_metrics": {},
            },
            "feedback-service": {
                "pipeline_name": "phase2_feedback_import",
                "started_at": min(
                    _parse_datetime(row["observed_at"], phase1_finished)
                    for row in self.rows["segment_observation"]
                ),
                "finished_at": max(
                    _parse_datetime(row["observed_at"], phase1_finished)
                    for row in self.rows["segment_observation"]
                ),
                "model_version": "kr-v0.2.0",
                "input_manifest": {"source_tables": ["segment_observation", "posterior_update"]},
                "output_manifest": {},
                "row_counts": {
                    "segment_observation": len(self.rows["segment_observation"]),
                    "posterior_update": len(self.rows["posterior_update"]),
                },
                "quality_metrics": {},
            },
        }
        run_rows = []
        for raw_run_id, spec in source_run_specs.items():
            run_rows.append(
                {
                    "run_id": deterministic_uuid("pipeline_run", raw_run_id),
                    "pipeline_name": spec["pipeline_name"],
                    "started_at": spec["started_at"],
                    "finished_at": spec["finished_at"],
                    "status": "success",
                    "input_manifest": spec["input_manifest"],
                    "output_manifest": spec["output_manifest"],
                    "row_counts": spec["row_counts"],
                    "quality_metrics": spec["quality_metrics"],
                    "model_version_id": self.model_id(spec["model_version"]),
                    "data_version": spec["model_version"],
                    "external_run_key": raw_run_id,
                }
            )
        _upsert_preserving_identifier(
            self.cursor, "pipeline_run", "run_id", "external_run_key", run_rows
        )
        self.cursor.execute(
            "SELECT external_run_key, run_id FROM pipeline_run WHERE external_run_key = ANY(%s)",
            [list(source_run_specs)],
        )
        self.run_ids = {row["external_run_key"]: row["run_id"] for row in self.cursor.fetchall()}
        for version, raw_run_id in ((PHASE1_VERSION, str(raw_phase1["run_id"])), (PHASE2_VERSION, "RUN-P2-20260824T170416Z")):
            self.cursor.execute(
                "UPDATE model_version SET created_by_run_id=%s WHERE version=%s AND created_by_run_id IS NULL",
                [self.run_ids[raw_run_id], version],
            )

    def load_sources(self) -> None:
        source_rows = []
        source_metadata: dict[str, dict[str, Any]] = {}
        for row in self.rows["data_source"]:
            source_metadata[str(row["source_id"])] = row
            source_rows.append(
                {
                    **row,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        _upsert_rows(self.cursor, "data_source", source_rows, ["source_id"])

        release_rows = []
        for row in self.rows["source_release"]:
            source = source_metadata[str(row["source_id"])]
            citation = (
                f"{source['publisher']}. {source['dataset_title']}. {row['version_label']}. "
                f"Reference period {row['reference_period_start']} to {row['reference_period_end']}. "
                f"{source['official_url']}"
            )
            release_rows.append(
                {
                    "release_id": row["release_id"],
                    "source_id": row["source_id"],
                    "version_label": row["version_label"],
                    "reference_period_start": _parse_date(row["reference_period_start"]),
                    "reference_period_end": _parse_date(row["reference_period_end"]),
                    "publication_date": _parse_date(row["publication_date"]),
                    "retrieved_at": _parse_datetime(row["retrieved_at"], self.now),
                    "local_uri": row["local_uri"],
                    "file_format": row["file_format"],
                    "checksum": row["checksum"],
                    "citation_text": citation,
                    "status": row["status"],
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        _upsert_rows(self.cursor, "source_release", release_rows, ["release_id"])

    def load_dimensions(self) -> None:
        category_rows = []
        for index, row in enumerate(self.rows["category"], start=1):
            category_rows.append(
                {
                    "code": row["code"],
                    "name_ko": row["name_ko"],
                    "description": row["name_ko"],
                    "entity_units": _json_value(row["entity_units_json"], []),
                    "sort_order": index,
                    "version": row["version"],
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        self.category_ids = _upsert_by_external_key(
            self.cursor, "category", "category_id", "code", category_rows
        )

        feature_rows = [
            {
                "feature_code": row["feature_code"],
                "label_ko": row["label_ko"],
                "entity_unit": row["entity_unit"],
                "data_type": row["data_type"],
                "allowed_values": None,
                "sensitive_class": row["sensitive_class"],
                "queryable": row["queryable"],
                "definition": row["label_ko"],
                "data_version": PHASE1_VERSION,
                "created_by_run_id": self.phase1_run_id,
            }
            for row in self.rows["feature_definition"]
        ]
        self.feature_ids = _upsert_by_external_key(
            self.cursor, "feature_definition", "feature_id", "feature_code", feature_rows
        )

        self.cursor.execute(
            "SELECT geography_id FROM geography WHERE code='KR' ORDER BY valid_from LIMIT 1"
        )
        existing_geography = self.cursor.fetchone()
        if existing_geography:
            self.geography_id = int(existing_geography["geography_id"])
            self.cursor.execute(
                """
                UPDATE geography SET name_ko='대한민국', level='country', valid_to=NULL,
                    data_version=%s, created_by_run_id=%s
                WHERE geography_id=%s
                """,
                [PHASE2_VERSION, self.phase2_run_id, self.geography_id],
            )
        else:
            self.cursor.execute(
                """
                INSERT INTO geography(code,name_ko,level,valid_from,data_version,created_by_run_id)
                VALUES ('KR','대한민국','country','1948-08-15',%s,%s) RETURNING geography_id
                """,
                [PHASE2_VERSION, self.phase2_run_id],
            )
            self.geography_id = int(self.cursor.fetchone()["geography_id"])

        dates = {str(row["period"])[:10] for row in self.rows["baseline_cell"]}
        minor_path = ROOT / "data" / "processed" / "minor_population_cells.parquet"
        dates.update(str(row[0])[:10] for row in self.duck.execute(
            f"SELECT DISTINCT period FROM read_parquet('{minor_path.as_posix()}')"
        ).fetchall())
        history_path = ROOT / "data" / "processed" / "population_history_2020_2024.parquet"
        history_years = [int(row[0]) for row in self.duck.execute(
            f"SELECT DISTINCT year FROM read_parquet('{history_path.as_posix()}') ORDER BY year"
        ).fetchall()]
        dates.update(f"{year}-12-31" for year in history_years)

        for year in history_years:
            start = date(year, 1, 1)
            end = date(year, 12, 31)
            self.cursor.execute(
                """
                INSERT INTO time_period(period_type,start_date,end_date,label,data_version,created_by_run_id)
                VALUES ('year',%s,%s,%s,%s,%s)
                ON CONFLICT (period_type,start_date,end_date) DO UPDATE SET
                    label=EXCLUDED.label, data_version=EXCLUDED.data_version,
                    created_by_run_id=EXCLUDED.created_by_run_id
                """,
                [start, end, str(year), PHASE2_VERSION, self.phase2_run_id],
            )
        for value in sorted(dates):
            period_type, start, end = _period_bounds(value)
            self.cursor.execute(
                """
                INSERT INTO time_period(period_type,start_date,end_date,label,data_version,created_by_run_id)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (period_type,start_date,end_date) DO UPDATE SET
                    label=EXCLUDED.label, data_version=EXCLUDED.data_version,
                    created_by_run_id=EXCLUDED.created_by_run_id
                """,
                [period_type, start, end, value, PHASE2_VERSION, self.phase2_run_id],
            )
        self.cursor.execute(
            "SELECT period_id, start_date FROM time_period WHERE period_type='point' AND start_date = ANY(%s)",
            [[date.fromisoformat(value) for value in dates]],
        )
        self.period_ids = {str(row["start_date"]): int(row["period_id"]) for row in self.cursor.fetchall()}

    def load_evidence_and_cells(self) -> None:
        evidence_rows: list[dict[str, Any]] = []
        for row in self.rows["baseline_cell"]:
            dimensions = _json_value(row["dimensions_json"], {})
            method = str(row["method_code"])
            evidence_rows.append(
                {
                    "release_id": row["release_id"],
                    "locator": row["evidence_locator"],
                    "supported_claim": f"Baseline control {row['control_id']} count",
                    "value": row["count_base"],
                    "unit": row["entity_unit"],
                    "denominator": _canonical_json(dimensions),
                    "extraction_method": method,
                    "reviewer_status": "machine_checked",
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "external_evidence_key": row["control_id"],
                    "source_treatment": "processed" if method in {"official_derived_difference", "official_rounded_thousand"} else "raw",
                    "usage_context": "baseline control",
                    "confidence_score": None,
                    "review_due_at": None,
                }
            )

        for model in self.rows["probability_model"]:
            components = _json_value(model["components_json"], [])
            for index, component in enumerate(components, start=1):
                release_id = component.get("release_id")
                if not release_id:
                    continue
                evidence_rows.append(
                    {
                        "release_id": release_id,
                        "locator": component["locator"],
                        "supported_claim": component["label"],
                        "value": component.get("base"),
                        "unit": "probability",
                        "denominator": _canonical_json(_json_value(model["applies_when_json"], {})),
                        "extraction_method": model["method_code"],
                        "reviewer_status": "machine_checked",
                        "data_version": PHASE1_VERSION,
                        "created_by_run_id": self.phase1_run_id,
                        "external_evidence_key": f"probability:{model['model_code']}:{index}",
                        "source_treatment": "proxy",
                        "usage_context": "probability-model component",
                        "confidence_score": None,
                        "review_due_at": None,
                    }
                )
        self.evidence_ids = _upsert_by_external_key(
            self.cursor, "evidence", "evidence_id", "external_evidence_key", evidence_rows
        )

        population_rows: list[dict[str, Any]] = []
        household_rows: list[dict[str, Any]] = []
        business_rows: list[dict[str, Any]] = []
        for source in self.rows["baseline_cell"]:
            unit = str(source["entity_unit"])
            if unit == "child_person":
                # Range controls remain evidence/estimates; exact-age cells come from the immutable minor Parquet.
                continue
            dimensions = _json_value(source["dimensions_json"], {})
            base = source["count_base"]
            common = {
                "model_version_id": self.model_id(str(source["model_version"])),
                "geography_id": self.geography_id,
                "period_id": self.period_ids[str(source["period"])[:10]],
                "method_code": source["method_code"],
                "source_release_ids": (str(source["release_id"]),),
                "data_version": PHASE1_VERSION,
                "created_by_run_id": self.phase1_run_id,
                "source_record_key": source["control_id"],
                "source_content_hash": _content_hash(source),
            }
            if unit == "person":
                attributes = {key: value for key, value in dimensions.items() if key != "age_min"}
                population_rows.append(
                    {
                        **common,
                        "age": None,
                        "age_band": f"{dimensions['age_min']}+" if "age_min" in dimensions else None,
                        "sex": None,
                        "marital_status": None,
                        "education_level": None,
                        "occupation_code": None,
                        "household_role": None,
                        "attributes": attributes,
                        "person_count_low": source["count_low"] if source["count_low"] is not None else base,
                        "person_count_base": base,
                        "person_count_high": source["count_high"] if source["count_high"] is not None else base,
                        "calibration_weight": 1,
                    }
                )
            elif unit == "household":
                exact_size = dimensions.get("household_size")
                attributes = {
                    key: value
                    for key, value in dimensions.items()
                    if key not in {"household_size", "children_age_max"}
                }
                if "household_size_min" in dimensions:
                    attributes["household_size_min"] = dimensions["household_size_min"]
                household_rows.append(
                    {
                        **common,
                        "household_size": exact_size,
                        "household_type": dimensions.get("household_scope"),
                        "children_age_structure": (
                            f"age_0_{dimensions['children_age_max']}" if "children_age_max" in dimensions else None
                        ),
                        "income_band": None,
                        "housing_tenure": None,
                        "attributes": attributes,
                        "household_count_low": source["count_low"] if source["count_low"] is not None else base,
                        "household_count_base": base,
                        "household_count_high": source["count_high"] if source["count_high"] is not None else base,
                    }
                )
            elif unit in {"establishment", "enterprise"}:
                attributes = {
                    key: value
                    for key, value in dimensions.items()
                    if key not in {"industry_code", "owner_age_band"}
                }
                business_rows.append(
                    {
                        **common,
                        "industry_code": dimensions.get("industry_code", "ALL"),
                        "legal_form": None,
                        "employee_band": None,
                        "sales_band": None,
                        "establishment_or_enterprise": unit,
                        "owner_age_band": dimensions.get("owner_age_band"),
                        "digital_presence_features": {},
                        "attributes": attributes,
                        "entity_count_low": source["count_low"] if source["count_low"] is not None else base,
                        "entity_count_base": base,
                        "entity_count_high": source["count_high"] if source["count_high"] is not None else base,
                    }
                )
            else:
                raise PostgresBackfillError(f"unsupported baseline entity unit: {unit}")

        _upsert_by_external_key(
            self.cursor, "population_cell", "population_cell_id", "source_record_key", population_rows
        )
        _upsert_by_external_key(
            self.cursor, "household_cell", "household_cell_id", "source_record_key", household_rows
        )
        _upsert_by_external_key(
            self.cursor, "business_cell", "business_cell_id", "source_record_key", business_rows
        )

        minor_path = ROOT / "data" / "processed" / "minor_population_cells.parquet"
        minor_cursor = self.duck.execute(f"SELECT * FROM read_parquet('{minor_path.as_posix()}') ORDER BY exact_age")
        minor_columns = [item[0] for item in minor_cursor.description]
        minor_rows = []
        for values in minor_cursor.fetchall():
            source = dict(zip(minor_columns, values, strict=True))
            key = f"minor:KR:{str(source['period'])[:10]}:age:{source['exact_age']}"
            minor_rows.append(
                {
                    "model_version_id": self.model_id(PHASE1_VERSION),
                    "geography_id": self.geography_id,
                    "period_id": self.period_ids[str(source["period"])[:10]],
                    "exact_age": source["exact_age"],
                    "school_stage": source["school_stage"],
                    "household_type": None,
                    "guardian_structure": None,
                    "attributes": {"universe": "resident_registration_excludes_foreigners"},
                    "child_count_low": source["count_low"],
                    "child_count_base": source["count_base"],
                    "child_count_high": source["count_high"],
                    "method_code": source["method_code"],
                    "source_release_ids": (str(source["source_release_id"]),),
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "source_record_key": key,
                    "source_content_hash": _content_hash(source),
                }
            )
        _upsert_by_external_key(
            self.cursor, "minor_population_cell", "minor_cell_id", "source_record_key", minor_rows
        )

        history_path = ROOT / "data" / "processed" / "population_history_2020_2024.parquet"
        history_cursor = self.duck.execute(f"SELECT * FROM read_parquet('{history_path.as_posix()}') ORDER BY year")
        history_columns = [item[0] for item in history_cursor.description]
        history_rows: list[dict[str, Any]] = []
        for values in history_cursor.fetchall():
            source = dict(zip(history_columns, values, strict=True))
            release_id = f"REL-MOIS-AGE-{source['year']}-12"
            for kind, age_band, count in (
                ("resident_total", None, source["resident_total"]),
                ("adult_19_plus", "19+", source["adult_19_plus"]),
            ):
                content = {**source, "series": kind, "count": count}
                history_rows.append(
                    {
                        "model_version_id": self.model_id(PHASE1_VERSION),
                        "geography_id": self.geography_id,
                        "period_id": self.period_ids[str(source["period"])[:10]],
                        "age": None,
                        "age_band": age_band,
                        "sex": None,
                        "marital_status": None,
                        "education_level": None,
                        "occupation_code": None,
                        "household_role": None,
                        "attributes": {
                            "series": kind,
                            "universe": "resident_registration_excludes_foreigners",
                        },
                        "person_count_low": count,
                        "person_count_base": count,
                        "person_count_high": count,
                        "calibration_weight": 1,
                        "method_code": "official_direct" if kind == "resident_total" else "official_derived_difference",
                        "source_release_ids": (release_id,),
                        "data_version": PHASE1_VERSION,
                        "created_by_run_id": self.phase1_run_id,
                        "source_record_key": f"population-history:{source['year']}:{kind}",
                        "source_content_hash": _content_hash(content),
                    }
                )
        _upsert_by_external_key(
            self.cursor, "population_cell", "population_cell_id", "source_record_key", history_rows
        )

    def load_archetypes_and_estimates(self) -> None:
        estimate_source = {str(row["archetype_id"]): row for row in self.rows["archetype_estimate"]}
        archetype_rows: list[dict[str, Any]] = []
        rule_rows: list[dict[str, Any]] = []
        profile_rows: list[dict[str, Any]] = []
        definition_by_id: dict[str, str] = {}
        for source in self.rows["archetype"]:
            archetype_id = str(source["archetype_id"])
            estimate = estimate_source[archetype_id]
            rule = _json_value(source["rule_json"], {})
            definition_by_id[archetype_id] = str(source["one_line_definition"])
            archetype_rows.append(
                {
                    "archetype_id": archetype_id,
                    "category_id": self.category_ids[str(source["category_code"])],
                    "name_ko": source["name_ko"],
                    "name_en": None,
                    "one_line_definition": source["one_line_definition"],
                    "primary_entity_unit": source["primary_entity_unit"],
                    "age_min": None,
                    "age_max": None,
                    "status": estimate["status"],
                    "version": source["version"],
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
            rule_rows.append(
                {
                    "archetype_id": archetype_id,
                    "rule_json": rule,
                    "rule_hash": source["rule_hash"],
                    "rule_version": source["version"],
                    "deterministic_or_probabilistic": "deterministic",
                    "required_features": _extract_required_features(rule),
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
            overlap_note = str(source["overlap_note"])
            profile_rows.append(
                {
                    "archetype_id": archetype_id,
                    "observable_traits": _json_value(source["observable_traits_json"], []),
                    "inferred_needs": _json_value(source["inferred_needs_json"], []),
                    "triggers": [],
                    "objections": [],
                    "channels": _json_value(source["channels_json"], []),
                    "inference_disclosure": (
                        f"{overlap_note} Synthetic narrative attributes are hypotheses, not facts about real people."
                    ),
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        _upsert_rows(self.cursor, "archetype", archetype_rows, ["archetype_id"])
        _upsert_rows(self.cursor, "archetype_rule", rule_rows, ["archetype_id", "rule_version"])
        _upsert_rows(self.cursor, "archetype_profile", profile_rows, ["archetype_id"])

        representative_kind = {
            "nemotron": ("nemotron", "data/processed/nemotron_feature_mart.parquet"),
            "synthetic_child_person": ("synthetic_minor", "data/processed/synthetic_minor_household_links.parquet"),
            "synthetic_household": ("synthetic_household", "data/processed/synthetic_child_households.parquet"),
            "synthetic_enterprise": ("synthetic_business", "data/processed/archetype_representative.parquet"),
        }
        representative_rows = []
        for source in self.rows["archetype_representative"]:
            source_kind, storage_uri = representative_kind[str(source["source_kind"])]
            representative_rows.append(
                {
                    "archetype_id": source["archetype_id"],
                    "source_kind": source_kind,
                    "source_persona_key": source["source_persona_key"],
                    "rank": 1,
                    "distance_or_similarity": None,
                    "representative_summary": definition_by_id[str(source["archetype_id"])],
                    "storage_uri": storage_uri,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        _upsert_rows(
            self.cursor,
            "archetype_representative",
            representative_rows,
            ["archetype_id", "source_kind", "rank"],
        )

        latest_period_id = self.period_ids["2024-12-31"]
        estimate_rows: list[dict[str, Any]] = []
        for source in self.rows["archetype_estimate"]:
            archetype = next(
                row for row in self.rows["archetype"] if row["archetype_id"] == source["archetype_id"]
            )
            key = f"phase1:{source['archetype_id']}"
            estimate_rows.append(
                {
                    "estimate_id": deterministic_uuid("estimate", key),
                    "subject_type": "archetype",
                    "subject_id": source["archetype_id"],
                    "entity_unit": archetype["primary_entity_unit"],
                    "geography_id": self.geography_id,
                    "period_id": latest_period_id,
                    "denominator_definition": source["denominator"],
                    "count_low": source["count_low"],
                    "count_base": source["count_base"],
                    "count_high": source["count_high"],
                    "share_low": source["share_low"],
                    "share_base": source["share_base"],
                    "share_high": source["share_high"],
                    "method_code": source["method_code"],
                    "formula": source["formula"],
                    "precision_rule": "source_precision",
                    "model_version_id": self.model_id(PHASE1_VERSION),
                    "run_id": self.phase1_run_id,
                    "status": source["status"],
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "external_estimate_key": key,
                    "data_layer": "baseline",
                    "approval_status": "approved",
                    "calculation_input_hash": _content_hash(source),
                    "dependency_fingerprint": self.semantic_sha256,
                }
            )

        for source in self.rows["baseline_cell"]:
            key = f"control:{source['control_id']}"
            dimensions = _json_value(source["dimensions_json"], {})
            base = source["count_base"]
            estimate_rows.append(
                {
                    "estimate_id": deterministic_uuid("estimate", key),
                    "subject_type": "control",
                    "subject_id": source["control_id"],
                    "entity_unit": source["entity_unit"],
                    "geography_id": self.geography_id,
                    "period_id": self.period_ids[str(source["period"])[:10]],
                    "denominator_definition": _canonical_json(dimensions),
                    "count_low": source["count_low"] if source["count_low"] is not None else base,
                    "count_base": base,
                    "count_high": source["count_high"] if source["count_high"] is not None else base,
                    "share_low": None,
                    "share_base": None,
                    "share_high": None,
                    "method_code": source["method_code"],
                    "formula": "Direct baseline control from the cited source release",
                    "precision_rule": "source_precision",
                    "model_version_id": self.model_id(str(source["model_version"])),
                    "run_id": self.phase1_run_id,
                    "status": "estimated",
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "external_estimate_key": key,
                    "data_layer": "baseline",
                    "approval_status": "approved",
                    "calculation_input_hash": _content_hash(source),
                    "dependency_fingerprint": self.semantic_sha256,
                }
            )
        _upsert_preserving_identifier(
            self.cursor, "estimate", "estimate_id", "external_estimate_key", estimate_rows
        )
        external_keys = [str(row["external_estimate_key"]) for row in estimate_rows]
        self.cursor.execute(
            "SELECT external_estimate_key, estimate_id FROM estimate WHERE external_estimate_key = ANY(%s)",
            [external_keys],
        )
        estimate_ids = {row["external_estimate_key"]: row["estimate_id"] for row in self.cursor.fetchall()}

        component_rows: list[dict[str, Any]] = []
        for source in self.rows["archetype_estimate"]:
            estimate_id = estimate_ids[f"phase1:{source['archetype_id']}"]
            if source["status"] == "not_estimable":
                component_rows.append(
                    {
                        "estimate_id": estimate_id,
                        "component_type": "unresolved_evidence",
                        "value_low": None,
                        "value_base": None,
                        "value_high": None,
                        "unit": None,
                        "evidence_id": None,
                        "operation": "not_estimable",
                        "sequence": 1,
                        "data_version": PHASE1_VERSION,
                        "created_by_run_id": self.phase1_run_id,
                        "component_code": "missing_joint_distribution",
                        "denominator_definition": source["denominator"],
                        "conditional_probability": None,
                        "reference_period_id": latest_period_id,
                        "directness_class": "inference",
                        "dependency_group": "missing_evidence",
                        "model_version_id": self.model_id(PHASE1_VERSION),
                        "adjustment_reason": "Missing evidence is represented as not_estimable, never as zero.",
                        "metadata_json": {"validation_gaps": _json_value(source["validation_gaps_json"], [])},
                    }
                )
                continue

            control = next(row for row in self.rows["baseline_cell"] if row["control_id"] == "CTL-ENT-I56-2023")
            component_rows.append(
                {
                    "estimate_id": estimate_id,
                    "component_type": "denominator_control",
                    "value_low": control["count_low"] if control["count_low"] is not None else control["count_base"],
                    "value_base": control["count_base"],
                    "value_high": control["count_high"] if control["count_high"] is not None else control["count_base"],
                    "unit": "enterprise",
                    "evidence_id": self.evidence_ids["CTL-ENT-I56-2023"],
                    "operation": "start",
                    "sequence": 1,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "component_code": "restaurant_small_business_control",
                    "denominator_definition": _canonical_json(_json_value(control["dimensions_json"], {})),
                    "conditional_probability": None,
                    "reference_period_id": self.period_ids[str(control["period"])[:10]],
                    "directness_class": "direct_observation",
                    "dependency_group": "official_business_control",
                    "model_version_id": self.model_id(PHASE1_VERSION),
                    "adjustment_reason": None,
                    "metadata_json": {"release_id": control["release_id"]},
                }
            )
            for sequence, model in enumerate(self.rows["probability_model"], start=2):
                evidence_key = f"probability:{model['model_code']}:1"
                component_rows.append(
                    {
                        "estimate_id": estimate_id,
                        "component_type": "conditional_probability",
                        "value_low": model["probability_low"],
                        "value_base": model["probability_base"],
                        "value_high": model["probability_high"],
                        "unit": "probability",
                        "evidence_id": self.evidence_ids.get(evidence_key),
                        "operation": "multiply",
                        "sequence": sequence,
                        "data_version": PHASE1_VERSION,
                        "created_by_run_id": self.phase1_run_id,
                        "component_code": model["model_code"],
                        "denominator_definition": _canonical_json(_json_value(model["applies_when_json"], {})),
                        "conditional_probability": model["probability_base"],
                        "reference_period_id": latest_period_id,
                        "directness_class": "proxy" if model["method_code"] == "proxy_based" else "inference",
                        "dependency_group": "restaurant_owner_digital_chain",
                        "model_version_id": self.model_id(PHASE1_VERSION),
                        "adjustment_reason": model["formula"],
                        "metadata_json": {
                            "components": _json_value(model["components_json"], []),
                            "validation_gaps": _json_value(model["validation_gaps_json"], []),
                        },
                    }
                )
            component_rows.append(
                {
                    "estimate_id": estimate_id,
                    "component_type": "published_rounding",
                    "value_low": source["count_low"],
                    "value_base": source["count_base"],
                    "value_high": source["count_high"],
                    "unit": "enterprise",
                    "evidence_id": None,
                    "operation": "round",
                    "sequence": 4,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "component_code": "published_estimate_interval",
                    "denominator_definition": source["denominator"],
                    "conditional_probability": None,
                    "reference_period_id": latest_period_id,
                    "directness_class": "inference",
                    "dependency_group": "restaurant_owner_digital_chain",
                    "model_version_id": self.model_id(PHASE1_VERSION),
                    "adjustment_reason": "Preserves the immutable Phase 1 published interval and precision rule.",
                    "metadata_json": {"formula": source["formula"]},
                }
            )

        for source in self.rows["baseline_cell"]:
            base = source["count_base"]
            component_rows.append(
                {
                    "estimate_id": estimate_ids[f"control:{source['control_id']}"],
                    "component_type": "direct_control",
                    "value_low": source["count_low"] if source["count_low"] is not None else base,
                    "value_base": base,
                    "value_high": source["count_high"] if source["count_high"] is not None else base,
                    "unit": source["entity_unit"],
                    "evidence_id": self.evidence_ids[str(source["control_id"])],
                    "operation": "identity",
                    "sequence": 1,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "component_code": source["control_id"],
                    "denominator_definition": _canonical_json(_json_value(source["dimensions_json"], {})),
                    "conditional_probability": None,
                    "reference_period_id": self.period_ids[str(source["period"])[:10]],
                    "directness_class": "direct_observation",
                    "dependency_group": f"release:{source['release_id']}",
                    "model_version_id": self.model_id(str(source["model_version"])),
                    "adjustment_reason": None,
                    "metadata_json": {"release_id": source["release_id"], "locator": source["evidence_locator"]},
                }
            )
        _upsert_rows(self.cursor, "estimate_component", component_rows, ["estimate_id", "sequence"])

        assumption_rows = []
        for rank, source in enumerate(self.rows["probability_model"], start=1):
            components = _json_value(source["components_json"], [])
            releases = sorted({item["release_id"] for item in components if item.get("release_id")})
            assumption_rows.append(
                {
                    "code": source["model_code"],
                    "statement": (
                        f"P({source['feature']} {source['operator']} {_canonical_json(_json_value(source['value_json']))} "
                        f"| {_canonical_json(_json_value(source['applies_when_json'], {}))})"
                    ),
                    "value_low": source["probability_low"],
                    "value_base": source["probability_base"],
                    "value_high": source["probability_high"],
                    "unit": "probability",
                    "justification": f"{source['formula']} Evidence releases: {', '.join(releases) or 'none (explicit scenario)' }.",
                    "source_release_id": releases[0] if len(releases) == 1 else None,
                    "sensitivity_rank": rank,
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
            )
        assumption_ids = _upsert_by_external_key(
            self.cursor, "assumption", "assumption_id", "code", assumption_rows
        )
        estimated_id = estimate_ids["phase1:ARC-06-001"]
        _upsert_rows(
            self.cursor,
            "estimate_assumption",
            [
                {
                    "estimate_id": estimated_id,
                    "assumption_id": assumption_ids[str(source["model_code"])],
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                }
                for source in self.rows["probability_model"]
            ],
            ["estimate_id", "assumption_id"],
        )

        confidence_rows: list[dict[str, Any]] = []
        for source in self.rows["archetype_estimate"]:
            total = int(source["confidence_score"])
            source_quality, recency, directness, joint, model_reliance = _confidence_components(total)
            confidence_rows.append(
                {
                    "estimate_id": estimate_ids[f"phase1:{source['archetype_id']}"],
                    "source_quality_score": source_quality,
                    "recency_score": recency,
                    "directness_score": directness,
                    "joint_observation_score": joint,
                    "model_reliance_score": model_reliance,
                    "total_score": total,
                    "grade": source["confidence_grade"],
                    "rationale": "Imported Phase 1 total; component fields use a proportional fallback because the source stores only the total.",
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "rule_version": "phase1-proportional-fallback-v1",
                    "components_json": {
                        "imported_total": total,
                        "allocation_method": "proportional_to_schema_maxima_with_largest_remainder",
                        "schema_maxima": [30, 15, 20, 20, 15],
                    },
                    "penalties_json": [],
                    "validation_gap_reviewed_at": self.now,
                }
            )
        for source in self.rows["baseline_cell"]:
            method = str(source["method_code"])
            total = 90 if method in {"official_direct", "official_cross_tab"} else 82
            source_quality, recency, directness, joint, model_reliance = _confidence_components(total)
            confidence_rows.append(
                {
                    "estimate_id": estimate_ids[f"control:{source['control_id']}"],
                    "source_quality_score": source_quality,
                    "recency_score": recency,
                    "directness_score": directness,
                    "joint_observation_score": joint,
                    "model_reliance_score": model_reliance,
                    "total_score": total,
                    "grade": _grade_for_score(total),
                    "rationale": f"Deterministic baseline-control rubric for method {method}; not a source-reported score.",
                    "data_version": PHASE1_VERSION,
                    "created_by_run_id": self.phase1_run_id,
                    "rule_version": "baseline-control-confidence-v1",
                    "components_json": {
                        "assessment_kind": "loader_method_classification",
                        "method_code": method,
                        "schema_maxima": [30, 15, 20, 20, 15],
                    },
                    "penalties_json": [],
                    "validation_gap_reviewed_at": self.now,
                }
            )
        _upsert_rows(self.cursor, "confidence_assessment", confidence_rows, ["estimate_id"])

        for source in self.rows["archetype_estimate"]:
            for priority, gap_type in enumerate(_json_value(source["validation_gaps_json"], []), start=1):
                impact, description, recommended = GAP_CATALOG.get(str(gap_type), GAP_CATALOG["other"])
                self._upsert_validation_gap(
                    estimate_id=estimate_ids[f"phase1:{source['archetype_id']}"],
                    archetype_id=str(source["archetype_id"]),
                    gap_type=str(gap_type),
                    description=description,
                    impact=impact,
                    verification_question=f"What directly observed evidence resolves {gap_type}?",
                    recommended_source=recommended,
                    expected_improvement="Replace a proxy or not-estimable result with a source-supported estimate.",
                    priority=min(priority, 5),
                    status="open",
                )
        for source in self.rows["baseline_cell"]:
            self._upsert_validation_gap(
                estimate_id=estimate_ids[f"control:{source['control_id']}"],
                archetype_id=None,
                gap_type="other",
                description=GAP_CATALOG["other"][1],
                impact="low",
                verification_question="Does the control's exact published definition match the requested denominator?",
                recommended_source=GAP_CATALOG["other"][2],
                expected_improvement="Prevents extrapolation beyond the cited control definition.",
                priority=5,
                status="accepted",
            )

    def _upsert_validation_gap(
        self,
        *,
        estimate_id: UUID,
        archetype_id: str | None,
        gap_type: str,
        description: str,
        impact: str,
        verification_question: str,
        recommended_source: str,
        expected_improvement: str,
        priority: int,
        status: str,
    ) -> None:
        values = {
            "estimate_id": estimate_id,
            "archetype_id": archetype_id,
            "gap_type": gap_type,
            "description": description,
            "impact": impact,
            "verification_question": verification_question,
            "recommended_source": recommended_source,
            "expected_improvement": expected_improvement,
            "priority": priority,
            "status": status,
            "data_version": PHASE1_VERSION,
            "created_by_run_id": self.phase1_run_id,
        }
        self.cursor.execute(
            """
            SELECT validation_gap_id FROM validation_gap
            WHERE estimate_id=%s AND gap_type=%s
            ORDER BY validation_gap_id LIMIT 1
            """,
            [estimate_id, gap_type],
        )
        existing = self.cursor.fetchone()
        if existing is None:
            columns = list(values)
            self.cursor.execute(
                sql.SQL("INSERT INTO validation_gap ({}) VALUES ({})").format(
                    sql.SQL(",").join(map(sql.Identifier, columns)),
                    sql.SQL(",").join(sql.Placeholder() for _ in columns),
                ),
                tuple(_adapt(values[column]) for column in columns),
            )
        else:
            columns = [column for column in values if column != "estimate_id"]
            self.cursor.execute(
                sql.SQL("UPDATE validation_gap SET {} WHERE validation_gap_id=%s").format(
                    sql.SQL(",").join(sql.SQL("{}=%s").format(sql.Identifier(column)) for column in columns)
                ),
                tuple(_adapt(values[column]) for column in columns) + (existing["validation_gap_id"],),
            )

    def _transform_phase2_row(
        self,
        table: str,
        source: dict[str, Any],
        *,
        renames: dict[str, str] | None = None,
        omit: Iterable[str] = (),
        map_model_version: bool = True,
    ) -> dict[str, Any]:
        renames = renames or {}
        omitted = set(omit)
        transformed: dict[str, Any] = {}
        for source_column, value in source.items():
            if source_column in omitted or source_column in {"model_version", "run_id"}:
                continue
            target_column = renames.get(source_column, source_column)
            if target_column in {
                "allowed_values",
                "rule_json",
                "profile_json",
                "gaps_json",
                "source_release_ids",
                "validation_gaps",
                "denominator_json",
                "assumptions_json",
                "validation_gaps_json",
                "required_tags_json",
                "query_json",
                "result_json",
                "label_evidence",
                "feature_loadings",
                "feature_pipeline",
                "sample_definition",
                "candidate_k",
                "random_seeds",
                "stability_metrics",
                "observed_evidence",
                "inferred_profile",
                "jobs_to_be_done",
                "triggers",
                "barriers",
                "engagement_modes",
                "creative_hypotheses",
                "prohibited_inferences",
                "validation_plan",
                "activation_payload",
                "creative_brief",
                "measurement_plan",
                "exclusions",
                "channel_context",
                "sampling_context",
                "bias_flags",
                "prior_parameters",
                "likelihood_specification",
                "posterior_parameters",
                "diagnostics",
            }:
                value = _json_value(value, [] if target_column.endswith("s") else {})
            if target_column in {"audited_at", "reviewed_at", "executed_at", "observed_at"}:
                value = _parse_datetime(value, self.now)
            if target_column in {"observation_id", "posterior_update_id"} and value is not None:
                value = UUID(str(value))
            transformed[target_column] = value

        raw_model_version = source.get("model_version")
        if raw_model_version is not None and map_model_version:
            transformed["model_version_id"] = self.model_id(str(raw_model_version))
        raw_run_id = source.get("run_id")
        if raw_run_id is not None:
            transformed["run_id"] = self.run_id(raw_run_id)
            created_by = self.run_id(raw_run_id)
        elif table == "segment_observation":
            created_by = self.run_id("feedback-service")
        else:
            created_by = self.phase2_run_id
        transformed["data_version"] = PHASE2_VERSION
        transformed["created_by_run_id"] = created_by
        return transformed

    def _load_phase2_table(
        self,
        table: str,
        conflict_columns: Sequence[str],
        *,
        renames: dict[str, str] | None = None,
        omit: Iterable[str] = (),
        sort_key: str | None = None,
        map_model_version: bool = True,
    ) -> None:
        sources = self.rows[table]
        if sort_key:
            sources = sorted(sources, key=lambda row: row[sort_key])
        rows = [
            self._transform_phase2_row(
                table,
                row,
                renames=renames,
                omit=omit,
                map_model_version=map_model_version,
            )
            for row in sources
        ]
        _upsert_rows(self.cursor, table, rows, conflict_columns)

    def load_phase2(self) -> None:
        domain_rows = []
        minor_by_domain: dict[str, bool] = {}
        for source in self.rows["domain_registry"]:
            minor_by_domain[str(source["domain_id"])] = bool(source["minor_guardrail"])
            domain_rows.append(
                {
                    "domain_id": source["domain_id"],
                    "domain_code": source["domain_code"],
                    "name_ko": source["name_ko"],
                    "description": source["description"],
                    "primary_entity_unit": source["primary_entity_unit"],
                    "category_id": self.category_ids[str(source["category_code"])],
                    "coverage_status": source["coverage_status"],
                    "active": source["active"],
                    "minor_guardrail": source["minor_guardrail"],
                    "version": source["version"],
                    "data_version": PHASE2_VERSION,
                    "created_by_run_id": self.phase2_run_id,
                }
            )
        _upsert_rows(self.cursor, "domain_registry", domain_rows, ["domain_id"])
        self._load_phase2_table(
            "domain_dimension",
            ["dimension_id"],
            renames={"allowed_values_json": "allowed_values"},
        )

        domain_feature_rows = []
        feature_sensitive = {
            str(row["feature_code"]): str(row["sensitive_class"])
            for row in self.rows["feature_definition"]
        }
        for source in self.rows["domain_feature"]:
            targetability = str(source["targetability_class"])
            sensitive = feature_sensitive.get(str(source["feature_code"]))
            if sensitive is None:
                if minor_by_domain[str(source["domain_id"])]:
                    sensitive = "minor_protected"
                elif targetability in {"first_party_data_required", "not_allowed"}:
                    sensitive = "restricted_targeting"
                else:
                    sensitive = "non_sensitive"
            domain_feature_rows.append(
                {
                    "domain_feature_id": source["domain_feature_id"],
                    "domain_id": source["domain_id"],
                    "dimension_id": source["dimension_id"],
                    "feature_code": source["feature_code"],
                    "label_ko": source["label_ko"],
                    "data_type": source["data_type"],
                    "allowed_values": _json_value(source["allowed_values_json"]),
                    "observable_status": source["observable_status"],
                    "targetability_class": targetability,
                    "queryable": source["queryable"],
                    "sensitive_class": sensitive,
                    "data_version": PHASE2_VERSION,
                    "created_by_run_id": self.phase2_run_id,
                }
            )
        _upsert_rows(self.cursor, "domain_feature", domain_feature_rows, ["domain_feature_id"])
        self._load_phase2_table(
            "domain_feature_source",
            ["domain_feature_id", "release_id", "evidence_role"],
        )
        self._load_phase2_table("domain_behavior_template", ["behavior_template_id"])
        self._load_phase2_table("domain_tag", ["tag_id"])
        self._load_phase2_table("domain_profile_summary", ["domain_id", "model_version_id"])
        self._load_phase2_table("domain_association", ["association_id"])
        self._load_phase2_table("domain_coverage_audit", ["domain_id", "model_version_id"])
        self._load_phase2_table("archetype_hierarchy", ["hierarchy_id"], sort_key="hierarchy_level")
        self._load_phase2_table(
            "latent_dimension",
            ["latent_dimension_id"],
            renames={"feature_loadings_json": "feature_loadings"},
            omit=("model_version",),
            map_model_version=False,
        )
        self._load_phase2_table(
            "segmentation_model",
            ["segmentation_model_id"],
            renames={
                "feature_pipeline_json": "feature_pipeline",
                "sample_definition_json": "sample_definition",
                "candidate_k_json": "candidate_k",
                "random_seeds_json": "random_seeds",
                "stability_metrics_json": "stability_metrics",
            },
        )
        self._load_phase2_table("cluster_definition", ["cluster_id"], renames={"label_evidence_json": "label_evidence"})
        self._load_phase2_table("cluster_representative", ["cluster_representative_id"])
        self._load_phase2_table("subtype_definition", ["subtype_id"])
        self._load_phase2_table("parent_decomposition_decision", ["phase1_archetype_id"])
        self._load_phase2_table(
            "phase2_parent_estimate",
            ["phase1_archetype_id", "model_version_id"],
            renames={
                "source_release_ids_json": "source_release_ids",
                "validation_gaps_json": "validation_gaps",
            },
        )
        self._load_phase2_table(
            "subtype_allocation",
            ["phase1_archetype_id", "subtype_id", "model_version_id"],
        )
        self._load_phase2_table(
            "required_parent_case",
            ["case_id"],
            renames={"source_release_ids_json": "source_release_ids"},
        )
        self._load_phase2_table(
            "required_parent_case_allocation",
            ["case_id", "subtype_id", "model_version_id"],
        )
        self._load_phase2_table(
            "subtype_membership_summary",
            ["subtype_id", "segmentation_model_id"],
        )
        self._load_phase2_table(
            "subtype_profile",
            ["subtype_id"],
            renames={
                "observed_evidence_json": "observed_evidence",
                "inferred_profile_json": "inferred_profile",
                "jobs_to_be_done_json": "jobs_to_be_done",
                "triggers_json": "triggers",
                "barriers_json": "barriers",
                "engagement_modes_json": "engagement_modes",
                "creative_hypotheses_json": "creative_hypotheses",
                "prohibited_inferences_json": "prohibited_inferences",
            },
        )
        self._load_phase2_table(
            "subtype_confidence",
            ["subtype_id"],
            renames={
                "stability_component_score": "stability_score",
                "validation_plan_json": "validation_plan",
            },
        )
        self._load_phase2_table("subtype_tag_allocation", ["subtype_id", "tag_id"])
        self._load_phase2_table(
            "activation_mapping",
            ["activation_mapping_id"],
            renames={
                "activation_payload_json": "activation_payload",
                "creative_brief_json": "creative_brief",
                "measurement_plan_json": "measurement_plan",
                "exclusions_json": "exclusions",
            },
        )
        self._load_phase2_table(
            "segment_observation",
            ["observation_id"],
            renames={
                "channel_context_json": "channel_context",
                "sampling_context_json": "sampling_context",
                "bias_flags_json": "bias_flags",
            },
        )
        self._load_phase2_table(
            "posterior_update",
            ["posterior_update_id"],
            renames={
                "prior_parameters_json": "prior_parameters",
                "likelihood_specification_json": "likelihood_specification",
                "posterior_parameters_json": "posterior_parameters",
                "diagnostics_json": "diagnostics",
            },
        )
        self._load_phase2_table("phase2_acceptance_result", ["case_id"])


def _target_fingerprint(cursor: psycopg.Cursor[Any]) -> str:
    cursor.execute(
        "SELECT run_id FROM pipeline_run WHERE external_run_key = ANY(%s)",
        [list(SOURCE_RUN_KEYS)],
    )
    source_run_ids = [row["run_id"] for row in cursor.fetchall()]
    if len(source_run_ids) != len(SOURCE_RUN_KEYS):
        raise PostgresBackfillError("source pipeline runs are incomplete; cannot fingerprint the baseline")
    payload: dict[str, list[str]] = {}
    for table in TARGET_FINGERPRINT_TABLES:
        cursor.execute(
            """
            SELECT column_name, is_identity
            FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name=%s
            ORDER BY ordinal_position
            """,
            [table],
        )
        columns = [
            row["column_name"]
            for row in cursor.fetchall()
            if row["column_name"] not in {"created_at", "updated_at"} and row["is_identity"] != "YES"
        ]
        if not columns:
            raise PostgresBackfillError(f"cannot fingerprint missing or empty table definition: {table}")
        # Workbench calculations may legitimately reference a Phase 1/2 run as
        # their input lineage.  They are not part of the immutable imported
        # baseline, even if an older writer also copied that run into
        # created_by_run_id.  Scope estimate-backed rows to the baseline layer
        # so user/derived data cannot create a false-positive baseline drift.
        if table == "estimate":
            query = sql.SQL(
                "SELECT {} FROM {} WHERE created_by_run_id = ANY(%s) "
                "AND data_layer = 'baseline' "
                "AND (external_estimate_key LIKE 'phase1:%%' "
                "OR external_estimate_key LIKE 'control:%%')"
            ).format(
                sql.SQL(",").join(map(sql.Identifier, columns)),
                sql.Identifier(table),
            )
        elif table in {
            "estimate_component",
            "estimate_assumption",
            "confidence_assessment",
            "validation_gap",
        }:
            query = sql.SQL(
                "SELECT {} FROM {} AS fingerprint_row "
                "JOIN estimate AS fingerprint_estimate USING (estimate_id) "
                "WHERE fingerprint_row.created_by_run_id = ANY(%s) "
                "AND fingerprint_estimate.data_layer = 'baseline' "
                "AND (fingerprint_estimate.external_estimate_key LIKE 'phase1:%%' "
                "OR fingerprint_estimate.external_estimate_key LIKE 'control:%%')"
            ).format(
                sql.SQL(",").join(
                    sql.Identifier("fingerprint_row", column) for column in columns
                ),
                sql.Identifier(table),
            )
        else:
            query = sql.SQL("SELECT {} FROM {} WHERE created_by_run_id = ANY(%s)").format(
                sql.SQL(",").join(map(sql.Identifier, columns)),
                sql.Identifier(table),
            )
        cursor.execute(query, [source_run_ids])
        payload[table] = sorted(_canonical_json(row) for row in cursor.fetchall())
    return _content_hash(payload)


def _query_count(cursor: psycopg.Cursor[Any], query: str, parameters: Sequence[Any] = ()) -> int:
    cursor.execute(query, parameters)
    return int(cursor.fetchone()["count"])


def _verify_loaded_baseline(
    cursor: psycopg.Cursor[Any],
    duck: duckdb.DuckDBPyConnection,
) -> dict[str, Any]:
    model_v1 = cursor.execute(
        "SELECT model_version_id FROM model_version WHERE version=%s", [PHASE1_VERSION]
    ).fetchone()
    model_v2 = cursor.execute(
        "SELECT model_version_id FROM model_version WHERE version=%s", [PHASE2_VERSION]
    ).fetchone()
    if model_v1 is None or model_v2 is None:
        raise BaselineVerificationError("required Phase 1/2 model versions are missing")
    model_v1_id = model_v1["model_version_id"]
    model_v2_id = model_v2["model_version_id"]
    cursor.execute(
        "SELECT external_run_key, run_id FROM pipeline_run WHERE external_run_key = ANY(%s)",
        [list(SOURCE_RUN_KEYS)],
    )
    source_runs = {row["external_run_key"]: row["run_id"] for row in cursor.fetchall()}
    if len(source_runs) != len(SOURCE_RUN_KEYS):
        raise BaselineVerificationError("required source pipeline runs are missing")
    source_run_ids = list(source_runs.values())

    count_queries: dict[str, tuple[str, Sequence[Any]]] = {
        "domain": ("SELECT count(*) AS count FROM domain_registry WHERE created_by_run_id=ANY(%s)", [source_run_ids]),
        "axis": ("SELECT count(*) AS count FROM domain_dimension WHERE created_by_run_id=ANY(%s)", [source_run_ids]),
        "feature": ("SELECT count(*) AS count FROM domain_feature WHERE created_by_run_id=ANY(%s)", [source_run_ids]),
        "behavior": ("SELECT count(*) AS count FROM domain_behavior_template WHERE created_by_run_id=ANY(%s)", [source_run_ids]),
        "segmentation_model": (
            "SELECT count(*) AS count FROM segmentation_model WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
        ),
        "primary_subtype": (
            "SELECT count(*) AS count FROM subtype_definition WHERE created_by_run_id=ANY(%s) AND is_primary",
            [source_run_ids],
        ),
        "parent_allocation": (
            "SELECT count(*) AS count FROM subtype_allocation WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
        ),
        "archetype": ("SELECT count(*) AS count FROM archetype WHERE created_by_run_id=ANY(%s)", [source_run_ids]),
        "activation_json": (
            """
            SELECT count(*) AS count FROM activation_mapping
            WHERE created_by_run_id=ANY(%s)
              AND jsonb_typeof(activation_payload)='object'
              AND jsonb_typeof(creative_brief)='object'
              AND jsonb_typeof(measurement_plan)='object'
              AND jsonb_typeof(exclusions)='array'
            """,
            [source_run_ids],
        ),
    }
    counts = {name: _query_count(cursor, query, parameters) for name, (query, parameters) in count_queries.items()}

    canonical_count_queries: dict[str, tuple[str, Sequence[Any], int]] = {
        "data_source": (
            "SELECT count(*) AS count FROM data_source WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            8,
        ),
        "source_release": (
            "SELECT count(*) AS count FROM source_release WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            12,
        ),
        "category": (
            "SELECT count(*) AS count FROM category WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            18,
        ),
        "feature_definition": (
            "SELECT count(*) AS count FROM feature_definition WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            26,
        ),
        "archetype_rule": (
            "SELECT count(*) AS count FROM archetype_rule WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            1_440,
        ),
        "archetype_profile": (
            "SELECT count(*) AS count FROM archetype_profile WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            1_440,
        ),
        "archetype_representative": (
            "SELECT count(*) AS count FROM archetype_representative WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            1_440,
        ),
        "archetype_estimate": (
            "SELECT count(*) AS count FROM estimate WHERE subject_type='archetype' AND external_estimate_key LIKE 'phase1:%%'",
            [],
            1_440,
        ),
        "control_estimate": (
            "SELECT count(*) AS count FROM estimate WHERE subject_type='control' AND external_estimate_key LIKE 'control:%%'",
            [],
            16,
        ),
        "evidence": (
            "SELECT count(*) AS count FROM evidence WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            19,
        ),
        "population_cell": (
            "SELECT count(*) AS count FROM population_cell WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            13,
        ),
        "minor_population_cell": (
            "SELECT count(*) AS count FROM minor_population_cell WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            19,
        ),
        "household_cell": (
            "SELECT count(*) AS count FROM household_cell WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            7,
        ),
        "business_cell": (
            "SELECT count(*) AS count FROM business_cell WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            4,
        ),
        "assumption": (
            "SELECT count(*) AS count FROM assumption WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            2,
        ),
        "domain_feature_source": (
            "SELECT count(*) AS count FROM domain_feature_source WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "domain_feature_source")),
        ),
        "domain_tag": (
            "SELECT count(*) AS count FROM domain_tag WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "domain_tag")),
        ),
        "domain_association": (
            "SELECT count(*) AS count FROM domain_association WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "domain_association")),
        ),
        "archetype_hierarchy": (
            "SELECT count(*) AS count FROM archetype_hierarchy WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "archetype_hierarchy")),
        ),
        "cluster_definition": (
            "SELECT count(*) AS count FROM cluster_definition WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "cluster_definition")),
        ),
        "cluster_representative": (
            "SELECT count(*) AS count FROM cluster_representative WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "cluster_representative")),
        ),
        "subtype_profile": (
            "SELECT count(*) AS count FROM subtype_profile WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "subtype_profile")),
        ),
        "subtype_confidence": (
            "SELECT count(*) AS count FROM subtype_confidence WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "subtype_confidence")),
        ),
        "required_parent_case": (
            "SELECT count(*) AS count FROM required_parent_case WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "required_parent_case")),
        ),
        "required_parent_case_allocation": (
            "SELECT count(*) AS count FROM required_parent_case_allocation WHERE created_by_run_id=ANY(%s)",
            [source_run_ids],
            len(_duck_rows(duck, "required_parent_case_allocation")),
        ),
    }
    canonical_counts: dict[str, dict[str, int]] = {}
    for name, (query, parameters, expected) in canonical_count_queries.items():
        actual = _query_count(cursor, query, parameters)
        canonical_counts[name] = {"expected": expected, "actual": actual}

    id_specs: dict[str, tuple[str, str, str]] = {
        "domain": ("domain_registry", "domain_id", "domain_id"),
        "axis": ("domain_dimension", "dimension_id", "dimension_id"),
        "feature": ("domain_feature", "domain_feature_id", "domain_feature_id"),
        "behavior": ("domain_behavior_template", "behavior_template_id", "behavior_template_id"),
        "segmentation_model": ("segmentation_model", "segmentation_model_id", "segmentation_model_id"),
        "primary_subtype": ("subtype_definition", "subtype_id", "subtype_id"),
        "archetype": ("archetype", "archetype_id", "archetype_id"),
        "activation_json": ("activation_mapping", "activation_mapping_id", "activation_mapping_id"),
    }
    id_reconciliation: dict[str, dict[str, int]] = {}
    for metric, (table, source_column, target_column) in id_specs.items():
        source_ids = {str(row[source_column]) for row in _duck_rows(duck, table)}
        predicate = "data_version=%s"
        parameters: list[Any] = [PHASE1_VERSION if table == "archetype" else PHASE2_VERSION]
        if table == "subtype_definition":
            predicate += " AND is_primary"
        cursor.execute(
            sql.SQL("SELECT {} FROM {} WHERE ").format(sql.Identifier(target_column), sql.Identifier(table))
            + sql.SQL(predicate),
            parameters,
        )
        target_ids = {str(row[target_column]) for row in cursor.fetchall()}
        id_reconciliation[metric] = {
            "source": len(source_ids),
            "target": len(target_ids),
            "missing": len(source_ids - target_ids),
            "unexpected": len(target_ids - source_ids),
        }

    cursor.execute(
        """
        WITH allocated AS (
            SELECT phase1_archetype_id, model_version_id,
                   sum(share_base) AS share_sum, sum(count_base) AS count_sum
            FROM subtype_allocation
            WHERE model_version_id=%s
            GROUP BY phase1_archetype_id, model_version_id
        )
        SELECT coalesce(max(abs(a.share_sum - 1)), 0) AS share_error,
               coalesce(max(abs(a.count_sum - p.count_base) / greatest(abs(p.count_base), 1)), 0) AS count_error
        FROM allocated a
        JOIN phase2_parent_estimate p USING (phase1_archetype_id, model_version_id)
        WHERE p.count_base IS NOT NULL
        """,
        [model_v2_id],
    )
    parent_reconciliation = cursor.fetchone()
    cursor.execute(
        """
        WITH allocated AS (
            SELECT case_id, model_version_id,
                   sum(share_base) AS share_sum, sum(count_base) AS count_sum
            FROM required_parent_case_allocation
            WHERE model_version_id=%s
            GROUP BY case_id, model_version_id
        )
        SELECT coalesce(max(abs(a.share_sum - 1)), 0) AS share_error,
               coalesce(max(abs(a.count_sum - p.count_base) / greatest(abs(p.count_base), 1)), 0) AS count_error
        FROM allocated a
        JOIN required_parent_case p USING (case_id, model_version_id)
        """,
        [model_v2_id],
    )
    required_reconciliation = cursor.fetchone()
    cursor.execute(
        """
        SELECT sum(violations)::integer AS violations FROM (
            SELECT count(*) AS violations FROM estimate
             WHERE data_version = ANY(%s) AND status <> 'not_estimable'
               AND (count_low > count_base OR count_base > count_high
                    OR (share_low IS NOT NULL AND (share_low > share_base OR share_base > share_high)))
            UNION ALL
            SELECT count(*) FROM subtype_allocation WHERE model_version_id=%s
               AND (share_low > share_base OR share_base > share_high OR count_low > count_base OR count_base > count_high)
            UNION ALL
            SELECT count(*) FROM required_parent_case_allocation WHERE model_version_id=%s
               AND (share_low > share_base OR share_base > share_high OR count_low > count_base OR count_base > count_high)
        ) checks
        """,
        [[PHASE1_VERSION, PHASE2_VERSION], model_v2_id, model_v2_id],
    )
    interval_violations = int(cursor.fetchone()["violations"])
    cursor.execute(
        """
        SELECT count(*) AS count FROM estimate e
        WHERE e.data_version=%s AND (
            NOT EXISTS (SELECT 1 FROM estimate_component ec WHERE ec.estimate_id=e.estimate_id)
            OR NOT EXISTS (SELECT 1 FROM confidence_assessment ca WHERE ca.estimate_id=e.estimate_id)
            OR NOT EXISTS (SELECT 1 FROM validation_gap vg WHERE vg.estimate_id=e.estimate_id)
        )
        """,
        [PHASE1_VERSION],
    )
    incomplete_lineage = int(cursor.fetchone()["count"])
    cursor.execute(
        """
        SELECT count(*) AS count FROM estimate
        WHERE data_version=%s AND status='not_estimable'
          AND (count_low IS NOT NULL OR count_base IS NOT NULL OR count_high IS NOT NULL)
        """,
        [PHASE1_VERSION],
    )
    missing_as_zero_violations = int(cursor.fetchone()["count"])

    nemotron_path = ROOT / "data" / "processed" / "nemotron_feature_mart.parquet"
    nemotron_rows = int(duck.execute(f"SELECT count(*) FROM read_parquet('{nemotron_path.as_posix()}')").fetchone()[0])
    nemotron_manifest = json.loads((ROOT / "config" / "nemotron_manifest.yml").read_text(encoding="utf-8"))
    fixed_shards = len(nemotron_manifest["shards"])

    checks = {
        "expected_counts": counts == EXPECTED_COUNTS,
        "canonical_counts": all(item["actual"] == item["expected"] for item in canonical_counts.values()),
        "source_ids_preserved": all(
            item["missing"] == 0 and item["unexpected"] == 0 for item in id_reconciliation.values()
        ),
        "parent_share_reconciles": float(parent_reconciliation["share_error"]) <= 1e-12,
        "parent_count_reconciles": float(parent_reconciliation["count_error"]) <= 1e-12,
        "required_parent_share_reconciles": float(required_reconciliation["share_error"]) <= 1e-12,
        "required_parent_count_reconciles": float(required_reconciliation["count_error"]) <= 1e-12,
        "intervals_ordered": interval_violations == 0,
        "estimate_lineage_complete": incomplete_lineage == 0,
        "missing_evidence_not_zero": missing_as_zero_violations == 0,
        "nemotron_rows_1m": nemotron_rows == 1_000_000,
        "fixed_shards_9": fixed_shards == 9,
    }
    result = {
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "counts": counts,
        "expected_counts": EXPECTED_COUNTS,
        "canonical_counts": canonical_counts,
        "id_reconciliation": id_reconciliation,
        "reconciliation": {
            "parent_base_share_max_error": float(parent_reconciliation["share_error"]),
            "parent_base_count_max_relative_error": float(parent_reconciliation["count_error"]),
            "required_parent_base_share_max_error": float(required_reconciliation["share_error"]),
            "required_parent_base_count_max_relative_error": float(required_reconciliation["count_error"]),
            "tolerance": 1e-12,
        },
        "lineage": {
            "incomplete_estimates": incomplete_lineage,
            "not_estimable_non_null_count_violations": missing_as_zero_violations,
            "interval_order_violations": interval_violations,
        },
        "large_immutable_inputs": {
            "nemotron_rows": nemotron_rows,
            "nemotron_fixed_shards": fixed_shards,
            "storage_policy": "Parquet remains authoritative; large feature marts are not copied into PostgreSQL.",
        },
    }
    if result["status"] != "passed":
        failed = [name for name, passed in checks.items() if not passed]
        raise BaselineVerificationError(f"PostgreSQL baseline verification failed: {failed}; details={result}")
    return result


def _database_metadata(connection: psycopg.Connection[Any]) -> dict[str, Any]:
    return {
        "database": connection.info.dbname,
        "host": connection.info.host,
        "port": connection.info.port,
        "user": connection.info.user,
    }


def _write_manifest(manifest: dict[str, Any], json_path: Path, markdown_path: Path) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_tmp = json_path.with_suffix(json_path.suffix + ".tmp")
    markdown_tmp = markdown_path.with_suffix(markdown_path.suffix + ".tmp")
    json_tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")

    verification = manifest["verification"]
    rows = [
        "# Phase 3 PostgreSQL baseline backfill manifest",
        "",
        f"- Status: **{manifest['status']}**",
        f"- Outcome: `{manifest['outcome']}`",
        f"- Loader: `{manifest['loader_version']}`",
        f"- Source semantic SHA-256: `{manifest['source']['semantic_sha256']}`",
        f"- Target semantic SHA-256: `{manifest['target']['semantic_sha256']}`",
        f"- Generated at: `{manifest['generated_at']}`",
        "",
        "## Required canonical counts",
        "",
        "| Metric | Expected | Actual |",
        "|---|---:|---:|",
    ]
    for metric, expected in verification["expected_counts"].items():
        rows.append(f"| {metric} | {expected} | {verification['counts'][metric]} |")
    rows.extend(
        [
            "",
            "## Reconciliation",
            "",
            "| Check | Error |",
            "|---|---:|",
            f"| Parent base share | {verification['reconciliation']['parent_base_share_max_error']:.17g} |",
            f"| Parent base count (relative) | {verification['reconciliation']['parent_base_count_max_relative_error']:.17g} |",
            f"| Required-parent base share | {verification['reconciliation']['required_parent_base_share_max_error']:.17g} |",
            f"| Required-parent base count (relative) | {verification['reconciliation']['required_parent_base_count_max_relative_error']:.17g} |",
            "",
            "## Guarantees and exclusions",
            "",
            "- The import ran under one PostgreSQL transaction and a transaction-scoped advisory lock.",
            "- Repeat runs compare the immutable source semantic hash and the loaded target hash before writing.",
            "- UUID-backed imported records use deterministic UUIDv5 identifiers on a fresh database; natural-key adoption preserves established canonical IDs.",
            "- Missing evidence remains `not_estimable`; it is never replaced by zero.",
            "- Entity units are preserved without undocumented person/household/establishment/enterprise conversion.",
            "- The 1,000,000-row Nemotron feature mart and synthetic link marts remain immutable Parquet inputs and are not duplicated in PostgreSQL.",
            "",
        ]
    )
    markdown_tmp.write_text("\n".join(rows), encoding="utf-8")
    json_tmp.replace(json_path)
    markdown_tmp.replace(markdown_path)


def verify_postgres(
    database_url: str,
    *,
    duckdb_path: Path = PHASE2_DB,
) -> dict[str, Any]:
    duckdb_path = Path(duckdb_path).resolve()
    if not duckdb_path.exists():
        raise PostgresBackfillError(f"DuckDB baseline not found: {duckdb_path}")
    with duckdb.connect(str(duckdb_path), read_only=True) as duck:
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _required_tables(cursor)
                verification = _verify_loaded_baseline(cursor, duck)
                verification["database"] = _database_metadata(connection)
                return verification


def backfill_postgres(
    database_url: str,
    *,
    duckdb_path: Path = PHASE2_DB,
    manifest_json: Path = DEFAULT_MANIFEST_JSON,
    manifest_markdown: Path = DEFAULT_MANIFEST_MD,
    verify_only: bool = False,
) -> dict[str, Any]:
    if verify_only:
        return verify_postgres(database_url, duckdb_path=duckdb_path)

    duckdb_path = Path(duckdb_path).resolve()
    manifest_json = Path(manifest_json).resolve()
    manifest_markdown = Path(manifest_markdown).resolve()
    if not duckdb_path.exists():
        raise PostgresBackfillError(f"DuckDB baseline not found: {duckdb_path}")

    generated_at = datetime.now(timezone.utc)
    with duckdb.connect(str(duckdb_path), read_only=True) as duck:
        semantic_sha256, source_counts = _source_semantic_fingerprint(duck)
        physical_sha256 = _sha256_file(duckdb_path)
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            database = _database_metadata(connection)
            outcome = "loaded"
            loader_run_id: UUID | None = None
            verification: dict[str, Any]
            target_sha256: str
            with connection.transaction():
                with connection.cursor() as cursor:
                    _required_tables(cursor)
                    advisory_key = int.from_bytes(
                        hashlib.sha256(f"{LOADER_VERSION}:{PHASE2_VERSION}".encode("utf-8")).digest()[:8],
                        byteorder="big",
                        signed=True,
                    )
                    cursor.execute("SELECT pg_advisory_xact_lock(%s)", [advisory_key])
                    cursor.execute(
                        """
                        SELECT run_id, status, input_manifest, output_manifest
                        FROM pipeline_run WHERE external_run_key=%s
                        """,
                        [f"postgres-baseline:{PHASE2_VERSION}"],
                    )
                    existing = cursor.fetchone()
                    if existing is not None:
                        if existing["status"] != "success":
                            raise BaselineDriftError(
                                f"existing baseline loader run is not successful: {existing['status']}"
                            )
                        stored_input = _json_value(existing["input_manifest"], {})
                        stored_output = _json_value(existing["output_manifest"], {})
                        if stored_input.get("source_semantic_sha256") != semantic_sha256:
                            raise BaselineDriftError(
                                "immutable DuckDB/Parquet baseline content changed for the published model version"
                            )
                        target_sha256 = _target_fingerprint(cursor)
                        if stored_output.get("target_semantic_sha256") != target_sha256:
                            raise BaselineDriftError(
                                "canonical PostgreSQL baseline drifted after its successful import"
                            )
                        verification = _verify_loaded_baseline(cursor, duck)
                        loader_run_id = existing["run_id"]
                        outcome = "already_current"
                    else:
                        loader = _BaselineLoader(
                            duck,
                            cursor,
                            semantic_sha256=semantic_sha256,
                            duckdb_sha256=physical_sha256,
                            source_counts=source_counts,
                        )
                        loader.load_model_versions_and_runs()
                        loader_run_id = deterministic_uuid("pipeline_run", f"postgres-baseline:{PHASE2_VERSION}")
                        cursor.execute(
                            """
                            INSERT INTO pipeline_run(
                                run_id,pipeline_name,started_at,status,input_manifest,output_manifest,
                                row_counts,quality_metrics,model_version_id,data_version,external_run_key
                            ) VALUES (%s,%s,%s,'running',%s,%s,%s,%s,%s,%s,%s)
                            """,
                            [
                                loader_run_id,
                                "postgres_baseline_backfill",
                                generated_at,
                                Jsonb(
                                    {
                                        "source_path": _display_path(duckdb_path),
                                        "source_physical_sha256": physical_sha256,
                                        "source_semantic_sha256": semantic_sha256,
                                        "source_counts": source_counts,
                                        "loader_version": LOADER_VERSION,
                                        "large_marts_policy": "remain_in_parquet",
                                    }
                                ),
                                Jsonb({}),
                                Jsonb({}),
                                Jsonb({}),
                                loader.model_id(PHASE2_VERSION),
                                PHASE2_VERSION,
                                f"postgres-baseline:{PHASE2_VERSION}",
                            ],
                        )
                        loader.load_sources()
                        loader.load_dimensions()
                        loader.load_evidence_and_cells()
                        loader.load_archetypes_and_estimates()
                        loader.load_phase2()
                        verification = _verify_loaded_baseline(cursor, duck)
                        target_sha256 = _target_fingerprint(cursor)
                        cursor.execute(
                            """
                            UPDATE pipeline_run SET finished_at=%s,status='success',output_manifest=%s,
                                row_counts=%s,quality_metrics=%s,updated_at=%s
                            WHERE run_id=%s
                            """,
                            [
                                datetime.now(timezone.utc),
                                Jsonb(
                                    {
                                        "target_semantic_sha256": target_sha256,
                                        "canonical_tables": list(TARGET_FINGERPRINT_TABLES),
                                        "manifest_json": _display_path(manifest_json),
                                        "manifest_markdown": _display_path(manifest_markdown),
                                    }
                                ),
                                Jsonb(verification["counts"]),
                                Jsonb(verification["reconciliation"]),
                                datetime.now(timezone.utc),
                                loader_run_id,
                            ],
                        )

    manifest = {
        "manifest_version": 1,
        "loader_version": LOADER_VERSION,
        "generated_at": generated_at.isoformat(),
        "status": "passed",
        "outcome": outcome,
        "loader_run_id": str(loader_run_id),
        "source": {
            "duckdb_path": _display_path(duckdb_path),
            "physical_sha256": physical_sha256,
            "semantic_sha256": semantic_sha256,
            "row_counts": source_counts,
            "model_versions": [PHASE1_VERSION, "kr-v0.2.0", PHASE2_VERSION],
        },
        "target": {
            **database,
            "semantic_sha256": target_sha256,
            "canonical_tables": list(TARGET_FINGERPRINT_TABLES),
        },
        "transaction": {
            "atomic": True,
            "advisory_lock": True,
            "idempotency_key": f"postgres-baseline:{PHASE2_VERSION}",
            "uuid_strategy": "UUIDv5 for fresh UUID-backed records; natural-key adoption preserves canonical IDs",
        },
        "verification": verification,
    }
    _write_manifest(manifest, manifest_json, manifest_markdown)
    return manifest
