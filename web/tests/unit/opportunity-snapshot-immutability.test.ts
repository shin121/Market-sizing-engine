import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/db", () => ({
  getRuntimeContext: () => ({ workspaceId: "workspace-1", actorId: "actor-1" }),
  withWorkspaceTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }),
}));

vi.mock("@/server/services/segment-workflow", () => ({
  contentHash: () => "test-hash",
}));

import { saveOpportunity } from "@/server/services/workbench-mutations";

const baseInput = {
  opportunityId: "opportunity-1",
  expectedLockVersion: "3",
  segmentId: "segment-pinned",
  estimateSnapshotId: "estimate-pinned",
  name: "고정 snapshot Opportunity",
  problem: "생성 당시 근거를 보존해야 한다.",
  hypothesis: "편집으로 근거를 바꾸지 않는다.",
  idea: "immutable snapshot",
  status: "researching",
};

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT * FROM opportunity WHERE")) {
      return { rows: [{ opportunity_id: "opportunity-1", status: "researching", optimistic_lock_version: "3" }] };
    }
    if (sql.includes("UPDATE opportunity SET")) return { rows: [{ optimistic_lock_version: "4" }] };
    if (sql.includes("FROM opportunity_segment_link link")) {
      return { rows: [{
        saved_segment_id: "segment-pinned",
        query_result_id: "result-pinned",
        estimate_id: "estimate-pinned",
      }] };
    }
    return { rows: [] };
  });
});

describe("Opportunity primary snapshot immutability", () => {
  it("rejects high-confidence personal data before any database or audit write", async () => {
    await expect(saveOpportunity({
      ...baseInput,
      problem: "Contact person@example.com about this individual.",
    })).rejects.toThrow("personal_data_not_allowed:email_address");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("allows normal edits that repeat the exact pinned segment and estimate", async () => {
    await expect(saveOpportunity(baseInput)).resolves.toBe("opportunity-1");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO audit_event"))).toBe(true);
  });

  it("requires the version that the editor originally loaded", async () => {
    await expect(saveOpportunity({ ...baseInput, expectedLockVersion: null }))
      .rejects.toThrow("opportunity_expected_version_required");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a stale editor before updating, appending content, or auditing", async () => {
    await expect(saveOpportunity({ ...baseInput, expectedLockVersion: "2" }))
      .rejects.toThrow("opportunity_edit_conflict");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE opportunity SET"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO audit_event"))).toBe(false);
  });

  it.each([
    { label: "same segment's newer result", segmentId: "segment-pinned", estimateSnapshotId: "estimate-current" },
    { label: "another segment", segmentId: "segment-other", estimateSnapshotId: "estimate-pinned" },
  ])("fails closed for $label", async ({ segmentId, estimateSnapshotId }) => {
    await expect(saveOpportunity({ ...baseInput, segmentId, estimateSnapshotId }))
      .rejects.toThrow("opportunity_primary_snapshot_is_immutable");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO audit_event"))).toBe(false);
  });
});
