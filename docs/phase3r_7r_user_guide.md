# Market Atlas 사용자 가이드

최종 갱신: 2026-08-26

## 시작하기

1. `/access`에서 접근 비밀번호를 입력한다.
2. `세그먼트 탐색`에서 대한민국 24개 Domain을 단위별로 본다.
3. Domain을 열어 실제 시장규모, 지역분포, 신뢰도, 16개 Axis를 확인한다.
4. 같은 화면의 `도메인 대표 세그먼트`에서 Primary Subtype 상세로 이동한다.

Axis와 Subtype은 같은 Domain에 속하지만 직접 edge가 등록되지 않은 경우 자동 연결하지 않는다. Axis 화면의 “직접 연결 미등록”은 데이터 오류가 아니라 provenance 경계다.

## Archetype 탐색

`Archetype 탐색`은 전체 Registry 1,440개를 50건씩 보여준다. Domain, Subtype, unit, Feature/Behavior, 지역, 가구, 직업, 소득, 사업체 속성, Rule 연령·대표자 연령, Estimate Grade, 최소 Confidence와 정렬을 사용할 수 있다. Rule 연령은 비어 있는 age 값을 추정하지 않고 등록된 `age`/`owner_age` 범위만 검색한다. 각 유형의 count는 domain primary context의 현실 보정치이며 여러 domain context를 합산하지 않는다.

## Builder와 자연어 검색

- 조건은 AND/OR/NOT와 중첩 group으로 구성한다.
- 자연어 입력은 구조화 조건 후보로 바뀌며 exact, similar feature, proxy, ambiguous, research-needed를 구분한다.
- 구조화 결과를 확인한 뒤 계산한다.
- entity unit이 다른 조건은 자동 곱하지 않는다.

대표 검증 질의를 그대로 입력하면 등록된 숫자·Formula·Source를 재사용한다. 예를 들어 `수도권 초등학생 자녀 맞벌이 가구`는 확인 전에는 draft이고, `해석 적용` 뒤 계산하면 Base 429,539가구의 immutable snapshot을 연다.

연령·성별·지역·가구·사업체 조건은 Calibration된 joint cell에서 AND/OR/NOT을 직접 평가한다. 주변 비율을 단순 독립 곱셈하지 않는다. 선택된 control만의 결과도 공식 공동분포는 아니므로 Grade D이고, 맞벌이 Proxy 같은 합성 필드 또는 등록 Feature/Behavior prevalence를 조건부 적용하면 Grade E와 검증 필요 항목이 표시된다.

## 시장규모 분석

결과 화면에서 Low/Base/High, 전체 비중, 지역, confidence, grade, formula, factor, source, lineage를 확인한다. TAM/SAM/SOM은 별도 User Scenario이며 Baseline을 바꾸지 않는다.

Gold Query 10건은 등록된 관련 지출 또는 가격수용도 Low/Base/High도 함께 보여준다. `월간`/`연간`, 기준연도, Confidence와 출처 수를 확인해야 하며 이 값은 1개 entity 기준이다. 별도 곱셈 근거 없이 전체 시장 매출로 해석하지 않는다.

현재 실제 예시:

- Estimate `684658b0-dcd6-4725-9636-8be6b713644d`
- Base 4,289,457명, Low 1,738,042명, High 7,394,115명
- Scenario `프리미엄 외식 멤버십 기준안` (`bc9aa64a-6d49-4541-84b4-2b7c5fc52445`)
- TAM 4,289,457 / SAM 1,286,837 / SOM 64,342

CSV, JSON, 인쇄 보고서는 선택한 scenario ID/version을 보존한다.

## 비교

2–5개 후보를 추가한다. entity unit이 같은 후보끼리만 0–100 normalized Base를 계산한다. 원수량은 별도 열에 유지되며 unit이 다른 수치를 한 순위로 섞지 않는다.

## Opportunity Board

저장한 segment의 현재 estimate와 생성 당시 snapshot을 함께 본다. 문제, 가설, 아이디어, 가격, 채널, 경쟁 대안, 검증 가정, 다음 실험을 버전으로 관리한다. AI 아이디어는 데이터 기반 사실과 별도 표시된다.

## Research Queue

추가 근거가 필요하면 Research Job을 만든다. `외부 AI 설정 대기`는 가상 결과가 아니라 provider 호출 전 안전 상태다. 실제 결과는 `검토 필요`에서 인간이 승인하거나 반려한다.

## 수치 해석

- Low/Base/High는 단순 ±10%가 아니라 source, mapping, calibration, dependency uncertainty를 반영한다.
- Grade A가 가장 직접적인 근거, E가 가장 탐색적인 범위다.
- Feature/Behavior는 overlapping membership일 수 있어 합계가 100%를 넘을 수 있다.
- “데이터 없음”과 0은 다르다. 근거가 없으면 빈 차트 대신 이유를 표시한다.
