import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

import pg from "pg";

const { Client } = pg;
const ownerUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL_UNPOOLED;
const pooledUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!ownerUrl || !pooledUrl) {
  throw new Error("Neon owner URLs are required in the local environment");
}

const loginRole = "market_engine_app_login";
const inheritedRole = "market_engine_app";
const password = randomBytes(32).toString("base64url");
const quotedPassword = `'${password.replaceAll("'", "''")}'`;

function hardenedManagedUrl(value) {
  const parsed = new URL(value);
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (["prefer", "require", "verify-ca"].includes(sslMode ?? "")) {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}

const owner = new Client({
  connectionString: hardenedManagedUrl(ownerUrl),
  application_name: "market-engine-role-provisioner",
  connectionTimeoutMillis: 15_000,
});

await owner.connect();
try {
  const group = await owner.query(
    "SELECT rolcanlogin FROM pg_roles WHERE rolname = $1",
    [inheritedRole],
  );
  if (group.rowCount !== 1 || group.rows[0].rolcanlogin) {
    throw new Error("market_engine_app must exist as a NOLOGIN role");
  }

  const existing = await owner.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [loginRole],
  );
  if (existing.rowCount === 0) {
    await owner.query(
      `CREATE ROLE ${loginRole} WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quotedPassword}`,
    );
  } else {
    await owner.query(
      `ALTER ROLE ${loginRole} WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quotedPassword}`,
    );
  }
  await owner.query(
    `GRANT ${inheritedRole} TO ${loginRole} WITH INHERIT TRUE, SET FALSE`,
  );
} finally {
  await owner.end();
}

const runtimeUrl = new URL(hardenedManagedUrl(pooledUrl));
runtimeUrl.username = loginRole;
runtimeUrl.password = password;

const runtime = new Client({
  connectionString: runtimeUrl.toString(),
  application_name: "market-engine-role-verifier",
  connectionTimeoutMillis: 15_000,
});

await runtime.connect();
try {
  const verification = await runtime.query(`
    SELECT current_user,
           current_role,
           (SELECT count(*)::int FROM production.domain_market_summary) AS domains
  `);
  const row = verification.rows[0];
  if (row.current_user !== loginRole || row.current_role !== loginRole || row.domains !== 24) {
    throw new Error("Dedicated app login verification failed");
  }
  console.log(`Dedicated database login verified: role=${loginRole}, domains=${row.domains}`);
} finally {
  await runtime.end();
}

function setVercelEnvironment(name, target, value, sensitive) {
  const args = ["vercel", "env", "add", name, target, "--force", "--yes"];
  if (sensitive) args.push("--sensitive");
  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    input: `${value}\n`,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to configure ${name} for ${target} (exit ${result.status ?? "unknown"})`);
  }
  console.log(`Configured ${name} for ${target}`);
}

for (const target of ["production", "preview"]) {
  setVercelEnvironment("MARKET_ENGINE_DATABASE_URL", target, runtimeUrl.toString(), true);
  setVercelEnvironment("MARKET_ENGINE_DATABASE_ROLE", target, "inherited_market_engine_app", false);
}

console.log("Vercel runtime database configuration completed without exposing credentials.");
