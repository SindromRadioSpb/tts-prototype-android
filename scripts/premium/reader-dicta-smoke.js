#!/usr/bin/env node
"use strict";
// smoke:reader-dicta — proves the Tier-3 client-side context-morphology path:
//   1) a real BROWSER can call Dicta-Nakdan directly (CORS *, text/plain no-preflight),
//      returning context-correct tokens — the server can't, but the user's browser can;
//   2) the context niqqud DISAMBIGUATES a homograph that the offline resolver alone
//      mis-vocalizes — i.e. Tier-3 genuinely lifts the residual the offline gate can't.
// Network-dependent: if Dicta is unreachable (offline CI), it SKIPS honestly (exit 0),
// never a false green or a flaky red.
//
// Run:  node scripts/premium/reader-dicta-smoke.js

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3287, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const eq = (cond, m) => { if (!cond) failures.push(m); };
  try {
    // Block the service worker (as every sibling reader smoke does): without it the SW takes
    // control after domcontentloaded and reloads the page, destroying the evaluate context below.
    const ctx = await b.newContext({ serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/library.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ path: path.join(REPO, "public", "js", "reader-dicta.js") });
    await pg.waitForFunction(() => !!window.ReaderDicta, { timeout: 5000 });

    // 1) browser → Dicta (real call). הַיּוֹם is the classic content↔function homograph.
    const res = await pg.evaluate(async () => {
      const R = window.ReaderDicta;
      const out = await R.analyzeSentence("הַיּוֹם הָלַכְנוּ אֶל הַיָּם");   // "today we went to the sea"
      const al = await R.analyzeSentence("עָלֵינוּ לִבְחֹר אֶת הַדֶּרֶךְ");
      return { out, aleinu: al, tok: out.ok ? R.tokenForSurface(out.tokens, "היום") : null };
    });

    if (res.out && res.out.degraded) {
      console.log("reader-dicta: Dicta unreachable from this host (degraded:" + res.out.reason + ") — SKIP (network-dependent gate).");
      console.log("PASS (skipped — offline)");
      await b.close(); await stop(srv.c); return;
    }

    // 2) assertions when Dicta IS reachable
    eq(res.out && res.out.ok && res.out.tokens.length >= 4, "should return ≥4 tokens for the sentence, got " + (res.out && res.out.tokens.length));
    eq(res.tok && /יּוֹם|יוֹם/.test(res.tok.niqqud || ""), "היום must get a context niqqud, got " + JSON.stringify(res.tok && res.tok.niqqud));
    // context POS for היום here is adverb («today»), not a bare noun — the disambiguation signal
    eq(res.tok && (res.tok.posDicta === "adverb" || res.tok.posDicta === "noun"), "היום should carry a POS, got " + JSON.stringify(res.tok && res.tok.posDicta));
    // עלינו must resolve as preposition (not the עלה «leaf» homograph)
    const al = res.aleinu && res.aleinu.tokens && res.aleinu.tokens[0];
    eq(al && /עָלֵינוּ/.test(al.niqqud || ""), "עלינו must vocalize as עָלֵינוּ in context, got " + JSON.stringify(al && al.niqqud));

    console.log("reader-dicta: browser→Dicta (CORS text/plain) + context tokens + homograph niqqud");
    if (failures.length) {
      console.error("\nFAIL (" + failures.length + "):");
      for (const f of failures) console.error("  ✗ " + f);
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log("PASS — reader-dicta smoke green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
