"""Offline lossless directory transport. Never installs into the application.

export SOURCE PACKAGE; verify PACKAGE; import PACKAGE NEW_DIRECTORY [--write];
diff BASE CANDIDATE. Import defaults to dry run. Existing destinations are refused.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import tempfile

def inventory(root):
    root = pathlib.Path(root)
    result = {}
    for p in sorted(root.rglob('*')):
        if p.is_symlink() or (hasattr(p, 'is_junction') and p.is_junction()):
            raise ValueError('Links forbidden: ' + str(p))
        if p.is_file():
            b = p.read_bytes()
            result[p.relative_to(root).as_posix()] = {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    if not result:
        raise ValueError('Empty source')
    return result

def verify(package):
    p = pathlib.Path(package)
    expected = json.loads((p / 'inventory.json').read_text(encoding='utf8'))
    if inventory(p / 'payload') != expected:
        raise ValueError('Inventory mismatch (missing, added or changed files)')
    return expected

def transfer(source, destination, export=False):
    source, destination = pathlib.Path(source).resolve(), pathlib.Path(destination).resolve()
    if destination.exists() or source == destination or source in destination.parents:
        raise ValueError('Destination must be new and outside source')
    before = inventory(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = pathlib.Path(tempfile.mkdtemp(prefix='.snapshot-', dir=destination.parent))
    try:
        target = staging / 'payload' if export else staging
        shutil.copytree(source, target, dirs_exist_ok=True)
        if inventory(target) != before or inventory(source) != before:
            raise ValueError('Source changed or copy failed')
        if export:
            (staging / 'inventory.json').write_text(json.dumps(before, ensure_ascii=False, indent=2), encoding='utf8')
        staging.rename(destination)
    except BaseException:
        shutil.rmtree(staging)
        raise
    return before

def difference(base, candidate):
    a, b = inventory(base), inventory(candidate)
    changed = [n for n in sorted(a.keys() | b.keys()) if a.get(n) != b.get(n)]
    # Conservative invalidation: no edited section can inherit an accepted AI status.
    sections = [n for n in changed if '/sections/' in '/' + n and n.endswith('.json')]
    return {'changed_files': changed, 'ai_requires_review': sections,
            'publication_allowed': False, 'policy': 'All AI rows in changed sections require revalidation against current text; original AI evidence is retained.'}

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=['export', 'verify', 'import', 'diff'])
    p.add_argument('source'); p.add_argument('destination', nargs='?'); p.add_argument('--write', action='store_true')
    a = p.parse_args()
    if a.operation == 'export':
        result = transfer(a.source, a.destination, True)
    elif a.operation == 'verify':
        result = verify(a.source)
    elif a.operation == 'diff':
        result = difference(a.source, a.destination)
    else:
        result = verify(a.source)
        if pathlib.Path(a.destination).exists():
            raise ValueError('Existing destination forbidden')
        if a.write:
            transfer(pathlib.Path(a.source) / 'payload', a.destination)
    print(json.dumps({'files': len(result), 'result': result} if a.operation == 'diff' else {'files': len(result), 'operation': a.operation, 'write': a.write}, ensure_ascii=False))
