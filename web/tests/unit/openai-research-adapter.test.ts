import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openAI: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({ default: mocks.openAI }));

import {
  assertResearchSourcesWereReturnedByWebSearch,
  extractWebSearchSourceUrls,
  isObviousSearchResultsPageUrl,
  ResearchSchemaError,
  runOpenAIResearch,
  serializeResearchJsonWithinLimit,
} from "@/server/ai/openai-research-adapter";

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  process.env.OPENAI_RESEARCH_ENABLED = "false";
  mocks.openAI.mockReset();
});

function sourceOnlyResult(url: string) {
  return {
    sources: [{
      institution: "공공기관",
      title: "공식 원자료",
      url,
      publicationDate: "2026-01-01",
      referenceYear: 2025,
      accessedAt: "2026-08-25T00:00:00.000Z",
      locator: "표 1",
      usedValue: 0.25,
      sourceTier: 1,
    }],
  };
}

describe("OpenAI research payload size guard", () => {
  it("rejects high-confidence personal data before constructing a provider client", async () => {
    process.env.OPENAI_RESEARCH_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-only-key";

    await expect(runOpenAIResearch({
      researchQuestion: "Estimate this person: person@example.com",
      targetSegment: "aggregate market",
      targetVariable: "prevalence",
      baseline: {},
    })).rejects.toThrow("personal_data_not_allowed:email_address");
    expect(mocks.openAI).not.toHaveBeenCalled();
  });

  it("returns bounded JSON and measures its UTF-8 bytes", () => {
    const value = { claim: "근거" };
    const serialized = JSON.stringify(value);

    expect(serializeResearchJsonWithinLimit(value, "fixture", Buffer.byteLength(serialized, "utf8")))
      .toBe(serialized);
    expect(() => serializeResearchJsonWithinLimit(
      value,
      "fixture",
      Buffer.byteLength(serialized, "utf8") - 1,
    )).toThrow(ResearchSchemaError);
  });

  it("rejects values that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => serializeResearchJsonWithinLimit(circular, "fixture", 1_024))
      .toThrow("fixture could not be serialized as JSON.");
  });
});

describe("OpenAI web-search source provenance guard", () => {
  it("extracts and de-duplicates URLs returned by search, open-page, and find actions", () => {
    const response = {
      output: [
        {
          id: "ws_search",
          type: "web_search_call" as const,
          status: "completed" as const,
          action: {
            type: "search" as const,
            queries: ["공식 통계"],
            sources: [
              { type: "url" as const, url: "https://example.go.kr/report" },
              { type: "url" as const, url: "https://example.go.kr/report" },
            ],
          },
        },
        {
          id: "ws_open",
          type: "web_search_call" as const,
          status: "completed" as const,
          action: { type: "open_page" as const, url: "https://unlisted.example/report" },
        },
        {
          id: "ws_find",
          type: "web_search_call" as const,
          status: "completed" as const,
          action: {
            type: "find_in_page" as const,
            pattern: "표 1",
            url: "https://example.go.kr/report",
          },
        },
      ],
    };

    expect(extractWebSearchSourceUrls(response)).toEqual([
      "https://example.go.kr/report",
      "https://unlisted.example/report",
    ]);
  });

  it("does not trust URLs from failed or incomplete web-search calls", () => {
    const response = {
      output: [
        {
          id: "ws_failed",
          type: "web_search_call" as const,
          status: "failed" as const,
          action: { type: "open_page" as const, url: "https://untrusted.example/report" },
        },
        {
          id: "ws_searching",
          type: "web_search_call" as const,
          status: "searching" as const,
          action: {
            type: "search" as const,
            queries: ["공식 통계"],
            sources: [{ type: "url" as const, url: "https://incomplete.example/report" }],
          },
        },
        {
          id: "ws_partial_completed",
          type: "web_search_call" as const,
          status: "completed" as const,
          action: {
            type: "search" as const,
            queries: ["부분 응답"],
            sources: [{ type: "url" as const }],
          },
        },
      ],
    };

    expect(extractWebSearchSourceUrls(response as never)).toEqual([]);
    expect(() => assertResearchSourcesWereReturnedByWebSearch(
      sourceOnlyResult("https://untrusted.example/report"),
      extractWebSearchSourceUrls(response as never),
    )).toThrow("Structured research source 0 was not returned by the web search tool.");
  });

  it("accepts structured source URLs only when the web search tool returned them", () => {
    const result = sourceOnlyResult("https://example.go.kr/report");

    expect(() => assertResearchSourcesWereReturnedByWebSearch(
      result,
      ["https://example.go.kr/report"],
    )).not.toThrow();
    expect(() => assertResearchSourcesWereReturnedByWebSearch(
      result,
      ["https://different.example/report"],
    )).toThrow("Structured research source 0 was not returned by the web search tool.");
    expect(() => assertResearchSourcesWereReturnedByWebSearch({ sources: [] }, []))
      .not.toThrow();
  });

  it("rejects obvious search-results pages even when a tool source includes the same URL", () => {
    const searchResultsUrl = "https://www.google.com/search?q=official+statistics";

    expect(isObviousSearchResultsPageUrl(searchResultsUrl)).toBe(true);
    expect(isObviousSearchResultsPageUrl("https://example.go.kr/search-results.do?query=official"))
      .toBe(true);
    expect(isObviousSearchResultsPageUrl("https://example.go.kr/reports/official-statistics"))
      .toBe(false);
    expect(() => assertResearchSourcesWereReturnedByWebSearch(
      sourceOnlyResult(searchResultsUrl),
      [searchResultsUrl],
    )).toThrow("Structured research source 0 is a search-results page and cannot be used as evidence.");
  });
});
