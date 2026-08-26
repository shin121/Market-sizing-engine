from __future__ import annotations

from typing import Any


DOMAIN_VERSION = "phase2-taxonomy-2026-08-25-v1"

COMMON_AXES = (
    "object",
    "format",
    "occasion",
    "location",
    "frequency_intensity",
    "discovery",
    "acquisition_access",
    "consumption_mode",
    "device_channel_platform",
    "payment_monetization",
    "decision_unit",
    "engagement_participation",
    "motivation_job",
    "barrier_risk_trust",
    "loyalty_switching",
    "spending_value",
)


# These seeds define observable domain vocabulary.  They are not population
# estimates.  Population quantities are produced by the Phase 2 model and keep
# official-survey priors separate from synthetic-person evidence.
DOMAIN_SEEDS: tuple[dict[str, Any], ...] = (
    {"code":"music_audio","name_ko":"음악·오디오","category":"leisure_culture","unit":"person","keywords":["음악","노래","오디오","팟캐스트","콘서트","악기"],"objects":["대중음악","인디·장르음악","팟캐스트·토크","아티스트·팬덤"],"formats":["스트리밍","뮤직비디오·숏폼","피지컬 음반","공연·라이브"],"occasions":["이동·통근","집중·업무","휴식·기분전환","팬 활동"],"modes":["배경 청취","능동 탐색","소셜 공유","창작·연주"],"payments":["무료·광고형","구독","곡·앨범 구매","공연·굿즈"],"motivations":["기분 조절","새 음악 발견","정체성 표현","아티스트 지지"],"barriers":["구독 피로","추천 편향","가격 부담","티켓·권리 신뢰"],"sources":["REL-KOCCA-MUSIC-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"video_ott","name_ko":"영상·OTT","category":"digital_media","unit":"person","keywords":["영화","드라마","영상","OTT","유튜브","다큐멘터리"],"objects":["드라마","영화","예능","다큐·정보"],"formats":["장편 VOD","숏폼","라이브","클립·하이라이트"],"occasions":["퇴근 후","주말 몰아보기","이동 중","가족 공동시청"],"modes":["몰입 시청","배경 재생","동시 시청","리뷰·공유"],"payments":["무료·광고형","단일 구독","묶음 구독","건별 대여·구매"],"motivations":["서사 몰입","휴식","화제 참여","정보 습득"],"barriers":["구독 중복","탐색 피로","스포일러","콘텐츠 신뢰"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"gaming_esports","name_ko":"게임·e스포츠","category":"leisure_culture","unit":"person","keywords":["게임","e스포츠","콘솔","모바일 게임","PC방","게이머"],"objects":["모바일 게임","PC·콘솔 게임","e스포츠","보드·소셜 게임"],"formats":["짧은 세션","장기 캠페인","경쟁전","관전·스트리밍"],"occasions":["틈새 시간","저녁 여가","친구 모임","대회·시즌"],"modes":["솔로 플레이","협동","경쟁","관전·커뮤니티"],"payments":["무료 플레이","패키지 구매","시즌패스·구독","아이템·후원"],"motivations":["성취","사회적 연결","도피·휴식","숙련·경쟁"],"barriers":["시간 부족","과금 불신","유해행동","기기 비용"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"reading_webtoon","name_ko":"독서·웹툰","category":"leisure_culture","unit":"person","keywords":["독서","책","웹툰","만화","소설","도서관"],"objects":["단행본","전자책","웹툰·웹소설","전문·학습서"],"formats":["종이책","앱 연재","오디오북","요약·리뷰"],"occasions":["취침 전","이동 중","학습·업무","주말 몰입"],"modes":["정독","연재 추적","듣기","토론·리뷰"],"payments":["도서관·무료","구독","권·회차 구매","소장 구매"],"motivations":["지식 습득","서사 몰입","자기계발","취향 탐색"],"barriers":["시간 부족","완독 부담","플랫폼 잠금","가격 부담"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"culture_events","name_ko":"문화예술·행사","category":"leisure_culture","unit":"person","keywords":["공연","전시","축제","연극","뮤지컬","박물관"],"objects":["공연예술","전시·박물관","지역축제","체험 행사"],"formats":["현장 관람","도슨트·가이드","온라인 중계","워크숍"],"occasions":["주말 나들이","데이트","가족 활동","여행 연계"],"modes":["개인 관람","동반 관람","참여 체험","후기 공유"],"payments":["무료 행사","일반 입장권","멤버십","프리미엄 좌석"],"motivations":["문화 향유","새로움","사회적 교류","지역 소속감"],"barriers":["거리·시간","티켓 가격","정보 부족","혼잡·접근성"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"grocery_home_meals","name_ko":"식료품·가정식","category":"food_dining","unit":"person","keywords":["요리","식료품","장보기","가정식","레시피","반찬"],"objects":["신선식품","가공식품","밀키트·간편식","건강·특수식"],"formats":["주간 장보기","소량 수시구매","정기배송","직접 조리"],"occasions":["평일 식사","주말 가족식","손님맞이","비상 비축"],"modes":["계획 구매","즉흥 구매","공동 조리","간편 조리"],"payments":["현장 결제","온라인 주문","정기구독","할인·포인트"],"motivations":["가족 건강","예산 관리","조리 편의","신선도·품질"],"barriers":["물가 부담","품질 불확실","배송 신뢰","조리 시간"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"dining_delivery_cafe","name_ko":"외식·배달·카페","category":"food_dining","unit":"person","keywords":["외식","배달","카페","맛집","식당","커피"],"objects":["한식·일상식","배달 음식","카페·디저트","특별 외식"],"formats":["매장 식사","포장","배달앱","예약 코스"],"occasions":["혼밥","업무 중 식사","친교 모임","기념일"],"modes":["빠른 해결","탐색 방문","반복 주문","후기·공유"],"payments":["현장 결제","앱 결제","쿠폰·멤버십","단체 정산"],"motivations":["편의","맛 탐색","사회적 교류","보상·기분전환"],"barriers":["배달비·가격","위생 신뢰","대기 시간","후기 조작 우려"],"sources":["REL-MSS-SB-2023","REL-NVIDIA-NPK-1.0"]},
    {"code":"fashion_resale","name_ko":"패션·리셀","category":"commerce_payment","unit":"person","keywords":["패션","의류","신발","리셀","빈티지","스타일"],"objects":["일상 의류","스포츠·아웃도어웨어","명품·디자이너","리셀·빈티지"],"formats":["매장 구매","온라인몰","라이브커머스","중고 거래"],"occasions":["계절 교체","출근·행사","여행","취향 컬렉션"],"modes":["목적 구매","탐색 쇼핑","코디 공유","재판매"],"payments":["정가","할인·쿠폰","할부","판매대금 상계"],"motivations":["자기표현","기능성","희소성","가치 소비"],"barriers":["사이즈 불확실","정품 신뢰","반품 번거로움","충동구매"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"beauty_personal_care","name_ko":"뷰티·개인관리","category":"commerce_payment","unit":"person","keywords":["화장품","뷰티","피부","헤어","미용","스킨케어"],"objects":["스킨케어","메이크업","헤어·바디","미용 서비스"],"formats":["데일리 루틴","집중 케어","매장 시술","샘플·체험"],"occasions":["아침 준비","저녁 관리","계절 변화","행사 전"],"modes":["셀프케어","전문가 상담","리뷰 탐색","루틴 공유"],"payments":["단품 구매","정기 구매","시술 패키지","샘플·증정"],"motivations":["건강한 외관","자기표현","문제 해결","휴식·돌봄"],"barriers":["효능 불확실","성분 우려","피부 부작용","과장 광고"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"travel_hospitality","name_ko":"여행·숙박","category":"travel","unit":"person","keywords":["여행","관광","호텔","숙박","캠핑","항공"],"objects":["국내 단기여행","해외여행","호캉스·휴양","캠핑·체류"],"formats":["자유여행","패키지","당일치기","장기 체류"],"occasions":["연휴","가족 휴가","기념일","업무 연계"],"modes":["계획형","즉흥형","현지 몰입","안전·편의형"],"payments":["개별 예약","패키지 선결제","포인트·마일리지","현지 결제"],"motivations":["일상 탈출","관계 강화","문화 탐색","휴식"],"barriers":["비용","일정 조율","안전·건강","예약 신뢰"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"sports_outdoor","name_ko":"스포츠·아웃도어","category":"leisure_culture","unit":"person","keywords":["운동","스포츠","등산","러닝","자전거","골프"],"objects":["걷기·러닝","구기·라켓","등산·캠핑","피트니스"],"formats":["개인 운동","클래스","동호회","경기 관람"],"occasions":["출근 전후","주말 야외","친교 모임","대회 준비"],"modes":["건강 유지","기록 향상","사회 운동","관전·응원"],"payments":["무료 공공시설","월회비","장비 구매","대회·레슨비"],"motivations":["건강","성취","사회적 연결","야외 회복"],"barriers":["부상 위험","시간 부족","장비 비용","날씨·접근성"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"hobbies_creation","name_ko":"취미·창작","category":"leisure_culture","unit":"person","keywords":["취미","공예","그림","사진","창작","DIY"],"objects":["미술·공예","사진·영상","악기·공연","메이커·DIY"],"formats":["독학","온라인 강좌","오프라인 공방","프로젝트·전시"],"occasions":["저녁 여가","주말 몰입","선물 제작","커뮤니티 행사"],"modes":["개인 창작","공동 제작","학습","판매·공유"],"payments":["무료 자료","재료 구매","수강료","작품 판매 재투자"],"motivations":["자기표현","숙련","몰입·회복","사회적 인정"],"barriers":["시간 부족","재료 비용","실력 불안","공간 부족"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"pets","name_ko":"반려동물","category":"pets","unit":"household","keywords":["반려동물","강아지","고양이","펫","동물병원","산책"],"objects":["사료·간식","건강·의료","미용·돌봄","놀이·동반여행"],"formats":["일상 양육","정기 관리","전문 서비스","커뮤니티 정보"],"occasions":["매일 돌봄","건강 이상","외출·여행","생애주기 변화"],"modes":["가족 공동 돌봄","주양육자 중심","전문가 위탁","정보 공유"],"payments":["일상 구매","정기배송","보험·적립","고액 진료"],"motivations":["동반자 관계","건강 보호","양육 편의","즐거운 활동"],"barriers":["진료비 부담","품질 신뢰","돌봄 공백","이동 제약"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"housing_home_services","name_ko":"주거·홈서비스","category":"home_services","unit":"household","keywords":["주거","인테리어","이사","청소","수리","가구"],"objects":["이사","청소·정리","수리·설비","인테리어·가구"],"formats":["직접 수행","단건 전문가","정기 서비스","통합 공사"],"occasions":["입주·이사","고장 발생","계절 관리","가족 변화"],"modes":["견적 비교","신뢰업체 반복","플랫폼 중개","지인 추천"],"payments":["건별 결제","계약금·잔금","정기 결제","보험·보증 연계"],"motivations":["안전","편의","공간 개선","자산 가치"],"barriers":["업체 신뢰","가격 불투명","공사 지연","개인정보·출입 우려"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"mobility_automotive","name_ko":"모빌리티·자동차","category":"mobility","unit":"person","keywords":["자동차","운전","대중교통","자전거","모빌리티","통근"],"objects":["대중교통","승용차","택시·호출","자전거·퍼스널모빌리티"],"formats":["일상 통근","단거리 이동","장거리 운전","공유·대여"],"occasions":["출퇴근","장보기·돌봄","주말 이동","여행"],"modes":["직접 운전","환승","호출","공유"],"payments":["교통카드","유류·충전","월 구독·리스","건별 호출"],"motivations":["시간 절약","비용 절감","접근성","친환경"],"barriers":["교통비","안전","주차·충전","배차·환승 불확실"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"education_learning","name_ko":"교육·학습","category":"children_education","unit":"household","keywords":["교육","학습","학교","강의","자격증","공부"],"objects":["학교교육","직무·자격 학습","언어 학습","취미·교양 학습"],"formats":["교실 수업","온라인 강의","개별 지도","자율 학습"],"occasions":["정규 학기","시험 준비","전직 준비","방학·여가"],"modes":["학습자 주도","교사 지도","부모 지원","동료 학습"],"payments":["공교육·무료","월 수강료","단과 구매","기업·정부 지원"],"motivations":["성취","진학·경력","자기효능","사회 참여"],"barriers":["비용","시간","학습 품질","중도 이탈"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"parenting_childcare","name_ko":"양육·보육","category":"parenting_private_education","unit":"household","keywords":["육아","양육","보육","자녀","어린이집","부모"],"objects":["보육","생활 돌봄","놀이·발달","교육 의사결정"],"formats":["가정 돌봄","공공기관","민간 서비스","가족 분담"],"occasions":["평일 일과","등하원","방학","긴급 돌봄"],"modes":["보호자 직접","기관 위탁","가족 지원","공동육아"],"payments":["공공 지원","월 이용료","건별 돌봄","교육·용품 구매"],"motivations":["안전","발달 지원","일·가정 양립","부모 부담 완화"],"barriers":["안전 신뢰","비용","대기·공급 부족","정보 비대칭"],"sources":["REL-MOIS-AGE-2024-12","REL-KOSTAT-CENSUS-2024"],"minor_guardrail":True},
    {"code":"health_wellness_care","name_ko":"건강·웰니스·돌봄","category":"health_care","unit":"person","keywords":["건강","웰니스","의료","돌봄","영양","병원"],"objects":["예방 건강","만성 관리","정신 웰니스","가족 돌봄"],"formats":["자가 관리","의료기관","디지털 모니터링","방문·재가 돌봄"],"occasions":["정기 관리","증상 발생","회복기","돌봄 공백"],"modes":["개인 결정","가족 공동결정","전문가 지도","보호자 대리"],"payments":["건강보험","본인부담","민간보험","구독·프로그램"],"motivations":["예방","증상 완화","자립 유지","돌봄 부담 완화"],"barriers":["의료정보 신뢰","비용","접근성","민감정보 우려"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"finance_insurance","name_ko":"금융·보험","category":"financial_capacity","unit":"household","keywords":["금융","보험","투자","저축","대출","연금"],"objects":["저축·예금","투자","신용·대출","보험·보장"],"formats":["정기 관리","목표 기반","상담","자동화"],"occasions":["급여일","목돈 계획","위험 사건","생애 전환"],"modes":["개인 결정","가구 공동결정","전문가 자문","디지털 자기관리"],"payments":["수수료 없음","정액 수수료","거래 수수료","보험료·이자"],"motivations":["안전성","수익 추구","현금흐름 관리","위험 보호"],"barriers":["손실 위험","복잡성","기관 신뢰","개인정보 우려"],"sources":["REL-KOSTAT-CENSUS-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"senior_retirement_care","name_ko":"시니어·은퇴·돌봄","category":"senior_retirement_care","unit":"person","keywords":["은퇴","시니어","노후","요양","돌봄","연금"],"objects":["노후소득","건강·요양","주거 전환","사회 참여"],"formats":["자가 계획","가족 협의","전문 상담","지역 서비스"],"occasions":["은퇴 전","은퇴 직후","건강 변화","돌봄 전환"],"modes":["본인 주도","부부 공동","자녀 지원","전문가 위임"],"payments":["공적 급여","개인 자산","보험","가족 분담"],"motivations":["자립","안정","관계 유지","존엄한 돌봄"],"barriers":["디지털 접근","소득 불안","서비스 신뢰","가족 조율"],"sources":["REL-KOSTAT-REA-2024","REL-KOSTAT-CENSUS-2024"]},
    {"code":"digital_devices_ai","name_ko":"디지털기기·AI","category":"digital_media","unit":"person","keywords":["인공지능","AI","스마트폰","컴퓨터","디지털","기기"],"objects":["스마트폰","PC·태블릿","웨어러블·스마트홈","생성형 AI"],"formats":["일상 도구","업무 도구","창작 도구","자동화"],"occasions":["업무","학습","생활 관리","여가·창작"],"modes":["수동 사용","추천 활용","대화형 보조","자동 실행"],"payments":["기기 구매","소프트웨어 구독","무료 서비스","기업 제공"],"motivations":["생산성","편의","창작","새 기술 탐색"],"barriers":["개인정보","정확성","학습 부담","기기·구독 비용"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"social_creator","name_ko":"소셜·크리에이터","category":"digital_media","unit":"person","keywords":["소셜미디어","SNS","크리에이터","인플루언서","콘텐츠 제작","커뮤니티"],"objects":["친구 네트워크","관심 커뮤니티","크리에이터 콘텐츠","직접 제작"],"formats":["피드","숏폼","라이브","게시물·뉴스레터"],"occasions":["틈새 시간","정보 탐색","관계 유지","창작·홍보"],"modes":["수동 열람","댓글·공유","커뮤니티 참여","제작·수익화"],"payments":["무료·광고형","구독·멤버십","후원","브랜드 협업"],"motivations":["관계","정보 발견","자기표현","인정·수익"],"barriers":["피로·중독","허위정보","괴롭힘","개인정보"],"sources":["REL-NVIDIA-NPK-1.0"]},
    {"code":"career_professional","name_ko":"경력·전문활동","category":"work_career","unit":"person","keywords":["직업","경력","업무","취업","전문성","네트워킹"],"objects":["구직·이직","직무 수행","전문성 개발","네트워킹"],"formats":["채용 플랫폼","업무 도구","교육·자격","행사·커뮤니티"],"occasions":["취업 전환","성과 주기","프로젝트","승진·전직"],"modes":["개인 탐색","조직 지원","멘토링","전문가 협업"],"payments":["무료","개인 결제","회사 지원","성과 연계"],"motivations":["성장","안정","의미","보상"],"barriers":["시간 부족","정보 비대칭","비용","차별·프라이버시"],"sources":["REL-KOSTAT-REA-2024","REL-NVIDIA-NPK-1.0"]},
    {"code":"small_business_digital","name_ko":"소상공인·디지털 운영","category":"small_business","unit":"enterprise","keywords":["사업","식당","자영업","소상공인","온라인 판매","홈페이지"],"objects":["매장 운영","온라인 존재","주문·결제","고객 관리"],"formats":["오프라인 수기","플랫폼 입점","자체 웹·예약","운영 자동화"],"occasions":["창업","일상 영업","매출 부진","승계·전환"],"modes":["대표자 직접","가족 지원","직원 담당","외부 대행"],"payments":["무료 도구","건별 수수료","월 구독","구축 프로젝트"],"motivations":["신규 고객","운영 효율","매출 안정","승계 가능성"],"barriers":["디지털 학습 부담","수수료·비용","플랫폼 종속","개인·사업정보 보안"],"sources":["REL-MSS-SB-2023","REL-NVIDIA-NPK-1.0"]},
)


AXIS_DEFAULTS: dict[str, list[str]] = {
    "location":["가정","직장·학교","이동 중","상업·공공 장소"],
    "frequency_intensity":["거의 매일","주 1–4회","월 1–3회","비정기·휴면"],
    "discovery":["직접 검색","알고리즘 추천","지인·커뮤니티","오프라인 노출"],
    "acquisition_access":["직접 보유·구매","구독·회원권","플랫폼 중개","공공·공유 접근"],
    "device_channel_platform":["모바일","PC·웹","오프라인 매장·시설","전문가·중개 채널"],
    "decision_unit":["개인","가구 공동","보호자·가족","조직·사업체"],
    "engagement_participation":["열람·이용","저장·반복","평가·공유","제작·참여"],
    "loyalty_switching":["단일 선호","복수 병행","가격·혜택 전환","휴면·이탈"],
    "spending_value":["무지출","저가·가성비","중간 지출","프리미엄·고액"],
}


ARCHETYPE_PATTERNS = (
    ("핵심 반복형", "반복 이용과 습관이 강한 핵심 이용자", "거의 매일", "단일 선호"),
    ("편의 해결형", "시간과 노력을 줄이려는 편의 중심 이용자", "주 1–4회", "복수 병행"),
    ("탐색 발견형", "검색과 추천으로 새로운 대안을 넓히는 이용자", "주 1–4회", "가격·혜택 전환"),
    ("관계 참여형", "가족·지인·커뮤니티 참여가 중요한 이용자", "월 1–3회", "복수 병행"),
    ("프리미엄 몰입형", "품질과 몰입을 위해 선택적으로 지출하는 이용자", "월 1–3회", "단일 선호"),
    ("가치 최적화형", "가격·혜택을 비교해 효용을 최적화하는 이용자", "주 1–4회", "가격·혜택 전환"),
    ("충성 옹호형", "선호 대상에 반복 지출하고 주변에 추천하는 이용자", "거의 매일", "단일 선호"),
    ("장벽 휴면형", "비용·신뢰·접근 장벽으로 이용이 제한된 잠재 이용자", "비정기·휴면", "휴면·이탈"),
)


def domain_by_code(code: str) -> dict[str, Any]:
    for domain in DOMAIN_SEEDS:
        if domain["code"] == code:
            return domain
    raise KeyError(code)


def axis_values(domain: dict[str, Any], axis: str) -> list[str]:
    mapping = {
        "object": "objects",
        "format": "formats",
        "occasion": "occasions",
        "consumption_mode": "modes",
        "payment_monetization": "payments",
        "motivation_job": "motivations",
        "barrier_risk_trust": "barriers",
    }
    return list(domain[mapping[axis]]) if axis in mapping else list(AXIS_DEFAULTS[axis])


def build_domain_catalog() -> dict[str, list[dict[str, Any]]]:
    registries: list[dict[str, Any]] = []
    dimensions: list[dict[str, Any]] = []
    features: list[dict[str, Any]] = []
    feature_sources: list[dict[str, Any]] = []
    behaviors: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []
    archetypes: list[dict[str, Any]] = []
    for ordinal, domain in enumerate(DOMAIN_SEEDS, start=1):
        code = domain["code"]
        domain_id = f"DOM-{ordinal:02d}"
        registries.append({
            "domain_id":domain_id,
            "domain_code":code,
            "name_ko":domain["name_ko"],
            "description":f"대한민국 {domain['name_ko']}의 대상·형식·상황·행동·동기·장벽을 분리해 질의하는 Phase 2 도메인",
            "primary_entity_unit":domain["unit"],
            "category_code":domain["category"],
            "coverage_status":"complete_with_evidence_constraints",
            "active":True,
            "minor_guardrail":bool(domain.get("minor_guardrail")),
            "version":DOMAIN_VERSION,
        })
        for axis_order, axis in enumerate(COMMON_AXES, start=1):
            dimensions.append({
                "dimension_id":f"{domain_id}-DIM-{axis_order:02d}",
                "domain_id":domain_id,
                "axis_code":axis,
                "applicability":"applicable",
                "applicability_reason":"핵심 소비·사용 여정을 구성하는 공통축",
                "allowed_values":axis_values(domain, axis),
                "sort_order":axis_order,
            })
            targetability = "contextual_only" if axis in {"motivation_job","barrier_risk_trust"} else "proxy_targetable"
            if domain.get("minor_guardrail") or domain["category"] in {"children_education","parenting_private_education"}:
                targetability = "first_party_data_required" if axis in {"decision_unit","engagement_participation"} else "contextual_only"
            feature = {
                "feature_id":f"{domain_id}-FEAT-{axis_order:02d}",
                "domain_id":domain_id,
                "dimension_id":f"{domain_id}-DIM-{axis_order:02d}",
                "feature_code":f"{code}.{axis}",
                "label_ko":f"{domain['name_ko']} {axis}",
                "data_type":"category",
                "allowed_values":axis_values(domain, axis),
                "observable_status":"observable_or_declared" if axis not in {"motivation_job","barrier_risk_trust"} else "inferred_hypothesis",
                "targetability_class":targetability,
                "queryable":True,
            }
            features.append(feature)
            for release_id in domain["sources"]:
                feature_sources.append({
                    "feature_id":feature["feature_id"],
                    "release_id":release_id,
                    "evidence_role":"official_prior" if not release_id.startswith("REL-NVIDIA") else "synthetic_hypothesis_support",
                    "locator":"domain source map; exact table locator required for published numeric prior",
                    "claim_scope":"taxonomy vocabulary; not a direct population count",
                })
        extras = (
            ("recency","최근 이용 시점",["7일 이내","30일 이내","12개월 이내","12개월 초과"]),
            ("lifecycle_stage","도메인 생애주기",["잠재","신규","활성","휴면·이탈"]),
            ("need_state","미충족 필요 상태",["충족","부분 충족","대안 탐색","접근 불가"]),
            ("evidence_strength","근거 강도",["직접 관측","공식 사전분포","합성 프록시","탐색적 가설"]),
        )
        for extra_order, (suffix, label, values) in enumerate(extras, start=17):
            feature = {
                "feature_id":f"{domain_id}-FEAT-{extra_order:02d}",
                "domain_id":domain_id,
                "dimension_id":None,
                "feature_code":f"{code}.{suffix}",
                "label_ko":f"{domain['name_ko']} {label}",
                "data_type":"category",
                "allowed_values":values,
                "observable_status":"derived",
                "targetability_class":"contextual_only",
                "queryable":True,
            }
            features.append(feature)
            for release_id in domain["sources"]:
                feature_sources.append({"feature_id":feature["feature_id"],"release_id":release_id,"evidence_role":"derivation_input","locator":"derived feature definition","claim_scope":"classification only"})
        behavior_specs = (
            ("반복 핵심 이용", "frequency_intensity", "거의 매일"),
            ("주간 정기 이용", "frequency_intensity", "주 1–4회"),
            ("직접 검색 탐색", "discovery", "직접 검색"),
            ("추천 기반 발견", "discovery", "알고리즘 추천"),
            ("가족·동료 공동결정", "decision_unit", "가구 공동"),
            ("플랫폼 중개 접근", "acquisition_access", "플랫폼 중개"),
            ("평가·공유 참여", "engagement_participation", "평가·공유"),
            ("가격·혜택 전환", "loyalty_switching", "가격·혜택 전환"),
            ("프리미엄 선택 지출", "spending_value", "프리미엄·고액"),
            ("휴면·이탈 위험", "lifecycle_stage", "휴면·이탈"),
        )
        for behavior_order, (label, axis, value) in enumerate(behavior_specs, start=1):
            behaviors.append({
                "behavior_id":f"{domain_id}-BEH-{behavior_order:02d}",
                "domain_id":domain_id,
                "behavior_code":f"{code}.behavior_{behavior_order:02d}",
                "name_ko":f"{domain['name_ko']} {label}",
                "definition":f"{axis}에서 '{value}' 상태를 보이는 관측·선언 기반 행동 템플릿",
                "rule":{"feature":f"{code}.{axis}","op":"eq","value":value},
                "targetability_class":"contextual_only" if behavior_order in {10} else "proxy_targetable",
                "evidence_status":"template_not_population_estimate",
            })
        for tag_order, value in enumerate((*domain["motivations"], *domain["barriers"]), start=1):
            kind = "motivation" if tag_order <= 4 else "barrier"
            tags.append({
                "tag_id":f"{domain_id}-TAG-{tag_order:02d}",
                "domain_id":domain_id,
                "tag_code":f"{code}.{kind}_{tag_order if kind == 'motivation' else tag_order-4:02d}",
                "tag_type":kind,
                "name_ko":value,
                "overlap_allowed":True,
                "additive":False,
                "provenance":"curated interpretation axis; validate before activation",
            })
        for arc_order, (label, definition, frequency, loyalty) in enumerate(ARCHETYPE_PATTERNS, start=1):
            archetypes.append({
                "domain_archetype_id":f"{domain_id}-ARC-{arc_order:02d}",
                "domain_id":domain_id,
                "level":2,
                "parent_hierarchy_id":f"H-{domain_id}",
                "name_ko":f"{domain['name_ko']} {label}",
                "definition":definition,
                "rule":{"and":[{"feature":f"{code}.frequency_intensity","op":"eq","value":frequency},{"feature":f"{code}.loyalty_switching","op":"eq","value":loyalty}]},
                "targetability_class":"contextual_only",
                "estimate_status":"template_pending_parent_allocation",
            })
    return {
        "registries":registries,
        "dimensions":dimensions,
        "features":features,
        "feature_sources":feature_sources,
        "behaviors":behaviors,
        "tags":tags,
        "archetypes":archetypes,
    }
