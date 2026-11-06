"""Build reviewable content packs from authored layers; never relax validator findings."""
import json
import re
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
    reflow_path = HERE / 'number-refs.json'
    number_refs = json.loads(reflow_path.read_text(encoding='utf-8')) if reflow_path.exists() else {}
    for p in sorted(HERE.glob('*-p*.json')):
        if not re.fullmatch(r'[a-z-]+-p\d+-p\d+\.json', p.name) or p.name.startswith('formulas-'):
            continue
        for block in json.loads(p.read_text(encoding='utf-8')).get('blocks', []):
            if block['id'] in blocks:
                raise ValueError('duplicate ' + block['id'])
            blocks[block['id']] = block
    out = ROOT / 'data/atlas/a97001/content'
    out.mkdir(parents=True, exist_ok=True)
    reports = []
    term_path = HERE / 'terms-compiled.json'
    terms = json.loads(term_path.read_text(encoding='utf-8')) if term_path.exists() else []
    # Match full and explicitly pointed spellings; stripping all vowel letters
    # conflates unrelated words (e.g. vector/diameter and normal/normalization).
    term_patterns = []
    for t in terms:
        forms = {t['lemma_he'], re.sub(r'[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]', '', t['niqqud'])}
        alternatives = '|'.join(re.escape(x) for x in sorted(forms, key=len, reverse=True))
        term_patterns.append((t, re.compile(r'(^|[^א-ת])(?:וה|וב|ול|בה|לה|ו|ב|ל|ה)?(?:' + alternatives + r')(?=$|[^א-ת])')))
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
            if sid in number_refs:
                obj['number_refs'] = number_refs[sid]
            obj['terms'] = [t['id']+'#mechanics' for t, rx in term_patterns if rx.search(b['he'])]
            rows.append(obj)
        used_terms = {tid.split('#')[0] for row in rows for tid in row.get('terms', [])}
        rows.extend(t for t in terms if t['id'] in used_terms)
        # Explicit additions include tables, figure legends and formulas transcribed from the scan.
        for p in sorted(HERE.glob('content-*.json')):
            for obj in json.loads(p.read_text(encoding='utf-8')):
                page = int(obj['id'].removeprefix('new:').split(':')[1][1:])
                if section['first'] <= page <= section['last']:
                    rows.append(obj)
        for p in sorted(HERE.glob('tables-*.json')):
            for table in json.loads(p.read_text(encoding='utf-8')):
                page = table['page']
                if not section['first'] <= page <= section['last']:
                    continue
                parent = table.get('parent', f'a97001:p{page}')
                obj = {'type': 'table', 'id': f"new:{parent}:{table['label']}", 'parent': parent,
                       'bbox': table.get('bbox') or source.objects[parent]['bbox'],
                       'title_he': table['he'], 'title_ru': table['ru'],
                       'cells': [], 'status': {'language_review': 'unreviewed'}}
                for r, row in enumerate(table['rows']):
                    for c, cell in enumerate(row):
                        he, ru = cell if isinstance(cell, list) else (str(cell), str(cell))
                        obj['cells'].append({'row': r, 'col': c, 'rowspan': 1, 'colspan': 1, 'he': he, 'ru': ru})
                rows.append(obj)
        for p in sorted(HERE.glob('figures-*.json')):
            for suffix, he, ru in json.loads(p.read_text(encoding='utf-8')):
                fid = 'a97001:' + suffix
                src = source.objects[fid]
                if section['first'] <= src['page'] <= section['last']:
                    rows.append({'type': 'figure', 'id': fid, 'caption_he': he, 'caption_ru': ru,
                                 'status': {'language_review': 'unreviewed'}})
        for p in sorted(HERE.glob('formulas-*.json')):
            for entry in json.loads(p.read_text(encoding='utf-8')):
                suffix, latex, *note = entry
                fid = 'a97001:' + suffix
                src = source.objects[fid]
                if not section['first'] <= src['page'] <= section['last']:
                    continue
                obj = {'type': 'formula', 'id': fid, 'display_latex': latex, 'compute': None,
                       'compute_absent_reason': 'Запись со скана: равенство, система или числовая подстановка; отдельная проверка расчёта не заявлена.',
                       'status': {'language_review': 'unreviewed'}}
                if note:
                    obj['ambiguity_note'] = note[0]
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
