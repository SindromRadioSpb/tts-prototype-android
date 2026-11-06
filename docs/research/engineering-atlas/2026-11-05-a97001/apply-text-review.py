"""Apply explicitly authored review edits to editorial inputs, not published reader JSON."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
fixes = json.loads((root / 'review-text-fixes.json').read_text(encoding='utf-8'))
seen = set()
all_rows = {row[0]: row for p in root.glob('*.author.json')
            for row in json.loads(p.read_text(encoding='utf-8'))['rows']}
def resolve(row):
    return resolve(all_rows[row[1]['reuse']]) if len(row) == 2 else row

for path in root.glob('*.author.json'):
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = False
    for row in data['rows']:
        fix = fixes.get(row[0])
        if not fix:
            continue
        if len(row) != 3:
            concrete = resolve(row)
            row[:] = [row[0], concrete[1], concrete[2]]
        seen.add(row[0])
        if 'ru' in fix:
            row[2] = fix['ru']
        if fix.get('append_ru') and fix['append_ru'] not in row[2]:
            row[2] += fix['append_ru']
        if fix.get('append_note'):
            notes = data.setdefault('notes', {})
            current = notes.get(row[0], '')
            if fix['append_note'] not in current:
                notes[row[0]] = (current + ' ' + fix['append_note']).strip()
        changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
if seen != set(fixes):
    raise ValueError('Unmatched edits: ' + str(set(fixes) - seen))
