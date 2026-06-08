#!/usr/bin/env node
"use strict";

// room-mode-smoke.js — BRR-P0-002a gate. Opens a real seeded text via the
// index.html deep-link reader with `?room=1` and asserts the clean reading
// view, then the contra-case without `?room=1`. No network.
//   room-mode (?room=1):
//     • body.room-mode present (set pre-paint)
//     • Studio chrome hidden: .classic-shell-head, #classicStatusStrip,
//       #classicComposerPanel, #classicTtsCard, .row-note-btn (offsetParent===null)
//     • reading kept visible: #tableContainer (with rows), .row-tts-btn (▶ audio),
//       #tableSettings (column toggles = reading-aid)
//     • #roomReturnBar visible, link → /library.html (R4: non-dead-end)
//   contra (no room=1):
//     • body.room-mode ABSENT; .classic-shell-head VISIBLE (no leak)
//   • no pageerror

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3269;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c))); child.stderr.on("data", (c) => logs.push(String(c)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return; child.kill("SIGTERM");
  const exited = await new Promise((res) => { const tm = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(tm); res(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL");
}
async function waitForReady(t = 15000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

function b64urlEncode(str) { return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function deepLink(id, withRoom) { return "/index.html" + (withRoom ? "?room=1" : "") + "#/t/" + b64urlEncode(JSON.stringify({ v: 1, type: "text", id })); }

const TID = "rt-t-room1";
const SEED = `(async () => {
  const ldb = await window.ensureLocalDB();
  try { await ldb.dbRun("DELETE FROM sentences WHERE text_id = ?", ["${TID}"]); } catch(_) {}
  try { await ldb.dbRun("DELETE FROM texts WHERE id = ?", ["${TID}"]); } catch(_) {}
  await ldb.createText({ id: "${TID}", text_key: "rt-k-room1", title: "בְּגִנַּת הַיְרָקוֹת", source_text: "שלום עולם" });
  const rows = [["שלום עולם","שָׁלוֹם עוֹלָם","shalom olam","привет мир"],["מה נשמע","מַה נִּשְׁמַע","ma nishma","как дела"]];
  for (let i=0;i<rows.length;i++){ const [hp,hn,tr,ru]=rows[i];
    try { await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, ru) VALUES (?,?,?,?,?,?,?)", ["${TID}-s"+i, "${TID}", i, hp, hn, tr, ru]); } catch(e){ return String(e); } }
  return true;
})()`;

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[room-mode-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[room-mode-smoke] server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[room-mode-smoke] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));

    // seed via plain index.html (shared OPFS)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(500); }
    const seeded = await pg.evaluate(SEED).catch((e) => { console.error("seed error", e); return false; });
    test("text+sentences seeded", seeded === true, String(seeded));

    const waitForReader = async () => {
      try { await pg.waitForFunction(() => { const tc = document.getElementById("tableContainer"); return tc && tc.querySelectorAll("tr").length > 0; }, { timeout: 15000 }); } catch (_) {}
      await sleep(400);
    };
    // getClientRects() is robust for position:fixed modals — offsetParent is null
    // for fixed elements even when fully visible, which would false-pass "hidden".
    const vis = (sel) => pg.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; }, sel);
    const hidden = (sel) => pg.evaluate((s) => { const el = document.querySelector(s); return !el || el.getClientRects().length === 0; }, sel);

    // ── room-mode (?room=1) ──
    await pg.goto(BASE + deepLink(TID, true), { waitUntil: "load" });
    await waitForReader();
    test("body.room-mode is set (pre-paint from ?room=1)", await pg.evaluate(() => document.body.classList.contains("room-mode")));
    test("Studio: .classic-shell-head hidden", await hidden(".classic-shell-head"));
    test("Studio: #classicStatusStrip (billing) hidden", await hidden("#classicStatusStrip"));
    test("Studio: #classicComposerPanel (source) hidden", await hidden("#classicComposerPanel"));
    test("Studio: #classicTtsCard (synth-config) hidden", await hidden("#classicTtsCard"));
    test("Studio: #classicTranslationCard (translit/provider/keys) hidden", await hidden("#classicTranslationCard"));
    test("Studio: #classicResultPanel (save/export/provenance) hidden", await hidden("#classicResultPanel"));
    test("Studio: save-to-library button hidden", await hidden("#btnSaveToLibrary"));
    test("Studio: row note-btn hidden", await hidden(".row-note-btn"));
    test("reading: #tableContainer visible", await vis("#tableContainer"));
    test("reading: rows rendered", (await pg.evaluate(() => document.querySelectorAll("#tableContainer tr").length)) > 0);
    test("reading-aid: ▶ row-tts-btn visible (audio kept)", await vis(".row-tts-btn"));
    test("reading-aid: #tableSettings (column toggles) visible", await vis("#tableSettings"));
    test("#roomReturnBar visible (R4 non-dead-end)", await vis("#roomReturnBar"));
    test("back-link → /library.html", (await pg.evaluate(() => { const a = document.querySelector("#roomReturnBar .room-return-link"); return a && a.getAttribute("href"); })) === "/library.html");

    // ── first-run modal chain suppressed in room-mode (fresh OPFS, no flags set) ──
    test("first-run: Phase-6 migration modal NOT shown", await hidden("#v3Phase6Modal"));
    test("first-run: onboarding tour modal NOT shown", await hidden("#v3OnboardingModal"));
    test("first-run: BYOK onboarding modal NOT shown", await hidden("#byokOnboardingModal"));
    const flags = await pg.evaluate(() => ({
      phase6: localStorage.getItem("phase6FirstOpenSeen"),
      onboarding: localStorage.getItem("v3OnboardingSeenV1"),
      onboarding2: localStorage.getItem("onboardingSeen_v1"),
      byok: localStorage.getItem("v3.byokOnboardingDismissed"),
    }));
    test("first-run: seen-flags remain UNSET (suppress ≠ dismiss; full app still prompts later)", flags.phase6 === null && flags.onboarding === null && flags.onboarding2 === null && flags.byok === null, JSON.stringify(flags));

    // ── contra-case (no room=1) — Studio must be visible, no leak ──
    await pg.goto(BASE + deepLink(TID, false), { waitUntil: "load" });
    await waitForReader();
    test("contra: body.room-mode ABSENT (no leak)", await pg.evaluate(() => !document.body.classList.contains("room-mode")));
    test("contra: .classic-shell-head VISIBLE", await vis(".classic-shell-head"));

    test("no pageerror", errs.length === 0, errs[0]);

    // cleanup
    await pg.goto(BASE + "/index.html", { waitUntil: "load" }).catch(() => {});
    for (let i = 0; i < 20; i++) { if (await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false)) break; await sleep(300); }
    await pg.evaluate(async () => { const l = await window.ensureLocalDB(); try { await l.dbRun("DELETE FROM sentences WHERE text_id = ?", ["rt-t-room1"]); await l.dbRun("DELETE FROM texts WHERE id = ?", ["rt-t-room1"]); } catch (_) {} }).catch(() => {});

    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("\n[room-mode-smoke] " + passed + "/" + (passed + failed) + " passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[room-mode-smoke] fatal", e); process.exit(1); });
