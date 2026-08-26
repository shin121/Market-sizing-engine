import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import {
  deterministicLocalRuntimeContext,
  getRuntimeContext,
  normalizeRuntimeContext,
  runWithRuntimeContext,
  type RuntimeContext,
} from "@/server/db/context";
import { closeDatabasePool, getDatabasePool } from "@/server/db/pool";

export type DatabaseClient = PoolClient;
export type SqlParameter = null | boolean | number | string | Date | Buffer | readonly SqlParameter[];

export async function queryRows<T extends QueryResultRow>(
  sql: string,
  params: readonly SqlParameter[] = [],
): Promise<T[]> {
  const result = await getDatabasePool().query<T>(sql, [...params]);
  return result.rows;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly SqlParameter[] = [],
) {
  return getDatabasePool().query<T>(sql, [...params]);
}

export async function withWorkspaceTransaction<T>(
  work: (client: DatabaseClient) => Promise<T>,
  context?: RuntimeContext,
): Promise<T> {
  const activeContext = context ? normalizeRuntimeContext(context) : getRuntimeContext();
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    // set_config(..., true) has SET LOCAL semantics and permits parameterized
    // UUID values. Both settings disappear automatically at transaction end.
    await client.query(
      `SELECT
         set_config('market_engine.workspace_id', $1, true),
         set_config('market_engine.actor_id', $2, true)`,
      [activeContext.workspaceId, activeContext.actorId],
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export {
  closeDatabasePool,
  deterministicLocalRuntimeContext,
  getDatabasePool,
  getRuntimeContext,
  runWithRuntimeContext,
  type RuntimeContext,
};
