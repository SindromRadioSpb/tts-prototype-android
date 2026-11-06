"""N05: fifteen addressed source concepts, not a dictionary-size quota."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];path=ROOT/'scripts/atlas/corrections/a97001.json'
cfg=json.loads(path.read_text(encoding='utf-8'))
sections={f.stem:json.loads(f.read_text(encoding='utf-8')) for f in (ROOT/'data/atlas/a97001/sections').glob('*.json')}
terms={k:copy.deepcopy(t) for s in sections.values() for k,t in s['terms'].items()}
new={
 'electric-current':('זֶרֶם חַשְׁמַלִּי','сила электрического тока','Заряд, проходящий через поперечное сечение за единицу времени; единица СИ — ампер.'),
 'amount-of-substance':('כַּמּוּת חֹמֶר','количество вещества','Величина, характеризующая число указанных структурных частиц; единица СИ — моль.'),
 'luminous-intensity':('עׇצְמַת אוֹר','сила света','Основная световая величина СИ в данном направлении; единица — кандела (cd). В этой строке PDF ошибочно написано עוצמת הארה (освещённость), но приведена кандела. Это редакторское уточнение величины, а не утверждение, что освещённость измеряется в канделах: для неё нужен люкс.'),
 'straightness':('יַשְׁרוּת','прямолинейность','Соответствие линии идеальной прямой; в таблице относится к допускам формы.'),
 'geometric-symmetry':('סִימֶטְרִיּוּת','симметричность','В этой таблице — симметричное расположение элементов относительно заданной базы; это геометрический допуск, а не общее упоминание симметрии тела.'),
 'circular-runout':('חֲרִיגוֹת','круговое биение','В данной строке таблицы показан знак кругового биения: изменение показания при полном обороте относительно базовой оси в рассматриваемом сечении. חריגות — общее слово об отклонениях; здесь значение установлено по знаку в PDF. Круговое и полное биение различаются.'),
 'material-toughness':('צְפִידוּת','вязкость материала; сопротивление ударному разрушению','Способность материала поглощать энергию до разрушения; в этом разделе оценивается при ударном нагружении. Не путать с вязкостью жидкости (צמיגות), твёрдостью или самим методом испытания.'),
 'bainite':('בֵּינִיט','бейнит','Структура продуктов превращения аустенита, включающая феррит и карбиды; отличается от перлита и мартенсита.'),
 'ledeburite':('לֶדֶבּוּרִיט','ледебурит','Эвтектическая структурная составляющая системы железо–цементит; при образовании состоит из аустенита и цементита. При дальнейшем охлаждении аустенит превращается.'),
 'critical-cooling-rate':('מְהִירוּת קֵרוּר קְרִיטִית','критическая скорость охлаждения','Минимальный темп охлаждения для получения мартенситной структуры в рассматриваемых условиях. Это изменение температуры за время, а не вектор перемещения; зависит от состава стали и условий обработки.')}
strip=lambda s:re.sub('[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]','',s)
for slug,(niq,ru,context) in new.items():
 tid='a97001:term:'+slug
 if tid not in terms:terms[tid]={'lemma_he':strip(niq),'niqqud':niq,'translit':'','translit_ru':'','senses':[{'sense':'technical','ru':ru,'context':context}], 'source':'reviewed-a97001-reacceptance','review_basis':'N05: explicit addressed source concept, PDF pixels checked; not a quantitative completeness claim'}
terms['a97001:term:critical-cooling-rate']['aliases_he']=['מהירות קריטית']
terms['a97001:term:luminous-intensity']['study_note']='В исходной строке ошибочно написано עוצמת הארה (освещённость), но единица cd — кандела — относится к силе света. Не учите эту строку как перевод «освещённость = сила света»: освещённость измеряется в люксах.'
terms['a97001:term:bainite']['pronunciation_override']={'niqqud':'בֵּינִיט','translit':'Beynit','translit_ru':'бейнит','basis':'Reviewed reading of the bainite eponym; the generic tsere-yod mater rule must not drop the diphthong, as in the separately corrected neutron card.'}
terms['a97001:term:rotation-frequency']['aliases_he']=list(dict.fromkeys(terms['a97001:term:rotation-frequency'].get('aliases_he',[])+['מהירות סיבובית']))
terms['a97001:term:bcc']['aliases_he']=list(dict.fromkeys(terms['a97001:term:bcc'].get('aliases_he',[])+['BCC']))
terms['a97001:term:fcc']['aliases_he']=list(dict.fromkeys(terms['a97001:term:fcc'].get('aliases_he',[])+['FCC']))
targets=[
 ('s01-units',4,'t-base-units',4,0,'electric-current'),('s01-units',4,'t-base-units',6,0,'amount-of-substance'),('s01-units',4,'t-base-units',7,0,'luminous-intensity'),('s01-units',5,'t-derived-units',10,0,'rotation-frequency'),
 ('s14-industrial-symbols',113,'t-geometric-symbols',1,1,'straightness'),('s14-industrial-symbols',113,'t-geometric-symbols',7,1,'geometric-symmetry'),('s14-industrial-symbols',113,'t-geometric-symbols',9,1,'circular-runout'),
 ('s15-materials-basics',122,'b004',None,None,'density'),('s16-mechanical-properties',141,'b002',None,None,'material-toughness'),
 ('s17-steels',166,'b004',None,None,'solid-solution'),('s17-steels',167,'b003',None,None,'bcc'),('s17-steels',172,'b001',None,None,'fcc'),('s17-steels',168,'b004',None,None,'bainite'),('s17-steels',168,'b005',None,None,'ledeburite'),('s17-steels',174,'b008',None,None,'critical-cooling-rate')]
evidence=[]
for sid,pn,suffix,row,col,slug in targets:
 s=sections[sid];pg=next(p for p in s['pages'] if p['page']==pn);coll='items' if row is None else 'tables';oid=f'a97001:p{pn}:{suffix}';obj=next(x for x in pg[coll] if x['id']==oid);tid='a97001:term:'+slug
 target=obj if row is None else next(c for c in obj['cells'] if c['row']==row and c['col']==col)
 ref=tid+'#'+terms[tid]['senses'][0]['sense']
 if ref not in target.get('terms',[]):target['terms']=target.get('terms',[])+[ref]
 s['terms'][tid]=copy.deepcopy(terms[tid]);fields={'terms':obj['terms']} if row is None else {'cells':obj['cells']}
 found=[o for o in cfg['structure'] if o.get('op')=='set' and o.get('id')==oid and o.get('collection','items')==coll]
 if found:op=found[-1];op['fields'].update(copy.deepcopy(fields))
 else:op={'section':sid,'page':pn,'op':'set','collection':coll,'id':oid,'fields':copy.deepcopy(fields)};cfg['structure'].append(op)
 op['followup_ids']=list(dict.fromkeys(op.get('followup_ids',[])+['N05']));op['why']='N05: addressed source concept available in section and trainer; original HE/RU preserved'
 evidence.append({'section':sid,'page':pn,'ref':oid,'cell':None if row is None else {'row':row,'col':col},'source_he':target.get('he'),'term':ref,'verdict':'confirmed','source_pdf_page':pn,'decision':'linked_existing' if slug not in new else 'added_source_concept'})
# Update each definition consistently while retaining every old global learner key.
for sid,s in sections.items():
 for tid in s['terms']:
  if tid in terms:s['terms'][tid]=copy.deepcopy(terms[tid])
 if sid=='s17-steels':
  # No physical mass, weight or kinematic velocity remains here; do not retain a dead
  # section card to manufacture dictionary/trainer equality.
  for slug in ['mass','velocity','weight']:
   tid='a97001:term:'+slug
   assert not any(tid+'#mechanics' in i.get('terms',[]) for p in s['pages'] for i in p['items'])
   s['terms'].pop(tid,None)
 found=[o for o in cfg['structure'] if o.get('op')=='section' and o.get('section')==sid]
 if found:found[-1]['fields']['terms']=copy.deepcopy(s['terms'])
 else:cfg['structure'].append({'op':'section','section':sid,'fields':{'terms':copy.deepcopy(s['terms'])},'why':'N05 section vocabulary'})
path.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
out=Path(__file__).with_name('coverage-evidence.json')
if not out.exists():out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Addressed N05 concepts',len(targets),'new global cards',len(new))
