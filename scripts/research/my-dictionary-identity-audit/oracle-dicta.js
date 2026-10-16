#!/usr/bin/env node
"use strict";
// O2 — Dicta in context (the production /api/morphology/batch, the app's own path) for every sampled word.
// node oracle-dicta.js <sample.json> <out.json> [base]. One request at a time, 40 sentences each (≤ 2 concurrent rule).
const fs = require("node:fs");
const [samplePath, outPath, base = "https://linguistpro.kolosei.com"] = process.argv.slice(2);
const UPOS = { noun: "NOUN", verb: "VERB", adjective: "ADJ", adverb: "ADV", propernoun: "PROPN", numeral: "NUM", pronoun: "PRON", preposition: "ADP", conjunction: "CCONJ" };
const strip = (s) => String(s || "").normalize("NFC").replace(/[֑-ׇ]/g, "");
(async () => {
  const S = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const items = S.items, out = [];
  for (let i = 0; i < items.length; i += 40) {
    const part = items.slice(i, i + 40);
    let j = null;
    for (let attempt = 0; attempt < 3 && !j; attempt++) {
      try {
        const r = await fetch(base + "/api/morphology/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sentences: part.map((it) => it.tokens.join(" ")) }) });
        if (r.ok) j = await r.json(); else await new Promise((res) => setTimeout(res, 3000));
      } catch (_) { await new Promise((res) => setTimeout(res, 3000)); }
    }
    part.forEach((it, k) => {
      const res = j && j.results && j.results[k];
      const toks = (res && res.ok && res.tokens) || [];
      // align Dicta's words to ours: walk both sequences by bare letters
      let t = null, di = 0;
      for (let w = 0; w < it.tokens.length && di < toks.length; w++) {
        const ours = strip(it.tokens[w]);
        while (di < toks.length && strip(toks[di].word) !== ours) di++;
        if (di >= toks.length) break;
        if (w === it.index) { t = toks[di]; break; }
        di++;
      }
      out.push({ id: it.id, dicta_lemma: t ? t.lemma || "" : "", dicta_upos: t ? UPOS[t.posDicta] || "" : "", dicta_prefix: t ? t.prefix || "" : "",
        dicta_degraded: !res || !res.ok || !!(res && res.degraded) });
    });
    process.stdout.write(".");
  }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("\n", out.length, "items;", out.filter((x) => x.dicta_lemma).length, "with a lemma");
})();
