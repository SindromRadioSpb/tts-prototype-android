#!/usr/bin/env node
"use strict";

// room-mode-shot.js — BRR-P0-002a @380px screenshots: the room-mode reading
// view (clean, no Studio chrome) + the contra-case (chrome visible).
// Output → .tmp/room-shots/*.png (gitignored).

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO_ROOT, ".tmp", "room-shots");
const PORT = 3270;
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() { const c = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x))); return { child: c, logs }; }
async function stopServer(child) { if (!child || child.killed) return; child.kill("SIGTERM"); const ex = await new Promise((res) => { const tm = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(tm); res(true); }); }); if (ex) return; if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); }
async function waitForReady(t = 15000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }
function b64url(str) { return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function deepLink(id, room) { return "/index.html" + (room ? "?room=1" : "") + "#/t/" + b64url(JSON.stringify({ v: 1, type: "text", id })); }

const TID = "rt-t-shot";
const SEED = `(async () => {
  const ldb = await window.ensureLocalDB();
  try { await ldb.dbRun("DELETE FROM sentences WHERE text_id = ?", ["${TID}"]); } catch(_) {}
  try { await ldb.dbRun("DELETE FROM texts WHERE id = ?", ["${TID}"]); } catch(_) {}
  await ldb.createText({ id: "${TID}", text_key: "rt-k-shot", title: "בְּגִנַּת הַיְרָקוֹת", source_text: "…" });
  const R = [["שלום עולם","שָׁלוֹם עוֹלָם","shalom olam","привет мир"],["מה נשמע היום","מַה נִּשְׁמַע הַיּוֹם","ma nishma hayom","как дела сегодня"],["הילד קרא ספר","הַיֶּלֶד קָרָא סֵפֶר","hayeled kara sefer","ребёнок читал книгу"]];
  for (let i=0;i<R.length;i++){ const [hp,hn,tr,ru]=R[i]; try { await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, ru) VALUES (?,?,?,?,?,?,?)", ["${TID}-s"+i, "${TID}", i, hp, hn, tr, ru]); } catch(_) {} }
  return true;
})()`;

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("playwright missing:", e.message); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[room-mode-shot] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(500); }
    // NOTE: we do NOT preset any first-run flags — room-mode must suppress the
    // first-run modal chain itself (BRR-P0-002a). The contra shot dismisses them
    // manually (full app legitimately shows them on fresh OPFS).
    console.log("[room-mode-shot] seeded:", await pg.evaluate(SEED).catch((e) => String(e)));

    const waitReader = async () => { try { await pg.waitForFunction(() => { const tc = document.getElementById("tableContainer"); return tc && tc.querySelectorAll("tr").length > 0; }, { timeout: 15000 }); } catch (_) {} await sleep(600); };
    // Dismiss one-time onboarding/first-run overlays (test artifacts on fresh OPFS;
    // the real onboarded Room user won't see them). Generic: close any open modal.
    const dismissModals = async () => {
      for (let i = 0; i < 4; i++) {
        await pg.keyboard.press("Escape").catch(() => {});
        await pg.evaluate(() => {
          try { window.v3OnboardingDismiss && window.v3OnboardingDismiss(); } catch (_) {}
          try { window.byokOnboardingDismiss && window.byokOnboardingDismiss(true); } catch (_) {}
          document.querySelectorAll('[data-open="1"],[data-open="true"]').forEach((m) => { try { m.removeAttribute("data-open"); m.style.display = "none"; } catch (_) {} });
          ["v3OnboardingModal", "v3Phase6Modal", "byokOnboardingModal"].forEach((id) => { const e = document.getElementById(id); if (e) e.style.display = "none"; });
        }).catch(() => {});
        await sleep(250);
      }
    };
    const shot = async (n) => { await pg.screenshot({ path: path.join(OUT, n) }); console.log("  →", n); };

    // room-mode (?room=1), HE — the app itself suppresses first-run modals (no manual dismiss)
    await pg.goto(BASE + deepLink(TID, true), { waitUntil: "load" });
    await waitReader();
    await pg.evaluate(() => window.appSetLocale && window.appSetLocale("he")); await sleep(500);
    await shot("room-mode-he.png");

    // contra (no room=1), HE — full Studio chrome; dismiss first-run modals for a clean shot
    await pg.goto(BASE + deepLink(TID, false), { waitUntil: "load" });
    await waitReader();
    await pg.evaluate(() => window.appSetLocale && window.appSetLocale("he")); await sleep(500);
    await dismissModals();
    await shot("room-mode-contra-he.png");

    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(300); }
    await pg.evaluate(async () => { const l = await window.ensureLocalDB(); try { await l.dbRun("DELETE FROM sentences WHERE text_id = ?", ["rt-t-shot"]); await l.dbRun("DELETE FROM texts WHERE id = ?", ["rt-t-shot"]); } catch (_) {} }).catch(() => {});
    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("[room-mode-shot] done →", OUT);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
