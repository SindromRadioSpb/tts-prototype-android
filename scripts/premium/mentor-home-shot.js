#!/usr/bin/env node
"use strict";

// mentor-home-shot.js — P9 «дом наставника» @380px light/dark/RTL скриншоты (R4-гейт).
// Состояния: Tier-1 честная заглушка (без сессии) · полный вид (4 блока: статус/consent,
// план с mock-LLM, история объяснений, конструкции) light/dark · HE (RTL).
// Сид — node-side fetch той же owner-сессией (bootstrap = один пользователь), страница
// логинится своей сессией через CloudSync.login. Output → .tmp/mentor-shots/*.png.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, ".tmp", "mentor-shots");
const PORT = 3309, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "shot-mentor-secret-0123456789abcdef";
const SENT_HE = "הילד קורא ספר גדול";
const TEXT_KEY = "own-mentor-shot-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "20", AGENT_LLM_DAILY_GLOBAL: "100" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 30000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; } } catch (_) {}
    await sleep(200);
  }
  return false;
}
async function api(method, p, { cookie, csrf, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}

async function seed() {
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "shot-seed" } });
  const sc = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  const cookie = String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0];
  const csrf = li.json.csrf;
  await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "cloud_texts", granted: true, version: require("../../public/js/cloud-sync.js").CLOUD_TEXTS_CONSENT_VERSION } });
  await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: true, version: "v1" } });
  await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
    artifact_key: TEXT_KEY, updated_at: "2026-07-01T00:00:00.000Z",
    payload: { manifest: { export_schema_version: 1, app_id: "linguist-pro-web" }, texts: [{
      text_key: TEXT_KEY, title: "Shot text",
      rows: [{ order_index: 0, hebrew_plain: SENT_HE, hebrew_niqqud: "", translit: "", russian: "мальчик читает большую книгу" }],
      created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z",
    }] },
  } });
  const keyed = await api("POST", "/api/learner/keying/resolve", { cookie, csrf, body: {
    words: SENT_HE.split(" ").map((s) => ({ surface: s })),
  } });
  const keyable = ((keyed.json && keyed.json.results) || []).filter((r) => r.keyable && r.item_key);
  const dueKey = keyable[0] ? keyable[0].item_key : null;
  if (dueKey) {
    const rows = [
      ["1", "2026-06-18T08:00:00.000Z", 3, "read:mc"],
      ["2", "2026-06-19T08:00:00.000Z", 3, "read:mc"],
      ["3", "2026-06-20T08:00:00.000Z", 1, "dictate:typed"],
      ["4", "2026-06-21T08:00:00.000Z", 1, "dictate:tiles"],
    ].map(([n, at, g, ch]) => ({ id: "mentor-shot:due:" + n, item_key: dueKey, kind: "review",
      reviewed_at: at, grade: g, source: "room-recall", channel: ch,
      meta_json: JSON.stringify({ keyer_version: 1 }) }));
    await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "mentor-shot-seed", schema_version: 1, keyer_version: 1, review_log: rows,
    } });
  }
  // два объяснения — лента истории непустая
  await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 0, scope_level: "sentence_only" } });
  await api("POST", "/api/agent/explain", { cookie, csrf, body: { text_key: TEXT_KEY, order_index: 0, scope_level: "sentence_only" } });
}

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("playwright missing:", e.message); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-mentor-shot-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready())) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const browser = await playwright.chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const shot = async (name) => { await pg.screenshot({ path: path.join(OUT, name), fullPage: false }); console.log("  →", name); };

    // 1) Tier-1 честная заглушка (без сессии), light
    await pg.goto(BASE + "/library.html?nocloudauto=1", { waitUntil: "load" });
    await pg.waitForSelector(".shelf, .room-state", { timeout: 15000 }).catch(() => {});
    await pg.evaluate(() => { try { localStorage.setItem("appTheme_v1", "light"); document.body.classList.add("theme-light"); } catch (_) {} });
    await pg.click("#roomMentor");
    await sleep(700);
    await shot("mentor-tier1-light.png");

    // 2) сид + логин страницы → полный вид
    await seed();
    await pg.evaluate(async (secret) => { await window.CloudSync.login(secret, "shot-device"); }, SECRET);
    // переоткрытие вида → refresh модуля с живой сессией
    await pg.click("#mentorBack");
    await sleep(200);
    await pg.click("#roomMentor");
    await sleep(900);
    // план по кнопке (mock-LLM)
    await pg.evaluate(() => { const b = document.querySelector(".mentor-plan-btn"); if (b) b.click(); });
    await sleep(1200);
    await shot("mentor-full-light.png");

    // 3) dark
    await pg.evaluate(() => { try { localStorage.setItem("appTheme_v1", "dark"); document.body.classList.remove("theme-light"); document.body.classList.add("theme-dark"); } catch (_) {} });
    await sleep(300);
    await shot("mentor-full-dark.png");

    // 4) HE (RTL), light
    await pg.evaluate(() => { try { localStorage.setItem("appTheme_v1", "light"); document.body.classList.remove("theme-dark"); document.body.classList.add("theme-light"); } catch (_) {} });
    await pg.evaluate((c) => window.appSetLocale && window.appSetLocale(c), "he");
    await sleep(900);
    await shot("mentor-full-he.png");

    // hash-контракт: deep-link #mentor открывает вид с холодного бута
    await pg.evaluate((c) => window.appSetLocale && window.appSetLocale(c), "ru");
    await pg.goto(BASE + "/library.html?nocloudauto=1#mentor", { waitUntil: "load" });
    await sleep(1200);
    const deepLinkOpen = await pg.evaluate(() => { const v = document.getElementById("roomMentorView"); return !!v && !v.hidden; });
    console.log("[mentor-shot] deep-link #mentor opens view:", deepLinkOpen);
    await shot("mentor-deeplink.png");

    await browser.close();
  } finally {
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  console.log("[mentor-shot] done →", OUT);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
