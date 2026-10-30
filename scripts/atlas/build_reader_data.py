"""Reader data for the Reading Room atlas screen.

    python scripts/atlas/build_reader_data.py --sections-root .tmp/atlas-book --contents <dir> --out data/atlas/a97002

Per section: source pack (+ the supplier's content pack when there is one) -> graph -> compact JSON by page
with MathML formulas, figures with label regions, tables, examples and merged errata. Sections without a
content pack are published as raw text marked 'not translated'. Assets are copied next to the data and
served from /data/atlas/a97002/assets/ (the server maps /data/atlas to the data volume).
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_book as K  # noqa: E402
import atlas_import as I  # noqa: E402
import atlas_validate as V  # noqa: E402
import atlas_compute as C  # noqa: E402
import atlas_schema as S  # noqa: E402
import reader_text as X  # noqa: E402
import render_preview as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
URL = '/data/atlas/a97002/'
BLOCK_FIELDS = ('kind', 'he', 'he_niqqud', 'translit', 'translit_ru', 'ru', 'terms', 'ambiguity_note', 'he_fix_note')


def _source_graph(source):
    """Graph of an untranslated section: source objects only, honest statuses."""
    objects, pages = {}, {}
    for oid in source.order:
        obj = dict(source.objects[oid])
        if obj['type'] != 'page':
            obj['status'] = {'recognition': 'extracted', 'language_review': 'unreviewed', 'math_review': 'unchecked', 'owner_status': 'none'}
        objects[oid] = obj
        pages.setdefault(str(obj['page']), []).append(oid)
    return {'objects': objects, 'pages': pages, 'terms': {}, 'findings': [], 'warnings': [],
            'source_pack_sha256': source.pages_sha256, 'content_pack_sha256': None}


def _render_math(latex_by_key):
    if not latex_by_key:
        return {}
    d = tempfile.mkdtemp(prefix='atlas-math-')
    try:
        src, out = os.path.join(d, 'in.json'), os.path.join(d, 'out.json')
        with open(src, 'w', encoding='utf-8') as fh:
            json.dump(latex_by_key, fh, ensure_ascii=False)
        subprocess.run(['node', os.path.join(HERE, 'render-math.cjs'), src, out], check=True, capture_output=True)
        with open(out, encoding='utf-8') as fh:
            return json.load(fh)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def _asset(source_dir, rel, out_root):
    if not rel:
        return None
    name = os.path.basename(rel)
    target = os.path.join(out_root, 'assets', name)
    if not os.path.exists(target):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(os.path.join(source_dir, rel), target)
    return URL + 'assets/' + name


def _report_notes(content_path):
    """The supplier's per-page report ('discrepancies'): editor notes keyed by page number."""
    notes = {}
    if not content_path:
        return notes
    rows, _ = S.read_jsonl(content_path)
    for _, obj in rows[1:]:
        if obj.get('type') != 'report':
            continue
        for d in obj.get('discrepancies', []):
            m = re.search(r':p(\d+)', d.get('ref', ''))
            if m and d.get('note'):
                notes.setdefault(int(m.group(1)), []).append({'about': 'page', 'ref': d['ref'], 'text': d['note']})
    return notes


def _page_state(page):
    """translated | partial | none | empty: tables and figure labels count as translated content (acceptance R07)."""
    parts = [bool(b.get('ru')) for b in page.blocks]
    parts += [any(c.get('ru') for c in t.get('cells', [])) for t in page.tables]
    for f in page.figures:
        labels = [r for r in page.regions if r.get('parent') == f['id']]
        if labels:
            parts.append(any(r.get('label_ru') for r in labels))
    if not parts:
        return 'empty' if not page.formulas else 'translated'
    if all(parts):
        return 'translated'
    return 'partial' if any(parts) else 'none'


def _with_value(step):
    out = dict(step)
    try:
        out['value'] = round(C.evaluate(step['compute'], step['bindings'], step.get('angle_unit')), 9)
    except (C.ComputeError, KeyError, TypeError):
        pass
    return out




def build_section(section, source_dir, content_path, out_root, terms_path=None):
    source = V.load_source_pack(source_dir)
    graph = I.build_graph(source, content_path, terms_path=terms_path)[0] if content_path else _source_graph(source)
    report = _report_notes(content_path)
    latex, pages_out, term_refs = {}, [], set()
    for n in range(section['first'], section['last'] + 1):
        if str(n) not in graph['pages']:
            continue
        page = P.Page(graph, n)
        items, editor = [], []
        ordered = sorted(page.blocks + page.formulas, key=lambda o: (o.get('bbox') or [0, 0])[1])
        positions = {o['id'].rsplit(':', 1)[1]: (o.get('bbox') or [0, 0])[1] for o in ordered}

        def reader(text, y, about, ref):
            """Reader part of a supplier note with ids replaced; the pipeline part goes to the editor panel."""
            mine, theirs = X.split_note(text)
            if theirs:
                editor.append({'about': about, 'ref': ref, 'text': theirs})
            return X.rewrite_refs(mine, n, y, positions) or None

        for o in ordered:
            y = (o.get('bbox') or [0, 0])[1]
            base = {'id': o['id'], 'type': o['type'], 'y': round(y, 1), 'status': o.get('status')}
            if o['type'] == 'block':
                if o.get('ru'):
                    base.update({k: o[k] for k in BLOCK_FIELDS if o.get(k)})
                    base['ru'] = X.rewrite_refs(o['ru'], n, y, positions)
                    if o.get('ambiguity_note'):
                        note = reader(o['ambiguity_note'], y, 'block', o['id'])
                        if note:
                            base['ambiguity_note'] = note
                        else:
                            del base['ambiguity_note']
                    term_refs.update(o.get('terms', []))
                else:
                    base.update({'kind': o.get('kind_guess'), 'he_raw': o.get('he_raw', '')})
            else:
                vars_, result_tex = [], None
                for k, v in enumerate(page.formula_vars(o)):
                    key = f'inline:{o["id"]}:{k}'
                    pretty = X.pretty_symbol(v['latex'])
                    tex_v = pretty or v['latex']
                    latex[key] = tex_v
                    if o.get('result_var') and v['ref'].endswith('#' + o['result_var']) and pretty:
                        result_tex = tex_v
                    vars_.append({'key': key, 'latex': tex_v, 'he': v['he'], 'ru': X.rewrite_refs(v['ru'], n, y, positions),
                                  'unit': v['unit'], 'ref': v['ref']})
                tex = o.get('display_latex')
                full = X.formula_with_result(tex, result_tex)
                if full:
                    tex = full
                if tex:
                    latex[o['id']] = tex
                base.update({'latex': tex, 'source_text': o.get('source_text'), 'vars': vars_, 'compute': o.get('compute'),
                             'angle_unit': o.get('angle_unit'), 'result_var': o.get('result_var'),
                             'note': reader(o.get('ambiguity_note'), y, 'formula', o['id']),
                             'crop': _asset(source_dir, o.get('crop'), out_root)})
                if full:
                    base['lhs_restored'] = True
            items.append(base)
        figures = []
        for f in page.figures:
            regions = [{'id': r['id'], 'bbox': r['bbox'], 'label_he': r.get('label_he', ''), 'label_ru': r.get('label_ru', ''),
                        'links': r.get('links', [])} for r in page.regions if r.get('parent') == f['id']]
            for r in regions:
                term_refs.update(x for x in r['links'] if '#' in x)
            figures.append({'id': f['id'], 'number': f.get('number'), 'bbox': f['bbox'], 'crop': _asset(source_dir, f.get('crop'), out_root),
                            'caption_he': f.get('caption_he', ''), 'caption_ru': f.get('caption_ru', ''), 'regions': regions,
                            'is_table': any(t.get('parent') == f['id'] for t in page.tables)})
        for s in page.symbols:
            if s.get('term'):
                term_refs.add(s['term'])
        state = _page_state(page)
        errata = []
        for x in page.errata:
            e = {k: x.get(k) for k in ('id', 'target', 'as_printed', 'proposed', 'explanation_ru', 'core_note', 'origin')}
            if x.get('origin') != 'core' and e['explanation_ru']:
                e['explanation_ru'] = reader(e['explanation_ru'], None, 'erratum', x['id'])
            errata.append(e)
        pages_out.append({
            'page': n, 'image': _asset(source_dir, page.page and page.page.get('image'), out_root),
            'has_text_layer': bool(page.page and page.page.get('has_text_layer')), 'state': state,
            'translated': state in ('translated', 'partial', 'empty'), 'editor': editor + report.get(n, []),
            'items': items, 'figures': figures,
            'tables': [{'id': t['id'], 'parent': t.get('parent'), 'title_he': t.get('title_he', ''), 'title_ru': t.get('title_ru', ''),
                        'cells': t['cells']} for t in page.tables],
            'examples': [{'id': x['id'], 'title_ru': x.get('title_ru', ''), 'steps': [_with_value(s) for s in x.get('steps', [])],
                          'math_review': (x.get('status') or {}).get('math_review')} for x in page.examples],
            'errata': errata,
        })
    math = _render_math(latex)
    for page in pages_out:
        for item in page['items']:
            if item['type'] == 'formula':
                item['mathml'] = (math.get(item['id']) or {}).get('mathml')
                for v in item['vars']:
                    v['mathml'] = (math.get(v.pop('key')) or {}).get('mathml')
    terms = {}
    for ref in sorted(term_refs):
        tid = ref.split('#')[0]
        if tid in graph['terms']:
            terms[tid] = {k: graph['terms'][tid][k] for k in ('lemma_he', 'niqqud', 'translit', 'translit_ru', 'senses') if k in graph['terms'][tid]}
    data = {'schema': 'linguistpro.atlas-reader-section.1.0.0', 'atlas_id': 'a97002', 'id': section['id'],
            'part': section.get('part'), 'title_he': section['he'], 'title_ru': section['ru'],
            'first': section['first'], 'last': section['last'], 'translated': bool(content_path),
            'source_pack_sha256': graph['source_pack_sha256'], 'content_pack_sha256': graph.get('content_pack_sha256'),
            'pages': pages_out, 'terms': terms}
    os.makedirs(os.path.join(out_root, 'sections'), exist_ok=True)
    with open(os.path.join(out_root, 'sections', section['id'] + '.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    return data


def build_index(sections, built, parts):
    return {'schema': 'linguistpro.atlas-reader-index.1.0.0', 'atlas_id': 'a97002',
            'title_he': 'נוסחאון 97002 — חלקי מכונות ועיבוד שבבי', 'title_ru': 'Формуляр 97002 — детали машин и обработка резанием',
            'built_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'parts': parts,
            'sections': [{'id': s['id'], 'part': s.get('part'), 'he': s['he'], 'ru': s['ru'], 'first': s['first'], 'last': s['last'],
                          'translated': bool(built.get(s['id'], {}).get('translated'))} for s in sections]}


def _latest_content(contents_dir, sid):
    if not contents_dir:
        return None
    found = sorted(glob.glob(os.path.join(contents_dir, f'a97002-content-{sid}-v*.jsonl')))
    return found[-1] if found else None


def main(argv=None):
    parser = argparse.ArgumentParser(description='Данные ридера атласа.')
    parser.add_argument('--sections-root', required=True, help='исходные пакеты разделов (atlas_book.py extract)')
    parser.add_argument('--contents', help='папка с пакетами dots a97002-content-<раздел>-v*.jsonl')
    parser.add_argument('--out', required=True)
    parser.add_argument('--terms-core', help='общий словарь книги (a97002-terms-v*.jsonl)')
    parser.add_argument('--only', default='')
    args = parser.parse_args(argv)
    data = K.load_sections()
    only = {s for s in args.only.split(',') if s}
    built = {}
    for s in data['sections']:
        if only and s['id'] not in only:
            continue
        built[s['id']] = build_section(s, os.path.join(args.sections_root, s['id']), _latest_content(args.contents, s['id']), args.out, args.terms_core)
        sys.stdout.write(f'{s["id"]}: {"перевод" if built[s["id"]]["translated"] else "без перевода"}\n')
    index_path = os.path.join(args.out, 'index.json')
    previous = {}
    if os.path.exists(index_path):
        with open(index_path, encoding='utf-8') as fh:
            previous = {x['id']: {'translated': x['translated']} for x in json.load(fh)['sections']}
    with open(index_path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(build_index(data['sections'], {**previous, **built}, data['parts']), fh, ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
