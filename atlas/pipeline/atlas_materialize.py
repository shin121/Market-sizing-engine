"""Exact weighted common-context cubes, computed from the same posting frame.
No independence multiplication, imputation or synthetic filler is used.
"""
import base64,gzip,hashlib,json,os,pathlib,time
os.environ.setdefault('OPENBLAS_NUM_THREADS','4')
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run():
 t=time.time();catalog_path=ROOT/'server/data/atlas-catalog.json';index_path=ROOT/'server/data/atlas-index.json';c=json.loads(catalog_path.read_text());p=json.loads(index_path.read_text());digest=hashlib.sha256(catalog_path.read_bytes()+index_path.read_bytes()).hexdigest()
 masks={k:np.unpackbits(np.frombuffer(gzip.decompress(base64.b64decode(v)),np.uint8),bitorder='little').astype(bool) for k,v in p.items()};w=np.zeros(c['wordLength']*32,np.float64)
 for r in c['wordRanges']:w[r['start']*32:r['end']*32]=r['weight']
 w*=masks['universe'];keys=[f['id'] for f in c['features']];X=np.column_stack([masks[k] for k in keys]);sources=[[]]+[[k] for k in keys]+[[a['id']] for a in c['archetypes']]
 markets=[f['id'] for f in c['features'] if f['kind']=='market'];pains=[f['id'] for f in c['features'] if f['family']=='pain']
 sources += [[a['id'],m] for a in c['archetypes'] for m in markets]
 sources += [[m,p] for m in markets for p in pains]
 data={}
 for i,ids in enumerate(sources):
  key='~'.join(sorted(ids));mask=masks['universe'].copy()
  for id in ids:mask &= masks[id]
  n=int(mask.sum());ww=w[mask];population=float(ww.sum())
  if n:
   a=X[mask];counts=(a*ww[:,None]).sum(axis=0).tolist();supports=a.sum(axis=0).tolist()
  else:counts=[0]*len(keys);supports=[0]*len(keys)
  data[key]={'population':population,'support':n,'weightSquareSum':float(np.square(ww).sum()),'counts':counts,'supports':supports}
  if i%250==0:print('Materialized',i,'/',len(sources),round(time.time()-t,1),flush=True)
 out={'version':c['version'],'inputDigest':digest,'indexDigest':c['dataFingerprint'],'featureKeys':keys,'data':data}
 (ROOT/'server/data/atlas-cubes.json').write_text(json.dumps(out,separators=(',',':')))
 (ROOT/'data/atlas-cube-validation.json').write_text(json.dumps({'contexts':len(data),'featureColumns':len(keys),'inputDigest':digest,'seconds':round(time.time()-t,2),'bytes':(ROOT/'server/data/atlas-cubes.json').stat().st_size},indent=2))
 print('Done',len(data),round(time.time()-t,1),flush=True)
if __name__=='__main__':run()
