const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../public/js/portable-learning-package-core.js');
const Studio=require('../public/js/studio-portable-learning-package.js');

test('future schema fails before entries or any repository access',async()=>{
  const manifest={schema:Core.SCHEMA,schema_version:3,package_mode:'snapshot',portable_package_id:'portable-package:sha256:'+'a'.repeat(64),content_root_sha256:'b'.repeat(64),roots:{},history:{caption_complete:false,table_complete:false,external_ancestors:[]},media:{included:false,sha256:null,size_bytes:null,mime:null,duration_ms:null,codec_hint:null},entries:[],privacy:{included:[],excluded:[]}};
  await assert.rejects(()=>Core.verifyPackageFiles({'manifest.json':Core.canonicalJson(manifest)}),/PACKAGE_SCHEMA_FUTURE/);
});

test('central directory rejects traversal and high-ratio payload before extraction',async()=>{
  const traversal=await Studio.zipFiles({'../manifest.json':'{}'},'uint8array');
  assert.throws(()=>Studio.inspectZipCentralDirectory(traversal),/PACKAGE_PATH_UNMANIFESTED|PACKAGE_PATH_INVALID/);
  const bomb=await Studio.zipFiles({'README.txt':'A'.repeat(200000)},'uint8array');
  assert.throws(()=>Studio.inspectZipCentralDirectory(bomb),/PACKAGE_COMPRESSION_RATIO_EXCEEDED|PACKAGE_AGGREGATE_RATIO_EXCEEDED/);
});

test('duplicate raw central-directory names are rejected',async()=>{
  const a='learning/table/revisions/'+'a'.repeat(64)+'.json',b='learning/table/revisions/'+'b'.repeat(64)+'.json';
  const bytes=await Studio.zipFiles({[a]:'{}',[b]:'{}'},'uint8array'),needle=Buffer.from(b),replacement=Buffer.from(a);
  let replaced=0;
  for(let i=0;i<=bytes.length-needle.length;i++)if(Buffer.from(bytes.slice(i,i+needle.length)).equals(needle)){bytes.set(replacement,i);replaced++;i+=needle.length-1;}
  assert.equal(replaced,2,'local and central raw names patched');
  assert.throws(()=>Studio.inspectZipCentralDirectory(bytes),/PACKAGE_DUPLICATE_PATH/);
});

test('strict file verifier rejects missing, unmanifested and corrupt entries',async()=>{
  const fixture={package:{media_sha256:'a'.repeat(64)},raw_track:{current_revision_id:'r0'},raw_revisions:[{revision_id:'r0',revision_no:1,canonical_sha256:'b'.repeat(64),segments:[]}],corrected_track:{current_revision_id:'r1'},corrected_revisions:[{revision_id:'r1',revision_no:1,canonical_sha256:'c'.repeat(64),segments:[]}],material:{portable_text_key:'security',current_table_revision_id:'t1'},table_revisions:[{table_revision_id:'t1',revision_no:1,bound_caption_revision_id:'r1',bound_caption_revision_sha256:'c'.repeat(64),content_sha256:'d'.repeat(64),mapping_sha256:'e'.repeat(64),rows:[]}],text:{text_key:'security'},selected_caption_revision_id:'r1',selected_table_revision_id:'t1'};
  const files=await Core.buildPackageFiles(fixture,{mode:'snapshot'});
  const missing={...files};delete missing['learning/material.json'];await assert.rejects(()=>Core.verifyPackageFiles(missing),/PACKAGE_FILE_MISSING/);
  const corrupt={...files,'quality/report.json':'{"ok":false}'};await assert.rejects(()=>Core.verifyPackageFiles(corrupt),/PACKAGE_SIZE_MISMATCH|PACKAGE_CHECKSUM_MISMATCH/);
  const extra={...files};extra['learning/table/revisions/'+'f'.repeat(64)+'.json']='{}';await assert.rejects(()=>Core.verifyPackageFiles(extra),/PACKAGE_UNMANIFESTED_FILE/);
});
