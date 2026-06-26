#!/usr/bin/env node
"use strict";
// smoke:reader-tier3-regression — R11 do-no-harm gate for Tier-3 context mode.
//
// The Tier-3 «точный режим» (context disambiguation via Dicta) must NEVER override a DECISIVE,
// corpus-niqqud-grounded offline reading. It once flipped בֹּקֶר «утро» → בָּקָר «крупный рогатый
// скот» (Dicta picks the high-frequency homograph on bare archaic text), contradicting the niqqud
// column the reader sees. The precision audit could not catch this: its silver oracle IS Dicta,
// so it is blind to Dicta's own errors (R11 oracle-independence).
//
// This gate is Dicta-INDEPENDENT: over a sample of REAL baked rows it counts how often Tier-3
// path-(A) would override an offline-EXACT reading, using the CORPUS NIQQUD (not Dicta) as the
// grounding. The invariant is ZERO such overrides. Network-dependent (real Dicta per sentence):
// SKIPS gracefully (exit 0) when Dicta is unreachable.
//
// Run:  node scripts/premium/reader-tier3-regression.js  [--works=63,35,..] [--rows=6]

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3294, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : d; };
const WORKS = String(arg("works", "63,35,56,76,84,44,91,105")).split(",").filter(Boolean);
const ROWS_PER_WORK = Number(arg("rows", 6));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

function collectRows() {
  const out = [];
  for (const id of WORKS) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(REPO, "public/data/benyehuda/works/" + id + ".json"), "utf8"));
      const rows = (w.library && w.library.texts && w.library.texts[0] && w.library.texts[0].rows) || [];
      let taken = 0;
      for (const r of rows) {
        const plain = String(r.hebrew_plain || ""), niq = String(r.hebrew_niqqud || "");
        if ((plain.match(/[א-ת]+/g) || []).length < 4) continue;
        out.push({ work: id, plain, niq });
        if (++taken >= ROWS_PER_WORK) break;
      }
    } catch (_) {}
  }
  return out;
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const rows = collectRows();
  if (!rows.length) { console.error("no baked rows found (works missing?)"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  try {
    const ctx = await b.newContext({ serviceWorkers: "block" });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.ReaderDicta && !!window.InflectionDict && !!window.NotesAutoGen, { timeout: 20000 });

    // probe Dicta reachability
    const probe = await pg.evaluate(async () => { try { const r = await window.ReaderDicta.analyzeSentence("הַיּוֹם אֲנִי הוֹלֵךְ"); return r && r.ok && !r.degraded; } catch (_) { return false; } });
    if (!probe) {
      console.log("reader-tier3-regression: Dicta unreachable from this host — SKIP (network-dependent gate).");
      console.log("PASS (skipped — offline)");
      await b.close(); await stop(srv.c); return;
    }

    const t = await pg.evaluate(async (rows) => {
      const R = window.ReaderMorph, D = window.ReaderDicta, strip = R.stripNiqqud;
      const eng = await R.ensureEngine();
      const o = { content: 0, offlineExact: 0, overrideOfExact: 0, overrideOfNonExact: 0, examples: [] };
      for (const row of rows) {
        let res = null; try { res = await D.analyzeSentence(row.plain); } catch (_) { res = null; }
        const ok = res && res.ok && !res.degraded && Array.isArray(res.tokens);
        if (!ok) continue;
        for (const tk of R.tokenize(row.niq).filter((x) => x.isWord)) {
          const surface = strip(tk.text); if (!surface) continue;
          let off; try { off = await R.resolveCore(eng, surface, tk.text); } catch (_) { continue; }
          if (!(off.pos === "noun" || off.pos === "verb" || off.pos === "adjective")) continue;
          o.content++; if (off.label === "exact") o.offlineExact++;
          const dt = D.tokenForSurface(res.tokens, surface); if (!dt || !dt.niqqud) continue;
          let cx; try { cx = await R.resolveCore(eng, surface, dt.niqqud); } catch (_) { continue; }
          const dec = R.pickContextReading(off, cx, { posDicta: dt.posDicta }, surface);
          if (dec.use === "context") {
            if (off.label === "exact") { o.overrideOfExact++; if (o.examples.length < 20) o.examples.push(`[${row.work}] ${surface} ${off.niqqud}(${(off.meaning||"").slice(0,18)}) → ${cx.niqqud}(${(cx.meaning||"").slice(0,18)})`); }
            else o.overrideOfNonExact++;
          }
        }
      }
      return o;
    }, rows);

    console.log("reader-tier3-regression: " + rows.length + " baked rows / " + t.content + " content tokens (" + t.offlineExact + " offline-exact)");
    console.log("  override of offline-EXACT (must be 0): " + t.overrideOfExact + " | override of non-exact (allowed): " + t.overrideOfNonExact);
    const failures = [];
    if (t.overrideOfExact > 0) { failures.push("Tier-3 overrode " + t.overrideOfExact + " offline-EXACT corpus-grounded reading(s) — R11 do-no-harm violation:"); for (const e of t.examples) failures.push("    " + e); }
    if (pageErrors.length) failures.push("pageerror: " + pageErrors.join(" | "));
    if (failures.length) { console.error("\nFAIL:"); for (const f of failures) console.error("  ✗ " + f); await b.close(); await stop(srv.c); process.exit(1); }
    console.log("PASS — reader-tier3-regression: Tier-3 never overrode a corpus-grounded reading (R11)");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
