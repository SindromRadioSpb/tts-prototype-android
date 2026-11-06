"""Reviewed extraction fragments already present in equations or bilingual unit descriptions."""
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
fragments = {
 21:[2,3],24:[2],26:[1],34:[1],50:[2],67:[3],69:[2,3],
 70:[5,7],71:[3],72:[1,2,3,4,5,6],73:[1,2],74:[5],77:[6,7],80:[1],
 81:[3,8,10],83:[7],85:[8],87:[15],91:[1,2],93:[1,2],109:[1],132:[3],136:[4]
}
sections=json.loads((HERE/'sections.json').read_text(encoding='utf-8'))['sections']
path=ROOT/'scripts/atlas/corrections/a97001.json'
rules=json.loads(path.read_text(encoding='utf-8'))
rules['structure']=[r for r in rules['structure'] if r.get('review_group')!='formula-fragments']
for page, nums in fragments.items():
    sid=next(s['id'] for s in sections if s['first']<=page<=s['last'])
    rules['structure'].append(dict(op='drop',section=sid,page=page,
        ids=[f'a97001:p{page}:f{n:02d}' for n in nums],preserve_notes=True,
        review_group='formula-fragments',why='Единицы включены в двуязычные определения рядом; повторные знаменатели включены в полные формулы'))
path.write_text(json.dumps(rules,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
