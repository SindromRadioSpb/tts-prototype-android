#!/usr/bin/env node
"use strict";
// Д9.3 — audit of the applied Д8-К3 aliases (spelling key → word key) with the Д9 resolver, by the SAME algorithm the
// plan used (ReaderMorph.planKeyAliases: the pointed forms of the spelling in my texts whose pre-Д8 offline key is the
// source key; the target = the one key all of them get now).
//   keep     — the target is still the one key
//   retarget — every place now gets ONE other word key (Д9 corrected the word)
//   undo     — no single word key any more (split, unparsed: FATAH, a name) — the history goes back to its own key
// node alias-audit.js <corpus.json.gz> <out.json>
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
const DLX = require(path.join(ROOT, "public/js/dicta-lexicon.js"));
global.window = { NotesAutoGen: NA, DictaLexicon: DLX };
const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
const [corpusPath, outPath] = process.argv.slice(2);

(async () => {
  const C = JSON.parse(zlib.gunzipSync(fs.readFileSync(corpusPath)).toString("utf8"));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
  const pidMap = new Map(); ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
  const eng = { NA, maps: NA.buildResolverMaps(ds.paradigms), pidMap, dictaLex: DLX.fromRows(C.lex), lookup: (k, b) => { const i = ds.index[k + " " + (b || "")]; return i != null ? ds.paradigms[i] : null; } };
  // the active alias of each source key = its latest event
  const last = new Map();
  C.alias.slice().sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : 1)).forEach((a) => { let m = {}; try { m = JSON.parse(a.meta_json); } catch (_) {} last.set(a.item_key, m.alias_to); });
  const bySk = new Map();
  for (const [from, to] of last) { if (to === from) continue; const h = from.indexOf("#"), sk = RM.stripNiqqud(h >= 0 ? from.slice(0, h) : from); if (!bySk.has(sk)) bySk.set(sk, []); bySk.get(sk).push({ from, to }); }
  const forms = new Map(), first = new Map();
  for (const row of C.rows) {
    const plain = String(row.p || ""); if (!plain) continue;
    const al = RM.alignSurfaceNiqqud(plain, String(row.n || "")), ws = RM.words(plain);
    for (let wi = 0; wi < ws.length; wi++) {
      const pr = al[wi] || {}, sk = RM.stripNiqqud(pr.surface || ws[wi]);
      if (!bySk.has(sk)) continue;
      if (!forms.has(sk)) forms.set(sk, new Set());
      if (forms.get(sk).size < 12) forms.get(sk).add(pr.niqqud || "");
      const fk = sk + "\u0001" + (pr.niqqud || "");
      if (!first.has(fk)) first.set(fk, { sentence: plain, sentence_n: String(row.n || ""), word: pr.niqqud || sk });
    }
  }
  const out = [], sum = { aliases: 0, keep: 0, retarget: 0, undo: 0, noPlace: 0 };
  for (const [sk, list] of bySk) {
    const fsx = Array.from(forms.get(sk) || []);
    for (const a of list) {
      sum.aliases++;
      const targets = new Set(); let seen = 0, example = null;
      for (const n of fsx) {
        const before = await RM.resolveOffline(eng, sk, n);
        if (RM.statusKeyForCard(NA, before, n, sk) !== a.from) continue;
        seen++;
        const t = RM.statusKeyForCard(NA, await RM.resolveCore(eng, sk, n), n, sk);
        targets.add(/^(pid:|dl:)/.test(t) ? t : ""); (a.targets = a.targets || {})[t || "(none)"] = n;
        if (!example) example = Object.assign({ niqqud: n }, first.get(sk + "\u0001" + n) || {});
      }
      let verdict, now = "";
      if (!seen) { verdict = "keep"; sum.noPlace++; }   // no place to re-read: nothing new to say about it
      else if (targets.size === 1 && Array.from(targets)[0] === a.to) verdict = "keep";
      else if (targets.size === 1 && Array.from(targets)[0]) { verdict = "retarget"; now = Array.from(targets)[0]; }
      else verdict = "undo";
      sum[verdict]++;
      out.push({ from: a.from, to: a.to, now, verdict, places: seen, targets: a.targets || {}, example });
    }
  }
  fs.writeFileSync(outPath, JSON.stringify({ summary: sum, aliases: out }, null, 1));
  console.log(JSON.stringify(sum));
  for (const v of ["retarget", "undo"]) { console.log("==", v); out.filter((x) => x.verdict === v).slice(0, 25).forEach((x) => console.log(" ", x.from.padEnd(18), x.to.padEnd(20), "→", x.now || "(own key)")); }
})();
