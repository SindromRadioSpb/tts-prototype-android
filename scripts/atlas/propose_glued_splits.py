"""Propose splits for Russian words the supplier glued together («жёсткостиверхнейинижнейпары»).

    python scripts/atlas/propose_glued_splits.py <dir with sections/*.json> <out.tsv>

A word unknown to the Russian dictionary (pymorphy3) that splits into known words is a candidate. The output is
a REVIEW LIST, not a fix: real long words the dictionary lacks («износостойкость», «нахлёсточное», «квалитет»)
and wrong cuts («егора счёта») are rejected by eye; accepted entries go to corrections/<atlas>.json → glued,
which reader_corrections.py applies on every build. Columns: word, proposed split, count.
"""
import collections
import functools
import glob
import json
import os
import re
import sys

import pymorphy3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reader_corrections as RC  # noqa: E402

m = pymorphy3.MorphAnalyzer()
SINGLE = set('авикосуя')


@functools.lru_cache(None)
def known(w):
    w = w.lower().replace('ё', 'е')
    return w in SINGLE if len(w) == 1 else m.word_is_known(w)


@functools.lru_cache(None)
def split(w):
    """Fewest known parts, then the most even cut; None when the word does not split into known words."""
    if known(w):
        return [w]
    best = None
    for i in range(1, len(w)):
        a = w[:i]
        if not known(a) or (len(a) == 1 and a.lower() not in SINGLE):
            continue
        rest = split(w[i:])
        if rest and len(rest) <= 5:
            cand = [a] + rest
            if best is None or len(cand) < len(best) or (len(cand) == len(best) and min(map(len, cand)) > min(map(len, best))):
                best = cand
    return best


def main(argv=None):
    argv = argv or sys.argv[1:]
    src, out = argv[0], argv[1]
    files = sorted(glob.glob(os.path.join(src, 'sections', '*.json'))) or sorted(glob.glob(os.path.join(src, 'sec-*.json')))
    counts = collections.Counter()
    for f in files:
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        for page in d.get('pages', []):
            for obj, key in RC.russian_fields(page):
                t = obj.get(key)
                if isinstance(t, str):
                    counts.update(re.findall(r'[А-Яа-яЁё]{5,}', t))
    props = [(w, split(w), n) for w, n in counts.items() if not known(w)]
    props = [(w, ' '.join(s), n) for w, s, n in props if s and len(s) >= 2]
    with open(out, 'w', encoding='utf-8') as fh:
        for w, s, n in sorted(props, key=lambda x: -len(x[0])):
            fh.write(f'{w}\t{s}\t{n}\n')
    print(f'{len(props)} предложений из {len(counts)} слов → {out}')
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
