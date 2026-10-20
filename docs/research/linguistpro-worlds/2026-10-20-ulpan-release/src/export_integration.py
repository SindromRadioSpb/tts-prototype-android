"""Persist the reviewed native integration outside .tmp; no Git writes."""
from pathlib import Path
import difflib
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
TARGET = REPO / '.tmp/ulpan-integration'
OUT = ROOT / 'integration'
BASE = '56c5b4de'
existing = ['server.js','public/js/world-engine.js','public/css/world-skin.css','public/js/world-activity.js','public/js/world-boot.js','public/sw.js','public/index.html','public/library.html','public/mediatheque.html']
added = ['public/js/ulpan-world.js','tests/ulpanWorld.test.cjs']
added += [str(p.relative_to(TARGET)).replace('\\','/') for p in sorted((TARGET / 'public/worlds/ulpan-journey').iterdir()) if p.is_file()]
diff = []
for relative in existing + added:
    source = TARGET / relative
    destination = OUT / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    if source.suffix == '.png': continue
    old = subprocess.run(['git','show',BASE + ':' + relative],cwd=REPO,capture_output=True).stdout.decode('utf-8') if relative in existing else ''
    diff.extend(difflib.unified_diff(old.splitlines(keepends=True),source.read_text(encoding='utf-8').splitlines(keepends=True),fromfile='a/'+relative if relative in existing else '/dev/null',tofile='b/'+relative))
(ROOT / 'integration.patch').write_text(''.join(diff),encoding='utf-8')
base_sha = subprocess.run(['git','rev-parse',BASE],cwd=REPO,check=True,capture_output=True,text=True).stdout.strip()
manifest = {'baseCommit':base_sha,'base':'saved origin/main; live fetch was denied by filesystem policy','productionDeployed':False,'files':{name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in existing+added}}
(ROOT / 'integration-files.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Persisted {len(manifest["files"])} native integration files and review diff')
