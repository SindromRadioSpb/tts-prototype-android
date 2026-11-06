"""Centroid worksheet and separate geometry cases, checked against source pixels."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
path=ROOT/'scripts/atlas/corrections/a97001.json';data=json.loads(path.read_text(encoding='utf-8'))
src=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
p={p['page']:p for p in json.loads((src/'publication_snapshot.json').read_text(encoding='utf-8'))}
def edit(page,collection,obj,fields,ids):
 data['structure'].append({'page':page,'section':p[page]['section_id'],'op':'set','collection':collection,
  'id':obj['id'],'fields':fields,'audit_ids':ids,'why':'Проверено по полной исходной странице, сохранены отдельные позиции и подписи'})

headers=[('#','#'),('שם תת גוף','Название части тела'),('שטח — A [mm²]','Площадь — A [мм²]'),('x_c [mm]','x_c [мм]'),('x_c · A','x_c · A'),('y_c [mm]','y_c [мм]'),('y_c · A','y_c · A')]
cells=[]
for row in range(7):
 for col in range(7):
  he,ru=headers[col] if row==0 else ((str(row),str(row)) if col==0 and row<=3 else ('',''))
  if row==6:
   he,ru={1:('סה״כ','Итого'),2:('ΣA','ΣA'),4:('Σ(x_c · A)','Σ(x_c · A)'),6:('Σ(y_c · A)','Σ(y_c · A)')}.get(col,('',''))
  cells.append({'row':row,'col':col,'rowspan':1,'colspan':1,'he':he,'ru':ru})
worksheet={'id':'a97001:p50:audit-centroid-worksheet','title_he':'טבלת חישוב מרכז כובד — למילוי','title_ru':'Расчётная таблица центра площади — для заполнения','cells':cells,'bbox':[85,375,493,495]}
data['structure'].append({'page':50,'section':p[50]['section_id'],'op':'page','fields':{'tables':p[50]['tables']+[worksheet]},
 'audit_ids':['HE-050-02','MATH-005','SUP-F002'],'why':'Восстановлены семь столбцов, пять пустых строк и итоговая строка исходной учебной таблицы'})
for page,indices in [(51,[0,1]),(52,[0])]:
 for index in indices:
  obj=p[page]['figures'][index]
  edit(page,'figures',obj,{'caption_he':obj['caption_he']+' — צורת חתך; שטח חתך A'},
       ['HE-051-01'] if page==51 else ['HE-052-01','HE-052-02'])
table=copy.deepcopy(p[51]['tables'][0]);cells=table['cells'];row=max(c['row'] for c in cells)+1
values=[('משולש כללי — סכמה נפרדת במקור','Общий треугольник — отдельная схема в оригинале'),('A = b·h/2','A = b·h/2'),('c = h/3','c = h/3 от основания')]
assert max(c['col'] for c in cells)==2
for col,(he,ru) in enumerate(values):cells.append({'row':row,'col':col,'rowspan':1,'colspan':1,'he':he,'ru':ru})
edit(51,'tables',p[51]['tables'][0],{'cells':cells},['MATH-051-01'])
cells=copy.deepcopy(p[56]['tables'][0]['cells'])
matches=[c for c in cells if c['row']==0 and c['col']==2]
assert len(matches)==1
matches[0]['he']='שטח — '+matches[0]['he'];matches[0]['ru']='Площадь — '+matches[0]['ru']
edit(56,'tables',p[56]['tables'][0],{'cells':cells},['HE-056-01'])
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Added centroid source-fidelity corrections, batch 05.')
