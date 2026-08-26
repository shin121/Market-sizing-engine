export const RESEARCH_WORKER_PATH = "/api/internal/research/run-once";

interface ResearchWorkerSecretEnvironment {
  RESEARCH_WORKER_SECRET?: string;
  CRON_SECRET?: string;
}

export function configuredResearchWorkerSecret(
  environment: ResearchWorkerSecretEnvironment = {
    RESEARCH_WORKER_SECRET: process.env.RESEARCH_WORKER_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
): string | null {
  const configured = environment.RESEARCH_WORKER_SECRET?.trim()
    || environment.CRON_SECRET?.trim()
    || "";
  return configured.length >= 32 ? configured : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function bearerMatchesSecret(request: Request, secret: string): Promise<boolean> {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!bearer) return false;
  const [actual, expected] = await Promise.all([sha256(bearer), sha256(secret)]);
  return actual === expected;
}
