import pdfplumber,re,json,hashlib,sys
from pathlib import Path
pdf=Path(sys.argv[1]) # Usage: python scripts/extract-food-research.py <official PDF>
selected=[2,540,442,443,444,445,501,503,506,525,526,650,651,654,668]
labels=['전체','수도권','충청권','호남권','대경권','동남권','강원권','1인 가구','2인 가구','3인 가구','4인 가구','5인 이상 가구','남성','여성','39세 이하','40~49세','50~59세','60세 이상','19~29세','30~39세']
data={'sourceId':'KREI-FOOD-2024','url':'https://www.krei.re.kr/foodSurvey/page/285?cmd=view&pst=503545','downloadUrl':'https://www.krei.re.kr/foodSurvey/board/atchDown.do?no=111061','sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'surveyPeriod':'2024-05-13 / 2024-08-04','surveyUniverse':'가구 주 구입자 18~79세, 성인 가구원 19~79세. 가구와 개인 표를 분리. 표의 비율은 가중 공표율이며 괄호 안 사례 수는 추정에 사용하지 않음.','tables':{}}
with pdfplumber.open(pdf) as p:
 for page in selected:
  text=p.pages[page+47].extract_text() or ''
  rows={}
  for line in text.splitlines():
   for label in sorted(labels,key=len,reverse=True):
    idx=line.find(label+' ')
    if idx<0:continue
    tail=line[idx+len(label):]
    if '(' not in tail:continue
    numbers=re.findall(r'\d[\d,]*(?:\.\d+)?',tail.split('(')[0])
    if numbers:rows[label]=[float(v.replace(',','')) for v in numbers]
    break
  data['tables'][str(page)]={'printedPage':page,'pdfPage':page+48,'title':next((l for l in text.splitlines() if '<표' in l),'응답자 분포'),'denominator':next((l for l in text.splitlines() if '응답대상:' in l),'가구 전체'),'rows':rows}
Path('config/research/food-observations.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print({p:t['rows'].get('전체') for p,t in data['tables'].items()})
