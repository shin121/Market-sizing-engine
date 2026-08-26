import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withWorkspaceTransaction: vi.fn(),
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  getRuntimeContext: () => ({ workspaceId: "workspace-1", actorId: "actor-1" }),
  withWorkspaceTransaction: mocks.withWorkspaceTransaction,
}));
vi.mock("@/server/ai/openai-research-adapter", () => ({
  isResearchProviderConfigured: () => false,
  ResearchConfigurationError: class ResearchConfigurationError extends Error {},
  ResearchSchemaError: class ResearchSchemaError extends Error {},
  runOpenAIResearch: vi.fn(),
}));
vi.mock("@/server/services/segment-workflow", () => ({
  contentHash: () => "test-hash",
}));

import { createResearchJob, reviewRevision } from "@/server/services/research-workflow";

beforeEach(() => {
  mocks.withWorkspaceTransaction.mockReset();
  mocks.query.mockReset();
});

describe("research input privacy boundary", () => {
  it("rejects an obvious identifier before opening a persistence transaction", async () => {
    await expect(createResearchJob({
      researchQuestion: "010-1234-5678 사용자의 구매행태를 조사해줘",
      targetSegment: "개인 사용자",
      targetVariable: "purchase_behavior",
      baseline: {},
    })).rejects.toThrow("personal_data_not_allowed:phone_number");
    expect(mocks.withWorkspaceTransaction).not.toHaveBeenCalled();
  });

  it("rechecks an attached segment in the final canonical payload before writing", async () => {
    mocks.withWorkspaceTransaction.mockImplementation(async (callback) => callback({ query: mocks.query }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM v_saved_segment_latest")) {
        return { rows: [{
          saved_segment_id: "segment-1",
          title: "person@example.com 고객군",
          resolved_version_no: 1,
          pinned_result_id: null,
          query_id: null,
          result_id: null,
          estimate_id: null,
          filter_json: {},
          result_summary: {},
          primary_entity_unit: "enterprise",
          estimate_status: "not_estimable",
          data_layer: null,
          approval_status: null,
          count_low: null,
          count_base: null,
          count_high: null,
          denominator_definition: null,
          data_version: "test-v1",
        }] };
      }
      return { rows: [] };
    });

    await expect(createResearchJob({
      segmentId: "segment-1",
      researchQuestion: "집계 근거를 조사해줘",
      targetSegment: "대한민국 사업체",
      targetVariable: "joint_prevalence",
    })).rejects.toThrow("personal_data_not_allowed:email_address");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO research_job"))).toBe(false);
  });

  it("rejects identifiers in review notes and modifications before persistence", async () => {
    await expect(reviewRevision({
      reviewId: "review-1",
      decision: "approve_modified",
      note: "010-1234-5678 확인",
      modification: { rationale: "집계 변경" },
    })).rejects.toThrow("personal_data_not_allowed:phone_number");
    await expect(reviewRevision({
      reviewId: "review-1",
      decision: "approve_modified",
      note: "집계 근거 수정",
      modification: { contact: "person@example.com" },
    })).rejects.toThrow("personal_data_not_allowed:email_address");
    expect(mocks.withWorkspaceTransaction).not.toHaveBeenCalled();
  });
});
