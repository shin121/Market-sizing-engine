"""Human-labelled extraction regressions found while reading real corpus contexts."""
import importlib.util,json,pathlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
FEATURES={f['id']:f for f in json.loads((ROOT/'config/atlas-features.json').read_text())['features']}
class LexicalRegression(unittest.TestCase):
 def test_positive_and_negative_contexts(self):
  cases=[
   ('gear_upgrade','집안의 전등 교체부터 무거운 짐 옮기기까지 도맡는다.',False),
   ('gear_upgrade','새 카메라를 구매하기 전에 장비 가격을 비교한다.',True),
   ('pain_time','가족들과 함께하는 시간만큼은 한없이 부드러워진다.',False),
   ('pain_time','시간이 부족해 요리를 준비하기 어렵다.',True),
   ('pain_time','요즘 시간이 없어 장보기를 미루곤 한다.',True),
   ('expert','전문 상담사로 자리 잡거나 대리점을 운영하고 싶다.',False),
   ('expert','전문가의 조언을 받아 장비를 선택한다.',True),
   ('offline_consult','역사의 현장을 직접 확인시켜 준다.',False),
   ('offline_consult','실제 구매는 매장에서 직접 만져보고 결정한다.',True),
   ('paid_subscription','건강 관련 유튜브 채널을 구독한다.',False),
   ('paid_subscription','집에서 넷플릭스로 영화와 드라마를 시청한다.',True),
   ('price_compare','대형 마트에서 생필품의 가격을 꼼꼼히 비교한다.',True),
   ('pain_choice','배달 메뉴를 고를 때는 결정 장애로 오래 고민한다.',True),
   ('pain_cost','가격이 비싸 부담을 느낀다.',True),
  ]
  for id,text,expected in cases:
   with self.subTest(id=id,text=text): self.assertEqual(bool(re.search(FEATURES[id]['pattern'],text)),expected)
 def test_career_provider_roles_excluded_from_commercial_scope(self):
  spec=importlib.util.spec_from_file_location('atlas_build',ROOT/'pipeline/atlas_build.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  self.assertNotIn('professional_persona',module.FIELDS);self.assertNotIn('career_goals_and_ambitions',module.FIELDS)
if __name__=='__main__':unittest.main()
