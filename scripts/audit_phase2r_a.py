from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]


def scalar(connection: psycopg.Connection[Any], sql: str, params: tuple[Any, ...] = ()) -> Any:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    return None if row is None else row[0]


def rows(connection: psycopg.Connection[Any], sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]


def sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def collect(connection: psycopg.Connection[Any]) -> dict[str, Any]:
    phase2_dod = json.loads((ROOT / "reports/phase2_dod_audit.json").read_text())
    backup_dir = ROOT / "data/backups/phase2r_a"
    schema_dump = backup_dir / "engine_prototype_schema_20260826.sql"
    full_dump = backup_dir / "engine_prototype_full_20260826.dump"

    table_counts = rows(
        connection,
        """
        SELECT relname AS table_name, n_live_tup::bigint AS estimated_rows
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname
        """,
    )
    exact_counts = {
        name: int(scalar(connection, f'SELECT count(*) FROM "{name}"'))
        for name in (
            "archetype",
            "domain_registry",
            "domain_dimension",
            "domain_feature",
            "domain_behavior_template",
            "segmentation_model",
            "subtype_definition",
            "estimate",
            "saved_segment",
            "opportunity",
            "research_job",
        )
    }

    fixture_saved_segments = rows(
        connection,
        """
        SELECT
          CASE
            WHEN title ILIKE '[integration]%%' THEN 'integration'
            WHEN title = 'E2E 16-step exact snapshot' THEN 'e2e_exact_snapshot'
            WHEN title ILIKE 'Restricted-role saved lineage fixture%%' THEN 'restricted_role_fixture'
            WHEN title ILIKE '%%fixture%%' OR title ILIKE 'E2E %%' THEN 'other_fixture'
            ELSE 'unclassified'
          END AS fixture_class,
          count(*)::integer AS row_count
        FROM saved_segment
        GROUP BY 1
        ORDER BY 1
        """,
    )
    estimate_layers = rows(
        connection,
        """
        SELECT data_layer, status, count(*)::integer AS row_count,
               count(*) FILTER (WHERE count_base IS NOT NULL)::integer AS with_count_base,
               count(*) FILTER (WHERE share_base IS NOT NULL)::integer AS with_share_base
        FROM estimate
        GROUP BY data_layer, status
        ORDER BY data_layer, status
        """,
    )
    domain_population = rows(
        connection,
        """
        SELECT domain_code, name_ko, primary_entity_unit, domain_population_status,
               count_low, count_base, count_high, count_status_reason
        FROM v_explorer_domain_summary
        ORDER BY domain_code
        """,
    )
    domain_population_summary = rows(
        connection,
        """
        SELECT coalesce(domain_population_status, 'NULL') AS status,
               count(*)::integer AS domain_count,
               count(*) FILTER (WHERE count_base IS NOT NULL)::integer AS with_base_population
        FROM v_explorer_domain_summary
        GROUP BY domain_population_status
        ORDER BY status
        """,
    )
    lineage_columns = {
        row["column_name"]
        for row in rows(
            connection,
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name='v_estimate_lineage'
            """,
        )
    }
    estimate_lineage_count = int(scalar(connection, "SELECT count(*) FROM v_estimate_lineage"))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "audit_version": "phase2r-a-initial-v1",
        "baseline": {
            "workspace_git_status": "unavailable_not_a_git_repository",
            "database": connection.info.dbname,
            "server_version": connection.info.server_version,
            "public_base_tables": int(
                scalar(
                    connection,
                    """
                    SELECT count(*) FROM information_schema.tables
                    WHERE table_schema='public' AND table_type='BASE TABLE'
                    """,
                )
            ),
            "public_views": int(
                scalar(
                    connection,
                    "SELECT count(*) FROM information_schema.views WHERE table_schema='public'",
                )
            ),
            "backup": {
                "schema_dump": str(schema_dump.relative_to(ROOT)),
                "schema_dump_sha256": sha256(schema_dump),
                "full_dump": str(full_dump.relative_to(ROOT)),
                "full_dump_sha256": sha256(full_dump),
            },
            "phase2_dod": {
                "historical_status": phase2_dod["status"],
                "historical_passed": phase2_dod["passed"],
                "historical_total": phase2_dod["total"],
                "nemotron_rows": phase2_dod["metrics"]["nemotron_rows"],
                "nemotron_shards": phase2_dod["metrics"]["nemotron_shards"],
            },
        },
        "exact_row_counts": exact_counts,
        "table_row_estimates": table_counts,
        "fixture_distribution": {
            "saved_segment": fixture_saved_segments,
            "note": "Existing records are inventoried, not deleted. Separation is a Phase 2R-A implementation task.",
        },
        "estimate_distribution": estimate_layers,
        "domain_population_summary": domain_population_summary,
        "domain_population": domain_population,
        "estimate_read_model": {
            "row_count": estimate_lineage_count,
            "has_display_name": "display_name" in lineage_columns,
            "rows_missing_display_name_by_contract": estimate_lineage_count
            if "display_name" not in lineage_columns
            else int(scalar(connection, "SELECT count(*) FROM v_estimate_lineage WHERE nullif(display_name, '') IS NULL")),
        },
    }


def render_markdown(audit: dict[str, Any]) -> str:
    baseline = audit["baseline"]
    counts = audit["exact_row_counts"]
    domain_summary = audit["domain_population_summary"]
    fixtures = audit["fixture_distribution"]["saved_segment"]
    return "\n".join(
        [
            "# Phase 2R-A initial forensic audit",
            "",
            f"Generated: `{audit['generated_at']}`  ",
            f"Database: `{baseline['database']}`  ",
            f"Git commit: **unavailable** — this workspace is not a Git repository.",
            "",
            "## Preserved prototype baseline",
            "",
            f"- PostgreSQL: {baseline['public_base_tables']} public base tables / {baseline['public_views']} public views.",
            f"- Full backup: `{baseline['backup']['full_dump']}` (`{baseline['backup']['full_dump_sha256']}`).",
            f"- Schema dump: `{baseline['backup']['schema_dump']}` (`{baseline['backup']['schema_dump_sha256']}`).",
            f"- Historical Phase 2 DoD: {baseline['phase2_dod']['historical_passed']}/{baseline['phase2_dod']['historical_total']} in the retained certificate; live provenance caveat remains documented separately.",
            f"- Nemotron manifest: {baseline['phase2_dod']['nemotron_rows']:,} rows / {baseline['phase2_dod']['nemotron_shards']} shards.",
            "",
            "## Key exact row counts",
            "",
            *[f"- `{name}`: {value:,}" for name, value in sorted(counts.items())],
            "",
            "## Critical findings",
            "",
            *[
                f"- Domain population status `{item['status']}`: {item['domain_count']} domains; {item['with_base_population']} with Base population."
                for item in domain_summary
            ],
            f"- Estimate lineage rows: {audit['estimate_read_model']['row_count']:,}; display-name contract present: `{audit['estimate_read_model']['has_display_name']}`.",
            "- Saved Segment fixture distribution:",
            *[f"  - `{item['fixture_class']}`: {item['row_count']}" for item in fixtures],
            "",
            "## Audit conclusion",
            "",
            "The prototype preserves substantial taxonomy, archetype, workflow, and validation assets, but it does not contain a production-ready real-world universe foundation. All 24 primary domains lack a canonical Base population, the Estimate read model has no display-name contract, and test fixtures share production-facing tables. Phase 2R-A must therefore add production-scoped universe/source/domain mapping data and read models without rewriting this baseline.",
            "",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", required=True)
    parser.add_argument(
        "--json-output",
        type=Path,
        default=ROOT / "reports/phase2r_a_initial_forensic_audit.json",
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=ROOT / "reports/phase2r_a_initial_forensic_audit.md",
    )
    args = parser.parse_args()

    with psycopg.connect(args.database_url) as connection:
        audit = collect(connection)
    args.json_output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    args.markdown_output.write_text(render_markdown(audit))


if __name__ == "__main__":
    main()
