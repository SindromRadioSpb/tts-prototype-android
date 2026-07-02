#!/usr/bin/env node
"use strict";
// smoke:reader-mytexts — Эпик B «Мои тексты»: the user's own Studio texts as a native Room shelf.
// Proves in a real browser @380px (mobile-first), seeding OPFS in-session (headless OPFS does not
// survive reloads — feedback_headless_opfs_playwright; small writes are safe, importBundle is not):
//   1) the shelf renders the user's OWN texts (non-corpus, non-archived) on the corpus home;
//   2) a text carrying source_meta_json.corpus is EXCLUDED (the canonical discriminator);
//   3) «Все (N)» expands to search+grid; the client-side search narrows to the match;
//   4) tapping a card opens the SAME Room reader (title mounted, no pageerror);
//   5) 380px screenshot for the UI-review norm.
// Run: node scripts/premium/mytexts-smoke.js

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3297, BASE = "http://127.0.0.1:" + PORT;
const SHOT = path.join(REPO, ".tmp", "mytexts-380.png");
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
  const ok = (cond, msg) => { if (!cond) failures.push(msg); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    // corpus tab unhides once the catalog loads
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 20000 });

    // seed OPFS in-session: two OWN texts + one corpus-meta text (must be excluded)
    const seeded = await pg.evaluate(async () => {
      const db = await import("/db/local-db.js");
      await db.createText({ id: "mytexts-smoke-a", text_key: "mytexts-smoke-a", title: "שלום עולם — свой текст", source_text: "שלום עולם", level: "alef", tags_json: JSON.stringify(["ульпан"]) });
      await db.addSentence("mytexts-smoke-a", { id: "mytexts-smoke-a-s1", he_plain: "שלום עולם טוב", he_niqqud: "", ru: "привет добрый мир" });
      await db.createText({ id: "mytexts-smoke-b", text_key: "mytexts-smoke-b", title: "Второй свой текст", source_text: "טקסט" });
      await db.createText({ id: "mytexts-smoke-c", text_key: "mytexts-smoke-c", title: "CORPUS-META TEXT", source_text: "x", source_meta_json: JSON.stringify({ corpus: { byehuda_id: "999999" } }) });
      return true;
    }).catch((e) => { failures.push("seed failed: " + e.message); return false; });
    if (seeded) {
      // re-render the corpus home (tab away → back re-runs renderCorpus + injectHomeRails)
      await pg.click("#tabAccessible");
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".mytexts-shelf", { timeout: 15000 }).catch(() => failures.push("«Мои тексты» shelf did not render"));

      const shelfText = await pg.evaluate(() => { const s = document.querySelector(".mytexts-shelf"); return s ? s.textContent : ""; });
      ok(shelfText.includes("Второй свой текст"), "own text B missing from the shelf");
      ok(shelfText.includes("שלום עולם — свой текст") || shelfText.includes("שלום עולם"), "own Hebrew-titled text A missing from the shelf");
      ok(!shelfText.includes("CORPUS-META TEXT"), "corpus-meta text LEAKED into «Мои тексты» (discriminator broken)");

      // expand → search narrows
      await pg.click(".mytexts-toggle");
      await pg.waitForSelector(".mytexts-search", { timeout: 5000 }).catch(() => failures.push("expanded search input did not render"));
      await pg.fill(".mytexts-search", "Второй");
      await sleep(150);
      const gridCount = await pg.evaluate(() => document.querySelectorAll(".mytexts-grid .mytext-card-v").length);
      ok(gridCount === 1, "search 'Второй' expected exactly 1 card, got " + gridCount);
      await pg.fill(".mytexts-search", "");
      await sleep(150);

      await pg.screenshot({ path: SHOT });

      // tap a card → the SAME Room reader opens
      await pg.evaluate(() => { const cards = Array.from(document.querySelectorAll(".mytexts-grid .mytext-card-v")); const a = cards.find((c) => c.textContent.includes("שלום")); if (a) a.click(); });
      await pg.waitForFunction(() => { const t = document.getElementById("readerTitle"); return t && /שלום/.test(t.textContent || ""); }, { timeout: 15000 }).catch(() => failures.push("tapping an own-text card did not open the Room reader"));
    }
    ok(!pageErrors.length, "pageerror(s): " + pageErrors.join(" | "));
  } finally { await b.close(); await stop(srv.c); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s):"); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
  console.log("screenshot → " + path.relative(REPO, SHOT));
  console.log("PASS — mytexts smoke green (shelf + corpus-exclusion + search + reader-open @380px)");
})().catch((e) => { console.error("fatal:", e && e.stack || e); process.exit(1); });
