# Market Value Engine — 완료 보고

기존 Atlas에 인구와 경제적 소비액을 구분하는 Lens를 추가했다. **현재 금액을 계산할 수 있는 범위는 음악 스트리밍·다운로드(20–69세), 20개 산업 중 1개 산업의 일부**다. 다른 산업의 임의 기준 금액은 만들지 않았다. 이 범위에서 인구 순위와 소비액 순위가 다른 유형·Matrix 셀이 확인됐다.

## 1. Nemotron Monetary Data Audit

실제 9개 Parquet, 100만 행, 26필드를 재검사했다. Field/meaning/unit/period/population level/category linkage/direct·proxy/coverage/sizing 적합성을 [Audit](MARKET_VALUE_DATA_AUDIT.md)에 기록했다. 숫자 금액과 거래 지출을 구분하고 기존 파일·DuckDB·Postgres 출처도 읽기 전용으로 감사했다.

## 2. 사용 가능한 direct spend field

0개. 서술의 금액은 정산·소득목표·내기·희소 일회성 가격이 섞여 있다. Nemotron sampling weight도 없고 기존 Population Engine의 외부 인구 보정 가중치를 사용한다. 구조화 직접 소비액이나 대표 객단가로 오인하지 않는다.

## 3. 사용한 Proxy fields

paid, premium, paid_subscription, gear_upgrade, repeat_purchase, membership의 관측 행동 신호를 사용한다. 연령별 기준 평균을 보존하면서 집단 내부 소비를 배분한다. 계수는 중앙 config의 명시적 가정이며 실측 지출 탄력성이 아니다.

## 4. Market Value Method hierarchy

Direct → Weighted → Frequency×Ticket → Calibrated baseline → Consumption proxy → Heuristic range의 여섯 계산 경로를 구현·테스트했다. 실제 활성 데이터 어댑터는 Calibrated baseline 하나다. [산식 문서](MARKET_VALUE_METHODS.md)에 각 경로의 입력 계약과 현재 미사용 이유가 있다.

## 5. Spend per Unit 산출 방식

기존 2024 음악산업백서의 연령별 유료 스트리밍·다운로드 월 지출 구간을 중간값으로 근사하고 ×12 한다. 마지막 열린 구간은 Base 월 2.5만원/High 4만원의 가정을 공개한다. 집단 연간 소비액 / 관련 참여 인구가 Annual Spend per Unit이다.

## 6. Participation 산출 방식

선택 집단 중 음악 관심·20–69세 인구에 출처의 연령별 유료 이용 사례 수 / 음악 이용 사례 수를 적용한다. 실제 결제자 관측이 아닌 참여율 이식 proxy다. 전체 유형 인구, 관련 관심 인구, 관련 유료 참여 추정 인구를 분리한다.

## 7. Archetype × Industry Market Value

실제 52개 유형 × 20개 산업을 같은 중앙 엔진으로 평가한다. 음악은 관련 참여 인구·단위 지출·소비액·Affinity를 비교할 수 있다. 예: 휴식·보상 프리미엄선택형은 전체 약 75만 명, 음악 유료 참여 약 19만 명, 연간 참여자당 약 13만원, 음악 소비액 약 240억원이다. 다른 산업은 결손 원인을 표시한다.

## 8. Segment Market Value

Archetype/Market/Age/Signal의 실제 교집합을 동일 가중치로 계산한다. Matrix에서 생성한 Segment도 같은 monetary object와 URL 범위를 유지한다. 브라우저에서 20대 × 디지털 활용 배달주문형 × 휴식·보상 현장이용형의 금액과 참여 인구를 확인했다.

## 9. Low / Base / High

금액 구간 하단·중간·상단 가정에 인구 및 배분 민감도를 적용한다. 인구 support에 따라 ±30%/±50%, 소비 배분 .8/1.25를 사용한다. 단위 지출에는 인구 민감도를 중복 적용하지 않는다. 상세 근거 펼침에서 확인하며 통계적 신뢰구간으로 표시하지 않는다.

## 10. Double-counting 방지 방식

유형은 중복 소속 가능하므로 `isAdditive:false`. 동일 소비 component 중복 합산을 거부한다. 전체 금액은 모집단에서 직접 계산한다. 동일 범위의 배타적 인구 분할에서만 Base 합산 가능하며 연령 합계 보존을 테스트했다. 산업별 근거가 하나뿐이므로 교차 산업 금액 합산도 하지 않는다.

## 11. Market Value Coverage

Population coverage, Anchor coverage, Direct spend coverage, 지원 산업 수를 별도 제공한다. 직접 관측 지출은 0%, 지원 산업은 1/20이며 음악에서도 전체 지출이 아닌 일부 항목이다. 기존 인구·신호 Completeness를 덮어쓰지 않는다. 현재 monetary confidence는 Low다.

## 12. Global Atlas 변경

인구 / 시장 규모 ₩ 전환, People/Market 양방향 지도, 금액 면적, compact monetary strip을 추가했다. 헤더 약 8,600억원/년은 **확보된 음악 일부 범위**로 표시한다. 전체 대한민국 소비시장 합계로 표현하지 않는다. 산업 금액 coverage가 낮아 기본 Lens는 인구다.

## 13. Discovery Radar Money Lens

Largest by Spend, High Spend per Unit, Money-dense Niche를 엔진 결과로 제공한다. 기존 다섯 인구·신호 Radar는 보존했다. 예시 금액을 하드코딩하지 않았다.

## 14. Archetype Dashboard 변경

Compact 금액/참여자 지출 지표와 근거, 20개 산업의 Affinity·관련 참여 인구·단위 지출·연간 금액 표를 추가했다. 금액/Affinity/Population/Spend per Unit 정렬을 제공한다. 관련 산업 지출 합계의 범위를 명시한다.

## 15. Market Dashboard 변경

관련 참여 인구, 연간 소비액, 단위 지출, 유형별 기여를 제공한다. 유형 기여는 중복 가능하며 합계가 산업 전체라는 인상을 주지 않는다. Pet/Home/Family의 개인 관심 인구를 가구 소비 수로 바꾸지 않는다.

## 16. Segment Dashboard 변경

선택 교집합의 인구와 scoped annual spend, 참여자당 지출, 동일 음악 지출 범위 내 Share를 보여준다. 분모나 금액 근거가 없는 산업의 Share는 생략한다. 기존 Parent comparison과 drill-through를 유지한다.

## 17. Matrix Money Mode

Population / Index / Market Value / Spend per Unit 네 모드와 세 monetary interesting-cell 규칙을 추가했다. 연령 × 유형 Matrix의 ‘20대 × 교류 중심 단골선택형’은 인구 29위 → 금액 16위다. 같은 셀을 비교한 결과이며 다른 조건으로 바꾼 순위가 아니다.

## 18. Opportunity integration

Population Score와 Economic Value Score를 분리했다. 기존 가중 구성에 중앙 config weight .10을 추가하고 금액이 없으면 기존 점수를 유지한다. Population/Annual Value/Spend per Unit/Opportunity/Distinctiveness 축과 금액 버블, 네 경제적 분류를 제공한다. 복수 산업의 지출 근거가 없는 Economic Adjacency는 활성화하지 않았다.

## 19. Sanity Test

52개 실제 유형 전체 계산, 12개 유형 상세 표, 네 패턴, 10개 산업 상태 및 35개 Matrix 셀을 검증했다. ‘휴식·보상 유료이용형’은 인구 24위 → 금액 14위다. 10개 산업 중 음악만 금액 유효, 나머지 9개는 결손 처리를 검증한 것이다. **10개 금액 시장 검증은 추가 기준 데이터가 필요하다.** [결과](MARKET_VALUE_SANITY.md).

## 20. Browser Acceptance Test

Global Atlas → 실제 프리미엄 유형 → 지원 산업 지출 순 → 음악 Market → 유형 기여 순 → 다른 유형 → Matrix Money → Segment → Opportunity의 전체 흐름을 통과했다. 검색/비교/새로고침/Relationship/축 전환과 10개 산업 탐색, 모바일 및 브라우저 history를 점검했다. [브라우저 증거](MARKET_VALUE_BROWSER_QA.md).

## 21. lint / typecheck / test / build

Lint, Typecheck, 31 tests, production build 통과. 여섯 산식, 16개 독립 DuckDB monetary oracle, 단위·범위·빈 집단·합산·순위 차이·URL context를 검사했다. 배포용 Cloudflare Worker에서 8개 분석 API와 8개 화면, 금액 검색 및 잘못된 조건 400을 확인했다. Raw narrative/bitmap/per-person moments가 API로 노출되지 않는다. [런타임 측정](../data/market-value-performance.json).

## 22. Known Limitations

- 19개 산업은 monetary anchor 미확보이며 일부는 household mapping도 필요하다. Pet/Food/Home의 경제적 규모 비교는 아직 데이터로 뒷받침할 수 없다.
- 현재 기준은 2024년 상반기 디지털 음악 지출이다. 2026년 현재 관측치, 전체 음악 시장, 전체 가계 소비 규모가 아니다.
- 합성 서술의 음악 관심 집단에 실제 조사 이용자 비율을 이식했다. 참여율·표본 반올림·공유 요금제·연령 범위 차이와 배분 계수 가정이 존재한다.
- Low/High는 가정 민감도이고 열린 지출 구간의 High는 엄밀한 상한이 아니다.
- 직접 지출·Weighted 관측·빈도×객단가 등 추가 어댑터를 활성화하려면 대상·기간·단위가 맞는 자료가 필요하다. 범위별 합산 규칙도 검토해야 한다.
- SOM, company capture rate, 매출 예측, 가격 시뮬레이터, unit economics는 구현하지 않았다.
