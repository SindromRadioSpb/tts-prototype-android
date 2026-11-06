"""Manually reviewed cover, contents, units, supports and moment wording."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
path=ROOT/'scripts/atlas/corrections/a97001.json'
data=json.loads(path.read_text(encoding='utf-8'))
pages={p['page']:(s['id'],p) for f in (ROOT/'data/atlas/a97001/sections').glob('*.json')
       for s in [json.loads(f.read_text(encoding='utf-8'))] for p in s['pages']}
def edit(page,collection,index,fields,ids):
 obj=pages[page][1][collection][index]
 data['structure'].append({'page':page,'section':pages[page][0],'op':'set','collection':collection,
  'id':obj['id'],'fields':fields,'audit_ids':ids,'why':'Сверено с пикселями страницы PDF: '+', '.join(ids)})
def text(page,index,before,after,ids):
 obj=pages[page][1]['items'][index]
 assert before in obj['he_niqqud']
 edit(page,'items',index,{'he_niqqud':obj['he_niqqud'].replace(before,after)},ids)

last=pages[1][1]['items'][-1]
data['structure'].append({'page':1,'section':pages[1][0],'op':'replace','id':last['id'],
 'with':[last,{'id':'a97001:p1:audit-footer','kind':'prose','y':787,
  'he_niqqud':'מַהַ״ט — הַמָּכוֹן הַמֶּמְשַׁלְתִּי לְהַכְשָׁרָה בְּטֶכְנוֹלוֹגְיָה וּבְמַדָּע. labor.gov.il. דֶּרֶךְ מְנַחֵם בֵּגִין 86, תֵּל אָבִיב, ת.ד. 36049, מִיקּוּד 67138. טֵל׳ 037347400.',
  'ru':'МАХАТ — Государственный институт подготовки в области технологий и науки; labor.gov.il. Дерех Менахем Бегин, 86, Тель-Авив; почтовый ящик 36049; индекс 67138; телефон 037347400.'}],
 'audit_ids':['HE-001-01','HE-001-02','MATH-001','SUP-F004'],'why':'Восстановлен читаемый колонтитул титульной страницы'})
text(2,14,'תְּנוּעָה בִּמְהִירוּת קְבוּעָה','תְּנוּעָה בִּמְהִירוּת קְבוּעָה (תְּנוּעָה קְצוּבָה)',['HE-002-01'])
text(3,1,'סִבֹּלֶת מִדָּה','סִבֹּלֶת מִדָּה (טוֹלֵרַנְס)',['HE-003-01'])
text(3,8,'מִבְחַן מְתִיחָה','מִבְחַן מְתִיחָה (מְשִׁיכָה)',['HE-003-02'])
text(3,16,'פְּלָדוֹת בִּלְתִּי מַחֲלִידוֹת','פְּלָדוֹת בִּלְתִּי מַחֲלִידוֹת (פַלְבַּ״ם)',['HE-003-03'])
text(3,11,'מִבְחַן נְגִיפָה','מִבְחַן נְגִיפָה (Impact Test)',['MATH-002'])
for index in [0,2]:
 obj=pages[4][1]['tables'][index]
 cells=copy.deepcopy(obj['cells'])
 if index==0:
  cells[0].update(he='גודל נמדד',ru='Измеряемая величина')
  cells[2].update(he='סמל יחידה',ru='Символ единицы')
  names=['meter','kilogram','second','Ampere','Kelvin','mole','Candela']
  for row,name in enumerate(names,1):
   c=next(c for c in cells if c['row']==row and c['col']==1)
   c['he']+=' / '+name
   c['ru']+=' / '+name
  ids=['HE-004-01','HE-004-02','MATH-003']
 else:
  cells[2].update(he='חזקה',ru='Степень')
  names=['tera','giga','mega','kilo','hecto','deca','deci','centi','milli','micro','nano','pico']
  for row,name in enumerate(names,1):
   c=next(c for c in cells if c['row']==row and c['col']==0)
   c['he']+=' / '+name
   c['ru']+=' / '+name
  ids=['HE-004-03','MATH-003']
 edit(4,'tables',index,{'cells':cells},ids)
cells=copy.deepcopy(pages[5][1]['tables'][0]['cells'])
cell=next(c for c in cells if c['row']==10 and c['col']==3)
cell.update(he='במקור: 1/s = (1/min)/60. תיקון: 1 min⁻¹ = (1/60) s⁻¹',
 ru='В исходнике: 1/s = (1/min)/60. Исправление соотношения единиц: 1 min⁻¹ = (1/60) s⁻¹; соответственно 1 s⁻¹ = 60 min⁻¹.')
edit(5,'tables',0,{'cells':cells},['MATH-004'])
edit(11,'items',6,{'he_niqqud':'מַחֲלִיק עַל מוֹט לְלֹא. פִּין לְלֹא חִכּוּךְ. קַו פְּעֻלָּה יָדוּעַ.',
 'ru':'«Ползун на стержне без …» — так обрывается первая подпись оригинала. Отдельная следующая подпись: «Палец без трения». Линия действия известна.',
 'ambiguity_note':'Исходная подпись מחליק על מוט ללא обрывается после ללא; слово פין принадлежит следующей самостоятельной подписи, а не восстанавливает пропуск.'},['HE-011-01'])
text(24,2,'בֵּין נְקֻדַּת הַסִּיבוּב לְקַו','בֵּין נְקֻדַּת הַסִּיבוּב (צִיר) לְקַו',['HE-024-01'])
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Added reviewed corrections, batch 03.')
