// Stored ZIP64 transport. Payloads are hashed, copied and verified in bounded chunks.
// ZIP64 is used even for small exports so >4 GiB libraries never overflow ZIP32 fields.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LibraryTransferIo=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  const CHUNK=4*1024*1024,MAX_META=256*1024*1024;
  const C=()=>typeof window!=='undefined'?window.LibraryTransferCore:require('./library-transfer-core');
  const crc=()=>typeof window!=='undefined'?window.MediaBundleCore.createCrc32():require('./media-bundle-core').createCrc32();
  const bytes=s=>new TextEncoder().encode(s),view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
  const check=signal=>{if(signal&&signal.aborted)C().fail('TRANSFER_CANCELLED');};
  function u64(v,o,n){v.setBigUint64(o,BigInt(n),true);}
  function n64(v,o){const n=Number(v.getBigUint64(o,true));if(!Number.isSafeInteger(n))C().fail('TRANSFER_SIZE_UNSUPPORTED');return n;}
  async function each(blob,fn,signal){for(let o=0;o<blob.size;o+=CHUNK){check(signal);await fn(new Uint8Array(await blob.slice(o,Math.min(o+CHUNK,blob.size)).arrayBuffer()));}}
  async function hasher(options){if(options&&options.hasherFactory)return options.hasherFactory();if(typeof hashwasm!=='undefined')return hashwasm.createSHA256();
    if(typeof require==='function'){const h=require('node:crypto').createHash('sha256');return {init(){},update:b=>h.update(b),digest:()=>h.digest('hex')};}C().fail('HASH_RUNTIME_UNAVAILABLE');}
  async function digest(blob,options={}){const h=await hasher(options),c=crc();h.init();let done=0;await each(blob,b=>{h.update(b);c.update(b);done+=b.length;options.onHashProgress?.({done,total:blob.size});},options.signal);return {sha256:h.digest('hex'),crc32:c.value(),size_bytes:blob.size};}
  function header(entry,offset,central){const name=bytes(entry.path),b=new Uint8Array((central?46:30)+name.length+(central?28:20)),v=view(b),extra=(central?46:30)+name.length;
    v.setUint32(0,central?0x02014b50:0x04034b50,true);if(central){v.setUint16(4,45,true);v.setUint16(6,45,true);v.setUint32(16,entry.crc32,true);v.setUint32(20,0xffffffff,true);v.setUint32(24,0xffffffff,true);v.setUint16(28,name.length,true);v.setUint16(30,28,true);v.setUint32(42,0xffffffff,true);}
    else {v.setUint16(4,45,true);v.setUint32(14,entry.crc32,true);v.setUint32(18,0xffffffff,true);v.setUint32(22,0xffffffff,true);v.setUint16(26,name.length,true);v.setUint16(28,20,true);}
    b.set(name,central?46:30);v.setUint16(extra,1,true);v.setUint16(extra+2,central?24:16,true);u64(v,extra+4,entry.size_bytes);u64(v,extra+12,entry.size_bytes);if(central)u64(v,extra+20,offset);return b;
  }
  function end(count,centralSize,centralOffset,zip64Offset){const b=new Uint8Array(98),v=view(b);v.setUint32(0,0x06064b50,true);u64(v,4,44);v.setUint16(12,45,true);v.setUint16(14,45,true);u64(v,24,count);u64(v,32,count);u64(v,40,centralSize);u64(v,48,centralOffset);v.setUint32(56,0x07064b50,true);u64(v,64,zip64Offset);v.setUint32(72,1,true);v.setUint32(76,0x06054b50,true);v.setUint16(84,0xffff,true);v.setUint16(86,0xffff,true);v.setUint32(88,0xffffffff,true);v.setUint32(92,0xffffffff,true);return b;}
  async function write({manifest,sources,writable,signal,onProgress,hasherFactory}){
    C().verifyManifest(manifest);let written=0;const central=[],items=[];
    const source=async path=>typeof sources[path]==='function'?sources[path]():sources[path];
    try{for(const descriptor of manifest.entries){check(signal);
      // New exports already computed CRC/SHA during preparation. Legacy callers
      // without CRC retain their preflight. Copy still verifies every payload.
      if(Number.isInteger(descriptor.crc32)&&descriptor.crc32>=0&&descriptor.crc32<=0xffffffff){items.push({...descriptor});continue;}
      const blob=await source(descriptor.path);if(!blob)C().fail('TRANSFER_SOURCE_MISSING');const hash=await digest(blob,{signal,hasherFactory});if(hash.sha256!==descriptor.sha256||blob.size!==descriptor.size_bytes)C().fail('TRANSFER_SOURCE_CHANGED');items.push({...descriptor,crc32:hash.crc32});}

      const manifestBlob=new Blob([JSON.stringify(manifest)]);if(manifestBlob.size>16*1024*1024)C().fail('TRANSFER_MANIFEST_LIMIT');const manifestHash=await digest(manifestBlob,{signal,hasherFactory});items.unshift({path:'manifest.json',...manifestHash});
      const total=items.reduce((s,e)=>s+e.size_bytes+header(e,0,false).length+header(e,0,true).length,98);
      const artifact=await hasher({hasherFactory});artifact.init();let buffer=new Uint8Array(CHUNK),used=0,committed=0;
      // Coalesce tiny ZIP headers and speech files into bounded writes. A library
      // of thousands of MP3s must not incur thousands of filesystem round trips.
      const flush=async()=>{if(!used)return;check(signal);const block=buffer.subarray(0,used);await writable.write(block);artifact.update(block);committed+=used;used=0;buffer=new Uint8Array(CHUNK);if(onProgress)onProgress({written:committed,total});};
      const put=async b=>{check(signal);let offset=0;written+=b.length;while(offset<b.length){const n=Math.min(CHUNK-used,b.length-offset);buffer.set(b.subarray(offset,offset+n),used);used+=n;offset+=n;if(used===CHUNK)await flush();}};
      if(onProgress)onProgress({written:0,total});
      for(const item of items){central.push(header(item,written,true));await put(header(item,written,false));const payload=item.path==='manifest.json'?manifestBlob:await source(item.path);if(!payload||payload.size!==item.size_bytes)C().fail('TRANSFER_SOURCE_CHANGED');const h=await hasher({hasherFactory}),c=crc();h.init();await each(payload,async b=>{h.update(b);c.update(b);await put(b);},signal);if(h.digest('hex')!==item.sha256||c.value()!==item.crc32)C().fail('TRANSFER_SOURCE_CHANGED');}
      const offset=written;for(const h of central)await put(h);await put(end(items.length,written-offset,offset,written));await flush();if(onProgress)onProgress({written,total,phase:'closing'});await writable.close();return {size_bytes:written,artifact_sha256:artifact.digest('hex'),manifest};
    }catch(error){if(writable.abort)await writable.abort().catch(()=>{});throw error;}
  }
  async function slice(file,start,size){if(start<0||size<0||start+size>file.size)C().fail('TRANSFER_ZIP_BOUNDS');return new Uint8Array(await file.slice(start,start+size).arrayBuffer());}
  async function read(file){
    const tail=await slice(file,Math.max(0,file.size-66000),Math.min(file.size,66000)),v=view(tail);let e=-1;for(let i=tail.length-22;i>=0;i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===tail.length){e=i;break;}
    if(e<0)C().fail('TRANSFER_ZIP_EOCD');if(v.getUint16(e+4,true)||v.getUint16(e+6,true))C().fail('TRANSFER_ZIP_MULTIDISK');
    let count=v.getUint16(e+10,true),size=v.getUint32(e+12,true),offset=v.getUint32(e+16,true),limit=file.size-tail.length+e;
    if(count===0xffff||offset===0xffffffff||size===0xffffffff){if(e<20||v.getUint32(e-20,true)!==0x07064b50||v.getUint32(e-4,true)!==1)C().fail('TRANSFER_ZIP64_LOCATOR');const pos=n64(v,e-12),z=view(await slice(file,pos,56));if(z.getUint32(0,true)!==0x06064b50||z.getUint32(16,true)||z.getUint32(20,true)||n64(z,24)!==n64(z,32))C().fail('TRANSFER_ZIP64_INVALID');count=n64(z,32);size=n64(z,40);offset=n64(z,48);limit=pos;}
    if(count>200001||size>64*1024*1024||offset+size>limit)C().fail('TRANSFER_ZIP_LIMIT');
    const central=await slice(file,offset,size),cv=view(central),entries=new Map();let p=0;
    while(p<central.length){if(p+46>central.length||cv.getUint32(p,true)!==0x02014b50)C().fail('TRANSFER_ZIP_CENTRAL');const flags=cv.getUint16(p+8,true),method=cv.getUint16(p+10,true),nl=cv.getUint16(p+28,true),xl=cv.getUint16(p+30,true),cl=cv.getUint16(p+32,true);if(flags&1||method!==0||p+46+nl+xl+cl>central.length)C().fail('TRANSFER_ZIP_ENTRY');
      const path=new TextDecoder('utf-8',{fatal:true}).decode(central.slice(p+46,p+46+nl)),fileType=(cv.getUint32(p+38,true)>>>16)&0xf000;if(!C().pathAllowed(path)||entries.has(path)||(fileType&&fileType!==0x8000))C().fail('TRANSFER_ZIP_PATH');
      let compressed=cv.getUint32(p+20,true),length=cv.getUint32(p+24,true),local=cv.getUint32(p+42,true),x=p+46+nl,xe=x+xl;for(;x+4<=xe;){const tag=cv.getUint16(x,true),len=cv.getUint16(x+2,true);if(x+4+len>xe)C().fail('TRANSFER_ZIP_EXTRA');if(tag===1){let a=x+4;const take=()=>{if(a+8>x+4+len)C().fail('TRANSFER_ZIP64_EXTRA');const n=n64(cv,a);a+=8;return n;};if(length===0xffffffff)length=take();if(compressed===0xffffffff)compressed=take();if(local===0xffffffff)local=take();}x+=4+len;}
      if(compressed!==length||local+30>offset)C().fail('TRANSFER_ZIP_SIZE');const lh=await slice(file,local,30),lv=view(lh);if(lv.getUint32(0,true)!==0x04034b50||lv.getUint16(8,true)!==0||lv.getUint16(6,true)&1)C().fail('TRANSFER_ZIP_LOCAL');const name=await slice(file,local+30,lv.getUint16(26,true));if(new TextDecoder().decode(name)!==path)C().fail('TRANSFER_ZIP_LOCAL_NAME');const data=local+30+name.length+lv.getUint16(28,true);if(data+length>offset)C().fail('TRANSFER_ZIP_BOUNDS');entries.set(path,{path,size_bytes:length,crc32:cv.getUint32(p+16,true),data_offset:data,local_offset:local});p+=46+nl+xl+cl;
    }
    if(entries.size!==count)C().fail('TRANSFER_ZIP_COUNT');const ranges=[...entries.values()].sort((a,b)=>a.local_offset-b.local_offset);for(let i=1;i<ranges.length;i++)if(ranges[i].local_offset<ranges[i-1].data_offset+ranges[i-1].size_bytes)C().fail('TRANSFER_ZIP_OVERLAP');
    const me=entries.get('manifest.json');if(!me||me.size_bytes>16*1024*1024)C().fail('TRANSFER_MANIFEST_LIMIT');const manifest=C().verifyManifest(JSON.parse(await blob(file,me).text()));
    if(entries.size!==manifest.entries.length+1)C().fail('TRANSFER_UNMANIFESTED_PAYLOAD');for(const d of manifest.entries){const found=entries.get(d.path);if(!found||found.size_bytes!==d.size_bytes)C().fail('TRANSFER_ENTRY_SIZE');}
    return {file,manifest,entries};
  }
  function blob(file,entry){return file.slice(entry.data_offset,entry.data_offset+entry.size_bytes);}
  async function verify(read,options={}){for(const d of [{path:'manifest.json',size_bytes:read.entries.get('manifest.json').size_bytes},...read.manifest.entries]){const entry=read.entries.get(d.path),hash=await digest(blob(read.file,entry),options);if(hash.crc32!==entry.crc32||(d.sha256&&hash.sha256!==d.sha256))C().fail('TRANSFER_PAYLOAD_CORRUPT');if(options.onProgress)options.onProgress(d.path);}return read;}
  async function json(read,path){const e=read.entries.get(path);if(!e||e.size_bytes>MAX_META)C().fail('TRANSFER_METADATA_LIMIT');return JSON.parse(await blob(read.file,e).text());}
  async function detect(file){try{const h=view(await slice(file,0,30));if(h.getUint32(0,true)!==0x04034b50||h.getUint16(8,true)!==0)return false;const nl=h.getUint16(26,true),xl=h.getUint16(28,true);if(nl!==13||new TextDecoder().decode(await slice(file,30,nl))!=='manifest.json')return false;let size=h.getUint32(22,true);if(size===0xffffffff){const x=view(await slice(file,30+nl,xl));if(x.getUint16(0,true)!==1)return false;size=n64(x,4);}if(size>16*1024*1024)return false;return JSON.parse(await file.slice(30+nl+xl,30+nl+xl+size).text()).schema===C().SCHEMA;}catch(_){return false;}}
  return {CHUNK,MAX_META,digest,write,read,verify,blob,json,header,end,detect};
});
