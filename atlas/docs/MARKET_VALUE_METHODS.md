# Market Value Engine — 계산과 해석

> 이 문서의 수치·지출 범위는 v0.4 현재 구현을 기준으로 합니다. 지원 시장·기준액 목록은 [baselines](MARKET_VALUE_BASELINES.md), 전수 검증은 [research-demand-sanity.json](../data/research-demand-sanity.json)을 사용합니다.

현재 활성 범위는 **외식·배달 조사 지출과 선별 2025 온라인 카테고리 거래액의 연간 소비액 proxy**다. 품목·채널·구매 주체가 일치하지 않는 cohort에는 금액을 연결하지 않는다. 전체 대한민국 소비 규모나 사업자가 확보할 수 있는 매출이 아니다.

## 네 객체의 의미

1. Population: 선택한 유형·Segment 전체의 인구. 기존 연령/성별 보정 엔진을 사용한다.
2. Relevant Population: 그 인구 중 선택 지출 항목의 유료 참여 추정 인구.
3. Annual Spend per Unit: 참여자 한 명의 관련 연간 소비액.
4. Annual Spend Pool: 관련 참여 인구 × 참여자당 지출. Revenue/SAM/SOM/capture rate를 붙이지 않는다.

`lib/market-value.ts`의 MarketValueEstimate를 모든 화면에서 공유한다. KRW/annual, person/household/business, scope, component, range, sourceBasis, assumptions, confidence, coverage를 함께 전달한다. `categoryPopulationUnit: person`은 금액 단위와 별도로 명시한다. 가구 기준이 필요한 Pet/Family/Home에서는 개인 관심 인구만 제공하고 가구 참여 수·금액은 null이다.

## 여섯 단계

|우선순위|Method|산식|현재 데이터에서 활성화|
|---|---|---|---|
|1|direct_spend|검증된 관련 금액 × 연환산 계수|아니오: 정형 직접 지출 없음|
|2|weighted_spend|Σ(weight × annual spend) / Σ(weight)|아니오: 지출 관측 없음|
|3|frequency_ticket|연환산 빈도 × 객단가, Low/Base/High 각각|아니오: 대상·기간이 일치하는 객단가 없음|
|4|calibrated_baseline|대상 인구 × 참여율 × 기준 지출, 행동별 분배 보정|음악의 부분 지출 기준에 적용|
|5|consumption_proxy|연간 기준 지출 × 소비 강도|계산 경로 지원, 별도 활성 기준 없음|
|6|heuristic_range|출처·가정이 명시된 연간 범위|계산 경로 지원, 임의 금액 생성 안 함|

`server/atlas/spend-methods.ts`가 여섯 경로와 단위·범위 검증을 제공한다. 직접 금액은 이미 해당 Segment/기간/단위에 맞춘 값이라는 입력 계약이다. 원시 가중 관측이 있으면 weighted 경로에 제공한다. 월 ×12, 주 ×52, 연 ×1이다. Weighted 평균을 계산한 뒤 Population Engine의 인구를 한 번만 곱한다. 실제 서비스의 데이터 어댑터는 아래의 연령별 calibrated baseline 하나만 연결되어 있다. 하위 단계도 KRW 기준 자체가 없으면 숫자를 만들지 않는다.

## 기준 지출의 출처

- 기존 등록 파일: `data/raw/kocca_2024_music_whitepaper.pdf` (별도 기존 프로젝트 자산, 이 배포에 PDF를 복제하지 않음).
- 원문: [한국콘텐츠진흥원 2024 음악산업백서](https://welcon.kocca.kr/ko/info/report/1954309).
- 표 2-2-2-12, 인쇄 p.147 / PDF p.149의 월 결제금액 구간과 표 2-2-2-11 및 연령별 사례 수. PDF 렌더링으로 표를 확인했다.
- 파일 SHA-256: `8c0f42b39227e2649485c075b6faabf9db749a568048cdaf0486d1cc299b22a1`.
- 조사 기간 2024년 상반기. 조사 연령 10–69세 중 Atlas의 성인 프레임과 일치하는 20–69세만 사용한다. 70세 이상은 외삽하지 않는다.

|연령|음악 이용 사례 수|유료 이용 사례 수|참여율 proxy|
|---|---:|---:|---:|
|20–29|577|494|85.6%|
|30–39|602|486|80.7%|
|40–49|645|408|63.3%|
|50–59|680|323|47.5%|
|60–69|579|214|37.0%|

이 비율을 Nemotron 음악 관심 집단에 이식한다. 조사 이용자와 합성 서술의 관심 집단은 같은 모집단이 아니며, 공개 사례 수의 반올림도 존재한다. 따라서 실제 결제자를 관측한 것처럼 해석하지 않는다.

월 5천원 미만 / 5천–1만원 미만 / 1만–1.5만원 미만 / 1.5만–2만원 미만 / 2만원 이상의 구간 분포를 사용한다. Base 대표값은 2,500 / 7,500 / 12,500 / 17,500 / 25,000원이다. 마지막 열린 구간의 25,000원은 명시적 가정이다. Low는 0 / 5,000 / 10,000 / 15,000 / 20,000원, High는 5,000 / 10,000 / 15,000 / 20,000 / 40,000원으로 감도 분석한다. 40,000원은 엄밀한 상한이 아니다. 반올림된 분포 합을 100으로 재정규화한 평균에 12를 곱한다.

## 참여와 소비 강도의 분리

S = 선택 조건의 정확한 교집합, M = 음악 관심 신호, h = 연령 × 성별 인구 보정 층, w = 기존 보정 가중치라고 하자.

```text
g(person) = 1 + Σ coefficient(feature) × observed feature
P(S,h) = Σ w, person ∈ S∩M∩h
R(S,h) = P(S,h) × paidUsers(age)/musicUsers(age)
normalizer(h) = Σ(w×g | M∩h) / Σ(w | M∩h)
allocatedUnits(S,h) = Σ(w×g | S∩M∩h) / normalizer(h) × participation(age)
AnnualValue(S) = Σ allocatedUnits(S,h) × annualBaseline(age)
RelevantPopulation(S) = Σ R(S,h)
AnnualSpendPerUnit(S) = AnnualValue(S) / RelevantPopulation(S)
```

계수는 `config/market-value.json`에 중앙 관리한다: paid .35, premium .40, paid_subscription .30, gear_upgrade .20, repeat_purchase .15, membership .20. 실제 언급된 소비 메커니즘을 분배 proxy로 사용한다. 계수는 학습된 지출 탄력성이 아니다. 같은 사람에게 여러 신호가 겹칠 수 있으므로 가산 모델의 민감도와 범위를 함께 공개한다.

각 연령/성별 층의 음악 전체 기준 평균을 보존한다. 유형별 평균 Affinity를 지출 배율로 바꾸지 않는다. Participation Index = 선택집단 참여율 / 전체인구 참여율, Spend Intensity Index = 보정 소비액 / 같은 참여자·연령 구성의 미보정 소비액, Spend Density = 소비액 / 참여 인구, Density Index = Density / 전체 음악 참여자 Density다.

## 범위와 결손

- Base: 위 식의 중앙 가정.
- Low: 구간 하단을 적용한 금액 × (1−인구 민감도) × .8.
- High: 구간 상단 가정을 적용한 금액 × (1+인구 민감도) × 1.25.
- 인구 민감도는 유효 원본 support 1,000 이상 ±30%, 미만 ±50%다.
- Spend/Unit 범위에는 인구 변동을 다시 넣지 않는다.
- 이 범위는 통계적 신뢰구간이 아니다. 현재 confidence는 Low다.
- 원본 빈 교집합은 인구·소비액 0, 단위 지출/Opportunity는 null. 금액 기준 결손은 0이 아닌 null이다.
- 조사 연령 밖은 `outside_anchor_scope`, 금액 기준 부재는 `missing_calibration_anchor`, 가구 연결 필요는 `unit_mapping_required`다.

Coverage.population = 선택 cohort 인구 / 선택 전체 인구. Coverage.anchor = 선택 cohort 인구 / 기준액 분모. DirectSpend = 0. Completeness = 기준액 연결 충족도의 별도 지표다. 이것은 전체 가계 소비 중 측정한 비중이 아니다. 지원 시장 11/20과 `isPartial:true`를 표시한다. 기존 인구·신호 Completeness는 덮어쓰지 않는다.

## 합산과 Share

유형·시장 aggregate에는 `isAdditive:false`를 전달한다. 같은 지출 component가 반복되는 합산은 `assertAdditive`가 거부한다. 국가 금액은 52개 유형의 합으로 구하지 않고 전체 모집단의 단일 기준 항목에서 직접 계산한다. 산업 간 중복도 자동 합산하지 않는다. 서로 배타적인 동일 범위의 인구 분할에서만 Base 합산이 가능하며 별도 `additiveForDisjointPopulations` 메타데이터로 구분한다.

Share of Spend Pool은 동일 음악 지출 component와 동일 연령 범위의 전체 Base에 대한 비중이다. 서로 겹치는 유형의 Share는 합이 100%가 될 필요가 없다. 미확보 산업은 Share를 표시하지 않는다. 새 anchor가 여러 개가 되면 지출 항목의 중복 여부와 합산 규칙을 검토하도록 가드를 둔다.

## Opportunity 연결

기존 Population/Distinctiveness/Need/Reachability/Consumption/Breadth 구성은 보존한다. 별도의 Economic Value Score를 `100 × sqrt(value / (전체 동일 범위 value × .15))`, 최대 100으로 정규화한다. 중앙 config의 추가 weight .10을 사용하며, 금액이 없으면 기존 점수 산식을 유지한다. 금액 기준이 다른 후보를 비교할 때에는 동일 scope를 유지한다.

Opportunity X/Y는 Population, Annual Market Value, Spend/Unit, Opportunity, Distinctiveness 중 선택한다. 기본 X=Population, Y=Spend/Unit, bubble area=annualValue, color=Opportunity다. 최소 클릭 반경 4px은 아주 작은 원의 표시 하한이다. 네 분류는 전체 성인 인구 3%와 동일 범위 평균 Spend/Unit을 기준으로 한다. 투자·사업 우선순위 확정 판정이 아니다.

## 캐시와 확장

서버의 기존 압축 bitmap과 연령/성별 집계를 재사용한다. Linear moment 캐시 512개, 금액 객체 캐시 2,048개로 제한한다. UI에서 원본 순회·가중치 계산·금액 곱셈을 하지 않는다. 검색, 지도, Matrix, Dashboard, Opportunity가 동일 엔진 객체를 사용한다.

새 자료를 연결하려면 source ID·기간·통화·단위·대상 연령·참여 분모·금액 분포·항목 ID를 먼저 등록한다. 가구 자료는 중복 제거된 household mapping이 필요하다. 직접 관측과 빈도×객단가는 검증된 입력 어댑터를 추가한다. 복수 산업의 Economic Adjacency는 두 산업의 유효 지출 근거가 생긴 뒤 활성화한다. 현재 한 항목으로 가짜 산업 간 Money Adjacency를 만들지 않는다.
