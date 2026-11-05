(function(root){
  'use strict';
  const VOICE_RE = /^he-IL-Wavenet-[A-D]$/;
  const utf8 = new TextEncoder();
  const byteLength = text => utf8.encode(text).length;

  function profileFor(voiceName){
    return {language:'he-IL',voiceName,speakingRate:1,pitch:0};
  }

  // Call after format validation. Never normalize, strip niqqud, or use plain.
  function speechItems(lesson){
    const voices = new Map((lesson.scene?.roles || []).map(r => [r.id,r.voice]));
    const item = (entry,kind,role,voiceName) => ({
      ref:lesson.id+'/'+entry.id,id:entry.id,kind,role,
      text:entry.he.niqqud,voiceName,bytes:byteLength(entry.he.niqqud)
    });
    return [
      ...(lesson.scene?.turns || []).map(t => item(t,'turn',t.role,
        voices.get(t.role) ?? (t.role === 'staff' ? 'he-IL-Wavenet-C' : 'he-IL-Wavenet-D'))),
      ...(lesson.text?.paras || []).map(p => item(p,'para',null,'he-IL-Wavenet-C'))
    ];
  }

  function checkItems(items){
    const issues=[];
    for(const item of items){
      if(typeof item.voiceName !== 'string' || !VOICE_RE.test(item.voiceName))
        issues.push({level:'error',code:'VOICE_NOT_ALLOWED',ref:item.ref,message:'Допустимы только голоса he-IL-Wavenet-A–D.'});
      if(byteLength(item.text) > 4800)
        issues.push({level:'error',code:'TEXT_TOO_LONG',ref:item.ref,message:'Текст превышает 4800 байт UTF-8.'});
    }
    return issues;
  }

  const api={VOICE_RE,profileFor,speechItems,checkItems};
  root.CourseSpeech=api;
  if(typeof module !== 'undefined' && module.exports)module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);
