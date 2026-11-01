"""Editor's corrections of the supplier's reader data, applied on every build and to published data.

    python scripts/atlas/reader_corrections.py <dir with sections/*.json> [--check] [--mathml]

The supplier (dots) delivers the translation; the reader shows it. What the visual acceptance of the whole
book found wrong in the *data* (docs/research/engineering-atlas/acceptance/2026-10-31-claude-visual/) is fixed
here, never by hand in the published JSON, so a rebuild keeps every fix:

* text rules (all Russian fields): spaces the supplier lost between a word and a number, a word and a Latin
  or Greek symbol, two Cyrillic words («числоЭйлера»);
* a reviewed dictionary of glued phrases (``corrections/<atlas>.json`` → ``glued``): proposed by the Russian
  dictionary (pymorphy3) and accepted one by one — real long words («износостойкость», «нахлёсточное») stay;
* structural edits by item id (``structure``): split a block that holds two (a list item and the paragraph
  after a margin mark), drop the text copy of a table that the page shows as a table, restore a heading.

Every change is idempotent: running the corrections twice gives the same data.
"""
import argparse
import copy
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CORRECTIONS_DIR = os.path.join(HERE, 'corrections')

# ---- text rules ----
CYR = 'А-Яа-яЁё'
RULES = [
    # «таблице303», «и4», «В75» → word, space, number (the book has no Cyrillic grade codes like Ст3 or ВК8)
    (re.compile(rf'(?<=[{CYR}])(?=\d)'), ' '),
    # «228сохранена», «5ремней», «4мм» → number, space, word
    (re.compile(rf'(?<=\d)(?=[{CYR}]{{2,}})'), ' '),
    # «вrpm», «иα», «вhe» → a one-letter preposition or conjunction glued to a symbol
    (re.compile(rf'(?<![{CYR}A-Za-z])([вВиИкКсСуУоОаА])(?=[A-Za-zα-ωΑ-Ω\[])'), r'\1 '),
    # «уголα», «силаF», «строкиa», «наf», «поPNG» → a Russian word glued to a symbol after it (the book has no
    # Latin terms typed with a Cyrillic look-alike letter, checked 2026-11-01)
    (re.compile(rf'(?<=[{CYR}]{{2}})(?=[A-Za-zα-ωΑ-Ω])'), ' '),
    # «Computeпредставляет», «kWпри» → a Latin word glued to a Russian word (one letter stays: n_среза)
    (re.compile(rf'(?<=[A-Za-z]{{2}})(?=[{CYR}]{{3}})'), ' '),
    # «числоЭйлера», «промежуточномуКПД» → two Cyrillic words (units кН, кВт, даН have fewer lower letters)
    (re.compile(r'(?<=[а-яё]{3})(?=[А-ЯЁ])'), ' '),
]


def fix_text(text, glued):
    if not isinstance(text, str) or not text:
        return text
    out = text
    for token, repl in glued.items():
        if token in out:   # only a whole run of letters, never a piece of a longer word
            out = re.sub(rf'(?<![{CYR}]){re.escape(token)}(?![{CYR}])', repl, out)
    if not re.search(rf'[{CYR}]', out):
        return out
    for rx, repl in RULES:
        out = rx.sub(repl, out)
    return out


def russian_fields(page):
    """(container, key) of every Russian string a reader sees on the page."""
    for item in page.get('items', []):
        yield item, 'ru'
        yield item, 'note' if item.get('type') == 'formula' else 'ambiguity_note'
        for v in item.get('vars') or []:
            yield v, 'ru'
    for x in page.get('errata') or []:
        yield x, 'explanation_ru'
        yield x, 'core_note'
    for f in page.get('figures') or []:
        yield f, 'caption_ru'
        for r in f.get('regions') or []:
            yield r, 'label_ru'
    for t in page.get('tables') or []:
        yield t, 'title_ru'
        for c in t.get('cells') or []:
            yield c, 'ru'
    for x in page.get('examples') or []:
        yield x, 'title_ru'
    for e in page.get('editor') or []:
        yield e, 'text'


# ---- structural edits ----
def _apply_structure(data, ops, log):
    by_page = {p['page']: p for p in data.get('pages', [])}
    for op in ops:
        if op['section'] != data.get('id'):
            continue
        page = by_page.get(op['page'])
        if not page:
            continue
        items = page['items']
        ids = [i['id'] for i in items]
        kind = op['op']
        if kind == 'drop':
            drop = set(op['ids'])
            if drop & set(ids):
                page['items'] = [i for i in items if i['id'] not in drop]
                log.append(f"p{op['page']}: убраны {len(drop & set(ids))} блок(а) — {op['why']}")
        elif kind == 'set':
            for i in items:
                if i['id'] == op['id'] and any(i.get(k) != v for k, v in op['fields'].items()):
                    i.update(op['fields'])
                    log.append(f"p{op['page']}: {op['id'].split(':')[-1]} исправлен — {op['why']}")
        elif kind == 'replace':
            already = any(s['id'] != op['id'] and s['id'] in ids for s in op['with'])
            if op['id'] in ids and not already:
                at = ids.index(op['id'])
                base = items[at]
                new = []
                for spec in op['with']:
                    item = {k: v for k, v in base.items() if k in ('type', 'status', 'terms')}
                    item.update(spec)
                    new.append(item)
                page['items'] = items[:at] + new + items[at + 1:]
                page['items'].sort(key=lambda i: i.get('y') if isinstance(i.get('y'), (int, float)) else 0)
                log.append(f"p{op['page']}: {op['id'].split(':')[-1]} разделён на {len(new)} — {op['why']}")
        else:
            raise ValueError('unknown op ' + kind)


def load_corrections(atlas_id='a97002'):
    path = os.path.join(CORRECTIONS_DIR, atlas_id + '.json')
    if not os.path.exists(path):
        return {'glued': {}, 'structure': []}
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def apply_section(data, corrections=None):
    """Corrected copy of one reader section and a human log of what changed."""
    corrections = corrections or load_corrections(data.get('atlas_id', 'a97002'))
    data = copy.deepcopy(data)
    log = []
    _apply_structure(data, corrections.get('structure', []), log)
    glued = corrections.get('glued', {})
    changed = 0
    for page in data.get('pages', []):
        for obj, key in russian_fields(page):
            before = obj.get(key)
            after = fix_text(before, glued)
            if after != before:
                obj[key] = after
                changed += 1
    if changed:
        log.append(f'{changed} русских строк: восстановлены пропущенные пробелы')
    return data, log


# ---- formulas the build could not typeset ----
def fill_mathml(sections):
    """Typeset formulas that still have no MathML (render-math.cjs, KaTeX). Returns the number filled."""
    todo = {}
    for si, d in enumerate(sections):
        for p in d.get('pages', []):
            for i in p.get('items', []):
                if i.get('type') == 'formula' and not i.get('mathml') and i.get('latex'):
                    todo[f'{si}|{i["id"]}'] = i['latex']
    if not todo:
        return 0
    tmp = tempfile.mkdtemp(prefix='atlas-mathml-')
    src, out = os.path.join(tmp, 'in.json'), os.path.join(tmp, 'out.json')
    with open(src, 'w', encoding='utf-8') as fh:
        json.dump(todo, fh, ensure_ascii=False)
    subprocess.run(['node', os.path.join(HERE, 'render-math.cjs'), src, out], check=True, capture_output=True)
    with open(out, encoding='utf-8') as fh:
        res = json.load(fh)
    n = 0
    for key, r in res.items():
        if not r.get('mathml'):
            continue
        si, iid = key.split('|', 1)
        for p in sections[int(si)]['pages']:
            for i in p['items']:
                if i['id'] == iid:
                    i['mathml'] = r['mathml']
                    n += 1
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description='Правки редактора к данным ридера атласа.')
    ap.add_argument('dir', help='папка с sections/*.json (или sec-*.json)')
    ap.add_argument('--check', action='store_true', help='только показать, что изменится')
    ap.add_argument('--mathml', action='store_true', help='сверстать формулы без MathML (нужен katex)')
    args = ap.parse_args(argv)
    files = sorted(glob.glob(os.path.join(args.dir, 'sections', '*.json'))) or sorted(glob.glob(os.path.join(args.dir, 'sec-*.json')))
    corrections = load_corrections()
    sections, total = [], 0
    for f in files:
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        fixed, log = apply_section(d, corrections)
        sections.append((f, fixed, fixed != d))
        for line in log:
            print(f"{d.get('id')}: {line}")
            total += 1
    if args.mathml:
        n = fill_mathml([s[1] for s in sections])
        print(f'формулы сверстаны: {n}')
        if n:
            sections = [(f, d, True) for f, d, _ in sections]
    if args.check:
        return 0
    for f, d, changed in sections:
        if changed:
            with open(f, 'w', encoding='utf-8', newline='\n') as fh:
                json.dump(d, fh, ensure_ascii=False, separators=(',', ':'))
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
