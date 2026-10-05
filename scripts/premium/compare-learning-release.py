"""Compare owner input with a captured public baseline by source ID and both text keys."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


def load(p): return json.loads(p.read_text(encoding='utf-8'))
def digest(v): return hashlib.sha256(json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
def rows(t): return t.get('rows') or []
def reading(t):
    return [{key: row.get(key) or '' for key in ['hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru']} for row in rows(t)]
def save(p,v): p.write_text(json.dumps(v, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('--dir',type=Path,required=True); args=p.parse_args()
    inventory=load(args.dir/'input-inventory.json'); incoming=load(args.dir/'private-input-texts.json'); base=args.dir/'baseline/data/benyehuda'
    snapshot=load(args.dir/'baseline/snapshot.json'); root=load(base/'corpus-catalog-v7.json')
    cards={}
    for manifest in root['manifests']:
        data=load(base/manifest['file'])
        cards.update({str(c['id']):c for c in data.get('works',data.get('cards',[]))})
    old={str(id):load(base/'works'/f'{id}.json')['library']['texts'] for id in root['pointers']['ready']}
    oldkeys=defaultdict(list)
    for id, texts in old.items():
        for text in texts: oldkeys[text['text_key']].append(id)
    report=[]; cross=[]
    for item,record in zip(incoming, inventory['works']):
        text=item['text']; id=record['work_id']; previous=old.get(id)
        state='new' if previous is None else 'unchanged' if len(previous)==1 and reading(text)==reading(previous[0]) else 'replaced'
        matches=[]
        for kind,key in [('stored',record['stored_key']),('recomputed',record['recomputed_key'])]:
            for found in oldkeys.get(key,[]):
                matches.append({'kind':kind,'published_work_id':found})
                if found!=id: cross.append({'work_id':id,'key_kind':kind,'published_work_id':found,'key':key})
        report.append({**record,'state':state,'in_catalog':id in cards,'published_keys':[t['text_key'] for t in previous] if previous else [],'published_rows':sum(len(rows(t)) for t in previous) if previous else 0,'key_matches_published':matches, 'reading_sha256':digest(reading(text)), 'previous_reading_sha256':digest([r for t in previous for r in reading(t)]) if previous else None})
    inids={r['work_id'] for r in report}; missing=[r['work_id'] for r in report if not r['in_catalog']]
    summary={'baseline_version':snapshot['cache_version'],'baseline_catalog':snapshot['version'],'baseline_ready':len(old),'input_works':len(report),'input_rows':sum(r['rows'] for r in report),'actions':dict(Counter(r['state'] for r in report)),'preserved_public_works':len(set(old)-inids),'union_ready':len(set(old)|inids),'input_not_in_discovery_catalog':missing,'cross_work_key_matches':len(cross),'ready_rows_before':sum(len(rows(t)) for ts in old.values() for t in ts),'ready_rows_candidate':sum(len(rows(t)) for id,ts in old.items() if id not in inids for t in ts)+sum(r['rows'] for r in report)}
    save(args.dir/'comparison.json',{'summary':summary,'works':report,'cross_work_key_matches':cross})
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print('Historical 28026:',json.dumps(next(r for r in report if r['work_id']=='28026'),ensure_ascii=False,indent=2))


if __name__=='__main__':main()
