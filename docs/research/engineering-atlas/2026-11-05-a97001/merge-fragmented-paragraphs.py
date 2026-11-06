"""Generate explicit reviewed merge rules; leave source blocks unchanged."""
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
path = ROOT/'scripts/atlas/corrections/a97001.json'
rules = json.loads(path.read_text(encoding='utf-8'))
blocks = {b['id']:b for b in json.loads((HERE/'statics-p08-p09.json').read_text(encoding='utf-8'))['blocks']}
for first, second, ru, note in [
    ('b002','b003','Силы, действующие вдоль одной горизонтальной или вертикальной линии, можно заменить одной силой, соответствующей их общему действию. Она называется равнодействующей (суммой сил) и обозначается Fe или ΣF.','Силы складываются с учётом направления.'),
    ('b004','b005','Силы, действующие вдоль взаимно перпендикулярных линий, можно заменить одной силой, соответствующей их общему действию. Она называется равнодействующей (суммой сил) и обозначается Fe или ΣF.','Для двух перпендикулярных сил модуль равнодействующей равен √(F₁² + F₂²), а не сумме модулей.')]:
    a, b = (blocks['a97001:p8:'+s] for s in (first,second))
    fields = {k:a[k]+' '+b[k] for k in ('he','he_niqqud','translit','translit_ru')}
    fields.update(ru=ru,ambiguity_note=note)
    rules['structure'] = [r for r in rules['structure'] if r.get('merge_pair') != first]
    rules['structure'].extend([
        dict(op='set',section='s02-statics-basics',page=8,id=a['id'],fields=fields,merge_pair=first,why='Восстановлен единый абзац, разорванный извлечением'),
        dict(op='drop',section='s02-statics-basics',page=8,ids=[b['id']],merge_pair=first,why='Продолжение полностью включено в предыдущий абзац')])
path.write_text(json.dumps(rules,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
