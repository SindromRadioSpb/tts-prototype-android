"""Build the self-contained archive for the content supplier (dots).

    python scripts/atlas/build_dots_bundle.py --out <file.zip>

The archive is reproducible: sorted entries and a fixed timestamp, so the same inputs give
the same bytes (and the same SHA-256).
"""
import argparse
import hashlib
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PILOT = os.path.join(REPO, 'atlas', 'a97002', 'pilot')
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def _pages_sha(source_dir):
    with open(os.path.join(source_dir, 'pages.jsonl'), 'rb') as fh:
        return hashlib.sha256(fh.read().replace(b'\r\n', b'\n')).hexdigest()


def _text(path):
    with open(path, 'rb') as fh:
        return fh.read().replace(b'\r\n', b'\n')


def _entries():
    source = os.path.join(PILOT, 'source-pack')
    with open(os.path.join(HERE, 'TASK.pilot.ru.md'), encoding='utf-8') as fh:
        task = fh.read().replace('{SOURCE_PACK_SHA256}', _pages_sha(source)).replace('\r\n', '\n').encode('utf-8')
    entries = {
        'README.ru.md': _text(os.path.join(HERE, 'README.dots.ru.md')),
        'TASK.ru.md': task,
        'tools/atlas_compute.py': _text(os.path.join(HERE, 'atlas_compute.py')),
        'tools/atlas_schema.py': _text(os.path.join(HERE, 'atlas_schema.py')),
        'tools/atlas_validate.py': _text(os.path.join(HERE, 'atlas_validate.py')),
        'schemas/source-pack.schema.json': _text(os.path.join(HERE, 'schemas', 'source-pack.schema.json')),
        'schemas/content-pack.schema.json': _text(os.path.join(HERE, 'schemas', 'content-pack.schema.json')),
        'reference/reference-content.jsonl': _text(os.path.join(PILOT, 'reference', 'reference-content.jsonl')),
        'reference/README.md': _text(os.path.join(PILOT, 'reference', 'README.md')),
    }
    for root, _, files in os.walk(source):
        for name in files:
            path = os.path.join(root, name)
            rel = 'source-pack/' + os.path.relpath(path, source).replace(os.sep, '/')
            if name.endswith('.png'):
                with open(path, 'rb') as fh:
                    entries[rel] = fh.read()
            else:
                entries[rel] = _text(path)
    return entries


def build_bundle(out_zip):
    entries = _entries()
    os.makedirs(os.path.dirname(os.path.abspath(out_zip)), exist_ok=True)
    with zipfile.ZipFile(out_zip, 'w') as zf:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_STORED if name.endswith('.png') else zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, entries[name])
    return sorted(entries)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Собрать архив для поставщика содержимого.')
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    names = build_bundle(args.out)
    with open(args.out, 'rb') as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    sys.stdout.write(f'{args.out}\nфайлов: {len(names)}, байт: {os.path.getsize(args.out)}, sha256: {digest}\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
