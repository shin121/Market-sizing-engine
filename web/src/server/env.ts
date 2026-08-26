import "server-only";

import { z } from "zod";

import { DEFAULT_OPENAI_MODEL } from "@/lib/constants";

const optionalTrimmedString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const boundedInteger = (fallback: number, minimum: number, maximum: number) => z.preprocess(
  (value) => value === undefined || value === "" ? fallback : value,
  z.coerce.number().int().min(minimum).max(maximum),
);

export const researchEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENAI_RESEARCH_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_RESEARCH_MODEL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? DEFAULT_OPENAI_MODEL : value,
    z.string().trim().min(1).default(DEFAULT_OPENAI_MODEL),
  ),
  // Web-search Responses can legitimately exceed the SDK's generic 120 s
  // default. Keep this below the 300 s Vercel route budget and let the durable
  // queue, rather than hidden SDK retries, control retry semantics.
  OPENAI_RESEARCH_TIMEOUT_MS: boundedInteger(240_000, 30_000, 270_000),
  RESEARCH_POLL_INTERVAL_MS: boundedInteger(1_500, 250, 60_000),
  RESEARCH_RUNNING_LEASE_MS: boundedInteger(300_000, 60_000, 3_600_000),
  RESEARCH_CRON_MAX_JOBS: boundedInteger(1, 1, 5),
  RESEARCH_WORKER_SECRET: optionalTrimmedString,
  CRON_SECRET: optionalTrimmedString,
  RESEARCH_JOB_ID: optionalTrimmedString,
}).passthrough();

export type ResearchEnvironment = z.infer<typeof researchEnvironmentSchema>;

export function getResearchEnvironment(environment: NodeJS.ProcessEnv = process.env): ResearchEnvironment {
  const parsed = researchEnvironmentSchema.safeParse(environment);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`);
  throw new Error(`invalid_research_environment:${issues.join("; ")}`);
}
