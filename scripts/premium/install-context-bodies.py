"""Install a sealed allowlist additively on the production volume; never replace an existing body."""
import argparse, hashlib, json, os, re, shutil, tempfile
from pathlib import Path

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--stage',type=Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    root=a.root.resolve();stage=a.stage.resolve()
    uploads=json.loads((stage/'upload-allowlist.json').read_bytes());retained=json.loads((stage/'rollback-allowlist.json').read_bytes())
    assert len({x['file'] for x in uploads})==len(uploads)
    total=0
    for item in uploads:
        assert re.fullmatch(r'works/\d{1,8}-[a-f0-9]{32}\.json',item['file'])
        src=stage/item['file'];assert digest(src)==item['sha256'];total+=src.stat().st_size
        assert item['sha256'].startswith(Path(item['file']).stem.split('-')[-1])
        target=root/item['file'];assert target.parent.resolve()==root/'works'
        if target.exists(): assert digest(target)==item['sha256'],'Immutable namespace collision'
    for item in retained: assert digest(root/item['file'])==item['sha256'],'Baseline changed'
    free=shutil.disk_usage(root).free;assert free>=total+4*1024**3,'Capacity reserve unavailable'
    receipt={'files':len(uploads),'volume_bytes':total,'available_bytes_before':free,'uploaded':0,'identical':0,'baseline_preserved':len(retained),'mode':'dry-run'}
    if a.apply:
        info=(root/retained[0]['file']).stat()
        for item in uploads:
            src=stage/item['file'];dest=root/item['file']
            if dest.exists():receipt['identical']+=1;continue
            fd,tmp=tempfile.mkstemp(prefix='.context-append-',dir=dest.parent)
            try:
                with os.fdopen(fd,'wb') as f:f.write(src.read_bytes());f.flush();os.fsync(f.fileno())
                os.chown(tmp,info.st_uid,info.st_gid);os.chmod(tmp,0o644)
                os.link(tmp,dest)  # Atomic creation; cannot overwrite any existing path.
            finally:Path(tmp).unlink(missing_ok=True)
            assert digest(dest)==item['sha256'];receipt['uploaded']+=1
        for item in retained:assert digest(root/item['file'])==item['sha256']
        receipt['mode']='uploaded-and-verified';receipt['available_bytes_after']=shutil.disk_usage(root).free
    print(json.dumps(receipt))

if __name__=='__main__':main()
