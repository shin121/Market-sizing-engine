"""Extract numeric facts from the official 2024 MCST report (PDF path argument).

Requires pdfplumber. No PDF or survey microdata is copied to the application.
The last table column has an incomplete outer border; recover it by row crop.
Sample counts are retained for audit only and never used as population weights.
"""
import hashlib
import json
from pathlib import Path
import sys
import pdfplumber

pdf_path = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / 'config/research/leisure-observations.json'
activity_codes = [
    ['A7','A2','A1','A8','A5','A3','A4','A6'],
    ['B14','B12','B11','B15','B9','B10','B13'],
    ['C17','C16','C18','C19'],
    ['D31','D29','D32','D20','D23','D25','D22','D30','D24','D35','D21','D27','D33','D34','D26','D36','D28','D37'],
    ['E39','E48','E47','E38','E46','E41','E42','E43','E44','E40','E45'],
    ['F63','F58','F64','F67','F59','F55','F65','F53','F70','F66','F51'],
    ['F52','F56','F60','F62','F68','F54','F61','F57','F69','F50','F49'],
    ['G74','G71','G75','G73','G72','G77','G79','G76','G78'],
    ['H84','H85','H83','H82','H81','H86','H80','H88','H87'],
]
ages = ['20대','30대','40대','50대','60대','70세 이상']
regions = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주']

def table(page):
    found = page.find_tables()[0]
    rows = found.extract()
    last = found.rows[0].cells[-1]
    for i,row in enumerate(rows[1:],1):
        if row[-1] is None:
            ref = next(c for c in found.rows[i].cells if c is not None)
            row[-1] = page.crop((last[0],ref[1],last[2],ref[3])).extract_text().strip()
    return rows

def rate(value):
    # A dash is an unobserved sample response, not known zero prevalence.
    return None if value == '-' else float(value) / 100

activities = []
with pdfplumber.open(pdf_path) as pdf:
    for n,codes in zip(range(128,145,2),activity_codes):
        national = table(pdf.pages[n-1])
        regional = table(pdf.pages[n])
        by_label = {r[1]:r for r in national[2:]}
        by_region = {r[1]:r for r in regional[1:]}
        assert len(national[0])-3 == len(codes)
        for j,code in enumerate(codes,3):
            record = {
                'code':code, 'label':national[0][j].replace('\n',''),
                'pdfPage':n,'printedPage':n-22,
                'overallRate':rate(national[1][j]),
                'ageRates':{age:rate(by_label[age][j]) for age in ages},
                'sexRates':{sex:rate(by_label[sex][j]) for sex in ['남성','여성']},
                'regionRates':{region:rate(by_region[region][j]) for region in regions},
            }
            for group in ['ageRates','sexRates','regionRates']:
                assert all(v is None or 0 <= v <= 1 for v in record[group].values()), record
            activities.append(record)
assert len(activities) == 88
output = {
    'sourceId':'MCST-LEISURE-2024',
    'referencePeriod':'2023-08-01 ~ 2024-07-31',
    'surveyUniverse':'대한민국 15세 이상, 지난 1년 1회 이상 여가활동 경험 (복수응답)',
    'sampleSize':10075,
    'sha256':hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
    'url':'https://www.mcst.go.kr/site/s_policy/dept/deptView.jsp?pSeq=2060&pDataCD=0417000000&pType=02',
    'unit':'person','rateUnit':'fraction',
    'nullMeaning':'원표 대시: 표본에서 응답 없음. 모집단 유병률 0으로 간주하지 않음.',
    'limitations':['연령·성별·지역은 별도 주변분포이며 교차표가 아님.','활동마다 정의가 다름. 미용은 화장품 사용, 사진은 휴대폰 촬영, 쇼핑/외식은 일상 식사를 대신하지 않음.'],
    'activities':activities,
}
destination.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(f'Extracted {len(activities)} activities; SHA256 {output["sha256"]}')
