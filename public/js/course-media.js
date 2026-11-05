(function(root){
  'use strict';
  const FRAME_MS=1200;
  function el(doc,tag,attrs={},text){
    const n=doc.createElement(tag);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
    if(text!=null)n.textContent=String(text);
    return n;
  }
  // Words-only card shown when a picture carries task meaning but is missing.
  function fallbackCard(doc,media){
    const card=el(doc,'div',{class:'course-media-fallback','data-media-fallback':''});
    // Icon names stay in the data for a future icon set; empty placeholder boxes would read as broken.
    card.append(el(doc,'p',{},media.fallback?.ru?.ru||media.alt?.ru||''));
    return card;
  }
  // Returns a <figure> for a filled slot, a fallback card for an essential empty slot, or null.
  function figure(media,{base='',doc=root.document,reducedMotion=false,essential=false}={}){
    const files=media.kind==='sequence'&&Array.isArray(media.frames)&&media.frames.length>=2?media.frames:media.src?[media.src]:[];
    const fig=el(doc,'figure',{class:'course-media','data-media':media.id});
    const [w,h]=String(media.aspect||'4:3').split(':');
    fig.setAttribute('style','aspect-ratio: '+w+' / '+h);
    if(!files.length){
      if(!essential)return null;
      fig.removeAttribute('style');
      fig.append(fallbackCard(doc,media));
      return fig;
    }
    const url=f=>base+'media/'+encodeURIComponent(f);
    const img=el(doc,'img',{loading:'lazy',decoding:'async',alt:media.alt?.ru||'',src:url(reducedMotion?files.at(-1):files[0])});
    img.addEventListener('error',()=>{
      if(essential){img.remove();fig.removeAttribute('style');fig.append(fallbackCard(doc,media));}
      else fig.hidden=true;
    });
    fig.append(img);
    if(files.length>1&&!reducedMotion){
      // One pass through the frames, ending on the last: a meaning change, not a loop.
      let i=0;
      const tick=()=>{i++;if(i>=files.length||!img.isConnected&&i>1)return;img.setAttribute('src',url(files[i]));if(i<files.length-1)setTimeout(tick,FRAME_MS);};
      setTimeout(tick,FRAME_MS);
    }
    return fig;
  }
  function prefersReducedMotion(win=root){
    try{return !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}
  }
  const api={figure,fallbackCard,prefersReducedMotion};
  root.CourseMedia=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
