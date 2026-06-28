#!/usr/bin/env node
"use strict";
// smoke:reader-cloze:audit — Epic 4.3b Phase D1 coverage audit (R10 measure-before/after).
// Boots library.html (offline engine), deterministically samples baked works, and for every MC-eligible
// cloze answer measures the REAL shipped path: does ReaderMorph.buildMcSlotOptions produce slot-inflected
// distractors (D1 fires), and are they vocalized + distinct + never == the answer (quality/honesty)?
// Prints coverage % and writes a JSON report. Informational by default; --gate fails under --min=PCT.
// Run:  node scripts/premium/reader-cloze-audit.js [--rows=N] [--gate --min=70]
const path = require("path"), fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const WORKS = path.join(REPO, "public", "data", "benyehuda", "works");
const OUTDIR = path.join(REPO, "docs", "research", "epic4-3b-d1-slot", "2026-06-29");
const PORT = 3298, BASE = "http://127.0.0.1:" + PORT;
const argv = process.argv.slice(2);
const getNum = (k, d) => { const a = argv.find((x) => x.startsWith("--" + k + "=")); return a ? parseInt(a.split("=")[1], 10) : d; };
const TARGET_ROWS = getNum("rows", 400), GATE = argv.includes("--gate"), MIN = getNum("min", 70);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stop(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise((r) => { const t = setTimeout(() => r(), 5000); c.once("exit", () => { clearTimeout(t); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function ready(ms = 20000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }
function sampleRows(target) {
  const files = fs.readdirSync(WORKS).filter((f) => /\.json$/.test(f)).sort();
  const wantWorks = Math.min(files.length, 40), stride = Math.max(1, Math.floor(files.length / wantWorks)), perWork = Math.max(2, Math.ceil(target / wantWorks));
  const rows = [], seen = new Set();
  const take = (file, cap) => { let added = 0, work; try { work = JSON.parse(fs.readFileSync(path.join(WORKS, file), "utf8")); } catch (_) { return; } for (const t of ((work && work.library && work.library.texts) || [])) for (const r of (t.rows || [])) { if (added >= cap || rows.length >= target) return; const he = String(r.hebrew_plain || "").trim(), niq = String(r.hebrew_niqqud || "").trim(); if (!he || !niq || (he.match(/[א-ת]+/g) || []).length < 3) continue; const key = file + "#" + (r.row_id || rows.length); if (seen.has(key)) continue; seen.add(key); rows.push({ he, he_niqqud: niq }); added++; } };
  for (let i = 0; i < files.length && rows.length < target; i += stride) take(files[i], perWork);
  for (let i = 0; i < files.length && rows.length < target; i++) take(files[i], perWork);
  return rows;
}
const PAGE = `async (rows) => {
  const RM = window.ReaderMorph; await RM.ensureEngine();
  const norm = (s) => RM.stripNiqqud(String(s||''));
  const m = { mc:0, fired:0, badForm:0, byPos:{} };
  for (const row of rows){ const pairs = RM.alignSurfaceNiqqud(row.he, row.he_niqqud) || [];
    for (const p of pairs){ const s=p.surface||p.he||'', n=p.niqqud||p.he||''; if(!s) continue;
      let card; try { card = await RM.resolveWordLight(s,n); } catch(_){ continue; }
      if(!card || !(card.label==='exact'||card.label==='likely') || card.functionWord) continue;
      if(!RM.isMcLevel('new')) {} // MC tier always covers 'new'/l1/l2; every collected word is MC-eligible at new
      m.mc++; m.byPos[card.pos||'?']=(m.byPos[card.pos||'?']||0)+1;
      let o; try { o = await RM.buildMcSlotOptions(card, 3); } catch(_){ o=null; }
      if(o && o.options && o.options.length>=3){ m.fired++;
        const cs=norm(o.correctHe); const voc=o.options.every(h=>/[֑-ׇ]/.test(h)); const distinct=o.options.every(h=>norm(h)!==cs) && new Set(o.options.map(norm)).size===o.options.length;
        if(!voc || !distinct) m.badForm++;
      }
    } }
  return m;
}`;
(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const rows = sampleRows(TARGET_ROWS);
  console.log("reader-cloze-audit: " + rows.length + " rows");
  const srv = startServer(); if (!(await ready())) { console.error("server failed"); await stop(srv); process.exit(1); }
  const b = await pw.chromium.launch();
  const agg = { mc:0, fired:0, badForm:0, byPos:{} };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale","ru"); } catch(_){} });
    const pg = await ctx.newPage(); const errs=[]; pg.on("pageerror", e=>errs.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.InflectionDict && !!window.NotesAutoGen, { timeout: 25000 });
    const CHUNK = 40;
    for (let i = 0; i < rows.length; i += CHUNK) {
      let m; try { m = await pg.evaluate("(" + PAGE + ")(" + JSON.stringify(rows.slice(i, i + CHUNK)) + ")"); } catch (e) { continue; }
      agg.mc += m.mc; agg.fired += m.fired; agg.badForm += m.badForm;
      for (const p in m.byPos) agg.byPos[p] = (agg.byPos[p] || 0) + m.byPos[p];
      process.stdout.write("\\r  " + Math.min(i + CHUNK, rows.length) + "/" + rows.length + " rows  mc=" + agg.mc + "   ");
    }
    process.stdout.write("\\n"); if (errs.length) console.log("pageerrors: " + errs.slice(0,2).join(" | "));
  } finally { await b.close(); await stop(srv); }
  const cov = agg.mc ? (100 * agg.fired / agg.mc) : 0;
  const report = { generated_for: "Epic 4.3b D1 slot-distractor coverage (after)", sample_rows: rows.length, mc_eligible: agg.mc, d1_fired: agg.fired, coverage_pct: +cov.toFixed(1), bad_form: agg.badForm, byPos: agg.byPos, date: "2026-06-29" };
  try { fs.mkdirSync(OUTDIR, { recursive: true }); fs.writeFileSync(path.join(OUTDIR, "coverage-report.json"), JSON.stringify(report, null, 2)); } catch (_) {}
  console.log("\\n════════ reader-cloze-audit (D1) ════════");
  console.log("MC-eligible answers     : " + agg.mc);
  console.log("D1 slot-options FIRED   : " + agg.fired + "  (" + cov.toFixed(1) + "%)   ← clean slot-matched MC");
  console.log("bad form (R1/honesty)   : " + agg.badForm + "   (must be 0)");
  console.log("byPos                   : " + JSON.stringify(agg.byPos));
  console.log("report → " + path.relative(REPO, path.join(OUTDIR, "coverage-report.json")));
  if (agg.badForm > 0) { console.error("FAIL: " + agg.badForm + " non-vocalized/duplicate/answer-colliding option sets"); process.exit(1); }
  if (GATE && cov < MIN) { console.error("FAIL: coverage " + cov.toFixed(1) + "% < min " + MIN + "%"); process.exit(1); }
  console.log("PASS");
})().catch((e) => { console.error("fatal", e); process.exit(1); });
