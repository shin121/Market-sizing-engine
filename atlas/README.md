[Vercel에서 최신 Market Atlas 열기](https://nemotron-market-atlas.vercel.app/atlas) · [인구 / 시장 규모 ₩ 보기](https://nemotron-market-atlas.vercel.app/atlas?metric=marketValue)

# Nemotron Market Atlas

한국 소비자 전체에서 **소비 유형 → 산업 → 다른 유형 → 구체적인 집단 → 기회 후보**를 탐색하는 워크벤치입니다. 100만 합성 페르소나 전체를 다시 분석해 **52개 중복 소속 가능한 상업적 유형**, 20개 시장, 103개 행동·욕구·채널·관심 신호를 만들었습니다.

v0.3은 **인구 규모 / 연간 소비액** Lens를 추가합니다. 금액의 현재 유효 범위는 기존 음악산업백서로 보정한 **음악 스트리밍·다운로드, 20–69세**입니다. 나머지 19개 산업은 금액 기준 또는 가구 연결 미확보 상태를 표시합니다. 이 금액은 전체 가계 소비나 확보 가능한 회사 매출이 아닙니다.

## GitHub / Vercel

이 앱은 `shin121/Market-sizing-engine` 저장소의 `atlas/`에서 배포합니다. Vercel Framework는 Next.js, Root Directory는 `atlas`, Node는 24.x, Production Branch는 `main`입니다. 원본 Parquet나 기존 Postgres 연결 없이 포함된 서버 집계 인덱스로 실행합니다. [Vercel 이전·검증 기록](docs/DEPLOYMENT_VERCEL.md)을 참고하세요.

## 실행

Node.js 24.x와 npm으로 실행합니다. 원본 Parquet 없이도 포함된 서버 인덱스로 모든 화면과 교집합 계산이 동작합니다.

```bash
npm ci
npm run dev
```

터미널의 Local URL에서 `/atlas`를 엽니다. 배포 빌드는 `npm run build`, 로컬 프로덕션 서버 실행은 `npm start`입니다.

## 탐색

1. 첫 화면의 유형 지도와 다섯 Discovery Radar에서 시작합니다. 산업 Lens도 전환할 수 있습니다.
2. 유형을 클릭하면 인구 구성·독립 신호·산업 연결을 함께 보여주는 전체 Dashboard가 열립니다.
3. 산업 이름은 산업 전체로 이동합니다. 행 옆 **+**는 현재 집단에 해당 조건을 추가합니다.
4. 산업 Dashboard에서는 주요 소비 유형과 불편 집단, 하위 시장을 확인합니다.
5. Matrix에서 두 조건을 더 겹치고, Segment Dashboard의 상위 유형·시장 대비 차이를 확인합니다.
6. **집계 데이터**에서 모든 신호·인구특성·연관 유형의 추정 인구, 실제 검출 건수, 비중과 Index를 확인합니다.
7. Opportunity에서 현재 집단과 다른 후보 최대 3개를 비교합니다. 주소에 조건·비교·경로를 유지하므로 새로고침과 뒤로/앞으로 탐색이 가능합니다.
8. **시장 규모 ₩**를 선택하면 지도 면적과 Discovery Radar를 금액으로 탐색합니다. 지출 범위를 선택하고 각 Dashboard에서 참여 인구·참여자당 지출·산업별 금액을 확인합니다.
9. Matrix는 인구 / Index / Market Value / Spend per Unit을 지원합니다. Opportunity는 X/Y 축과 연간 금액 버블로 경제적 밀도가 다른 집단을 비교합니다.

## 원본에서 재생성

원본 데이터는 프로젝트에 포함하지 않습니다. 모든 중간 개인 단위 파일은 `work/`에만 저장됩니다.

```bash
python3 -m venv work/venv
work/venv/bin/pip install -r pipeline/requirements.txt
NEMOTRON_DIR=/absolute/path/to/nemotron work/venv/bin/python pipeline/audit.py
NEMOTRON_DIR=/absolute/path/to/nemotron work/venv/bin/python pipeline/atlas_build.py
work/venv/bin/python pipeline/atlas_materialize.py
work/venv/bin/python pipeline/atlas_oracle.py
NEMOTRON_DIR=/absolute/path/to/nemotron work/venv/bin/python pipeline/market_value_audit.py
work/venv/bin/python pipeline/market_value_oracle.py
work/venv/bin/python -m unittest tests/atlas_lexical_test.py
npm run lint
npm run typecheck
npm test
npm run build
```

정규화 → 상업적 신호 쌍 후보 → 독립 검증·중복 필터 → 유형·인구 → 실제 교집합 → Dashboard 순서입니다. 인덱스 지문이 다르면 이전 집계 캐시를 사용하지 않습니다.

## 데이터와 해석

- 실제 로컬 원본: 1,000,000행, 26필드, 19–99세. 분석 규모는 20세 이상 989,509행에 한정합니다.
- 연령대·성별 16개 기준으로 2024.11 인구 44,105,000명에 보정합니다. 기존 엔진의 출처 등록된 인구 기준만 참고했습니다.
- 상업적 유형은 행동·욕구·채널의 실제 동시 언급 조합입니다. 시장과 인구특성은 유형의 정의에서 제외했습니다.
- 한 사람의 소속은 관측 조합에 따라 0 또는 1이며 여러 유형에 해당할 수 있습니다. 62.1%가 하나 이상, 33.3%가 둘 이상 유형에 해당합니다.
- 인구 범위는 ±30%, 1,000건 미만은 ±50%의 민감도 범위입니다. 통계적 신뢰구간이 아닙니다.
- 원천은 합성 서술입니다. 실제 지출, 소득, 거래 빈도, 시장 성장, 경쟁, 지불의향을 측정하지 않습니다. 해당 미확보 항목을 0으로 만들어 점수에 넣지 않습니다.
- 금액 엔진은 기존 출처가 확인된 월 지출 구간을 연환산하고, 연령별 참여율 및 관측 소비 신호로 배분합니다. 금액 계수·범위·출처는 `config/market-value.json`에 있습니다. 새로운 지출 기준은 대상·단위·기간·중복 항목 검토 후 연결해야 합니다.

## 문서와 데이터

- [Nemotron 구조·재분석](docs/NEMOTRON_DATA_AUDIT.md)
- [Top 30 유형 검토](docs/ARCHETYPE_TOP_30.md)
- [52개 유형 Dataset](data/commercial-archetypes.json)
- [123개 활용 Feature와 탈락 항목](data/atlas-feature-audit.json)
- [추정·신호·점수 정의](docs/DATA_AND_ESTIMATION.md)
- [아키텍처와 URL 규칙](docs/ARCHITECTURE.md)
- [브라우저 발견 검증](docs/BROWSER_QA.md)
- [Market Value 최종 22개 항목 보고](docs/MARKET_VALUE_REPORT.md)
- [Monetary Data Audit](docs/MARKET_VALUE_DATA_AUDIT.md)
- [금액 산식·단위·가정·범위](docs/MARKET_VALUE_METHODS.md)
- [52개 유형 / 10개 산업 / Matrix 검증](docs/MARKET_VALUE_SANITY.md)
- [Money Lens Browser QA](docs/MARKET_VALUE_BROWSER_QA.md)
- [이전 Atlas v0.2 보고](docs/FINAL_REPORT.md)

## Attribution

NVIDIA Corporation, [Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea), v1.0 (2026-04-20), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 본 프로젝트는 합성 서술의 명시적 신호를 추출하고, 중복 소비 유형·인구 보정·집계·탐색 점수를 추가한 파생물입니다.
