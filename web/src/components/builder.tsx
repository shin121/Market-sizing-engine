"use client";

import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Calculator,
  CheckCircle2,
  Copy,
  FileSearch,
  GripVertical,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import {
  calculateEstimateAction,
  interpretSegmentAction,
  saveSegmentAction,
} from "@/actions/workbench";
import { normalizeConditionLibrary } from "@/components/builder-data";
import {
  validateRuntimeConditionGroups,
  type RuntimeConditionGroup,
} from "@/server/services/segment-runtime-validation";

export type BuilderConditionOption = {
  id: string;
  sourceKind: string | null;
  label: string;
  group: string;
  unit: string | null;
  values: string[];
  status: string | null;
};

export type BuilderCondition = {
  id: string;
  sourceId: string;
  sourceKind: string | null;
  label: string;
  group: string;
  unit: string | null;
  operator: "eq" | "neq" | "in" | "not_in" | "between" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value: string;
  matchStatus: string;
  referenceYear: number | null;
  enabled: boolean;
};

export type BuilderGroup = {
  id: string;
  logic: "AND" | "OR" | "NOT";
  enabled: boolean;
  conditions: BuilderCondition[];
  groups: BuilderGroup[];
};

export type BuilderInitialState = {
  id: string | null;
  name: string;
  entityUnit: string;
  naturalLanguage: string;
  groups: BuilderGroup[];
};

type ActionResult = {
  ok: boolean;
  id?: string;
  error?: string;
  configurationRequired?: boolean;
  interpretation?: { conditions: unknown[]; unmatched?: string[]; suggestedEntityUnit?: string };
};

type InterpretationDraft = {
  naturalLanguage: string;
  conditions: BuilderCondition[];
  unmatched: string[];
  suggestedEntityUnit: string | null;
};

const ENTITY_UNITS = new Set(["person", "child_person", "household", "establishment", "enterprise"]);
const CONDITION_DRAG_TYPE = "application/x-market-atlas-condition";
const INTERPRETATION_STATUSES = new Set(["exact", "similar", "proxy", "ambiguous"]);

const interpretationStatusLabels: Record<string, string> = {
  exact: "정확히 매칭",
  similar: "유사 조건",
  proxy: "대체 proxy",
  ambiguous: "정의 불명확",
  missing: "현재 DB 미등록",
  research_required: "추가 조사 필요",
};

const interpretationConditionTypeLabels: Record<string, string> = {
  archetype: "Archetype",
  axis: "분류축",
  behavior: "Behavior",
  core_feature: "공통 Feature",
  domain_feature: "Domain Feature",
  calibration_dimension: "Calibration 차원",
  feature: "Feature",
  geography: "지역",
  gold_query: "검증된 복합질의",
  subtype: "Subtype",
  tag: "Behavior Tag",
};

function resultOf(value: unknown): ActionResult {
  return value && typeof value === "object" ? (value as ActionResult) : { ok: false, error: "응답 형식을 확인할 수 없습니다." };
}

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function emptyGroup(id = makeId("group")): BuilderGroup {
  return { id, logic: "AND", enabled: true, conditions: [], groups: [] };
}

function mapGroupTree(
  groups: BuilderGroup[],
  groupId: string,
  transform: (group: BuilderGroup) => BuilderGroup,
): BuilderGroup[] {
  return groups.map((group) => group.id === groupId
    ? transform(group)
    : { ...group, groups: mapGroupTree(group.groups, groupId, transform) });
}

function findGroup(groups: BuilderGroup[], groupId: string): BuilderGroup | null {
  for (const group of groups) {
    if (group.id === groupId) return group;
    const nested = findGroup(group.groups, groupId);
    if (nested) return nested;
  }
  return null;
}

function cloneGroup(group: BuilderGroup): BuilderGroup {
  return {
    ...group,
    id: makeId("group"),
    conditions: group.conditions.map((condition) => ({ ...condition, id: makeId("condition") })),
    groups: group.groups.map(cloneGroup),
  };
}

function insertGroupSibling(groups: BuilderGroup[], groupId: string, sibling: BuilderGroup): BuilderGroup[] {
  const directIndex = groups.findIndex((group) => group.id === groupId);
  if (directIndex >= 0) {
    const next = [...groups];
    next.splice(directIndex + 1, 0, sibling);
    return next;
  }
  return groups.map((group) => ({ ...group, groups: insertGroupSibling(group.groups, groupId, sibling) }));
}

function removeGroupFromTree(groups: BuilderGroup[], groupId: string): BuilderGroup[] {
  return groups
    .filter((group) => group.id !== groupId)
    .map((group) => ({ ...group, groups: removeGroupFromTree(group.groups, groupId) }));
}

function flattenConditions(groups: BuilderGroup[], parentEnabled = true): BuilderCondition[] {
  return groups.flatMap((group) => {
    const groupEnabled = parentEnabled && group.enabled;
    return [
      ...group.conditions.map((condition) => ({ ...condition, enabled: groupEnabled && condition.enabled })),
      ...flattenConditions(group.groups, groupEnabled),
    ];
  });
}

function invalidNotGroups(groups: BuilderGroup[], parentEnabled = true): BuilderGroup[] {
  return groups.flatMap((group) => {
    const effectivelyEnabled = parentEnabled && group.enabled;
    const enabledChildren = group.conditions.filter((condition) => condition.enabled).length
      + group.groups.filter((child) => child.enabled).length;
    return [
      ...(effectivelyEnabled && group.logic === "NOT" && enabledChildren !== 1 ? [group] : []),
      ...invalidNotGroups(group.groups, effectivelyEnabled),
    ];
  });
}

function runtimeValidationGroups(
  groups: BuilderGroup[],
  targetEntityUnit: string,
): RuntimeConditionGroup[] {
  return groups.map((group) => {
    const nested = runtimeValidationGroups(group.groups, targetEntityUnit);
    const conditions = group.conditions.map((condition) => ({
      id: condition.id,
      namespace: condition.sourceKind ?? "custom",
      sourceCode: condition.sourceId,
      operator: condition.operator,
      value: condition.value,
      entityUnit: condition.unit ?? targetEntityUnit,
      resolution: condition.matchStatus,
      dependencyGroup: null,
      referenceYear: condition.referenceYear,
      evidenceId: null,
      enabled: condition.enabled,
    }));
    return { logic: group.logic, enabled: group.enabled, conditions, groups: nested };
  });
}

function interpretedCondition(value: unknown, index: number): BuilderCondition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sourceId = String(record.source_id ?? record.sourceId ?? record.feature_code ?? record.featureCode ?? record.id ?? "");
  const sourceKind = typeof record.sourceKind === "string"
    ? record.sourceKind
    : typeof record.source_kind === "string" ? record.source_kind : null;
  const label = String(record.label_ko ?? record.labelKo ?? record.label ?? record.value ?? sourceId);
  if (!sourceId && !label) return null;
  const rawMatchStatus = String(record.match_status ?? record.matchStatus ?? "ambiguous");
  return {
    id: makeId(`interpreted-${index}`),
    sourceId,
    sourceKind,
    label,
    group: String(record.group ?? record.type ?? "자연어 해석"),
    unit: typeof record.entity_unit === "string" ? record.entity_unit : typeof record.unit === "string" ? record.unit : null,
    operator: record.operator === "in" || record.operator === "exists" ? record.operator : "eq",
    value: String(record.value ?? ""),
    matchStatus: INTERPRETATION_STATUSES.has(rawMatchStatus) ? rawMatchStatus : "ambiguous",
    referenceYear: typeof record.reference_year === "number"
      ? record.reference_year
      : typeof record.referenceYear === "number" ? record.referenceYear : null,
    enabled: true,
  };
}

export function SegmentBuilder({
  library,
  initial,
}: {
  library: BuilderConditionOption[];
  initial: BuilderInitialState;
}) {
  const router = useRouter();
  const [segmentId, setSegmentId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [entityUnit, setEntityUnit] = useState(initial.entityUnit);
  const [naturalLanguage, setNaturalLanguage] = useState(initial.naturalLanguage);
  const initialGroups = initial.groups.length ? initial.groups : [emptyGroup("group-root")];
  const [groups, setGroups] = useState<BuilderGroup[]>(initialGroups);
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0].id);
  const [activeLibraryGroup, setActiveLibraryGroup] = useState("전체");
  const [query, setQuery] = useState("");
  const [remoteLibrary, setRemoteLibrary] = useState<BuilderConditionOption[]>([]);
  const [remoteLibraryQuery, setRemoteLibraryQuery] = useState("");
  const [selectedLibrary, setSelectedLibrary] = useState<BuilderConditionOption[]>([]);
  const [librarySearchPending, setLibrarySearchPending] = useState(false);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [interpretationDraft, setInterpretationDraft] = useState<InterpretationDraft | null>(null);
  const [draggedConditionId, setDraggedConditionId] = useState<string | null>(null);
  const [dragTargetGroupId, setDragTargetGroupId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const librarySearchRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const interpretationRequestRef = useRef(0);

  const activeLibraryHasMore = remoteLibraryQuery === query.trim() && libraryHasMore;
  const availableLibrary = useMemo(() => {
    const activeRemoteLibrary = query.trim().length >= 2 && remoteLibraryQuery === query.trim() ? remoteLibrary : [];
    return [...new Map(
      [...library, ...selectedLibrary, ...activeRemoteLibrary].map((item) => [item.id, item]),
    ).values()];
  }, [library, query, remoteLibrary, remoteLibraryQuery, selectedLibrary]);
  const libraryGroups = useMemo(() => [...new Set(library.map((item) => item.group))], [library]);
  const libraryById = useMemo(() => new Map(availableLibrary.map((item) => [item.id, item])), [availableLibrary]);
  const normalizedQuery = query.toLocaleLowerCase("ko");
  const filteredLibrary = useMemo(() => availableLibrary.filter((item) => {
    const groupMatch = activeLibraryGroup === "전체" || item.group === activeLibraryGroup;
    const queryMatch = !normalizedQuery || `${item.label} ${item.id}`.toLocaleLowerCase("ko").includes(normalizedQuery);
    const unitMatch = !item.unit || item.unit === "all" || !entityUnit || item.unit === entityUnit;
    return groupMatch && queryMatch && unitMatch;
  }), [activeLibraryGroup, availableLibrary, entityUnit, normalizedQuery]);

  useEffect(() => {
    workspaceRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return;
    const controller = new AbortController();
    let current = true;
    const timeout = window.setTimeout(async () => {
      setLibrarySearchPending(true);
      try {
        const params = new URLSearchParams({ q: search, limit: "80" });
        if (entityUnit) params.set("unit", entityUnit);
        const response = await fetch(`/api/catalog/conditions?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("condition_library_search_failed");
        const payload = await response.json() as { conditions?: unknown; hasMore?: boolean };
        if (!current) return;
        setRemoteLibrary(normalizeConditionLibrary(payload.conditions ?? []));
        setRemoteLibraryQuery(search);
        setLibraryHasMore(payload.hasMore === true);
      } catch {
        if (!current || controller.signal.aborted) return;
        setRemoteLibrary([]);
        setRemoteLibraryQuery(search);
        setLibraryHasMore(false);
      } finally {
        if (current) setLibrarySearchPending(false);
      }
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [entityUnit, query]);

  const enabledConditions = useMemo(() => flattenConditions(groups).filter((condition) => condition.enabled), [groups]);
  const notGroupErrors = useMemo(() => invalidNotGroups(groups), [groups]);
  const unitMismatch = enabledConditions.some((condition) => condition.unit && condition.unit !== "all" && condition.unit !== entityUnit);
  const missingValues = enabledConditions.some((condition) => condition.operator !== "exists" && !condition.value);
  const validationIssues = useMemo(() => {
    const runtimeGroups = runtimeValidationGroups(groups, entityUnit);
    if (!runtimeGroups.length) return [];
    try {
      return validateRuntimeConditionGroups({
        name: name.trim() || "이름 없는 세그먼트",
        entityUnit,
        naturalLanguage,
        groups: runtimeGroups,
      });
    } catch {
      return [];
    }
  }, [entityUnit, groups, name, naturalLanguage]);
  const validationErrors = validationIssues.filter((issue) => issue.severity === "error");
  const canCalculate = Boolean(name.trim()) && enabledConditions.length > 0 && !unitMismatch && !missingValues
    && !notGroupErrors.length && !unmatched.length && !validationErrors.length && !interpretationDraft && !pending;

  function addCondition(option: BuilderConditionOption, value = "", targetGroupId = activeGroupId) {
    setSelectedLibrary((current) => [...new Map([...current, option].map((item) => [item.id, item])).values()]);
    setGroups((current) => {
      const targetId = findGroup(current, targetGroupId)?.id ?? current[0]?.id;
      if (!targetId) return current;
      return mapGroupTree(current, targetId, (group) => ({
        ...group,
        conditions: [...group.conditions, {
          id: makeId("condition"),
          sourceId: option.id,
          sourceKind: option.sourceKind,
          label: option.label,
          group: option.group,
          unit: option.unit,
          operator: option.values.length ? "eq" : "exists",
          value,
          matchStatus: option.status ?? "matched",
          referenceYear: null,
          enabled: true,
        }],
      }));
    });
  }

  function beginConditionDrag(event: ReactDragEvent<HTMLDivElement>, option: BuilderConditionOption) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CONDITION_DRAG_TYPE, option.id);
    event.dataTransfer.setData("text/plain", option.id);
    setDraggedConditionId(option.id);
    setMessage(null);
  }

  function finishConditionDrag() {
    setDraggedConditionId(null);
    setDragTargetGroupId(null);
  }

  function dropCondition(event: ReactDragEvent<HTMLDivElement>, groupId: string) {
    event.preventDefault();
    event.stopPropagation();
    const conditionId = event.dataTransfer.getData(CONDITION_DRAG_TYPE)
      || event.dataTransfer.getData("text/plain")
      || draggedConditionId;
    const option = conditionId ? libraryById.get(conditionId) : null;
    finishConditionDrag();
    if (!option) {
      setMessage("드래그한 조건을 확인할 수 없습니다. 왼쪽 라이브러리의 추가 버튼을 사용하세요.");
      return;
    }
    addCondition(option, "", groupId);
    setActiveGroupId(groupId);
    setMessage(`${option.label} 조건을 선택한 그룹에 추가했습니다.`);
  }

  function updateCondition(groupId: string, conditionId: string, patch: Partial<BuilderCondition>) {
    setGroups((current) => mapGroupTree(current, groupId, (group) => ({
      ...group,
      conditions: group.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
    })));
  }

  function removeCondition(groupId: string, conditionId: string) {
    setGroups((current) => mapGroupTree(current, groupId, (group) => ({
      ...group,
      conditions: group.conditions.filter((condition) => condition.id !== conditionId),
    })));
  }

  function addGroup(parentId?: string) {
    const created = emptyGroup();
    setGroups((current) => parentId
      ? mapGroupTree(current, parentId, (group) => ({ ...group, groups: [...group.groups, created] }))
      : [...current, created]);
    setActiveGroupId(created.id);
  }

  function duplicateGroup(groupId: string) {
    const source = findGroup(groups, groupId);
    if (!source) return;
    const duplicate = cloneGroup(source);
    setGroups((current) => insertGroupSibling(current, groupId, duplicate));
    setActiveGroupId(duplicate.id);
  }

  function removeGroup(groupId: string) {
    if (groups.length === 1 && groups[0].id === groupId) {
      const cleared = { ...groups[0], conditions: [], groups: [] };
      setGroups([cleared]);
      setActiveGroupId(cleared.id);
      return;
    }
    const next = removeGroupFromTree(groups, groupId);
    const safeNext = next.length ? next : [emptyGroup("group-root")];
    setGroups(safeNext);
    if (!findGroup(safeNext, activeGroupId)) setActiveGroupId(safeNext[0].id);
  }

  function payload() {
    function groupPayload(group: BuilderGroup): Record<string, unknown> {
      return {
        logic: group.logic,
        enabled: group.enabled,
        conditions: group.conditions.map((condition) => ({
          sourceId: condition.sourceId,
          sourceKind: condition.sourceKind,
          label: condition.label,
          group: condition.group,
          unit: condition.unit,
          operator: condition.operator,
          value: condition.value,
          matchStatus: condition.matchStatus,
          referenceYear: condition.referenceYear,
          enabled: condition.enabled,
        })),
        groups: group.groups.map(groupPayload),
      };
    }
    return groups.map(groupPayload);
  }

  function interpret() {
    if (!naturalLanguage.trim()) {
      setMessage("해석할 자연어 질문을 입력하세요.");
      return;
    }
    const requestedLanguage = naturalLanguage.trim();
    const requestId = interpretationRequestRef.current + 1;
    interpretationRequestRef.current = requestId;
    setInterpretationDraft(null);
    startTransition(async () => {
      setMessage(null);
      const formData = new FormData();
      formData.set("natural_language", requestedLanguage);
      const result = resultOf(await interpretSegmentAction(formData));
      if (requestId !== interpretationRequestRef.current) return;
      if (!result.ok) {
        setMessage(result.configurationRequired ? "자연어 해석 Provider 설정이 필요합니다." : result.error ?? "조건 해석에 실패했습니다.");
        return;
      }
      const parsed = (result.interpretation?.conditions ?? []).flatMap((item, index) => {
        const condition = interpretedCondition(item, index);
        return condition ? [condition] : [];
      });
      const suggestedEntityUnit = result.interpretation?.suggestedEntityUnit;
      setInterpretationDraft({
        naturalLanguage: requestedLanguage,
        conditions: parsed,
        unmatched: [...new Set(result.interpretation?.unmatched ?? [])],
        suggestedEntityUnit: suggestedEntityUnit && ENTITY_UNITS.has(suggestedEntityUnit) ? suggestedEntityUnit : null,
      });
      setMessage("해석 draft를 검토한 뒤 적용하거나 취소하세요. 적용 전에는 현재 조건을 변경하지 않습니다.");
    });
  }

  function applyInterpretation() {
    if (!interpretationDraft?.conditions.length) {
      setMessage("적용할 매칭 조건이 없습니다. 미등록 조건을 조사하거나 해석을 취소하세요.");
      return;
    }
    const interpretedGroup = {
      id: makeId("interpreted-group"),
      logic: "AND" as const,
      enabled: true,
      conditions: interpretationDraft.conditions,
      groups: [],
    };
    setGroups([interpretedGroup]);
    setActiveGroupId(interpretedGroup.id);
    if (interpretationDraft.suggestedEntityUnit) setEntityUnit(interpretationDraft.suggestedEntityUnit);
    setUnmatched(interpretationDraft.unmatched);
    setInterpretationDraft(null);
    setMessage("검토한 해석을 조건에 적용했습니다. 각 조건의 값과 상태를 확인하세요.");
  }

  function cancelInterpretation() {
    interpretationRequestRef.current += 1;
    setInterpretationDraft(null);
    setMessage("해석 draft를 취소했습니다. 기존 조건은 유지됩니다.");
  }

  function save() {
    startTransition(async () => {
      setMessage(null);
      const formData = new FormData();
      if (segmentId) formData.set("segment_id", segmentId);
      formData.set("name", name.trim());
      formData.set("entity_unit", entityUnit);
      formData.set("natural_language", naturalLanguage.trim());
      formData.set("conditions_json", JSON.stringify(payload()));
      const result = resultOf(await saveSegmentAction(formData));
      if (result.ok && result.id) {
        setSegmentId(result.id);
        setMessage("세그먼트 버전을 저장했습니다.");
        if (!segmentId) {
          router.replace(`/builder/${encodeURIComponent(result.id)}`);
          router.refresh();
        }
        return;
      }
      setMessage(result.error ?? "저장에 실패했습니다.");
    });
  }

  function calculate() {
    if (!canCalculate) return;
    startTransition(async () => {
      setMessage(null);
      const formData = new FormData();
      if (segmentId) formData.set("segment_id", segmentId);
      formData.set("name", name.trim());
      formData.set("entity_unit", entityUnit);
      formData.set("conditions_json", JSON.stringify(payload()));
      const result = resultOf(await calculateEstimateAction(formData));
      if (result.ok && result.id) setEstimateId(result.id);
      setMessage(result.ok ? "계산 snapshot을 생성했습니다." : result.error ?? "시장규모 계산에 실패했습니다.");
    });
  }

  function renderGroup(group: BuilderGroup, depth: number, path: number[]): ReactNode {
    const groupLabel = path.map((value) => String(value).padStart(2, "0")).join(".");
    return (
      <article
        className={`condition-group ${group.enabled ? "" : "disabled"} ${activeGroupId === group.id ? "active-target" : ""} ${dragTargetGroupId === group.id ? "drag-target" : ""}`}
        data-group-depth={depth}
        data-group-id={group.id}
        key={group.id}
        onFocusCapture={() => setActiveGroupId(group.id)}
      >
        <header>
          <span>GROUP {groupLabel}</span>
          <select aria-label={`그룹 ${groupLabel} 논리`} value={group.logic} onChange={(event) => setGroups((current) => mapGroupTree(current, group.id, (item) => ({ ...item, logic: event.target.value as BuilderGroup["logic"] })))}><option>AND</option><option>OR</option><option>NOT</option></select>
          <div>
            <button type="button" className="group-target-button" aria-pressed={activeGroupId === group.id} onClick={() => setActiveGroupId(group.id)}>{activeGroupId === group.id ? "추가 대상" : "대상 선택"}</button>
            <label className="condition-toggle"><input type="checkbox" checked={group.enabled} onChange={(event) => setGroups((current) => mapGroupTree(current, group.id, (item) => ({ ...item, enabled: event.target.checked })))} /><span className="sr-only">조건 그룹 {groupLabel} 활성화</span></label>
            <button type="button" onClick={() => addGroup(group.id)} aria-label={`그룹 ${groupLabel}에 하위 조건 그룹 추가`}><Plus aria-hidden="true" /></button>
            <button type="button" onClick={() => duplicateGroup(group.id)} aria-label={`조건 그룹 ${groupLabel} 복제`}><Copy aria-hidden="true" /></button>
            <button type="button" onClick={() => removeGroup(group.id)} aria-label={`조건 그룹 ${groupLabel} 삭제`}><Trash2 aria-hidden="true" /></button>
          </div>
        </header>
        <div
          className="condition-list"
          role="group"
          aria-label={`조건 그룹 ${groupLabel} 드롭 영역`}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragTargetGroupId(group.id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setDragTargetGroupId(group.id);
          }}
          onDrop={(event) => dropCondition(event, group.id)}
        >
          {group.conditions.map((condition) => {
            const option = libraryById.get(condition.sourceId);
            return (
              <div className={`condition-row ${condition.enabled ? "" : "disabled"}`} key={condition.id}>
                <GripVertical aria-hidden="true" />
                <div className="condition-copy"><small>{condition.group} · {condition.matchStatus}</small><strong>{condition.label}</strong></div>
                <select aria-label={`${condition.label} 연산자`} value={condition.operator} onChange={(event) => updateCondition(group.id, condition.id, { operator: event.target.value as BuilderCondition["operator"] })}><option value="eq">같음</option><option value="neq">같지 않음</option><option value="in">다중 포함</option><option value="not_in">다중 제외</option><option value="between">범위</option><option value="gt">초과</option><option value="gte">이상</option><option value="lt">미만</option><option value="lte">이하</option><option value="contains">포함</option><option value="exists">존재</option></select>
                {condition.operator !== "exists" ? option?.values.length && ["eq", "neq"].includes(condition.operator) ? <select aria-label={`${condition.label} 값`} value={condition.value} onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })}><option value="">값 선택</option>{option.values.map((value) => <option value={value} key={value}>{value}</option>)}</select> : <input aria-label={`${condition.label} 값`} value={condition.value} onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })} placeholder={["in", "not_in"].includes(condition.operator) ? "쉼표로 여러 값 입력" : condition.operator === "between" ? "Low, High" : "조건 값"} /> : <span className="exists-value">존재함</span>}
                <input aria-label={`${condition.label} 기준연도`} className="condition-year" type="number" min="1900" max="2200" inputMode="numeric" value={condition.referenceYear ?? ""} onChange={(event) => updateCondition(group.id, condition.id, { referenceYear: event.target.value ? Number(event.target.value) : null })} placeholder="기준연도" />
                <label className="condition-toggle"><input type="checkbox" checked={condition.enabled} onChange={(event) => updateCondition(group.id, condition.id, { enabled: event.target.checked })} /><span className="sr-only">{condition.label} 조건 활성화</span></label>
                <button type="button" className="icon-button" onClick={() => removeCondition(group.id, condition.id)} aria-label={`${condition.label} 삭제`}><Trash2 aria-hidden="true" /></button>
              </div>
            );
          })}
          {!group.conditions.length ? <button type="button" className="condition-dropzone" onClick={() => { setActiveGroupId(group.id); librarySearchRef.current?.focus(); }}><Plus aria-hidden="true" /> 여기에 조건을 드롭하거나, 이 그룹을 선택한 뒤 왼쪽 추가 버튼을 사용하세요</button> : null}
          {group.groups.length ? <div className="nested-condition-groups" aria-label={`그룹 ${groupLabel}의 하위 그룹`}>{group.groups.map((child, index) => renderGroup(child, depth + 1, [...path, index + 1]))}</div> : null}
          <button type="button" className="add-nested-group-button" onClick={() => addGroup(group.id)}><Plus aria-hidden="true" /> 하위 조건 그룹 추가</button>
        </div>
      </article>
    );
  }

  return (
    <div ref={workspaceRef} className="builder-workspace" data-hydrated="false">
      <aside className="condition-library" aria-label="조건 라이브러리">
        <div className="builder-panel-heading">
          <span>01</span><div><strong>조건 라이브러리</strong><small>Phase 2 registry</small></div>
        </div>
        <label className="library-search"><span className="sr-only">조건 검색</span><input ref={librarySearchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="조건 검색" /></label>
        {query.trim().length >= 2 ? <p className="library-search-status" role="status">{librarySearchPending ? "전체 조건 registry 검색 중…" : `${filteredLibrary.length.toLocaleString("ko-KR")}개 일치${activeLibraryHasMore ? " · 더 구체적인 검색어를 입력하세요" : ""}`}</p> : <p className="library-search-status">종류별 대표 조건을 표시합니다. 2자 이상 입력하면 전체 registry를 검색합니다.</p>}
        <p className="library-drag-help" id="builder-drag-help">조건을 원하는 그룹으로 드래그하세요. 키보드에서는 추가 또는 값 선택 버튼을 사용합니다.</p>
        <div className="library-tabs" role="group" aria-label="조건 종류 필터">
          <button type="button" aria-pressed={activeLibraryGroup === "전체"} aria-controls="condition-library-options" className={activeLibraryGroup === "전체" ? "active" : ""} onClick={() => setActiveLibraryGroup("전체")}>전체</button>
          {libraryGroups.map((group) => <button type="button" aria-pressed={activeLibraryGroup === group} aria-controls="condition-library-options" key={group} className={activeLibraryGroup === group ? "active" : ""} onClick={() => setActiveLibraryGroup(group)}>{group}</button>)}
        </div>
        <div className="library-options" id="condition-library-options">
          {filteredLibrary.map((option) => (
            <div
              className={`library-option ${draggedConditionId === option.id ? "dragging" : ""}`}
              key={`${option.group}-${option.id}`}
              draggable
              aria-describedby="builder-drag-help"
              onDragStart={(event) => beginConditionDrag(event, option)}
              onDragEnd={finishConditionDrag}
            >
              <div><small>{option.group}</small><strong>{option.label}</strong><span>{!option.unit || option.unit === "all" ? "공통 조건" : option.unit}</span></div>
              {option.values.length ? (
                <details><summary>값 선택 <Plus aria-hidden="true" /></summary><div>{option.values.map((value) => <button type="button" key={value} onClick={() => addCondition(option, value)}>{value}</button>)}</div></details>
              ) : <button type="button" className="icon-button" onClick={() => addCondition(option)} aria-label={`${option.label} 추가`}><Plus aria-hidden="true" /></button>}
            </div>
          ))}
          {!filteredLibrary.length && !librarySearchPending ? <p className="library-empty">현재 단위와 검색어에 맞는 실제 조건이 없습니다.</p> : null}
        </div>
      </aside>

      <section className="logic-canvas">
        <div className="builder-panel-heading">
          <span>02</span><div><strong>조건 논리</strong><small>AND · OR · NOT</small></div>
        </div>
        <div className="natural-language-box">
          <label htmlFor="natural-language">자연어 질문</label>
          <textarea id="natural-language" aria-describedby="builder-privacy-help" value={naturalLanguage} onChange={(event) => { interpretationRequestRef.current += 1; setNaturalLanguage(event.target.value); setInterpretationDraft(null); setUnmatched([]); }} placeholder="시장 질문을 입력하면 구조화 조건 후보로 해석합니다." />
          <small id="builder-privacy-help">집계 시장 질문만 입력하세요. 이메일·전화번호 등 명백한 식별자 패턴은 자동 차단하지만 모든 개인정보를 탐지하지는 못하므로 실명·연락처·상세 주소·계정 ID·미성년자 식별정보를 입력하지 마세요.</small>
          <button type="button" className="button" onClick={interpret} disabled={pending}><Sparkles aria-hidden="true" /> 조건 해석</button>
        </div>
        {interpretationDraft ? (
          <section className="interpretation-draft" aria-label="자연어 해석 draft">
            <header>
              <div><strong>해석 draft</strong><small>아직 현재 조건에 적용되지 않았습니다.</small></div>
              {interpretationDraft.suggestedEntityUnit ? <span>추천 단위 · {interpretationDraft.suggestedEntityUnit}</span> : null}
            </header>
            <p>{interpretationDraft.naturalLanguage}</p>
            {interpretationDraft.conditions.length ? (
              <ul className="interpretation-candidates">
                {interpretationDraft.conditions.map((condition) => (
                  <li key={condition.id}>
                    <span><strong>{condition.label}</strong><small>{interpretationConditionTypeLabels[condition.group] ?? "조건"}</small></span>
                    <span className={`interpretation-status status-${condition.matchStatus}`}><b>{interpretationStatusLabels[condition.matchStatus] ?? "검토 필요"}</b></span>
                  </li>
                ))}
              </ul>
            ) : <p className="interpretation-empty">현재 registry에서 적용 가능한 조건 후보를 찾지 못했습니다.</p>}
            {interpretationDraft.unmatched.length ? (
              <div className="interpretation-gaps">
                <strong>미매칭 표현</strong>
                <ul>
                  {interpretationDraft.unmatched.map((item) => (
                    <li key={item}><span>{item}</span><span><b>{interpretationStatusLabels.missing}</b></span><span><b>{interpretationStatusLabels.research_required}</b></span></li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="interpretation-actions">
              <button type="button" className="button button-quiet" onClick={cancelInterpretation}>해석 취소</button>
              <button type="button" className="button button-primary" onClick={applyInterpretation} disabled={!interpretationDraft.conditions.length}>해석 적용</button>
            </div>
          </section>
        ) : null}
        <div className="segment-definition-bar">
          <label><span>세그먼트 이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="저장할 세그먼트 이름" /></label>
          <label><span>대상 단위</span><select value={entityUnit} onChange={(event) => setEntityUnit(event.target.value)}><option value="person">사람</option><option value="child_person">아동·청소년</option><option value="household">가구</option><option value="establishment">사업체</option><option value="enterprise">기업</option></select></label>
        </div>
        {groups.map((group, groupIndex) => renderGroup(group, 0, [groupIndex + 1]))}
        <button type="button" className="add-group-button" onClick={() => addGroup()}><Plus aria-hidden="true" /> 최상위 조건 그룹 추가</button>
      </section>

      <aside className="estimate-rail" aria-label="계산 검토">
        <div className="builder-panel-heading inverse"><span>03</span><div><strong>계산 검토</strong><small>validation first</small></div></div>
        <div className="estimate-readout">
          <small>LIVE ESTIMATE</small>
          <strong>{estimateId ? "Snapshot 생성됨" : "계산 전"}</strong>
          <p>서버 계산 전에는 규모를 표시하지 않습니다.</p>
        </div>
        <div className="validation-list">
          <div className={enabledConditions.length ? "valid" : "warning"}>{enabledConditions.length ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<span><strong>조건</strong><small>{enabledConditions.length ? `${enabledConditions.length}개 활성` : "최소 1개 필요"}</small></span></div>
          <div className={unitMismatch ? "warning" : "valid"}>{unitMismatch ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span><strong>분모 단위</strong><small>{unitMismatch ? "혼합 단위 확인 필요" : entityUnit}</small></span></div>
          <div className={missingValues ? "warning" : "valid"}>{missingValues ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span><strong>조건 값</strong><small>{missingValues ? "값이 비어 있음" : "검토 완료"}</small></span></div>
          <div className={notGroupErrors.length ? "warning" : "valid"}>{notGroupErrors.length ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span><strong>NOT 그룹</strong><small>{notGroupErrors.length ? "활성 자식은 정확히 1개여야 함" : "논리 구조 유효"}</small></span></div>
          {interpretationDraft ? <div className="warning"><FileSearch aria-hidden="true" /><span><strong>해석 draft</strong><small>적용 또는 취소 전에는 저장·계산할 수 없음</small></span></div> : null}
          {validationIssues.map((issue, index) => <div className="warning" data-severity={issue.severity} key={`${issue.code}-${index}`}><AlertTriangle aria-hidden="true" /><span><strong>{issue.severity === "error" ? "조건 오류" : "검토 경고"}</strong><small>{issue.message}</small></span></div>)}
          {unmatched.length ? <div className="warning"><FileSearch aria-hidden="true" /><span><strong>미매칭 조건</strong><small>{unmatched.join(", ")} · 추가 조사 필요</small></span></div> : null}
        </div>
        {unmatched.length ? <Link className="result-link" href="/research">미매칭 조건 근거 조사하기 <ArrowRight aria-hidden="true" /></Link> : null}
        {message ? <p className="builder-message" role="status">{message}</p> : null}
        <div className="estimate-actions">
          <button type="button" className="button" onClick={save} disabled={pending || !name.trim() || Boolean(interpretationDraft)}><Save aria-hidden="true" /> 저장</button>
          <button type="button" className="button button-primary" onClick={calculate} disabled={!canCalculate}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Calculator aria-hidden="true" />} 시장규모 계산</button>
        </div>
        {estimateId ? <Link className="result-link" href={`/sizing/${encodeURIComponent(estimateId)}`}>계산 결과 열기 <ArrowRight aria-hidden="true" /></Link> : null}
        {estimateId && segmentId ? <Link className="result-link" href={`/opportunities?segment=${encodeURIComponent(segmentId)}`}>아이디어 보드에 연결 <ArrowRight aria-hidden="true" /></Link> : null}
        <div className="baseline-note"><Braces aria-hidden="true" /><p>사용자 조건과 시나리오는 별도 snapshot으로 저장되며 Baseline을 덮어쓰지 않습니다.</p></div>
      </aside>
    </div>
  );
}
