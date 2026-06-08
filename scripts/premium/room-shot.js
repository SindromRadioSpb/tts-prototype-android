#!/usr/bin/env node
"use strict";

// room-shot.js — BRR-P0-002 @380px RTL screenshots of the Reading Room surface.
// Seeds a Hebrew fixture via index.html (shared OPFS), then shoots library.html
// in HE (RTL) and RU. Output → .tmp/room-shots/*.png (gitignored).

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO_ROOT, ".tmp", "room-shots");
const PORT = 3267;
const BASE = `http://127.0.0.1:${PORT}`;

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

const SEED = `
(async () => {
  const ldb = await window.ensureLocalDB();
  // clean prior fixture
  try { await ldb.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); } catch(_) {}
  try { await ldb.dbRun("DELETE FROM texts WHERE id LIKE 'rt-t-%'"); } catch(_) {}
  const T = [
    ['rt-t-gan','rt-k-gan','בְּגִנַּת הַיְרָקוֹת'],
    ['rt-t-nad','rt-k-nad','נַד נֵד'],
    ['rt-t-prh','rt-k-prh','פִּרְחֵי הַשָּׂדֶה'],
    ['rt-t-men','rt-k-men','סֵפֶר הַקַּבְּצָנִים'],
  ];
  for (const [id,key,title] of T) { try { await ldb.createText({ id, text_key:key, title, source_text:'…' }); } catch(_) {} }
  const S = [
    { slug:'rt-bialik-kids', track:'accessible', order:0, title:'בִּיאַלִיק לַמַּתְחִילִים', editorial_intro:'שירי ילדים — כניסה רכה אל הקאנון.', items:[{text_key:'rt-k-gan',order:0},{text_key:'rt-k-nad',order:1},{text_key:'rt-k-prh',order:2}] },
    { slug:'rt-meshalim', track:'accessible', order:1, title:'מְשָׁלִים וְסִפּוּרִים קְצָרִים', editorial_intro:'טקסטים קצרים עם מוּסַר הַשְׂכֵּל.', items:[{text_key:'rt-k-gan',order:0},{text_key:'rt-k-prh',order:1}] },
    { slug:'rt-canon19', track:'literary', order:0, title:'הַקָּנוֹן שֶׁל הַמֵּאָה ה-19', editorial_intro:'מנדלי ועוד — טקסט מלא עם פיגומים מלאים.', items:[{text_key:'rt-k-men',order:0}] },
  ];
  for (const sh of S) { try { await ldb.createShelf(sh); } catch(_) {} }
  return true;
})()
`;

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("playwright missing:", e.message); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[room-shot] server up");
  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();

    // 1) seed via index.html (shared OPFS, same origin)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { const ok = await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false); if (ok) break; await sleep(500); }
    const seeded = await pg.evaluate(SEED).catch((e) => { console.error("seed error", e); return false; });
    console.log("[room-shot] seeded:", seeded);

    const shot = async (name) => { await pg.screenshot({ path: path.join(OUT, name) }); console.log("  →", name); };
    const setLocale = async (code) => { await pg.evaluate((c) => window.appSetLocale && window.appSetLocale(c), code); await sleep(400); };

    // 2) library.html populated — HE (RTL)
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForSelector(".shelf, .room-state", { timeout: 10000 }).catch(() => {});
    await setLocale("he"); await sleep(300);
    await shot("room-he-accessible.png");
    await pg.click("#tabLiterary").catch(() => {}); await sleep(300);
    await shot("room-he-literary.png");

    // 3) RU (LTR)
    await setLocale("ru"); await pg.click("#tabAccessible").catch(() => {}); await sleep(300);
    await shot("room-ru-accessible.png");

    // 4) empty-state (wipe via index.html, reload room)
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    for (let i = 0; i < 20; i++) { const ok = await pg.evaluate(() => !!window.ensureLocalDB).catch(() => false); if (ok) break; await sleep(500); }
    await pg.evaluate(async () => { const l = await window.ensureLocalDB(); try { await l.dbRun("DELETE FROM shelves WHERE slug LIKE 'rt-%'"); } catch (_) {} }).catch(() => {});
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForSelector(".shelf, .room-state", { timeout: 10000 }).catch(() => {});
    await setLocale("he"); await sleep(300);
    await shot("room-he-empty.png");

    await browser.close();
  } finally { await stopServer(srv.child); }
  console.log("[room-shot] done →", OUT);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
