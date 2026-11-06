"""Narrow canonical follow-up; do not rerun historical authoring batches."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
path=ROOT/'scripts/atlas/corrections/a97001.json'
cfg=json.loads(path.read_text(encoding='utf-8'))
changes=[(28,'b011','weight','equilibrium#mechanics'),(172,'b001','weight','equilibrium#thermodynamics'),
         (167,'b003','mass',None),(167,'b005','mass',None),(167,'b008','mass',None)]
evidence=[]
for page,suffix,slug,replacement in changes:
 sid='s04-parallel-forces' if page==28 else 's17-steels'
 section=json.loads((ROOT/f'data/atlas/a97001/sections/{sid}.json').read_text(encoding='utf-8'))
 item=next(i for p in section['pages'] if p['page']==page for i in p['items'] if i['id']==f'a97001:p{page}:{suffix}')
 old=f'a97001:term:{slug}#mechanics'
 refs=[r for r in item.get('terms',[]) if r!=old]
 if replacement and 'a97001:term:'+replacement not in refs:refs.append('a97001:term:'+replacement)
 matches=[o for o in cfg['structure'] if o.get('op')=='set' and o.get('id')==item['id'] and o.get('collection','items')=='items']
 if matches:op=matches[-1]
 else:
  op={'op':'set','section':sid,'page':page,'collection':'items','id':item['id'],'fields':{}}
  cfg['structure'].append(op)
 op['fields']['terms']=refs
 op['why']='Independent acceptance 3.11.865: equilibrium with article is not weight; dissolution is not mass'
 op['followup_ids']=['F02' if slug=='weight' else 'F03']
 evidence.append({'id':item['id'],'source_he':item['he'],'source_ru':item['ru'],'removed':old,'replacement':replacement,'verdict':'confirmed','source_pdf_page':page})
path.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
out=Path(__file__).with_name('term-evidence.json')
if not out.exists():out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Canonical term fixes:',len(changes))
