"""Account for every source object; a clean layout audit is not completeness proof."""
import json
import hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DATA = ROOT / 'data/atlas/a97001'
source = [json.loads(s) for s in (DATA/'supplier/source-pack/pages.jsonl').read_text(encoding='utf-8').splitlines()]
sections = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((DATA/'sections').glob('*.json'))]
pages = [p for s in sections for p in s['pages']]
items = {i['id']: i for p in pages for i in p['items']}
figures = {i['id']: i for p in pages for i in p['figures']}
rules = json.loads((ROOT/'scripts/atlas/corrections/a97001.json').read_text(encoding='utf-8'))
dropped = {oid for r in rules['structure'] if r['op'] == 'drop' for oid in r['ids']}
source_ids = {o['id'] for o in source}
assert not dropped-source_ids, f'Unknown source IDs in drop rules: {dropped-source_ids}'
assert sorted(p['page'] for p in pages) == list(range(1, 204))
formula_ids = {o['id'] for o in source if o['type'] == 'formula'}
block_ids = {o['id'] for o in source if o['type'] == 'block'}
figure_ids = {o['id'] for o in source if o['type'] == 'figure'}
unaccounted = sorted((formula_ids | block_ids | figure_ids) - set(items) - set(figures) - dropped)
missing_math = sorted(i for i in formula_ids & set(items) if not items[i].get('mathml'))
missing_text = sorted(i for i in block_ids & set(items) if not all(items[i].get(k) for k in ('he','he_niqqud','ru','translit','translit_ru')))
uncaptioned = sorted(i for i, f in figures.items() if not f.get('caption_ru'))
acceptance_path = HERE/'visual-acceptance.json'
acceptance = json.loads(acceptance_path.read_text(encoding='utf-8')) if acceptance_path.exists() else {}
accepted = acceptance.get('reader_index_sha256') == hashlib.sha256((DATA/'index.json').read_bytes()).hexdigest() and acceptance.get('pages_reviewed') == list(range(1,204))
report = {'atlas_id':'a97001', 'pages':len(pages), 'source_blocks':len(block_ids),
          'source_formulas':len(formula_ids), 'rendered_mathml':len(formula_ids & set(items))-len(missing_math),
          'formulas_reflowed_by_explicit_rule':len(formula_ids & dropped),
          'source_figures':len(figure_ids), 'rendered_figures':len(figures),
          'unaccounted_source_objects':unaccounted, 'missing_mathml':missing_math,
          'missing_text_layers':missing_text, 'figures_pending_caption_review':uncaptioned,
          'visual_acceptance_complete':accepted, 'publishable':bool(accepted and not (unaccounted or missing_math or missing_text or uncaptioned))}
(HERE/'reader-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:len(v) if isinstance(v,list) else v for k,v in report.items()},ensure_ascii=False,indent=2))
assert not (unaccounted or missing_math or missing_text)
