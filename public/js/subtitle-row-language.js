(function(root,factory){
  const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SubtitleRowLanguage=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const labels={ru:'Другая речь',en:'Other spoken language',he:'דיבור בשפה אחרת'};
  function markup(row,language){
    let meta=row&&row.translation_meta_json;
    try{if(typeof meta==='string')meta=JSON.parse(meta);}catch(_){return '';}
    if(!meta||meta.provider!=='subtitle-track'||meta.speech_language!=='other')return '';
    const label=labels[language]||labels.ru;
    // Generated label stays out of cell textContent used by table copy/edit paths.
    return '<span class="subtitle-speech-badge" role="img" aria-label="'+label+'" dir="auto" data-speech-language="other" style="display:block;font:500 12px/1.4 system-ui;margin-block-start:4px;opacity:.85"></span>';
  }
  return {markup};
});
