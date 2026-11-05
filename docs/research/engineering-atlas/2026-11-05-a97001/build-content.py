"""Build reviewable content packs from authored layers; never relax validator findings."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts/atlas'))
import atlas_validate as V


def main():
    source = V.load_source_pack(ROOT / 'data/atlas/a97001/supplier/source-pack')
    book = json.loads((HERE / 'sections.json').read_text(encoding='utf-8'))
    blocks = {}
    for p in sorted(HERE.glob('*-p*.json')):
        if p.name.endswith('.author.json'):
            continue
        for block in json.loads(p.read_text(encoding='utf-8')).get('blocks', []):
            if block['id'] in blocks:
                raise ValueError('duplicate ' + block['id'])
            blocks[block['id']] = block
    out = ROOT / 'data/atlas/a97001/content'
    out.mkdir(parents=True, exist_ok=True)
    reports = []
    for section in book['sections']:
        rows = [{
            'type': 'header', 'schema': 'linguistpro.atlas-content-pack.1.0.0',
            'atlas_id': book['atlas_id'], 'source_pack_sha256': source.pages_sha256,
            'producer': 'LinguistPro editorial preparation, authored locally without paid APIs',
            'produced_at': '2026-11-06', 'pages': list(range(section['first'], section['last'] + 1)),
            'note': 'Editorial draft. Owner review is not claimed.'
        }]
        for sid in source.order:
            src = source.objects[sid]
            if not section['first'] <= src['page'] <= section['last'] or src['type'] != 'block':
                continue
            b = blocks[sid]
            obj = {k: b[k] for k in ('id', 'he', 'he_niqqud', 'translit', 'translit_ru', 'ru')}
            obj.update(type='block', kind=src.get('kind_guess', 'prose'), status={'language_review': 'unreviewed'})
            if V._letters(src['he_raw']) != V._letters(b['he']):
                obj['he_fix_note'] = ('Редакционная нормализация иврита по скану: восстановлены порядок чтения, '
                                      'разбиение и написание. Неизменный текст извлечения доступен в исходном пакете. '
                                      'Полнота формулировки проверяется отдельно от формальной валидации.')
            if b.get('editor_note_ru'):
                obj['ambiguity_note'] = b['editor_note_ru']
            rows.append(obj)
        # Explicit additions include tables, figure legends and formulas transcribed from the scan.
        for p in sorted(HERE.glob('content-*.json')):
            for obj in json.loads(p.read_text(encoding='utf-8')):
                page = int(obj['id'].removeprefix('new:').split(':')[1][1:])
                if section['first'] <= page <= section['last']:
                    rows.append(obj)
        path = out / f"a97001-content-{section['id']}-v1.jsonl"
        path.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')
        report = V.validate(source, str(path))
        reports.append({'section': section['id'], **report})
        print(section['id'], len(report['errors']), 'errors', len(report['warnings']), 'warnings')
    (out / 'validation.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    return int(any(r['errors'] for r in reports))


if __name__ == '__main__':
    raise SystemExit(main())
