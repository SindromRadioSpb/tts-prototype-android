const fs=require("fs"), zlib=require("zlib");
const strip=s=>String(s||"").replace(/[֑-ׇ]/g,"").trim();
const PROC=new Set(["ה","ו","ב","ל","כ","מ","ש"]);
const finalMap={"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"};
const f2m=s=>s.split("").map(c=>finalMap[c]||c).join("");

// 1) Pealim known-form set (the "dictionary" — owner's "compare with Pealim")
const ds=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/inflection/pealim-infl-v12.json.gz")).toString("utf8"));
const known=new Set();
for(const p of ds.paradigms){
  for(const k of [p.lemma_niqqud,p.lemma]) if(k) known.add(f2m(strip(k)));
  if(p.cells) for(const c of Object.values(p.cells)) if(c&&c.he) known.add(f2m(strip(c.he)));
}
console.log("Pealim known surface forms:", known.size);
const isWord=w=>known.has(f2m(w));

// 2) Dicta silver: per-token proclitic = leading chars of word removed to reach stem
const cache=JSON.parse(fs.readFileSync(".tmp/benyehuda/reader-morph-audit-dicta-cache.json","utf8"));
function silverProc(word,stem){
  word=f2m(strip(word)); stem=f2m(strip(stem));
  if(!word||!stem||word===stem) return "";          // no proclitic
  // strip leading proclitic letters from word until we reach stem
  let i=0; while(i<word.length && word[i]!==stem[0] && PROC.has(word[i])) i++;
  const pre=word.slice(0,i);
  // accept only if remainder starts like the stem (avoid coincidence)
  if(pre && word.slice(i).startsWith(stem.slice(0,Math.min(2,stem.length)))) return pre;
  // fallback: word endsWith stem and the removed prefix is all-proclitic
  if(word.endsWith(stem) && [...word.slice(0,word.length-stem.length)].every(c=>PROC.has(c))) return word.slice(0,word.length-stem.length);
  return "?";  // differs but not a clean proclitic strip (inflectional)
}

// 3) Offline heuristic (dict-lookup): predict proclitic for a word
function offlineProc(word){
  const w=f2m(strip(word));
  if(w.length<2 || !PROC.has(w[0])) return {p:"",conf:"none"};
  const wKnown=isWord(w), stem=w.slice(1), sKnown=isWord(stem);
  if(wKnown && sKnown) return {p:"",conf:"ambig-prefer-word"};   // both words → do-no-harm: no proclitic
  if(!wKnown && sKnown) return {p:w[0],conf:"confident"};         // whole unknown, stem known → proclitic
  if(wKnown && !sKnown) return {p:"",conf:"whole-word"};          // it's the word (בית)
  return {p:"",conf:"neither-unknown"};                           // can't tell offline
}

// 4) Measure
let tp=0,fp=0,fn=0,tn=0, total=0, silverProcCount=0;
const fps=[], fns=[];
const seen=new Set();
for(const sent of Object.values(cache)){
  for(const t of sent){
    const w=f2m(strip(t.word)); if(!w||w.length<2||!PROC.has(w[0])) continue;
    if(seen.has(w)) continue; seen.add(w);    // dedupe by surface
    total++;
    const sil=silverProc(t.word,t.stem); const silHas = sil && sil!=="?";
    if(silHas) silverProcCount++;
    const off=offlineProc(t.word); const offHas=!!off.p;
    if(silHas && offHas) { if(sil[0]===off.p) tp++; else {fp++; fns.push(w+" sil="+sil+" off="+off.p);} }
    else if(silHas && !offHas) { fn++; if(fns.length<25) fns.push("MISS "+w+" sil="+sil+" ("+off.conf+")"); }
    else if(!silHas && offHas) { fp++; if(fps.length<25) fps.push("FP "+w+" off="+off.p+" (Dicta:no-proc, stem="+f2m(strip(t.stem))+")"); }
    else tn++;
  }
}
console.log("\nunique proclitic-initial surfaces:", total, "| Dicta-silver has proclitic:", silverProcCount);
console.log("offline heuristic vs Dicta-silver:");
console.log("  TP (both, same proclitic):", tp);
console.log("  FP (offline says proclitic, Dicta says NO / different):", fp, "← REGRESSION RISK (the בית class)");
console.log("  FN (Dicta says proclitic, offline misses):", fn, "← coverage gap (safe, do-no-harm)");
console.log("  TN (both say no proclitic):", tn);
const prec=tp/(tp+fp)||0, rec=tp/(tp+fn)||0;
console.log("  PRECISION:", (100*prec).toFixed(1)+"%", "| RECALL:", (100*rec).toFixed(1)+"%");
console.log("\n--- FALSE POSITIVES (must be ~0 for do-no-harm) ---"); fps.slice(0,15).forEach(x=>console.log("  "+x));
console.log("\n--- sample MISSES (coverage gap) ---"); fns.slice(0,10).forEach(x=>console.log("  "+x));
