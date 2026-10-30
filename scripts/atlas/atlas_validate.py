"""Validate a content pack (linguistpro.atlas-content-pack.1.0.0) against its source pack.

    python atlas_validate.py --source <source-pack dir> --content <content.jsonl> [--json]

Exit code 0: no errors (warnings and core findings may exist). Exit code 1: errors.
The validator checks structure, IDs, geometry, status ownership, Hebrew letters and their
order, numbers, references, terms and formula arithmetic. It does not judge whether a
translation means the right thing: that needs a human reading.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_compute as C  # noqa: E402
import atlas_schema as S  # noqa: E402

ATLAS_ID = 'a97002'
HEB_LETTER = re.compile(r'[א-ת]')
FINALS = str.maketrans({'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'})
NUMBER = re.compile(r'\d+(?:[.,]\d+)?')
TEMP = re.compile(r'^new:(?P<parent>a97002:p[1-9][0-9]{0,2}(?::(?:fig[0-9]+|img[0-9]{2}))?):(?P<label>[a-z0-9]+(?:-[a-z0-9]+)*)$')
PRODUCER_RECOGNITION = {'ocr_high', 'ocr_low'}
PRODUCER_LANGUAGE = {'unreviewed', 'producer_checked'}
PAGE_OBJECT_TYPES = {'block', 'formula', 'symbol', 'figure', 'example'}
BBOX_TOLERANCE = 2.0


class SourcePack:
    def __init__(self, manifest, objects, order, pages_sha256):
        self.manifest = manifest
        self.objects = objects
        self.order = order
        self.pages_sha256 = pages_sha256


def load_source_pack(directory):
    """Source pack from a directory with manifest.json and pages.jsonl.

    pages_sha256 is taken over pages.jsonl with line endings normalised to LF, so a CRLF
    checkout of the same pack has the same identity.
    """
    with open(os.path.join(directory, 'manifest.json'), encoding='utf-8-sig') as fh:
        manifest = json.load(fh)
    with open(os.path.join(directory, 'pages.jsonl'), 'rb') as fh:
        data = fh.read().replace(b'\r\n', b'\n')
    objects, order = {}, []
    for line in data.decode('utf-8-sig').split('\n'):
        if line.strip():
            obj = json.loads(line)
            objects[obj['id']] = obj
            order.append(obj['id'])
    return SourcePack(manifest, objects, order, hashlib.sha256(data).hexdigest())


def _letters(text):
    """Hebrew letters in order, niqqud removed, final forms folded."""
    plain = ''.join(c for c in unicodedata.normalize('NFD', text or '') if unicodedata.category(c) != 'Mn')
    return ''.join(HEB_LETTER.findall(plain)).translate(FINALS)


def _skeleton(text):
    """Letters without the vowel letters ו and י: vocalised text is often spelled without them."""
    return _letters(text).replace('ו', '').replace('י', '')


def _numbers(text):
    return sorted(n.replace(',', '.') for n in NUMBER.findall(text or ''))


def _inside(inner, outer, tol=BBOX_TOLERANCE):
    return (inner[0] >= outer[0] - tol and inner[1] >= outer[1] - tol and inner[2] <= outer[2] + tol
            and inner[3] <= outer[3] + tol and inner[0] < inner[2] and inner[1] < inner[3])


class _Report:
    def __init__(self):
        self.errors, self.warnings, self.findings = [], [], []

    def add(self, bucket, code, ref, line, message):
        getattr(self, bucket).append({'code': code, 'ref': ref, 'line': line, 'message': message})

    def error(self, code, ref, line, message):
        self.add('errors', code, ref, line, message)

    def warn(self, code, ref, line, message):
        self.add('warnings', code, ref, line, message)

    def result(self, stats):
        return {'ok': not self.errors, 'errors': self.errors, 'warnings': self.warnings,
                'findings': self.findings, 'stats': stats}


def _page_bbox(source):
    w, h = source.manifest.get('source', {}).get('page_size_pt', [595, 842])
    return [0, 0, w, h]


def validate(source, content_path):
    rep = _Report()
    rows, parse_errors = S.read_jsonl(content_path)
    for message in parse_errors:
        number = int(message.split(':', 1)[0].split()[1])
        rep.error('E_PARSE', None, number, message)
    schema = S.load_schema('content-pack')
    stats = {'lines': len(rows) + len(parse_errors)}

    if not rows and parse_errors:
        return rep.result(stats)  # nothing readable: the parse errors say why
    if not rows or rows[0][1].get('type') != 'header':
        rep.error('E_HEADER', None, rows[0][0] if rows else None, 'первая строка должна быть объектом header')
        return rep.result(stats)
    header_line, header = rows[0]
    for message in S.check(schema, header):
        rep.error('E_SCHEMA', None, header_line, message)
    if header.get('source_pack_sha256') != source.pages_sha256:
        rep.error('E_SOURCE_MISMATCH', None, header_line,
                  f'пакет содержимого сделан не по этому исходному пакету: ожидается source_pack_sha256 {source.pages_sha256}')
        return rep.result(stats)
    if header.get('atlas_id') != ATLAS_ID:
        rep.error('E_HEADER', None, header_line, f'atlas_id должен быть {ATLAS_ID}')

    content, lines = {}, {}
    for line, obj in rows[1:]:
        if obj.get('type') == 'header':
            rep.error('E_HEADER', None, line, 'заголовок допускается только в первой строке')
            continue
        problems = S.check(schema, obj)
        for message in problems:
            rep.error('E_SCHEMA', obj.get('id'), line, message)
        if problems:
            continue
        oid = obj.get('id')
        if obj['type'] == 'report':
            continue
        if oid in content:
            code = 'E_TERM' if obj['type'] == 'term' else 'E_DUPLICATE_ID'
            rep.error(code, oid, line, f'ID {oid} встречается повторно (первый раз в строке {lines[oid]})')
            continue
        content[oid] = obj
        lines[oid] = line
    stats['objects'] = len(content)

    terms = {oid: o for oid, o in content.items() if o['type'] == 'term'}
    _check_ids(source, content, lines, rep)
    _check_status(source, content, lines, rep)
    _check_text(source, content, lines, header, rep)
    _check_terms(content, lines, terms, rep)
    _check_refs(source, content, lines, terms, rep)
    _check_formulas(source, content, lines, rep)
    _check_examples(source, content, lines, rep)
    _check_figures(source, content, header, rep)
    return rep.result(stats)


def _check_ids(source, content, lines, rep):
    for oid, obj in content.items():
        line = lines[oid]
        if obj['type'] == 'term':
            continue
        if oid.startswith('new:'):
            m = TEMP.match(oid)
            if not m:
                rep.error('E_NEW_ID', oid, line, 'временный ID должен иметь вид new:<ID родителя>:<метка>')
                continue
            parent = m.group('parent')
            if parent not in source.objects or source.objects[parent]['type'] not in ('page', 'figure'):
                rep.error('E_NEW_ID', oid, line, f'родитель {parent} не найден в исходном пакете')
                continue
            if 'parent' in obj and obj['parent'] != parent:
                rep.error('E_NEW_ID', oid, line, f'поле parent ({obj["parent"]}) не совпадает с родителем в ID ({parent})')
            if 'bbox' in obj:
                parent_obj = source.objects[parent]
                outer = parent_obj['bbox'] if parent_obj['type'] == 'figure' else _page_bbox(source)
                if not _inside(obj['bbox'], outer):
                    rep.error('E_BBOX_OUTSIDE', oid, line,
                              f'bbox {obj["bbox"]} выходит за родителя {outer}: bbox задаётся в пунктах страницы PDF '
                              '(начало — левый верхний угол страницы), а не в пикселях вырезки')
            for cell in obj.get('cells', []):
                if 'bbox' in cell and not _inside(cell['bbox'], obj['bbox']):
                    rep.error('E_BBOX_OUTSIDE', oid, line, f'ячейка ({cell["row"]},{cell["col"]}) выходит за bbox таблицы')
            continue
        if oid not in source.objects:
            rep.error('E_UNKNOWN_ID', oid, line, f'ID {oid} отсутствует в исходном пакете')
        elif source.objects[oid]['type'] != obj['type']:
            rep.error('E_TYPE_MISMATCH', oid, line, f'в исходном пакете {oid} имеет тип {source.objects[oid]["type"]}, а не {obj["type"]}')


def _check_status(source, content, lines, rep):
    for oid, obj in content.items():
        status = obj.get('status') or {}
        line = lines[oid]
        if 'math_review' in status or status.get('owner_status', 'none') != 'none' or status.get('language_review') == 'owner_reviewed':
            rep.error('E_STATUS_OWNER', oid, line, 'math_review ставит ядро, owner_* и owner_reviewed — только владелец')
        rec = status.get('recognition')
        if rec is None:
            continue
        has_text = oid in source.objects and obj['type'] == 'block'
        if rec not in PRODUCER_RECOGNITION or has_text:
            rep.error('E_STATUS_RECOGNITION', oid, line,
                      'recognition ставится поставщиком только как ocr_high/ocr_low и только у объектов без текстового слоя')


def _check_text(source, content, lines, header, rep):
    pages = set(header.get('pages', []))
    missing_translit_ru = 0
    for sid in source.order:
        src = source.objects[sid]
        if src['type'] != 'block' or not _letters(src['he_raw']):
            continue
        obj = content.get(sid)
        if obj is None:
            # coverage is required only for the pages the header promises; text checks run on every delivered block
            if src['page'] in pages:
                rep.error('E_COVERAGE', sid, None, 'блок не покрыт')
            continue
        empty = [k for k in ('he', 'he_niqqud', 'translit', 'ru') if not obj.get(k, '').strip()]
        if empty:
            rep.error('E_COVERAGE', sid, lines.get(sid), f'пустые поля: {", ".join(empty)}')
            continue
        line = lines[sid]
        raw, he = _letters(src['he_raw']), _letters(obj['he'])
        fixed = 'he_fix_note' in obj
        if sorted(raw) != sorted(he):
            if fixed:
                rep.warn('W_HEBREW_FIXED', sid, line, 'буквы he отличаются от he_raw (есть he_fix_note)')
            else:
                rep.error('E_HEBREW_LETTERS', sid, line, 'набор букв he не совпадает с he_raw: слово потеряно или добавлено')
        elif raw != he:
            if fixed:
                rep.warn('W_HEBREW_ORDER_FIXED', sid, line, 'порядок букв he отличается от he_raw (есть he_fix_note)')
            else:
                rep.error('E_HEBREW_ORDER', sid, line, 'буквы те же, но порядок другой: слова переставлены')
        if _skeleton(obj['he_niqqud']) != _skeleton(obj['he']):
            rep.error('E_NIQQUD_BASE', sid, line, 'he_niqqud без огласовок (и без букв ו/י) не совпадает с he')
        ru_numbers = set(_numbers(obj['ru']))
        lost = [n for n in _numbers(src['he_raw']) if n not in ru_numbers]
        if lost:
            rep.error('E_NUMBERS', sid, line, f'в переводе нет чисел: {", ".join(lost)}')
        if not obj.get('translit_ru'):
            missing_translit_ru += 1
    if missing_translit_ru:
        rep.warn('W_TRANSLIT_RU_MISSING', None, None, f'у {missing_translit_ru} блоков нет translit_ru (желательное поле)')


def _check_terms(content, lines, terms, rep):
    for tid, term in terms.items():
        senses = [s['sense'] for s in term['senses']]
        if len(senses) != len(set(senses)):
            rep.error('E_TERM', tid, lines[tid], 'смысл (sense) повторяется внутри термина')
    used = set()
    for obj in content.values():
        for ref in obj.get('terms', []) + ([obj['term']] if obj.get('term') else []) + obj.get('links', []):
            used.add(ref)
    for tid, term in terms.items():
        for sense in term['senses']:
            if f'{tid}#{sense["sense"]}' not in used:
                rep.warn('W_TERM_UNUSED', tid, lines[tid], f'на смысл {sense["sense"]} никто не ссылается')
    for oid, obj in content.items():
        for ref in obj.get('terms', []):
            tid, _, sense = ref.partition('#')
            term = terms.get(tid)
            match = term and next((s for s in term['senses'] if s['sense'] == sense), None)
            if match and obj.get('ru') and not _ru_has_stem(obj['ru'], match['ru']):
                rep.warn('W_TERM_RU', oid, lines[oid], f'в переводе не видно «{match["ru"]}» ({ref})')


def _ru_has_stem(text, phrase):
    text = text.lower()
    for word in re.findall(r'\w+', phrase.lower()):
        stem = word[:max(3, len(word) - 3)]  # Russian declension: ремень / ремня
        if stem not in text:
            return False
    return True


def _known(ref, source, content, terms):
    if '#' in ref:
        tid, _, sense = ref.partition('#')
        return tid in terms and any(s['sense'] == sense for s in terms[tid]['senses'])
    return ref in source.objects or ref in content


def _check_refs(source, content, lines, terms, rep):
    for oid, obj in content.items():
        refs = list(obj.get('terms', [])) + list(obj.get('links', [])) + list(obj.get('symbols', []))
        for key in ('term', 'target', 'formula_id'):
            if obj.get(key):
                refs.append(obj[key])
        refs += [step['block'] for step in obj.get('steps', []) if 'block' in step]
        for ref in refs:
            if not _known(ref, source, content, terms):
                rep.error('E_REF', oid, lines[oid], f'ссылка на несуществующий объект {ref}')


def _formula_symbols(fid, source, content):
    out = []
    for sid, src in source.objects.items():
        if src['type'] != 'symbol':
            continue
        bound = (content.get(sid) or {}).get('formula_id') or src.get('formula_id')
        if bound == fid:
            out.append(sid)
    for sid in (content.get(fid) or {}).get('symbols', []):
        if sid not in out:
            out.append(sid)
    return out


def _check_formulas(source, content, lines, rep):
    for oid, obj in content.items():
        reserved = [v for v in ([obj.get('var')] if obj['type'] == 'symbol' else [x['var'] for x in obj.get('local_vars', [])])
                    if v in C.CONSTANTS]
        if reserved:
            rep.error('E_COMPUTE', oid, lines[oid], f'{", ".join(reserved)} — константы грамматики, переименуйте переменную (например e_lim)')
        if obj['type'] == 'symbol':
            src = source.objects.get(oid, {})
            if obj.get('formula_id'):
                if src.get('formula_id') and obj['formula_id'] != src['formula_id']:
                    rep.error('E_SYMBOL_BINDING', oid, lines[oid], f'экстрактор привязал символ к {src["formula_id"]}; менять привязку нельзя')
                elif not src.get('formula_id'):
                    rep.warn('W_SYMBOL_BOUND_BY_PRODUCER', oid, lines[oid], f'привязка к {obj["formula_id"]} предложена поставщиком — на просмотр')
        if obj['type'] != 'formula':
            continue
        line = lines[oid]
        expr = obj.get('compute')
        if expr is None:
            if not obj.get('compute_absent_reason'):
                rep.error('E_COMPUTE', oid, line, 'нет ни compute, ни compute_absent_reason')
            continue
        symbol_ids = _formula_symbols(oid, source, content)
        known_vars = {content[s]['var']: s for s in symbol_ids if s in content}
        local = [v['var'] for v in obj.get('local_vars', [])]
        clash = sorted({v for v in local if local.count(v) > 1 or v in known_vars})
        if clash:
            rep.error('E_COMPUTE', oid, line, f'переменные объявлены дважды: {", ".join(clash)}')
        all_vars = set(known_vars) | set(local)
        result = obj.get('result_var')
        if result and result not in all_vars:
            rep.error('E_COMPUTE', oid, line, f'result_var {result} не объявлен ни символом, ни в local_vars')
        try:
            used = C.variables(expr)
            if C.uses_trig(expr) and obj.get('angle_unit') not in ('deg', 'rad'):
                rep.error('E_COMPUTE', oid, line, 'тригонометрия без angle_unit')
        except C.ComputeError as exc:
            rep.error('E_COMPUTE', oid, line, f'compute не разбирается: {exc}')
            continue
        unknown = sorted(used - all_vars)
        if unknown:
            rep.error('E_COMPUTE', oid, line, f'переменные не из символов формулы и не из local_vars: {", ".join(unknown)}')
        for var, sid in known_vars.items():
            if var not in used and var != result:
                rep.warn('W_SYMBOL_UNUSED', sid, lines.get(sid), f'символ {var} формулы {oid} не встречается в compute')


def _source_numbers(source, pages, extra_ids=()):
    """Numbers printed on the given pages of the source pack (all raw text fields)."""
    out = set()
    for obj in source.objects.values():
        if obj.get('page') in pages or obj['id'] in extra_ids:
            for key in ('he_raw', 'source_text', 'symbol_raw', 'description_he_raw', 'unit_raw'):
                text = unicodedata.normalize('NFKC', obj.get(key) or '')
                out.update(float(n.replace(',', '.')) for n in NUMBER.findall(text))
    return out


def _anchored(value, numbers):
    return any(abs(value - n) <= 1e-9 * max(1.0, abs(value)) for n in numbers)


def _check_examples(source, content, lines, rep):
    for oid, obj in content.items():
        if obj['type'] != 'example':
            continue
        first = int(oid.split(':')[2][1:]) if oid.startswith('new:') else int(oid.split(':')[1][1:])
        printed_numbers = _source_numbers(source, set(range(first, first + 4)),
                                          [s['block'] for s in obj['steps'] if s.get('block')])
        for index, step in enumerate(obj['steps'], 1):
            ref = f'{oid}#step{index}'
            try:
                value = C.evaluate(step['compute'], step['bindings'], step.get('angle_unit'))
                ok = C.matches_printed(value, step['printed'])
            except C.ComputeError as exc:
                rep.error('E_COMPUTE', ref, lines[oid], f'шаг {index}: {exc}')
                continue
            loose = [str(v) for v in list(step['bindings'].values()) + [float(step['printed'].replace(',', '.').replace('\u2212', '-'))]
                     if not _anchored(abs(float(v)), printed_numbers)]
            if loose:
                rep.warn('W_PRINTED_UNANCHORED', ref, lines[oid],
                         f'шаг {index}: числа {", ".join(loose)} не найдены в тексте страниц {first}–{first + 3} исходного пакета')
                rep.add('findings', 'F_CORE_UNANCHORED', ref, lines[oid],
                        f'шаг {index}: пересчёт не засчитан — подстановки или напечатанный результат не подтверждены текстом книги')
                continue
            code = 'F_CORE_VERIFIED' if ok else 'F_CORE_MISMATCH'
            text = (f'шаг {index}: {step["compute"]} = {value:.6g}, напечатано {step["printed"]}'
                    + ('' if ok else ' — арифметика не сходится, кандидат в опечатку'))
            rep.add('findings', code, ref, lines[oid], text)


def _check_figures(source, content, header, rep):
    pages = set(header.get('pages', []))
    # a raster figure that is really a table is described by a table object, not by label regions
    with_regions = {o['parent'] for o in content.values() if o['type'] in ('region', 'table')}
    for sid, src in source.objects.items():
        if src['type'] == 'figure' and src['page'] in pages and sid not in with_regions:
            rep.warn('W_FIGURE_NO_REGIONS', sid, None, 'у рисунка нет размеченных областей (подписей)')


def _lf_sha(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read().replace(b'\r\n', b'\n')).hexdigest()


def validate_terms(book_text_path, candidates_path, terms_path):
    """Check a terms pack: header, term schema, occurrences quoted from the book, niqqud skeleton, candidate refs."""
    rep = _Report()
    rows, parse_errors = S.read_jsonl(terms_path)
    for message in parse_errors:
        rep.error('E_PARSE', None, int(message.split(':', 1)[0].split()[1]), message)
    stats = {'terms': 0, 'senses': 0}
    if not rows and parse_errors:
        return rep.result(stats)
    line, header = rows[0] if rows else (None, {})
    want = {'type': 'header', 'schema': 'linguistpro.atlas-terms-pack.1.0.0', 'atlas_id': ATLAS_ID}
    if any(header.get(k) != v for k, v in want.items()):
        rep.error('E_HEADER', None, line, 'первая строка: header со schema linguistpro.atlas-terms-pack.1.0.0 и atlas_id a97002')
        return rep.result(stats)
    if header.get('candidates_sha256') != _lf_sha(candidates_path):
        rep.error('E_SOURCE_MISMATCH', None, line, f'словарь сделан не по этому списку кандидатов: ожидается candidates_sha256 {_lf_sha(candidates_path)}')
        return rep.result(stats)
    book, _ = S.read_jsonl(book_text_path)
    # quotes are compared as consonant skeletons: a vocalised quote may drop the vowel letters ו/י
    page_letters = {r['page']: _skeleton(r['text']) for _, r in book}
    cand_rows, _ = S.read_jsonl(candidates_path)
    candidate_ids = {r['id'] for _, r in cand_rows}
    schema = S.load_schema('content-pack')
    seen = {}
    for line, obj in rows[1:]:
        if obj.get('type') == 'report':
            continue
        if obj.get('type') != 'term':
            rep.error('E_SCHEMA', obj.get('id'), line, 'в словаре допускаются только объекты term и report')
            continue
        problems = S.check(schema['$defs']['term'], obj, root=schema)
        if not obj.get('occurrences'):
            problems.append('$.occurrences: нужна хотя бы одна цитата из книги')
        for message in problems:
            rep.error('E_SCHEMA', obj.get('id'), line, message)
        if problems:
            continue
        tid = obj['id']
        if tid in seen:
            rep.error('E_TERM', tid, line, f'термин уже определён в строке {seen[tid]}')
            continue
        seen[tid] = line
        senses = [s['sense'] for s in obj['senses']]
        if len(senses) != len(set(senses)):
            rep.error('E_TERM', tid, line, 'смысл (sense) повторяется внутри термина')
        if _skeleton(obj['niqqud']) != _skeleton(obj['lemma_he']):
            rep.error('E_NIQQUD_BASE', tid, line, 'niqqud без огласовок (и без ו/י) не совпадает с lemma_he')
        for occ in obj['occurrences']:
            quote = _skeleton(occ['he'])
            if not quote or quote not in page_letters.get(occ['page'], ''):
                rep.error('E_OCCURRENCE', tid, line, f'цитата «{occ["he"]}» не найдена на стр. {occ["page"]}')
        for ref in obj.get('candidates', []):
            if ref not in candidate_ids:
                rep.error('E_REF', tid, line, f'нет кандидата {ref}')
        stats['terms'] += 1
        stats['senses'] += len(senses)
    return rep.result(stats)


def _print_human(report, out):
    out.write(('ПРОВЕРКА ПРОЙДЕНА' if report['ok'] else 'ЕСТЬ ОШИБКИ') +
              f": ошибок {len(report['errors'])}, предупреждений {len(report['warnings'])}, находок ядра {len(report['findings'])}\n")
    for title, key in (('Ошибки', 'errors'), ('Находки ядра', 'findings'), ('Предупреждения', 'warnings')):
        if report[key]:
            out.write(f'\n{title}:\n')
            for f in report[key]:
                where = f"строка {f['line']}" if f['line'] else ''
                out.write(f"  {f['code']}  {f['ref'] or ''}  {where}\n      {f['message']}\n")
    out.write('\nВалидатор проверяет структуру, буквы, числа, ссылки и арифметику; смысл перевода проверяет человек.\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Проверка пакета содержимого атласа.')
    parser.add_argument('--source', help='папка исходного пакета (manifest.json, pages.jsonl)')
    parser.add_argument('--content', help='пакет содержимого JSONL')
    parser.add_argument('--terms', help='словарь терминов JSONL (вместо --source/--content)')
    parser.add_argument('--book-text', help='текст книги по страницам (для --terms)')
    parser.add_argument('--candidates', help='список кандидатов в термины (для --terms)')
    parser.add_argument('--json', action='store_true', help='вывести отчёт в JSON')
    args = parser.parse_args(argv)
    if args.terms:
        if not (args.book_text and args.candidates):
            parser.error('--terms требует --book-text и --candidates')
        report = validate_terms(args.book_text, args.candidates, args.terms)
    else:
        if not (args.source and args.content):
            parser.error('нужны --source и --content (или --terms)')
        report = validate(load_source_pack(args.source), args.content)
    if args.json:
        sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    else:
        _print_human(report, sys.stdout)
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
