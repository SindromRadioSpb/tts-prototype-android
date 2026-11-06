"""Explicit source places and definitions; no substring-based assignment of senses."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];HERE=Path(__file__).resolve().parent
path=ROOT/'scripts/atlas/corrections/a97001.json';cfg=json.loads(path.read_text(encoding='utf8'))
sections={f.stem:json.loads(f.read_text(encoding='utf8')) for f in (ROOT/'data/atlas/a97001/sections').glob('*.json')}
pages={p['page']:(s,p) for s in sections.values() for p in s['pages']};terms={k:copy.deepcopy(v) for s in sections.values() for k,v in s['terms'].items()}
source97002={k.split(':term:',1)[1]:copy.deepcopy(v) for f in (ROOT/'data/atlas/a97002/sections').glob('*.json') for k,v in json.loads(f.read_text(encoding='utf8')).get('terms',{}).items()}
vowels=re.compile('[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]');evidence=[];changed_objects={}
def strip(s):return vowels.sub('',s)
def setfields(sid,page,collection,oid,fields):
 matches=[o for o in cfg['structure'] if o['op']=='set' and o.get('id')==oid and o.get('collection','items')==collection]
 if matches:o=matches[-1];o['fields'].update(copy.deepcopy(fields))
 else:o={'section':sid,'page':page,'op':'set','collection':collection,'id':oid,'fields':copy.deepcopy(fields),'why':'R04/R06: reviewed source-specific learning reference'};cfg['structure'].append(o)
 o['reacceptance_ids']=sorted(set(o.get('reacceptance_ids',[])+['R04','R06']))
def sectionfields(s,fields):
 matches=[o for o in cfg['structure'] if o['op']=='section' and o.get('section')==s['id']]
 if matches:o=matches[-1];o['fields'].update(copy.deepcopy(fields))
 else:o={'section':s['id'],'op':'section','fields':copy.deepcopy(fields),'why':'R04/R06: reviewed dictionary and source coverage'};cfg['structure'].append(o)
 o['reacceptance_ids']=sorted(set(o.get('reacceptance_ids',[])+['R04','R06']))
def link(page,obj,termid,sense,collection='items',cell=None):
 s,p=pages[page]
 if cell is None:target=obj;field='terms';source=obj.get('he',obj.get('caption_he',''))
 else:target=obj['cells'][cell];field='terms';source=target['he']
 ref=termid+'#'+sense
 if ref not in target.get(field,[]):target[field]=target.get(field,[])+[ref]
 changed_objects[(s['id'],page,collection,obj['id'])]=obj
 s['terms'][termid]=copy.deepcopy(terms[termid])
 evidence.append({'term':termid,'sense':sense,'section':s['id'],'page':page,'ref':obj['id'],
  'cell':({'row':target['row'],'col':target['col']} if cell is not None else None),'source_he':source,'source':'original97001.pdf#page='+str(page)})
def term(slug,niq,ru,definition):
 tid='a97001:term:'+slug
 if tid in terms:return tid,terms[tid]['senses'][0]['sense'],('added explicit source concept' if terms[tid].get('source')=='reviewed-a97001-reacceptance' else 'reused existing concept')
 base=source97002.get(slug)
 terms[tid]={'lemma_he':strip(niq),'niqqud':niq,'translit':'','translit_ru':'','senses':[{'sense':'technical','ru':ru,'context':definition}],
  'source':'reviewed-a97001-reacceptance','review_basis':'explicit named/defined source concept; no numeric source reconstruction'}
 if base and base.get('lemma_he')==strip(niq):
  for k in ['lemma_he','niqqud','translit','translit_ru']:terms[tid][k]=base.get(k,'')
 return tid,'technical','added explicit source concept'

table_rows={
 'length':(4,'t-derived-units',1,0),'volume':(4,'t-derived-units',3,0),'density':(5,'t-derived-units',1,0),
 'pressure':(5,'t-derived-units',3,0),'energy':(5,'t-derived-units',5,0),'power':(5,'t-derived-units',6,0),
 'work':(5,'t-derived-units',7,0),'section-modulus':(5,'t-derived-units',8,0),'force':(4,'t-derived-units',6,0),
 'flatness':(113,'t-geometric-symbols',2,1),'roundness':(113,'t-geometric-symbols',3,1),
 'cylindricity':(113,'t-geometric-symbols',4,1),'parallelism':(113,'t-geometric-symbols',5,1),
 'perpendicularity':(113,'t-geometric-symbols',6,1),'coaxiality':(113,'t-geometric-symbols',8,1)}
for line in HERE.joinpath('reviewed-concepts.tsv').read_text(encoding='utf8').splitlines():
 if not line or line.startswith('#'):continue
 slug,niq,ru,definition,places=line.split('|');tid,sense,decision=term(slug,niq,ru,definition)
 for loc in places.split(';'):
  pn,suffix=loc.split(':');page=int(pn);s,p=pages[page]
  if suffix=='table':
   pn,ts,row,col=table_rows[slug];assert pn==page;t=next(t for t in p['tables'] if t['id']==f'a97001:p{page}:{ts}');ci=next(i for i,c in enumerate(t['cells']) if c['row']==row and c['col']==col)
   link(page,t,tid,sense,'tables',ci)
  else:
   obj=next(x for x in p['items'] if x['id']==f'a97001:p{page}:{suffix}')
   link(page,obj,tid,sense)
 evidence[-1]['decision']=decision

# Restore the 18 reported missing entries only where the concept actually occurs.
for slug,page,ts,row,col in [
 ('mass',4,'t-base-units',2,0),('time',4,'t-base-units',3,0),('temperature',4,'t-base-units',5,0),
 ('area',4,'t-derived-units',2,0),('angle',4,'t-derived-units',4,0),('moment',5,'t-derived-units',2,0),
 ('stress',5,'t-derived-units',4,0),('velocity',5,'t-derived-units',11,0),('angular-velocity',5,'t-derived-units',12,0),('acceleration',5,'t-derived-units',13,0),
 ('metal',111,'t-stock-roughness',2,0),('forging',111,'t-stock-roughness',5,0),('rolling',111,'t-stock-roughness',7,0),('welding',111,'t-stock-roughness',9,0),
 ('aging',163,'t-steel-suffixes',3,2),('reinforcement',162,'t-steel-symbols',1,1)]:
 s,p=pages[page];t=next(t for t in p['tables'] if t['id']==f'a97001:p{page}:{ts}');ci=next(i for i,c in enumerate(t['cells']) if c['row']==row and c['col']==col);tid='a97001:term:'+slug
 link(page,t,tid,'mechanics','tables',ci)
link(171,next(i for i in pages[171][1]['items'] if i['id']=='a97001:p171:b001'),'a97001:term:crystal','mechanics')
# In this diagram G/W explicitly denote the physical weights; not the word in equilibrium.
link(35,next(f for f in pages[35][1]['figures'] if f['id']=='a97001:p35:img01'),'a97001:term:weight','mechanics','figures')

# Resolve the two disciplinary homonyms without changing their old mechanics sense/SRS keys.
for slug,sense,ru,definition,places in [
 ('reaction','interaction','сила реакции; противодействие','В третьем законе Ньютона силы взаимодействия равны по модулю, противоположны и приложены к разным телам; это не только реакция опоры.',[(7,'b009'),(7,'b010')]),
 ('moment','area-static','статический момент площади','Sx=ΣAi·yi, Sy=ΣAi·xi; размерность длины в кубе. Это не момент силы.',[(50,'b006')]),
  ('equilibrium','thermodynamics','термодинамическое равновесие','Равновесие фаз/структуры при заданных термодинамических условиях; не баланс сил и моментов.',[(120,'b002'),(166,'b004'),(172,'b001'),(201,'b003')])]:
 tid='a97001:term:'+slug
 if not any(x['sense']==sense for x in terms[tid]['senses']):terms[tid]['senses'].append({'sense':sense,'ru':ru,'context':definition})
 for page,suf in places:
  obj=next(i for i in pages[page][1]['items'] if i['id']==f'a97001:p{page}:{suf}');obj['terms']=[r for r in obj.get('terms',[]) if r!=tid+'#mechanics'];link(page,obj,tid,sense)
link(28,next(i for i in pages[28][1]['items'] if i['id']=='a97001:p28:b011'),'a97001:term:equilibrium','mechanics')

# Weight is not independently present in the compound "equilibrium"; dissolution is not mass.
aliases={
 'length':['אורך'],'line-of-action':['קו פעולה','קו פעולת הכוח'],'point-of-application':['נקודת אחיזה'],
 'inertia-law':['חוק ההתמדה','״חוק ההתמדה״'],'free-body-diagram':['״דיאגרמת גוף חפשי״'],'concurrent-forces':['כוחות משתפי נקדה'],'fixed-pulley':['גלגלת ניחת'],
 'force-couple':['צמד כוחות'],'internal-force':['כוחות פנימיים'],'truss-joint':['צמתים'],'joints-method':['שיטת הצמת'],
 'centroid-coordinates':['קואורדינטות מרכז הכבד'],'semicircle':['חצי מעגל'],'quarter-circle':['רבע מעגל'],
 'sliding-friction':['חכוך קינטי','חכוך דינמי'],'self-locking':['עצירה עצמית'],'maximum-height':['גבה שיא המסלול'],
 'rotation-frequency':['תדירות הסיבוב','תדירות סיבוב'],'hatching':['השטח המקוקו'],'local-section':['חתך חלקי'],'revolved-section':['חתך מקומי מסובב'],
 'stiffening-rib':['תמיכות'],'aligned-section':['חתך מישר'],'dimension-chain':['שרשרת'],
 'tool-relief':['תעלות שחרור'],'chamfer':['פאזות'],'geometric-tolerance':['סבולות גאומטריות'],
 'roundness':['עיגוליות'],'perpendicularity':['ניצבות'],'coaxiality':['מרכזיות'],'electron':['אלקטרונים'],'proton':['פרוטונים'],'neutron':['ניטרונים'],
 'bcc':['קביה מרכזת גוף'],'fcc':['קביה ממרכזת פאה'],'hcp':['מששה צפוף אריזה'],
 'thermal-conductivity':['הולכת חם'],'electrical-conductivity':['הולכת חשמל'],'dislocation':['נקע','נקעים'],
 'ultimate-tensile-strength':['מאמץ מקסימלי'],'safety-factor':['מקדם בטיחות'],
 'brinell-test':['שיטת ברינל'],'vickers-test':['שיטת ויקרס'],'rockwell-test':['שיטת רוקוול'],
 'charpy-test':['מבחן הנגיפה של צ׳רפי'],'izod-test':['מבחן הנגיפה של איזוד'],
 'eutectic':['ראקציה אוטקטית'],'eutectoid':['ראקציה אוטקטואידית'],'martensitic-transformation':['תגובה מרטנסיטית'],'chemical-reaction':['תגובה'],
 'atomization':['אטומיזציה'],'duralumin':['דוראל'],'cold-hardening':['הקשיה בעבוד קר'],
 'precipitate':['מתבדלים'],'specific-strength':['יחס חזק למשקל'],'fiber':['סיבים','סיבי']}
for slug,forms in aliases.items():terms['a97001:term:'+slug]['aliases_he']=forms
for page,suffix,slug in [(112,'b005','distance'),(117,'b004','distance'),(117,'b008','distance'),(190,'b007','distance'),
                         (6,'b003','dimension'),(24,'b007','dimension'),(50,'b004','dimension')]:
 obj=next(i for i in pages[page][1]['items'] if i['id']==f'a97001:p{page}:{suffix}')
 obj['terms']=[r for r in obj.get('terms',[]) if r!=f'a97001:term:{slug}#mechanics']
 changed_objects[(pages[page][0]['id'],page,'items',obj['id'])]=obj
# The preliminary map called p57:b005 sliding friction, but the actual row defines
# static friction symbols. Keep sliding friction only at its real p58 context.
obj=next(i for i in pages[57][1]['items'] if i['id']=='a97001:p57:b005')
obj['terms']=[r for r in obj.get('terms',[]) if r!='a97001:term:sliding-friction#technical']
changed_objects[(pages[57][0]['id'],57,'items',obj['id'])]=obj
evidence[:]=[e for e in evidence if not(e['ref']==obj['id'] and e['term']=='a97001:term:sliding-friction')]
for s in sections.values():
 for p in s['pages']:
  for obj in p['items']:
   refs=list(obj.get('terms',[]));he=obj.get('he','')
   without_equilibrium=re.sub(r'(?:שווי|שיווי)[־\s]+ה?משקל','',strip(he))
   if 'a97001:term:weight#mechanics' in refs and not re.search('משקל',without_equilibrium):refs.remove('a97001:term:weight#mechanics')
   # Explicitly reviewed dissolution/solubility contexts, not physical mass.
   if (p['page']==201 and obj['id'].endswith(':b003')) or obj['id'] in {
    'a97001:p167:b003','a97001:p167:b005','a97001:p167:b008'}:
    refs=[r for r in refs if r!='a97001:term:mass#mechanics']
   if refs!=obj.get('terms',[]):obj['terms']=refs;changed_objects[(s['id'],p['page'],'items',obj['id'])]=obj

for (sid,page,collection,oid),obj in changed_objects.items():setfields(sid,page,collection,oid,{'cells':obj['cells']} if collection=='tables' else {'terms':obj.get('terms',[])})
exclusions=[x for x in cfg.get('reacceptance_term_exclusions',[]) if x['term'] not in sections[x['section']]['terms']]
for s in sections.values():
 # The old dictionary entry for kinematic range was attached to safe בטוח in steels;
 # it has no source occurrence here. Preserve the global card and its learner state.
 if s['id']=='s17-steels' and 'a97001:term:range' in s['terms']:
  del s['terms']['a97001:term:range'];exclusions.append({'section':s['id'],'term':'a97001:term:range','reason':'No kinematic-range concept or טווח occurrence in this section; previous association was the safe/range homograph error.'})
 used={r.split('#')[0] for p in s['pages'] for it in p['items'] for r in it.get('terms',[])}
 used.update(r.split('#')[0] for p in s['pages'] for t in p['tables'] for c in t['cells'] for r in c.get('terms',[]))
 used.update(r.split('#')[0] for p in s['pages'] for f in p['figures'] for r in f.get('terms',[]))
 for tid in list(s['terms']):
  if tid not in used:
   exclusions.append({'section':s['id'],'term':tid,'lemma':s['terms'][tid]['lemma_he'],'reason':'No verified source place remains after semantic link review; not offered as a section term. Global concept and SRS keys remain available elsewhere.'});del s['terms'][tid]
 # Propagate added senses consistently in each section where the concept belongs.
 for tid in s['terms']:
  if tid in terms:s['terms'][tid]=copy.deepcopy(terms[tid])
 source_exclusions=[]
 for p in s['pages']:
  for f in p.get('figures',[]):
   if f['id'] in {f'a97001:p{pn}:img{im:02}' for pn,im in [(130,2),(130,3),(132,1),(132,2),(135,2),(135,3),(137,2),(137,3)]}:
    source_exclusions.append({'ref':f['id'],'field':'caption_he','reason':'Margin pro/con pictogram rendered as a localized grouping heading, not a separate source-text caption.'})
 sectionfields(s,{'terms':s['terms'],'context_exclusions':source_exclusions})
cfg['reacceptance_term_exclusions']=exclusions
path.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
HERE.joinpath('term-review-evidence.json').write_text(json.dumps({'source_places':evidence,'exclusions':exclusions},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Reviewed source places',len(evidence),'documented section exclusions',len(exclusions))
