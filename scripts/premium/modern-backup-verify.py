"""Modern release F1: verify a backup copy of the owner's library folders against the registry.

Every archive the registry recorded must exist in the backup with the same sha256. Files present
in the backup but unknown to the registry are listed, never ignored. Writes backup-manifest.json
into the backup root (and to --out when given). Read-only for the source and the registry.
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def verify(registry, backup_root):
    expected = {a['path'].replace('\\', '/'): a for a in registry['archives']}
    seen, files, problems = set(), [], []
    for f in sorted(p for p in Path(backup_root).rglob('*') if p.is_file() and p.name != 'backup-manifest.json'):
        rel = f.relative_to(backup_root).as_posix()
        digest = sha_file(f)
        rec = {'path': rel, 'bytes': f.stat().st_size, 'sha256': digest}
        if rel in expected:
            seen.add(rel)
            rec['registry_role'] = expected[rel]['role']
            if expected[rel]['sha256'] != digest:
                problems.append({'path': rel, 'problem': 'sha256 differs from registry'})
        else:
            rec['registry_role'] = None
            problems.append({'path': rel, 'problem': 'not in registry'})
        files.append(rec)
    for rel in sorted(set(expected) - seen):
        problems.append({'path': rel, 'problem': 'missing from backup'})
    return files, problems


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--registry', type=Path, required=True)
    p.add_argument('--backup-root', type=Path, required=True, help='backup copy of the library root')
    p.add_argument('--out', type=Path)
    args = p.parse_args(argv)
    registry = json.loads(args.registry.read_text(encoding='utf-8'))
    files, problems = verify(registry, args.backup_root)
    manifest = {'schema': 'modern-release-backup-v1', 'verified_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'backup_root': str(args.backup_root), 'registry_schema': registry.get('schema'),
                'files': len(files), 'bytes': sum(f['bytes'] for f in files),
                'registry_archives': len(registry['archives']), 'problems': problems, 'entries': files}
    text = json.dumps(manifest, ensure_ascii=False, indent=1)
    (args.backup_root / 'backup-manifest.json').write_text(text, encoding='utf-8', newline='\n')
    if args.out:
        args.out.write_text(text, encoding='utf-8', newline='\n')
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps({k: manifest[k] for k in ('files', 'bytes', 'registry_archives')} | {'problems': problems[:20], 'problem_count': len(problems)}, ensure_ascii=False, indent=1))
    return 1 if any(x['problem'] != 'not in registry' for x in problems) else 0


if __name__ == '__main__':
    sys.exit(main())
