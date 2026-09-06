'use client';
import type { MarketValueEstimate } from '@/lib/market-value';
import { formatKRW } from '@/lib/market-value';
import {
  pct,
  shortPopulation,
  type Profile,
  type AtlasContext,
} from '@/lib/atlas';
import { Module, StatList } from './common';

export function SpendRange({ value }: { value?: MarketValueEstimate }) {
  if (!value || value.base === null)
    return (
      <p className="empty">현재 조건과 연결할 지출 근거를 확보 중입니다.</p>
    );
  const marks = [
    ['Low', value.low],
    ['Base', value.base],
    ['High', value.high],
  ] as const;
  return (
    <div className="spend-range" aria-label="연간 소비액 민감도 범위">
      <div className="range-track">
        <i
          style={{
            left: `${value.high! > value.low! ? (100 * (value.base - value.low!)) / (value.high! - value.low!) : 50}%`,
          }}
        />
      </div>
      <div className="range-values">
        {marks.map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{formatKRW(n, false)}</b>
          </div>
        ))}
      </div>
      <p>
        {value.denominatorLabel ?? '참여자당 연간 지출'}{' '}
        <b>{formatKRW(value.annualSpendPerUnit, false)}</b>
      </p>
      <small>Low–High는 배분 가정의 민감도 · 실제 통계 신뢰구간 아님</small>
    </div>
  );
}

export function BaselineTrend({ value }: { value?: MarketValueEstimate }) {
  const trend = value?.nationalTrend;
  if (!trend?.length)
    return (
      <div className="trend-unavailable">
        <b>추세 미확보</b>
        <p>동일한 항목·기간의 시계열 근거가 필요합니다.</p>
        <small>현재 규모를 성장률로 대체하지 않습니다.</small>
      </div>
    );
  const first = trend[0],
    last = trend[trend.length - 1],
    max = Math.max(...trend.map((v) => v.value));
  const change = first.value ? last.value / first.value - 1 : null;
  return (
    <div className="baseline-trend">
      <div className="trend-head">
        <strong>
          {change === null ? '—' : `${change >= 0 ? '+' : ''}${pct(change)}`}
        </strong>
        <span>전국 동일 온라인 항목 · 전년 대비</span>
      </div>
      <div className="trend-columns">
        {trend.map((v) => (
          <div key={v.year}>
            <b>{formatKRW(v.value, false)}</b>
            <i style={{ height: `${max ? (75 * v.value) / max : 0}px` }} />
            <span>{v.year}</span>
          </div>
        ))}
      </div>
      <small>
        현재 세그먼트 성장률이 아닙니다. 조사된 전국 거래액의 변화입니다.
      </small>
    </div>
  );
}

export function SpendBreakdown({
  value,
  limit = 6,
}: {
  value?: MarketValueEstimate;
  limit?: number;
}) {
  const rows = [...(value?.componentBreakdown ?? [])]
    .sort((a, b) => b.annualValue - a.annualValue)
    .slice(0, limit);
  const max = Math.max(...rows.map((r) => r.annualValue), 1);
  return (
    <div className="spend-breakdown">
      {rows.map((r) => (
        <div key={r.id}>
          <span>
            {r.label}
            <i>
              <em style={{ width: `${(100 * r.annualValue) / max}%` }} />
            </i>
          </span>
          <b>{formatKRW(r.annualValue, false)}</b>
          <small title="해당 소비 항목의 전국 기준액 중 현재 집단에 배분된 비중">
            {pct(r.nationalValue ? r.annualValue / r.nationalValue : 0)}
          </small>
        </div>
      ))}
      {!rows.length && <SpendRange value={value} />}
    </div>
  );
}

export function EvidenceTable({ profile }: { profile: Profile }) {
  const value = profile.summary.marketValue;
  return (
    <div className="table-scroll">
      <table className="evidence-table">
        <thead>
          <tr>
            <th>근거</th>
            <th>연결 지표</th>
            <th>기간·대상</th>
            <th>해석</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>NVIDIA Nemotron-Personas-Korea</td>
            <td>소비 패턴·인구 구성</td>
            <td>합성 데이터 · 20세 이상</td>
            <td>
              {profile.summary.estimate.support.toLocaleString()}건 조건 일치 ·
              미언급은 비참여가 아님
            </td>
          </tr>
          <tr>
            <td>인구주택총조사 연령·성별 기준</td>
            <td>성인 인구 보정</td>
            <td>2024.11 · 대한민국</td>
            <td>
              지역 분포는 별도 보정하지 않음 · 행동별 조사 기준은 아래에 명시
            </td>
          </tr>
          {profile.summary.estimate.calibrationSources?.map((s) => (
            <tr key={s.id}>
              <td>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>
              </td>
              <td>행동 인구 보정 proxy</td>
              <td>{s.referencePeriod}</td>
              <td>{s.locator}</td>
            </tr>
          ))}
          {value?.sourceBasis
            .filter((s) => !s.id.startsWith('nemotron-'))
            .map((s) => (
              <tr key={s.id}>
                <td>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title} ↗
                    </a>
                  ) : (
                    s.title
                  )}
                </td>
                <td>연간 소비액</td>
                <td>{s.referencePeriod ?? '모델 기준'}</td>
                <td>{s.locator ?? value.scopeLabel}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function PopulationCalibrationNote({ profile }: { profile: Profile }) {
  const e = profile.summary.estimate;
  const surveyIds = new Set(e.calibrationSources?.map((s) => s.id));
  if (e.populationMethod !== 'survey_calibrated_proxy') return null;
  return (
    <details className="population-calibration-note">
      <summary>
        인구 보정 근거 · 서술 일치 {e.support.toLocaleString()}건과 추정 인구를
        구분합니다
      </summary>
      <p>
        기존 서술 일치 규모는 약 {shortPopulation(e.observedPopulation ?? 0)}
        명입니다. 서술에 없다는 이유만으로 비이용자로 분류하지 않도록 외부 조사
        비율과 합성 프로필을 연결했습니다.
      </p>
      {surveyIds.has('NIA-INTERNET-2024') && (
        <p>
          인터넷·온라인 구매는 연령·성별 이용률을 반영합니다. 온라인 구매율은
          인터넷 이용자 중 비율이므로 인터넷 이용률을 먼저 적용합니다.
          뷰티·패션에는 온라인 패션·스포츠 및 화장품 구매 비율의 합집합 proxy를
          적용하며, 두 품목의 중복은 조건부 독립 가정입니다.
        </p>
      )}
      {surveyIds.has('KCA-PURCHASE-2024') && (
        <p>
          신중구매는 구매 전 정보검토 비율을 proxy로 사용하며, 후기 비율은 품질
          비교정보 경험이 있는 선별 응답자에서 이식한 가정입니다. 70세 이상은 원
          서술 근거만 포함합니다.
        </p>
      )}
      <p>실제 조사에서 이 유형이나 교집합의 인구를 직접 센 값은 아닙니다.</p>
      <p>
        같은 조건은 한 번만 적용합니다. 미언급 프로필 사이의 결합은 모델
        가정입니다. 원 서술의 일치 건수를 모델 배정 건수로 부풀리지 않습니다.
      </p>
    </details>
  );
}

export function ProfileOverview({
  profile,
  context,
}: {
  profile: Profile;
  context: AtlasContext;
}) {
  const value = profile.summary.marketValue;
  return (
    <div className="economic-overview">
      <Module
        title="어느 소비에서 금액이 큰가"
        note="상품군별 연간 배분액 · 우측 비중은 전국 해당 항목 대비"
      >
        <SpendBreakdown value={value} />
      </Module>
      <Module
        title="전국 소비 기준의 변화"
        note="2024 → 2025 · 같은 온라인 항목 비교"
      >
        <BaselineTrend value={value} />
      </Module>
      <Module title="연간 소비액의 추정 범위" note={value?.scopeLabel}>
        <SpendRange value={value} />
        <div className="scope-population">
          <span>관련 소비 프로필</span>
          <b>
            {shortPopulation(
              value?.relevantPopulation ?? profile.summary.estimate.population,
            )}
            명
          </b>
        </div>
      </Module>
      <Module
        title="하위 집단 구성"
        note="현재 집단 내 추정 인원·비중 · 서술 근거가 적은 결합은 모델 의존"
      >
        <StatList
          stats={profile.archetypes
            .filter((s) => s.population > 0 && s.share < 0.999)
            .sort((a, b) => b.population - a.population)}
          context={context}
          limit={5}
        />
      </Module>
    </div>
  );
}
