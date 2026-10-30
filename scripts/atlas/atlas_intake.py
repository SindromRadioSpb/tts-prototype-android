"""Unattended intake of the supplier's section packs.

    python scripts/atlas/atlas_intake.py --inbox <exchange folder> --hours 8

Every new a97002-content-<sid>-v<N>.jsonl in the exchange folder is copied (as delivered) to
docs/research/engineering-atlas/sections/, validated against its section source pack and the term core,
and built into the reader data. It stops — so a person looks — on the first rejected pack, when all
sections are in, or after the time limit. One line per event goes to stdout and intake-log.jsonl.
"""
import argparse
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_book as K  # noqa: E402
import atlas_validate as V  # noqa: E402
import build_reader_data as R  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SECTIONS_DIR = os.path.join(REPO, 'docs', 'research', 'engineering-atlas', 'sections')
TERMS = os.path.join(REPO, 'docs', 'research', 'engineering-atlas', '2026-10-31-dots-terms-errata', 'a97002-terms-v1.jsonl')
NAME = re.compile(r'^a97002-content-(s\d{2}-[a-z0-9-]+)-v(\d+)\.jsonl$')


def log(event):
    event['at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    line = json.dumps(event, ensure_ascii=False)
    with open(os.path.join(SECTIONS_DIR, 'intake-log.jsonl'), 'a', encoding='utf-8') as fh:
        fh.write(line + '\n')
    sys.stdout.write(line + '\n')
    sys.stdout.flush()


def intake_once(inbox, book_root, out_root, sections):
    """Process new files. Returns (processed ids, rejected id or None)."""
    done = []
    for name in sorted(os.listdir(inbox)):
        m = NAME.match(name)
        if not m or os.path.exists(os.path.join(SECTIONS_DIR, name)):
            continue
        sid = m.group(1)
        if sid not in sections:
            log({'event': 'unknown_section', 'file': name})
            continue
        time.sleep(5)  # let the sync client finish writing
        target = os.path.join(SECTIONS_DIR, name)
        shutil.copyfile(os.path.join(inbox, name), target)
        report = V.validate(V.load_source_pack(os.path.join(book_root, sid)), target, terms_path=TERMS)
        if not report['ok']:
            log({'event': 'rejected', 'section': sid, 'file': name, 'errors': len(report['errors']),
                 'first': report['errors'][:3]})
            return done, sid
        R.build_section(sections[sid], os.path.join(book_root, sid), target, out_root, TERMS)
        log({'event': 'accepted', 'section': sid, 'file': name, 'warnings': len(report['warnings']),
             'findings': {c: sum(f['code'] == c for f in report['findings']) for c in ('F_CORE_VERIFIED', 'F_CORE_MISMATCH', 'F_CORE_UNANCHORED')}})
        done.append(sid)
    return done, None


def main(argv=None):
    parser = argparse.ArgumentParser(description='Автоматический приём разделов от поставщика.')
    parser.add_argument('--inbox', required=True)
    parser.add_argument('--book-root', default=os.path.join(REPO, '.tmp', 'atlas-book'))
    parser.add_argument('--out', default=os.path.join(REPO, 'data', 'atlas', 'a97002'))
    parser.add_argument('--hours', type=float, default=8)
    parser.add_argument('--poll', type=int, default=60)
    args = parser.parse_args(argv)
    data = K.load_sections()
    sections = {s['id']: s for s in data['sections']}
    deadline = time.time() + args.hours * 3600
    while time.time() < deadline:
        _, rejected = intake_once(args.inbox, args.book_root, args.out, sections)
        delivered = {NAME.match(n).group(1) for n in os.listdir(SECTIONS_DIR) if NAME.match(n)}
        built = {}
        for sid in delivered:
            path = os.path.join(args.out, 'sections', sid + '.json')
            if os.path.exists(path):
                built[sid] = {'translated': True}
        with open(os.path.join(args.out, 'index.json'), 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(R.build_index(data['sections'], built, data['parts']), fh, ensure_ascii=False, indent=1)
        if rejected:
            log({'event': 'stopped', 'reason': 'rejected', 'section': rejected})
            return 2
        if len(delivered) >= len(sections) - 1:  # s00-front (title and contents) needs no translation
            log({'event': 'stopped', 'reason': 'all_sections_in', 'count': len(delivered)})
            return 0
        time.sleep(args.poll)
    log({'event': 'stopped', 'reason': 'time_limit'})
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
