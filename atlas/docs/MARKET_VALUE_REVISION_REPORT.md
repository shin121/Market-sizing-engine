# Market Value 현재 구현 보고 — current

1. **Nemotron Monetary Data Audit** — 100만 행·26개 필드 감사와 금액/기간 판별 결과를 `MARKET_VALUE_DATA_AUDIT.md`에 보존했다. 외부 자료 확장 내역은 `EXTERNAL_SPEND_AND_POPULATION.md`에 있다.
2. **Direct spend field** — 직접 사용할 정형 금액·대표 객단가·소비 가중치가 없다. 가상의 field를 만들지 않았다.
3. **Proxy fields** — 유료 이용, 프리미엄, 구독, 장비 업그레이드, 반복 구매, 회원권. 원 서술의 실제 결제금액으로 해석하지 않는다.
4. **Method hierarchy** — direct / weighted / frequency_ticket / calibrated_baseline / consumption_proxy / heuristic_range를 중앙 엔진에서 지원한다. 현재 실행 데이터는 calibrated_baseline이다.
5. **Spend per Unit** — 온라인 전국 소비액의 가중 배분 / 관련 성인 프로필. 음악은 기존 유료 참여·월 지출 구간의 연환산. 단위별 의미를 구분한다.
6. **Participation** — NIA 인터넷/쇼핑/뷰티 및 KCA 사전검토·후기를 명시적 proxy로 보정했다. 온라인 거래액 배분에는 실제 구매자 참여율을 주장하지 않고 null을 유지한다.
7. **Archetype × Industry** — 52개 실제 유형 × 20개 시장을 중앙 서비스에서 계산한다. 14개 시장은 일부 지출 기준을 연결했고 6개는 근거 미확보로 남겼다.
8. **Segment** — 같은 조건은 한 번만 적용하고 현재 조건을 보존해 하위 Dashboard로 이동한다. 원 서술 일치와 보정 인구를 별도로 제공한다.
9. **Low / Base / High** — 온라인 세그먼트 배분은 0.5 / 1 / 1.7을 사용하되 High는 항목별 전국 총액 이하로 제한한다. 전국 공표 기준액은 고정하며 음악은 기존 참여·금액 구간·분포 민감도를 사용한다. 원 단위 정밀값은 내부 계산용이며 화면은 KRW 반올림 formatter를 사용한다.
10. **Double-counting** — 원자 소비 항목 ID dedup, 관련 인구 union, 유형/중복 산업 합산 차단. 분리된 연령 partition의 전국 합계를 검증했다.
11. **Coverage** — 지원 시장 14/20, 직접 지출 0%, 온라인·외식·배달·음악·콘텐츠 유료 이용·게임 플랫폼 지출 전이의 부분 기준, confidence Low를 구분한다. 70%가 전체 소비액 coverage라는 주장은 하지 않는다.
12. **Global Atlas** — 인구/금액 전환, 중복 제외 확보 범위 총액, 연령·지역, 소비 항목·전국 변화·출처를 추가했다.
13. **Discovery Radar** — 큰 소비액, 관련 인구당 높은 금액, 작지만 지출이 높은 유형을 실제 계산값으로 정렬한다.
14. **Archetype Dashboard** — compact 인구·금액 strip, 산업 금액 표, 소비 분해, 범위, 하위 집단, 인구 보정과 출처를 제공한다.
15. **Market Dashboard** — 포함 채널·상품군·연간 기준, 관련 인구, 성인당 배분액, 유형 기여를 구분한다. 전국 음식서비스는 2025년 41.4882조원이며 플랫폼 회사 매출과 혼용하지 않는다.
16. **Segment Dashboard** — 교집합 인구·금액, 부모 대비 구성, 소비 분해와 증거가 같은 형식으로 이어진다. 금융 등 미확보 지출은 0으로 채우지 않는다.
17. **Matrix** — 인구/명시적 Index/연간 금액/단위 금액 지원. 전체 기준 age × archetype에서 29개 셀의 순위가 바뀐다. 40대 × 디지털 활용 배달주문형은 인구 18위 → 소비액 8위다.
18. **Opportunity** — 인구와 경제적 규모 signal을 분리하고 기존 점수 구조에 중앙 weight 0.1로 금액을 연결했다. 축·버블·비교·새로고침의 조건을 유지한다.
19. **Sanity Test** — 실제 52개 유형·20개 시장 전수 검사와 4개 경제적 규모/밀도 패턴을 `data/research-demand-sanity.json`에 기록했다. 모든 미보정 행동의 현실 유병률까지 검증했다는 뜻은 아니다.
20. **Browser Acceptance** — 최종 29단계: 전체 → 프리미엄 유형 → 음악 시장 → 유형 → Matrix 금액 → Segment → Opportunity → Relationship/검색, 시장 10개, 집·인테리어의 3중 교집합, 배달, 모바일. 브라우저 오류 0. `data/revision-browser-qa.json`.
21. **lint / typecheck / test / build** — Atlas lint/typecheck/79 tests/Next production build 통과. 원래 Python 엔진은 입력 데이터·DuckDB 미포함으로 45 passed / 12 skipped / 15 failed / 10 errors; CLI validate도 DB 부재로 실행을 마치지 못했다. 해당 엔진 코드는 변경하지 않았다.
22. **Known Limitations** — 합성 프로필, 선별 조사 비율 이식, 조건부 독립·70+ 가정, 온라인 일부 채널, 혼합 기준연도, 6개 시장 미확보, 실제 구매자/가구 식별 미확보. 소득·세그먼트 실측 성장·매출 예측·SOM을 추가하지 않았다.

[현재 산식·출처·범위](EXTERNAL_SPEND_AND_POPULATION.md) · [Vercel 운영 Atlas](https://nemotron-market-atlas.vercel.app/atlas?metric=marketValue)
