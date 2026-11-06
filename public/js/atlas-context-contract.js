/* Prepared atlas context is a versioned answer, never an implicit completeness certificate. */
(function(root){
  'use strict';
  const CONTRACT='atlas-context-v2',MAX=120;
  // Reviewed full/defective spelling pairs in the original pointed pilot.
  // This is an explicit list, not a rule that drops arbitrary vav/yod letters.
  const ORTHOGRAPHIC_PAIRS=new Set(["אופקי\u0001אפקי", "אורך\u0001ארך", "בכיוון\u0001בכוון", "בכיוונה\u0001בכוונה", "בעוצמתה\u0001בעצמתה", "בעוצמתו\u0001בעצמתו", "בשיווי\u0001בשווי", "גודל\u0001גדל", "האופקי\u0001האפקי", "החומר״\u0001החמר״", "הכובד\u0001הכבד", "המופעל\u0001המפעל", "הפעולה\u0001הפעלה", "השווה\u0001השוה", "וחיסור\u0001וחסור", "ומסומן\u0001ומסמן", "ושווה\u0001ושוה", "זווית\u0001זוית", "חומר\u0001חמר", "חוק\u0001חק", "חוקי\u0001חקי", "חוקים\u0001חקים", "חיבור\u0001חבור", "יוגדר\u0001יגדר", "כיוון\u0001כוון", "כיוונו\u0001כוונו", "לאורך\u0001לארך", "לבחון\u0001לבחן", "לעוצמת\u0001לעצמת", "לשינוי\u0001לשנוי", "מאפייני\u0001מאפיני", "מושגי\u0001משגי", "מידה\u0001מדה", "מידותיו\u0001מדותיו", "מכוון\u0001מכון", "מנוגד\u0001מנגד", "מסוים\u0001מסים", "ניצב\u0001נצב", "נקודת\u0001נקדת", "פירוק\u0001פרוק", "פעולה\u0001פעלה", "פעולת\u0001פעלת", "צוין\u0001צין", "קווי\u0001קוי", "קיימת\u0001קימת", "שווה\u0001שוה", "שינוי\u0001שנוי", "שעוצמתו\u0001שעצמתו", "״חוק\u0001״חק"]);
  const bare=s=>String(s).normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'').normalize('NFC');
  function aligned(row,p,AI){
    const plain=AI.rowPayloadFromData(Object.assign({},row,{he_niqqud:'',hebrew_niqqud:'',meta_json:null,meta:null}));
    const a=plain?plain.words.map(w=>bare(w.w)):[],b=p?p.words.map(w=>bare(w.w)):[];
    if(a.length!==b.length||a.some((w,i)=>w!==b[i]&&!ORTHOGRAPHIC_PAIRS.has(w+'\u0001'+b[i])))
      throw new Error('Atlas source/niqqud alignment mismatch: '+String(row.id)+' ('+a.length+'/'+b.length+')');
  }
  function describe(rows,AI){
    return (rows||[]).flatMap(row=>{const p=AI.rowPayloadFromData(row);aligned(row,p,AI);return p?[{
      id:String(row.id),order_index:row.order_index,key:p.key,words:p.words.map(w=>w.w),
      he:row.he||'',he_niqqud:row.he_niqqud||'',ru:row.ru||'',row_type:row.row_type||'block',source_context:row.source_context||null
    }]:[];});
  }
  async function revision(rows){
    const canonical=JSON.stringify((rows||[]).map(r=>[r.id,r.order_index,r.key,r.he,r.he_niqqud,r.ru,r.source_context]));
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function validate(layer,expected,options){
    const opt=options||{},errors=[],accepted=[],seenOrder=new Set(),seenIdentity=new Set();
    const byOrder=new Map((expected||[]).map(r=>[r.order_index,r]));
    const fail=(code,row)=>errors.push({code,order_index:row&&row.order_index,row_id:row&&(row.row_id||row.block_id)});
    if(!layer||layer.schema!=='word-gloss-ai-layer-v1'||layer.contract!==CONTRACT)fail('schema_contract');
    if(!layer||layer.atlas!==opt.atlas||layer.section!==opt.section)fail('source_identity');
    if(!layer||!opt.revision||layer.source_revision!==opt.revision)fail('source_revision');
    const prov=layer&&layer.provenance;
    if(!prov||prov.kind!=='prepared_ai'||!String(prov.producer||'').trim()||!String(prov.review_scope||'').trim())fail('provenance');
    const partial=!!(layer&&layer.coverage_mode==='partial');
    if(!layer||!['complete','partial'].includes(layer.coverage_mode))fail('coverage_mode');
    if(partial&&!opt.allowPartial)fail('partial_not_authorized');
    const rows=layer&&Array.isArray(layer.rows)?layer.rows:[];
    if(!layer||!Array.isArray(layer.rows))fail('rows');
    function russian(gloss,row,entry){
      if(typeof gloss!=='string'||!gloss.trim()||gloss.length>MAX||/[\u05d0-\u05ea]/.test(gloss))return false;
      if(gloss.trim()==='?'&&!(entry&&entry.uncertain===true&&String(entry.reason||'').trim()))return false;
      return true;
    }
    for(const row of rows){
      const ref=row&&byOrder.get(row.order_index),id=row&&(row.row_id||row.block_id);
      let valid=true;const reject=code=>{fail(code,row);valid=false;};
      if(!row||!Number.isInteger(row.order_index)||!ref){reject('unknown_order');continue;}
      if(seenOrder.has(row.order_index))reject('duplicate_order');seenOrder.add(row.order_index);
      const identity=String(id)+'\u0001'+String(row.key);
      if(seenIdentity.has(identity))reject('duplicate_row_key');seenIdentity.add(identity);
      if(id!==ref.id||row.key!==ref.key)reject('row_identity_key');
      if(!String(row.model||'').trim())reject('model');
      if(!Array.isArray(row.glosses)||row.glosses.length!==ref.words.length)reject('gloss_count');
      else row.glosses.forEach(g=>{if(!g||!russian(g.gloss,row,g)||(g.manual!==undefined&&g.manual!==false)||(g.wrong_hint!==undefined&&typeof g.wrong_hint!=='boolean')||(g.uncertain!==undefined&&typeof g.uncertain!=='boolean')||(g.uncertain&&(typeof g.reason!=='string'||!g.reason.trim())))reject('russian_gloss');});
      if(!Array.isArray(row.mwe))reject('mwe_array');
      else row.mwe.forEach(m=>{if(!m||!Number.isInteger(m.from)||!Number.isInteger(m.to)||m.from<0||m.to<m.from||m.to>=ref.words.length||!russian(m.gloss,row,m)||(m.manual!==undefined&&m.manual!==false)||(m.uncertain!==undefined&&typeof m.uncertain!=='boolean')||(m.uncertain&&(typeof m.reason!=='string'||!m.reason.trim())))reject('mwe');});
      if(valid)accepted.push(row);
    }
    const covered=new Set(accepted.map(r=>r.order_index)),missing=(expected||[]).filter(r=>!covered.has(r.order_index)).map(r=>({row_id:r.id,order_index:r.order_index}));
    if(!partial&&missing.length)fail('incomplete');
    return {ok:errors.length===0,complete:errors.length===0&&!partial&&!missing.length,
      coverage_mode:partial?'partial':'complete',expected:(expected||[]).length,accepted:accepted.length,missing,errors,rows:accepted};
  }
  function uncertaintyMap(rows){
    const notes=new Map();
    function add(id,i,reason){const key=id+':'+i,prior=notes.get(key)||[];if(!prior.includes(reason))prior.push(reason);notes.set(key,prior);}
    (rows||[]).forEach(row=>{const id=row.row_id||row.block_id;
      row.glosses.forEach((g,i)=>{if(g.uncertain===true)add(id,i,g.reason);});
      row.mwe.forEach(m=>{if(m.uncertain===true)for(let i=m.from;i<=m.to;i++)add(id,i,m.reason);});
    });
    return new Map([...notes].map(([key,reasons])=>[key,reasons.join('\n')]));
  }
  const api={CONTRACT,describe,revision,validate,uncertaintyMap};root.AtlasContextContract=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
