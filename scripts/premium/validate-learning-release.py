"""Independent archive-to-public row comparison, link/hash/count gates, and rollback archive."""
import argparse,hashlib,json,re,zipfile
from pathlib import Path

def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-root',type=Path,required=True);p.add_argument('--dir',type=Path,required=True);a=p.parse_args();out=a.dir/'candidate';base=a.dir/'baseline'
 root=load(out/'corpus-catalog-v8.json');manifest=load(out/root['release_manifest']);assert sha((out/root['release_manifest']).read_bytes())==root['release_manifest_sha256']
 mapped={w['work_id']:w for w in manifest['works']};original=load(a.dir/'input-inventory.json');rows=0;fields=['hebrew_plain','hebrew_niqqud','russian','translit','translit_ru']
 for archive in original['archives']:
  if archive['role']!='learning':continue
  with zipfile.ZipFile(a.input_root/archive['archive'])as z:
   for t in json.loads(z.read('library/library.json'))['texts']:
    id=t['corpus']['byehuda_id'];w=mapped[id];raw=(out/w['body']).read_bytes();assert sha(raw)==w['body_sha256'];body=json.loads(raw);texts=body['library']['texts'];assert len(texts)==1
    got=texts[0];assert got['corpus']['byehuda_id']==id and got['text_key']==w['edition_text_key'];assert 'canon_version'not in body['library'];assert len(got['rows'])==len(t['rows'])==w['rows'];rows+=len(t['rows'])
    for i,(before,after)in enumerate(zip(t['rows'],got['rows'])):
     assert after['order_index']==i
     assert after.get('row_id')==before.get('row_id'),(id,i,'row ID')
     assert after.get('order_index')==before.get('order_index'),(id,i,'input row order')
     for field in fields:assert before.get(field,'')==after.get(field,''),(id,i,field)
     derived=(before.get('meta')or{}).get('niqqud_derived')
     if derived:assert (after.get('meta')or{}).get('niqqud_derived',{}).get('value')==derived.get('value'),(id,i,'derived niqqud')
    assert len((out/w['preview']).read_bytes())<128*1024 and sha((out/w['preview']).read_bytes())==w['preview_sha256']
    # Scan metadata separately: literary bodies may legitimately contain paths/words.
    metadata=json.dumps(got['source_meta'],ensure_ascii=False).lower()
    for forbidden in ['snapshot_path','inventory_path','source_paths','recovery','system_prompt','operational','access_token','audio_upload_token','e:\\','c:\\']:assert forbidden not in metadata,(id,forbidden)
 assert rows==39394 and len(mapped)==688
 for file,expected in manifest['assets'].items():assert sha((out/file).read_bytes())==expected['sha256'] and (out/file).stat().st_size==expected['bytes'],file
 index=load(out/root['index_file']);search=load(out/root['search_file']);cards={};totalrows=0
 for record in root['manifests']:
  data=load(out/record['file']);assert data['version']==8 and len(data['works'])==record['count']
  for c in data['works']:assert c['id']not in cards;cards[c['id']]=c
 ready={c['id']:c for c in index['ready']};assert len(cards)==26455 and len(ready)==root['counts']['baked']==1421;assert set(ready)==set(root['pointers']['ready'])
 comparison=load(a.dir/'comparison.json');old_keys={w['work_id']:w['published_keys'] for w in comparison['works']}
 owners={}
 for record in original['works']:
  id=record['work_id'];expected=sorted(set(old_keys[id]+[record['stored_key'],record['recomputed_key']]))
  assert ready[id]['previous_text_keys']==expected,(id,'native edition aliases')
  for key in expected:
   assert key not in owners or owners[key]==id,(id,'foreign alias ownership')
   owners[key]=id
 assert sum(r['r'] for r in search)==1421;assert [r['id']for r in search]==[r['id']for r in load(base/'data/benyehuda/corpus-search-v7.json')]
 for id,c in ready.items():
  assert c['file']==cards[id]['file'] and c['text_key']==cards[id]['text_key'];b=load(out/c['file']);assert any(t['text_key']==c['text_key'] for t in b['library']['texts']);totalrows+=sum(len(t['rows'])for t in b['library']['texts'])
 assert totalrows==106375
 for work in manifest['retained_works']:assert sha((out/work['body']).read_bytes())==sha((base/'data/benyehuda'/work['body']).read_bytes())==work['sha256']
 # Exact original files plus deployed catalogs/SW are retained privately, outside git.
 rollback=a.dir/'rollback-v7.zip'
 with zipfile.ZipFile(rollback,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as z:
  for file in sorted(base.rglob('*')):
   if file.is_file():z.write(file,file.relative_to(base).as_posix())
 with zipfile.ZipFile(rollback)as z:assert z.testzip()is None
 report={'checks':'all passed','learning_works':688,'input_rows_preserved':rows,'ready_works':1421,'ready_rows':totalrows,'retained_bodies_byte_identical':733,'all_catalog_rows':26455,'rollback_bytes':rollback.stat().st_size,'rollback_sha256':sha(rollback.read_bytes()),'manifest_sha256':root['release_manifest_sha256'],'input_inventory_sha256':sha((a.dir/'input-inventory.json').read_bytes())}
 (a.dir/'validation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
