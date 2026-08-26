import { describe, expect, it } from "vitest";

import { auditDeploymentEnvironment } from "@/domain/deployment-env";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    WORKBENCH_AUTH_MODE: "secret",
    WORKBENCH_ACCESS_SECRET: "workbench-secret-that-is-long-enough-2026",
    WORKBENCH_DEFAULT_WORKSPACE_ID: "9f693300-49ad-5bd5-ad98-af4e225661ea",
    WORKBENCH_DEFAULT_ACTOR_ID: "314126eb-26a2-55fa-a613-28180096cbac",
    DATABASE_URL: "postgresql://app:secret@managed.example/db?sslmode=require",
    MARKET_ENGINE_DATABASE_ROLE: "market_engine_app",
    RESEARCH_WORKER_SECRET: "scheduler-secret-that-is-separate-and-long",
    OPENAI_RESEARCH_ENABLED: "false",
    DATABASE_POOL_MAX: "5",
    RESEARCH_CRON_MAX_JOBS: "1",
  };
}

describe("cloud deployment environment audit", () => {
  it("accepts a TLS managed database with separated server-only secrets", () => {
    const audit = auditDeploymentEnvironment(validEnvironment());
    expect(audit.ok).toBe(true);
    expect(audit.errors).toEqual([]);
    expect(audit.checks).toMatchObject({
      remoteDatabase: true,
      databaseTlsRequired: true,
      schedulerSecretSeparated: true,
      leastPrivilegeDatabaseRole: true,
      publicSecretLeakAbsent: true,
    });
  });

  it("accepts the dedicated inherited app login required by managed poolers", () => {
    const environment = validEnvironment();
    environment.DATABASE_URL =
      "postgresql://market_engine_app_login:secret@managed.example/db?sslmode=require";
    environment.MARKET_ENGINE_DATABASE_ROLE = "inherited_market_engine_app";
    const audit = auditDeploymentEnvironment(environment);
    expect(audit.ok).toBe(true);
    expect(audit.checks.leastPrivilegeDatabaseRole).toBe(true);
  });

  it("rejects inherited app mode when the dedicated login identity does not match", () => {
    const environment = validEnvironment();
    environment.MARKET_ENGINE_DATABASE_ROLE = "inherited_market_engine_app";
    const audit = auditDeploymentEnvironment(environment);
    expect(audit.ok).toBe(false);
    expect(audit.errors).toContain(
      "MARKET_ENGINE_DATABASE_ROLE_must_be_market_engine_app_for_web_runtime",
    );
  });

  it("rejects a local database, reused secret, and missing TLS", () => {
    const environment = validEnvironment();
    environment.DATABASE_URL = "postgresql://localhost:55432/local";
    environment.RESEARCH_WORKER_SECRET = environment.WORKBENCH_ACCESS_SECRET;
    const audit = auditDeploymentEnvironment(environment);
    expect(audit.ok).toBe(false);
    expect(audit.errors).toEqual(expect.arrayContaining([
      "database_url_must_target_remote_managed_postgres",
      "database_url_must_require_tls",
      "scheduler_secret_must_differ_from_workbench_access_secret",
    ]));
  });

  it("rejects client-exposed secrets and enabled Research without a key", () => {
    const environment = validEnvironment();
    environment.OPENAI_RESEARCH_ENABLED = "true";
    environment.NEXT_PUBLIC_OPENAI_API_KEY = "leaked";
    const audit = auditDeploymentEnvironment(environment);
    expect(audit.errors).toEqual(expect.arrayContaining([
      "OPENAI_API_KEY_required_when_research_is_enabled",
      "server_secret_present_in_NEXT_PUBLIC_environment",
    ]));
  });
});
