"use strict";
// Quantify the Tier-3 path-(A) regression surface: over a sample of baked rows, how often does
// context override an offline-EXACT (corpus-niqqud-grounded) reading? Independent of the Dicta
// silver oracle (which is blind to its own override). Uses REAL Dicta per sentence (cached).
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const REPO = "E:/projects/tts-prototype-android";
const PORT = 3293, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stop(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await sleep(500); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const WORKS = ["63", "35", "56", "76", "84", "44", "91", "105"];
const ROWS_PER_WORK = 6;

function collectRows() {
  const out = [];
  for (const id of WORKS) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(REPO, "public/data/benyehuda/works/" + id + ".json"), "utf8"));
      const rows = w.library.texts[0].rows || [];
      let taken = 0;
      for (const r of rows) {
        const plain = String(r.hebrew_plain || ""), niq = String(r.hebrew_niqqud || "");
        if ((plain.match(/[א-ת]+/g) || []).length < 4) continue;   // skip short rows
        out.push({ work: id, plain, niq });
        if (++taken >= ROWS_PER_WORK) break;
      }
    } catch (e) { console.error("skip work", id, String(e)); }
  }
  return out;
}

(async () => {
  const pw = require(path.join(REPO, "node_modules", "playwright"));
  const rows = collectRows();
  console.log("sampled rows:", rows.length, "from", WORKS.length, "works");
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); await stop(srv); process.exit(1); }
  const b = await pw.chromium.launch();
  try {
    const ctx = await b.newContext({ serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.ReaderDicta && !!window.InflectionDict && !!window.NotesAutoGen, { timeout: 20000 });

    const tally = await pg.evaluate(async (rows) => {
      const R = window.ReaderMorph, D = window.ReaderDicta;
      const eng = await R.ensureEngine();
      const strip = R.stripNiqqud;
      const t = { contentTokens: 0, offlineExact: 0, dictaUnreach: 0,
        overrideOfExact: 0, overrideOfNonExact: 0, soften: 0, gloss: 0, offlineKept: 0, examples: [] };
      for (const row of rows) {
        let res = null;
        try { res = await D.analyzeSentence(row.plain); } catch (_) { res = null; }
        const dictaOk = res && res.ok && !res.degraded && Array.isArray(res.tokens);
        // tokenize the niqqud cell → per-word corpus niqqud
        const toks = R.tokenize(row.niq).filter(x => x.isWord);
        for (const tk of toks) {
          const corpusNiq = tk.text, surface = strip(corpusNiq);
          if (!surface) continue;
          let off; try { off = await R.resolveCore(eng, surface, corpusNiq); } catch (_) { continue; }
          if (!(off.pos === "noun" || off.pos === "verb" || off.pos === "adjective")) continue;  // content only
          t.contentTokens++;
          if (off.label === "exact") t.offlineExact++;
          if (!dictaOk) { t.dictaUnreach++; continue; }
          const dt = D.tokenForSurface(res.tokens, surface);
          if (!dt || !dt.niqqud) continue;
          let ctxCard; try { ctxCard = await R.resolveCore(eng, surface, dt.niqqud); } catch (_) { continue; }
          const dec = R.pickContextReading(off, ctxCard, { posDicta: dt.posDicta }, surface);
          if (dec.use === "context") {
            if (off.label === "exact") {
              t.overrideOfExact++;
              if (t.examples.length < 25) t.examples.push({ work: row.work, surface, offN: off.niqqud, offM: (off.meaning||"").slice(0,24), ctxN: ctxCard.niqqud, ctxM: (ctxCard.meaning||"").slice(0,24) });
            } else t.overrideOfNonExact++;
          } else if (dec.use === "soften") t.soften++;
          else if (dec.use === "gloss") t.gloss++;
          else t.offlineKept++;
        }
      }
      return t;
    }, rows);

    console.log("\n=== Tier-3 path-(A) override quantification (content tokens) ===");
    console.log("content tokens analyzed:", tally.contentTokens);
    console.log("offline-exact:", tally.offlineExact, "| dicta-unreachable tokens:", tally.dictaUnreach);
    console.log("OVERRIDE of offline-EXACT (regression-exposed):", tally.overrideOfExact);
    console.log("override of offline-non-exact (intended benefit):", tally.overrideOfNonExact);
    console.log("soften:", tally.soften, "| gloss(func-demote):", tally.gloss, "| offline-kept:", tally.offlineKept);
    const denom = tally.offlineExact || 1;
    console.log("\n=> override-of-exact rate =", (100*tally.overrideOfExact/denom).toFixed(1) + "% of offline-exact content tokens");
    console.log("\n=== examples (offline-exact → Dicta override): surface | offline → context ===");
    for (const e of tally.examples) console.log(`[${e.work}] ${e.surface}  ${e.offN}(${e.offM}) → ${e.ctxN}(${e.ctxM})`);
    fs.writeFileSync(path.join("C:/Users/lletp/AppData/Local/Temp/claude/E--projects-tts-prototype-android/9a79d4f1-d991-4ee5-9a2f-ede64a5e5910/scratchpad","tier3-quant-result.json"), JSON.stringify(tally,null,1));
  } finally { await b.close(); await stop(srv); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
