const fs=require("fs"), zlib=require("zlib");
const NIQQUD=/[֑-ׇ]/g; const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
const stripN=s=>String(s||"").replace(NIQQUD,"").trim();
const f2m=s=>s.split("").map(c=>FINAL[c]||c).join("");
const skel=s=>f2m(stripN(s)).replace(/וו/g,"ו").replace(/יי/g,"י");
const HE_CONS=/[א-ת]/; const PATACH="ַ",QAMATZ="ָ";
function units(nq){const u=[];for(const ch of String(nq||"")){if(HE_CONS.test(ch))u.push({c:ch,m:""});else if(u.length)u[u.length-1].m+=ch;}return u;}

const ds=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/inflection/pealim-infl-v12.json.gz")).toString("utf8"));
const lemmas=new Set(), content=new Set(), names=new Set(), cellVA=new Set(); // verb/adjective cells
for(const p of ds.paradigms){
  const isC=["noun","verb","adjective"].includes(p.pos), isVA=["verb","adjective"].includes(p.pos);
  for(const k of [p.lemma_niqqud,p.lemma]){ if(!k)continue; lemmas.add(skel(k)); if(isC)content.add(skel(k)); }
  if(p.cells)for(const c of Object.values(p.cells)){ if(c&&c.he){ const s=skel(c.he); if(isC)content.add(s); if(isVA)cellVA.add(s); } }
  if(p.pos==="propernoun") names.add(skel(p.lemma_niqqud||p.lemma));
}
const rm=fs.readFileSync("public/js/reader-morph.js","utf8");
const grab=re=>{const b=(rm.match(re)||[,""])[1];return (b.match(/"[^"]+"/g)||[]).map(s=>skel(s.replace(/"/g,"")));};
grab(/var NAME_PROPER = \{([\s\S]*?)\n  \};/).forEach(n=>names.add(n));
const FUNC=new Set(grab(/var FUNCTION_GLOSS = \{([\s\S]*?)\n  \};/));
const FOSSIL=new Set(["באמת","ביחוד","בעיקר","בעצם","בכלל","בערך","בגלל","כמו","כדי","לפי","מפני","בלי","לכן","כאשר","כאילו","למשל","בפועל","בליהרף","כך","ככה","בעבור","למען","כיצד","בלעדי","מלבד","מאחר","מאד","מאוד","בעצמ","כלל","כעבר","כביכול","לכאורה"].map(skel));
const SUBORD=["לכש","כש","מש","ש"]; const PREP=new Set(["ב","ל","כ","מ"]);
// whole-word lexeme guard: a single-morpheme real word → no proclitic.
const isLexeme=w=>lemmas.has(w)||names.has(w)||FUNC.has(w)||cellVA.has(w); // lemmas + names + funcs + verb/adj inflections (mishkal/binyan)
const isContent=w=>content.has(w), isName=w=>names.has(w);

function detect(surface,niqqud){
  const sk=skel(surface), U=units(niqqud);
  if(FOSSIL.has(sk)||FOSSIL.has(stripN(surface))) return {v:"-",r:"fossil"};
  if(isLexeme(sk)) return {v:"-",r:"lexeme"};
  let rest=sk, pre="", ui=0;
  const peel=n=>{pre+=rest.slice(0,n);rest=rest.slice(n);ui+=n;};
  if(rest[0]==="ו"&&rest.length>1){ const r1=rest.slice(1); if(FOSSIL.has(r1)||isLexeme(r1)) return {v:"ו",r:"vav+lex"}; peel(1); }
  for(const u of SUBORD){ if(rest.startsWith(u)&&rest.length>u.length){ peel(u.length); break; } }
  let prepC="",prepIdx=-1;
  if(PREP.has(rest[0])&&rest.length>1){ prepC=rest[0]; prepIdx=ui; peel(1); }
  let artW=false; if(rest[0]==="ה"&&rest.length>1){ peel(1); artW=true; }
  if(!pre) return {v:"-",r:"no-prefix"};
  // residual must be content (≥2). מ-bias: if prep=מ and whole word is a known verb/adj (mishkal) — already caught by isLexeme above.
  if(rest.length<2 || !isContent(rest)) return {v:"-",r:"residual"};
  let fused=""; if(prepC&&!artW&&U[prepIdx]){ const m=U[prepIdx].m||""; if(m.includes(PATACH)||m.includes(QAMATZ)){ pre+="ה"; fused="ה"; } }
  return {v:pre,r:"parse",fused:!!fused};
}

const gold=JSON.parse(fs.readFileSync("docs/research/epic-proclitic-phase2/2026-07-01/gold-frozen.json","utf8")).gold;
let exTP=0,exFP=0,exFN=0,exTN=0,labOK=0,labTot=0; const byCat={},fps=[],labs=[];
for(const g of gold){ const d=detect(g.surface,g.niqqud); const gH=g.has_proclitic,dH=d.v!=="-",cat=g.stratum;
  byCat[cat]=byCat[cat]||{tp:0,fp:0,fn:0,tn:0};
  if(gH&&dH){exTP++;byCat[cat].tp++;labTot++;if(d.v===g.verdict)labOK++;else if(labs.length<22)labs.push(g.surface+" g="+g.verdict+" d="+d.v);}
  else if(!gH&&dH){exFP++;byCat[cat].fp++;if(fps.length<25)fps.push(g.surface+" ("+cat+") d="+d.v+" ["+d.r+"]");}
  else if(gH&&!dH){exFN++;byCat[cat].fn++;}
  else{exTN++;byCat[cat].tn++;}
}
console.log("EXISTENCE prec "+(100*exTP/(exTP+exFP)).toFixed(1)+"% rec "+(100*exTP/(exTP+exFN)).toFixed(1)+"% | TP"+exTP+" FP"+exFP+" FN"+exFN+" TN"+exTN);
console.log("LABELED-SEG "+(100*labOK/labTot).toFixed(1)+"% ("+labOK+"/"+labTot+")");
console.log("per-cat:");for(const c of Object.keys(byCat)){const b=byCat[c];console.log("  "+c.padEnd(16)+"tp"+b.tp+" fp"+b.fp+" fn"+b.fn+" tn"+b.tn);}
console.log("FPs (do-no-harm — target 0):");fps.forEach(e=>console.log("  "+e));
console.log("LABEL errs:");labs.forEach(e=>console.log("  "+e));
