"""Read-only inventory and reproducible page rendering for the independent audit."""
import hashlib
import json
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'Архив/atlas97001-audit-2026-11-06/atlas97001-source-audit'
OUT = ROOT / '.tmp/atlas97001-source-review'
OUT.mkdir(parents=True, exist_ok=True)

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))

inventory = []
for path in sorted(SOURCE.rglob('*')):
    if not path.is_file():
        continue
    if path.suffix == '.json':
        load(path)
    elif path.suffix in ('.html', '.txt'):
        path.read_text(encoding='utf-8')
    inventory.append({'file': path.relative_to(SOURCE).as_posix(), 'bytes': path.stat().st_size,
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
pages = {p['page']: p for f in sorted((ROOT/'data/atlas/a97001/sections').glob('*.json'))
         for p in load(f)['pages']}
snapshot = load(SOURCE/'publication_snapshot.json')
differences = [p['page'] for p in snapshot if {k:v for k,v in p.items() if k != 'section_id'} != pages[p['page']]]
document = fitz.open(SOURCE/'original97001.pdf')
assert len(document) == 203
observations = load(SOURCE/'all_observations.json')
assert len(observations) == 346
result = {'baseline_commit': 'a163223150c7d9bdb943b461c92b68812512e04a',
          'archive_sha256': '911ea445d3957752f8af5c59a6a28d722883c797a13efb42a2100c64836d5e6c',
          'files': inventory, 'pages': len(document), 'observations': len(observations),
          'local_runtime_vs_audit_snapshot_different_pages': differences,
          'note': 'Parsing/inventory is not visual or semantic acceptance.'}
(Path(__file__).parent/'input-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k != 'files'}))
