const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TLS_MODES_REQUIRING_HARDENING = new Set(["prefer", "require", "verify-ca"]);

/**
 * Keep managed PostgreSQL URLs on hostname-verifying TLS. node-postgres 8
 * currently treats several weaker libpq modes as verify-full but warns that
 * this compatibility behavior will change in v9. Normalizing explicitly keeps
 * the security contract stable across that upgrade while preserving every
 * provider-specific query parameter.
 */
export function hardenManagedPostgresTls(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return connectionString;
    if (!url.hostname || LOCAL_DATABASE_HOSTS.has(url.hostname.toLowerCase())) return connectionString;

    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode && TLS_MODES_REQUIRING_HARDENING.has(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    // Preserve the original value so node-postgres reports its canonical
    // configuration error rather than hiding it behind URL normalization.
    return connectionString;
  }
}

/**
 * Neon exposes an HTTPS/WebSocket-native driver specifically for serverless
 * runtimes. Selecting it only for Neon hosts keeps local PostgreSQL and other
 * providers on node-postgres while avoiding raw PostgreSQL TLS negotiation in
 * Vercel Functions.
 */
export function shouldUseNeonServerlessDriver(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return hostname === "neon.tech" || hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export interface SafePostgresRuntimeMetadata {
  source: "MARKET_ENGINE_DATABASE_URL" | "DATABASE_URL" | "POSTGRES_URL" | "structured" | "missing";
  hostname: string | null;
  pooledEndpoint: boolean;
  sslMode: string | null;
  role: string | null;
  poolMax: number;
  connectTimeoutMs: number;
  transport: "neon_websocket" | "postgres_tcp";
}

export function describePostgresRuntime(environment: NodeJS.ProcessEnv): SafePostgresRuntimeMetadata {
  const source = environment.MARKET_ENGINE_DATABASE_URL
    ? "MARKET_ENGINE_DATABASE_URL"
    : environment.DATABASE_URL
      ? "DATABASE_URL"
      : environment.POSTGRES_URL
        ? "POSTGRES_URL"
        : environment.PGHOST || environment.PGDATABASE
          ? "structured"
          : "missing";
  const connectionString = source === "MARKET_ENGINE_DATABASE_URL"
    ? environment.MARKET_ENGINE_DATABASE_URL
    : source === "DATABASE_URL"
      ? environment.DATABASE_URL
      : source === "POSTGRES_URL"
        ? environment.POSTGRES_URL
        : undefined;

  let hostname = environment.PGHOST?.trim() || null;
  let sslMode: string | null = null;
  if (connectionString) {
    try {
      const url = new URL(connectionString);
      hostname = url.hostname || null;
      sslMode = url.searchParams.get("sslmode");
    } catch {
      hostname = null;
    }
  }

  return {
    source,
    hostname,
    pooledEndpoint: Boolean(hostname?.includes("-pooler")),
    sslMode,
    role: environment.MARKET_ENGINE_DATABASE_ROLE?.trim() || null,
    poolMax: Number(environment.DATABASE_POOL_MAX ?? "5"),
    connectTimeoutMs: Number(environment.DATABASE_CONNECT_TIMEOUT_MS ?? "5000"),
    transport: shouldUseNeonServerlessDriver(connectionString) ? "neon_websocket" : "postgres_tcp",
  };
}
