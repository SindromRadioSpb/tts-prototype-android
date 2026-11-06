"""Raster tables: readable content restored; tiny uncertain numbers left explicit."""
import copy,re
import review_tools as R
def put(page,collection,index,fields,ids):
 obj=R.current_pages[page][collection][index]
 R.data['structure'].append({'page':page,'section':R.pages[page]['section_id'],'op':'set','collection':collection,'id':obj['id'],'fields':fields,'audit_ids':ids,'why':'Actual rotated PDF pixels checked; uncertain fine readings explicitly excluded'})
def c(row,col,he,ru):return {'row':row,'col':col,'rowspan':1,'colspan':1,'he':he,'ru':ru}
t=R.current_pages[169]['tables'][0];cells=copy.deepcopy(t['cells'])
for row in [9,10,15,16]:
 q=next(x for x in cells if x['row']==row and x['col']==0)
 q['he']=q['he'].replace(' (פריט)','')+' (+גרפיט)';q['ru']=q['ru'].replace(' (феррит)','')+' (+графит)'
put(169,'tables',0,{'cells':cells},['R169-F01'])
f=R.current_pages[169]['figures'][0]
labels='A:1536°C; G:911°C; P,S,K:723°C; E:2.06%C; C:4.3%C; S:0.8%C; K:6.67%C; °C:500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600; %C:0,0.5,1,2,3,4,5,6.'
put(169,'figures',0,{'caption_he':f['caption_he']+' '+labels,'caption_ru':f['caption_ru']+' Подписи и шкалы источника: '+labels},['R169-F02'])
t=R.current_pages[170]['tables'][0];cells=copy.deepcopy(t['cells'])
for q in cells:
 if q['row']==7 and q['col']==0:q.update(he='אוסטניט / ברזל γ',ru='Аустенит / γ-железо')
 if q['row']==18 and q['col']==1:q.update(he='1140°C; 728/729°C — הספרה האחרונה אינה מאושרת במקור הזמין.',ru='1140°C читается. Последняя цифра 728/729°C не подтверждена при доступном разрешении; прежнее уверенное 729°C отозвано.')
extra=[('ברזל δ','δ-железо'),('פריט (ברזל α)','Феррит (α-железо)'),('מגנטי / אל מגנטי','Магнитный / немагнитный'),
 ('A,H,B,J,N,G,E,P,S,Q,C','Буквы точек: A, H, B, J, N, G, E, P, S, Q, C'),
 ('A:1540°C; H:0.1%C; B:0.5%C; N:1400°C; G:910°C; E:2%C; S:0.8%C; C:4.3%C','Читаемые подписи точек: A 1540°C; H 0.1%C; B 0.5%C; N 1400°C; G 910°C; E 2%C; S 0.8%C; C 4.3%C'),
 ('°C:0,100,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600','Шкала °C: от 0 до 1600 с шагом 100'),
 ('°F:212,392,572,752,932,1112,1292,1472,1652,1832,2012,2192,2372,2552,2732','Читаемая часть шкалы °F: 212,392,572,752,932,1112,1292,1472,1652,1832,2012,2192,2372,2552,2732'),
 ('%C (אטומי):0,2,4,6,8,10,12,14,16,18,20','Верхняя шкала атомного процента C: 0–20 с шагом 2'),
 ('%C (משקלי):0,0.5,0.8,1,1.5,2,2.5,3,3.5,4,4.3,4.5,5,6.7','Нижняя шкала массового процента C: 0,0.5,0.8,1,1.5,2,2.5,3,3.5,4,4.3,4.5,5,6.7; разрыв после 5'),
 ('%Fe₃C:0,10,20,30,40,50,60,70,100','Массовый процент Fe₃C: 0,10,20,30,40,50,60,70,100; разрыв после 70'),
 ('קריאות לא מאושרות: 149?°C; 7?9°C; J; P; Q; ערך °F עליון','Не удостоверены мелкие значения: перитектическая 149?°C, A₂ 7?9°C, десятичные цифры J/P/Q и верхняя отметка °F. Нужен более чёткий первоисточник; стандартные значения не подставлены.')]
for row,(he,ru) in enumerate(extra,19):cells.extend([c(row,0,he,ru),c(row,1,'—','—')])
put(170,'tables',0,{'cells':cells},['p170-F1','p170-F2','p170-F4'])
# Row-specific stock shapes and group columns. A..G are audit shorthand only.
checks=R.json.loads((R.src/'redo_strict/reviews/raster_157_159_160_169_170.json').read_text(encoding='utf-8'))['cell_or_row_checks']
lookup={q['id']:q for q in checks};table=R.current_pages[160]['tables'][0];cells=copy.deepcopy(table['cells'])
cells.extend([c(0,3,'קבוצות','Группы'),c(0,4,'צורות מקובלות','Формы поставки: условные знаки источника')])
glyph={'A':'● ⬢ ■','B':'▬','C':'—','D':'○','E':'◉','F':'•','G':'LT'}
for row in range(1,33):
 he=lookup[f'R160-r{row}-group']['source_he']
 if row<=5:ru='Углеродистая сталь'
 elif row<=8:ru='Высокоуглеродистые (пружинные) стали'
 elif row<=10:he='פלדת … עיבוד [הכיתוב הקטן אינו מאושר]';ru='Сталь … для обработки [точное мелкое название не удостоверено]'
 elif row==11:ru='Марганцовистая сталь'
 elif row<=18:ru='Легированные стали'
 elif row<=23:ru='Нержавеющая сталь'
 elif row<=30:ru='Инструментальные стали'
 else:ru='Быстрорежущие стали'
 forms=' '.join(glyph[s] for s in lookup[f'R160-r{row}-forms']['source_he'].split())
 cells.extend([c(row,3,he,ru),c(row,4,forms,forms)])
put(160,'tables',0,{'cells':cells},['R160-F01'])
cells=copy.deepcopy(R.current_pages[160]['tables'][1]['cells'])
for q in cells:
 if q['row']==3 and q['col']==1:q.update(he='מלבן עבה; 6 מ״מ — המשך הכיתוב אינו מאושר',ru='Толстый прямоугольник; порог 6 мм читается, точное название и направление сравнения не удостоверены')
 if q['row']==4 and q['col']==1:q.update(he='קו דק; 6 מ״מ — המשך הכיתוב אינו מאושר',ru='Тонкая полоса; порог 6 мм читается, точное название и направление сравнения не удостоверены')
 if q['row']==6 and q['col']==1:q.update(he='טבעת עבה — המשמעות אינה מאושרת',ru='Толстое кольцо; значение знака по доступному источнику не удостоверено; прежняя трактовка как проволоки не подтверждена')
cells.extend([c(9,0,'⬢','⬢'),c(9,1,'חתך משושה','Шестигранное сечение'),c(10,0,'● ⬢ ■','● ⬢ ■'),c(10,1,'קבוצת צורות המקור','Группа форм исходника: круг, шестигранник, квадрат; соприкосновение чёрных значков сохранено как группа')])
put(160,'tables',1,{'cells':cells},['R160-F18'])
# Do not let superscript references look like squared/cubed units.
for page,index in [(21,3),(24,5)]:
 item=R.current_pages[page]['items'][index];fields={}
 for key in ['he_niqqud','ru']:
  fields[key]=item[key].replace('N/mm¹.','N/mm [1].').replace('mm².','mm [2].').replace('Н/мм¹.','Н/мм [1].').replace('мм².','мм [2].').replace(', m³.',', m [3].').replace(', м³.',', м [3].')
 put(page,'items',index,fields,['SUP-F001'])
R.finish()
print('Batch 11 written')
