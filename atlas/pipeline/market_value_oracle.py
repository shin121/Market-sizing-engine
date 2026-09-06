"""Independent DuckDB monetary moments; never reads serving bitmaps or cubes."""
import json,pathlib,duckdb
root=pathlib.Path(__file__).resolve().parents[1]
config=json.loads((root/'config/market-value.json').read_text()); anchor=config['anchors'][0]
catalog=json.loads((root/'server/data/atlas-catalog.json').read_text()); controls=json.loads((root/'config/population-controls.json').read_text())['controls']
c=duckdb.connect();c.execute('SET threads=4')
c.read_parquet(str(root/'work/atlas-v2/normalized.parquet')).create_view('normalized')
c.execute('CREATE TABLE controls(band INT,sex VARCHAR,pop DOUBLE)');c.executemany('INSERT INTO controls VALUES (?,?,?)',[(int(x['age_band'][:2]),'남자' if x['sex']=='male' else '여자',x['count']) for x in controls])
c.execute('CREATE VIEW eligible AS SELECT *,least(90,floor(age/10)*10)::INT AS band FROM normalized WHERE age>=20')
c.execute('CREATE TABLE weighted AS SELECT *,pop/count(*) OVER(PARTITION BY band,sex) AS w FROM eligible JOIN controls USING(band,sex)')
score='(1.0+'+'+'.join(f'{v}*cast(f_{k} AS INT)' for k,v in config['proxyCoefficients'].items())+')'
normalizers={(b,s):m for b,s,m in c.execute(f'SELECT band,sex,sum(w*{score})/sum(w) FROM weighted WHERE f_music GROUP BY 1,2').fetchall()}
arcs={a['id']:a['definition'] for a in catalog['archetypes']}
def pred(k):
 if k in arcs:return '('+' AND '.join('f_'+f for f in arcs[k])+')'
 if k=='age_30_49':return 'age between 30 and 49'
 if k.startswith('age_'):return 'band='+k[4:]
 return 'f_'+k
case_ids=[[],['music'],['age_70'],['age_20','age_70'],['arc_collecting_planning','pet','age_30_49'],['arc_paid_subscription_planning','age_30_49']]+[[x] for x in list(arcs)[::5][:10]]
results=[]
for ids in case_ids:
 where=' AND '.join(['f_music']+[pred(k) for k in ids])
 rows=c.execute(f'SELECT band,sex,count(*),sum(w),sum(w*{score}) FROM weighted WHERE {where} GROUP BY 1,2').fetchall()
 out=dict(ids=ids,eligible=0,participants=0,base=0,low=0,high=0,support=0)
 for band,sex,n,pop,moment in rows:
  a=next((a for a in anchor['ageBands'] if a['ageBand'].startswith(str(band))),None)
  if not a:continue
  participate=a['paidUsers']/a['musicUsers']; units=pop*participate; allocated=moment/normalizers[band,sex]*participate
  out['eligible']+=pop;out['participants']+=units;out['support']+=n
  for k,bins in [('low','binLow'),('base','binBase'),('high','binHigh')]:out[k]+=allocated*12*sum(p*v for p,v in zip(a['paymentShares'],anchor[bins]))/sum(a['paymentShares'])
 frac=.3 if out['support']>=1000 else .5
 out['low']*= (1-frac)*.8;out['high']*=(1+frac)*1.25
 results.append(out)
(root/'data/market-value-oracle.json').write_text(json.dumps({'method':'Independent SQL row predicates, weighted proxy moments and age×sex normalization. No serving index/cube input.','cases':results},ensure_ascii=False,indent=2))
print('Verified independent SQL monetary cases:',len(results),flush=True)
