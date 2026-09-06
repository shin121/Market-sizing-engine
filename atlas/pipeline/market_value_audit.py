"""Read-only full-corpus monetary audit. Outputs aggregate counts only."""
import duckdb,json,pathlib,os,time
root=pathlib.Path(__file__).resolve().parents[1]
source=pathlib.Path(os.environ.get('NEMOTRON_DIR','/Users/woocheolshin/Projects/Market-sizing-engine_v3/Data/nemotron'))
c=duckdb.connect();c.execute('SET threads=4');c.execute("SET memory_limit='2GB'")
c.read_parquet(str(source/'*.parquet')).create_view('raw')
schema=c.execute('describe raw').fetchall()
amount=r'([0-9][0-9,.]*\s*(만|천|백|억)?\s*원|₩\s*[0-9]|[0-9][0-9,.]*\s*(KRW|달러|dollars))'
freq=r'((월|주|연|년)\s*[0-9]+\s*(회|번)|[0-9]+\s*(회|번)\s*(정도)?\s*(매월|매주|매년))'
monetary=r'(지출|소비액|구매액|이용료|구독료|결제|회비|가격|금액|예산|spend|payment|price|budget)'
fields=[]
for name,dtype,*_ in schema:
    col='"'+name+'"'
    counts=c.execute(f"select count(*),count(*) filter(where {col} is not null and length(trim(cast({col} as varchar)))>0),count(*) filter(where regexp_matches(cast({col} as varchar),?)),count(*) filter(where regexp_matches(cast({col} as varchar),?)),count(*) filter(where regexp_matches(cast({col} as varchar),?)) from raw",[amount,freq,monetary]).fetchone()
    fields.append(dict(field=name,type=dtype,rows=counts[0],nonempty=counts[1],numericAmountMentions=counts[2],explicitFrequencyMentions=counts[3],monetaryLanguageMentions=counts[4]))
    print(name,counts[2:],flush=True)
out=dict(auditedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),shards=len(list(source.glob('*.parquet'))),rows=fields[0]['rows'],fields=fields,patterns=dict(amount=amount,frequency=freq,monetary=monetary))
(root/'data/market-value-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
# Bounded local context review, no identifiers. These snippets are never deployed.
samples={}
for f in fields:
    if f['numericAmountMentions']:
        n=f['field']
        samples[n]=c.execute(f'''select regexp_extract(cast("{n}" as varchar),?) from raw where regexp_matches(cast("{n}" as varchar),?) limit 12''',['.{0,80}'+amount+'.{0,90}',amount]).fetchall()
(root/'work/market-value/amount-contexts.json').write_text(json.dumps(samples,ensure_ascii=False,indent=2))
