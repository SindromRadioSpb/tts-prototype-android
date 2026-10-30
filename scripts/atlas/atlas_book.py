"""Book-level tools for the atlas: section map, whole-book extraction by section, term candidates.

    python scripts/atlas/atlas_book.py extract --pdf <formulary.pdf> --out <root> [--only s09-belt,s25-size-tolerance]
    python scripts/atlas/atlas_book.py candidates --root <root> --out <candidates.jsonl>
"""
import argparse
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERE = os.path.dirname(os.path.abspath(__file__))
SECTIONS = os.path.abspath(os.path.join(HERE, '..', '..', 'atlas', 'a97002', 'sections.json'))
HEB_WORD = re.compile(r'[א-ת]+(?:["\'׳״][א-ת]+)*')
PREFIXES = 'ובהלמשכ'
STOP = set('של את על עם או כי אם זה זו זאת הוא היא הם הן לא כל גם יש אין בין כאשר לפי ידי אחד אחת שני שתי '
           'יותר פחות כמו כך לכן אך אבל רק עד מן מה מי כן אלא ללא בו בה בהם להם לו לה שלו שלה כגון וכו'.split())
CAPTION = re.compile(r'^\s*איור\s*\d+\s*[-–]\s*')


def load_sections(path=SECTIONS):
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    expected = 1
    for section in data['sections']:
        if section['first'] != expected or section['last'] < section['first']:
            raise ValueError(f'section {section["id"]}: pages must continue from {expected}')
        expected = section['last'] + 1
    if expected != data['page_count'] + 1:
        raise ValueError(f'sections end at {expected - 1}, book has {data["page_count"]} pages')
    return data


def section_for_page(data, page):
    return next(s for s in data['sections'] if s['first'] <= page <= s['last'])


def _read(pack_dir):
    with open(os.path.join(pack_dir, 'pages.jsonl'), encoding='utf-8') as fh:
        return [json.loads(line) for line in fh if line.strip()]


def summarize_section(pack_dir):
    objs = _read(pack_dir)
    warnings = []
    manifest = os.path.join(pack_dir, 'manifest.json')
    if os.path.exists(manifest):
        with open(manifest, encoding='utf-8') as fh:
            warnings = json.load(fh).get('warnings', [])
    count = collections.Counter(o['type'] for o in objs)
    pages = [o for o in objs if o['type'] == 'page']
    with_blocks = {o['page'] for o in objs if o['type'] == 'block'}
    return {'id': os.path.basename(os.path.normpath(pack_dir)), 'pages': len(pages), 'blocks': count['block'],
            'formulas': count['formula'], 'symbols': count['symbol'], 'figures': count['figure'], 'examples': count['example'],
            'image_only_pages': sorted(p['page'] for p in pages if not p['has_text_layer']),
            'text_pages_without_blocks': sorted(p['page'] for p in pages if p['has_text_layer'] and p['page'] not in with_blocks),
            'warnings': len(warnings)}


def extract_book(pdf, out_root, only=None, sections_path=SECTIONS):
    import atlas_extract as X

    data = load_sections(sections_path)
    rows = []
    for section in data['sections']:
        if only and section['id'] not in only:
            continue
        out = os.path.join(out_root, section['id'])
        X.extract(pdf, list(range(section['first'], section['last'] + 1)), out)
        X.contact_sheet(pdf, out, columns=6, dpi=40)
        rows.append(summarize_section(out))
        sys.stdout.write(json.dumps(rows[-1], ensure_ascii=False) + '\n')
        sys.stdout.flush()
    return rows


def book_text(root, section_ids):
    """Raw Hebrew text of the book by page (blocks, then symbol rows): the reference for term occurrences."""
    pages = {}
    for sid in section_ids:
        for o in _read(os.path.join(root, sid)):
            if o['type'] == 'block':
                pages.setdefault(o['page'], (sid, []))[1].append(o['he_raw'])
            elif o['type'] == 'symbol':
                pages.setdefault(o['page'], (sid, []))[1].append(f'{o["symbol_raw"]} — {o["description_he_raw"]} {o["unit_raw"]}'.strip())
    return [{'page': p, 'section': sid, 'text': '\n'.join(parts)} for p, (sid, parts) in sorted(pages.items())]


def _norm(word, vocab):
    for _ in range(2):
        if len(word) > 3 and word[0] in PREFIXES and word[1:] in vocab:
            word = word[1:]
        else:
            break
    return word


def _clean_phrase(text):
    text = CAPTION.sub('', text)
    text = re.sub(r'^[•\d\s).:-]+', '', text)
    return re.sub(r'\s+', ' ', text).strip(' :.-–')


def term_candidates(root, section_ids, min_count=4, max_phrase=3):
    """Term candidates for the supplier: headings, figure titles, symbol descriptions and frequent phrases."""
    objs = []
    for sid in section_ids:
        objs += [dict(o, section=sid) for o in _read(os.path.join(root, sid))]
    blocks = [o for o in objs if o['type'] == 'block' and HEB_WORD.search(o.get('he_raw', ''))]
    vocab = {w for b in blocks for w in HEB_WORD.findall(b['he_raw'])}
    vocab |= {w for o in objs if o['type'] == 'symbol' for w in HEB_WORD.findall(o.get('description_he_raw', ''))}
    found = {}

    def add(text, source, page, section, context, count=1):
        text = _clean_phrase(text)
        if not HEB_WORD.search(text) or len(text) > 60:
            return
        entry = found.setdefault(text, {'he': text, 'sources': set(), 'count': 0, 'pages': set(), 'sections': set(), 'context': context})
        entry['sources'].add(source)
        entry['count'] += count
        entry['pages'].add(page)
        entry['sections'].add(section)

    for b in blocks:
        if b['kind_guess'] == 'heading':
            add(b['he_raw'], 'heading', b['page'], b['section'], b['he_raw'][:120])
        elif b['kind_guess'] == 'caption':
            add(b['he_raw'], 'caption', b['page'], b['section'], b['he_raw'][:120])
    for o in objs:
        if o['type'] == 'symbol' and HEB_WORD.search(o.get('description_he_raw', '')):
            add(o['description_he_raw'], 'symbol', o['page'], o['section'], f'{o["symbol_raw"]} — {o["description_he_raw"]} {o["unit_raw"]}'.strip())

    counts, where = collections.Counter(), collections.defaultdict(list)
    for b in blocks:
        words = [_norm(w, vocab) for w in HEB_WORD.findall(b['he_raw'])]
        for n in range(2, max_phrase + 1):
            for i in range(len(words) - n + 1):
                gram = words[i:i + n]
                if any(w in STOP or len(w) < 2 for w in gram):
                    continue
                phrase = ' '.join(gram)
                counts[phrase] += 1
                where[phrase].append(b)
    for phrase, count in counts.items():
        if count >= min_count:
            for b in where[phrase]:
                add(phrase, 'phrase', b['page'], b['section'], '', 0)
            entry = found[phrase]
            entry['count'] = max(entry['count'], 0) + count
            first = where[phrase][0]['he_raw']
            k = first.find(phrase.split()[-1])
            entry['context'] = entry['context'] or first[max(0, k - 50):k + 60]

    order = {'heading': 0, 'symbol': 1, 'caption': 2, 'phrase': 3}
    out = sorted(found.values(), key=lambda e: (min(order[s] for s in e['sources']), -e['count'], e['he']))
    result = []
    for i, e in enumerate(out, 1):
        result.append({'id': f'c{i:04d}', 'he': e['he'], 'sources': sorted(e['sources'], key=order.get), 'count': e['count'],
                       'pages': sorted(e['pages'])[:12], 'sections': sorted(e['sections']), 'context': e['context']})
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description='Атлас: уровень книги.')
    sub = parser.add_subparsers(dest='cmd', required=True)
    ex = sub.add_parser('extract')
    ex.add_argument('--pdf', required=True)
    ex.add_argument('--out', required=True)
    ex.add_argument('--only', default='')
    bt = sub.add_parser('booktext')
    bt.add_argument('--root', required=True)
    bt.add_argument('--out', required=True)
    ca = sub.add_parser('candidates')
    ca.add_argument('--root', required=True)
    ca.add_argument('--out', required=True)
    ca.add_argument('--min-count', type=int, default=4)
    args = parser.parse_args(argv)
    if args.cmd == 'booktext':
        ids = [s['id'] for s in load_sections()['sections'] if os.path.isdir(os.path.join(args.root, s['id']))]
        rows = book_text(args.root, ids)
        with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        sys.stdout.write(f'страниц с текстом: {len(rows)}\n')
        return 0
    if args.cmd == 'extract':
        only = {s for s in args.only.split(',') if s}
        rows = extract_book(args.pdf, args.out, only or None)
        with open(os.path.join(args.out, 'summary.json'), 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(rows, fh, ensure_ascii=False, indent=1)
    else:
        ids = [s['id'] for s in load_sections()['sections'] if os.path.isdir(os.path.join(args.root, s['id']))]
        cands = term_candidates(args.root, ids, args.min_count)
        with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
            for c in cands:
                fh.write(json.dumps(c, ensure_ascii=False) + '\n')
        sys.stdout.write(f'кандидатов: {len(cands)}\n')
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
