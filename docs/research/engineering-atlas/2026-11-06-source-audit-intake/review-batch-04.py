"""Source math fidelity: keep original errors with existing notes; repair actual losses."""
import copy,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
path=ROOT/'scripts/atlas/corrections/a97001.json'
data=json.loads(path.read_text(encoding='utf-8'))
src=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
baseline={p['page']:p for p in json.loads((src/'publication_snapshot.json').read_text(encoding='utf-8'))}
obs=json.loads((src/'all_observations.json').read_text(encoding='utf-8'))
byid={v['id']:v for v in obs}
def edit(page,obj,fields,ids,collection='items'):
 data['structure'].append({'page':page,'section':baseline[page]['section_id'],'op':'set','collection':collection,
  'id':obj['id'],'fields':fields,'audit_ids':ids,'why':'Поштучная визуальная сверка формулы/подписи с PDF: '+', '.join(ids)})
def drop(page,index,ids):
 data['structure'].append({'page':page,'section':baseline[page]['section_id'],'op':'drop',
  'ids':[baseline[page]['items'][index]['id']],'audit_ids':ids,'why':'Фрагмент уже полностью передан в таблице или словаре величин'})
def item(page,index):return baseline[page]['items'][index]

# Restore the exact source relation glyph without changing any numerical term.
for oid in ['MATH-055-01','MATH-055-02','MATH-055-05','MATH-055-06','MATH-063-06',
            'MATH-075-01','MATH-075-04','MATH-081-01','MATH-081-05']:
 o=byid[oid];page=o['page'];index=int(re.search(r'items\[(\d+)\]',o['target']).group(1));obj=item(page,index)
 latex=obj['latex']
 if oid=='MATH-055-02':latex=latex.replace('=-3600',r'\simeq-3600')
 else:latex=latex.replace(r'\approx','=')
 edit(page,obj,{'latex':latex},[oid])

# Vector arrows and source degree marker were lost from displayed MathML.
for page,indices in [(62,[2,3,4,5,6]),(63,[3,4,5,6,7])]:
 for seq,index in enumerate(indices,1):
  obj=item(page,index);latex=obj['latex'].replace(r'\mathrm{N}','UNITNEWTON')
  for symbol in ['A','N']:
   latex=re.sub(r'(?<![A-Za-z\\])'+symbol+r'(?![A-Za-z])',lambda m:r'\vec{'+symbol+'}',latex)
  latex=latex.replace('UNITNEWTON',r'\mathrm{N}').replace(r'\cos\alpha',r'\cos\alpha^\circ').replace(r'\approx','=')
  edit(page,obj,{'latex':latex,'note':(obj.get('note') or '')+' Стрелки воспроизводят обозначения оригинала; в числовых балансах используются проекции или модули сил.'},[f'MATH-{page:03d}-{seq:02d}'])

for oid in ['MATH-054-01','MATH-055-07','MATH-057-01','MATH-059-01','MATH-060-01','MATH-062-06','MATH-063-07','MATH-065-01','MATH-066-01']:
 o=byid[oid]
 for target in o['target']:
  index=int(re.search(r'items\[(\d+)\]',target).group(1));obj=item(o['page'],index)
  latex=obj['latex'].replace('x_C','x_c').replace('y_C','y_c').replace(r'\mu_s',r'\mu_S')
  # Merge the previously reviewed vector/relationship edit at this same stable ID.
  prior=next((op for op in reversed(data['structure']) if op.get('id')==obj['id'] and op.get('audit_ids') and 'latex' in op.get('fields',{})),None)
  if prior:
   prior['fields']['latex']=prior['fields']['latex'].replace('x_C','x_c').replace('y_C','y_c').replace(r'\mu_s',r'\mu_S')
   prior['audit_ids'].append(oid)
  else:edit(o['page'],obj,{'latex':latex},[oid])

edit(67,item(67,5),{'he_niqqud':'מְהִירוּת.','ru':'Скорость.'},['MATH-067-01'])
edit(67,item(67,6),{'latex':r'V=\frac{x}{t}','source_text':'V = x/t'},['MATH-067-01'])
edit(67,item(67,9),{'he_niqqud':'זְמַן. V – מְהִירוּת, m/sec. x – דֶּרֶךְ, m. t – זְמַן, sec. הֲמָרַת יְחִידוֹת.',
 'ru':'Время. V — скорость, м/с; x — путь, м; t — время, с. Перевод единиц.'},['MATH-067-02'])
edit(67,item(67,10),{'latex':item(67,10)['latex']+r'\;(\mathrm{kmh})'},['MATH-067-03'])
for index,oid in zip([1,3,6,7,8],['MATH-074-01','MATH-074-02','MATH-074-03','MATH-074-04','MATH-074-05']):drop(74,index,[oid])
drop(75,6,['MATH-075-03'])
drop(76,2,['MATH-076-01'])
for page,index,oid in [(81,4,'MATH-081-03'),(81,11,'MATH-081-07'),(85,3,'MATH-085-01'),(85,10,'MATH-085-03')]:
 obj=item(page,index);latex=obj['latex'];parts=latex.split(r'\quad')
 assert len(parts)==2
 edit(page,obj,{'latex':parts[0]+r'\quad\cancel{'+parts[1]+'}',
  'note':(obj.get('note') or '')+' Отрицательный корень зачёркнут в исходнике и отвергнут как время после начала движения.'},[oid])
obj=item(83,7)
data['structure'].append({'page':83,'section':baseline[83]['section_id'],'op':'replace','id':obj['id'],
 'with':[obj,{'id':'a97001:p83:audit-range','type':'formula','y':obj['y']+0.1,
  'latex':r'x=V_0\sqrt{\frac{2y}{g}}','source_text':'x = V₀·√(2y/g)',
  'note':'В этой записи y означает положительную высоту падения, g — положительный модуль ускорения. При оси вверх и подписанной координате y<0 под корнем −2y/g.'}],
 'audit_ids':['MATH-083-03'],'why':'Формула имелась в русском переводе, но отсутствовала как отдельный объект и в иврите'})
obj=item(72,1);pointed=obj['he_niqqud'].replace('V0 = 0.','V0 = 0 m/sec.').replace('V0 = Vt, a = 0.','V0 = Vt m/sec, a = 0 m/sec².').replace('Vt = 0.','Vt = 0 m/sec.')
ru=obj['ru'].replace('V0 = 0.','V0 = 0 м/с.').replace('V0 = Vt, a = 0.','V0 = Vt м/с, a = 0 м/с².').replace('Vt = 0.','Vt = 0 м/с.')
edit(72,obj,{'he_niqqud':pointed,'ru':ru},['MATH-072-01'])
obj=item(91,2)
edit(91,obj,{'he_niqqud':obj['he_niqqud'].replace('R – רַדְיוּס, m.','R – הַמֶּרְחָק בֵּין הַגּוּף לְצִיר הַסִּיבוּב סְבִיבוֹ הוּא נָע, m.'),
 'ru':obj['ru'].replace('R — радиус, м;','R — расстояние от тела до оси, вокруг которой оно движется, м;')},['HE-091-01'])
obj=item(93,1);pointed=obj['he_niqqud']
for symbol in ['α','at','ar','atotal']:pointed=pointed.replace(symbol+' –',symbol+' [rad/sec²] –')
edit(93,obj,{'he_niqqud':pointed,'ru':obj['ru']+' Во всех четырёх строках источник печатает rad/sec². Для α это рад/с²; для линейных at, ar и atotal нужны м/с². Ошибка единиц оригинала сохранена в ивритской цитате и исправлена здесь явно.'},['MATH-093-01'])
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Added source-math fidelity corrections, batch 04.')
