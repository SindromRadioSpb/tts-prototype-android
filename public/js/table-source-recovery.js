(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TableSourceRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='adjacent-hebrew-echo-v1';
  const plain=v=>String(v||'').normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g,'').replace(/\s+/g,' ').trim();
  // Source comes from the request/transcript, NEVER the model's echoed segments.
  // One inserted adjacent Hebrew letter only; no fuzzy matching, substitutions,
  // lost words, numbers, or reordered rows. Short ambiguous utterances stay blocked.
  function duplicateIndex(source,echo){
    const a=plain(source),b=plain(echo);
    if(a.length<20||b.length!==a.length+1)return -1;
    for(let i=1;i<b.length;i++){
      if(/[א-ת]/.test(b[i])&&b[i]===b[i-1]&&b.slice(0,i)+b.slice(i+1)===a)return i;
    }
    return -1;
  }
  function recoverRow(row,source){
    const index=duplicateIndex(source,row.he);
    if(index<0)return null;
    const echo=plain(row.he),vocalized=String(row.he_niqqud||'').normalize('NFD').replace(/\s+/g,' ').trim();
    const clusters=vocalized.match(/[^\p{M}]\p{M}*/gu)||[];
    let niqqud='';
    // Removing different vowels would guess a reading. Only identical adjacent
    // graphemes over an otherwise exact echo can be repaired without a provider.
    if(plain(vocalized)===echo&&clusters[index]===clusters[index-1]){
      clusters.splice(index,1);niqqud=clusters.join('').normalize('NFC');
    }
    const next={...row,he:String(source).trim(),he_niqqud:niqqud,translit:'',
      source_recovery:{version:VERSION,original:JSON.parse(JSON.stringify(row)),translit_status:'pending'}};
    if('translit_ru' in row)next.translit_ru='';
    if(!niqqud)next.niqqud_status='not_vocalized';
    return next;
  }
  return {VERSION,plain,duplicateIndex,recoverRow};
});
