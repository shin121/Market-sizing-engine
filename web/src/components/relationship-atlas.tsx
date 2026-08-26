"use client";

import {
  ArrowUpRight,
  Focus,
  GitBranch,
  Minus,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Breakdown = { label: string; value: number };

export type RelationshipNode = {
  id: string;
  label: string;
  description?: string | null;
  kind: "domain" | "axis" | "subtype" | "archetype";
  href: string;
  unit?: string | null;
  countLow?: number | null;
  countBase?: number | null;
  countHigh?: number | null;
  shareBase?: number | null;
  confidence?: number | null;
  grade?: string | null;
  referenceYear?: number | string | null;
  method?: string | null;
  linkedSubtypeIds?: string[];
  breakdown?: Breakdown[];
};

type RelationshipAtlasProps = {
  domain: RelationshipNode;
  axes: RelationshipNode[];
  subtypes: RelationshipNode[];
  archetypes: RelationshipNode[];
};

type Position = { x: number; y: number; width: number; height: number };

const kindLabels = {
  domain: "DOMAIN",
  axis: "SEGMENTATION AXIS",
  subtype: "PRIMARY SUBTYPE",
  archetype: "ARCHETYPE",
} as const;

const kindQueryKeys = {
  axis: "axis",
  subtype: "subtype",
  archetype: "archetype",
} as const;

const unitLabels: Record<string, string> = {
  person: "사람",
  child_person: "아동",
  household: "가구",
  establishment: "사업체",
  enterprise: "기업",
};

function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "산출 없음";
  return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function slotPositions(nodes: RelationshipNode[], x: number, height: number, nodeHeight = 66): Map<string, Position> {
  const visibleHeight = Math.max(1, height - 60);
  const gap = Math.min(24, Math.max(10, (visibleHeight - nodes.length * nodeHeight) / Math.max(1, nodes.length - 1)));
  const contentHeight = nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * gap;
  const top = Math.max(30, (height - contentHeight) / 2);
  return new Map(nodes.map((node, index) => [node.id, { x, y: top + index * (nodeHeight + gap), width: 186, height: nodeHeight }]));
}

function pathBetween(from: Position, to: Position): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const bend = Math.max(42, (x2 - x1) * 0.52);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function nodeParam(node: RelationshipNode): string | null {
  return node.kind === "domain" ? null : kindQueryKeys[node.kind];
}

function subscribeToLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function locationSearchSnapshot() {
  return window.location.search;
}

export function RelationshipAtlas({ domain, axes, subtypes, archetypes }: RelationshipAtlasProps) {
  const locationSearch = useSyncExternalStore(subscribeToLocation, locationSearchSnapshot, () => "");
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const initialAxis = axes.find((node) => node.id === searchParams.get("axis")) ?? axes[0] ?? null;
  const initialSubtype = subtypes.find((node) => node.id === searchParams.get("subtype")) ?? null;
  const initialArchetype = archetypes.find((node) => node.id === searchParams.get("archetype")) ?? null;
  const selected = initialArchetype ?? initialSubtype ?? initialAxis ?? domain;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.84);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showCounts, setShowCounts] = useState(true);
  const [showRange, setShowRange] = useState(true);
  const [confidenceFloor, setConfidenceFloor] = useState(0);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  const visibleAxes = useMemo(() => {
    const preferred = axes.slice(0, 5);
    if (selected.kind === "axis" && !preferred.some((node) => node.id === selected.id)) return [...preferred.slice(0, 4), selected];
    return preferred;
  }, [axes, selected]);

  const selectedSubtypeId = selected.kind === "subtype"
    ? selected.id
    : selected.kind === "archetype"
      ? selected.linkedSubtypeIds?.find((id) => subtypes.some((node) => node.id === id)) ?? null
      : null;
  const visibleArchetypes = useMemo(() => {
    if (!selectedSubtypeId) return archetypes.slice(0, 6);
    const linked = archetypes.filter((node) => node.linkedSubtypeIds?.includes(selectedSubtypeId));
    return (linked.length ? linked : archetypes).slice(0, 6);
  }, [archetypes, selectedSubtypeId]);

  const canvasHeight = 560;
  const domainPositions = useMemo(() => slotPositions([domain], 34, canvasHeight, 92), [domain]);
  const axisPositions = useMemo(() => slotPositions(visibleAxes, 278, canvasHeight), [visibleAxes]);
  const subtypePositions = useMemo(() => slotPositions(subtypes, 536, canvasHeight), [subtypes]);
  const archetypePositions = useMemo(() => slotPositions(visibleArchetypes, 796, canvasHeight), [visibleArchetypes]);
  const allPositions = useMemo(() => new Map([
    ...domainPositions,
    ...axisPositions,
    ...subtypePositions,
    ...archetypePositions,
  ]), [archetypePositions, axisPositions, domainPositions, subtypePositions]);

  const selectedAxis = selected.kind === "axis" ? selected : initialAxis;

  const highlighted = useMemo(() => {
    const ids = new Set<string>([domain.id, selected.id]);
    const focusId = hoveredId ?? selected.id;
    const focusNode = [domain, ...visibleAxes, ...subtypes, ...visibleArchetypes].find((node) => node.id === focusId);
    if (!focusNode) return ids;
    if (focusNode.kind === "axis") {
      ids.add(domain.id);
      subtypes.forEach((node) => ids.add(node.id));
    }
    if (focusNode.kind === "subtype") {
      if (selectedAxis) ids.add(selectedAxis.id);
      visibleArchetypes.filter((node) => node.linkedSubtypeIds?.includes(focusNode.id)).forEach((node) => ids.add(node.id));
    }
    if (focusNode.kind === "archetype") {
      focusNode.linkedSubtypeIds?.forEach((id) => ids.add(id));
    }
    return ids;
  }, [domain, hoveredId, selected, selectedAxis, subtypes, visibleArchetypes, visibleAxes]);

  const choose = useCallback((node: RelationshipNode) => {
    const params = new URLSearchParams(locationSearch);
    const key = nodeParam(node);
    if (key) params.set(key, node.id);
    if (node.kind === "axis") {
      params.delete("subtype");
      params.delete("archetype");
    } else if (node.kind === "subtype") {
      params.delete("archetype");
    }
    const query = params.toString();
    window.history.pushState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    window.dispatchEvent(new Event("popstate"));
  }, [locationSearch]);

  const resetView = () => {
    setScale(0.84);
    setPan({ x: 0, y: 0 });
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, label")) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPan({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    });
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const renderNode = (node: RelationshipNode, position: Position) => {
    const muted = node.confidence !== null && node.confidence !== undefined && node.confidence < confidenceFloor;
    const active = highlighted.has(node.id);
    const current = selected.id === node.id;
    return (
      <button
        className={`relationship-node relationship-node-${node.kind} ${active ? "is-path-active" : "is-path-muted"} ${current ? "is-selected" : ""} ${muted ? "is-filtered" : ""}`}
        key={node.id}
        style={{ "--node-x": `${position.x}px`, "--node-y": `${position.y}px`, "--node-w": `${position.width}px`, "--node-h": `${position.height}px` } as CSSProperties}
        type="button"
        onClick={() => choose(node)}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}
        aria-pressed={current}
        title={`${node.label} · ${compact(node.countBase)} ${unitLabels[node.unit ?? ""] ?? node.unit ?? ""}`}
      >
        <span className="relationship-node-kicker">{kindLabels[node.kind]}</span>
        <strong>{node.label}</strong>
        <span className="relationship-node-meta">
          {showCounts ? compact(node.countBase) : percent(node.shareBase)}
          {node.unit ? ` ${unitLabels[node.unit] ?? node.unit}` : ""}
        </span>
        {showRange && node.countLow !== null && node.countLow !== undefined && node.countHigh !== null && node.countHigh !== undefined ? (
          <span className="relationship-node-range">{compact(node.countLow)} — {compact(node.countHigh)}</span>
        ) : null}
      </button>
    );
  };

  const domainPosition = domainPositions.get(domain.id)!;
  const axisPaths = visibleAxes.flatMap((axis) => {
    const position = axisPositions.get(axis.id);
    return position ? [{ id: `domain:${axis.id}`, from: domainPosition, to: position, kind: "primary", active: highlighted.has(axis.id) }] : [];
  });
  const contextPaths = selectedAxis ? subtypes.flatMap((subtype) => {
    const from = axisPositions.get(selectedAxis.id);
    const to = subtypePositions.get(subtype.id);
    return from && to ? [{ id: `axis:${subtype.id}`, from, to, kind: "context", active: highlighted.has(subtype.id) }] : [];
  }) : [];
  const subtypePaths = visibleArchetypes.flatMap((archetype) =>
    (archetype.linkedSubtypeIds ?? []).flatMap((subtypeId) => {
      const from = subtypePositions.get(subtypeId);
      const to = archetypePositions.get(archetype.id);
      return from && to ? [{ id: `${subtypeId}:${archetype.id}`, from, to, kind: "registered", active: highlighted.has(subtypeId) && highlighted.has(archetype.id) }] : [];
    }),
  );

  return (
    <section className="relationship-atlas" aria-labelledby="relationship-atlas-title">
      <header className="relationship-atlas-header">
        <div>
          <p className="eyebrow">RELATIONSHIP EXPLORER</p>
          <h2 id="relationship-atlas-title">Domain에서 Archetype까지 연결 구조</h2>
          <p>실제 등록 관계는 실선, 동일 Domain 문맥이지만 직접 edge가 없는 구간은 점선으로 구분합니다.</p>
        </div>
        <div className="relationship-legend" aria-label="관계선 범례">
          <span><i className="legend-primary" /> 등록 분류 구조</span>
          <span><i className="legend-registered" /> 직접 등록 관계</span>
          <span><i className="legend-context" /> Domain 문맥</span>
        </div>
      </header>

      <div className="relationship-atlas-body">
        <div className="relationship-workspace">
          <div className="relationship-toolbar" aria-label="관계도 보기 도구">
            <span><GitBranch aria-hidden="true" /> {axes.length} Axis · {subtypes.length} Subtype · {archetypes.length} Archetype 표본</span>
            <div>
              <button type="button" onClick={() => setScale((value) => Math.min(1.25, value + 0.1))} aria-label="관계도 확대"><Plus aria-hidden="true" /></button>
              <button type="button" onClick={() => setScale((value) => Math.max(0.72, value - 0.1))} aria-label="관계도 축소"><Minus aria-hidden="true" /></button>
              <button type="button" onClick={resetView} aria-label="관계도 위치 초기화"><Focus aria-hidden="true" /></button>
            </div>
          </div>
          <div
            className="relationship-viewport"
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <div className="relationship-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
              <div className="relationship-column-labels" aria-hidden="true">
                <span>01 · DOMAIN</span><span>02 · AXIS</span><span>03 · SUBTYPE</span><span>04 · ARCHETYPE</span>
              </div>
              <svg className="relationship-links" viewBox="0 0 1040 560" aria-hidden="true">
                {[...axisPaths, ...contextPaths, ...subtypePaths].map((path) => (
                  <path
                    key={path.id}
                    d={pathBetween(path.from, path.to)}
                    className={`relationship-link relationship-link-${path.kind} ${path.active ? "is-active" : "is-muted"}`}
                  />
                ))}
              </svg>
              {renderNode(domain, domainPosition)}
              {visibleAxes.map((node) => renderNode(node, allPositions.get(node.id)!))}
              {subtypes.map((node) => renderNode(node, allPositions.get(node.id)!))}
              {visibleArchetypes.map((node) => renderNode(node, allPositions.get(node.id)!))}
            </div>
          </div>
          <footer className="relationship-controls">
            <label><span>기준연도</span><select value={String(domain.referenceYear ?? "")} disabled><option>{domain.referenceYear ?? "미확인"}</option></select></label>
            <label className="relationship-confidence-control"><span>신뢰도 범위 · {confidenceFloor} 이상</span><input type="range" min="0" max="100" step="5" value={confidenceFloor} onChange={(event) => setConfidenceFloor(Number(event.currentTarget.value))} /></label>
            <label className="relationship-check"><input type="checkbox" checked={showRange} onChange={(event) => setShowRange(event.currentTarget.checked)} /> Low / High</label>
            <label className="relationship-check"><input type="checkbox" checked={showCounts} onChange={(event) => setShowCounts(event.currentTarget.checked)} /> 규모 표시</label>
          </footer>
        </div>

        <aside className="relationship-detail" aria-live="polite">
          <div className="relationship-detail-heading">
            <span>{kindLabels[selected.kind]}</span>
            <strong>{selected.label}</strong>
            {selected.description ? <p>{selected.description}</p> : null}
          </div>
          <div className="relationship-detail-kpis">
            <div><span>Base</span><strong>{compact(selected.countBase)}</strong><small>{selected.unit ? unitLabels[selected.unit] ?? selected.unit : "단위 미확인"}</small></div>
            <div><span>Low / High</span><strong>{compact(selected.countLow)} / {compact(selected.countHigh)}</strong><small>{percent(selected.shareBase)} of parent</small></div>
            <div><span>신뢰도</span><strong>{selected.grade ?? "—"} <small>{selected.confidence === null || selected.confidence === undefined ? "미산정" : Math.round(selected.confidence)}</small></strong><small>{selected.referenceYear ?? "—"}년 기준</small></div>
          </div>
          {selected.breakdown?.length ? (
            <div className="relationship-breakdown">
              <h3>주요 분포</h3>
              {selected.breakdown.slice(0, 5).map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <i><b style={{ width: `${Math.max(2, Math.min(100, Math.abs(item.value) <= 1 ? item.value * 100 : item.value))}%` }} /></i>
                  <strong>{percent(item.value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="relationship-no-data"><span>분포 데이터 미연결</span><p>등록되지 않은 분포를 임의로 생성하지 않습니다.</p></div>
          )}
          <dl className="relationship-lineage">
            <div><dt>산출 방법</dt><dd>{selected.method ?? "등록 근거 상세에서 확인"}</dd></div>
            <div><dt>관계 상태</dt><dd>{selected.kind === "subtype" && selectedAxis ? "동일 Domain 문맥 · 직접 Axis edge 미등록" : "Production registry 연결"}</dd></div>
          </dl>
          <Link className="relationship-detail-link" href={selected.href}>상세 근거 열기 <ArrowUpRight aria-hidden="true" /></Link>
        </aside>
      </div>
    </section>
  );
}
