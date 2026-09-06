# GitHub / Vercel 배포

현재 운영본은 외부 조사 인구 보정과 12/20개 시장의 부분 지출 기준을 포함합니다. [현재 범위와 산식](EXTERNAL_SPEND_AND_POPULATION.md), [전수 검증](../data/research-demand-sanity.json)을 참고하세요. 아래 v0.3/v0.4 항목은 이전 기록입니다.

[운영 Atlas](https://nemotron-market-atlas.vercel.app/atlas) · [Money Lens](https://nemotron-market-atlas.vercel.app/atlas?metric=marketValue)

[운영 환경 25단계 탐색 검증](../data/vercel-production-verification.json)도 통과했으며 검증 중 error/fatal runtime 로그가 없었다.

## 최신 운영 검증

`8f9822c`가 GitHub `main`에 반영됐고 Vercel production 배포
`dpl_6hTyxT2AYPd1L8sCS2GkVDgmRFtz`가 `READY` 상태다. 음악 감상 프로필은
전체 감상 인구와 분리된 약 1,170만 명의 지출 관련 유료 참여자, 약 1.1조원
연간 지출 풀, 약 9.2만원/명·년을 표시한다. 피부·헤어·뷰티 관리 프로필은
약 1,660만 명의 미용 활동 cohort로 유지하며 화장품 전체 사용자나 금액으로
확장하지 않는다. 두 production URL 모두 브라우저 error 로그가 없었다.

초기 Vercel production 배포는 `READY`를 확인했다. GitHub 구현 commit `fe7160aea5d8bfbacd2c8f8233bc1fc67afc1048`에서 빌드했으며, 운영 API도 HTTP 200으로 52개 유형·20개 산업·금액 객체를 반환했다. 이후 `main` push는 연결된 Vercel 프로젝트에서 자동 배포된다.

## v0.4 운영 검증

`48ce58d`의 GitHub main 자동 production 배포가 READY였고 운영 주소의 29단계 브라우저 여정, 오류 0을 확인했다. [운영 검증 기록](../data/revision-production-qa.json). 후속 범위 보완은 각 집단의 High를 공식 전국 항목 총액으로 제한하며 전국 기준액 자체는 고정한다.

## 현재 운영 검증

`2d84014`의 production 배포 `dpl_AFWtFx85hRDo365J5qhytcquubZ8`가
READY 상태이며 [운영 Atlas](https://nemotron-market-atlas.vercel.app/atlas)에
반영됐다. 흐름 화면에서 시장 → 경험·문제 → 하위 행동·구매 방식의 계층을
확인하고, 하위 유형을 같은 조건의 세그먼트 프로필 대시보드로 열 수 있다.
프로필에는 관련 인구, 연간 소비금액, 단위당 지출, 연령·지역 구성, 기준시장
추이, 하위 유형, 산출 근거가 한 화면에 표시된다. `3faab3e`의 하위 유형 카드와
beauty skin → cosmetics → Matrix → Opportunity 여정을 production에서 재확인했고,
브라우저 error 로그는 없었다. 저장소 루트 배포에 필요한 대형 로컬 산출물은
루트 `.vercelignore`에서 제외한다.

## 대상과 실행 방식

- GitHub: [shin121/Market-sizing-engine](https://github.com/shin121/Market-sizing-engine), `main`의 `atlas/`.
- 기준 구현: 기존 Market Atlas commit `7ba33223b278b97f7aa0f90e63ce6d5d8adc340d`.
- Next.js 16.3.4 App Router, React 19.2.8, Node 24.x, Vercel 서울 리전.
- Vercel 프로젝트의 Root Directory는 `atlas`, Framework는 Next.js다.
- 기존 Python 엔진 및 `web/` 앱은 보존한다. 이 Atlas에는 그 DB·OpenAI·리서치 worker 연결이 필요하지 않다.

Sites/Vinext의 Worker 어댑터·배포 설정을 제거하고 Next.js의 `dev/build/start`, PostCSS 및 TypeScript 설정으로 전환했다. 인구·금액·신호 계산 코드와 화면의 의미는 바꾸지 않았다. 모든 원본 Parquet와 임시 문장은 제외하며 익명 서버 bitmap과 집계만 포함한다. 소스의 원 데이터는 NVIDIA Nemotron-Personas-Korea 파생물로 기존 attribution을 유지한다.

## 검증

- Atlas lint, typecheck, 31 tests 통과.
- Next.js production build 통과; `/atlas/[[...path]]` 및 두 API는 동적 서버 처리다.
- 실제 production 서버에서 25단계 브라우저 여정 통과: 전체 지도 → 프리미엄 유형 → 음악 → 유형 → Matrix 금액 → Segment → Opportunity, 검색·비교·새로고침·산업 10개·모바일.
- API 8개와 HTML 8개, 금액 검색, 잘못된 조건 400, 70세 이상 null, 빈 집단 0/null, raw 데이터 경계 검사 통과.
- 구체적인 결과: [Next.js 검증 JSON](../data/vercel-port-verification.json).
- 원래 저장소의 Python 검사는 raw HTML/집계 입력 및 `data/processed/market_engine.duckdb`가 Git checkout에 없어 완전 통과하지 않는다. 45 passed / 12 skipped / 15 failed / 10 errors였고, CLI validate도 DB 미생성으로 중단된다. 기존 엔진 관련 파일에는 이번 변경이 없다. 이 제한을 새 Atlas의 검증 통과와 혼동하지 않는다.

## 최초 v0.3 배포의 지출 범위

현재 금액은 2024 음악산업백서로 보정한 음악 스트리밍·다운로드(20–69세) proxy다. 19개 산업의 금액 기준은 미확보다. 대한민국 전체 소비액·기업 매출·SOM으로 해석하지 않는다. [금액 계산 문서](MARKET_VALUE_METHODS.md)와 [22항목 기능 보고](MARKET_VALUE_REPORT.md)는 원래 구현의 범위와 근거를 설명한다. 그 문서의 Worker QA는 이전 runtime 기록이고 위 Next.js 검증이 이 배포의 runtime 검증이다.

## 운영

Root `/`는 `/atlas`로 이동한다. 계산 엔진은 Node 서버에서만 작동하고 브라우저에 원본 텍스트나 서버 인덱스를 보내지 않는다. 필요한 통화 anchor와 가구 mapping은 별도 데이터 검토 후 연결한다. Vercel 기본 배포 보호 설정을 사용하며 보호된 URL은 해당 Vercel 계정으로 접속한다.
