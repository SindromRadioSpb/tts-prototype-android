"""Independent check of errata candidates from the content supplier.

    python scripts/atlas/atlas_errata.py --candidates <errata.jsonl> --book-text <book-text.jsonl> --out <report.json>

For every candidate: is the quoted printed text really on that page (numbers and Hebrew letters), and,
where a candidate is an equation 'expression = number', does the core agree that the printed version
is wrong and the proposed one is right. Verdicts are evidence for the owner, not acceptance.
"""
import argparse
import collections
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_compute as C  # noqa: E402
import atlas_schema as S  # noqa: E402
import atlas_validate as V  # noqa: E402

SUPERSCRIPT = {'²': '^2', '³': '^3', '¹': '^1', '⁴': '^4'}
NUMBER = re.compile(r'\d+(?:\.\d+)?')


def _normalise(expr):
    for a, b in SUPERSCRIPT.items():  # before NFKC, which would turn '²' into a plain '2'
        expr = expr.replace(a, b)
    expr = unicodedata.normalize('NFKC', expr)
    expr = (expr.replace('·', '*').replace('∙', '*').replace('×', '*').replace('⋅', '*')
            .replace('−', '-').replace('–', '-').replace('÷', '/').replace(',', '.'))
    return re.sub(r'\s+', ' ', expr).strip()


def equations(text):
    """Pairs (left expression, printed number) for 'expr = number' parts whose left side is arithmetic."""
    out = []
    parts = [p.strip() for p in _normalise(text).split('=')]
    for left, right in zip(parts, parts[1:]):
        m = re.match(r'^-?\d+(?:\.\d+)?', right)
        if not m:
            continue
        left = re.sub(r'[A-Za-z]{2,}$', '', left).strip()  # trailing unit of a previous step
        if not re.fullmatch(r'[\d.\s+\-*/^()]+', left) or not re.search(r'[+\-*/^]', left.lstrip('-')):
            continue
        out.append((left, m.group(0)))
    return out


def consistent(text):
    """True/False when the text holds checkable arithmetic, None otherwise."""
    pairs = equations(text)
    if not pairs:
        return None
    try:
        return all(C.matches_printed(C.evaluate(left, {}), printed) for left, printed in pairs)
    except C.ComputeError:
        return None


def quote_found(quote, page_text):
    """Numbers of the quote, and its Hebrew letters if any, appear on the page; None if the page has no text."""
    if page_text is None:
        return None
    page_numbers = set(NUMBER.findall(_normalise(page_text)))
    numbers_ok = all(n in page_numbers for n in NUMBER.findall(_normalise(quote)))
    letters = V._skeleton(quote)
    letters_ok = not letters or letters in V._skeleton(page_text)
    return numbers_ok and letters_ok


def check(candidates_path, book_text_path):
    book, _ = S.read_jsonl(book_text_path)
    pages = {r['page']: r['text'] for _, r in book}
    rows, _ = S.read_jsonl(candidates_path)
    out = []
    for line, c in rows:
        printed_ok, proposed_ok = consistent(c['as_printed']), consistent(c['proposed'])
        if printed_ok is False and proposed_ok is True:
            verdict = 'core_confirms'
        elif printed_ok is True and proposed_ok is not None:
            verdict = 'printed_arithmetic_consistent'  # the claim is about inputs or the formula, not the sum
        elif proposed_ok is False:
            verdict = 'proposal_inconsistent'
        else:
            verdict = 'not_arithmetic'
        out.append({'line': line, 'page': c['page'], 'kind': c['kind'], 'confidence': c.get('confidence'),
                    'quote_found': quote_found(c['as_printed'], pages.get(c['page'])),
                    'printed_consistent': printed_ok, 'proposed_consistent': proposed_ok, 'verdict': verdict,
                    'as_printed': c['as_printed'], 'proposed': c['proposed']})
    summary = collections.Counter(r['verdict'] for r in out)
    summary.update(f'quote_{r["quote_found"]}' for r in out)
    return out, dict(summary)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Независимая проверка кандидатов в опечатки.')
    parser.add_argument('--candidates', required=True)
    parser.add_argument('--book-text', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    rows, summary = check(args.candidates, args.book_text)
    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump({'summary': summary, 'rows': rows}, fh, ensure_ascii=False, indent=1)
    sys.stdout.write(json.dumps(summary, ensure_ascii=False) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
