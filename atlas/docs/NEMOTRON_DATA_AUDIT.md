# Nemotron Data Audit

감사일: 2026-09-06. 실제 원본 9개 전체를 DuckDB로 검사했다. 기존 UI·유형·코드의 재사용 없이 새 파이프라인을 만든다.

원본: `/Users/woocheolshin/Projects/Market-sizing-engine_v3/Data/nemotron`

- 행 수 / 고유 UUID: 1,000,000 / 1,000,000
- 필드: 26개. 전체 필드 NULL/빈 문자열: 0건.
- 연령: 19–99세. 19세 10,491건.
- 출처: NVIDIA Nemotron-Personas-Korea v1.0, 2026-04-20, CC BY 4.0. 실존 소비자 관측 자료가 아닌 합성 서술 및 합성 인구특성이다.

## 실제 필드

| Field | Type | Missing | Approx. distinct |
|---|---|---:|---:|
| uuid | VARCHAR | 0 | 827059 |
| professional_persona | VARCHAR | 0 | 982141 |
| sports_persona | VARCHAR | 0 | 800146 |
| arts_persona | VARCHAR | 0 | 886203 |
| travel_persona | VARCHAR | 0 | 938695 |
| culinary_persona | VARCHAR | 0 | 834073 |
| family_persona | VARCHAR | 0 | 966477 |
| persona | VARCHAR | 0 | 1189771 |
| cultural_background | VARCHAR | 0 | 1268570 |
| skills_and_expertise | VARCHAR | 0 | 1080252 |
| skills_and_expertise_list | VARCHAR | 0 | 1048093 |
| hobbies_and_interests | VARCHAR | 0 | 893358 |
| hobbies_and_interests_list | VARCHAR | 0 | 1028564 |
| career_goals_and_ambitions | VARCHAR | 0 | 954971 |
| sex | VARCHAR | 0 | 2 |
| age | BIGINT | 0 | 78 |
| marital_status | VARCHAR | 0 | 4 |
| military_status | VARCHAR | 0 | 2 |
| family_type | VARCHAR | 0 | 42 |
| housing_type | VARCHAR | 0 | 6 |
| education_level | VARCHAR | 0 | 6 |
| bachelors_field | VARCHAR | 0 | 11 |
| occupation | VARCHAR | 0 | 1972 |
| district | VARCHAR | 0 | 266 |
| province | VARCHAR | 0 | 17 (exact 재검증) |
| country | VARCHAR | 0 | 1 |

고유값 추정은 DuckDB approx_count_distinct이며 오차로 전체 행 수보다 클 수 있다. UUID 중복 검사는 별도로 exact count(distinct)를 사용했다.

## 분석 변수 분류

| 구분 | 직접 존재 | 서술에서 도출 가능 |
|---|---|---|
| Identity | age, sex, province, district, occupation, education_level, marital_status, family_type | 인구특성은 상업적 유형 정의에서 제외; 사후 skew로 사용 |
| Behavioral | 구조화 행동 변수 없음 | sports/arts/travel/culinary/hobbies 서술의 활동·반복·탐색·구매 언급 |
| Need / Motivation | 구조화 욕구 변수 없음 | 7개 생활·일반 서술의 휴식·편의·부담·불편 언급; 직업·포부는 상업적 신호에서 제외 |
| Commercial | 소득·지출액·구매 로그·WTP 없음 | 할인·프리미엄·배달·구독·리뷰 등의 명시적 텍스트 신호 |
| Context | family_type, housing_type, marital_status, province | 여가·가족·일·이동 상황 |

## 사용하지 않는 가정

- B2B/사업체 및 가구 수를 만들지 않는다. 가구 특성은 개인의 맥락이다.
- income/spending/media/shopping/digital/pain/needs/preferences/purchase context는 독립적인 원본 필드가 아니다. 관련 텍스트 검출은 Nemotron-derived proxy이다.
- 원문에 언급되지 않은 신호는 미검출이지 실제 행동의 부재를 의미하지 않는다.
- Competition, market momentum, actual WTP는 직접 확보 불가. Opportunity에서 missing으로 제외하고 가중치를 재정규화한다.
- 원문 언급과 인구 보정만으로 시장 미충족/사업 성공을 확정할 수 없다.

## 전체 원본에서 발견한 어휘

동네 (569,143), 시청 (492,716), 탐방 (432,752), 산책 (422,974), 유튜브 (278,158), 맛집 (263,195), 지역 (261,052), 함께하는 (203,763), 감상 (201,380), 영상 (188,300), 풍경 (157,300), 가족과 (146,321), 여행 (140,288), 방문 (132,474), 활동 (128,388), 배드민턴 (127,174), 모임 (125,168), 전국 (124,166), 투어 (116,198), 친구들과의 (114,310), 사우나 (113,300), 걷기 (110,189), 자연 (104,747), 게임 (104,433), 최신 (102,148), 관람 (99,713), 단골 (98,715), 경기 (97,537), 사진 (93,198), 트로트 (89,684), 둘레길 (89,629), 산책로 (86,598), 숲길 (86,279), 역사 (80,992), 노래 (76,317), 동호회 (75,991), TV (75,699), 건강 (69,887), 수다 (69,878), 관리 (68,184), 외식 (68,177), 인근 (66,987), 청취 (65,691), 일식 (64,118), 음악 (63,043), 가꾸기 (62,198), 베란다 (62,147), 수집 (61,591), 프로그램 (60,737), 촬영 (60,537), 낮잠 (59,958), 유적지 (59,749), 정주행 (58,681), 사우나에서 (58,230), 주말 (55,770), 등산 (55,195), 요리 (54,447), 유명 (54,034), 인테리어 (53,559), 지인들과의 (52,875), 즐기는 (52,580), 가족 (52,531), 빵집 (51,751), 주변 (50,987), 나물 (47,701), 임영웅 (47,575), 넷플릭스 (45,883), 드라이브 (45,050), 다큐멘터리 (44,644), 목욕탕 (44,049), 휴식 (43,684), 친목 (43,415), 가벼운 (42,588), 부르기 (42,540), 한식 (41,079), 근교 (40,672), 리뷰 (40,428), 라디오 (40,338), 영화 (40,328), 정보 (39,836), 배달 (39,634), 노래방 (38,399), 정기적인 (38,067), 웹툰 (38,021), 노포 (37,026), 읽기 (36,891), 카페 (36,825), 모바일 (36,712), 코인 (36,416), 팟캐스트 (36,363), 나들이 (36,092), 경관 (35,922), 전략 (35,614), 야간 (35,258), 통한 (34,774), 제철 (34,560), 채널 (34,269), 정기 (34,139), 드라마 (34,012), 온천 (33,748)

이 빈도는 토큰 언급 횟수이며 인구수/개별 레코드 유병률이 아니다. 데이터 기반 어휘 검토 후 사람이 읽을 수 있는 신호 사전을 구성하고, 전체 데이터에서 최소 support를 통과한 항목만 산업 Lens에 포함한다.

## 검증 및 재현

`audit.py`는 모든 필드와 전체 9개 shard를 읽고 SHA-256을 계산한다. 기계 판독 결과: `data/audit.json`. 이후 normalization → clustering → sizing 순서로 진행한다.

## 원본 무결성

| Shard | SHA-256 |
|---|---|
| train-00000-of-00009.parquet | 5f447553b9e30ac98631af17f2274780586fbd5e2705125b8f3a49fe2af037b2 |
| train-00001-of-00009.parquet | 332ade7365bd842838de6295e15f4457d0050b4792b33a8330b3b8a39a6dfc3b |
| train-00002-of-00009.parquet | 65d4860663fab1ff4166f5db4eb96fc39e84ccc952391ab36437d0373bc6d5f1 |
| train-00003-of-00009.parquet | d94a0f221edd1e70e28d7e19acf9b9f4cfa315b630f51607b28b06498a28591b |
| train-00004-of-00009.parquet | c31efb3b3f0ef6405956683a9a6fb99276dea2c16b22efe883555a31ff05b3ed |
| train-00005-of-00009.parquet | e95979de298ffecac1db437401baf19e3bdae16355fcd5a54320c63290c3e07f |
| train-00006-of-00009.parquet | 5b0fc5fd097bd9c82be9f6c9ff57eddee314226eabe820f83e2426bed34e40ff |
| train-00007-of-00009.parquet | 73a4178828b9d08cd44b141c3c0da2d69521a8fa9cd22194868d07c36f0a6680 |
| train-00008-of-00009.parquet | e32faf2717f7b9634ff38d62b175f9d9817b1eee797c043032b3dc2d8d055fe6 |

## 상업적 Atlas 재분석 (두 번째 구현)

125개 제안 신호 중 123개를 사용한다: 20개 시장, 53개 상업적 행동·욕구·채널, 50개 하위 시장. 반복 구매·프리미엄·리뷰·수집·정보 탐색·채널 등 실제 서술 조합에서 52개 중복 상업적 유형을 추출했다. 전문 직업/포부 문장은 상업적 구매·상담과 혼동하지 않도록 제외했다. 하위 시장은 부모 산업의 관련 서술에서만 검출한다. 중고 거래 관련 두 항목은 150건 미만으로 제외했다.

상담사 포부, 옮기기, 한없이 등의 실제 문맥 오탐을 수정했으며, 유료 플랫폼 접점과 무료 크리에이터 팔로우를 구분했다. 표본 14개 문맥 회귀 사례는 품질 검토이며 전체 precision/recall을 검증한 것은 아니다. 정규화·후보·holdout·독립 Index·중복 필터·인구 보정의 상세는 DATA_AND_ESTIMATION.md, 실제 Top 30은 ARCHETYPE_TOP_30.md에 기록했다.
