const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/js/library-transfer-core'),IO=require('../public/js/library-transfer-io'),M=require('../public/js/mediatheque-core');
const hash='a'.repeat(64),play=status=>({schema:'studio-playback-source-v1',revision:1,history:[{revision:1,source:{kind:'youtube',video_id:'_suFmOyJQts'},timing:{status,basis_sha256:hash}}]});
const Transfer=require('../public/js/library-transfer');
test('prepared CRC enables one source read and bounded coalesced writes for thousands of audio files',async()=>{
  const sources={'library/library.json':new Blob(['{"schema_version":1,"texts":[],"audio_assets":[]}']),'library/mediatheque.json':new Blob([JSON.stringify(M.empty())])},entries=[],audio=[];
  for(let i=0;i<1500;i++){const b=new Blob(['audio '+i]),h=await IO.digest(b),path='audio/'+h.sha256+'.mp3';sources[path]=b;audio.push({asset_key:h.sha256,path,sha256:h.sha256,size_bytes:b.size});}
  for(const [path,b]of Object.entries(sources))entries.push({path,...await IO.digest(b)});
  const manifest={schema:C.SCHEMA,mode:'move',personal_included:false,entries,media:[],audio},parts=[],calls=new Map(),progress=[];
  await IO.write({manifest,sources:Object.fromEntries(Object.entries(sources).map(([p,b])=>[p,async()=>{calls.set(p,(calls.get(p)||0)+1);return b}])),onProgress:p=>progress.push(p),writable:{async write(b){assert.ok(b.length<=IO.CHUNK);parts.push(b)},async close(){}}});
  assert.ok([...calls.values()].every(n=>n===1),'writer reread a prepared payload before copying');assert.equal(parts.length,1,'small payloads were not coalesced');assert.equal(progress[0].written,0);assert.equal(progress.at(-1).phase,'closing');assert.equal(progress.at(-1).written,progress.at(-1).total);await IO.verify(await IO.read(new Blob(parts)));
});
test('prepared CRC never bypasses changed source detection or destination abort',async()=>{
  const sources={'library/library.json':new Blob(['old']),'library/mediatheque.json':new Blob([JSON.stringify(M.empty())])},entries=[];for(const [path,b]of Object.entries(sources))entries.push({path,...await IO.digest(b)});sources['library/library.json']=new Blob(['new']);let aborted=false,closed=false;
  await assert.rejects(()=>IO.write({manifest:{schema:C.SCHEMA,mode:'share',personal_included:false,entries,media:[]},sources,writable:{async write(){},async close(){closed=true},async abort(){aborted=true}}}),/TRANSFER_SOURCE_CHANGED/);assert.equal(aborted,true);assert.equal(closed,false);
});
test('large aliased bundle projection never serializes the wrapper or entire text array',()=>{
  const texts=Array.from({length:644},(_,i)=>({text_key:String(i),rows:[{note:'private',source:{paid:'preserved'},hebrew_plain:'שלום'}]})),audio=[{asset_key:hash}];
  const bundle={library:{schema_version:1,texts,audio_assets:audio},texts,audio_assets:audio,notes_advanced:{review_log:[1]}};
  const stringify=JSON.stringify;JSON.stringify=function(value,...args){assert.notEqual(value,bundle);assert.notEqual(value,bundle.library);assert.notEqual(value,texts);return stringify(value,...args);};
  try{for(const personal of [true,false]){const out=C.libraryForPrivacy(bundle,personal);assert.equal(out.texts,out.library.texts);assert.equal(out.audio_assets,out.library.audio_assets);assert.equal(out.library.texts.length,644);out.library.texts[0].rows[0].source.paid='changed';out.audio_assets[0].asset_key='changed';assert.equal(texts[0].rows[0].source.paid,'preserved');assert.equal(audio[0].asset_key,hash);assert.equal(out.library.texts[0].rows[0].note,personal?'private':undefined);}}finally{JSON.stringify=stringify;}
});
async function metadataArchive(header,chunks={}){
  const sources={'library/library.json':new Blob([JSON.stringify(header)]),'library/mediatheque.json':new Blob([JSON.stringify(M.empty())]),...Object.fromEntries(Object.entries(chunks).map(([p,v])=>[p,new Blob([JSON.stringify(v)])]))},entries=[];
  for(const [path,source]of Object.entries(sources))entries.push({path,...await IO.digest(source)});
  const parts=[],manifest={schema:C.SCHEMA,mode:'share',personal_included:false,entries,media:[]};await IO.write({manifest,sources,writable:{async write(b){parts.push(b)},async close(){}}});return IO.verify(await IO.read(new Blob(parts)));
}
test('chunked library reconstructs all texts in order and supports legacy metadata',async()=>{
  const texts=[{text_key:'one',rows:[{hebrew_plain:'שלום',source:{paid:'keep'}}]},{text_key:'two',rows:[]}],paths=[hash,'b'.repeat(64)].map(h=>'library/texts/'+h+'.json'),header={schema_version:2,audio_assets:[],shelves:[],text_chunks:paths.map((path,i)=>({path,text_key:texts[i].text_key}))};
  const read=await metadataArchive(header,Object.fromEntries(paths.map((p,i)=>[p,texts[i]])));assert.deepEqual(await Transfer.readLibrary(read),{schema_version:1,audio_assets:[],shelves:[],texts});
  const old={schema_version:1,texts,audio_assets:[]};assert.deepEqual(await Transfer.readLibrary(await metadataArchive(old)),old);
});
test('missing, repeated, mismatched or unreferenced text chunks fail before writes',async()=>{
  const path='library/texts/'+hash+'.json',text={text_key:'one',rows:[]},ref={path,text_key:'one'},header={schema_version:2,audio_assets:[],text_chunks:[ref]};
  for(const [h,c,code]of [[header,{},'TRANSFER_TEXT_CHUNK_INVALID'],[{...header,text_chunks:[ref,ref]},{[path]:text},'TRANSFER_TEXT_CHUNK_INVALID'],[header,{[path]:{...text,text_key:'other'}},'TRANSFER_TEXT_CHUNK_INVALID'],[{...header,text_chunks:[]},{[path]:text},'TRANSFER_TEXT_CHUNK_UNREFERENCED']])await assert.rejects(()=>metadataArchive(h,c).then(Transfer.readLibrary),new RegExp(code));
});
test('YouTube URL alone cannot auto-exclude local media; every use needs verified timing',()=>{
  const item={sha256:hash,path:'media/'+hash+'.mp4',size_bytes:99,available:true,playback_source:play('unverified')};
  assert.equal(C.planMedia([item],{excludeVerifiedYoutube:true})[0].status,'included');
  assert.equal(C.planMedia([{...item,playback_source:play('owner-confirmed'),playback_verified:true}],{excludeVerifiedYoutube:true})[0].status,'excluded_by_user');
  assert.equal(C.planMedia([{...item,playback_source:play('owner-confirmed')}],{excludeVerifiedYoutube:true})[0].status,'included','stale confirmation is not runtime timing proof');
  assert.equal(C.planMedia([item,{...item,playback_source:play('owner-confirmed')}],{excludeVerifiedYoutube:true})[0].status,'included');
  assert.equal(C.planMedia([item],{excluded:[hash]})[0].status,'excluded_by_user');
  assert.equal(C.planMedia([{...item,available:false}])[0].status,'missing');
  assert.equal(C.planMedia([item,item]).length,1);
});
test('share projection preserves teaching provenance and strips private learner records',()=>{
  const b={library:{texts:[{rows:[{hebrew_plain:'hello',note:'private',translation_provider:'paid'}],progress:{last_row_idx:3},bookmarks:[{}]}]},notes_advanced:{review_log:[{}]}};
  const shared=C.libraryForPrivacy(b,false);assert.equal(shared.notes_advanced,undefined);assert.deepEqual(shared.library.texts[0].bookmarks,[]);assert.equal(shared.library.texts[0].rows[0].note,undefined);assert.equal(shared.library.texts[0].rows[0].translation_provider,'paid');assert.equal(b.library.texts[0].rows[0].note,'private');
});
async function archive(){const sources={'library/library.json':new Blob(['{"texts":[]}']),'library/mediatheque.json':new Blob([JSON.stringify(M.empty())]),['media/'+hash+'.mp4']:new Blob([new Uint8Array(5*1024*1024).fill(7)])};const entries=[];for(const [path,source]of Object.entries(sources))entries.push({path,...await IO.digest(source)});
  const mediaEntry=entries[2];delete sources[mediaEntry.path];mediaEntry.path='media/'+mediaEntry.sha256+'.mp4';sources[mediaEntry.path]=new Blob([new Uint8Array(5*1024*1024).fill(7)]);
  const manifest={schema:C.SCHEMA,mode:'move',personal_included:true,entries,media:[{...mediaEntry,status:'included',uses:[]}]},parts=[];let max=0,closed=false;
  await IO.write({manifest,sources,writable:{async write(b){max=Math.max(max,b.length);parts.push(b);},async close(){closed=true;}}});return {file:new Blob(parts),max,closed,manifest};}
test('ZIP64 roundtrip streams payloads and verifies every payload before restore',async()=>{const a=await archive();assert.equal(a.closed,true);assert.ok(a.max<=IO.CHUNK);const read=await IO.verify(await IO.read(a.file));assert.equal(read.manifest.entries.length,3);assert.deepEqual(await IO.json(read,'library/mediatheque.json'),M.empty());});
test('payload corruption is rejected independently of the manifest',async()=>{const a=await archive(),read=await IO.read(a.file),entry=read.entries.get('library/library.json'),part=new Uint8Array(await a.file.arrayBuffer());part[entry.data_offset]^=1;await assert.rejects(()=>IO.verify({...read,file:new Blob([part])}),/TRANSFER_PAYLOAD_CORRUPT/);});
test('write refuses changed source and aborts destination',async()=>{const a=await archive();let abort=false;await assert.rejects(()=>IO.write({manifest:a.manifest,sources:Object.fromEntries(a.manifest.entries.map(d=>[d.path,new Blob(['wrong'])])),writable:{write(){},close(){},async abort(){abort=true;}}}),/TRANSFER_SOURCE_CHANGED/);assert.ok(abort);});
test('ZIP64 headers keep offsets and sizes larger than 4 GiB',()=>{const d={path:'media/'+hash+'.mp4',size_bytes:6*1024**3,crc32:12};const h=IO.header(d,7*1024**3,true),v=new DataView(h.buffer),extra=46+d.path.length;assert.equal(Number(v.getBigUint64(extra+4,true)),d.size_bytes);assert.equal(Number(v.getBigUint64(extra+20,true)),7*1024**3);});
test('malformed manifest, traversal and unmanifested paths never pass',()=>{assert.equal(C.pathAllowed('../media/a.mp4'),false);assert.equal(C.pathAllowed('media/'+hash+'.mp4'),true);assert.throws(()=>C.verifyManifest({schema:C.SCHEMA,mode:'share',personal_included:false,entries:[],media:[]}),/TRANSFER_LIBRARY_MISSING/);});
test('structure merge keeps recipient categories and is idempotent',()=>{const a=M.empty(),b=M.empty();a.categories=[{id:'m_category',title:'Recipient',description:'',parentId:null,items:[]}];b.categories=[{id:'m_category',title:'Sender',description:'',parentId:null,items:[]}];const merged=C.mergeStructure(a,b,M);assert.equal(merged.structure.categories.length,2);assert.equal(merged.conflicts.length,1);assert.deepEqual(C.mergeStructure(merged.structure,b,M).structure,merged.structure);});
test('structure merge remaps nested parent references and stays idempotent',()=>{const a=M.empty(),b=M.empty();a.categories=[{id:'m_parent',title:'Recipient',description:'',parentId:null,items:[]}];b.categories=[{id:'m_parent',title:'Sender',description:'',parentId:null,items:[]},{id:'m_child',title:'Child',description:'',parentId:'m_parent',items:[]}];const merged=C.mergeStructure(a,b,M);assert.deepEqual(C.mergeStructure(merged.structure,b,M).structure,merged.structure);});
test('cancel aborts the streaming destination',async()=>{const a=await archive(),controller=new AbortController();controller.abort();let aborted=false;await assert.rejects(()=>IO.write({manifest:a.manifest,sources:{},signal:controller.signal,writable:{write(){},close(){},async abort(){aborted=true;}}}),/TRANSFER_CANCELLED/);assert.equal(aborted,true);});
test('explicit TTS exclusions are distinct from missing audio and cannot hide included payloads',async()=>{const a=await archive(),manifest={...a.manifest,audio_included:false,excluded_audio:[{asset_key:hash,reason:'excluded_by_user'}],missing_audio:[]};assert.equal(C.verifyManifest(manifest),manifest);assert.throws(()=>C.verifyManifest({...manifest,excluded_audio:[...manifest.excluded_audio,...manifest.excluded_audio]}),/TRANSFER_AUDIO_EXCLUSION_INVALID/);assert.throws(()=>C.verifyManifest({...manifest,audio_included:'no'}),/TRANSFER_AUDIO_CHOICE_INVALID/);const entry={path:'audio/'+hash+'.mp3',sha256:hash,size_bytes:1};assert.throws(()=>C.verifyManifest({...manifest,entries:[...manifest.entries,entry],audio:[{...entry,asset_key:hash}]}),/TRANSFER_AUDIO_CHOICE_INVALID/);});
test('ZIP64 reader locates payloads beyond 4 GiB without reading the whole archive',async()=>{
  const library=new Blob(['{"schema_version":1,"texts":[],"audio_assets":[]}']),structure=new Blob([JSON.stringify(M.empty())]),large=6*1024**3,media={path:'media/'+hash+'.mp4',sha256:hash,size_bytes:large,crc32:0};
  const entries=[{path:'library/library.json',...await IO.digest(library)},{path:'library/mediatheque.json',...await IO.digest(structure)},media],manifest={schema:C.SCHEMA,mode:'move',personal_included:true,entries,media:[{...media,status:'included',uses:[]}]},m=new Blob([JSON.stringify(manifest)]),items=[{path:'manifest.json',...await IO.digest(m)},...entries],payloads=[m,library,structure,null],segments=[],central=[];let offset=0,maxRead=0;
  for(let i=0;i<items.length;i++){const local=IO.header(items[i],offset,false);central.push(IO.header(items[i],offset,true));segments.push({offset,bytes:local});offset+=local.length;if(payloads[i])segments.push({offset,bytes:new Uint8Array(await payloads[i].arrayBuffer())});offset+=items[i].size_bytes;}
  const centralOffset=offset;for(const bytes of central){segments.push({offset,bytes});offset+=bytes.length;}const tail=IO.end(items.length,offset-centralOffset,centralOffset,offset);segments.push({offset,bytes:tail});offset+=tail.length;
  const file={size:offset,slice(start,end){const size=end-start;maxRead=Math.max(maxRead,size);assert.ok(size<1024*1024,'reader attempted a bulk read');const out=new Uint8Array(size);for(const s of segments){const a=Math.max(start,s.offset),b=Math.min(end,s.offset+s.bytes.length);if(b>a)out.set(s.bytes.slice(a-s.offset,b-s.offset),a-start);}return new Blob([out]);}};
  const read=await IO.read(file);assert.equal(read.entries.get(media.path).size_bytes,large);assert.ok(read.entries.get('manifest.json').data_offset<65536);assert.ok(maxRead<=66000);
});
