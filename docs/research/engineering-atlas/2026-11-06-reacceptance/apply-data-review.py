"""Author reviewed R02/R03/R07/R08/R09 corrections; never edits supplier inputs."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
file=ROOT/'scripts/atlas/corrections/a97001.json';config=json.loads(file.read_text(encoding='utf8'))
sections={f.stem:json.loads(f.read_text(encoding='utf8')) for f in (ROOT/'data/atlas/a97001/sections').glob('*.json')}
pages={p['page']:(s,p) for s in sections.values() for p in s['pages']}
checks=[]
def update(page,collection,oid,fields,rid):
 s,p=pages[page];obj=next(x for x in p[collection] if x['id']==oid)
 obj.update(copy.deepcopy(fields))
 matches=[o for o in config['structure'] if o['op']=='set' and o.get('id')==oid and o.get('collection','items')==collection]
 if matches:op=matches[-1];op['fields'].update(fields)
 else:
  op={'page':page,'section':s['id'],'op':'set','collection':collection,'id':oid,'fields':fields,'why':'Independent reacceptance: source-specific semantic correction'};config['structure'].append(op)
 op['reacceptance_ids']=sorted(set(op.get('reacceptance_ids',[])+[rid]))
def page_update(page,fields,rid):
 s,p=pages[page];p.update(copy.deepcopy(fields))
 matches=[o for o in config['structure'] if o['op']=='page' and o.get('page')==page]
 if matches:op=matches[-1];op['fields'].update(fields)
 else:op={'page':page,'section':s['id'],'op':'page','fields':fields,'why':'Independent reacceptance: explicit page coverage/editorial scope'};config['structure'].append(op)
 op['reacceptance_ids']=sorted(set(op.get('reacceptance_ids',[])+[rid]))
wrong={
 'joint':[(59,'b003'),(68,'b004'),(70,'b003'),(77,'b001'),(86,'b004'),(90,'b003'),(117,'b010'),(131,'b004'),(174,'b007')],
 'element':[(2,'b006'),(3,'b006'),(6,'b002'),(6,'b003'),(20,'b001'),(23,'b002'),(115,'b002')],
 'reaction':[(176,'b004'),(184,'b004'),(189,'b004')],
 'distance':[(21,'b005'),(21,'b008'),(21,'b009'),(41,'b002'),(42,'b003'),(50,'b002'),(61,'b002')],
 'range':[(128,'b001')],
}
assert sum(map(len,wrong.values()))==27
for slug,places in wrong.items():
 for page,suffix in places:
  oid=f'a97001:p{page}:{suffix}';s,p=pages[page];it=next(i for i in p['items'] if i['id']==oid);bad=f'a97001:term:{slug}#mechanics'
  checks.append({'R':'R02','page':page,'id':oid,'removed':bad,'he':it['he'],'ru':it['ru'],'was_present':bad in it.get('terms',[])})
  update(page,'items',oid,{'terms':[t for t in it.get('terms',[]) if t!=bad]},'R02')
# Same idiom as the additional p183 finding; units are not geometric dimensions.
for page,suffix in [(183,'b002'),(119,'b005'),(168,'b003'),(72,'b002')]:
 oid=f'a97001:p{page}:{suffix}';it=next(i for i in pages[page][1]['items'] if i['id']==oid)
 update(page,'items',oid,{'terms':[t for t in it.get('terms',[]) if t!='a97001:term:dimension#mechanics']},'R03')
 checks.append({'R':'R03','page':page,'id':oid,'he':it['he'],'reason':'degree idiom or units, not a geometric dimension'})
# Explicit page notices remain visible when study columns/stages are hidden.
page_update(159,{'state':'partial','coverage_notice':{
 'he':'השכבה הלימודית חלקית: 32 שורות של דרגות הפלדה והנתונים המספריים שלהן לא תומללו ולא תורגמו. המפתח בלבד מופיע להלן. הסריקה המקורית זמינה, אך חלק מהמספרים הקטנים בה אינם קריאים בוודאות.',
 'ru':'Учебный текст неполон: 32 строки марок стали с числовыми данными не перенесены и не переведены. Ниже приведён только ключ обозначений. Оригинал доступен на скане, но часть мелких чисел нельзя надёжно прочитать. Не используйте этот ключ как полную числовую таблицу.'}},'R07')
# An obsolete source object is provenance, not a live target. Notes themselves stay intact.
for page,(s,p) in pages.items():
 valid={o['id'] for kind in ['items','figures','tables','examples'] for o in p.get(kind,[]) if o.get('id')}
 notes=copy.deepcopy(p.get('editor',[]));changed=False
 for note in notes:
  if isinstance(note,dict) and note.get('ref') and note['ref'] not in valid and note['ref']!=f'a97001:p{page}':
   checks.append({'R':'R08','page':page,'source_ref':note['ref'],'text':note.get('text'),'action':'explicit page note; previous ref retained as source_ref'})
   note['source_ref']=note.pop('ref');note['about']='page';changed=True
 if changed:page_update(page,{'editor':notes},'R08')
# Consolidated complete source paragraphs, rather than appended corrections.
for ti,ci,he,ru in [
 (0,5,'חלקים בעיבוד שבבי וייצור ברגים. סגסוגת בעלת חוזק גבוה ויכולות גבוהות לעיבוד שבבי, הנקראת לרוב ״סגסוגת לעיבוד שבבי חופשי באופן ממוכן״ — free machining alloy (FMA). בחירה מעולה לפרויקטים בהם נדרש עיבוד שבבי ממוכן באמצעות מחרטה. עיבוד במהירויות גבוהות יוצר שבבים עדינים הניתנים להסרה בקלות. מתאימה לייצור צורות מורכבות בעלות פרטים רבים.',
 'Детали, получаемые резанием, и винты. Высокопрочный сплав с хорошей обрабатываемостью резанием, называемый free machining alloy (FMA), — автоматный сплав. Подходит для механизированной обработки на токарном станке: при высокой скорости образуется мелкая, легко удаляемая стружка. Позволяет получать сложные формы с большим числом деталей.'),
 (1,3,'מטוסים (קונסטרוקציה/צנרת), בניית סירות, כלי בישול, ייצור כללי, יישומים ימיים, מכלי לחץ, עיבוד לוחות ומסגרות וקרון נגרר של משאיות. המקור מייחס לה את החוזק ואת עמידות ההתעייפות הגבוהים ביותר מבין סגסוגות האלומיניום שאינן ניתנות לטיפול תרמי מקשיח. התנגדות טובה באווירה ימית ולמי מלח ועבידות מעולה (workability). ניתנת בקלות למשיכה ולעיצוב (drawn, formed) לצורות מורכבות.',
 'Авиационные конструкции и трубопроводы, лодки, посуда, изделия общего назначения, морские изделия, сосуды под давлением, листовые изделия, рамы и кузова прицепов грузовых автомобилей. Источник заявляет наивысшую прочность и усталостную стойкость среди термически неупрочняемых алюминиевых сплавов; это обобщение следует оценивать для конкретной марки и состояния. Отмечены стойкость в морской атмосфере и солёной воде и хорошая формуемость (workability): сплав легко поддаётся вытяжке или формованию (drawn, formed) в сложные формы.')]:
 t=pages[200][1]['tables'][ti];cells=copy.deepcopy(t['cells']);cells[ci].update(he=he,ru=ru);update(200,'tables',t['id'],{'cells':cells},'R09')
config['reacceptance_review']={'base':'753f5bef652a52057df43cccc919904fe0acee25','checks':checks}
file.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
Path(__file__).with_name('data-review-evidence.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Authored R02/R03/R07/R08/R09; R08 count',sum(x['R']=='R08' for x in checks))
