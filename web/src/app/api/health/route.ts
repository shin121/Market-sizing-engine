import { queryRows } from "@/server/db";
import { diagnoseDatabaseNetwork } from "@/server/db/network-diagnostic";
import { boundedJsonResponse } from "@/server/http/bounded-json";
import { auditDeploymentEnvironment } from "@/domain/deployment-env";
import { describePostgresRuntime } from "@/domain/postgres-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [status] = await queryRows<{
      database_time: string;
      domain_count: number;
      subtype_count: number;
      archetype_count: number;
      axis_value_count: number;
      feature_count: number;
      behavior_count: number;
      gold_query_count: number;
      fixture_count: number;
      missing_display_name_count: number;
      primary_not_estimable_count: number;
    }>(
      `SELECT now() AS database_time,
              dod.domain_count::integer AS domain_count,
              dod.subtype_count::integer AS subtype_count,
              dod.archetype_count::integer AS archetype_count,
              dod.axis_value_count::integer AS axis_value_count,
              dod.feature_count::integer AS feature_count,
              dod.behavior_count::integer AS behavior_count,
              dod.gold_query_count::integer AS gold_query_count,
              dod.primary_not_estimable_count::integer AS primary_not_estimable_count,
              dod.fixture_count::integer AS fixture_count,
              dod.missing_display_name_count::integer AS missing_display_name_count
       FROM production.v_workbench_product_dod dod`,
    );
    const deploymentEnvironment = auditDeploymentEnvironment(process.env);
    return boundedJsonResponse({
      ok: true,
      database: status,
      deploymentEnvironment: {
        ok: deploymentEnvironment.ok,
        errors: deploymentEnvironment.errors,
        warnings: deploymentEnvironment.warnings,
        checks: deploymentEnvironment.checks,
      },
      databaseConfiguration: describePostgresRuntime(process.env),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "database_unavailable";
    const databaseConfiguration = describePostgresRuntime(process.env);
    const databaseNetwork = await diagnoseDatabaseNetwork(databaseConfiguration.hostname);
    return boundedJsonResponse(
      {
        ok: false,
        error: message,
        databaseConfiguration,
        databaseNetwork,
      },
      { status: 503 },
    );
  }
}
