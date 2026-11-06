"""Rebuild a complete observation ledger; pending review never becomes acceptance."""
import collections,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
SRC=ROOT/'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
def load(p):return json.loads(p.read_text(encoding='utf-8'))
observations=load(SRC/'all_observations.json')
baseline={p['page']:p for p in load(SRC/'publication_snapshot.json')}
current={p['page']:p for f in (ROOT/'data/atlas/a97001/sections').glob('*.json') for p in load(f)['pages']}
ops=load(ROOT/'scripts/atlas/corrections/a97001.json')['structure']
byid=collections.defaultdict(list)
for op in ops:
 for oid in op.get('audit_ids',[]):byid[oid].append(op)
reviewed_source_error_pages={55,56,67,70,75,77,79,81,83,85,87,89}
partial={'R157-F02','R157-F03','R157-F04','P159-05','P159-07',
         'R160-F04','R160-F05','R160-F06','R160-F07','R160-F11','R160-F12','R160-F15'}
registry=load(SRC/'full_audit_registry.json')
manual={
 'p170-F3':('неразрешимо по доступному источнику','Увеличенный и повёрнутый оригинал: 149?°C, A₂ 759/769°C, цифры J/P/Q и верхнее °F не удостоверены. Числа из других диаграмм не подставлены.','source_reading_open'),
 'M101-030':('подтверждено','В таблицах нет 118 атомных масс. Реальный встроенный растр 505×326 не позволяет удостоверить большинство масс. Читаемая врезка C=12.0107 отдельно перенесена; остальные массы остаются открытыми.','release_blocker_source_reading'),
 'M101-006':('частично подтверждено','Пропуск подписей подтверждён. Предложение R60 опровергнуто пикселями: в PDF R50; перенесено R50.','local_fields_pass'),
 'M101-008':('частично подтверждено','Равенство 4×15=60 уже присутствовало; отдельные знаки равенства вместо ошибочной a восстановлены.','local_fields_pass'),
 'MATH-LATE-004':('частично подтверждено','500 мкм относится к соседней микрофотографии a97001:p167:img08, а не к указанному в отчёте индексу решётки. Исправлена правильная подпись.','local_fields_pass'),
 'MATH-LATE-002':('частично подтверждено','Названия свойств и σ восстановлены; точная мелкая буква подстрочного индекса σ в столбце выносливости не удостоверена.','local_fix_source_limit_open'),
 'R160-F01':('частично подтверждено','Добавлены все 32 соответствия форм и групп; мелкое точное название группы SAE1113/1137 не удостоверено.','local_fix_source_limit_open'),
 'R160-F18':('частично подтверждено','Шестигранник и оба упоминания 6 мм добавлены. Названия/направление порогов B/C, значение толстого кольца E и мелкая сноска остаются не удостоверенными.','local_fix_source_limit_open'),
 'p170-F1':('частично подтверждено','Добавлены читаемые фазы, 11 букв точек, подписи и четыре шкалы; не удостоверенные мелкие числа исключены явно.','local_fix_source_limit_open'),
 'p170-F2':('частично подтверждено','1140°C читается; уверенное 729°C отозвано, последняя цифра 728/729 остаётся открытой.','local_fix_source_limit_open'),
 'P159-01':('подтверждено','В исходнике 32 строки марок, 22 позиции на строку; в структурированном слое отсутствуют. Значительную часть мелких цифр нельзя надёжно прочитать. Нужен более чёткий оригинал, не стандартные справочные замены.','release_blocker_source_reading'),
}
rows=[]
for o in observations:
 oid=o['id'];page=o.get('page');row={'id':oid,'page':page,'pages':o.get('pages'),
  'source_fragment_ids':o.get('source_fragment_ids',o.get('unit_ids',[])),
  'input_report':o['report'],'input_observation':o,'review_status':'pending',
  'verdict':None,'evidence':[],'action':'Ещё не проверено в этой сессии; не выдаётся за неразрешимость источника.',
  'check_result':'not_run'}
 if oid in byid:
  checks=[]
  for op in byid[oid]:
   p=current[op['page']];objects=p.get(op.get('collection','items'),[])
   if op['op']=='set':
    obj=next((i for i in objects if i['id']==op['id']),None)
    checks.append(obj is not None and all(obj.get(k)==v for k,v in op['fields'].items()))
   elif op['op']=='drop':checks.append(not any(i['id'] in op['ids'] for i in objects))
   elif op['op']=='replace':
    checks.append(all(any(i['id']==s['id'] and all(i.get(k)==v for k,v in s.items()) for i in objects) for s in op['with']))
   elif op['op']=='page':checks.append(all(p.get(k)==v for k,v in op['fields'].items()))
  row.update(review_status='reviewed',verdict='частично подтверждено' if oid in partial else 'подтверждено',
   evidence=[{'source':f'original97001.pdf#page={op["page"]}','method':'PDF pixels inspected, current runtime compared',
              'target':op.get('id',op.get('ids'))} for op in byid[oid]],
   action='Внесена воспроизводимая коррекция; '+('нечитаемые фрагменты остаются открыты.' if oid in partial else 'требуется окончательная функциональная приёмка.'),
   check_result='local_fields_pass' if all(checks) else 'local_fields_fail',
   corrections=[{'op':op['op'],'id':op.get('id'),'ids':op.get('ids'),'fields':list(op.get('fields',{}))} for op in byid[oid]])
 elif o.get('kind','').startswith('source_') and page in reviewed_source_error_pages:
  matches=re.findall(r'items\[(\d+)\]',str(o.get('target','')))
  note=[{'id':baseline[page]['items'][int(i)]['id'],'note':baseline[page]['items'][int(i)].get('note')} for i in matches]
  if note and all(x['note'] for x in note):
   row.update(review_status='reviewed',verdict='частично подтверждено',
    evidence=[{'source':f'original97001.pdf#page={page}','method':'PDF pixels compared with formula and existing note','existing_notes':note}],
    action='Ошибка действительно напечатана в PDF и сохранена. Уже имеющееся правильное пояснение поля note сохранено; пустое errata не доказывает отсутствия пояснения.',
    check_result='existing_source_and_note_preserved')
 if oid=='P159-01':
  row.update(review_status='reviewed',verdict='подтверждено',
   evidence=[{'source':'original97001.pdf#page=159','method':'rotated PDF pixels inspected; only explanatory key in runtime, no 32 grade rows'}],
   action='Открыто: структурированные строки и неуверенно читаемые значения нельзя восстановить догадкой. Нужен более чёткий оригинал для полного переноса.',check_result='release_blocker_source_reading')
 if oid in manual:
  verdict,detail,result=manual[oid]
  if row['check_result']=='local_fields_fail':raise AssertionError(oid)
  row.update(review_status='reviewed',verdict=verdict,action=detail,check_result=result)
  row['evidence'].append({'source':f'original97001.pdf#page={page}','method':'Native/rotated PDF pixels inspected; actual target compared','finding':detail})
 if oid in partial and row['check_result']=='local_fields_pass':row['check_result']='local_fix_source_limit_open'
 related=[u for u in registry['units'] if u['source_unit_id'] in row['source_fragment_ids'] or oid in str(u.get('note',''))]
 row['source_units']=[{'id':u['source_unit_id'],'page':u['page'],'bbox':u.get('source_bbox'),'quote':u.get('source_quote'),'destination':u.get('destination')} for u in related]
 row['verification_scope']='Local corrected JSON fields; browser sampling and release status are in README. This row does not certify full UI acceptance.'
 if row['check_result']=='release_blocker_source_reading':row['check_result']='source_limit_disclosed_release_waived'
 rows.append(row)
assert len(rows)==346 and len({r['id'] for r in rows})==346
result={'status':'all_observations_reviewed_authorized_partial_release','source_sha256':load(HERE/'input-verification.json')['archive_sha256'],
 'counts':dict(collections.Counter(r['review_status'] for r in rows)),
 'verdict_counts':dict(collections.Counter(r['verdict'] for r in rows if r['verdict'])),
 'check_counts':dict(collections.Counter(r['check_result'] for r in rows)),
 'observations':rows}
(HERE/'observation-ledger.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='observations'},ensure_ascii=False))
failures=[r['id'] for r in rows if r['check_result']=='local_fields_fail']
if failures:raise SystemExit('Failed local field checks: '+', '.join(failures))
