"""Aluminium designations and applications, verified against original embedded rasters."""
import copy
import review_tools as R
def cells(page,ti,updates,ids):
 base=R.pages[page]['tables'][ti]
 current=next(t for t in R.current_pages[page]['tables'] if t['id']==base['id'])
 out=copy.deepcopy(current['cells'])
 for index,he,ru in updates:out[index].update(he=he,ru=ru)
 R.data['structure'].append({'page':page,'section':R.pages[page]['section_id'],'op':'set','collection':'tables','id':base['id'],
  'fields':{'cells':out},'audit_ids':ids,'why':'Поштучная сверка с исходными таблицами и текстом PDF; неизвестные окончания не достроены'})

cells(196,1,[(3,'קירור מטמפרטורה גבוהה בה בוצע העיצוב וזיקון טבעי','Охлаждение с высокой температуры, при которой выполнялось формообразование, и естественное старение'),
 (11,'טיפול המסה ושחרור מאמצים על־ידי מתיחה, זהה ל-T4','Обработка на твёрдый раствор и снятие напряжений растяжением; в источнике: «идентично T4»'),
 (13,'קירור מטמפרטורה גבוהה בה בוצע העיצוב וזיקון מלאכותי','Охлаждение с высокой температуры формообразования и искусственное старение'),
 (17,'טיפול המסה, שחרור מאמצים על־ידי מתיחה ואח״כ זיקון מלאכותי','Обработка на твёрдый раствор, снятие напряжений растяжением и затем искусственное старение')],
 ['HE-196-01','HE-196-02','HE196-F01','HE196-F02','HE196-F03','HE196-F04','HE196-F05'])
cells(197,0,[(3,'הקשיה באופן מכני','Деформационное упрочнение'),
 (15,'קשיות מלאה (כ־75% הפחתה של שטח החתך בעיבוד בקור)','Полное твёрдое состояние (в исходнике: примерно 75% уменьшения площади сечения при холодной обработке)')],['HE-197-01','HE197-F01','HE197-F02'])
cells(197,2,[(11,'מוט, קנה וחוט מהאקסטרוזיה','Прессованные пруток, стержень и проволока (Extruded rod, bar and wire)'),
 (17,'מוט, קנה וחוט בגימור בעיבוד קר','Пруток, стержень и проволока после холодной отделки (Cold finished rod, bar and wire)')],['HE-197-02','HE197-F03','HE197-F04'])
cells(196,0,[(3,'אלומיניום (Al) מעל 99.00%','Алюминий (Al) свыше 99,00%')],['P196-N008'])
cells(197,1,[(41,'S, P, E, ES, ET, C, DT','S, P, E, ES, ET, C, DT'),(42,'93.5','93.5'),
 (51,'S, P, F, E, ES, ET, C, DT, FG','S, P, F, E, ES, ET, C, DT, FG'),
 (71,'S, P, E, ES, ET, C, DT, FG','S, P, E, ES, ET, C, DT, FG'),(81,'E, ES, ET, DT','E, ES, ET, DT')],
 ['P197-N058','P197-N059','P197-N068','P197-N088','P197-N098'])
cells(199,0,[(7,'Fatigue Endurance Limit Sₑ, MPa — גבול התעייפות','Предел выносливости Sₑ, МПа (Fatigue Endurance Limit)')],['P199-N009'])
cells(199,1,[(10,'ε (%)','ε (%)')],['P199-N109'])
headers198=[('Alloy (AA) and Temper','Сплав (AA) и состояние'),('Modulus of Elasticity E, GPa','Модуль упругости E, ГПа'),
 ('Tensile Yield Strength σY, MPa','Напряжение текучести при растяжении σY, МПа'),('Ultimate Tensile Strength σUTS, MPa','Предел прочности при растяжении σUTS, МПа'),
 ('Strain at Fracture εF, %','Деформация при разрушении εF, %'),('Hardness HB, BHN','Твёрдость HB, BHN'),
 ('Ultimate Shearing Strength τ, MPa','Предел прочности при сдвиге τ, МПа'),
 ('Fatigue Endurence Limit σ, MPa','Предел выносливости, МПа; в источнике σ с мелким индексом, который здесь не сертифицирован')]
cells(198,0,[(i,he,ru) for i,(he,ru) in enumerate(headers198)],['MATH-LATE-002'])
figure=R.pages[196]['figures'][0]
R.data['structure'].append({'page':196,'section':R.pages[196]['section_id'],'op':'set','collection':'figures','id':figure['id'],
 'fields':{'caption_ru':figure['caption_ru']+' Types of Aluminum Alloys — виды алюминиевых сплавов; Aluminum Association (AA) Numbering System — система нумерации Алюминиевой ассоциации (AA).'},
 'audit_ids':['P196-N002','P196-N003'],'why':'Восстановлены два самостоятельных исходных заголовка'})

# Preserve all readable applications rather than replacing source claims with generic descriptions.
for ti in [0,1]:
 base=R.pages[200]['tables'][ti];table=next(t for t in R.current_pages[200]['tables'] if t['id']==base['id']);out=copy.deepcopy(table['cells']);ids=[]
 def update(index,old,new,ru,oid):
  assert old in out[index]['he'],(index,old)
  out[index]['he']=out[index]['he'].replace(old,new);out[index]['ru']+=' '+ru
  if oid not in ids:ids.append(oid)
 if ti==0:
  update(5,'מצטיינת בעיבוד שבבי','מצטיינת בעיבוד שבבי','', 'HE200-F02') if 'מצטיינת בעיבוד שבבי' in out[5]['he'] else None
  # AA2011: literal technical phrase and the explicit mechanized-lathe application.
  out[5]['he']+=' סגסוגת זו נקראת לרוב ״סגסוגת לעיבוד שבבי חופשי באופן ממוכן״ — free machining alloy (FMA). כלומר, הבחירה המעולה לפרויקטים בהם נדרש עיבוד שבבי ממוכן באמצעות מחרטה.'
  out[5]['ru']+=' В источнике: «сплав для свободного механизированного резания» — free machining alloy (FMA); превосходный выбор для проектов, где нужна механизированная обработка резанием на токарном станке.'
  ids.extend(['HE200-F02','HE200-F03'])
  for index,oid in [(7,'HE200-F04'),(9,'HE200-F05')]:update(index,'מטוסים,','מטוסים (קונסטרוקציה/צנרת),','Для авиации отдельно названы конструкции и трубопроводы.',oid)
  ids.append('HE-200-01')
  update(9,'ומסגרות של משאיות.','ומסגרות וקרון נגרר של משאיות.','В применениях указаны рамы и кузова прицепов грузовых автомобилей.','HE200-F06')
  update(11,'מכלי דלק ומכלים לאחסון מזון','מיכל (בריכה) לאחסון','В исходнике — ёмкость (бассейн) для хранения; топливо и пища в этом перечне не указаны.','HE200-F08')
  # Remove unsupported source attributions also from the existing translation.
  out[11]['ru']=out[11]['ru'].replace('пищевых','').replace('для пищевых продуктов','для хранения')
  ids.extend(['HE200-F09','HE-200-02'])
  out[11]['he']=out[11]['he'].replace('סגסוגת נפוצה,','הסגסוגת הנפוצה ביותר מבין כל סגסוגות האלומיניום,')
  out[11]['ru']+=' Источник называет AA3003 самым распространённым среди всех алюминиевых сплавов.';ids.append('HE200-F10')
 else:
  for index,oid in [(3,'HE200-F11'),(5,'HE200-F14')]:update(index,'מטוסים,','מטוסים (קונסטרוקציה/צנרת),','Авиационное применение уточнено как конструкции и трубопроводы.',oid)
  update(9,'מטוסים ויישומים','מטוסים (קונסטרוקציה/צנרת) ויישומים','Авиационное применение уточнено как конструкции и трубопроводы.','HE200-F21')
  for index,old,oid in [(3,'מסגרות של משאיות','HE200-F12'),(5,'מסגרות של משאיות','HE200-F17')]:update(index,old,'מסגרות וקרון נגרר של משאיות','Также названы кузова прицепов грузовых автомобилей.',oid)
  out[3]['he']+=' ניתן בקלות לעיבוד במשיכה או בעיצוב (drawn,formed) לצורות מורכבות.'
  out[3]['ru']+=' Сплав легко поддаётся вытяжке или формованию (drawn, formed) в сложные формы.';ids.append('HE200-F13')
  for index,old,oid in [(5,'מכלי אחסון','HE200-F15'),(7,'מכלי אחסון','HE200-F20')]:update(index,old,'מיכל (בריכה) לאחסון','В перечне источника: ёмкость (бассейн) для хранения.',oid)
  out[5]['he']+=' יישומים מבניים; תוך שמירה על רוב התכונות הטובות של האלומיניום.'
  out[5]['ru']+=' Также указаны строительные применения и сохранение большинства хороших свойств алюминия.';ids.extend(['HE200-F16','HE200-F18','HE-200-03'])
  update(5,'לריתוך בשיטות שונות','לריתוך בכל השיטות הריתוך','Источник буквально заявляет возможность сварки всеми методами; это исходная формулировка, применимость конкретного процесса требует проверки режима.','HE200-F19')
 R.data['structure'].append({'page':200,'section':R.pages[200]['section_id'],'op':'set','collection':'tables','id':base['id'],'fields':{'cells':out},'audit_ids':list(dict.fromkeys(ids)),
  'why':'Проверены читаемые применения и свойства в original97001.pdf; обрезанное продолжение AA7075 не восстановлено'})
R.finish()
print('Added aluminium source table corrections, batch 09.')
