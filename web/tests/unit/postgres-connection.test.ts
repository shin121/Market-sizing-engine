import { describe, expect, it } from "vitest";

import {
  describePostgresRuntime,
  hardenManagedPostgresTls,
  shouldUseNeonServerlessDriver,
} from "@/domain/postgres-connection";

describe("managed PostgreSQL TLS normalization", () => {
  it("upgrades remote provider URLs to hostname-verifying TLS", () => {
    const result = new URL(
      hardenManagedPostgresTls(
        "postgresql://app:secret@managed.example/db?sslmode=require&channel_binding=require",
      ),
    );

    expect(result.searchParams.get("sslmode")).toBe("verify-full");
    expect(result.searchParams.get("channel_binding")).toBe("require");
  });

  it("does not rewrite local socket or localhost development URLs", () => {
    const local = "postgresql://localhost:55432/db?host=%2Ftmp%2Fpostgres";
    expect(hardenManagedPostgresTls(local)).toBe(local);
  });

  it("leaves malformed values for node-postgres to reject", () => {
    expect(hardenManagedPostgresTls("not-a-postgres-url")).toBe("not-a-postgres-url");
  });

  it("selects the serverless transport only for Neon database hosts", () => {
    expect(shouldUseNeonServerlessDriver(
      "postgresql://app:secret@ep-example-pooler.c-2.ap-southeast-1.aws.neon.tech/db",
    )).toBe(true);
    expect(shouldUseNeonServerlessDriver("postgresql://app:secret@managed.example/db")).toBe(false);
    expect(shouldUseNeonServerlessDriver("postgresql://localhost:55432/db")).toBe(false);
  });

  it("reports only safe runtime connection metadata", () => {
    expect(describePostgresRuntime({
      NODE_ENV: "production",
      MARKET_ENGINE_DATABASE_URL:
        "postgresql://owner:secret@direct.managed.example/db?sslmode=require",
      MARKET_ENGINE_DATABASE_ROLE: "market_engine_app",
      DATABASE_POOL_MAX: "5",
      DATABASE_CONNECT_TIMEOUT_MS: "15000",
    })).toEqual({
      source: "MARKET_ENGINE_DATABASE_URL",
      hostname: "direct.managed.example",
      pooledEndpoint: false,
      sslMode: "require",
      role: "market_engine_app",
      poolMax: 5,
      connectTimeoutMs: 15000,
      transport: "postgres_tcp",
    });
  });
});
