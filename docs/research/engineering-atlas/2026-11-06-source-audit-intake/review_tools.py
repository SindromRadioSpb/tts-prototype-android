"""Literal qualifiers and definitions checked in HE-crops-01..07 and full pp172/173."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];path=ROOT/'scripts/atlas/corrections/a97001.json'
data=json.loads(path.read_text(encoding='utf-8'))
src=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
pages={p['page']:p for p in json.loads((src/'publication_snapshot.json').read_text(encoding='utf-8'))}
obs={o['id']:o for o in json.loads((src/'all_observations.json').read_text(encoding='utf-8'))}
changes={}
current_pages={p['page']:p for f in (ROOT/'data/atlas/a97001/sections').glob('*.json') for p in json.loads(f.read_text(encoding='utf-8'))['pages']}
vowels=re.compile('[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]')
def target(oid,override=None):
 o=obs[oid];page=o['page'];idx=int(re.search(r'items\[(\d+)\]',o.get('published_field',o.get('published_path',''))).group(1)) if override is None else override
 baseline_item=pages[page]['items'][idx]
 item=next(i for i in current_pages[page]['items'] if i['id']==baseline_item['id']);key=item['id']
 if key not in changes:changes[key]={'page':page,'item':item,'fields':{'he_niqqud':item['he_niqqud'],'ru':item['ru']},'ids':[]}
 c=changes[key]
 if oid not in c['ids']:c['ids'].append(oid)
 return c
def replace(oid,old,new,ru='',override=None):
 c=target(oid,override);s=c['fields']['he_niqqud'];plain='';positions=[]
 for i,char in enumerate(s):
  if not vowels.match(char):plain+=char;positions.append(i)
 assert old in plain,(oid,old)
 start=plain.index(old);end=start+len(old)
 a=positions[start];b=positions[end] if end<len(positions) else len(s)
 c['fields']['he_niqqud']=s[:a]+new+s[b:]
 if ru:c['fields']['ru']+=' '+ru
def append(oid,he,ru,override=None):
 c=target(oid,override);c['fields']['he_niqqud']+=' '+he;c['fields']['ru']+=' '+ru
tables={}
def cell(oid,index,he,ru,table_index=None):
 o=obs[oid];page=o['page'];ti=table_index if table_index is not None else int(re.search(r'tables\[(\d+)\]',o.get('published_field',o.get('published_path',''))).group(1))
 t=next(t for t in current_pages[page]['tables'] if t['id']==pages[page]['tables'][ti]['id'])
 if t['id'] not in tables:tables[t['id']]={'page':page,'table':t,'fields':{'cells':copy.deepcopy(t['cells'])},'ids':[]}
 c=tables[t['id']];c['ids'].append(oid);c['fields']['cells'][index].update(he=he,ru=ru)


def finish():
 for c in changes.values():
  data['structure'].append({'page':c['page'],'section':pages[c['page']]['section_id'],'op':'set','id':c['item']['id'],'fields':c['fields'],'audit_ids':c['ids'],'why':'Literal source-pixel review; qualifiers restored without guessing unreadable data'})
 for c in tables.values():
  data['structure'].append({'page':c['page'],'section':pages[c['page']]['section_id'],'op':'set','collection':'tables','id':c['table']['id'],'fields':c['fields'],'audit_ids':c['ids'],'why':'Source table cells and captions checked against PDF pixels'})
 path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
