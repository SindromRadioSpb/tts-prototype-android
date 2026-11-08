"""Adopt recordings that already exist on the server under the same content key (shared with 97002).

Same key = same text, voice and profile; Google's MP3 bytes differ per call, and the server copy is referenced by
other manifests, so the server bytes win. Read-only HTTP to /api/audio/<key>; rewrites local files + manifests.
  python -I adopt_server_audio.py --tts .tmp/rc33/tts [--base https://linguistpro.kolosei.com]
"""
import argparse, hashlib, json, subprocess, urllib.request, urllib.error
from pathlib import Path

def sha(b): return hashlib.sha256(b).hexdigest()

def fetch(url, method='GET'):
    req = urllib.request.Request(url, method=method, headers={'User-Agent': 'linguistpro-atlas-audio-adopt/1'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, (r.read() if method == 'GET' else b'')
    except urllib.error.HTTPError as e: return e.code, b''

def duration_ms(path):
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', '--', str(path)], capture_output=True, text=True)
    try: return round(float(p.stdout.strip()) * 1000)
    except ValueError: return None

def main(tts, base):
    cache = tts / 'audio-cache'
    keys = sorted({e['key'] for m in (tts / 'audio').glob('s*.json') for e in json.loads(m.read_text(encoding='utf8'))['items'].values()})
    adopted = {}
    for k in keys:
        status, _ = fetch(f'{base}/api/audio/{k}', 'HEAD')
        if status != 200: continue
        status, body = fetch(f'{base}/api/audio/{k}')
        assert status == 200 and body, k
        local = cache / (k + '.mp3')
        if sha(local.read_bytes()) != sha(body):
            local.write_bytes(body)
            adopted[k] = {'bytes': len(body), 'audio_sha256': sha(body), 'ms': duration_ms(local)}
            assert adopted[k]['ms'], 'undecodable server file ' + k
    changed = 0
    for m in sorted((tts / 'audio').glob('s*.json')):
        doc = json.loads(m.read_text(encoding='utf8'))
        for e in doc['items'].values():
            if e['key'] in adopted: e.update(adopted[e['key']]); changed += 1
        m.write_text(json.dumps(doc, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'keys': len(keys), 'already_on_server_with_other_bytes': len(adopted), 'manifest_entries_updated': changed}))

if __name__ == '__main__':
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--tts', type=Path, required=True); a.add_argument('--base', default='https://linguistpro.kolosei.com')
    x = a.parse_args(); main(x.tts.resolve(), x.base.rstrip('/'))
