"""Addressed acceptance follow-up only; does not change source HE/RU paragraphs."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];path=ROOT/'scripts/atlas/corrections/a97001.json'
cfg=json.loads(path.read_text(encoding='utf-8'));evidence=[]
velocity=[(137,'b008'),(149,'b004'),(174,'b008'),(174,'b009'),(176,'b002'),(177,'b002'),(180,'b002'),(185,'b004')]
for page,suffix in velocity:
 sid='s16-mechanical-properties' if page<154 else 's17-steels'
 s=json.loads((ROOT/f'data/atlas/a97001/sections/{sid}.json').read_text(encoding='utf-8'))
 it=next(it for p in s['pages'] if p['page']==page for it in p['items'] if it['id']==f'a97001:p{page}:{suffix}')
 refs=[r for r in it.get('terms',[]) if r!='a97001:term:velocity#mechanics']
 matches=[o for o in cfg['structure'] if o.get('op')=='set' and o.get('id')==it['id'] and o.get('collection','items')=='items']
 if matches:op=matches[-1]
 else:
  op={'op':'set','section':sid,'page':page,'collection':'items','id':it['id'],'fields':{}};cfg['structure'].append(op)
 op['fields']['terms']=refs;op['why']='Acceptance 3.11.865: process rate/quickness is not vector velocity';op['followup_ids']=['F04']
 evidence.append({'id':it['id'],'source_he':it['he'],'source_ru':it['ru'],'removed':'a97001:term:velocity#mechanics','verdict':'confirmed','source_pdf_page':page})

updates={
 'particle':{'niqqud':'נְקֻדָּה חׇמְרִית'},
 'neutron':{'pronunciation_override':{'niqqud':'נֵיטְרוֹן','translit':'Neytron','translit_ru':'нейтрон','basis':'Reviewed lexical reading neytron; Academy physics/energy spelling נֵיטְרוֹן. Keep correct Hebrew niqqud; do not let generic mater handling drop /y/. https://terms.hebrew-academy.org.il/munnah/79349_2/prompt%20neutron'}},
 'bcc':{'lemma_he':'סריג קובי ממורכז־גוף','niqqud':'סָרִיג קֻבִּי מְמֻרְכַּז־גּוּף',
        'editorial_source_spelling':{'page':120,'ref':'a97001:p120:b003','he':'קביה מרכזת גוף','kind':'reader_source_spelling_preserved','source_layer':'published_reader_transcription'},
        'editorial_term_basis':'Academy modern physics (1993): body-centered cubic lattice; https://terms.hebrew-academy.org.il/Ktaim/ShowKtaim?kodErekhIvrit=3061'},
 'fcc':{'lemma_he':'סריג קובי ממורכז־פאה','niqqud':'סָרִיג קֻבִּי מְמֻרְכַּז־פֵּאָה',
        'editorial_source_spelling':{'page':120,'ref':'a97001:p120:b008','he':'קביה ממרכזת פאה','kind':'reader_source_spelling_preserved','source_layer':'published_reader_transcription'},
        'editorial_term_basis':'Academy modern physics (1993): face-centered cubic lattice; https://terms.hebrew-academy.org.il/munnah/84112_1/'}}
for slug,fields in updates.items():
 tid='a97001:term:'+slug;seen=0
 for op in cfg['structure']:
  terms=op.get('fields',{}).get('terms')
  if not isinstance(terms,dict) or tid not in terms:continue
  t=terms[tid];before=copy.deepcopy(t);t.update(copy.deepcopy(fields));seen+=1
  if slug=='particle':t['pronunciation_basis']='Explicit qamats qatan Unicode mark for /o/ in material adjective; lexical niqqud חָמְרִי in Academy physics (1993), https://terms.hebrew-academy.org.il/munnah/29200_2/material'
  if slug in ['bcc','fcc']:
   marker='Редакторская точная формулировка термина по словарю Академии; подпись в транскрипции: '+fields['editorial_source_spelling']['he']+'. Текст исходной страницы сохранён.'
   if marker not in t['senses'][0]['context']:t['senses'][0]['context']+=' '+marker
  evidence.append({'term':tid,'section':op['section'],'before':before,'after':copy.deepcopy(t),'verdict':'confirmed','followup':'F05' if slug in ['particle','neutron'] else 'F06'})
 assert seen,tid
path.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
out=Path(__file__).with_name('additional-term-evidence.json')
if not out.exists():out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Reviewed velocity places',len(velocity),'card updates',len(updates))
