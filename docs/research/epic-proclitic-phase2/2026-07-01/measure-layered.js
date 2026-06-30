const fs=require("fs"), zlib=require("zlib");
const strip=s=>String(s||"").replace(/[֑-ׇ]/g,"").trim();
const PROC=new Set(["ה","ו","ב","ל","כ","מ","ש"]);
const finalMap={"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"};
const f2m=s=>s.split("").map(c=>finalMap[c]||c).join("");
const ds=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/inflection/pealim-infl-v12.json.gz")).toString("utf8"));
const known=new Set();
for(const p of ds.paradigms){ for(const k of [p.lemma_niqqud,p.lemma]) if(k) known.add(f2m(strip(k))); if(p.cells) for(const c of Object.values(p.cells)) if(c&&c.he) known.add(f2m(strip(c.he))); }
// extra whole-word lexicons (cheap): NAME_PROPER + FUNCTION_GLOSS + corpus-attested whole tokens
const rm=fs.readFileSync("public/js/reader-morph.js","utf8");
const grab=(re)=>{ const b=(rm.match(re)||[,""])[1]; return (b.match(/"[^"]+"/g)||[]).map(s=>f2m(strip(s.replace(/"/g,"")))); };
const names=grab(/var NAME_PROPER = \{([\s\S]*?)\n  \};/);
const funcs=grab(/var FUNCTION_GLOSS = \{([\s\S]*?)\n  \};/);
const wholeWord=new Set([...known, ...names, ...funcs]);
const cache=JSON.parse(fs.readFileSync(".tmp/benyehuda/reader-morph-audit-dicta-cache.json","utf8"));
// corpus-attested: any surface that Dicta leaves un-segmented (stem===word) is a real whole word
for(const sent of Object.values(cache)) for(const t of sent){ const w=f2m(strip(t.word)), s=f2m(strip(t.stem)); if(w&&w===s) wholeWord.add(w); }
const isWord=w=>wholeWord.has(f2m(w));
const isStemKnown=w=>known.has(f2m(w));  // stem must be a real PEALIM lemma/form (content), stricter
console.log("whole-word lexicon:", wholeWord.size, "| names:", names.length, "| funcs:", funcs.length);

function silverProc(word,stem){ word=f2m(strip(word)); stem=f2m(strip(stem)); if(!word||!stem||word===stem) return ""; let i=0; while(i<word.length&&word[i]!==stem[0]&&PROC.has(word[i]))i++; const pre=word.slice(0,i); if(pre&&word.slice(i).startsWith(stem.slice(0,Math.min(2,stem.length))))return pre; if(word.endsWith(stem)&&[...word.slice(0,word.length-stem.length)].every(c=>PROC.has(c)))return word.slice(0,word.length-stem.length); return "?"; }

// PRECISION-TUNED offline: emit proclitic ONLY if whole NOT a known word AND stem IS a known content form
function offlineProc(word){ const w=f2m(strip(word)); if(w.length<3||!PROC.has(w[0]))return ""; if(isWord(w))return ""; const stem=w.slice(1); if(stem.length>=2 && isStemKnown(stem))return w[0]; return ""; }

let tp=0,fp=0,fn=0,tn=0; const fps=[];
const seen=new Set();
for(const sent of Object.values(cache)) for(const t of sent){ const w=f2m(strip(t.word)); if(!w||w.length<3||!PROC.has(w[0]))continue; if(seen.has(w))continue; seen.add(w);
  const sil=silverProc(t.word,t.stem), silHas=sil&&sil!=="?"; const off=offlineProc(t.word), offHas=!!off;
  if(silHas&&offHas){ if(sil[0]===off)tp++; else {fp++; if(fps.length<20)fps.push("DIFF "+w+" sil="+sil+" off="+off);} }
  else if(silHas&&!offHas)fn++;
  else if(!silHas&&offHas){ fp++; if(fps.length<20)fps.push("FP "+w+" off="+off+" stem="+f2m(strip(t.stem)));}
  else tn++; }
const prec=tp/(tp+fp)||0, rec=tp/(tp+fn)||0;
console.log("\nPRECISION-TUNED offline (whole-word guard + Pealim-stem):");
console.log("  TP",tp,"FP",fp,"FN",fn,"TN",tn);
console.log("  PRECISION:",(100*prec).toFixed(1)+"%  | RECALL:",(100*rec).toFixed(1)+"%");
console.log("\n--- remaining FPs ---"); fps.forEach(x=>console.log("  "+x));
