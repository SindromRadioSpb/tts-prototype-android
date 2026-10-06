#!/usr/bin/env node
"use strict";
// Infer only vowel decisions, never words or consonants, from reviewed Pealim
// Hebrew + pronunciation pairs. Exact pointed keys keep homographs separate.
// An ambiguous/non-aligning pair contributes nothing. No provider requests.
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
const R = require("../../public/js/translit-modern-reading.js");
const { Text } = require("hebrew-transliteration");
const ROOT = path.resolve(__dirname, "../..");
const INPUT = path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz");
const OUTPUT = path.join(ROOT, "public/js/hebrew-reading-data.js");
const MARKS = "[\\u0591-\\u05bd\\u05bf\\u05c1\\u05c2\\u05c4\\u05c5\\u05c7]*";
function groups(text) { return text.normalize("NFD").match(new RegExp("[א-ת]" + MARKS, "g")) || []; }
function key(text) { return text.normalize("NFD").replace(/[\u0591-\u05af\u05bd\u05bf\u05c4\u05c5]/g, "").replace(/ׇ/g, "ָ").normalize("NFC"); }
function phonemes(text) {
  return text.toLowerCase().replace(/[hх]/g, "х").replace(/я/g, "йа").replace(/ю/g, "йу").replace(/ё/g, "йо")
    .replace(/[эе]/g, "е").replace(/[ьъ'’]/g, "");
}
const CONSONANTS = { א:"", ב:"в", ג:"г", ד:"д", ה:"х", ו:"в", ז:"з", ח:"х", ט:"т", י:"й", כ:"х", ך:"х", ל:"л", מ:"м", ם:"м", נ:"н", ן:"н", ס:"с", ע:"", פ:"ф", ף:"ф", צ:"ц", ץ:"ц", ק:"к", ר:"р", ש:"ш", ת:"т" };
const VOWELS = { "ֱ":"е", "ֲ":"а", "ֳ":"о", "ִ":"и", "ֵ":"е", "ֶ":"е", "ַ":"а", "ֹ":"о", "ֺ":"о", "ֻ":"у", "ׇ":"о" };
function infer(he, transcription) {
  const units = groups(he), target = phonemes(transcription);
  if (!units.length || !/^[а-я]+$/.test(target)) return null;
  // Decisions encoded at letter positions: e = spoken sheva, o/a = qamats quality.
  let states = [{ at:0, decisions:[] }];
  for (let i=0;i<units.length;i++) {
    const u=units[i], ch=u[0], marks=u.slice(1), prev=units[i-1] || "";
    const vowel=marks.match(/[ֱ-ׇֻ]/)?.[0];
    let c=CONSONANTS[ch] || "";
    if (marks.includes("ּ")) c=({ב:"б",כ:"к",ך:"к",פ:"п",ף:"п"})[ch] ?? c;
    if (ch==="ש" && marks.includes("ׂ")) c="с";
    if (ch==="ה" && i===units.length-1 && !vowel && !marks.includes("ּ")) c="";
    if (ch==="י" && !/[ְ-ׇֻ]/.test(marks) && /[ִֵֶ]/.test(prev)) c="";
    if (ch==="ו" && (marks==="ּ" || (marks.includes("ֹ") && !/[ְ-ׇֻ]/.test(prev)))) c="";
    let opts;
    if (ch==="ו" && marks==="ּ") opts=[["у",null]];
    else if (marks.includes("ְ")) opts=i===units.length-1 ? [["",null]] : [["",[i,"s"]],["е",[i,"e"]]];
    else if (vowel==="ָ") opts=[["а",[i,"a"]],["о",[i,"o"]]];
    else opts=[[VOWELS[vowel] || "",null]];
    const furtive=i===units.length-1 && /[חעה]/.test(ch) && vowel==="ַ" && /[ִֵֶֹֻּ]/.test(prev);
    const next=[];
    for (const state of states) for (const [v,decision] of opts) {
      const sound=furtive ? v+c : c+v;
      if (target.startsWith(sound,state.at)) next.push({at:state.at+sound.length,decisions:decision ? [...state.decisions,decision] : state.decisions});
    }
    states=next;
    if (!states.length || states.length>32) return null;
  }
  const matches=states.filter(s=>s.at===target.length);
  const unique=new Map(matches.map(s=>[JSON.stringify(s.decisions),s.decisions]));
  return unique.size===1 ? [...unique.values()][0] : null;
}
function build(paradigms) {
  const list=paradigms || JSON.parse(zlib.gunzipSync(fs.readFileSync(INPUT))).paradigms;
  const entries=new Map(), conflicts=new Set(); let aligned=0;
  for (const p of list) for (const cell of Object.values(p.cells || {})) {
    const he=String(cell.he || ""), k=key(he);
    if (!/[ְָׇ]/.test(he) || /[^א-ת\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/.test(he)) continue;
    const decisions=infer(he,String(cell.translit || "")); if (!decisions) continue;
    aligned++;
    // Ship only sheva decisions differing from the general modern rules;
    // every qamats decision must be fixed before the heuristic syllable pass.
    const prepared=groups(R.prepare(he,{sheva:true,aleph:false}));
    const classified=groups(new Text(he,{qametsQatan:true}).text);
    const useful=decisions.filter(([i,v])=> v==="a" || v==="o"
      ? (v==="o")!==classified[i]?.includes("ׇ")
      : (v==="e")!==prepared[i]?.includes("ֱ"));
    const value=JSON.stringify(useful);
    if (entries.has(k) && JSON.stringify(entries.get(k))!==value) conflicts.add(k);
    else entries.set(k,useful);
  }
  for(const k of conflicts) entries.delete(k);
  const data=Object.fromEntries([...entries].filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b,"en")));
  return {data,stats:{aligned,conflicts:conflicts.size,entries:Object.keys(data).length}};
}
function render(data) {
  return '// GENERATED from pealim-infl-v12 by scripts/premium/build-hebrew-reading-lexicon.js.\n'+
    '(function(root){var data='+JSON.stringify(data)+';if(typeof module==="object"&&module.exports)module.exports=data;if(root)root.HebrewReadingData=data;})(typeof globalThis!=="undefined"?globalThis:this);\n';
}
module.exports={build,render,infer,key};
if(require.main===module){const result=build(),body=render(result.data);if(process.argv.includes("--check")){if(fs.readFileSync(OUTPUT,"utf8")!==body)throw Error("Reading data is stale");}else fs.writeFileSync(OUTPUT,body);console.log(JSON.stringify({...result.stats,bytes:body.length}));}
