import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Response } from "openai/resources/responses/responses";

import { researchResultSchema, type ResearchResult } from "@/contracts/research";
import { assertNoHighConfidencePersonalData } from "@/domain/privacy";
import { RESEARCH_SCHEMA_VERSION } from "@/lib/constants";
import { getResearchEnvironment } from "@/server/env";

export const RESEARCH_MAX_OUTPUT_TOKENS = 12_000;
export const RESEARCH_MAX_SERIALIZED_INPUT_BYTES = 128 * 1_024;
export const RESEARCH_MAX_SERIALIZED_OUTPUT_BYTES = 256 * 1_024;

export class ResearchConfigurationError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured") {
    super(message);
    this.name = "ResearchConfigurationError";
  }
}

export class ResearchSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchSchemaError";
  }
}

export function serializeResearchJsonWithinLimit(value: unknown, label: string, maxBytes: number): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ResearchSchemaError(`${label} could not be serialized as JSON.`);
  }
  if (serialized === undefined) {
    throw new ResearchSchemaError(`${label} could not be serialized as JSON.`);
  }
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > maxBytes) {
    throw new ResearchSchemaError(`${label} exceeds the ${maxBytes}-byte safety limit.`);
  }
  return serialized;
}

export interface ResearchAdapterInput {
  researchQuestion: string;
  targetSegment: string;
  targetVariable: string;
  baseline: Record<string, unknown>;
  snapshotProvenance?: Record<string, unknown> | null;
  constraints?: string[];
}

export interface ResearchAdapterOutput {
  result: ResearchResult;
  provider: "openai";
  model: string;
  responseId: string;
  usage: Record<string, unknown> | null;
  webSearchSourceUrls: string[];
}

function normalizedUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function hasSearchQuery(parsed: URL): boolean {
  const searchKeys = new Set([
    "q", "query", "search_query", "searchterm", "search_term", "keyword", "keywords", "p", "text", "wd",
  ]);
  return [...parsed.searchParams.keys()].some((key) => searchKeys.has(key.toLowerCase()));
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isObviousSearchResultsPageUrl(value: string): boolean {
  const normalized = normalizedUrl(value);
  if (!normalized) return false;

  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const searchQuery = hasSearchQuery(parsed);
  const googleHost = /(^|\.)google\.[a-z.]+$/.test(hostname);

  if (googleHost && (pathname === "/search" || pathname === "/url" || pathname === "/webhp")) return true;
  if (isDomainOrSubdomain(hostname, "bing.com") && pathname === "/search") return true;
  if (hostname.startsWith("search.yahoo.") && pathname === "/search") return true;
  if (isDomainOrSubdomain(hostname, "duckduckgo.com")
    && (pathname === "/" || pathname === "/html" || pathname === "/lite")
    && searchQuery) return true;
  if (hostname === "search.naver.com" && pathname === "/search.naver") return true;
  if (hostname === "search.daum.net" && pathname === "/search") return true;
  if (isDomainOrSubdomain(hostname, "baidu.com") && pathname === "/s") return true;
  if (hostname === "search.brave.com" && pathname === "/search") return true;
  if (hostname.startsWith("search.yandex.") && pathname === "/search") return true;
  if (isDomainOrSubdomain(hostname, "ecosia.org") && pathname === "/search") return true;
  if (hostname.startsWith("search.") && searchQuery) return true;

  return searchQuery
    && /(^|\/)search(?:[-_.]?results?)?(?:\.(?:html?|aspx?|php|do))?(\/|$)/.test(pathname);
}

export function extractWebSearchSourceUrls(response: Pick<Response, "output">): string[] {
  const sourceUrls = new Set<string>();
  for (const item of response.output) {
    if (item.type !== "web_search_call") continue;
    if (item.status !== "completed") continue;
    if (item.action.type === "search") {
      for (const source of item.action.sources ?? []) {
        // Provider responses can contain a partially populated source entry
        // even though the SDK type marks url as required. Ignore that entry;
        // the later provenance guard still requires every persisted source URL
        // to match a complete URL returned by the tool.
        const url = typeof source.url === "string" ? source.url.trim() : "";
        if (url) sourceUrls.add(url);
      }
      continue;
    }
    const visitedUrl = typeof item.action.url === "string" ? item.action.url.trim() : "";
    if (visitedUrl) sourceUrls.add(visitedUrl);
  }
  return [...sourceUrls];
}

export function assertResearchSourcesWereReturnedByWebSearch(
  result: Pick<ResearchResult, "sources">,
  webSearchSourceUrls: readonly string[],
): void {
  const returnedUrls = new Set(
    webSearchSourceUrls
      .map(normalizedUrl)
      .filter((url): url is string => url !== null),
  );

  for (const [sourceIndex, source] of result.sources.entries()) {
    if (isObviousSearchResultsPageUrl(source.url)) {
      throw new ResearchSchemaError(
        `Structured research source ${sourceIndex} is a search-results page and cannot be used as evidence.`,
      );
    }
    const sourceUrl = normalizedUrl(source.url);
    if (!sourceUrl || !returnedUrls.has(sourceUrl)) {
      throw new ResearchSchemaError(
        `Structured research source ${sourceIndex} was not returned by the web search tool.`,
      );
    }
  }
}

export function isResearchProviderConfigured(): boolean {
  const environment = getResearchEnvironment();
  return environment.OPENAI_RESEARCH_ENABLED && Boolean(environment.OPENAI_API_KEY);
}

export async function runOpenAIResearch(input: ResearchAdapterInput): Promise<ResearchAdapterOutput> {
  const environment = getResearchEnvironment();
  if (!environment.OPENAI_RESEARCH_ENABLED) {
    throw new ResearchConfigurationError("OPENAI_RESEARCH_ENABLED=true is required before external research calls are allowed");
  }
  const apiKey = environment.OPENAI_API_KEY;
  if (!apiKey) throw new ResearchConfigurationError();

  const model = environment.OPENAI_RESEARCH_MODEL;
  const opportunityIdeaRequested = input.targetVariable.startsWith("opportunity_idea_brief:");
  assertNoHighConfidencePersonalData(input);
  const client = new OpenAI({
    apiKey,
    timeout: environment.OPENAI_RESEARCH_TIMEOUT_MS,
    maxRetries: 0,
  });
  const serializedInput = serializeResearchJsonWithinLimit({
    task: input,
    accessedAt: new Date().toISOString(),
    sourcePriority: [
      "national_or_public_primary",
      "local_or_public_agency",
      "industry_association",
      "official_company_disclosure",
      "academic",
      "reputable_research",
      "secondary_media",
      "ai_inference",
    ],
  }, "Research provider input", RESEARCH_MAX_SERIALIZED_INPUT_BYTES);
  const response = await client.responses.parse({
    model,
    store: false,
    max_output_tokens: RESEARCH_MAX_OUTPUT_TOKENS,
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
    text: { format: zodTextFormat(researchResultSchema, RESEARCH_SCHEMA_VERSION.replaceAll("-", "_")) },
    instructions: [
      "You are an evidence researcher for a Korean market-sizing workbench.",
      "Use web search and prioritize original national/public sources, then official industry and company reports, academic sources, reputable research, and only then secondary reporting.",
      "Never treat a search-results page as evidence. Record the final original URL, institution, title, locator, used value, reference year, publication date, and access timestamp.",
      "Do not replace or silently modify the supplied baseline. Return a reviewable proposed factor or null Low/Base/High when evidence is insufficient.",
      "Do not search for, infer, return, or retain an identifiable person's name, contact details, address, account identifier, behavior history, or any minor's identity or sensitive information. Use aggregate market evidence only.",
      "Normalize the supplied baseline into every existingBaseline field. If it is empty, use status unavailable, null values, and an explicit definition explaining that no baseline was attached.",
      "Keep entity units and denominators explicit. Do not convert person, household, establishment, or enterprise without an evidenced bridge.",
      "Low must be <= Base and Base <= High. Clearly label direct observations, proxies, and inference. Cite every material numeric claim by source index.",
      "Return a provider assessment for every required confidence component from 0 to 100; do not omit components. These provider values are advisory and the server calculates the authoritative score and grade from structured evidence.",
      opportunityIdeaRequested
        ? "This is opportunity idea research. Populate opportunityIdeaBrief as an explicitly nullable AI hypothesis draft; cite its evidenceSourceIndexes and leave unsupported fields null. Copy only exact effectively-enabled normalizedConditionClasses feature sourceCode values into sourceFeatureIds and behavior or tag sourceCode values into sourceBehaviorIds; use empty arrays when none apply and never invent an ID."
        : "This is ordinary factor research. Return opportunityIdeaBrief as null.",
      "Return Korean explanatory text where useful, but keep URLs and official titles exact.",
    ].join("\n"),
    input: serializedInput,
  });

  if (!response.output_parsed) {
    throw new ResearchSchemaError("The provider returned no parseable structured result.");
  }
  serializeResearchJsonWithinLimit(
    response.output_parsed,
    "Research provider structured result",
    RESEARCH_MAX_SERIALIZED_OUTPUT_BYTES,
  );
  const parsed = researchResultSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new ResearchSchemaError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  assertNoHighConfidencePersonalData(parsed.data);
  const webSearchSourceUrls = extractWebSearchSourceUrls(response);
  assertResearchSourcesWereReturnedByWebSearch(parsed.data, webSearchSourceUrls);
  return {
    result: parsed.data,
    provider: "openai",
    model,
    responseId: response.id,
    usage: response.usage ? { ...response.usage } : null,
    webSearchSourceUrls,
  };
}
