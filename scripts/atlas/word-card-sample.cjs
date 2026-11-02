"use strict";
// Atlas P4 W2 quality gate (owner decision E5): a fixed-seed sample of 100 words from 5 sections — 20 each — with
// what the Room's word card shows for it now (the browser's own ReaderMorph.resolveWordLight with the supplier's
// niqqud) and, for words of a reviewed term, the term the card shows on top. Read-only; the verdicts are added by a
// reviewer to the output file by hand.
//   node scripts/atlas/word-card-sample.cjs <base> <outJson>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const SECTIONS = ["s03-bolts", "s09-belt", "s19-cutting-theory", "s26-form-tolerance", "s40-break-even"];

(async () => {
  const base = process.argv[2] || "https://linguistpro.kolosei.com";
  const out = path.resolve(process.argv[3] || ".tmp/atlas-word-sample.json");
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
    await page.goto(base + "/library.html#room=atlas%3Aa97002");
    await page.waitForSelector(".atlas-home");
    const rows = await page.evaluate(async (SECTIONS) => {
      const RM = window.ReaderMorph, AW = window.AtlasWords;
      let seed = 97002;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const out = [];
      for (const sid of SECTIONS) {
        const data = await (await fetch("/data/atlas/a97002/sections/" + sid + ".json")).json();
        const ctx = AW.sectionContext("a97002", data, RM);
        const places = [];
        for (const [id, it] of ctx.items) {
          if (!it.he_niqqud) continue;
          const plain = RM.tokenize(it.he).filter((t) => t.isWord).map((t) => t.text);
          const pointed = RM.tokenize(it.he_niqqud).filter((t) => t.isWord).map((t) => t.text);
          if (plain.length !== pointed.length) continue;
          plain.forEach((w, i) => { if (RM.stripNiqqud(w).length > 1) places.push({ id, it, i, w, n: pointed[i] }); });
        }
        const picked = new Set();
        while (picked.size < 20 && picked.size < places.length) picked.add(Math.floor(rnd() * places.length));
        for (const k of Array.from(picked).sort((a, b) => a - b)) {
          const pl = places[k], occ = AW.occurrence(ctx, pl.id, pl.i, RM.stripNiqqud(pl.w), "he");
          const top = AW.cardTop(occ, ctx, {});
          const card = await RM.resolveWordLight(RM.stripNiqqud(pl.w), pl.n, null, null);
          out.push({ section: sid, block: pl.id, offset: pl.i, word: pl.n, sentence: pl.it.he_niqqud, ru: pl.it.ru,
            card: { label: card.label, lemma: card.lemma || "", pos: card.pos || "", meaning: String(card.meaning || "").slice(0, 120) },
            term: top ? { title: top.title, meaning: top.lines[0] || "" } : null, verdict: "", note: "" });
        }
      }
      return out;
    }, SECTIONS);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(rows, null, 1) + "\n");
    console.log(rows.length + " words → " + out);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
