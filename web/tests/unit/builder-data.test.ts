import { describe, expect, it } from "vitest";

import { normalizeBuilderInitial, normalizeConditionLibrary } from "@/components/builder-data";

describe("builder data normalization", () => {
  it("preserves condition source kinds and the shared all-entity unit", () => {
    const [condition] = normalizeConditionLibrary([{
      catalogId: "geography:KR",
      sourceKind: "geography",
      labelKo: "대한민국",
      entityUnit: "all",
      allowedValues: [],
      queryable: true,
    }]);

    expect(condition).toMatchObject({
      id: "geography:KR",
      sourceKind: "geography",
      unit: "all",
    });
  });

  it("retains sourceKind when a saved condition is reopened", () => {
    const initial = normalizeBuilderInitial({
      id: "segment-1",
      entityUnit: "enterprise",
      conditionsJson: JSON.stringify([{
        logic: "AND",
        enabled: true,
        conditions: [{
          sourceId: "archetype:ARC-06-001",
          sourceKind: "archetype",
          label: "홈페이지 미보유 음식점 사업자",
          group: "Archetype",
          unit: "enterprise",
          operator: "eq",
          value: "ARC-06-001",
          matchStatus: "exact",
          enabled: true,
        }],
      }]),
    });

    expect(initial.groups[0]?.conditions[0]).toMatchObject({
      sourceId: "archetype:ARC-06-001",
      sourceKind: "archetype",
      unit: "enterprise",
    });
  });

  it("reconstructs persisted nested groups and retains condition reference years", () => {
    const initial = normalizeBuilderInitial({
      conditions: [
        { group_id: "root", parent_group_id: null, logic: "AND", enabled: true, conditions: [] },
        {
          group_id: "child",
          parent_group_id: "root",
          logic: "NOT",
          enabled: true,
          conditions: [{
            condition_id: "condition-1",
            source_id: "core_feature:online_channel",
            source_kind: "core_feature",
            label: "온라인 판매채널 보유",
            unit: "enterprise",
            operator: "eq",
            value: true,
            match_status: "exact",
            reference_year: 2025,
            enabled: true,
          }],
        },
      ],
    });

    expect(initial.groups).toHaveLength(1);
    expect(initial.groups[0]?.groups[0]).toMatchObject({ logic: "NOT", enabled: true });
    expect(initial.groups[0]?.groups[0]?.conditions[0]).toMatchObject({
      sourceId: "core_feature:online_channel",
      referenceYear: 2025,
    });
  });
});
