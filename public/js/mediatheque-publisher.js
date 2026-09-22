// Guided archive publication over the existing publication domain.
export function publisherStep(t,esc,current) {
  return `<ol class="ml-publisher-steps" aria-label="${esc(t('publicationSteps'))}">${['sourceStep','detailsStep','materialStep','structureStep'].map((key,i)=>`<li ${i+1===current?'aria-current="step"':''}><span aria-hidden="true">${i+1}</span>${esc(t(key))}</li>`).join('')}</ol>`;
}
export function openPublisher(ctx) {
  const {api,t,esc,showDialog,formActions,C}=ctx;
  let work=null, copied=null, rights=null, receipt=null, detail=null, corpus=null, destination=null;
  const steps=new Map(), keys=new Map();
  async function once(name,path,body){
    if(steps.has(name))return steps.get(name);
    if(!keys.has(name))keys.set(name,crypto.randomUUID());
    const out=await api(path,body,keys.get(name));steps.set(name,out);return out;
  }
  async function upload(path,file,type){
    if(!file?.size||file.size>512*1024*1024)throw new Error('MATERIAL_ARCHIVE_INVALID');
    const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':type,'X-LP-CSRF':localStorage.getItem('cloud.csrf')||''},body:file,signal:AbortSignal.timeout(300000)});
    const out=await response.json();if(!response.ok||!out.ok)throw new Error(out.error||'MATERIAL_ARCHIVE_INVALID');return out;
  }
  showDialog(t('publisherTitle'),`${publisherStep(t,esc,1)}<p>${esc(t('publisherIntro'))}</p>
    <label>${esc(t('learningArchive'))}<input name="archive" type="file" accept=".zip" required></label>
    <label>${esc(t('playbackSource'))}<select name="mode"><option value="youtube">YouTube</option><option value="media">${esc(t('attachedMedia'))}</option></select></label>
    <label data-publisher-youtube>${esc(t('youtubeLink'))}<input name="youtube" type="url" placeholder="https://www.youtube.com/watch?v=…" dir="ltr"></label>
    <label data-publisher-media hidden>${esc(t('separateMedia'))}<input name="media" type="file" accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4"></label>
    ${formActions(t('checkArchive'))}`,async data=>{
      const mode=data.get('mode'),url=mode==='youtube'?data.get('youtube').trim():'';
      work=await upload('/api/publication/mediatheque/archive?'+new URLSearchParams({mode,youtube:url}),data.get('archive'),'application/zip');
      if(mode==='media'&&!work.hasMedia){const media=data.get('media');if(!media?.size)throw new Error('MATERIAL_MEDIA_REQUIRED');await upload('/api/publication/mediatheque/archive/'+work.token+'/media',media,'application/octet-stream');work.hasMedia=true;}
      if(mode==='youtube'&&!work.videoId)throw new Error('PLAYBACK_SOURCE_INVALID');
      await metadata();
    });
  const modeSelect=document.querySelector('#ml-form [name=mode]');
  const syncMode=()=>{const media=modeSelect.value==='media';document.querySelector('[data-publisher-media]').hidden=!media;document.querySelector('[data-publisher-youtube]').hidden=media;document.querySelector('#ml-form [name=youtube]').disabled=media;document.querySelector('#ml-form [name=media]').disabled=!media;};
  modeSelect.addEventListener('change',syncMode);syncMode();
  async function metadata(){
    const d=ctx.structure();
    let channel=null,series=null;
    try {const seed=await(await fetch('/data/mediatheque/editorial-seed-v1.json')).json();const video=seed.videos.find(v=>v.videoId===work.videoId);series=seed.collections.find(c=>c.id===video?.collectionId);channel=seed.channels.find(c=>c.id===series?.categoryId);}catch(_){}
    const category=d.categories.find(c=>channel&&(c.id===channel.id||C.normalize(c.title)===C.normalize(channel.title)));
    const collection=d.collections.find(c=>series&&(c.id===series.id||(c.categoryId===category?.id&&C.normalize(c.title)===C.normalize(series.title))));
    const options=(xs,selected)=>'<option value="">'+esc(t('none'))+'</option>'+xs.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.title)}</option>`).join('');
    showDialog(t('publisherDetails'),`${publisherStep(t,esc,2)}<p class="ml-archive-summary">${esc(t('archiveChecked',{count:work.rowCount}))} · ${work.videoId?'YouTube':esc(t('attachedMedia'))}</p>
      <label>${esc(t('name'))}<input name="title" maxlength="200" required value="${esc(work.title)}" dir="auto"></label>
      <label>${esc(t('description'))}<textarea name="description" maxlength="2000"></textarea></label>
      <label>${esc(t('collectionTopic'))}<select name="category">${options(d.categories,category?.id)}</select></label>
      <details class="ml-publisher-create" data-create="channel" ${!category&&channel?'open':''}><summary>${esc(t('newChannel'))}</summary><label><span class="sr-only">${esc(t('newChannel'))}</span><input name="newCategory" maxlength="200" dir="auto" value="${esc(category?'':channel?.title||'')}"></label></details>
      <label>${esc(t('collection'))}<select name="collection">${options(d.collections,collection?.id)}</select></label>
      <details class="ml-publisher-create" data-create="series" ${!collection&&series?'open':''}><summary>${esc(t('newSeries'))}</summary><label><span class="sr-only">${esc(t('newSeries'))}</span><input name="newCollection" maxlength="200" dir="auto" value="${esc(collection?'':series?.title||'')}"></label></details>
      <label class="ml-checkbox"><input type="checkbox" name="rights" required>${esc(t('publicationRights'))}</label>
      <label class="ml-checkbox"><input type="checkbox" name="download">${esc(t('allowPackageDownload'))}</label>
      ${formActions(t('preparePublication'))}`,async data=>{
        if(!destination){
          let next=ctx.structure(),category=data.get('category'),collection=data.get('collection');
          if(data.get('newCategory').trim()){category='m_'+crypto.randomUUID().replaceAll('-','');next=C.command(next,{type:'category.create',id:category,title:data.get('newCategory').trim()});}
          if(!category)throw new Error('DESTINATION_REQUIRED');
          if(data.get('newCollection').trim()){collection='m_'+crypto.randomUUID().replaceAll('-','');next=C.command(next,{type:'collection.create',id:collection,title:data.get('newCollection').trim(),categoryId:category});}
          const series=next.collections.find(c=>c.id===collection);
          if(series?.categoryId&&series.categoryId!==category)throw new Error('MATERIAL_TOPIC_MISMATCH');
          if(series&&!series.categoryId)next=C.command(next,{type:'collection.update',...series,categoryId:category});
          await ctx.save(next);
          destination={category,collection,title:data.get('title').trim(),description:data.get('description').trim(),download:data.has('download'),creator:next.categories.find(c=>c.id===category).title};
        }
        // Retried canonical writes must use the same reviewed input and rights.
        // Keep those values visible and fixed once preparation has started.
        document.querySelectorAll('#ml-form input,#ml-form select,#ml-form textarea').forEach(node=>{node.disabled=true;});
        if(!corpus){
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(destination.category));
          const slug='media-'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('').slice(0,20);
          const list=await api('/api/publication/corpora');corpus=list.corpora.find(c=>c.slug===slug);
          if(!corpus)corpus=await once('create','/api/publication/corpora',{slug,title:destination.creator,description:''});
          corpus.slug=slug;
        }
        const base='/api/publication/corpora/'+corpus.corpus_id;
        if(!detail){detail=(await api(base)).corpus;if(!detail.draft){await once('revision',base+'/draft:new-revision',{});detail=(await api(base)).corpus;}}
        if(!copied){
          if(detail.items.some(i=>i.source_work_id==='archive_'+work.contentRoot))throw new Error('SOURCE_ALREADY_COPIED');
          copied=await once('copy',base+'/draft/material-archive',{token:work.token,title:destination.title,description:destination.description,creator:destination.creator,expectedVersion:detail.draft.version});
        }
        if(!rights){const date=new Date().toISOString().slice(0,10);rights=await once('rights',base+'/draft/material-rights',{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:destination.download,basis:'OWNER_ATTESTATION_MEDIA_'+date.replaceAll('-','_'),asserted_at:date}});}
        const validation=await api(base+'/draft:validate',{expectedVersion:rights.draft_version});
        if(!validation.ready)throw new Error(validation.blockers[0]?.code||'SOURCE_SNAPSHOT_INVALID');
        const ready=(await api(base)).corpus;
        showDialog(t('previewTitle'),`${publisherStep(t,esc,3)}<p>${esc(t('publicationPreviewHelp'))}</p><h3 dir="auto">${esc(destination.creator)}</h3><ul>${ready.items.map(i=>`<li dir="auto">${esc(i.title)}</li>`).join('')}</ul><p>${esc(t('publicationStorageHelp'))}</p>${formActions(t('publish'))}`,async()=>{
          if(!receipt)receipt=await once('publish',base+':publish',{expectedVersion:rights.draft_version});
          await ctx.reloadPublic();
          const items=ctx.publicItems().filter(i=>i.ref.slug===corpus.slug);
          const targetId=copied.items[0].source_work_id;
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('MY_TEXTS:local:'+targetId));
          const workId='work-'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
          const item=items.find(i=>i.ref.workId===workId);if(!item)throw new Error('SOURCE_SNAPSHOT_INVALID');
          await ctx.reloadDraft();
          let next=C.command(ctx.structure(),{type:'items.add',target:'category',id:destination.category,references:[item.ref]},{publicOnly:true});
          if(destination.collection)next=C.command(next,{type:'items.add',target:'collection',id:destination.collection,references:[item.ref]},{publicOnly:true});
          await ctx.save(next);
          ctx.finish(); // Structure has its own existing preview/publish, never publishes unrelated draft edits.
        });
      });
    const form=document.querySelector('#ml-form'),categorySelect=form.elements.category,collectionSelect=form.elements.collection;
    const syncDestination=()=>{
      const newCategory=form.elements.newCategory.value.trim();
      categorySelect.disabled=!!newCategory;
      const selected=collectionSelect.value;
      const candidates=d.collections.filter(c=>!c.categoryId||(!newCategory&&c.categoryId===categorySelect.value));
      collectionSelect.innerHTML=options(candidates,selected);
      collectionSelect.disabled=!!form.elements.newCollection.value.trim();
    };
    categorySelect.addEventListener('change',syncDestination);
    form.elements.newCategory.addEventListener('input',syncDestination);
    form.elements.newCollection.addEventListener('input',syncDestination);
    syncDestination();
  }
}
