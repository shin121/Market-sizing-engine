import collections, hashlib, json, pathlib, time, os
import duckdb

ROOT = pathlib.Path(__file__).resolve().parents[1]/'data'
SOURCE = pathlib.Path(os.environ.get('NEMOTRON_DIR','/Users/woocheolshin/Projects/Market-sizing-engine_v3/Data/nemotron'))
con = duckdb.connect()
con.execute("SET threads=4")
con.read_parquet(str(SOURCE/'*.parquet')).create_view('raw')
schema = con.execute('DESCRIBE raw').fetchall()
stats = con.execute('SELECT count(*), count(distinct uuid), min(age), max(age), count(*) FILTER(WHERE age=19) FROM raw').fetchone()
fields = []
for name, dtype, *_ in schema:
    total, missing, unique = con.execute(f'SELECT count(*), count(*) FILTER(WHERE "{name}" IS NULL OR trim(CAST("{name}" AS VARCHAR))=\'\'), approx_count_distinct("{name}") FROM raw').fetchone()
    fields.append({'name':name,'type':dtype,'missing':missing,'approxDistinct':unique})
    print(name, missing, unique, flush=True)
shards = [{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(SOURCE.glob('*.parquet'))]
distributions = {}
for field in ['sex','family_type','housing_type','province','occupation','education_level','marital_status']:
    distributions[field] = con.execute(f'SELECT "{field}", count(*) n FROM raw GROUP BY 1 ORDER BY n DESC').fetchall()
# Inspect vocabulary from every record, not just the first shard.
vocabulary = con.execute("SELECT token, count(*) n FROM (SELECT unnest(regexp_extract_all(hobbies_and_interests_list, '[가-힣A-Za-z]{2,}')) token FROM raw) GROUP BY token ORDER BY n DESC LIMIT 350").fetchall()
result = {'source':str(SOURCE),'rows':stats[0],'uniqueIds':stats[1],'minAge':stats[2],'maxAge':stats[3],'age19Rows':stats[4],'fields':fields,'shards':shards,'distributions':distributions,'hobbyVocabulary':vocabulary}
(ROOT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'rows':stats,'vocabulary':vocabulary[:150]},ensure_ascii=False),flush=True)
