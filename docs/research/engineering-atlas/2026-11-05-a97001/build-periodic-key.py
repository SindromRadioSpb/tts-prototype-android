"""Russian lookup for every symbol in the source periodic table; source image preserves Hebrew names and masses."""
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
elements=json.loads((HERE/'periodic-elements.json').read_text(encoding='utf-8'))
assert len(elements)==118 and len({x[0] for x in elements})==118
tables=[]
for start in range(0,118,30):
    tables.append(dict(page=116,label=f'elements-{start+1}',bbox=[50,175+start/10,550,450],
        he=f'סמלי היסודות {start+1}–{min(start+30,118)}',
        ru=f'Названия элементов {start+1}–{min(start+30,118)} по символам таблицы',
        rows=[[["מספר אטומי","Атомный номер"],["סמל היסוד","Символ и русское название"]]]+
             [[i+1,[symbol,f'{symbol} — {ru}']] for i,(symbol,ru) in enumerate(elements) if start<=i<start+30]))
(HERE/'tables-periodic-key.json').write_text(json.dumps(tables,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
