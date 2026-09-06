"""Extract numeric KCA 2025 observations; never publish survey microdata.

Usage: bundled-python scripts/extract-consumer-research.py /path/to/report.pdf
The official PDF includes Appendix 3 after the main report (offset +494).
Question 2 product-specific problem types use ALL problem experiencers as their
denominator, not product users. Keep respondent counts to undo that conditioning.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import pdfplumber

SOURCE_HASH = '7e070699b3d0bcdb66ee26e9edd3842d1fb3c366bf65124b54106e212ed8b06f'
source = Path(sys.argv[1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_HASH
out = Path(__file__).resolve().parents[1] / 'config/research/consumer-observations.json'
pages = {'problem': 497, **{key: 501 + 2 * i for i, key in enumerate([
    'quality', 'price', 'advertising', 'terms', 'contract', 'redress',
    'safety', 'privacy', 'information', 'education', 'explanation', 'delivery',
])}, 'online_channels': 601, 'offline_channels': 562,
         'priority_pc': 605, 'priority_mobile': 607,
         'priority_social': 609, 'priority_c2c': 611}
labels = ['2025년', '남성', '여성', '20대', '30대', '40대', '50대', '60대 이상',
          '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기',
          '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']


def compact(text):
    return re.sub(r'\s+', '', text or '')


def number(text):
    text = compact(text).replace(',', '').replace('(', '').replace(')', '')
    if not text or text == '-':
        return None
    assert re.fullmatch(r'\d+(\.\d+)?', text), text
    return float(text)


tables = {}
with pdfplumber.open(source) as pdf:
    for key, first in pages.items():
        rows = {}
        headers = []
        for n in [first, first + 1]:
            page = pdf.pages[n - 1]
            table = max(page.find_tables(), key=lambda t: len(t.rows))
            data = table.extract()
            headers = headers or [compact(v) for v in data[0][3:]]
            for i, row in enumerate(data):
                label = next((s for s in labels if compact(s) == compact(row[1])), None)
                if label is None:
                    continue
                values = []
                for col in range(2, len(row)):
                    # PDF omits the right border for most last-column cells.
                    # Recover characters by their centers using the header's
                    # column bounds and this row's bounds; do not turn null into 0.
                    cell = table.rows[i].cells[col]
                    if cell is None:
                        header = next((r.cells[col] for r in table.rows[:3] if r.cells[col] is not None), None)
                        if header is None:
                            values.append(None)
                            continue
                        x0, _, x1, _ = header
                        _, y0, _, y1 = table.rows[i].bbox
                        chars = [c for c in page.chars
                                 if x0 <= (c['x0'] + c['x1']) / 2 < x1
                                 and y0 <= (c['top'] + c['bottom']) / 2 < y1]
                        value = ''.join(c['text'] for c in sorted(chars, key=lambda c: c['x0']))
                    else:
                        value = row[col]
                    values.append(number(value))
                assert values[0] and values[0] > 0, (key, label)
                rows[label] = {'n': int(values[0]), 'values': values[1:]}
        assert set(rows) == set(labels), (key, set(labels) - set(rows))
        tables[key] = {'pdfPages': [first, first + 1], 'columns': headers, 'rows': rows}
        print(key, rows['2025년']['n'], rows['2025년']['values'])

assert tables['problem']['rows']['2025년']['n'] == 10000
assert tables['advertising']['rows']['2025년']['n'] == 5035
assert tables['problem']['rows']['2025년']['values'][26] == 8.2
assert tables['advertising']['rows']['2025년']['values'][26] == 6.9
assert tables['priority_c2c']['rows']['2025년']['n'] == 266
assert tables['priority_c2c']['rows']['2025년']['values'][5] == 28.6
out.write_text(json.dumps({
    'sourceId': 'KCA-CONSUMPTION-2025',
    'url': 'https://www.kca.go.kr/smartconsumer/sub.do?menukey=7301&mode=view&no=1004455437',
    'downloadUrl': 'https://www.kca.go.kr/smartconsumer/board/download.do?menukey=7301&fno=10054144&bid=00000146&did=1004455437',
    'sha256': SOURCE_HASH,
    'referencePeriod': '2025-05-16~2025-06-13 조사; 응답 시점 직전 1년 경험',
    'surveyUniverse': '전국 만 19세 이상, 가계 경제상황 인지 및 주요 소비결정 참여 성인 10,000명',
    'weighting': '원 보고서 p.57: 모수 추정을 위한 가중치 부여하지 않음',
    'problemDenominator': 'problem은 전체 응답자. 세부 문제 유형은 품목과 무관하게 한 번 이상 문제를 경험한 5,035명. 유형별 원표의 전체 표기보다 실제 표본수와 설문 문2를 함께 확인.',
    'missing': '공표 - 또는 확인 불가 셀은 null. 0.0은 반올림된 관측값.',
    'tables': tables,
}, ensure_ascii=False, indent=2) + '\n')
