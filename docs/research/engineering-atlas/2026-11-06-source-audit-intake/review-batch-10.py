"""Remaining readable captions and source qualifications, checked on PDF pixels."""
import collections,copy
import review_tools as R

def setobj(page,collection,index,fields,ids):
 obj=R.current_pages[page][collection][index]
 R.data['structure'].append({'page':page,'section':R.pages[page]['section_id'],'op':'set','collection':collection,'id':obj['id'],'fields':fields,'audit_ids':ids,'why':'Actual PDF page/crop inspected; literal readable source preserved'})

R.cell('HE-108-extra-42',12,'מוט צורתי T כפול','Двутавровый профиль (буквально в источнике: двойной T)',0)
t=R.current_pages[109]['tables'][0]
setobj(109,'tables',0,{'title_he':t['title_he']+' — תקן ISO; תקן גרמני','title_ru':t['title_ru']+' — стандарт ISO; немецкий стандарт'},['HE-109-extra-47','HE-109-extra-48'])
R.append('HE-128-extra-46','כותרת הטבלה: שטח.','Заголовок таблицы: «Площадь».')
R.append('HE-179-01','הקשיות תלויה בקצב הקירור. לפי הקשיות במרחקים שונים מהקצה המקורר קובעים את עומק החיסום.','Твёрдость зависит от скорости охлаждения; по твёрдости на разных расстояниях от охлаждаемого торца определяют глубину закалки.')
R.append('HE-189-01','במקור: מתכות אל ברזליות אינן מחלידות. הערה: אין להסיק מכך חסינות מקורוזיה.','В источнике: «Цветные металлы не ржавеют». Это не означает стойкости ко всем видам коррозии; ржавчиной называют продукты коррозии железа.')
R.append('HE-193-01','ככל שהגרגרים קטנים יותר, כך קצב הדיפוזיה מהיר יותר.','Источник прямо связывает уменьшение размера зёрен с увеличением скорости диффузии.')
R.append('HE-203-01','כאן נטפל בעקרונות של חומרים מורכבים.','Здесь рассматриваются принципы композитных материалов.')
# Source step 1 must be distinct from the example number.
item=R.current_pages[10]['items'][3]
setobj(10,'items',3,{'he_niqqud':item['he_niqqud'].replace('1.','1. 1.',1),'ru':item['ru'].replace('1.','1. 1.',1)},['SUP-F003'])
item=R.current_pages[21]['items'][3]
he=item['he_niqqud'];ru=item['ru']
# Keep the source anchors adjacent to the definitions; footnote blocks already exist.
he=he.replace('N/mm.','N/mm¹.',1).replace('mm.','mm².',1)
ru=ru.replace('Н/мм.','Н/мм¹.',1).replace('укорочение пружины, мм.','укорочение пружины, мм².',1)
setobj(21,'items',3,{'he_niqqud':he,'ru':ru},['SUP-F001'])
item=R.current_pages[24]['items'][5]
setobj(24,'items',5,{'he_niqqud':item['he_niqqud'].replace(', m.',', m³.',1),'ru':item['ru'].replace(', м.',', м³.',1)},['SUP-F001'])
# Figure occurrences: every one of the 73 units retained, including repeated dimensions.
units=R.json.loads((R.src/'full_audit_registry.json').read_text(encoding='utf-8'))['units']
unitids=set(R.obs['SUP-F005']['unit_ids']);groups=collections.defaultdict(list)
for u in units:
 if u['source_unit_id'] in unitids:groups[(u['page'],u['destination']['object_id'])].append(u['source_quote'])
assert sum(map(len,groups.values()))==73
for (page,oid),labels in groups.items():
 i=next(i for i,f in enumerate(R.current_pages[page]['figures']) if f['id']==oid);f=R.current_pages[page]['figures'][i]
 labels=[s.replace('vec(F₂)','F⃗₂').replace('right-angle square','∟ (90°)') for s in labels]
 text='; '.join(labels)
 setobj(page,'figures',i,{'caption_he':f.get('caption_he','')+' — '+text,'caption_ru':f.get('caption_ru','')+' Подписи исходного рисунка: '+text+'.'},['SUP-F005'])

def caption(page,index,he,ru,ids):
 f=R.current_pages[page]['figures'][index]
 setobj(page,'figures',index,{'caption_he':f.get('caption_he','')+' '+he,'caption_ru':f.get('caption_ru','')+' '+ru},ids)
caption(175,0,'Temperature °C: 0, 100, 200, 300, 400, 500, 600, 700; Temperature K: 300, 400, 500, 600, 700, 800, 900, 1000; Time sec: 0.1, 1, 10, 100, 1000, 10000, 100000; 50%, Ms, M60, M90.','Шкалы исходника: Temperature °C — 0–700 с шагом 100; Temperature K — 300–1000 с шагом 100; Time sec — 0.1, 1, 10, 100, 1000, 10000, 100000; линии 50%, Ms, M60, M90.',['MATH-LATE-006','MATH-LATE-005'])
caption(179,1,'Rockwell C Hardness: 20, 30, 40, 50, 60, 70; Jominy distance: 0, 10, 20, 30 (1/16 inch).','Шкала Rockwell C Hardness: 20, 30, 40, 50, 60, 70; Jominy distance: 0, 10, 20, 30 в 1/16 дюйма.',['MATH-LATE-006','MATH-LATE-005'])
caption(181,0,'Hardness, HRC: 20, 30, 40, 50, 60; 2 in (50 mm); 1040, 4140.','Шкала Hardness, HRC: 20, 30, 40, 50, 60; диаметр 2 in (50 mm); марки 1040, 4140.',['MATH-LATE-006','MATH-LATE-005'])
caption(187,0,'Se; 10³, 10⁴, 10⁵, 10⁶, 10⁷, 10⁸, 10⁹.','Обозначение Se; шкала числа циклов: 10³, 10⁴, 10⁵, 10⁶, 10⁷, 10⁸, 10⁹.',['MATH-LATE-006'])
caption(202,0,'121°C (250°F), 149°C (300°F), 171°C (340°F), 204°C (400°F), 232°C (450°F), 260°C (500°F); MPa: 50, 100, 150, 200, 250, 300; ksi: 10, 20, 30, 40; h: 0, 0.01, 0.1, 1, 10, 100, 10³, 10⁴, 10⁵; 30 min, 1 day, 1 week, 2 months, 1 year.','Шесть температурных кривых: 121°C/250°F, 149°C/300°F, 171°C/340°F, 204°C/400°F, 232°C/450°F, 260°C/500°F. Шкала МПа: 50–300 с шагом 50; ksi: 10, 20, 30, 40. Время, ч: 0, 0.01, 0.1, 1, 10, 100, 10³, 10⁴, 10⁵. Отметки: 30 min — 30 минут; 1 day — сутки; 1 week — неделя; 2 months — два месяца; 1 year — год.',['MATH-LATE-003','MATH-LATE-006'])
caption(201,0,'Temperature (°C); Time.','Исходные названия осей: Temperature (°C) — температура; Time — время.',['MATH-LATE-005'])
# Restore source English alongside Hebrew and Russian equivalents.
for page,index,phrase in [(156,2,'Low Carbon Steels'),(156,4,'Medium Carbon Steels'),(156,6,'High Carbon Steels'),(175,0,'TTT (Time, Temp, Transformation)'),(179,1,'The Jominy End Quench Test'),(180,0,'The Grossman End Quench Test'),(184,1,'Surface hardening'),(201,1,'Precipitation hardening / age hardening'),(201,2,'Solution Treatment'),(202,0,'Aging'),(202,1,'Overaging')]:
 c=R.target('MATH-LATE-005',index) if False else None
 item=R.current_pages[page]['items'][index]
 # Merge into a previously edited item in this batch, not a stale copy.
 key=item['id']
 if key in R.changes:
  R.changes[key]['fields']['he_niqqud']+=' ('+phrase+').';R.changes[key]['fields']['ru']+=' '+phrase+'.';R.changes[key]['ids'].append('MATH-LATE-005')
 else:setobj(page,'items',index,{'he_niqqud':item['he_niqqud']+' ('+phrase+').','ru':item['ru']+' '+phrase+'.'},['MATH-LATE-005'])
for page,ti,indices in [(165,0,[(12,'Duplex Stainless Steels')]),(200,0,[(3,'workability'),(9,'annealed condition')]),(200,1,[(3,'workability; drawn, formed'),(5,'annealed condition; furnace brazed')])]:
 for index,phrase in indices:
  t=R.current_pages[page]['tables'][ti];R.cell('MATH-LATE-005',index,t['cells'][index]['he']+' ('+phrase+')',t['cells'][index]['ru']+' ('+phrase+')',ti) if False else None
 cells=copy.deepcopy(R.current_pages[page]['tables'][ti]['cells'])
 for index,phrase in indices:
  for lang in ['he','ru']:cells[index][lang]+=' ('+phrase+')'
 setobj(page,'tables',ti,{'cells':cells},['MATH-LATE-005'])
R.finish()
print('Batch 10 written')
