"""Independent SQL oracle: row predicates and census weights, without postings/cubes."""
import json,pathlib,duckdb
ROOT=pathlib.Path(__file__).resolve().parents[1]
c=duckdb.connect();c.execute('SET threads=4');catalog=json.loads((ROOT/'server/data/atlas-catalog.json').read_text());controls=json.loads((ROOT/'config/population-controls.json').read_text())['controls']
c.read_parquet(str(ROOT/'work/atlas-v2/normalized.parquet')).create_view('normalized')
c.execute("CREATE VIEW eligible AS SELECT *, least(90,floor(age/10)*10)::INTEGER AS band FROM normalized WHERE age>=20")
c.execute('CREATE TABLE controls(band INTEGER,sex VARCHAR,pop DOUBLE)')
c.executemany('INSERT INTO controls VALUES (?,?,?)',[(int(r['age_band'][:2]),'남자' if r['sex']=='male' else '여자',r['count']) for r in controls])
c.execute('CREATE VIEW weighted AS SELECT *,pop/count(*) OVER(PARTITION BY band,sex) AS w FROM eligible JOIN controls USING(band,sex)')
arcs={a['id']:a['definition'] for a in catalog['archetypes']}
def predicate(id):
 if id in arcs:return '('+' AND '.join('f_'+k for k in arcs[id])+')'
 if id.startswith('age_'):
  if id=='age_30_49':return 'age BETWEEN 30 AND 49'
  lo=int(id[4:]);return f'age BETWEEN {lo} AND {99 if lo==70 else lo+9}'
 return 'f_'+id
ids=list(arcs);cases=[[],['age_20','age_70'],['pet'],['pet','age_30_49']]+[[a] for a in ids]+[[a,m,'age_30_49'] for a,m in zip(ids[::5],['pet','travel','education','beauty','wellness','food','content','finance','home','collect','music'])]+[[ids[0],ids[1]],['pet','pain_time'],['travel','review']]
results=[]
for scope in cases:
 where=' AND '.join(predicate(k) for k in scope) or 'TRUE'
 n,pop,ws=c.execute(f'SELECT count(*),coalesce(sum(w),0),coalesce(sum(w*w),0) FROM weighted WHERE {where}').fetchone()
 results.append({'ids':scope,'support':n,'population':pop,'weightSquareSum':ws})
(ROOT/'data/atlas-oracle.json').write_text(json.dumps({'method':'Independent DuckDB weighted row predicates; no posting or cube input','cases':results},indent=2))
print('Oracle:',len(results),'contexts; universe',results[0])
