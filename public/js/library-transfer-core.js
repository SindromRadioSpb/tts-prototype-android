(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LibraryTransferCore=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  const SCHEMA='linguistpro-library-transfer-v1',HASH=/^[a-f0-9]{64}$/,MODES=['move','share'];
  function fail(code){throw Object.assign(new Error(code),{code});}
  const clone=value=>JSON.parse(JSON.stringify(value));
  function pathAllowed(path){return typeof path==='string'&&path.length<240&&/^(manifest\.json|library\/(library|notes_advanced|mediatheque|audio-bindings|export-receipts)\.json|personal\/tutor-explanations\.json|learning-packages\/[a-f0-9]{64}\.lplp\.zip|workspace\/[a-f0-9]{64}\.json|audio\/[a-f0-9]{64}\.mp3|media\/[a-f0-9]{64}\.[a-z0-9]{1,5})$/.test(path);}
  function latestPlayback(value){if(!value||value.schema!=='studio-playback-source-v1'||!Array.isArray(value.history))return null;return value.history.find(x=>x.revision===value.revision)||null;}
  function youtubeAlternative(playback,verified=false){const current=latestPlayback(playback),source=current&&current.source,timing=current&&current.timing;
    if(!source||source.kind!=='youtube'||!/^[A-Za-z0-9_-]{11}$/.test(source.video_id||''))return null;
    return {video_id:source.video_id,url:'https://www.youtube.com/watch?v='+source.video_id,verified:!!(verified&&timing&&['owner-confirmed','source-captions'].includes(timing.status)),offset_ms:Number(current.offset_ms)||0};
  }
  function planMedia(items,options={}){const exclusions=new Set(options.excluded||[]),groups=new Map();
    for(const item of items){if(!HASH.test(item.sha256||''))fail('TRANSFER_MEDIA_HASH_INVALID');let group=groups.get(item.sha256);
      if(!group){group={sha256:item.sha256,path:item.path,name:item.name||item.sha256,mime:item.mime||'application/octet-stream',size_bytes:item.size_bytes,available:!!item.available,uses:[]};groups.set(item.sha256,group);}
      else if(group.size_bytes!==item.size_bytes)fail('TRANSFER_MEDIA_SIZE_CONFLICT');
      group.available=group.available||!!item.available;group.uses.push({package_id:item.package_id||null,text_key:item.text_key||null,title:item.title||item.name||'',rendition:item.rendition||'full',youtube:youtubeAlternative(item.playback_source,item.playback_verified===true)});
    }
    return [...groups.values()].map(item=>{const replaceable=item.uses.every(use=>use.youtube&&use.youtube.verified&&use.rendition==='full');const excluded=exclusions.has(item.sha256)||(options.excludeVerifiedYoutube&&replaceable);return {...item,replaceable,status:excluded?'excluded_by_user':item.available?'included':'missing'};});
  }
  function libraryForPrivacy(bundle,personal){const out=clone(bundle);if(personal)return out;
    for(const text of out.library.texts){text.progress=null;text.bookmarks=[];text.is_pinned=false;text.pin_order=null;text.manual_smart_tag=null;for(const row of text.rows||[]){delete row.note;delete row.is_known;delete row.last_grade;delete row.srs;}}
    out.texts=out.library.texts;delete out.notes_advanced;return out;
  }
  function verifyManifest(manifest){
    if(!manifest||manifest.schema!==SCHEMA||!MODES.includes(manifest.mode)||typeof manifest.personal_included!=='boolean'||!Array.isArray(manifest.entries)||manifest.entries.length>200000||!Array.isArray(manifest.media)||manifest.media.length>100000)fail('TRANSFER_MANIFEST_INVALID');
    const seen=new Set();for(const entry of manifest.entries){if(!entry||!pathAllowed(entry.path)||entry.path==='manifest.json'||seen.has(entry.path)||!HASH.test(entry.sha256||'')||!Number.isSafeInteger(entry.size_bytes)||entry.size_bytes<0)fail('TRANSFER_ENTRY_INVALID');seen.add(entry.path);}
    if(!seen.has('library/library.json')||!seen.has('library/mediatheque.json'))fail('TRANSFER_LIBRARY_MISSING');
    const byPath=new Map(manifest.entries.map(e=>[e.path,e])),audioPaths=new Set(),audioSeen=new Set();for(const audio of manifest.audio||[]){if(!HASH.test(audio.asset_key||'')||audioSeen.has(audio.asset_key)||!audio.path?.startsWith('audio/')||byPath.get(audio.path)?.sha256!==audio.sha256||byPath.get(audio.path)?.size_bytes!==audio.size_bytes)fail('TRANSFER_AUDIO_INVALID');audioSeen.add(audio.asset_key);audioPaths.add(audio.path);}
    for(const entry of manifest.entries)if(entry.path.startsWith('audio/')&&!audioPaths.has(entry.path))fail('TRANSFER_AUDIO_REFERENCE_MISSING');
    const mediaSeen=new Set();for(const media of manifest.media){if(!media||!HASH.test(media.sha256||'')||mediaSeen.has(media.sha256)||!['included','excluded_by_user','missing','failed'].includes(media.status)||!Array.isArray(media.uses))fail('TRANSFER_MEDIA_INVALID');mediaSeen.add(media.sha256);
      if(media.status==='included'&&(!seen.has(media.path)||!media.path?.startsWith('media/')||byPath.get(media.path)?.sha256!==media.sha256||byPath.get(media.path)?.size_bytes!==media.size_bytes))fail('TRANSFER_MEDIA_PAYLOAD_MISSING');
    }
    if(!manifest.personal_included&&['library/notes_advanced.json','personal/tutor-explanations.json','library/export-receipts.json'].some(path=>seen.has(path)))fail('TRANSFER_PERSONAL_UNEXPECTED');
    return manifest;
  }
  // Conflict IDs are mapped deterministically before references are rewritten. Never discard
  // the recipient's categories, collections, views or annotations to restore a sender's copy.
  function mergeStructure(current,incoming,Core){const a=Core.validate(current),b=Core.validate(incoming),out=clone(a),map=new Map(),conflicts=[];
    const canonical=value=>JSON.stringify(value);const all=[...a.categories,...a.collections,...a.views],used=new Set([...all,...b.categories,...b.collections,...b.views].map(x=>x.id));
    const depth=item=>{let n=0,p=item.parentId;while(p){n++;p=b.categories.find(c=>c.id===p)?.parentId;}return n;};
    for(const original of [...b.categories.slice().sort((x,y)=>depth(x)-depth(y)),...b.collections,...b.views]){const item=clone(original);if(item.parentId)item.parentId=map.get(item.parentId);if(item.categoryId)item.categoryId=map.get(item.categoryId);if(item.filters){if(item.filters.category)item.filters.category=map.get(item.filters.category);if(item.filters.collection)item.filters.collection=map.get(item.filters.collection);}
      const existing=all.find(x=>x.id===item.id);let id=item.id;
      if(existing&&canonical(existing)!==canonical(item)){let suffix=0;const stem=item.id.slice(0,78)+'-transfer';id=stem;while(used.has(id)&&!all.some(x=>x.id===id&&canonical({...x,id:item.id})===canonical(item)))id=stem+'-'+(++suffix);conflicts.push({id:item.id,imported_id:id});}
      map.set(original.id,id);used.add(id);
    }
    for(const ref of b.references)if(!out.references.some(x=>Core.refKey(x)===Core.refKey(ref)))out.references.push(ref);
    out.saved=[...new Set([...out.saved,...b.saved])];
    for(const type of ['categories','collections','views'])for(const source of b[type]){const item=clone(source);item.id=map.get(item.id);if(item.parentId)item.parentId=map.get(item.parentId);if(item.categoryId)item.categoryId=map.get(item.categoryId);if(item.filters){if(item.filters.category)item.filters.category=map.get(item.filters.category);if(item.filters.collection)item.filters.collection=map.get(item.filters.collection);}
      if(!out[type].some(x=>x.id===item.id))out[type].push(item);
    }
    for(const item of b.annotations)if(!out.annotations.some(x=>x.key===item.key))out.annotations.push(item);
    if(!a.categories.length&&!a.collections.length&&!a.references.length)out.home=clone(b.home);
    return {structure:Core.validate(out),conflicts};
  }
  return {SCHEMA,HASH,fail,pathAllowed,youtubeAlternative,planMedia,libraryForPrivacy,verifyManifest,mergeStructure};
});
