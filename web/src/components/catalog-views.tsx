import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  asRecord,
  type DataRecord,
  description,
  entityUnit,
  formatCompact,
  formatCount,
  formatPercent,
  hrefId,
  identifier,
  label,
  nested,
  number,
  recordList,
  records,
  status,
  stringList,
  text,
  unitLabel,
} from "@/components/record";
import {
  ConfidenceBadge,
  DataUnavailable,
  EmptyState,
  EntityUnitBadge,
  EstimateMetrics,
  EvidencePanel,
  KeyValueList,
  Metric,
  methodDisplayLabel,
  NotEstimable,
  PageHeading,
  RecordCard,
  SectionHeading,
  statusDisplayLabel,
  StatusBadge,
} from "@/components/ui";
import { AddToComparisonButton } from "@/components/comparison-selection";
import { RelationshipAtlas, type RelationshipNode } from "@/components/relationship-atlas";
import { SaveCatalogSegmentButton } from "@/components/workbench-controls";

function countValue(record: DataRecord, ...keys: string[]) {
  const value = number(record, ...keys);
  return value === null ? "—" : value.toLocaleString("ko-KR");
}

const axisLabels: Record<string, string> = {
  object: "대상",
  format: "형식",
  occasion: "이용 상황",
  location: "장소",
  frequency_intensity: "빈도·강도",
  discovery: "발견 경로",
  acquisition_access: "획득·접근",
  consumption_mode: "소비 방식",
  device_channel_platform: "기기·채널·플랫폼",
  payment_monetization: "결제·수익화",
  decision_unit: "의사결정 단위",
  engagement_participation: "참여 방식",
  motivation_job: "동기·과업",
  barrier_risk_trust: "장벽·위험·신뢰",
  loyalty_switching: "충성·전환",
  spending_value: "지출·가치",
};

function axisLabel(record: DataRecord): string {
  const code = text(record, "axisCode", "axis_code", "code");
  return code ? axisLabels[code] ?? label(record) : label(record);
}

function rawValue(record: DataRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function readableKey(value: string): string {
  const labels: Record<string, string> = {
    status: "상태",
    motivation_axis: "주요 동기축",
    must_not_be_treated_as_observed: "관측 사실로 취급 금지",
    source_kind: "표본 유형",
    sourceKind: "표본 유형",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

const FRIENDLY_EVIDENCE_TEXT: Record<string, string> = {
  "Nemotron narrative is synthetic hypothesis evidence": "Nemotron 내러티브는 합성 가설 근거로만 사용",
  "official weights calibrate demographics, not domain motive prevalence": "공식 가중치는 인구통계를 보정하며 Domain 동기 분포를 직접 관측하지 않음",
  "cluster-to-market transport requires external validation": "군집 결과를 실제 시장으로 전이하려면 외부 검증 필요",
  "Synthetic narrative attributes are hypotheses, not facts about real people.": "합성 내러티브 속성은 가설이며 실제 개인에 관한 사실이 아님",
};

function friendlyEvidenceText(value: string): string {
  let friendly = value;
  for (const [source, replacement] of Object.entries(FRIENDLY_EVIDENCE_TEXT)) {
    friendly = friendly.replaceAll(source, replacement);
  }
  return /^[a-z0-9_]+$/u.test(friendly) ? statusDisplayLabel(friendly) : friendly;
}

function readableValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "string") return friendlyEvidenceText(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readableValue).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as DataRecord)
      .map(([key, item]) => `${readableKey(key)}: ${readableValue(item)}`)
      .join(" · ");
  }
  return "미확인";
}

function objectRows(record: DataRecord, ...keys: string[]) {
  const value = asRecord(rawValue(record, ...keys));
  return Object.entries(value).map(([key, item]) => ({ label: readableKey(key), value: readableValue(item) }));
}

type NarrativeItem = { title: string; meta: string | null };

function narrativeItems(record: DataRecord, ...keys: string[]): NarrativeItem[] {
  const value = rawValue(record, ...keys);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ title: item.trim(), meta: null }];
    const itemRecord = asRecord(item);
    if (!Object.keys(itemRecord).length) return [];
    const rawTitle = text(itemRecord, "label", "channel", "summary", "hypothesis", "name", "value")
      ?? readableValue(itemRecord);
    const rawMeta = text(itemRecord, "provenance", "validation", "sourceKind", "source_kind", "status");
    return [{ title: friendlyEvidenceText(rawTitle), meta: rawMeta ? friendlyEvidenceText(rawMeta) : null }];
  });
}

function NarrativePanel({ eyebrow, title, items, empty }: { eyebrow: string; title: string; items: NarrativeItem[]; empty: string }) {
  return (
    <article className="panel narrative-panel">
      <SectionHeading eyebrow={eyebrow} title={title} />
      {items.length ? (
        <ul className="narrative-list">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
            </li>
          ))}
        </ul>
      ) : <DataUnavailable message={empty} />}
    </article>
  );
}

function RepresentativePanel({ items, title = "대표 표본 맥락" }: { items: DataRecord[]; title?: string }) {
  return (
    <article className="panel representative-panel">
      <SectionHeading eyebrow="SYNTHETIC CONTEXT" title={title} description="대표 표본은 실제 개인 정보가 아니라 설명용 합성 맥락입니다." />
      {items.length ? (
        <div className="representative-list">
          {items.map((item, index) => {
            const rank = number(item, "rank");
            const distance = number(item, "distance", "similarity");
            const summary = text(item, "summary", "representativeSummary", "representative_summary") ?? "요약 미등록";
            const disclosure = text(item, "privacyDisclosure", "privacy_disclosure");
            const sourceKind = text(item, "sourceKind", "source_kind");
            return (
              <div key={`${sourceKind ?? "representative"}-${rank ?? index}`}>
                <header>
                  <strong>{sourceKind ? readableKey(sourceKind) : `대표 표본 ${rank ?? index + 1}`}</strong>
                  <small>{distance === null ? `rank ${rank ?? index + 1}` : `rank ${rank ?? index + 1} · 유사도/거리 ${distance.toFixed(3)}`}</small>
                </header>
                <p>{summary}</p>
                {disclosure ? <small>{disclosure}</small> : null}
              </div>
            );
          })}
        </div>
      ) : <DataUnavailable message="연결된 대표 표본 맥락이 없습니다." />}
    </article>
  );
}

function archetypePageHref(filters: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value?.trim()) params.set(key, value.trim());
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/archetypes?${query}` : "/archetypes";
}

export function DomainExplorer({ value }: { value: unknown }) {
  const domains = records(value, ["domains"]);
  const groups = new Map<string, DataRecord[]>();
  for (const domain of domains) {
    const unit = entityUnit(domain) ?? "unknown";
    groups.set(unit, [...(groups.get(unit) ?? []), domain]);
  }
  const featuredDomains: DataRecord[] = [];
  const featuredCodes = new Set<string>();
  const includeFeatured = (domain: DataRecord) => {
    const code = text(domain, "domainCode", "domain_code", "code") ?? identifier(domain);
    if (!code || featuredCodes.has(code) || featuredDomains.length >= 6) return;
    featuredCodes.add(code);
    featuredDomains.push(domain);
  };
  for (const unitDomains of groups.values()) {
    if (unitDomains[0]) includeFeatured(unitDomains[0]);
  }
  for (const domain of domains) includeFeatured(domain);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="LEVEL 01 / UNIVERSE"
        title="어떤 시장에서 시작할까요?"
        description="사람·가구·사업체 단위를 분리한 뒤, 실제 등록된 domain과 분류축으로 내려갑니다."
        actions={<Link href="/archetypes" className="button">Archetype 전체 검색</Link>}
      />
      {domains.length ? (
        <section className="atlas-universe" aria-label="Domain universe">
          <div className="universe-orbit">
            <div className="universe-center">
              <span>PRODUCTION BASELINE</span>
              <strong>대한민국 시장</strong>
              <p>{domains.length.toLocaleString("ko-KR")}개 domain</p>
              <small>{groups.size.toLocaleString("ko-KR")}개 entity unit으로 분리</small>
            </div>
            <nav className="universe-featured-domains" aria-label="대표 Domain 바로가기">
              {featuredDomains.map((domain, index) => {
                const code = text(domain, "domainCode", "domain_code", "code") ?? identifier(domain);
                if (!code) return null;
                return (
                  <Link className="universe-domain-node" data-orbit-position={index + 1} href={`/explore/${encodeURIComponent(code)}`} key={code}>
                    <span>
                      <strong>{label(domain)}</strong>
                      <small>BASE {formatCount(number(domain, "countBase", "count_base"), entityUnit(domain))}</small>
                    </span>
                    <EntityUnitBadge unit={entityUnit(domain)} />
                    <ArrowRight aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="universe-registry">
            <header className="universe-registry-heading">
              <div><span>FULL DOMAIN REGISTRY</span><strong>단위별 전체 시장 지도</strong></div>
              <small>대표 바로가기 6개 · 전체 {domains.length.toLocaleString("ko-KR")}개</small>
            </header>
            <div className="universe-groups">
              {[...groups.entries()].map(([unit, unitDomains]) => (
                <section className="universe-group" key={unit}>
                  <header>
                    <EntityUnitBadge unit={unit} />
                    <span>{unitDomains.length.toLocaleString("ko-KR")}개 domain</span>
                  </header>
                  <div className="universe-domain-list domain-market-list">
                    {unitDomains.map((domain) => {
                      const code = text(domain, "domainCode", "domain_code", "code") ?? identifier(domain);
                      if (!code) return null;
                      const updatedAt = text(domain, "updatedAt", "updated_at");
                      return (
                        <Link href={`/explore/${encodeURIComponent(code)}`} key={code}>
                          <span>
                            <strong>{label(domain)}</strong>
                            <small>{description(domain) ?? "정의 미등록"}</small>
                            <span className="domain-market-value">{formatCompact(number(domain, "countBase", "count_base"))} {entityUnit(domain) ? unitLabel(entityUnit(domain)) : ""}</span>
                            <small>Low {formatCompact(number(domain, "countLow", "count_low"))} · High {formatCompact(number(domain, "countHigh", "count_high"))}</small>
                            <small>분류축 {countValue(domain, "axisCount", "axis_count")} · Subtype {countValue(domain, "primarySubtypeCount", "primary_subtype_count")} · Archetype {countValue(domain, "reusableArchetypeCount", "reusable_archetype_count")}</small>
                            <small>{text(domain, "referenceYear", "reference_year") ?? "기준연도 미확인"}년 · 등급 {text(domain, "estimateGrade", "estimate_grade") ?? "미산정"} · 신뢰도 {Math.round(number(domain, "confidenceScore", "confidence_score") ?? 0)}</small>
                            <small>관련 지출 · 근거 미등록</small>
                            <small>최근 갱신 {updatedAt ? updatedAt.slice(0, 10) : "미확인"}</small>
                          </span>
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          title="탐색할 domain이 없습니다"
          description="Production PostgreSQL의 domain registry 연결과 활성 상태를 확인하세요."
          action={<Link className="button" href="/governance">데이터 상태 확인</Link>}
        />
      )}
    </div>
  );
}

export function DomainOverview({ value, archetypesValue }: { value: unknown; archetypesValue?: unknown }) {
  const domain = asRecord(value);
  const axes = recordList(domain, "axes", "dimensions", "segmentationAxes", "segmentation_axes");
  const subtypes = recordList(domain, "subtypes", "primarySubtypes", "primary_subtypes");
  const archetypes = records(archetypesValue, ["archetypes"]);
  const domainCode = text(domain, "domainCode", "domain_code", "code") ?? identifier(domain) ?? "";
  const metrics = nested(domain, "metrics", "counts", "summary");
  const unit = entityUnit(domain);
  const base = number(domain, "countBase", "count_base", "baseCount", "base_count");
  const relationshipBreakdown = (record: DataRecord, ...keys: string[]) => keys.flatMap((key) => recordList(record, key)).flatMap((item) => {
    const value = number(item, "value", "shareBase", "share_base");
    return value === null ? [] : [{ label: label(item), value }];
  });
  const relationshipDomain: RelationshipNode = {
    id: domainCode,
    label: label(domain),
    description: description(domain),
    kind: "domain",
    href: `/explore/${encodeURIComponent(domainCode)}`,
    unit,
    countLow: number(domain, "countLow", "count_low"),
    countBase: base,
    countHigh: number(domain, "countHigh", "count_high"),
    shareBase: number(domain, "shareBase", "share_base"),
    confidence: number(domain, "confidenceScore", "confidence_score"),
    grade: text(domain, "estimateGrade", "estimate_grade"),
    referenceYear: text(domain, "referenceYear", "reference_year"),
    method: methodDisplayLabel(text(domain, "methodCode", "method_code", "calibrationMethod", "calibration_method")),
    breakdown: relationshipBreakdown(domain, "geographyDistribution", "geography_distribution"),
  };
  const relationshipAxes: RelationshipNode[] = axes.flatMap((axis) => {
    const id = text(axis, "axisCode", "axis_code", "code") ?? identifier(axis);
    if (!id) return [];
    return [{
      id,
      label: axisLabel(axis),
      description: description(axis),
      kind: "axis" as const,
      href: `/explore/${encodeURIComponent(domainCode)}/axes/${encodeURIComponent(id)}`,
      unit,
      countLow: null,
      countBase: number(axis, "parentPopulation", "parent_population"),
      countHigh: null,
      confidence: number(axis, "confidenceScore", "confidence_score"),
      grade: text(axis, "confidenceGrade", "confidence_grade"),
      referenceYear: text(axis, "referenceYear", "reference_year"),
      method: "Calibration 가중 분포",
      breakdown: relationshipBreakdown(axis, "distribution"),
    }];
  });
  const relationshipSubtypes: RelationshipNode[] = subtypes.flatMap((subtype) => {
    const id = hrefId(subtype, ["subtypeId", "subtype_id"]);
    if (!id) return [];
    return [{
      id,
      label: label(subtype),
      description: description(subtype),
      kind: "subtype" as const,
      href: `/segments/subtypes/${encodeURIComponent(id)}`,
      unit: entityUnit(subtype),
      countLow: number(subtype, "countLow", "count_low"),
      countBase: number(subtype, "countBase", "count_base"),
      countHigh: number(subtype, "countHigh", "count_high"),
      shareBase: number(subtype, "shareBase", "share_base", "domainShareBase", "domain_share_base"),
      confidence: number(subtype, "confidenceScore", "confidence_score"),
      grade: text(subtype, "estimateGrade", "estimate_grade", "confidenceGrade", "confidence_grade"),
      referenceYear: text(subtype, "referenceYear", "reference_year"),
      method: methodDisplayLabel(text(subtype, "uncertaintyMethod", "uncertainty_method", "methodCode", "method_code")),
    }];
  });
  const relationshipArchetypes: RelationshipNode[] = archetypes.flatMap((archetype) => {
    const id = hrefId(archetype, ["archetypeId", "archetype_id"]);
    if (!id) return [];
    return [{
      id,
      label: label(archetype),
      description: description(archetype),
      kind: "archetype" as const,
      href: `/archetypes/${encodeURIComponent(id)}`,
      unit: entityUnit(archetype),
      countLow: number(archetype, "countLow", "count_low"),
      countBase: number(archetype, "countBase", "count_base"),
      countHigh: number(archetype, "countHigh", "count_high"),
      shareBase: number(archetype, "shareBase", "share_base"),
      confidence: number(archetype, "confidenceScore", "confidence_score"),
      grade: text(archetype, "confidenceGrade", "confidence_grade"),
      referenceYear: text(archetype, "referenceYear", "reference_year"),
      method: methodDisplayLabel(text(archetype, "calibrationMethod", "calibration_method", "methodCode", "method_code")),
      linkedSubtypeIds: stringList(archetype, "relatedSubtypeIds", "related_subtype_ids"),
    }];
  });

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="LEVEL 02 / DOMAIN"
        title={label(domain)}
        description={description(domain)}
        actions={
          <div className="inline-actions">
            <EntityUnitBadge unit={unit} />
            <StatusBadge value={status(domain)} />
          </div>
        }
      />
      <div className="metric-strip domain-metric-strip">
        <Metric label="기준 모집단" value={formatCount(base, unit)} note={base === null ? "모집단 수치 근거가 연결되지 않았습니다." : undefined} />
        <Metric label="Low / High" value={`${formatCompact(number(domain, "countLow", "count_low"))} / ${formatCompact(number(domain, "countHigh", "count_high"))}`} />
        <Metric label="참여 비중" value={formatPercent(number(domain, "shareBase", "share_base"))} note={`${text(domain, "referenceYear", "reference_year") ?? "—"}년 · ${text(domain, "geographyScope", "geography_scope") ?? "대한민국"}`} />
        <Metric label="분류축" value={countValue(metrics, "axisCount", "axis_count") === "—" ? axes.length.toLocaleString("ko-KR") : countValue(metrics, "axisCount", "axis_count")} />
        <Metric label="Domain Primary Subtype" value={countValue(domain, "primarySubtypeCount", "primary_subtype_count")} />
        <Metric label="Archetype" value={countValue(domain, "reusableArchetypeCount", "reusable_archetype_count")} />
        <Metric label="Feature" value={countValue(domain, "featureCount", "feature_count")} />
        <Metric label="Behavior" value={countValue(domain, "behaviorCount", "behavior_count")} />
        <Metric label="관련 지출" value="근거 미등록" note="같은 Domain 분모의 지출 관측이 연결되지 않았습니다." />
      </div>
      <RelationshipAtlas
        domain={relationshipDomain}
        axes={relationshipAxes}
        subtypes={relationshipSubtypes}
        archetypes={relationshipArchetypes}
      />
      <div className="dashboard-grid domain-evidence-grid">
        <DistributionPanel title="지역별 시장 분포" value={domain} keys={["geographyDistribution", "geography_distribution"]} />
        <ConfidencePanel value={domain} />
      </div>
      <section>
        <SectionHeading
          eyebrow="SEGMENTATION LENS"
          title="어떤 기준으로 나눠볼까요?"
          description="DB에 실제 연결된 분류축만 표시합니다."
        />
        {axes.length ? (
          <div className="axis-grid">
            {axes.map((axis, index) => {
              const axisCode = text(axis, "axisCode", "axis_code", "code") ?? identifier(axis);
              if (!axisCode) return null;
              const allowed = stringList(axis, "allowedValues", "allowed_values", "allowedValuesJson", "allowed_values_json");
              const distribution = recordList(axis, "distribution");
              const linkedSubtypeCount = number(axis, "subtypeCount", "subtype_count");
              return (
                <Link href={`/explore/${encodeURIComponent(domainCode)}/axes/${encodeURIComponent(axisCode)}`} className="axis-card" key={axisCode}>
                  <header>
                    <span>분류축 {String(index + 1).padStart(2, "0")}</span>
                    <ArrowRight aria-hidden="true" />
                  </header>
                  <h2>{axisLabel(axis)}</h2>
                  <p>{description(axis) ?? "정의가 등록되지 않았습니다."}</p>
                  <div className="axis-value-preview">
                    {(distribution.length ? distribution : allowed.map((item) => ({ label: item }))).slice(0, 4).map((item, itemIndex) => {
                      const itemRecord = asRecord(item);
                      const itemLabel = typeof item === "string" ? item : label(itemRecord);
                      const share = typeof item === "string" ? null : number(itemRecord, "shareBase", "share_base");
                      return <span key={`${itemLabel}-${itemIndex}`}>{itemLabel}{share === null ? "" : ` ${formatPercent(share)}`}</span>;
                    })}
                    {(distribution.length || allowed.length) > 4 ? <span>+{(distribution.length || allowed.length) - 4}</span> : null}
                  </div>
                  <footer>
                    <span>{linkedSubtypeCount === null ? "직접 연결 미등록" : `직접 연결 ${linkedSubtypeCount.toLocaleString("ko-KR")} subtype`}</span>
                    <ConfidenceBadge record={axis} />
                  </footer>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="연결된 분류축이 없습니다" description="해당 domain의 taxonomy와 dimension 관계를 확인하세요." />
        )}
      </section>
      <section>
        <SectionHeading
          eyebrow="PRIMARY SUBTYPES"
          title="도메인 대표 세그먼트"
          description="Axis 직접 관계와 구분해, 이 Domain에 등록된 Primary Subtype 전체를 표시합니다."
        />
        {subtypes.length ? (
          <div className="dashboard-grid">
            {subtypes.map((subtype) => {
              const subtypeId = hrefId(subtype, ["subtypeId", "subtype_id"]);
              return subtypeId
                ? <RecordCard
                    record={subtype}
                    href={`/segments/subtypes/${encodeURIComponent(subtypeId)}`}
                    key={subtypeId}
                    kicker="PRIMARY SUBTYPE"
                    footer={<span className="record-card-evidence-status"><ConfidenceBadge record={subtype} /><small>추세·지출·미니 분포 근거 미등록</small></span>}
                  />
                : null;
            })}
          </div>
        ) : <EmptyState title="등록된 Primary Subtype이 없습니다" description="도메인 분류 모델과 Production Data Mart 연결을 확인하세요." />}
      </section>
      <EvidencePanel record={domain} />
    </div>
  );
}

export function AxisOverview({ axisValue, subtypeValue, domainCode }: { axisValue: unknown; subtypeValue: unknown; domainCode: string }) {
  const axis = asRecord(axisValue);
  const subtypes = records(subtypeValue, ["subtypes"]);
  const allowed = stringList(axis, "allowedValues", "allowed_values", "allowedValuesJson", "allowed_values_json");
  const linkedSubtypeCount = number(axis, "subtypeCount", "subtype_count");
  const domainSubtypeCount = number(axis, "domainSubtypeCount", "domain_subtype_count");
  const distribution = recordList(axis, "distribution");
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="LEVEL 03 / SEGMENTATION AXIS"
        title={axisLabel(axis)}
        description={description(axis)}
        actions={<StatusBadge value={status(axis)} />}
      />
      <div className="split-summary">
        <article className="panel">
          <SectionHeading eyebrow="ALLOWED VALUES" title="분류값" />
          {allowed.length ? <div className="definition-tags">{allowed.map((item) => <span key={item}>{item}</span>)}</div> : <DataUnavailable message="등록된 분류값이 없습니다." />}
        </article>
        <article className="panel">
          <SectionHeading eyebrow="MODEL CONTEXT" title="연결 정보" />
          <KeyValueList rows={[
            { label: "Domain", value: domainCode },
            { label: "Model version", value: text(axis, "modelVersion", "model_version", "version") ?? "미확인" },
            { label: "직접 연결 Subtype", value: linkedSubtypeCount === null ? "직접 연결 미등록" : linkedSubtypeCount.toLocaleString("ko-KR") },
            { label: "Domain 전체 Primary Subtype", value: domainSubtypeCount === null ? "미확인" : domainSubtypeCount.toLocaleString("ko-KR") },
            { label: "Parent Population", value: formatCount(number(axis, "parentPopulation", "parent_population"), entityUnit(axis)) },
            { label: "추정 등급", value: text(axis, "confidenceGrade", "confidence_grade") ?? "미산정" },
            { label: "기준연도", value: text(axis, "referenceYear", "reference_year") ?? "미확인" },
          ]} />
        </article>
      </div>
      <DistributionPanel title="실제 보정 분포" value={{ distribution }} keys={["distribution"]} />
      <section>
        <SectionHeading eyebrow="MARKET GROUPS" title="Subtype 연결 근거" description="현재 registry는 domain별 axis 정의까지만 보유하며 subtype↔axis 직접 edge는 보유하지 않습니다." />
        {subtypes.length ? (
          <div className="record-grid record-grid-four">
            {subtypes.map((subtype) => {
              const id = hrefId(subtype, ["subtypeId", "subtype_id"]);
              return id ? <RecordCard record={subtype} href={`/segments/subtypes/${encodeURIComponent(id)}`} key={id} kicker="PRIMARY SUBTYPE" /> : null;
            })}
          </div>
        ) : (
          <NotEstimable title="Axis별 subtype 관계 미등록" description="같은 domain에 속한다는 이유만으로 모든 subtype을 이 axis에 연결하지 않았습니다. 직접 관계와 provenance가 적재되기 전까지 결과를 산출하지 않습니다." />
        )}
      </section>
    </div>
  );
}

export function DistributionPanel({ title, value, keys }: { title: string; value: DataRecord; keys: string[] }) {
  const rows = keys.flatMap((key) => recordList(value, key));
  const entries = rows.flatMap((row) => {
    const valueNumber = number(row, "value", "share", "shareBase", "share_base", "percentage", "base", "prevalenceBase", "prevalence_base");
    const low = number(row, "low", "shareLow", "share_low", "valueLow", "value_low", "prevalenceLow", "prevalence_low");
    const high = number(row, "high", "shareHigh", "share_high", "valueHigh", "value_high", "prevalenceHigh", "prevalence_high");
    return valueNumber === null ? [] : [{ row, valueNumber, low, high }];
  });
  if (!entries.length) {
    return (
      <article className="panel chart-panel">
        <SectionHeading title={title} />
        <NotEstimable compact title="분포 데이터 없음" description="이 차트에 필요한 관측 또는 추정 분포가 연결되지 않았습니다." />
      </article>
    );
  }
  const maximum = Math.max(...entries.map((entry) => entry.valueNumber), 1);
  return (
    <article className="panel chart-panel">
      <SectionHeading title={title} />
      <div className="distribution-bars">
        {entries.map(({ row, valueNumber, low, high }, index) => {
          const width = Math.max(0, Math.min(100, (valueNumber / maximum) * 100));
          const provenance = text(row, "provenance", "methodCode", "method_code");
          const warning = text(row, "nonAdditiveWarning", "non_additive_warning");
          return (
            <div className="distribution-row" key={`${label(row)}-${index}`}>
              <span>
                <b>{label(row)}</b>
                {low !== null || high !== null ? <small>Low {formatPercent(low)} · High {formatPercent(high)}</small> : null}
                {provenance ? <small>{/^[a-z0-9_]+$/u.test(provenance) ? methodDisplayLabel(provenance) : provenance}</small> : null}
                {warning ? <small>{warning}</small> : null}
              </span>
              <i aria-hidden="true"><b style={{ "--bar-width": `${width}%` } as CSSProperties} /></i>
              <strong>{formatPercent(valueNumber)}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function ConfidencePanel({ value }: { value: DataRecord }) {
  const confidence = nested(value, "confidence", "confidenceComponents", "confidence_components");
  const dimensions: Array<[string, string[]]> = [
    ["모집단", ["populationConfidenceScore", "population_confidence_score"]],
    ["해석", ["interpretationConfidenceScore", "interpretation_confidence_score"]],
    ["타깃 가능성", ["targetabilityConfidenceScore", "targetability_confidence_score"]],
    ["출처 품질", ["sourceQuality", "source_quality", "sourceQualityScore", "source_quality_score"]],
    ["최신성", ["recency"]],
    ["정의 일치", ["definitionMatch", "definition_match"]],
    ["지역 일치", ["geographyMatch", "geography_match"]],
    ["직접 관측", ["directObservation", "direct_observation"]],
    ["Calibration 적합", ["calibrationFit", "calibration_fit"]],
    ["Mapping Coverage", ["mappingCoverage", "mapping_coverage"]],
    ["Effective Sample Size", ["effectiveSampleSizeScore", "effective_sample_size_score"]],
    ["의존성 위험", ["dependencyRiskScore", "dependency_risk_score"]],
    ["Proxy 보존", ["proxyRetentionScore", "proxy_retention_score"]],
    ["모델 안정성", ["modelStability", "model_stability", "stabilityComponentScore", "stability_component_score"]],
  ];
  const present = dimensions.flatMap(([name, keys]) => {
    const score = number(confidence, ...keys) ?? number(value, ...keys);
    return score === null ? [] : [{ name, score }];
  });
  return (
    <article className="panel confidence-panel">
      <SectionHeading eyebrow="RULE-BASED CONFIDENCE" title="신뢰도 구성" />
      {present.length ? (
        <div className="confidence-grid">
          {present.map((item) => (
            <div key={item.name}>
              <span>{item.name}</span>
              <strong>{Math.round(item.score)}</strong>
              <i aria-hidden="true"><b style={{ "--bar-width": `${Math.max(0, Math.min(100, item.score))}%` } as CSSProperties} /></i>
            </div>
          ))}
        </div>
      ) : (
        <DataUnavailable message="신뢰도 구성요소가 연결되지 않았습니다." />
      )}
    </article>
  );
}

export function SubtypeProfile({ value }: { value: unknown }) {
  const subtype = asRecord(value);
  const subtypeId = text(subtype, "subtypeId", "subtype_id", "id") ?? "";
  const labelStatus = text(subtype, "labelStatus", "label_status");
  const evidenceBoundary = text(subtype, "evidenceBoundary", "evidence_boundary");
  const allocations = recordList(subtype, "allocations", "archetypes", "linkedArchetypes", "linked_archetypes");
  const representatives = recordList(subtype, "representatives");
  const activation = nested(subtype, "activation", "activationProfile", "activation_profile", "activationPayload", "activation_payload");
  const gaps = stringList(subtype, "gaps", "gapsJson", "gaps_json", "confidenceGaps", "confidence_gaps", "validationGaps", "validation_gaps");
  const assumptions = stringList(subtype, "assumptions", "assumptionsJson", "assumptions_json");
  const inferredProfileRows = objectRows(subtype, "inferredProfile", "inferred_profile");
  const jobs = narrativeItems(subtype, "jobsToBeDone", "jobs_to_be_done");
  const triggers = narrativeItems(subtype, "triggers");
  const barriers = narrativeItems(subtype, "barriers");
  const engagementModes = narrativeItems(subtype, "engagementModes", "engagement_modes");
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="LEVEL 04 / SEGMENT PROFILE"
        title={label(subtype)}
        description={description(subtype)}
        actions={
          <div className="inline-actions">
            <AddToComparisonButton item={{ id: subtypeId, label: label(subtype), kind: "subtype" }} />
            <Link className="button button-primary" href={`/builder?condition=${encodeURIComponent(`subtype:${subtypeId}`)}`}>빌더에서 정의</Link>
          </div>
        }
      />
      <div className="inline-badges">
        <EntityUnitBadge unit={entityUnit(subtype)} />
        <StatusBadge value={status(subtype)} />
        <ConfidenceBadge record={subtype} />
      </div>
      {labelStatus || evidenceBoundary ? (
        <div className="notice-banner">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>{labelStatus ? `Subtype 라벨 상태 · ${statusDisplayLabel(labelStatus)}` : "Subtype 근거 경계"}</strong>
            {evidenceBoundary ? <p>{friendlyEvidenceText(evidenceBoundary)}</p> : null}
          </div>
        </div>
      ) : null}
      <EstimateMetrics record={subtype} />
      <div className="dashboard-grid">
        <DistributionPanel title="연령별 분포" value={subtype} keys={["ageDistribution", "age_distribution"]} />
        <DistributionPanel title="Parent Domain 지역 분포" value={subtype} keys={["regionDistribution", "region_distribution"]} />
        <DistributionPanel title="행동·동기 태그 분포" value={subtype} keys={["tags"]} />
        <DistributionPanel title="가구 구성 분포" value={subtype} keys={["householdDistribution", "household_distribution"]} />
        <DistributionPanel title="직업 분포" value={subtype} keys={["occupationDistribution", "occupation_distribution"]} />
        <DistributionPanel title="소득 분포" value={subtype} keys={["incomeDistribution", "income_distribution"]} />
        <DistributionPanel title="사업체 규모 분포" value={subtype} keys={["businessSizeDistribution", "business_size_distribution", "establishmentSizeDistribution", "establishment_size_distribution"]} />
        <DistributionPanel title="결제 방식 분포" value={subtype} keys={["paymentDistribution", "payment_distribution"]} />
        <DistributionPanel title="탐색 경로 분포" value={subtype} keys={["discoveryDistribution", "discovery_distribution"]} />
        <DistributionPanel title="구매 결정자 분포" value={subtype} keys={["decisionMakerDistribution", "decision_maker_distribution"]} />
        <DistributionPanel title="Feature 분포" value={subtype} keys={["featureDistribution", "feature_distribution"]} />
        <DistributionPanel title="Behavior 분포" value={subtype} keys={["behaviorDistribution", "behavior_distribution"]} />
      </div>
      <div className="detail-grid">
        <ConfidencePanel value={subtype} />
        <article className="panel">
          <SectionHeading eyebrow="ASSUMPTIONS & GAPS" title="가정과 추가 검증" />
          {assumptions.length || gaps.length ? (
            <div className="assumption-columns">
              <div><h3>적용 가정</h3>{assumptions.length ? <ul>{assumptions.map((item) => <li key={item}>{friendlyEvidenceText(item)}</li>)}</ul> : <p>등록된 가정 없음</p>}</div>
              <div><h3>검증 필요</h3>{gaps.length ? <ul>{gaps.map((item) => <li key={item}>{friendlyEvidenceText(item)}</li>)}</ul> : <p>등록된 gap 없음</p>}</div>
            </div>
          ) : <NotEstimable compact title="가정·gap 정보 없음" description="모델 해석 전 검증 항목 연결이 필요합니다." />}
        </article>
      </div>
      <section>
        <SectionHeading eyebrow="INTERPRETATION LAYER" title="해석 가능한 가설 맥락" description="아래 내용은 모델 해석 또는 합성 가설이며 관측 사실로 취급하지 않습니다." />
        <div className="dashboard-grid narrative-grid">
          <article className="panel narrative-panel">
            <SectionHeading eyebrow="INFERRED PROFILE" title="추론 프로필" />
            {inferredProfileRows.length ? <KeyValueList rows={inferredProfileRows} /> : <DataUnavailable message="추론 프로필이 연결되지 않았습니다." />}
          </article>
          <NarrativePanel eyebrow="JOBS TO BE DONE" title="고객 과업" items={jobs} empty="등록된 고객 과업 가설이 없습니다." />
          <NarrativePanel eyebrow="TRIGGERS" title="상황 Trigger" items={triggers} empty="등록된 trigger 가설이 없습니다." />
          <NarrativePanel eyebrow="BARRIERS" title="주요 장벽" items={barriers} empty="등록된 장벽 가설이 없습니다." />
          <NarrativePanel eyebrow="ENGAGEMENT" title="참여·운영 방식" items={engagementModes} empty="등록된 참여 방식 가설이 없습니다." />
          <RepresentativePanel items={representatives} />
        </div>
      </section>
      <section>
        <SectionHeading eyebrow="PARENT ALLOCATION CONTEXT" title="연결된 Archetype과 배분 구간" description="Subtype 단독 모집단이 아니라 각 parent Archetype 안에서 등록된 Low/Base/High 배분입니다." />
        {allocations.length ? (
          <div className="record-grid">
            {allocations.map((item) => {
              const id = hrefId(item, ["archetypeId", "archetype_id"]);
              return id ? <RecordCard key={id} record={item} href={`/archetypes/${encodeURIComponent(id)}`} kicker="PARENT ARCHETYPE ALLOCATION" /> : null;
            })}
          </div>
        ) : <EmptyState title="연결된 Archetype이 없습니다" description="대표 유형이 없을 때 가상 페르소나를 생성하지 않습니다." />}
      </section>
      <div className="detail-grid">
        <article className="panel activation-panel">
          <SectionHeading eyebrow="ACTIVATION" title="Activation profile" />
          {Object.keys(activation).length ? (
            <KeyValueList rows={[
              { label: "타깃 가능성", value: statusDisplayLabel(text(activation, "targetabilityClass", "targetability_class")) },
              { label: "플랫폼 claim", value: statusDisplayLabel(text(activation, "platformClaimStatus", "platform_claim_status")) },
              { label: "측정 설계", value: statusDisplayLabel(text(nested(activation, "measurement"), "primary", "design")) },
            ]} />
          ) : <DataUnavailable message="Activation JSON이 연결되지 않았습니다." />}
          {Object.keys(activation).length ? <p className="muted">원본 Activation JSON은 데이터 및 출처 관리에서 감사할 수 있습니다.</p> : null}
        </article>
        <EvidencePanel record={allocations[0] ?? subtype} />
      </div>
      <section>
        <SectionHeading eyebrow="EVIDENCE GAPS" title="아직 산출되지 않은 시장 지표" description="근거가 없는 값은 0이나 임의 수치로 대체하지 않습니다." />
        <div className="dashboard-grid evidence-gap-grid">
          <article className="panel"><NotEstimable compact title="트렌드 근거 부족" description="동일 분모의 시계열 관측이 연결되지 않아 증감 추세를 산출하지 않았습니다." /></article>
          <article className="panel"><NotEstimable compact title="지출 근거 부족" description="이 subtype과 같은 분모의 연간 지출 분포가 연결되지 않았습니다." /></article>
          <article className="panel"><NotEstimable compact title="TAM / SAM / SOM 근거 부족" description="제품 경계, 서비스 가능 비율, 획득 가정이 없는 상태에서는 시장 가치를 산출하지 않습니다." /></article>
        </div>
      </section>
    </div>
  );
}

export function ArchetypeDirectory({ value, filters }: { value: unknown; filters: Record<string, string | undefined> }) {
  const metadata = asRecord(value);
  const archetypes = records(value, ["archetypes"]);
  const page = Math.max(1, number(metadata, "page") ?? 1);
  const pageSize = Math.max(1, number(metadata, "pageSize", "page_size") ?? 50);
  const registryTotal = number(metadata, "registryTotal", "registry_total");
  const hasNext = metadata.hasNext === true || metadata.has_next === true;
  const firstResult = (page - 1) * pageSize + (archetypes.length ? 1 : 0);
  const lastResult = (page - 1) * pageSize + archetypes.length;
  return (
    <div className="page-stack">
      <PageHeading eyebrow="ARCHETYPE EXPLORER" title="대표 유형 탐색" description="합성 archetype은 실제 개인이 아니라 세그먼트를 설명하는 가설적 대표 유형입니다." />
      <form className="filter-bar filter-bar-advanced" method="get">
        <label className="filter-query"><span>자연어 검색</span><div className="input-with-icon"><Search aria-hidden="true" /><input name="q" defaultValue={filters.q} placeholder="행동, 상황 또는 정의" /></div></label>
        <label><span>Domain</span><input name="domain" defaultValue={filters.domain} placeholder="domain code" /></label>
        <label><span>Subtype</span><input name="subtype" defaultValue={filters.subtype} placeholder="subtype id" /></label>
        <label><span>분류축</span><input name="axis" defaultValue={filters.axis} disabled placeholder="직접 연결 근거 미등록" title="Subtype·Archetype과 axis의 직접 edge가 없어 사용할 수 없습니다." /></label>
        <label><span>Feature 키워드 proxy</span><input name="feature" defaultValue={filters.feature} placeholder="특성 또는 값" /></label>
        <label><span>Behavior 키워드 proxy</span><input name="behavior" defaultValue={filters.behavior} placeholder="행동 또는 태그" /></label>
        <label><span>Rule 연령·대표자 연령</span><input name="age" inputMode="numeric" defaultValue={filters.age} placeholder="예: 60-69 또는 60+" title="구조화 age 범위 또는 Archetype rule의 age/owner_age 조건을 검색합니다." /></label>
        <label><span>지역 키워드 proxy</span><input name="region" defaultValue={filters.region} placeholder="예: 수도권" /></label>
        <label><span>가구 특성 키워드 proxy</span><input name="household" defaultValue={filters.household} placeholder="가구 구성 또는 상황" /></label>
        <label><span>직업 키워드 proxy</span><input name="occupation" defaultValue={filters.occupation} placeholder="직업 또는 역할" /></label>
        <label><span>소득 키워드 proxy</span><input name="income" defaultValue={filters.income} placeholder="소득 또는 지출 여력" /></label>
        <label><span>사업체 속성 proxy</span><input name="business" defaultValue={filters.business} placeholder="업종, 웹사이트, 규모" /></label>
        <label><span>Estimate Grade</span><select name="estimateGrade" defaultValue={filters.estimateGrade ?? ""}><option value="">전체 등급</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="E">E</option></select></label>
        <label><span>최소 Confidence</span><input name="minConfidence" type="number" min="0" max="100" step="1" defaultValue={filters.minConfidence} placeholder="0–100" /></label>
        <label><span>단위</span><select name="unit" defaultValue={filters.unit ?? ""}><option value="">전체 단위</option><option value="person">사람</option><option value="child_person">아동·청소년</option><option value="household">가구</option><option value="establishment">사업체</option><option value="enterprise">기업</option></select></label>
        <label><span>정렬</span><select name="sort" defaultValue={filters.sort ?? "name"}><option value="name">이름순</option><option value="count">규모순</option><option value="confidence">신뢰도순</option><option value="updated">최근 갱신순</option></select></label>
        <div className="filter-actions"><Link className="button button-quiet" href="/archetypes">초기화</Link><button className="button button-primary" type="submit"><SlidersHorizontal aria-hidden="true" /> 필터 적용</button></div>
      </form>
      <div className="directory-summary">
        <span>{registryTotal != null ? `전체 Registry ${registryTotal.toLocaleString("ko-KR")}개 · ` : ""}페이지 {page.toLocaleString("ko-KR")} · {archetypes.length ? `${firstResult.toLocaleString("ko-KR")}–${lastResult.toLocaleString("ko-KR")}번째 결과` : "표시할 결과 없음"}</span>
        <strong>{archetypes.length.toLocaleString("ko-KR")}건 표시{hasNext ? " · 다음 결과 있음" : ""}</strong>
      </div>
      {archetypes.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">Archetype 검색 결과</caption>
            <thead><tr><th>Archetype</th><th>단위</th><th>상태</th><th>BASE</th><th>신뢰도</th><th>작업</th></tr></thead>
            <tbody>
              {archetypes.map((item, index) => {
                const id = hrefId(item, ["archetypeId", "archetype_id"]);
                if (!id) return null;
                const base = number(item, "countBase", "count_base", "base");
                return (
                  <tr className="content-virtualized-row" data-result-index={(page - 1) * pageSize + index + 1} key={id}>
                    <td><Link href={`/archetypes/${encodeURIComponent(id)}`}><strong>{label(item)}</strong><small>{id}</small></Link></td>
                    <td><EntityUnitBadge unit={entityUnit(item)} /></td>
                    <td><StatusBadge value={status(item)} /></td>
                    <td className="numeric">{formatCount(base, entityUnit(item))}</td>
                    <td><ConfidenceBadge record={item} /></td>
                    <td><div className="directory-row-actions"><AddToComparisonButton item={{ id, label: label(item), kind: "archetype" }} />{entityUnit(item) ? <SaveCatalogSegmentButton catalogId={`archetype:${id}`} sourceKind="archetype" label={label(item)} entityUnit={entityUnit(item) ?? "person"} /> : null}<Link className="button button-primary" href={`/builder?condition=${encodeURIComponent(`archetype:${id}`)}`}>빌더</Link><Link className="icon-link" href={`/archetypes/${encodeURIComponent(id)}`} aria-label={`${label(item)} 상세`}><ArrowRight aria-hidden="true" /></Link></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="조건에 맞는 Archetype이 없습니다" description="필터를 완화하거나 분류체계 연결 상태를 확인하세요." />}
      {page > 1 || hasNext ? (
        <nav className="directory-pagination" aria-label="Archetype 결과 페이지">
          {page > 1 ? <Link className="button" rel="prev" href={archetypePageHref(filters, page - 1)}>이전 페이지</Link> : <span className="button" aria-disabled="true">이전 페이지</span>}
          <strong>페이지 {page.toLocaleString("ko-KR")}</strong>
          {hasNext ? <Link className="button button-primary" rel="next" href={archetypePageHref(filters, page + 1)}>다음 페이지</Link> : <span className="button" aria-disabled="true">다음 페이지</span>}
        </nav>
      ) : null}
    </div>
  );
}

export function ArchetypeProfile({ value }: { value: unknown }) {
  const archetype = asRecord(value);
  const archetypeId = text(archetype, "archetypeId", "archetype_id", "id") ?? "";
  const subtypeLinks = recordList(archetype, "subtypeLinks", "subtype_links");
  const modelLinks = [...new Map(subtypeLinks.flatMap((link) => {
    const modelId = text(link, "segmentationModelId", "segmentation_model_id");
    return modelId ? [[modelId, link] as const] : [];
  })).entries()];
  const traits = stringList(archetype, "traits", "observableTraits", "observable_traits");
  const inferredNeeds = narrativeItems(archetype, "inferredNeeds", "inferred_needs");
  const triggers = narrativeItems(archetype, "triggers");
  const objections = narrativeItems(archetype, "objections");
  const channels = narrativeItems(archetype, "channels");
  const representatives = recordList(archetype, "representatives");
  const inferenceDisclosure = text(archetype, "inferenceDisclosure", "inference_disclosure");
  const caveats = stringList(archetype, "caveats", "warnings", "overlapNotes", "overlap_notes");
  const marketContexts = recordList(archetype, "marketContexts", "market_contexts");
  return (
    <div className="page-stack">
      <PageHeading eyebrow="ARCHETYPE PROFILE" title={label(archetype)} description={description(archetype)} actions={<div className="inline-actions"><EntityUnitBadge unit={entityUnit(archetype)} />{archetypeId ? <AddToComparisonButton item={{ id: archetypeId, label: label(archetype), kind: "archetype" }} /> : null}{archetypeId && entityUnit(archetype) ? <SaveCatalogSegmentButton catalogId={`archetype:${archetypeId}`} sourceKind="archetype" label={label(archetype)} entityUnit={entityUnit(archetype) ?? "person"} /> : null}{archetypeId ? <Link className="button button-primary" href={`/builder?condition=${encodeURIComponent(`archetype:${archetypeId}`)}`}>빌더에서 정의</Link> : null}</div>} />
      <div className="notice-banner"><ShieldCheck aria-hidden="true" /><div><strong>합성 대표 유형</strong><p>{inferenceDisclosure ? friendlyEvidenceText(inferenceDisclosure) : "실재 개인에 대한 사실 또는 결정적 라벨로 사용하지 마세요."}</p></div></div>
      <EstimateMetrics record={archetype} />
      <section>
        <SectionHeading eyebrow="DOMAIN CONTEXT ESTIMATES" title="도메인별 현실 가중치" description="동일 Archetype의 도메인 맥락은 서로 중복될 수 있어 합산하지 않습니다." />
        {marketContexts.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption className="sr-only">Archetype 도메인 컨텍스트별 추정 규모</caption>
              <thead><tr><th>Domain Context</th><th>Low</th><th>Base</th><th>High</th><th>비중</th><th>등급·신뢰도</th></tr></thead>
              <tbody>{marketContexts.map((context) => {
                const contextId = text(context, "domainContextId", "domain_context_id") ?? "context";
                return <tr key={contextId}><td><strong>{contextId}</strong><small>{text(context, "referenceYear", "reference_year") ?? "—"}년 · {text(context, "geographyScope", "geography_scope") ?? "대한민국"}</small></td><td className="numeric">{formatCount(number(context, "countLow", "count_low"), entityUnit(context))}</td><td className="numeric"><strong>{formatCount(number(context, "countBase", "count_base"), entityUnit(context))}</strong></td><td className="numeric">{formatCount(number(context, "countHigh", "count_high"), entityUnit(context))}</td><td>{formatPercent(number(context, "shareBase", "share_base"))}</td><td>등급 {text(context, "estimateGrade", "estimate_grade") ?? "—"} · {Math.round(number(context, "confidenceScore", "confidence_score") ?? 0)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        ) : <DataUnavailable message="연결된 도메인 컨텍스트 추정치가 없습니다." />}
      </section>
      <div className="detail-grid">
        <article className="panel">
          <SectionHeading eyebrow="OBSERVABLE PROFILE" title="관측·구성 특성" description="등록 규칙에서 직접 확인할 수 있는 구성 특성입니다." />
          {traits.length ? <div className="definition-tags">{traits.map((item) => <span key={item}>{item}</span>)}</div> : <DataUnavailable message="연결된 관측·구성 특성이 없습니다." />}
        </article>
        <article className="panel">
          <SectionHeading eyebrow="REVERSE LINEAGE" title="역추적" />
          <div className="lineage-links">
            {subtypeLinks.length ? subtypeLinks.map((link) => {
              const subtypeId = text(link, "subtypeId", "subtype_id") ?? "";
              return <Link key={subtypeId} href={`/segments/subtypes/${encodeURIComponent(subtypeId)}`}><Layers3 aria-hidden="true" /><span><strong>{text(link, "subtypeNameKo", "subtype_name_ko") ?? "Subtype"}</strong><small>{subtypeId}</small></span><ArrowRight aria-hidden="true" /></Link>;
            }) : <DataUnavailable message="Subtype 연결 없음" />}
            {modelLinks.length ? modelLinks.map(([modelId, link]) => <Link key={modelId} href={`/governance/models/${encodeURIComponent(modelId)}`}><GitBranch aria-hidden="true" /><span><strong>Segmentation model</strong><small>{text(link, "modelVersion", "model_version") ?? modelId}</small></span><ArrowRight aria-hidden="true" /></Link>) : <DataUnavailable message="Model 연결 없음" />}
          </div>
        </article>
      </div>
      <section>
        <SectionHeading eyebrow="HYPOTHESIS LAYER" title="니즈·상황·채널 가설" description="출처의 provenance를 함께 표시하며 실제 개인의 사실로 사용하지 않습니다." />
        <div className="dashboard-grid narrative-grid">
          <NarrativePanel eyebrow="INFERRED NEEDS" title="추론된 니즈" items={inferredNeeds} empty="등록된 니즈 가설이 없습니다." />
          <NarrativePanel eyebrow="TRIGGERS" title="상황 Trigger" items={triggers} empty="등록된 trigger 가설이 없습니다." />
          <NarrativePanel eyebrow="OBJECTIONS" title="반대·장벽 가설" items={objections} empty="등록된 반대 또는 장벽 가설이 없습니다." />
          <NarrativePanel eyebrow="CHANNELS" title="채널 가설" items={channels} empty="등록된 채널 가설이 없습니다." />
          <RepresentativePanel items={representatives} title="Archetype 대표 표본" />
        </div>
      </section>
      {caveats.length ? <article className="panel"><SectionHeading eyebrow="CAUTION" title="해석 주의사항" /><ul className="caveat-list">{caveats.map((item) => <li key={item}>{item}</li>)}</ul></article> : null}
      <EvidencePanel record={archetype} />
    </div>
  );
}

export function SearchResults({ value, query }: { value: unknown; query: string }) {
  const allResults = records(value, ["results"]);
  const grouped = new Map<string, DataRecord[]>();
  for (const result of allResults) {
    const type = text(result, "objectType", "object_type", "type", "recordType", "record_type") ?? "other";
    grouped.set(type, [...(grouped.get(type) ?? []), result]);
  }
  const hrefFor = (item: DataRecord) => {
    const routePath = text(item, "routePath", "route_path");
    if (routePath?.startsWith("/")) return routePath;
    const type = text(item, "objectType", "object_type", "type", "recordType", "record_type");
    const id = identifier(item) ?? "";
    const code = text(item, "domainCode", "domain_code", "code") ?? id;
    if (type === "domain") return `/explore/${encodeURIComponent(code)}`;
    if (type === "subtype") return `/segments/subtypes/${encodeURIComponent(id)}`;
    if (type === "archetype") return `/archetypes/${encodeURIComponent(id)}`;
    if (type === "estimate") return `/sizing/${encodeURIComponent(id)}`;
    if (type === "saved_segment") return `/builder/${encodeURIComponent(id)}`;
    if (type === "opportunity") return `/opportunities/${encodeURIComponent(id)}`;
    return "/governance";
  };
  return (
    <div className="page-stack">
      <PageHeading eyebrow="GLOBAL SEARCH" title={query ? `“${query}” 검색 결과` : "통합 검색"} description="Domain, axis, feature, behavior, subtype, archetype, estimate와 저장된 작업을 함께 검색합니다." />
      <form className="search-page-form" action="/search"><Search aria-hidden="true" /><input name="q" defaultValue={query} autoFocus placeholder="검색어 입력" /><button className="button button-primary" type="submit">검색</button></form>
      {query && allResults.length ? [...grouped.entries()].map(([type, items]) => (
        <section key={type}>
          <SectionHeading title={type} description={`${items.length.toLocaleString("ko-KR")}건`} />
          <div className="search-result-list">{items.map((item, index) => <Link href={hrefFor(item)} key={`${identifier(item) ?? label(item)}-${index}`}><span><strong>{label(item)}</strong><small>{description(item) ?? text(item, "code") ?? "설명 없음"}</small></span><ArrowRight aria-hidden="true" /></Link>)}</div>
        </section>
      )) : query ? <EmptyState title="검색 결과가 없습니다" description="등록된 실제 데이터에서 일치 항목을 찾지 못했습니다." /> : <EmptyState title="검색어를 입력하세요" description="자연어 질의는 구조화 조건 검토를 위해 세그먼트 빌더로 이동할 수도 있습니다." action={<Link className="button" href="/builder">세그먼트 빌더 열기</Link>} />}
    </div>
  );
}

export function RawRecordPanel({ value, title }: { value: unknown; title: string }) {
  const record = asRecord(value);
  const entries = Object.entries(record).filter(([, entry]) => ["string", "number", "boolean"].includes(typeof entry));
  return (
    <article className="panel">
      <SectionHeading eyebrow="RECORD" title={title} />
      {entries.length ? <KeyValueList rows={entries.slice(0, 16).map(([key, entry]) => ({ label: key, value: String(entry) }))} /> : <DataUnavailable message="표시할 레코드가 없습니다." />}
    </article>
  );
}
