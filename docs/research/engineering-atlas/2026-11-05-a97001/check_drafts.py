"""Check saved editorial coverage; never label an incomplete book publishable."""
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
source = ROOT / 'data/atlas/a97001/supplier/source-pack/pages.jsonl'
objects = [json.loads(line) for line in source.read_text(encoding='utf-8').splitlines()]
by_id = {o['id']: o for o in objects if 'id' in o}
blocks = {o['id'] for o in objects if o['type'] == 'block'}
seen = set()
pages = set()
notes = []
for path in sorted(HERE.glob('statics-p*.json')):
    if path.name.endswith('.author.json'):
        continue
    draft = json.loads(path.read_text(encoding='utf-8'))
    assert draft['atlas_id'] == 'a97001'
    assert draft['status'] == 'editorial_draft_source_visually_checked_not_owner_reviewed'
    page_set = set(draft['source_pages'])
    assert not pages & page_set, 'Draft pages overlap'
    pages |= page_set
    mine = set()
    for b in draft['blocks']:
        assert b['id'] in blocks and b['id'] not in seen, b['id']
        assert by_id[b['id']]['page'] in page_set
        assert all(isinstance(b.get(k), str) and b[k].strip()
                   for k in ('he', 'he_niqqud', 'ru', 'translit', 'translit_ru')), b['id']
        if re.search('[א-ת]', b['he']):
            assert re.search('[\u05b0-\u05bc]', b['he_niqqud']), b['id']
        if b.get('continues_in'):
            assert b['continues_in'] in blocks
        if b.get('editor_note_ru'):
            notes.append(b['id'])
        mine.add(b['id'])
    expected = {o['id'] for o in objects if o['type'] == 'block' and o['page'] in page_set}
    assert mine == expected, (path.name, expected - mine)
    seen |= mine
sections = json.loads((HERE / 'sections.json').read_text(encoding='utf-8'))
coverage = [n for s in sections['sections'] for n in range(s['first'], s['last'] + 1)]
assert coverage == list(range(1, 204))
assert all(s['part'] in {p['id'] for p in sections['parts']} for s in sections['sections'])
report = {
    'atlas_id': 'a97001', 'editorial_pages': sorted(pages),
    'draft_blocks_with_all_layers': len(seen), 'source_blocks': len(blocks),
    'remaining_source_blocks': len(blocks - seen), 'editor_notes': notes,
    'section_count': len(sections['sections']),
    'publishable': False,
    'pending': ['remaining translation', 'tables and figure legends',
                'canonical import', 'independent language and math review',
                'whole-book visual reader acceptance', 'production publication']
}
(HERE / 'progress.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
