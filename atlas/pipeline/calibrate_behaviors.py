"""Reproducible survey-anchored memberships; original lexical evidence is immutable.

This is a population model, not a new observation or a claim that the survey
measured any Nemotron archetype. No raw persona or identifier is required.
"""
import base64, gzip, hashlib, json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
def save(path, value):
    (ROOT/path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')
def main():
    cfg=json.loads((ROOT/'config/behavior-calibration.json').read_text())
    original=json.loads((ROOT/'server/data/atlas-catalog.json').read_text())
    index=json.loads((ROOT/'server/data/atlas-index.json').read_text())
    controls=json.loads((ROOT/'config/population-controls.json').read_text())['controls']
    raw={k:np.unpackbits(np.frombuffer(gzip.decompress(base64.b64decode(v)),dtype=np.uint8),bitorder='little').astype(bool) for k,v in index.items()}
    modeled={k:v.copy() for k,v in raw.items()}
    weights=np.zeros(len(raw['universe']))
    audit=[]
    for j,(r,control) in enumerate(zip(original['wordRanges'],controls)):
        eligible=np.arange(r['start']*32,r['end']*32)
        eligible=eligible[raw['universe'][eligible]]
        weights[eligible]=r['weight']
        age=int(control['age_band'][:2])
        rate=next(x for x in cfg['ageSexRates'] if x['sex']==control['sex'] and x['ageBand']==(control['age_band'] if age<70 else '70+'))
        def calibrate(key, universe, target, evidence):
            rng=np.random.default_rng(cfg['seed']+j*1000+sum(map(ord,key)))
            n=round(len(universe)*target)
            positive=universe[evidence[universe]]
            other=universe[~evidence[universe]]
            chosen=np.concatenate([rng.permutation(positive)[:n],rng.permutation(other)[:max(0,n-len(positive))]])
            modeled[key][eligible]=False
            modeled[key][chosen]=True
            audit.append({'id':key,'stratum':control['age_band']+'_'+control['sex'],'targetRate':target,'denominator':len(universe),'modelMembers':len(chosen),'observedMembers':int(raw[key][eligible].sum())})
        calibrate('digital',eligible,rate['internetRate'],raw['digital']|raw['ecommerce'])
        digital=eligible[modeled['digital'][eligible]]
        calibrate('ecommerce',digital,rate['shoppingGivenInternet'],raw['ecommerce'])
        category=next(x for x in cfg['beautyParticipation']['ageSexRates'] if x['sex']==control['sex'] and x['ageBand']==(control['age_band'] if age<70 else '70+'))
        # Survey reports separate multiple-response categories, not their union.
        # A+B-A*B is an explicit overlap proxy, never a measured union rate.
        a,b=category['fashionSports'],category['cosmetics']
        calibrate('beauty',eligible[modeled['ecommerce'][eligible]],a+b-a*b,raw['beauty'])
        if age<70:
            calibrate('planned_purchase',eligible,cfg['prepurchase']['informationSearchRate'],raw['planned_purchase']|raw['review']|raw['search_info'])
            planned=eligible[modeled['planned_purchase'][eligible]]
            calibrate('review',planned,cfg['prepurchase']['reviewConditionalProxy'],raw['review'])
    # Commerce market is explicitly annual online shoppers in this revised model.
    modeled['commerce']=modeled['ecommerce'].copy()
    for a in original['archetypes']:
        modeled[a['id']]=np.logical_and.reduce([modeled[k] for k in a['definition']])
    changed={k:v for k,v in modeled.items() if not np.array_equal(v,raw[k])}
    encoded={k:base64.b64encode(gzip.compress(np.packbits(v,bitorder='little').tobytes(),mtime=0)).decode() for k,v in changed.items()}
    save('server/data/atlas-calibrated-index.json',encoded)
    counts={k:float(weights[v].sum()) for k,v in modeled.items()}
    # Derived catalog carries modeled marginals; lexical extraction quality stays historical.
    featureIds=[f['id'] for f in original['features']]
    rates={a['id']:[float(weights[modeled[a['id']]&modeled[k]].sum()/counts[a['id']]) if counts[a['id']] else 0 for k in featureIds] for a in original['archetypes']}
    memberships=np.sum(np.stack([modeled[a['id']] for a in original['archetypes']]),axis=0)
    cases=[]
    for ids in [[],['arc_planned_purchase_review'],['arc_ecommerce_planned_purchase'],['arc_delivery_order_digital'],['home'],['home','arc_planned_purchase_review'],['arc_planned_purchase_review','arc_ecommerce_planned_purchase'],['home','arc_planned_purchase_review','arc_ecommerce_planned_purchase']]:
        old=np.logical_and.reduce([raw[k] for k in ids]) if ids else raw['universe']
        new=np.logical_and.reduce([modeled[k] for k in ids]) if ids else raw['universe']
        cases.append({'ids':ids,'observedPopulation':float(weights[old].sum()),'population':float(weights[new].sum()),'observedSupport':int(old.sum()),'modelMembers':int(new.sum())})
    save('server/data/atlas-calibration.json',{'version':cfg['version'],'observedFingerprint':original['dataFingerprint'],'modelFingerprint':hashlib.sha256((ROOT/'server/data/atlas-calibrated-index.json').read_bytes()).hexdigest(),'changedIds':list(changed),'populations':counts,'archetypeRates':rates,'overlap':{'coverageShare':float(weights[memberships>0].sum()/weights.sum()),'multipleMembershipShare':float(weights[memberships>1].sum()/weights.sum()),'meanMemberships':float((weights*memberships).sum()/weights.sum())}})
    save('data/population-calibration-audit.json',{'version':cfg['version'],'seed':cfg['seed'],'sources':cfg['sources'],'assumptions':cfg['assumptions'],'strata':audit,'cases':cases,'allEntities':[{'id':k,'observedPopulation':float(weights[raw[k]].sum()),'population':counts[k],'observedSupport':int(raw[k].sum()),'modelMembers':int(modeled[k].sum()),'changed':k in changed} for k in counts]})
    print(json.dumps({'changed':len(changed),'cases':cases},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
