#!/usr/bin/env node
// Verifies the homograph POS-guard v3ConjHitCompatible: a function word / participle
// must NOT accept a content-POS homograph paradigm (which would send «перепроверка
// (Pealim)» to the wrong dict page), while legit content/invariant hits pass.
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3232;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (e ? " — " + e : "")); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise(r => { const tm = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(tm); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=linkguard", { waitUntil: "domcontentloaded" });
    await sleep(1200);
    const r = await pg.evaluate(() => {
      const C = window.v3ConjHitCompatible;
      if (typeof C !== "function") return { miss: true };
      const noun = (id) => ({ pos: "noun", kind: "noun", pealim_id: id });
      const adj = { pos: "adjective", kind: "noun", pealim_id: 1 };
      const verb = { pos: "verb", kind: "verb", pealim_id: 1 };
      const invar = (p) => ({ pos: p, kind: "invariant", pealim_id: 1 });
      return {
        // function word → content homograph = REJECT
        advNoun: C("adverb", "particle", noun(6010)),     // פה → noun «рот»
        pronNoun: C("pronoun", "particle", noun(2710)),   // את → noun
        conjNoun: C("conjunction", "particle", noun(1)),
        // participle (verb) → noun/adjective homograph = REJECT
        verbNoun: C("verb", "", noun(9188)),              // רואה → noun «зеркало»
        verbAdj: C("verb", "", adj),                      // אופה → adj
        // proper noun → REJECT any dict page
        properNoun: C("noun", "propernoun", noun(5934)),  // יעל → noun «польза»
        // legit content stays = ACCEPT
        verbVerb: C("verb", "", verb),
        nounNoun: C("noun", "", noun(1)),
        nounAdj: C("noun", "", adj),                      // noun↔adj kin
        // legit invariant for a function word = ACCEPT
        advInvar: C("adverb", "particle", invar("adverb")), // בחוץ invariant
        prepAny: C("preposition", "particle", noun(1)),   // preposition declines → keep
      };
    });
    if (r.miss) { t("v3ConjHitCompatible present", false, "function missing"); }
    else {
      t("adverb → noun homograph REJECTED (פה→рот)", r.advNoun === false);
      t("pronoun → noun homograph REJECTED (את)", r.pronNoun === false);
      t("conjunction → noun homograph REJECTED", r.conjNoun === false);
      t("verb participle → noun homograph REJECTED (רואה→зеркало)", r.verbNoun === false);
      t("verb participle → adjective homograph REJECTED", r.verbAdj === false);
      t("proper noun → dict page REJECTED (יעל)", r.properNoun === false);
      t("verb → verb ACCEPTED", r.verbVerb === true);
      t("noun → noun ACCEPTED", r.nounNoun === true);
      t("noun → adjective ACCEPTED (kin)", r.nounAdj === true);
      t("adverb → invariant ACCEPTED (בחוץ)", r.advInvar === true);
      t("preposition → kept (declines)", r.prepAny === true);
    }
    t("no pageerror (index.html parses)", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[pealim-link-guard-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
