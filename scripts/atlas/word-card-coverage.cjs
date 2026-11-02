"use strict";
// Atlas P4 W2 measure: what the Room's word card says today for every word of the atlas (offline resolver, the
// supplier's own niqqud, no context). Read-only; runs the browser's own ReaderMorph.resolveWordLight.
//   node scripts/atlas/word-card-coverage.cjs <base> <outJson>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

(async () => {
  const base = process.argv[2] || "https://linguistpro.kolosei.com";
  const out = path.resolve(process.argv[3] || ".tmp/atlas-word-coverage.json");
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
    await page.goto(base + "/library.html#room=atlas%3Aa97002");
    await page.waitForSelector(".atlas-home");
    const result = await page.evaluate(async () => {
      const RM = window.ReaderMorph;
      const index = await (await fetch("/data/atlas/a97002/index.json")).json();
      const pairs = new Map();   // surface|niqqud → { n, sections:Set, term }
      for (const s of index.sections) {
        const data = await (await fetch("/data/atlas/a97002/sections/" + s.id + ".json")).json();
        const ctx = window.AtlasWords.sectionContext("a97002", data, RM);
        for (const [id, it] of ctx.items) {
          const loc = ctx.located(id);
          const plain = RM.tokenize(it.he).filter((t) => t.isWord).map((t) => t.text);
          const pointed = it.he_niqqud ? RM.tokenize(it.he_niqqud).filter((t) => t.isWord).map((t) => t.text) : [];
          const aligned = pointed.length === plain.length;
          plain.forEach((w, i) => {
            const key = RM.stripNiqqud(w) + "|" + (aligned ? pointed[i] : "");
            const e = pairs.get(key) || { n: 0, sections: new Set(), term: false };
            e.n++; e.sections.add(s.id);
            if (window.AtlasWords.termAt(loc.he.spans, i)) e.term = true;
            pairs.set(key, e);
          });
        }
      }
      const labels = {}, unknown = [], byLabelTokens = {};
      let tokens = 0;
      for (const [key, e] of pairs) {
        const [surface, niqqud] = key.split("|");
        let card = null;
        try { card = await RM.resolveWordLight(surface, niqqud, null, null); } catch (_) {}
        const label = card ? card.label || "none" : "error";
        labels[label] = (labels[label] || 0) + 1;
        byLabelTokens[label] = (byLabelTokens[label] || 0) + e.n;
        tokens += e.n;
        if (label === "unknown") unknown.push({ surface, niqqud, n: e.n, term: e.term, sections: e.sections.size });
      }
      unknown.sort((a, b) => b.n - a.n);
      return { pairs: pairs.size, tokens, labels, byLabelTokens, unknownTop: unknown.slice(0, 300), unknownCount: unknown.length,
        unknownTerm: unknown.filter((u) => u.term).length };
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
    console.log(JSON.stringify({ pairs: result.pairs, tokens: result.tokens, labels: result.labels, byLabelTokens: result.byLabelTokens,
      unknownCount: result.unknownCount, unknownTerm: result.unknownTerm, top: result.unknownTop.slice(0, 40).map((u) => u.niqqud || u.surface).join(" ") }, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
