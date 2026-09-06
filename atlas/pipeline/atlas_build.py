"""Overlapping commercial patterns from the complete, immutable Nemotron corpus.

Binary observed-bundle membership is deliberate: 0/1 is a membership weight, not
an invented probability. Calibration weights turn supported memberships into
population estimates. Industry/demographic features never define archetypes.
"""
import argparse, base64, gzip, hashlib, itertools, json, math, os, pathlib, time
os.environ.setdefault('OPENBLAS_NUM_THREADS','4')
os.environ.setdefault('OMP_NUM_THREADS','4')
import duckdb
import numpy as np
from threadpoolctl import threadpool_limits
ROOT=pathlib.Path(__file__).resolve().parents[1]
FIELDS=['sports_persona','arts_persona','travel_persona','culinary_persona','family_persona','hobbies_and_interests','persona']
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')))
def sql_quote(s):return "'"+s.replace("'","''")+"'"
def metrics(rates, base, feats, definition, population, universe):
 # Average Bernoulli Jensen-Shannon divergence excludes defining features and all category/demographic variables.
 indices=[i for i,f in enumerate(feats) if f['kind'] in ['behavior','need','channel'] and f['id'] not in definition]
 p=np.clip(rates[indices],1e-8,1-1e-8);q=np.clip(base[indices],1e-8,1-1e-8);m=(p+q)/2
 def kl(a,b):return a*np.log2(a/b)+(1-a)*np.log2((1-a)/(1-b))
 js=float(np.mean((kl(p,m)+kl(q,m))/2))
 ids={f['id']:i for i,f in enumerate(feats)}
 intensive=['paid','premium','paid_subscription','gear_upgrade','repeat_purchase','membership']
 components=[min(100,50*rates[ids[k]]/max(base[ids[k]],1e-8)) for k in intensive if k in ids]
 intensity=float(np.mean(components)) if components else None
 market_idx=[i for i,f in enumerate(feats) if f['kind']=='market']
 strong=[i for i in market_idx if rates[i]>.01 and rates[i]/max(base[i],1e-8)>=1.15]
 breadth=len(strong)
 weighted_breadth=sum(math.log2(rates[i]/base[i]) for i in strong)
 small=(1-min(1,population/(universe*.1)))*(.55*min(100,js*1500)+.45*(intensity or 0))
 return {'distinctiveness':js,'distinctivenessScore':min(100,round(js*1500)),'consumptionIntensity':round(intensity) if intensity is not None else None,'crossIndustryBreadth':breadth,'crossIndustryStrength':weighted_breadth,'smallStrongScore':round(small),'momentum':None,'spend':None}
def run():
 ap=argparse.ArgumentParser();ap.add_argument('--source',default=os.environ.get('NEMOTRON_DIR','/Users/woocheolshin/Projects/Market-sizing-engine_v3/Data/nemotron'));ap.add_argument('--target',type=int,default=56);args=ap.parse_args();started=time.time()
 cfg=json.loads((ROOT/'config/atlas-features.json').read_text());features=cfg['features'];controls=json.loads((ROOT/'config/population-controls.json').read_text())['controls']
 c=duckdb.connect();c.execute('SET threads=4');c.read_parquet(str(pathlib.Path(args.source)/'*.parquet')).create_view('raw')
 assert c.execute('SELECT count(*),count(DISTINCT uuid) FROM raw').fetchone()==(1000000,1000000)
 state=[(p.name,p.stat().st_size,p.stat().st_mtime_ns) for p in sorted(pathlib.Path(args.source).glob('*.parquet'))]
 key=hashlib.sha256((json.dumps(cfg,sort_keys=True,ensure_ascii=False)+json.dumps(state)+'atlas-normalize-3').encode()).hexdigest()
 normalized=ROOT/'work/atlas-v2/normalized.parquet';meta=ROOT/'work/atlas-v2/cache.json';normalized.parent.mkdir(parents=True,exist_ok=True)
 if not normalized.exists() or not meta.exists() or json.loads(meta.read_text())['key']!=key:
  # Conservative sentence omission handles explicit negation. Unmentioned is never interpreted as true absence.
  fields=[f"regexp_replace({field}, '[^。.!?]*(관심이 없|즐기지 않|좋아하지 않|전혀 이용하지 않|구매하지 않)[^。.!?]*', '', 'g')" for field in FIELDS]
  text_expr="concat_ws('。',"+','.join(fields)+')'
  predicates={f['id']:f"regexp_matches(txt,{sql_quote(f['pattern'])})" for f in features}
  expr=[]
  for f in features:
   pred=predicates[f['id']]
   if f['parent']:pred=f"({pred}) AND ({predicates[f['parent']]})"
   expr.append(pred+' AS f_'+f['id'])
  c.execute(f"COPY (WITH texts AS (SELECT uuid,age,sex,province,family_type,housing_type,education_level,marital_status,{text_expr} txt FROM raw) SELECT * EXCLUDE(txt),{','.join(expr)} FROM texts ORDER BY uuid) TO {sql_quote(str(normalized))} (FORMAT PARQUET,COMPRESSION ZSTD)")
  save(meta,{'key':key,'sourceShards':state});print('Normalized 125 proposed features',round(time.time()-started,1),flush=True)
 # Submarkets are detected in relevant narrative fields, not unrelated life domains.
 scope_map={
  'food':['culinary_persona'],'delivery':['culinary_persona'],'travel':['travel_persona'],
  'fitness':['sports_persona'],'music':['arts_persona'],'content':['arts_persona'],
  'gaming':['arts_persona','hobbies_and_interests'],'family':['family_persona'],
  'pet':['family_persona','hobbies_and_interests','persona'],
  'home':['hobbies_and_interests','family_persona','persona'],
  'garden':['hobbies_and_interests','family_persona'],
  'collect':['hobbies_and_interests','arts_persona'],'photo':['hobbies_and_interests','arts_persona'],
  'beauty':['hobbies_and_interests','arts_persona','persona'],
  'education':['career_goals_and_ambitions','hobbies_and_interests','arts_persona'],
  'wellness':['sports_persona','hobbies_and_interests','persona'],
  'community':['sports_persona','arts_persona','family_persona'],
  'commerce':['hobbies_and_interests','culinary_persona','persona'],
  'mobility':['hobbies_and_interests','travel_persona'],
  'finance':['hobbies_and_interests','persona']}
 scoped=ROOT/'work/atlas-v2/interests.parquet';scope_meta=ROOT/'work/atlas-v2/interests-cache.json'
 scope_key=hashlib.sha256((key+json.dumps(scope_map,sort_keys=True)).encode()).hexdigest()
 if not scoped.exists() or not scope_meta.exists() or json.loads(scope_meta.read_text())['key']!=scope_key:
  expressions=[]
  for f in features:
   if f['kind']!='interest':continue
   field_expr="concat_ws('。',"+','.join(scope_map[f['parent']])+')'
   cleaned=f"regexp_replace({field_expr}, '[^。.!?]*(관심이 없|즐기지 않|좋아하지 않|전혀 이용하지 않|구매하지 않)[^。.!?]*', '', 'g')"
   expressions.append(f"regexp_matches({cleaned},{sql_quote(f['pattern'])}) AS f_{f['id']}")
  c.execute(f"COPY (SELECT uuid,{','.join(expressions)} FROM raw ORDER BY uuid) TO {sql_quote(str(scoped))} (FORMAT PARQUET,COMPRESSION ZSTD)")
  save(scope_meta,{'key':scope_key,'fieldScopes':scope_map})
 c.read_parquet(str(normalized)).create_view('baseframe');c.read_parquet(str(scoped)).create_view('scoped')
 replacements=','.join(f"(scoped.f_{f['id']} AND baseframe.f_{f['parent']}) AS f_{f['id']}" for f in features if f['kind']=='interest')
 c.execute(f'CREATE VIEW frame AS SELECT baseframe.* REPLACE({replacements}) FROM baseframe JOIN scoped USING(uuid)')
 rows=c.execute('SELECT * EXCLUDE(uuid) FROM frame ORDER BY uuid').fetchnumpy();n=len(rows['age']);weights=np.zeros(n,np.float64);strata=[]
 for control in controls:
  lo=int(control['age_band'][:2]);hi=99 if '+' in control['age_band'] else lo+9
  mask=(rows['age']>=lo)&(rows['age']<=hi)&(rows['sex']==('남자' if control['sex']=='male' else '여자'));count=int(mask.sum());w=control['count']/count;weights[mask]=w
  strata.append({'id':control['age_band']+'_'+control['sex'],'weight':w,'population':control['count'],'count':count,'mask':mask})
 eligible=weights>0;universe=float(weights.sum());support=int(eligible.sum())
 masks={f['id']:rows['f_'+f['id']]&eligible for f in features}
 rejected=[]
 for f in features:
  f['support']=int(masks[f['id']].sum());f['populationEstimate']=float(weights[masks[f['id']]].sum());f['share']=f['populationEstimate']/universe
  f['sourceFields']=scope_map.get(f['parent'],FIELDS)
  f['basis']='합성 서술의 명시적 어휘 검출'
  if f['support']<cfg['minimumSupport']:rejected.append({'id':f['id'],'label':f['label'],'support':f['support'],'reason':'insufficient full-corpus support'})
 features=[f for f in features if f['support']>=cfg['minimumSupport']]
 ids={f['id']:i for i,f in enumerate(features)};X=np.column_stack([masks[f['id']] for f in features]);base=np.array([f['share'] for f in features])
 commercial=[f for f in features if f['kind'] in ['behavior','need','channel']];ci=[ids[f['id']] for f in commercial]
 discovery=eligible&(np.arange(n)%5!=0);holdout=eligible&~discovery
 def pair_counts(mask):
  a=X[mask][:,ci].astype(np.float32);w=weights[mask].astype(np.float32)
  with threadpool_limits(limits=4):joint=a.T@(a*w[:,None])
  return joint, a.sum(axis=0),float(w.sum())
 joint,disc_support,disc_total=pair_counts(discovery);held,held_support,held_total=pair_counts(holdout)
 diag=np.diag(joint);held_diag=np.diag(held);candidates=[]
 for i,j in itertools.combinations(range(len(commercial)),2):
  a,b=commercial[i],commercial[j]
  if not (a['mechanism'] or b['mechanism']):continue
  if 'paid' in [a['id'],b['id']] and ({a['id'],b['id']}&{'planned_purchase','impulse','gear_upgrade','ecommerce','membership','paid_subscription'}):continue
  if {a['id'],b['id']}=={'community_info','community_channel'}:continue
  if a['family']=='pain' and b['family']=='pain':continue
  pop=float(joint[i,j]); prior=float(diag[i]*diag[j]/disc_total);lift=pop/prior if prior else 0
  union=float(diag[i]+diag[j]-pop);jaccard=pop/union if union else 0
  hp=float(held[i,j]);hlift=hp/(held_diag[i]*held_diag[j]/held_total) if held_diag[i]*held_diag[j] else 0
  expected_pop=pop/disc_total*universe
  if expected_pop<18000 or lift<1.08 or hlift<1.04 or jaccard>.8 or pop/min(diag[i],diag[j])>.97:continue
  stable=abs(hp/held_total-pop/disc_total)/max(.0001,pop/disc_total)<.22
  if not stable:continue
  definition=[a['id'],b['id']];m=masks[a['id']]&masks[b['id']];ns=int(m.sum())
  if ns<400:continue
  weighted_population=float(weights[m].sum())
  rates=(X[m]*weights[m,None]).sum(axis=0)/weighted_population
  derived=metrics(rates,base,features,definition,weighted_population,universe)
  meaningful=[k for k,f in enumerate(features) if f['kind'] in ['behavior','need','channel'] and f['id'] not in definition and rates[k]>=.01 and (rates[k]/base[k]>=1.15 or rates[k]/base[k]<=.8)]
  # Require at least five explanatory indexes outside the bundle definition.
  if len(meaningful)<5:continue
  anchor=min([f for f in [a,b] if f['mechanism']],key=lambda f:f['share']);qualifier=b if anchor['id']==a['id'] else a
  prefixes={'recovery':'휴식·보상','planning':'계획 중심','adventure':'새 경험','digital':'디지털 활용','expression':'취향 표현','connection':'교류 중심','convenience':'편의 우선','pain_physical':'활동 제약','pain_digital':'디지털 부담','growth':'배움 중심','ownership':'소유 지향','creator_discovery':'영상 탐색','review':'후기 확인','search_info':'정보 검증','paid':'구매 연계','ecommerce':'온라인 탐색','offline':'현장 참여','collecting':'수집 중심','community_channel':'커뮤니티 참여','routine':'정기 이용','quality':'품질 중시','value_seeking':'실속 지향'}
  mechanisms={'price_compare':'가격비교','discount':'혜택활용','value_seeking':'실속선택','premium':'프리미엄선택','planned_purchase':'신중구매','impulse':'즉흥구매','paid':'유료이용','repeat_purchase':'단골선택','review':'후기검증','search_info':'정보탐색','community_info':'커뮤니티검증','expert':'전문가활용','recommendation':'지인추천','offline_consult':'직접확인','creator_discovery':'콘텐츠탐색','collecting':'수집몰입','gear_upgrade':'장비구매','fandom':'팬덤참여','practice':'실력추구','paid_subscription':'구독서비스이용','ecommerce':'온라인구매','offline':'현장이용','specialist':'전문채널이용','delivery_order':'배달주문','membership':'레슨이용'}
  name=prefixes.get(qualifier['id'],qualifier['stem'])+' '+mechanisms.get(anchor['id'],anchor['stem'])+'형'
  quality=math.log1p(weighted_population/30000)+min(4,math.log2(lift))+.012*derived['distinctivenessScore']+.15*derived['crossIndustryBreadth']
  candidates.append({'id':'arc_'+ '_'.join(sorted(definition)),'name':name,'kind':'archetype','family':anchor['family'],'anchor':anchor['id'],'definition':definition,'populationEstimate':weighted_population,'share':weighted_population/universe,'low':weighted_population*(.7 if ns>=1000 else .5),'high':min(universe,weighted_population*(1.3 if ns>=1000 else 1.5)),'support':ns,'signalRates':rates.tolist(),'associationLift':lift,'holdoutLift':float(hlift),'holdoutRelativeDifference':float(abs(hp/held_total-pop/disc_total)/max(.0001,pop/disc_total)),'qualityScore':quality,'independentIndexCount':len(meaningful),'metrics':derived,'membershipMethod':'observed_conjunction_0_1','qualityReasons':['purchase_or_selection_mechanism','repeated_bundle','heldout_stability','five_nondefining_indexes']})
 print('Qualifying candidates',len(candidates),round(time.time()-started,1),flush=True)
 # Diversity-aware selection; do not fill the target with duplicate or unsupported bundles.
 candidates.sort(key=lambda a:a['qualityScore'],reverse=True);selected=[];anchor_counts={};family_counts={}
 first_by_anchor={}
 for a in candidates:first_by_anchor.setdefault(a['anchor'],a)
 prioritized=list(first_by_anchor.values())+[a for a in candidates if a not in first_by_anchor.values()]
 for candidate in prioritized:
  if anchor_counts.get(candidate['anchor'],0)>=3 or family_counts.get(candidate['family'],0)>=12:continue
  mask=np.logical_and.reduce([masks[k] for k in candidate['definition']]);duplicate=False
  for other in selected:
   if len(set(candidate['definition'])&set(other['definition']))==0:continue
   other_mask=masks[other['id']];overlap=float(weights[mask&other_mask].sum());union=candidate['populationEstimate']+other['populationEstimate']-overlap
   if overlap/max(union,1)>.68:duplicate=True;break
  if duplicate:continue
  selected.append(candidate);masks[candidate['id']]=mask;anchor_counts[candidate['anchor']]=anchor_counts.get(candidate['anchor'],0)+1;family_counts[candidate['family']]=family_counts.get(candidate['family'],0)+1
  if len(selected)>=args.target:break
 assert 30<=len(selected)<=80,f'Only {len(selected)} supported distinct archetypes; inspect evidence, not filler'
 dimensions=[]
 def dim(id,label,kind,mask):
  masks[id]=mask&eligible;dimensions.append({'id':id,'label':label,'kind':kind,'family':'demographic','support':int(masks[id].sum()),'populationEstimate':float(weights[masks[id]].sum())})
 for lo,hi in [(20,29),(30,39),(40,49),(50,59),(60,69),(70,99)]:dim('age_'+str(lo),str(lo)+'대' if hi<99 else '70세 이상','age',(rows['age']>=lo)&(rows['age']<=hi))
 dim('age_30_49','30–49세','age_range',(rows['age']>=30)&(rows['age']<=49))
 for k,l in [('남자','남성'),('여자','여성')]:dim('sex_'+('male' if k=='남자' else 'female'),l,'sex',rows['sex']==k)
 province_names={'서울':'서울','경기':'경기','인천':'인천','부산':'부산','대구':'대구','대전':'대전','광주':'광주','울산':'울산','세종':'세종','강원':'강원','충청북':'충북','충청남':'충남','전북':'전북','전라남':'전남','경상북':'경북','경상남':'경남','제주':'제주'}
 for i,(key,label) in enumerate(province_names.items()):dim('region_'+str(i).zfill(2),label,'region',rows['province']==key)
 for field,kind in [('housing_type','housing'),('education_level','education'),('marital_status','marital')]:
  for i,value in enumerate(sorted(set(rows[field].tolist()))):dim(kind+'_'+str(i),value,kind,rows[field]==value)
 for id,label,pattern in [('hh_solo','1인 거주','혼자'),('hh_children','자녀와 거주','자녀'),('hh_parents','부모와 거주','부모'),('hh_partner','배우자와 거주','배우자')]:dim(id,label,'household',np.char.find(rows['family_type'].astype(str),pattern)>=0)
 masks['universe']=eligible;order=[];ranges=[];cursor=0
 for s in strata:
  indices=np.flatnonzero(s.pop('mask'));padding=(-len(indices))%32;order.extend(indices.tolist());order.extend([-1]*padding);ranges.append({'start':cursor//32,'end':(cursor+len(indices)+padding)//32,'weight':s['weight']});cursor+=len(indices)+padding
 order=np.array(order,np.int32);valid=order>=0;safe=np.maximum(0,order)
 retained=set([f['id'] for f in features]+[a['id'] for a in selected]+[d['id'] for d in dimensions]+['universe'])
 packed={id:base64.b64encode(gzip.compress(np.packbits(masks[id][safe]&valid,bitorder='little').tobytes(),mtime=0)).decode('ascii') for id in sorted(retained)}
 save(ROOT/'server/data/atlas-index.json',packed)
 count=np.sum(np.column_stack([masks[a['id']] for a in selected]),axis=1);overlap={'populationCovered':float(weights[count>0].sum()),'coverageShare':float(weights[count>0].sum()/universe),'sumMembershipPopulation':sum(a['populationEstimate'] for a in selected),'meanMemberships':float(np.sum(weights*count)/universe),'multipleMembershipShare':float(weights[count>=2].sum()/universe),'maxMemberships':int(count.max())}
 for a in selected:
  a['topSignals']=[features[i]['id'] for i in sorted([i for i,f in enumerate(features) if f['kind'] in ['behavior','need','channel'] and f['id'] not in a['definition'] and a['signalRates'][i]>.01],key=lambda i:abs(math.log2(max(.02,a['signalRates'][i]/base[i])))*math.sqrt(a['signalRates'][i]),reverse=True)[:10]]
  a['topMarkets']=[features[i]['id'] for i in sorted([i for i,f in enumerate(features) if f['kind']=='market' and a['signalRates'][i]>.01],key=lambda i:a['signalRates'][i]/base[i],reverse=True)[:8]]
  a['description']=' · '.join(next(f['label'] for f in features if f['id']==id) for id in a['definition'])+'가 함께 언급된 소비 패턴'
  a['demographics']=[{'id':d['id'],'label':d['label'],'kind':d['kind'],'share':float(weights[masks[a['id']]&masks[d['id']]].sum()/a['populationEstimate'])} for d in dimensions]
 catalog={'version':'nemotron-commercial-atlas-v2','indexEncoding':'gzip-base64','dataFingerprint':hashlib.sha256((ROOT/'server/data/atlas-index.json').read_bytes()).hexdigest(),'sourceRows':n,'eligibleRows':support,'excludedAge19':n-support,'population':universe,'referenceDate':'2024-11-01','sourceDate':'2026-04-20','sourceName':'NVIDIA Nemotron-Personas-Korea v1.0','sourceUrl':'https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea','license':'CC BY 4.0','features':features,'archetypes':selected,'dimensions':dimensions,'wordRanges':ranges,'wordLength':len(order)//32,'overlap':overlap,'unavailable':['actual_spend','income','ticket_size','market_momentum','competition','actual_willingness_to_pay'],'extraction':{'method':'weighted frequent signal pairs + heldout stability + non-defining index/overlap filters','definitionMembership':'binary observed conjunction; overlapping membership','discoveryRows':int(discovery.sum()),'holdoutRows':int(holdout.sum()),'qualifyingCandidates':len(candidates),'candidateCount':len(commercial)*(len(commercial)-1)//2,'minimumSupport':400,'minimumAssociationLift':1.08,'maxJaccard':.68,'nonDefiningIndexMinimum':5}}
 save(ROOT/'server/data/atlas-catalog.json',catalog);save(ROOT/'data/commercial-archetypes.json',selected);save(ROOT/'data/atlas-feature-audit.json',{'sourceRows':n,'featureCount':len(features),'commercialFeatures':len(commercial),'rejected':rejected,'features':[{k:v for k,v in f.items() if k!='pattern'} for f in features],'overlap':overlap,'extraction':catalog['extraction'],'seconds':round(time.time()-started,2)})
 save(ROOT/'data/industry-lens.json',[{k:f[k] for k in ['id','label','kind','family','support','populationEstimate','share','sourceFields']} for f in features if f['kind']=='market'])
 save(ROOT/'work/atlas-v2/candidates.json',candidates)
 # Reproducibility relation stays local; no raw identifiers in the deployed catalog/index.
 membership_sql=','.join('('+ ' AND '.join('f_'+id for id in a['definition'])+') AS '+a['id'] for a in selected)
 c.execute(f"COPY (SELECT uuid,{membership_sql} FROM frame ORDER BY uuid) TO {sql_quote(str(ROOT/'work/atlas-v2/memberships.parquet'))} (FORMAT PARQUET,COMPRESSION ZSTD)")
 top=sorted(selected,key=lambda a:a['populationEstimate'],reverse=True)[:30];labels={f['id']:f['label'] for f in features}
 lines=['# Commercial Archetype Top 30 — engine sanity check','','Sizes overlap. All entries are observed signal bundles, not exclusive classes. Market/demographic features are excluded from definitions.','','| 유형 | 인구 | 전체 비중 | 비정의 신호 Index | 상위 산업 Index | Distinctiveness | 소비강도 | 산업 수 |','|---|---:|---:|---|---|---:|---:|---:|']
 for a in top:
  def describe(keys):return ', '.join(labels[k]+' '+format(a['signalRates'][ids[k]]/base[ids[k]],'.2f')+'×' for k in keys[:3])
  lines.append('|'+a['name']+'|'+format(a['populationEstimate']/10000,'.1f')+'만|'+format(a['share']*100,'.1f')+'%|'+describe(a['topSignals'])+'|'+describe(a['topMarkets'])+'|'+format(a['metrics']['distinctiveness'],'.4f')+'|'+str(a['metrics']['consumptionIntensity'])+'|'+str(a['metrics']['crossIndustryBreadth'])+'|')
 (ROOT/'docs/ARCHETYPE_TOP_30.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps({'archetypes':len(selected),'features':len(features),'candidates':len(candidates),'overlap':overlap,'seconds':round(time.time()-started,1),'rejectedFeatures':rejected},ensure_ascii=False),flush=True)
if __name__=='__main__':run()
