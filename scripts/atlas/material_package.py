"""Offline Atlas material verifier/restorer. Python 3.12+, standard library only.

verify ARCHIVE_OR_DIRECTORY
restore ARCHIVE NEW_DIRECTORY [--write]  (defaults to dry-run)
repack DIRECTORY NEW_ARCHIVE
Never registers a corpus or writes to an existing directory.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

MAX_BYTES = 2 * 1024**3

def safe(name):
    if (not isinstance(name, str) or not name or '\\' in name or ':' in name
            or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/'))
            or any(p.endswith((' ', '.')) for p in name.split('/'))):
        raise ValueError('Unsafe package path')
    reserved = {'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]}
    if any(p.split('.')[0].casefold() in reserved for p in name.split('/')) or any(ord(c)<32 for c in name):
        raise ValueError('Unsafe package path')
    return name

def digest(stream):
    h = hashlib.sha256(); size = 0
    while chunk := stream.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_BYTES: raise ValueError('Oversized file')
        h.update(chunk)
    return {'sha256': h.hexdigest(), 'bytes': size}

def expected(manifest):
    if manifest.get('schema') != 'linguistpro.atlas-material.1': raise ValueError('Unknown format')
    material, support = manifest['files'], manifest.get('support_files', {})
    if not isinstance(material, dict) or not material: raise ValueError('Empty material')
    if set(material) & set(support) or 'manifest.json' in material or 'manifest.json' in support:
        raise ValueError('Duplicate reserved path')
    files = {**material, **support}
    folded = set()
    for name, entry in files.items():
        safe(name)
        if name.casefold() in folded: raise ValueError('Case collision')
        folded.add(name.casefold())
        if type(entry.get('bytes')) is not int or entry['bytes'] < 0: raise ValueError('Invalid size')
    if sum(e['bytes'] for e in files.values()) > MAX_BYTES: raise ValueError('Oversized package')
    return files

def verify(source):
    source = Path(source)
    if source.is_dir():
        if source.is_symlink() or source.is_junction(): raise ValueError('Links forbidden')
        actual = {}
        for p in source.rglob('*'):
            if p.is_symlink() or p.is_junction(): raise ValueError('Links forbidden')
            if p.is_file():
                n = p.relative_to(source).as_posix(); safe(n)
                with p.open('rb') as f: actual[n] = digest(f)
        manifest = json.loads((source / 'manifest.json').read_text(encoding='utf8'))
        actual.pop('manifest.json', None)
    else:
        with zipfile.ZipFile(source) as archive:
            if len(archive.infolist()) > 100000 or sum(i.file_size for i in archive.infolist()) > MAX_BYTES:
                raise ValueError('Oversized ZIP')
            if archive.getinfo('manifest.json').file_size > 16*1024**2: raise ValueError('Oversized manifest')
            names = set(); actual = {}
            for info in archive.infolist():
                if info.is_dir():
                    safe(info.filename.rstrip('/')); continue
                safe(info.filename)
                if stat.S_ISLNK(info.external_attr >> 16): raise ValueError('Links forbidden')
                if info.filename in names: raise ValueError('Duplicate ZIP path')
                names.add(info.filename)
            manifest = json.loads(archive.read('manifest.json'))
            files = expected(manifest)
            if names != set(files) | {'manifest.json'}: raise ValueError('ZIP file coverage mismatch')
            for n in files:
                with archive.open(n) as f: actual[n] = digest(f)
    if actual != expected(manifest): raise ValueError('File checksum/size mismatch')
    return manifest

def restore(archive, destination, write=False):
    manifest = verify(archive)
    destination = Path(destination).resolve()
    if destination.exists(): raise ValueError('Destination already exists')
    if not write: return manifest
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.atlas-restore-', dir=destination.parent))
    try:
        with zipfile.ZipFile(archive) as z:
            for name in [*expected(manifest), 'manifest.json']:
                target = staging / name; target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(name) as src, target.open('xb') as dst: shutil.copyfileobj(src,dst)
        verify(staging)
        staging.rename(destination)
    except BaseException:
        shutil.rmtree(staging)
        raise
    return manifest

def repack(source, destination):
    manifest = verify(source)
    destination = Path(destination).resolve(); source = Path(source).resolve()
    if destination.exists() or source in destination.parents: raise ValueError('New archive must be outside source')
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED) as z:
        for n in [*expected(manifest), 'manifest.json']: z.write(source / n, n)
    try:
        if verify(destination) != manifest: raise ValueError('Roundtrip manifest changed')
    except BaseException:
        destination.unlink(); raise
    return manifest

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=['verify','restore','repack'])
    p.add_argument('source'); p.add_argument('destination', nargs='?'); p.add_argument('--write', action='store_true')
    args = p.parse_args()
    if args.operation != 'verify' and not args.destination: p.error('destination required')
    result = (verify(args.source) if args.operation == 'verify' else
              restore(args.source,args.destination,args.write) if args.operation == 'restore' else
              repack(args.source,args.destination))
    print(json.dumps({'ok':True,'atlas_id':result['atlas_id'],'files':len(result['files']),
                      'revision':result['revision'],'operation':args.operation}))
