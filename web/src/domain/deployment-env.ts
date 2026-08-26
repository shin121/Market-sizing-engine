export interface DeploymentEnvironmentAudit {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    productionMode: boolean;
    secretAuth: boolean;
    databaseConfigured: boolean;
    remoteDatabase: boolean;
    databaseTlsRequired: boolean;
    workspaceContext: boolean;
    leastPrivilegeDatabaseRole: boolean;
    schedulerSecretSeparated: boolean;
    researchProviderReady: boolean;
    publicSecretLeakAbsent: boolean;
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configured(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function auditDeploymentEnvironment(environment: NodeJS.ProcessEnv): DeploymentEnvironmentAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  const accessSecret = configured(environment.WORKBENCH_ACCESS_SECRET);
  const accessPassword = configured(environment.WORKBENCH_ACCESS_PASSWORD);
  const workerSecret = configured(environment.RESEARCH_WORKER_SECRET) || configured(environment.CRON_SECRET);
  const databaseUrl = configured(environment.MARKET_ENGINE_DATABASE_URL)
    || configured(environment.DATABASE_URL)
    || configured(environment.POSTGRES_URL);
  const workspaceId = configured(environment.WORKBENCH_DEFAULT_WORKSPACE_ID);
  const actorId = configured(environment.WORKBENCH_DEFAULT_ACTOR_ID);
  const researchEnabled = configured(environment.OPENAI_RESEARCH_ENABLED) === "true";
  const databaseRole = configured(environment.MARKET_ENGINE_DATABASE_ROLE);
  const openAiKey = configured(environment.OPENAI_API_KEY);
  const publicSecretKeys = [
    "NEXT_PUBLIC_OPENAI_API_KEY",
    "NEXT_PUBLIC_WORKBENCH_ACCESS_SECRET",
    "NEXT_PUBLIC_WORKBENCH_ACCESS_PASSWORD",
    "NEXT_PUBLIC_RESEARCH_WORKER_SECRET",
    "NEXT_PUBLIC_CRON_SECRET",
    "NEXT_PUBLIC_DATABASE_URL",
  ];

  const productionMode = environment.NODE_ENV === "production";
  if (!productionMode) errors.push("NODE_ENV_must_be_production");

  const secretAuth = environment.WORKBENCH_AUTH_MODE === "secret" && accessSecret.length >= 32;
  if (environment.WORKBENCH_AUTH_MODE !== "secret") errors.push("WORKBENCH_AUTH_MODE_must_be_secret");
  if (accessSecret.length < 32) errors.push("WORKBENCH_ACCESS_SECRET_must_be_at_least_32_characters");
  if (accessPassword && accessPassword.length < 4) {
    errors.push("WORKBENCH_ACCESS_PASSWORD_must_be_at_least_4_characters");
  } else if (accessPassword && accessPassword.length < 8) {
    warnings.push("WORKBENCH_ACCESS_PASSWORD_is_a_short_shared_password");
  }

  const workspaceContext = UUID_PATTERN.test(workspaceId) && UUID_PATTERN.test(actorId);
  if (!UUID_PATTERN.test(workspaceId)) errors.push("WORKBENCH_DEFAULT_WORKSPACE_ID_must_be_uuid");
  if (!UUID_PATTERN.test(actorId)) errors.push("WORKBENCH_DEFAULT_ACTOR_ID_must_be_uuid");

  let remoteDatabase = false;
  let databaseTlsRequired = false;
  let databaseUsername = "";
  if (!databaseUrl) {
    errors.push("managed_POSTGRES_connection_url_required");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
        errors.push("database_url_must_use_postgresql_protocol");
      }
      databaseUsername = decodeURIComponent(parsed.username);
      const host = parsed.hostname.toLowerCase();
      remoteDatabase = Boolean(host) && !["localhost", "127.0.0.1", "::1"].includes(host);
      if (!remoteDatabase) errors.push("database_url_must_target_remote_managed_postgres");
      const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
      const ssl = parsed.searchParams.get("ssl")?.toLowerCase();
      databaseTlsRequired = ["require", "verify-ca", "verify-full"].includes(sslMode ?? "") || ssl === "true";
      if (!databaseTlsRequired) errors.push("database_url_must_require_tls");
    } catch {
      errors.push("database_url_is_invalid");
    }
  }

  const leastPrivilegeDatabaseRole = databaseRole === "market_engine_app"
    || (databaseRole === "inherited_market_engine_app" && databaseUsername === "market_engine_app_login");
  if (!leastPrivilegeDatabaseRole) errors.push("MARKET_ENGINE_DATABASE_ROLE_must_be_market_engine_app_for_web_runtime");

  const schedulerSecretSeparated = workerSecret.length >= 32 && workerSecret !== accessSecret;
  if (workerSecret.length < 32) errors.push("RESEARCH_WORKER_SECRET_or_CRON_SECRET_must_be_at_least_32_characters");
  if (workerSecret && workerSecret === accessSecret) errors.push("scheduler_secret_must_differ_from_workbench_access_secret");

  const researchProviderReady = !researchEnabled || openAiKey.length >= 20;
  if (!researchProviderReady) errors.push("OPENAI_API_KEY_required_when_research_is_enabled");

  const publicSecretLeakAbsent = publicSecretKeys.every((key) => !configured(environment[key]));
  if (!publicSecretLeakAbsent) errors.push("server_secret_present_in_NEXT_PUBLIC_environment");

  const poolMax = Number(environment.DATABASE_POOL_MAX ?? "5");
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) {
    errors.push("DATABASE_POOL_MAX_must_be_between_1_and_20");
  } else if (poolMax > 5) {
    warnings.push("DATABASE_POOL_MAX_above_5_may_exhaust_serverless_connections");
  }

  const cronMaxJobs = Number(environment.RESEARCH_CRON_MAX_JOBS ?? "1");
  if (!Number.isInteger(cronMaxJobs) || cronMaxJobs < 1 || cronMaxJobs > 5) {
    errors.push("RESEARCH_CRON_MAX_JOBS_must_be_between_1_and_5");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks: {
      productionMode,
      secretAuth,
      databaseConfigured: Boolean(databaseUrl),
      remoteDatabase,
      databaseTlsRequired,
      workspaceContext,
      leastPrivilegeDatabaseRole,
      schedulerSecretSeparated,
      researchProviderReady,
      publicSecretLeakAbsent,
    },
  };
}
