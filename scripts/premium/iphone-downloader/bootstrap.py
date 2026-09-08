# Build template. Only package coordinates below are substituted by the builder.
# Executed by a-Shell mini's Python from a fixed application-owned deep link.
import base64, hashlib, json, os, pathlib, re, runpy, sys, urllib.request, uuid
q = sys.argv[1] if len(sys.argv) == 2 else ''
if len(q) > 2048 or not re.fullmatch('[A-Za-z0-9_-]+', q):
    raise RuntimeError('REQUEST_INVALID')
q = json.loads(base64.urlsafe_b64decode(q + '=' * (-len(q) % 4)))
if not isinstance(q, dict) or not re.fullmatch('[a-f0-9]{32}', str(q.get('job', ''))) or not re.fullmatch('[A-Za-z0-9_-]{11}', str(q.get('source', ''))):
    raise RuntimeError('REQUEST_INVALID')
try:
    p = pathlib.Path.home()
    d = p if p.name == 'Documents' else p / 'Documents'
    if not d.is_dir():
        raise RuntimeError('IPHONE_DOCUMENTS_UNAVAILABLE')
    r = d / 'LinguistPro' / '.runtime'
    if not r.resolve().is_relative_to(d.resolve()):
        raise RuntimeError('RUNTIME_PATH_INVALID')
    r.mkdir(parents=True, exist_ok=True)
    f = r / 'iphone-downloader-__SHORT_HASH__.pyz'
    if f.is_symlink() or not f.resolve().is_relative_to(r.resolve()):
        raise RuntimeError('RUNTIME_PATH_INVALID')
    if not f.exists():
        with urllib.request.urlopen('https://linguistpro.kolosei.com/downloads/iphone-downloader-__SHORT_HASH__.pyz', timeout=30) as response:
            b = response.read(1048577)
        if hashlib.sha256(b).hexdigest() != '__PACKAGE_HASH__':
            raise RuntimeError('PACKAGE_HASH_MISMATCH')
        t = r / ('.stage-' + uuid.uuid4().hex)
        t.write_bytes(b)
        t.replace(f)
    if f.stat().st_size > 1048576 or hashlib.sha256(f.read_bytes()).hexdigest() != '__PACKAGE_HASH__':
        raise RuntimeError('PACKAGE_HASH_MISMATCH')
    runpy.run_path(str(f), run_name='__main__')
except Exception as e:
    c = str(e) if str(e) in ['PACKAGE_HASH_MISMATCH', 'IPHONE_DOCUMENTS_UNAVAILABLE', 'RUNTIME_PATH_INVALID'] else 'BOOTSTRAP_FAILED'
    v = dict(v=1, job=q['job'], source=q['source'], state='failed', error=c)
    b = base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
    print('LinguistPro: ' + c)
    os.system('open googlechromes://linguistpro.kolosei.com/download-media.html#result=' + b)
