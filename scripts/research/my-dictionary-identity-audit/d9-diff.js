#!/usr/bin/env node
"use strict";
// Д9 impact on the owner's whole corpus: the OLD and the NEW resolveCore side by side on every word of every row
// (the same tokenizer/alignment/joins as scanRows), with the owner's Dicta lexicon. Read-only, offline.
// node d9-diff.js <corpus.json.gz> <old-dir-with-reader-morph.old.js+notes-autogen.old.js> <out.json>
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const [corpusPath, oldDir, outPath] = process.argv.slice(2);

function engineFor(RM, NA, ds, lex) {
  const pidMap = new Map();
  ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
  return { NA, maps: NA.buildResolverMaps(ds.paradigms), pidMap, dictaLex: lex,
    lookup: (k, b) => { const i = ds.index[k + " " + (b || "")]; return i != null ? ds.paradigms[i] : null; } };
}
function load(rmPath, naPath) {
  delete require.cache[require.resolve(rmPath)]; delete require.cache[require.resolve(naPath)];
  const NA = require(naPath);
  global.window = { NotesAutoGen: NA, DictaLexicon: require(path.join(ROOT, "public/js/dicta-lexicon.js")) };
  const RM = require(rmPath);
  return { RM, NA };
}

(async () => {
  const C = JSON.parse(zlib.gunzipSync(fs.readFileSync(corpusPath)).toString("utf8"));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
  const DLX = require(path.join(ROOT, "public/js/dicta-lexicon.js"));
  const lex = DLX.fromRows(C.lex);
  const OLD = load(path.join(oldDir, "reader-morph.old.js"), path.join(oldDir, "notes-autogen.old.js"));
  const oldWin = global.window;
  const NEW = load(path.join(ROOT, "public/js/reader-morph.js"), path.join(ROOT, "public/js/notes-autogen.js"));
  const newWin = global.window;
  const eOld = engineFor(OLD.RM, OLD.NA, ds, lex), eNew = engineFor(NEW.RM, NEW.NA, ds, lex);
  const memo = new Map(), changes = new Map(), byVia = {}, R = NEW.RM;
  let tokens = 0, changed = 0;
  const oldTotal = new Map(), moveTo = new Map();   // old key → its tokens; old key → { new key → tokens }
  for (const row of C.rows) {
    const plain = String(row.p || ""), vocal = String(row.n || "");
    let toks, pairs;
    if (plain) { const al = R.alignSurfaceNiqqud(plain, vocal); let w = 0; toks = R.tokenize(plain); pairs = toks.filter((x) => x.isWord).map((x) => { const a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; }); }
    else { toks = R.tokenize(vocal); pairs = toks.filter((x) => x.isWord).map((x) => [R.stripNiqqud(x.text), x.text]); }
    for (const un of (R.joinSplitWords(toks, pairs) || [])) {
      if (un.fragment) continue;
      tokens++;
      const mk = un.surface + "\u0001" + un.niqqud;
      let m = memo.get(mk);
      if (!m) {
        global.window = oldWin; const co = await OLD.RM.resolveCore(eOld, un.surface, un.niqqud); const ko = OLD.RM.statusKeyForCard(OLD.NA, co, un.niqqud, un.surface);
        global.window = newWin; const cn = await NEW.RM.resolveCore(eNew, un.surface, un.niqqud); const kn = NEW.RM.statusKeyForCard(NEW.NA, cn, un.niqqud, un.surface);
        m = { ko, kn, lo: co && co.label, ln: cn && cn.label, via: (cn && cn.identityVia) || "", lemmaO: co && co.lemma, lemmaN: cn && cn.lemma, meanN: cn && cn.meaning || "", meanO: co && co.meaning || "" };
        memo.set(mk, m);
      }
      if (m.ko) {
        oldTotal.set(m.ko, (oldTotal.get(m.ko) || 0) + 1);
        const mv = moveTo.get(m.ko) || new Map(); mv.set(m.kn || "", (mv.get(m.kn || "") || 0) + 1); moveTo.set(m.ko, mv);
      }
      if (m.ko !== m.kn) {
        changed++;
        byVia[m.via] = (byVia[m.via] || 0) + 1;
        const c = changes.get(mk) || { surface: un.surface, niqqud: un.niqqud, from: m.ko, to: m.kn, via: m.via, lemmaO: m.lemmaO, lemmaN: m.lemmaN, meanO: m.meanO, meanN: m.meanN, n: 0, sentence: plain, sentence_n: vocal };
        c.n++; changes.set(mk, c);
      }
    }
  }
  // marks on keys that lose occurrences / gain them
  const status = new Map(C.ws.map((w) => [w.lemma_key, w.status]));
  const list = Array.from(changes.values()).sort((a, b) => b.n - a.n);
  const markedFrom = list.filter((c) => status.has(c.from)), markedTo = list.filter((c) => status.has(c.to));
  // an old key whose EVERY place now keys to ONE other key moves whole (its marks and history can follow — Д7.2 rule);
  // a key that keeps some places, or splits, stays where it is
  const whole = [], partial = [];
  for (const [ko, mv] of moveTo) {
    if (mv.size === 1 && !mv.has(ko)) { const kn = Array.from(mv.keys())[0]; if (kn) whole.push({ from: ko, to: kn, tokens: oldTotal.get(ko), marked: status.has(ko) ? status.get(ko) : "" }); }
    else if (mv.size > 1 && Array.from(mv.keys()).some((k) => k !== ko)) partial.push({ from: ko, keeps: mv.get(ko) || 0, moves: oldTotal.get(ko) - (mv.get(ko) || 0), marked: status.has(ko) ? status.get(ko) : "" });
  }
  const out = { tokens, changed, whole_moves: whole, partial_moves: partial,
    whole_summary: { keys: whole.length, marked: whole.filter((w) => w.marked).length },
    partial_summary: { keys: partial.length, marked: partial.filter((w) => w.marked).length, marked_tokens_moving: partial.filter((w) => w.marked).reduce((a, w) => a + w.moves, 0) }, share: changed / tokens, types: list.length, byVia,
    marked_from: { types: markedFrom.length, tokens: markedFrom.reduce((a, c) => a + c.n, 0) },
    marked_to: { types: markedTo.length, tokens: markedTo.reduce((a, c) => a + c.n, 0) }, changes: list };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ whole: out.whole_summary, partial: out.partial_summary }));
  console.log(JSON.stringify({ tokens, changed, share: (changed / tokens * 100).toFixed(2) + "%", types: list.length, byVia, marked_from: out.marked_from, marked_to: out.marked_to }));
})();
