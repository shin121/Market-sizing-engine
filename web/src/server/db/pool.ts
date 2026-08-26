import "server-only";

import path from "node:path";

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool, type PoolConfig } from "pg";
import ws from "ws";

import {
  hardenManagedPostgresTls,
  shouldUseNeonServerlessDriver,
} from "@/domain/postgres-connection";

const POOL_SYMBOL = Symbol.for("market-sizing-engine.postgres-pool");

type GlobalWithPool = typeof globalThis & {
  [POOL_SYMBOL]?: Pool;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("DATABASE_POOL_MAX_must_be_a_positive_integer");
  return parsed;
}

function databaseRole(value: string | undefined): "market_engine_app" | "market_engine_worker" | null {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  // Managed poolers can reject PostgreSQL startup `options`. In that case the
  // login role inherits the application grants directly and no SET ROLE
  // startup option is required.
  if (normalized === "inherited_market_engine_app") return null;
  if (normalized !== "market_engine_app" && normalized !== "market_engine_worker") {
    throw new Error(
      "MARKET_ENGINE_DATABASE_ROLE_must_be_market_engine_app_or_market_engine_worker_or_inherited_market_engine_app",
    );
  }
  return normalized;
}

function poolConfig(): PoolConfig {
  let connectionString =
    process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  const hasStructuredPgConfig = Boolean(process.env.PGHOST || process.env.PGDATABASE);
  const runtimeRole = databaseRole(process.env.MARKET_ENGINE_DATABASE_ROLE);
  if (!connectionString && !hasStructuredPgConfig) {
    if (process.env.NODE_ENV === "production") throw new Error("postgres_connection_configuration_required");
    const projectRoot = path.basename(process.cwd()) === "web" ? path.resolve(process.cwd(), "..") : process.cwd();
    const socketPath = path.join(projectRoot, "data", "local", "socket");
    connectionString = `postgresql://localhost:55432/market_engine_phase2r_a?host=${encodeURIComponent(socketPath)}`;
  }

  if (connectionString) connectionString = hardenManagedPostgresTls(connectionString);

  return {
    ...(connectionString ? { connectionString } : {}),
    ...(runtimeRole ? { options: `-c role=${runtimeRole}` } : {}),
    application_name: "market-intelligence-workbench",
    // Keep the runtime default aligned with the deployment audit. Serverless
    // instances multiply this value, so a conservative default protects the
    // managed Postgres connection budget when several functions scale out.
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 5),
    connectionTimeoutMillis: positiveInteger(process.env.DATABASE_CONNECT_TIMEOUT_MS, 5_000),
    idleTimeoutMillis: positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
    statement_timeout: positiveInteger(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 15_000),
  };
}

function createPool(): Pool {
  const config = poolConfig();
  const connectionString = typeof config.connectionString === "string"
    ? config.connectionString
    : undefined;
  if (shouldUseNeonServerlessDriver(connectionString)) {
    neonConfig.webSocketConstructor = ws;
    // Plain pool.query calls are one-shot operations and can avoid a session.
    // pool.connect remains WebSocket-backed for the existing ACID workflows.
    neonConfig.poolQueryViaFetch = true;
    return new NeonPool(config) as unknown as Pool;
  }
  return new Pool(config);
}

export function getDatabasePool(): Pool {
  const shared = globalThis as GlobalWithPool;
  if (!shared[POOL_SYMBOL]) {
    shared[POOL_SYMBOL] = createPool();
  }
  return shared[POOL_SYMBOL];
}

export async function closeDatabasePool(): Promise<void> {
  const shared = globalThis as GlobalWithPool;
  const pool = shared[POOL_SYMBOL];
  if (!pool) return;
  delete shared[POOL_SYMBOL];
  await pool.end();
}
