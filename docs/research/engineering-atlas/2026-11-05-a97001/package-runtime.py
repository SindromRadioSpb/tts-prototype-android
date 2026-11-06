"""Pack the reviewed runtime and preserve editable source/content in the local archive."""
import hashlib,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
data=ROOT/'data/atlas/a97001';archive=ROOT/'Архив/atlas/a97001';archive.mkdir(parents=True,exist_ok=True)
allowed=['index.json','title.png','sections','assets','train','search.json','search-details.json','search-phrases.json','search-previews.json']
files=sorted(p for name in allowed for p in ([data/name] if (data/name).is_file() else (data/name).rglob('*')) if p.is_file())
manifest={p.relative_to(data).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
manifest_path=archive/'runtime-sha256.json';manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(archive/'a97001-runtime-v1.tar.gz','w:gz') as tar:
 for p in files:tar.add(p,arcname='a97001/'+p.relative_to(data).as_posix(),recursive=False)
with tarfile.open(archive/'a97001-editorial-v1.tar.gz','w:gz') as tar:
 for name in ['content','supplier','review']:tar.add(data/name,arcname=name)
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files),'archive':str(archive),'runtime_sha256':hashlib.sha256((archive/'a97001-runtime-v1.tar.gz').read_bytes()).hexdigest()},indent=2))
