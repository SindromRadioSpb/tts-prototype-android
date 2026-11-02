/* Atlas search: same implementation in Node and browser. Russian stemming follows
 * Snowball Russian (https://snowballstem.org/algorithms/russian/stemmer.html).
 * Original implementation below; Snowball algorithm distributed under BSD-3-Clause. */
(function(root){
'use strict';
var F=typeof module==='object'&&module.exports?require('./corpus-fts.js'):root.CorpusFTS;
function stemRu(w){
 w=w.toLowerCase().replace(/ё/g,'е');var m=/^(.*?[аеиоуыэюя])(.*)$/.exec(w);if(!m)return w;
 var pre=m[1],r=m[2],r1=w.search(/[аеиоуыэюя][^аеиоуыэюя]/)+2,r2=w.slice(r1).search(/[аеиоуыэюя][^аеиоуыэюя]/);r2=r2<0?w.length:r1+r2+2;
 var old=r;r=r.replace(/(?:ив|ивши|ившись|ыв|ывши|ывшись|(?<=[ая])в|(?<=[ая])вши|(?<=[ая])вшись)$/,'');
 if(r===old){r=r.replace(/с[яь]$/,'');old=r;r=r.replace(/(?:ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/,'');
 if(r!==old)r=r.replace(/(?:ивш|ывш|ующ|(?<=[ая])ем|(?<=[ая])нн|(?<=[ая])вш|(?<=[ая])ющ|(?<=[ая])щ)$/,'');
 else{old=r;r=r.replace(/(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю|(?<=[ая])ла|(?<=[ая])на|(?<=[ая])ете|(?<=[ая])йте|(?<=[ая])ли|(?<=[ая])й|(?<=[ая])л|(?<=[ая])ем|(?<=[ая])н|(?<=[ая])ло|(?<=[ая])но|(?<=[ая])ет|(?<=[ая])ют|(?<=[ая])ны|(?<=[ая])ть|(?<=[ая])ешь|(?<=[ая])нно)$/,'');
 if(old===r)r=r.replace(/(?:иями|ями|ами|ией|иям|ием|иях|ев|ов|ие|ье|еи|ии|ей|ой|ий|ям|ем|ам|ом|ах|ях|ию|ью|ия|ья|а|е|и|й|о|у|ы|ь|ю|я)$/,'');}}
 r=r.replace(/и$/,'');w=pre+r;var d=/(ость|ост)$/.exec(w);if(d&&d.index>=r2)w=w.slice(0,d.index);
 if(/нн$/.test(w))return w.slice(0,-1);if(/ь$/.test(w))return w.slice(0,-1);return w.replace(/ейше?$/,'').replace(/нн$/,'н');
}
function normalize(s){return String(s||'').normalize('NFC').replace(/[֑-ׇ]/g,'').replace(/[׳’']/g,"'").replace(/[״“”]/g,'"').replace(/־/g,' ').toLowerCase().replace(/ё/g,'е');}
function tokens(s){return (normalize(s).match(/[א-ת]+(?:["'][א-ת]+)*|[а-я]+|[a-z0-9]+/g)||[]).map(function(t){return /[א-ת]/.test(t)?F.normalizeToken(t):t;});}
var greek={sigma:'σ',сигма:'σ',tau:'τ',тау:'τ',alpha:'α',альфа:'α',beta:'β',бета:'β',gamma:'γ',гамма:'γ',delta:'δ',дельта:'δ',phi:'φ',varphi:'φ',фи:'φ',pi:'π',пи:'π',omega:'ω',омега:'ω',eta:'η',эта:'η',theta:'θ',тета:'θ',lambda:'λ',лямбда:'λ',mu:'μ',мю:'μ',nu:'ν',xi:'ξ',rho:'ρ',ро:'ρ',epsilon:'ε',varepsilon:'ε'};
function symbolKey(s){return String(s||'').replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g,'$1').replace(/\\?([a-zа-я]+)(?=[_\s{]|$)/gi,function(a,b){return greek[b]||a;}).replace(/[₀-₉]/g,function(c){return String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c));}).replace(/ϕ/g,'φ').replace(/[\\{}_\s]/g,'');}
var units=[['N·mm','N*mm','Н·мм','Нмм'],['rpm','об/мин','1/min','min⁻¹'],['mm²','mm^2','мм²'],['mm','мм','מ"מ'],['N/mm','Н/мм'],['MPa','МПа'],['N','Н','ניוטון']];
function unitKey(s){s=String(s||'').replace(/\s/g,'');for(var g of units)if(g.includes(s))return g[0];return s;}
function buildIndex(sections){
 var docs=[],post=Object.create(null),terms=Object.create(null),R=typeof module==='object'&&module.exports?require('./atlas-reader.js'):root.AtlasReader,clean=R.factory({}).cleanMeta;
 function add(kind,sid,page,ref,he,ru,extra){if(!ref)return;he=clean(he);ru=clean(ru);var n=docs.length;docs.push([kind,sid,page,ref,he.slice(0,30),ru.slice(0,30)]);
 var keys=new Set();tokens([he,ru,extra||''].join(' ')).forEach(function(t){keys.add(t);if(/[а-я]/.test(t))keys.add('~'+stemRu(t));});
 if(kind==='symbol'||kind==='formula'){String(extra||'').split('|').forEach(function(x){if(x&&x.length<30){keys.add('@'+symbolKey(x));keys.add('#'+unitKey(x));}});}
 keys.forEach(function(k){(post[k]||(post[k]=[])).push(n);});
 }
 sections.forEach(function(s){(s.pages||[]).forEach(function(p){(p.items||[]).forEach(function(i){add(i.type,s.id,p.page,i.id,i.he,i.ru,[i.translit,i.translit_ru,i.latex,i.result_var].join('|'));
 (i.vars||[]).forEach(function(v){add('symbol',s.id,p.page,v.ref||i.id,v.he,v.ru,[v.latex,v.unit].join('|'));});
 (i.terms||[]).forEach(function(t){t=t.split('#')[0];if(!terms[t])terms[t]=[];terms[t].push([s.id,p.page,i.id]);});});
 (p.tables||[]).forEach(function(t){add('table',s.id,p.page,t.id,(t.cells||[]).map(c=>c.he||'').join(' '),(t.cells||[]).map(c=>clean(c.ru)).join(' '));});
 (p.figures||[]).forEach(function(f){add('figure',s.id,p.page,f.id,[f.caption_he].concat((f.regions||[]).map(r=>r.label_he)).join(' '),[clean(f.caption_ru)].concat((f.regions||[]).map(r=>clean(r.label_ru))).join(' '));});
 (p.errata||[]).forEach(function(e){add('erratum',s.id,p.page,e.target||e.id,e.as_printed,e.explanation_ru,e.proposed);});
 (p.examples||[]).forEach(function(e){add('example',s.id,p.page,e.id,e.title_he,e.title_ru,(e.steps||[]).map(x=>[x.he,x.ru].join(' ')).join(' '));});
 });});
 var seen=new Set();sections.forEach(function(s){Object.keys(s.terms||{}).forEach(function(id){if(seen.has(id))return;seen.add(id);var t=s.terms[id],places=terms[id]||[];if(!places.length)return;var a=places[0];add('term',a[0],a[1],a[2],t.lemma_he,(t.senses||[]).map(x=>x.ru).join('; '),[t.translit,t.translit_ru].join(' '));docs[docs.length-1].push(places);});});
 return {schema:'linguistpro.atlas-search.1',docs:docs,post:post};
}
function candidates(ix,t){var out=[[t,3]];if(/[а-я]/.test(t))out.push(['~'+stemRu(t),2]);if(/[א-ת]/.test(t))for(var i=1;i<=3&&i<t.length-1;i++){if(!/^[והבכלמש]+$/.test(t.slice(0,i)))break;var x=t.slice(i);if(ix.post[x])out.push([x,2]);}return out;}
var groups=['term','symbol','formula','block','table','figure','example','erratum'];
function query(ix,q,opts){opts=opts||{};if(!q.trim())return [];var ts=tokens(q),score=new Map(),special=['@'+symbolKey(q),'#'+unitKey(q)];
 function collect(keys){var one=new Map();keys.forEach(function(k){(ix.post[k[0]]||[]).forEach(function(n){one.set(n,Math.max(one.get(n)||0,k[1]));});});one.forEach(function(v,n){var a=score.get(n)||[0,0];score.set(n,[a[0]+1,a[1]+v]);});}
 ts.forEach(t=>collect(candidates(ix,t)));collect(special.map(x=>[x,10]));var phrase=/^".*"$/.test(q);
 return Array.from(score).filter(function(e){var d=ix.docs[e[0]];return (!opts.sid||opts.scope!=='section'||d[1]===opts.sid)&&(!phrase||tokens(d[4]+' '+d[5]).join(' ').includes(ts.join(' ')));}).map(function(e){var d=ix.docs[e[0]];return {kind:d[0],sid:d[1],page:d[2],ref:d[3],he:d[4],ru:d[5],places:d[6]||null,score:e[1][1],matched:e[1][0],order:e[0]};}).sort(function(a,b){return groups.indexOf(a.kind)-groups.indexOf(b.kind)||b.matched-a.matched||b.score-a.score||a.page-b.page||a.order-b.order;});
}
function fragment(ix,text){var ts=tokens(text),scores=new Map();ix.docs.forEach(function(d){if(d[0]!=='term')return;var tt=tokens(d[4]);if(!tt.length||!tt.every(t=>ts.some(x=>candidates(ix,x).some(k=>k[0]===t))))return;(d[6]||[]).forEach(function(p){var k=p[0]+':'+p[1],r=scores.get(k)||{kind:'block',sid:p[0],page:p[1],ref:p[2],he:'',ru:'',terms:[],score:0};if(!r.terms.includes(d[4])){r.terms.push(d[4]);r.score+=Math.log(1+ix.docs.length/(d[6].length||1));r.he=r.terms.join(' · ');}scores.set(k,r);});});return Array.from(scores.values()).sort((a,b)=>b.score-a.score||a.page-b.page);}
function pack(ix){
 var ids=[];ix.docs=ix.docs.map(function(d){var n=ids.indexOf(d[1]);if(n<0){n=ids.length;ids.push(d[1]);}var row=[groups.indexOf(d[0]),n,d[2],d[3].startsWith('a97002:p'+d[2]+':')?d[3].slice(('a97002:p'+d[2]+':').length):'='+d[3],d[4],d[5]];if(d[6])row.push(d[6].map(function(p){var si=ids.indexOf(p[0]);if(si<0){si=ids.length;ids.push(p[0]);}return si.toString(36)+','+p[1].toString(36)+','+(p[2].startsWith('a97002:p'+p[1]+':')?p[2].slice(('a97002:p'+p[1]+':').length):'='+p[2]);}).join(';'));return row;});ix.sids=ids;
 var pool=[],seen=new Map(),keys=Object.keys(ix.post).sort(),prev='';ix.entries=keys.map(function(k){var last=0,v=ix.post[k].map(function(n){var delta=n-last;last=n;var out='';do{var v=delta%44;delta=Math.floor(delta/44);var c=35+v+(delta?44:0);if(c>=92)c++;out+=String.fromCharCode(c);}while(delta);return out;}).join(''),id=seen.get(v);if(id===undefined){id=pool.length;pool.push(v);seen.set(v,id);}var n=0;while(n<k.length&&k[n]===prev[n])n++;var row=n.toString(36)+','+k.slice(n)+','+id.toString(36);prev=k;return row;});ix.pool=pool;delete ix.post;ix.packed=true;return ix;
}
function decode(s){var out=[],n=0,v=0,m=1;for(var c of s){var k=c.charCodeAt(0);if(k>92)k--;k-=35;v+=(k%44)*m;if(k<44){n+=v;out.push(n);v=0;m=1;}else m*=44;}return out;}
function unpack(ix){if(!ix.packed)return ix;ix.docs=ix.docs.map(function(d){return [groups[d[0]],ix.sids[d[1]],d[2],d[3][0]==='='?d[3].slice(1):'a97002:p'+d[2]+':'+d[3],d[4],d[5],d[6]?d[6].split(';').map(function(p){var a=p.split(','),page=parseInt(a[1],36);return [ix.sids[parseInt(a[0],36)],page,a[2][0]==='='?a[2].slice(1):'a97002:p'+page+':'+a[2]];}):null];});ix.post=Object.create(null);var prev='';ix.entries.forEach(function(e){var a=e.indexOf(','),b=e.lastIndexOf(','),k=prev.slice(0,parseInt(e.slice(0,a),36))+e.slice(a+1,b),n=0;ix.post[k]=decode(ix.pool[parseInt(e.slice(b+1),36)]);prev=k;});delete ix.entries;delete ix.pool;ix.packed=false;return ix;}
var api={pack:pack,unpack:unpack,normalize:normalize,tokens:tokens,stemRu:stemRu,symbolKey:symbolKey,unitKey:unitKey,buildIndex:buildIndex,query:query,fragment:fragment};root.AtlasSearch=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
