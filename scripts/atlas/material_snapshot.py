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
from material_validate import validate

def validate_material(source):
    result = validate(source)
    if not result['ok']:
        raise ValueError(json.dumps(result, ensure_ascii=False))
    return result

def validate_import(source):
    source = pathlib.Path(source)
    validate_material(source)
    if (source / 'DRAFT.json').exists():
        draft = json.loads((source / 'DRAFT.json').read_text(encoding='utf8'))
        if draft.get('publication_allowed') is not False: raise ValueError('Draft publication forbidden')
        files = inventory(source); files.pop('DRAFT.json')
        digest = hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
        if digest != draft.get('payload_sha256'): raise ValueError('Draft changed after preparation')
        for name in draft['ai_requires_review']:
            if (source / 'context' / name).exists(): raise ValueError('Stale active AI: ' + name)
        return
    # An ordinary snapshot must remain the exact published edition. Edited input
    # must go through prepare so that its AI status cannot silently survive.
    for folder in ('edition','context'):
        manifest = json.loads((source / folder / 'manifest.json').read_text(encoding='utf8'))
        for name,entry in manifest['files'].items():
            rel = pathlib.PurePosixPath(name)
            if rel.is_absolute() or '..' in rel.parts or '\\' in name: raise ValueError('Unsafe manifest path')
            data = (source / folder / name).read_bytes()
            if hashlib.sha256(data).hexdigest() != entry['sha256'] or len(data) != entry['bytes']:
                raise ValueError('Edited material requires prepare: ' + name)
    context = json.loads((source / 'context/manifest.json').read_text(encoding='utf8'))
    if context['edition_manifest_sha256'] != hashlib.sha256((source / 'edition/manifest.json').read_bytes()).hexdigest():
        raise ValueError('Context belongs to a different edition')

def prepare(source, baseline, destination, write=False):
    """Create an offline draft. Stale AI is evidence only, never active context."""
    source, baseline, destination = map(pathlib.Path, (source, baseline, destination))
    if destination.exists(): raise ValueError('Existing destination forbidden')
    validation = validate_material(source)
    diff = difference(baseline, source)
    stale = [pathlib.Path(n).name for n in diff['ai_requires_review']]
    report = {'schema':'linguistpro.atlas-offline-draft.1','publication_allowed':False,
              'validation':validation,'diff':diff,'ai_requires_review':stale,
              'derived_data_requires_rebuild':bool(diff['changed_files'])}
    if not write: return report
    # Work outside the final namespace until every invariant passes.
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary = pathlib.Path(tempfile.mkdtemp(prefix='.draft-',dir=destination.parent))
    try:
        draft = temporary / 'draft'
        transfer(source,draft)
        for name in stale:
            active = draft / 'context' / name
            if active.exists():
                evidence = draft / 'evidence' / 'ai-requires-review' / name
                evidence.parent.mkdir(parents=True,exist_ok=True)
                active.rename(evidence)
        if stale:
            manifest = draft / 'context/manifest.json'
            if manifest.exists():
                evidence = draft / 'evidence/context-manifest-original.json'
                evidence.parent.mkdir(parents=True,exist_ok=True)
                manifest.rename(evidence)
            # Fail closed: no valid context manifest until explicit revalidation.
        report['payload_sha256'] = hashlib.sha256(json.dumps(inventory(draft),sort_keys=True).encode()).hexdigest()
        report['edition_id'] = 'offline-a97001-' + report['payload_sha256']
        (draft / 'DRAFT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        validate_material(draft)
        draft.rename(destination)
    finally:
        shutil.rmtree(temporary)
    return report

def inventory(root):
    root = pathlib.Path(root)
    if root.is_symlink() or (hasattr(root,'is_junction') and root.is_junction()):
        raise ValueError('Root link forbidden')
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
    p.add_argument('operation', choices=['export', 'verify', 'import', 'diff', 'prepare'])
    p.add_argument('source'); p.add_argument('destination', nargs='?'); p.add_argument('--write', action='store_true')
    p.add_argument('--baseline')
    a = p.parse_args()
    if a.operation == 'prepare':
        if not a.baseline: p.error('prepare requires --baseline')
        result = prepare(a.source,a.baseline,a.destination,a.write)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        raise SystemExit(0)
    if a.operation == 'export':
        result = transfer(a.source, a.destination, True)
    elif a.operation == 'verify':
        result = verify(a.source)
    elif a.operation == 'diff':
        result = difference(a.source, a.destination)
    else:
        result = verify(a.source)
        if (pathlib.Path(a.source) / 'payload/edition/index.json').exists():
            validate_import(pathlib.Path(a.source) / 'payload')
        if pathlib.Path(a.destination).exists():
            raise ValueError('Existing destination forbidden')
        if a.write:
            transfer(pathlib.Path(a.source) / 'payload', a.destination)
    print(json.dumps({'files': len(result), 'result': result} if a.operation == 'diff' else {'files': len(result), 'operation': a.operation, 'write': a.write}, ensure_ascii=False))
