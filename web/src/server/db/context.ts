import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { DEFAULT_WORKSPACE_ID, TRUSTED_LOCAL_ACTOR_ID } from "@/lib/constants";

export interface RuntimeContext {
  workspaceId: string;
  actorId: string;
}

const LOCAL_WORKSPACE_ID = DEFAULT_WORKSPACE_ID;
const LOCAL_ACTOR_ID = TRUSTED_LOCAL_ACTOR_ID;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const runtimeContextStorage = new AsyncLocalStorage<RuntimeContext>();

function requireUuid(value: string | undefined, name: string): string {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error(`${name}_must_be_a_uuid`);
  }
  return value.toLowerCase();
}

function localRuntimeContext(): RuntimeContext {
  const workspaceId =
    process.env.WORKBENCH_DEFAULT_WORKSPACE_ID ??
    process.env.MARKET_ENGINE_DEFAULT_WORKSPACE_ID ??
    process.env.DEFAULT_WORKSPACE_ID ??
    LOCAL_WORKSPACE_ID;
  const actorId =
    process.env.WORKBENCH_DEFAULT_ACTOR_ID ??
    process.env.MARKET_ENGINE_DEFAULT_ACTOR_ID ??
    process.env.DEFAULT_ACTOR_ID ??
    LOCAL_ACTOR_ID;

  return {
    workspaceId: requireUuid(workspaceId, "workspace_id"),
    actorId: requireUuid(actorId, "actor_id"),
  };
}

function productionSecretRuntimeContext(): RuntimeContext {
  if (process.env.WORKBENCH_AUTH_MODE !== "secret") {
    throw new Error("verified_runtime_context_required_in_production");
  }
  if (!process.env.WORKBENCH_ACCESS_SECRET || process.env.WORKBENCH_ACCESS_SECRET.length < 32) {
    throw new Error("WORKBENCH_ACCESS_SECRET_must_be_at_least_32_characters");
  }
  return {
    workspaceId: requireUuid(process.env.WORKBENCH_DEFAULT_WORKSPACE_ID, "workspace_id"),
    actorId: requireUuid(process.env.WORKBENCH_DEFAULT_ACTOR_ID, "actor_id"),
  };
}

export function normalizeRuntimeContext(context: RuntimeContext): RuntimeContext {
  return {
    workspaceId: requireUuid(context.workspaceId, "workspace_id"),
    actorId: requireUuid(context.actorId, "actor_id"),
  };
}

/**
 * Returns the request-scoped, authentication-verified database context.
 * Development and test processes may use deterministic local identities; a
 * production process never uses local constants or aliases. A production
 * fixed context is permitted only for the explicit secret-session mode whose
 * Next proxy verifies every application/action/API request.
 */
export function getRuntimeContext(): RuntimeContext {
  const requestContext = runtimeContextStorage.getStore();
  if (requestContext) return requestContext;

  if (process.env.NODE_ENV === "production") {
    return productionSecretRuntimeContext();
  }

  return localRuntimeContext();
}

/**
 * Installs a context that has already been verified by the server auth
 * boundary. Callers must never populate this from untrusted form or URL data.
 */
export function runWithRuntimeContext<T>(context: RuntimeContext, work: () => T): T {
  return runtimeContextStorage.run(normalizeRuntimeContext(context), work);
}

export const deterministicLocalRuntimeContext: Readonly<RuntimeContext> = Object.freeze({
  workspaceId: LOCAL_WORKSPACE_ID,
  actorId: LOCAL_ACTOR_ID,
});
