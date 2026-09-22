(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./mediatheque-core.js'):root.MediathequeCore);if(typeof module==='object'&&module.exports)module.exports=api;root.MediathequeEditorial=api;})(globalThis,function(C){
  'use strict';
  function applySeed(structure, seed, materials) {
    if(seed?.schema!=='mediatheque-editorial-seed-v1')throw new Error('MEDIATHEQUE_INVALID');
    let d=C.validate(structure,{publicOnly:true});
    const categoryIds=new Map(), collectionIds=new Map();
    for(const channel of seed.channels){
      const existing=d.categories.find(c=>c.id===channel.id)||d.categories.find(c=>!c.parentId&&C.normalize(c.title)===C.normalize(channel.title));
      const id=existing?.id||channel.id;categoryIds.set(channel.id,id);
      if(!existing)d=C.command(d,{type:'category.create',id,title:channel.title,description:channel.url},{publicOnly:true});
    }
    for(const series of seed.collections){
      const categoryId=categoryIds.get(series.categoryId);
      const existing=d.collections.find(c=>c.id===series.id)||d.collections.find(c=>c.categoryId===categoryId&&C.normalize(c.title)===C.normalize(series.title));
      const id=existing?.id||series.id;collectionIds.set(series.id,id);
      if(!existing)d=C.command(d,{type:'collection.create',id,title:series.title,description:series.sourceUrl||'',categoryId},{publicOnly:true});
    }
    for(const video of seed.videos){
      const refs=materials.filter(m=>m.ref?.kind==='public'&&m.available!==false&&m.videoId===video.videoId).map(m=>m.ref);
      if(refs.length)d=C.command(d,{type:'items.add',target:'collection',id:collectionIds.get(video.collectionId),references:refs},{publicOnly:true});
    }
    return d;
  }
  return Object.freeze({applySeed});
});
