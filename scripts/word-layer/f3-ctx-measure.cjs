#!/usr/bin/env node
"use strict";
// Word layer Ф3 measurement: run the shipped prompt/schema/validation (ingest/wordGlossCtx.js) through
// the shipped Gemini client on a fixed sample of a real card, next to the offline gloss, and record
// tokens/cost. The API key is read from a file outside the repo and never printed.
// Usage: node scripts/word-layer/f3-ctx-measure.cjs --xlsx <02_…xlsx> --key-file <path> [--model gemini-3.8-flash]
//        [--rows 40] [--batch 20] [--out <dir outside repo>]
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");
const AdmZip = require("adm-zip");
const ROOT = path.resolve(__dirname, "../..");
global.window = undefined;
const NA = require(path.join(ROOT, "public/js/notes-autogen.js"));
const RM = require(path.join(ROOT, "public/js/reader-morph.js"));
const WG = require(path.join(ROOT, "public/js/word-gloss.js"));
const RF = require(path.join(ROOT, "public/js/ru-forms.js"));
const WGC = require(path.join(ROOT, "ingest/wordGlossCtx.js"));
const { generateGeminiContent } = require(path.join(ROOT, "ingest/geminiClient.js"));
const { Type } = require("@google/genai");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = arg("model", "gemini-3.8-flash"), NROWS = +arg("rows", 40), BATCH = +arg("batch", 20);
const OUT = arg("out", "E:/tmp-lp/f3"); fs.mkdirSync(OUT, { recursive: true });
const KEY = fs.readFileSync(arg("key-file"), "utf8").trim();
const RATES = { "gemini-3.8-flash": [0.75, 3.75], "gemini-3.5-flash-lite": [0.10, 0.40] };   // $/1M in, out (in-code rates; lite = estimate)

RF.setData(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/ru-forms-v1.json.gz"))).toString("utf8")));
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
const pidMap = new Map(); ds.paradigms.forEach((p) => { if (p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p); });
const eng = { NA, maps: NA.buildResolverMaps(ds.paradigms), pidMap, lookup: (k, b) => { const i = ds.index[k + " " + (b || "")]; return i != null ? ds.paradigms[i] : null; } };

function sourceRows(file) {
  const z = new AdmZip(file), x = z.readAsText("xl/worksheets/sheet10.xml", "utf8"), out = [];
  const un = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const m of x.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)) {
    const row = {};
    for (const c of m[1].matchAll(/<x:c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/x:c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1]); const v = /<x:(?:v|t)[^>]*>([\s\S]*?)<\/x:(?:v|t)>/.exec(c[2] || "");
      if (ref) row[ref[1]] = v ? un(v[1]) : "";
    }
    if (/^\d+$/.test(row.A || "") && row.C) out.push({ n: +row.A, niq: row.C, ru: row.E || "" });
  }
  return out;
}
const MUST = ["חָלָל", "חֲלָלִים", "הוֹרָדָה", "אֲוִירָה", "אִי אֶפְשָׁר", "מוֹצָאֵי", "בְּנֵי אָדָם", "הֵבַנְתִּי", "הִתְחִיל", "הַמְּפַקֵּד", "בְּדֶרֶךְ כְּלָל", "אַרְצָה"];

(async () => {
  const all = sourceRows(arg("xlsx"));
  const picked = new Map();
  for (const w of MUST) { const r = all.find((x) => x.niq.includes(w) && !picked.has(x.n)); if (r) picked.set(r.n, r); }
  let a = 20261011; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = all.filter((r) => !picked.has(r.n));
  while (picked.size < NROWS && pool.length) { const r = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; picked.set(r.n, r); }
  const rows = [];
  for (const r of [...picked.values()].sort((x, y) => x.n - y.n)) {
    const words = [];
    for (const tk of RM.tokenize(r.niq).filter((t) => t.isWord)) {
      const s = RM.stripNiqqud(tk.text); if (!s) continue;
      const card = RM.enrichReading(eng, await RM.resolveCore(eng, s, tk.text), s, tk.text);
      const g = WG.composeGloss(card, tk.text);
      words.push({ w: tk.text, hint: g && g.text ? g.text : "" });
    }
    if (words.length) rows.push({ i: r.n, he: r.niq, ru: r.ru, words });
  }
  const scenario = { model: MODEL, fallbackModel: null, promptId: WGC.WG_CTX_PROMPT_ID, schemaId: WGC.WG_CTX_SCHEMA_ID };
  let inTok = 0, outTok = 0, thTok = 0, rejected = [], results = new Map(), ms = 0;
  for (let b = 0; b < rows.length; b += BATCH) {
    const part = rows.slice(b, b + BATCH);
    const t0 = Date.now();
    const gen = await generateGeminiContent({ apiKey: KEY, scenario, contents: WGC.buildPrompt(part),
      config: { responseMimeType: "application/json", responseSchema: WGC.buildResponseSchema(Type), maxOutputTokens: 32768 } });
    ms += Date.now() - t0;
    const u = gen.usageMetadata || {};
    inTok += u.promptTokenCount || 0; outTok += u.candidatesTokenCount || 0; thTok += u.thoughtsTokenCount || 0;
    let parsed = null; try { parsed = WGC.parseModelJson(gen.text); } catch (e) { rejected.push({ batch: b, reason: "json" }); continue; }
    const v = WGC.validateOutput(part, parsed);
    rejected.push(...v.rejected);
    v.rows.forEach((r) => results.set(r.i, r));
  }
  const words = rows.reduce((n, r) => n + r.words.length, 0);
  const [ri, ro] = RATES[MODEL] || [0, 0];
  const cost = (inTok * ri + (outTok + thTok) * ro) / 1e6;
  const lines = ["row\tk\tword\toffline\tai\twrong_hint\tmwe"];
  for (const r of rows) {
    const res = results.get(r.i);
    r.words.forEach((x, k) => {
      const g = res ? res.glosses[k] : null;
      const m = res ? res.mwe.filter((q) => k >= q.from && k <= q.to).map((q) => q.gloss).join("; ") : "";
      lines.push([r.i, k, x.w, x.hint, g ? g.gloss : "(отклонено)", g && g.wrong_hint ? 1 : "", m].join("\t"));
    });
  }
  const tag = MODEL.replace(/[^a-z0-9.-]/gi, "_");
  fs.writeFileSync(path.join(OUT, "f3-" + tag + ".tsv"), lines.join("\n") + "\n");
  const summary = { model: MODEL, rows: rows.length, words, accepted_rows: results.size, rejected, inTok, outTok, thoughtsTok: thTok,
    cost_usd: +cost.toFixed(4), cost_per_1k_words: +(cost / words * 1000).toFixed(4), seconds: Math.round(ms / 1000),
    est_full_shura_usd: +(cost / words * 5641).toFixed(3) };
  fs.writeFileSync(path.join(OUT, "f3-" + tag + ".json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
})().catch((e) => { console.error(String(e && e.message || e).replace(KEY, "***")); process.exit(1); });
