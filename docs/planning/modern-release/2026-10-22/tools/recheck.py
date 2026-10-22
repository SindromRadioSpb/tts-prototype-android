import sys; sys.stdout.reconfigure(encoding='utf-8')
import json
from collections import defaultdict, Counter
texts = json.load(open(sys.argv[1], encoding='utf-8'))
f10 = [t for t in texts if t['folder'] in (9, 10)]
# 1) sectionless texts in folders 9-10
print('SECTIONLESS in 9/10:')
for t in f10:
    if not t['section']:
        print('  ', t['folder'], t['by'], t['zip'], '|', t['text_id'], '|', (t['title'] or '')[:50], '| rows', t['rows'])
# 2) per work id: archives, texts, rows
for wid in ('28023', '28024', '64596'):
    ts = [t for t in texts if t['by'] == wid]
    print('\nWORK', wid, 'archives', len({t['zip'] for t in ts}), 'texts', len(ts), 'rows', sum(t['rows'] for t in ts),
          'distinct text_id', len({t['text_id'] for t in ts}), 'distinct rows_sha', len({t['rows_sha'] for t in ts}))
    for z, n in Counter(t['zip'] for t in ts).items(): print('   ', n, z)
# 3) 28024 gaps/overlaps within the same source snapshot only
ts = [t for t in texts if t['by'] == '28024' and t['section']]
by_src = defaultdict(list)
for t in ts: by_src[t['section']['source_dump_sha256']].append(t)
for src, parts in by_src.items():
    parts.sort(key=lambda p: (p['section']['char_start'] or 0))
    ov = [(a['section']['section_id'], b['section']['section_id'], a['section']['char_end_exclusive'] - b['section']['char_start'])
          for a, b in zip(parts, parts[1:]) if b['section']['char_start'] is not None and a['section']['char_end_exclusive'] is not None and b['section']['char_start'] < a['section']['char_end_exclusive']]
    print('\n28024 snapshot', (src or '')[:12], 'parts', len(parts), 'rows', sum(p['rows'] for p in parts), 'overlaps', ov[:6])
