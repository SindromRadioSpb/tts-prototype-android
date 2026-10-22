import sys; sys.stdout.reconfigure(encoding="utf-8")
import hashlib, json, re, zipfile
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2])
HE = re.compile('[א-ת]')


def sha(b): return hashlib.sha256(b).hexdigest()


def folder_no(name):
    m = re.match(r'(\d+)', name); return int(m.group(1)) if m else None


texts = []
for folder in sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name != 'AntiGravity'):
    fn = folder_no(folder.name)
    for f in sorted(folder.rglob('*.zip')):
        try: z = zipfile.ZipFile(f)
        except Exception: continue
        n = next((n for n in z.namelist() if n.endswith('library.json')), None)
        if not n: continue
        lib = json.loads(z.read(n))
        for t in lib['texts']:
            rows = t.get('rows') or []
            sm = t.get('source_meta') or {}
            bs = sm.get('book_section') or {}
            c = t.get('corpus') or sm.get('corpus') or {}
            L = t.get('word_gloss_ai_layer') or {}
            lrows = L.get('rows') or [] if isinstance(L, dict) else []
            row_idx = {r.get('order_index') for r in rows}
            # Row coverage: a row is "covered" when the layer has an entry with non-empty glosses for it.
            covered = {lr.get('order_index') for lr in lrows if lr.get('glosses')}
            he_rows = {r.get('order_index') for r in rows if HE.search(r.get('hebrew_plain') or r.get('hebrew_niqqud') or '')}
            orphan = [lr.get('order_index') for lr in lrows if lr.get('order_index') not in row_idx]
            empty_ru = sum(1 for r in rows if not (r.get('russian') or '').strip())
            empty_tr = sum(1 for r in rows if not (r.get('translit') or '').strip())
            body = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()
            texts.append({
                'folder': fn, 'zip': f.name, 'title': t.get('title'), 'text_key': t.get('text_key'), 'text_id': t.get('text_id'),
                'by': str(c.get('byehuda_id')), 'author': c.get('author'), 'era': c.get('era'),
                'app_era': (sm.get('text_learning') or {}).get('app_era'), 'official_period': (sm.get('text_learning') or {}).get('official_period'),
                'rows': len(rows), 'he_rows': len(he_rows), 'rows_sha': sha(body),
                'empty_ru': empty_ru, 'empty_translit': empty_tr,
                'ai': bool(lrows), 'ai_schema': L.get('schema') if isinstance(L, dict) else None,
                'ai_rows_covered': len(covered & he_rows), 'ai_orphans': len(orphan),
                'ai_models': dict(Counter(lr.get('model') for lr in lrows)),
                'ai_glosses': sum(len(lr.get('glosses') or []) for lr in lrows),
                'section': {k: bs.get(k) for k in ('root_work_id', 'section_id', 'order', 'kind', 'char_start', 'char_end_exclusive', 'whole_book_complete', 'source_dump_sha256', 'section_source_sha256')} if bs else None,
                'updated_at': t.get('updated_at'),
            })
OUT.write_text(json.dumps(texts, ensure_ascii=False, indent=1), encoding='utf-8')

print('TOTAL texts', len(texts))
# 1. AI coverage by folder
agg = defaultdict(lambda: Counter())
for t in texts:
    a = agg[t['folder']]; a['texts'] += 1; a['rows'] += t['rows']; a['he_rows'] += t['he_rows']
    a['ai_texts'] += t['ai']; a['ai_cov'] += t['ai_rows_covered']; a['orph'] += t['ai_orphans']; a['empty_ru'] += t['empty_ru']; a['glosses'] += t['ai_glosses']
for k in sorted(agg):
    a = agg[k]; print('folder %-3s texts=%4d rows=%6d heRows=%6d aiTexts=%4d aiRowCov=%6d (%.1f%%) glosses=%7d orphans=%d emptyRU=%d' % (k, a['texts'], a['rows'], a['he_rows'], a['ai_texts'], a['ai_cov'], 100 * a['ai_cov'] / max(1, a['he_rows']), a['glosses'], a['orph'], a['empty_ru']))
print('AI models:', Counter(m for t in texts for m in t['ai_models']))

# 2. Same BY id across folders (single-text works)
byid = defaultdict(list)
for t in texts:
    if not t['section']: byid[t['by']].append(t)
pub = {t['by'] for t in texts if t['folder'] in (1, 2, 3) and not t['section']}
dup_unpub = {k: v for k, v in byid.items() if len(v) > 1}
print('\nsingle works total', len(byid), 'published(1-3)', len(pub))
cnt = Counter()
for k, v in dup_unpub.items():
    folders = tuple(sorted(x['folder'] for x in v)); same = len({x['rows_sha'] for x in v}) == 1
    cnt[(folders, same)] += 1
for (fs, same), n in sorted(cnt.items(), key=lambda x: -x[1])[:25]: print('  dup in folders', fs, 'identical_rows' if same else 'DIFFERENT', n)
unpub_new = [k for k, v in byid.items() if not any(x['folder'] in (1, 2, 3) for x in v)]
print('unpublished single works (not in 1-3):', len(unpub_new))
eras = Counter((byid[k][0]['era'], byid[k][0]['app_era'], byid[k][0]['official_period']) for k in unpub_new)
print(' era/app_era/official_period of unpublished:', eras.most_common(12))

# 3. Sectioned works: order, gaps, overlaps, duplicates
roots = defaultdict(list)
for t in texts:
    if t['section']: roots[t['section']['root_work_id']].append(t)
print('\nSECTIONED roots', len(roots))
for r, parts in roots.items():
    secs = defaultdict(list)
    for p in parts: secs[p['section']['section_id']].append(p)
    dups = {s: len(v) for s, v in secs.items() if len(v) > 1}
    dup_diff = {s: len({x['rows_sha'] for x in v}) for s, v in secs.items() if len(v) > 1}
    chosen = sorted((v[0] for v in secs.values()), key=lambda p: (p['section']['char_start'] if p['section']['char_start'] is not None else 1e12, p['section']['order'] or 0))
    gaps = []; overlaps = []
    for a, b in zip(chosen, chosen[1:]):
        ae, bs_ = a['section']['char_end_exclusive'], b['section']['char_start']
        if ae is None or bs_ is None: continue
        if bs_ > ae: gaps.append((a['section']['section_id'], b['section']['section_id'], bs_ - ae))
        if bs_ < ae: overlaps.append((a['section']['section_id'], b['section']['section_id'], ae - bs_))
    srcs = {p['section']['source_dump_sha256'] for p in parts}
    complete = Counter(p['section']['whole_book_complete'] for p in parts)
    kinds = Counter(p['section']['kind'] for p in parts)
    print('root %s | %s | folders %s | parts %d unique sections %d | rows %d | ai %d/%d | dupSections %d (rowsDiffer %d) | gaps %d overlaps %d | sources %d | whole_book %s | kinds %s' % (
        r, (parts[0]['title'] or '')[:40], sorted({p['folder'] for p in parts}), len(parts), len(secs), sum(p['rows'] for p in chosen),
        sum(p['ai'] for p in parts), len(parts), len(dups), sum(1 for v in dup_diff.values() if v > 1), len(gaps), len(overlaps), len(srcs), dict(complete), dict(kinds.most_common(4))))
    for g in gaps[:5]: print('    gap', g)
    for o in overlaps[:5]: print('    overlap', o)
