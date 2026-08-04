#!/usr/bin/env node
"use strict";

// room-media-smoke.js — Room media player gate (spec 2026-08-04, детерминированный, офлайн).
// Гоняет НАСТОЯЩУЮ library.html над OPFS (сид через /db/local-db.js в контексте страницы),
// медиа-байты пишутся прямо в OPFS media/ (валидные MPEG1-L3 кадры — плееру нужен настоящий mp3):
//   • карточка с паспортом+таймингом+байтами → бар, стейдж, 2×▶︎, karaoke seek/paint
//   • ▶︎-кнопки переживают rerenderReader (смена aids)
//   • паспорт в source_meta_json + timingDropReason → фолбэк колонок + честный noTiming
//   • паспорт без байтов → честный fileMissing + ссылка «Открыть в Студии», без ▶︎
//   • текст без паспорта → бара нет; закрытие ридера прячет бар; 🎧-бейдж в «Мои тексты»
//   • no pageerror

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3271;
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
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const SEED = `(async () => {
  const db = await import("/db/local-db.js");
  // ~2s валидного mp3: 80 кадров MPEG1 Layer3 128kbps/44.1kHz (заголовок FF FB 90 00 + нули).
  const frame = new Uint8Array(417); frame[0] = 0xFF; frame[1] = 0xFB; frame[2] = 0x90; frame[3] = 0x00;
  const buf = new Uint8Array(417 * 80); for (let i = 0; i < 80; i++) buf.set(frame, i * 417);
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("media", { create: true });
  const fh = await dir.getFileHandle("rmm-smoke.mp3", { create: true });
  const w = await fh.createWritable(); await w.write(buf); await w.close();

  const MEDIA = { opfsPath: "media/rmm-smoke.mp3", sha256: "rmm-smoke", mime: "audio/mpeg", sizeBytes: 417 * 80, durationSec: 2, originalName: "rmm.mp3" };
  const P_OK = { source: { audio: { v: 1, media: MEDIA,
    segments: [ { i: 0, start: 0, end: 0.4, text: "שלום עולם" }, { i: 1, start: 0.5, end: 1.0, text: "מה קורה היום" } ],
    timing: { v: 1, unit: "row", entries: [ { o: 0, t: 0, end: 0.4 }, { o: 1, t: 0.5, end: 1.0 } ] } } } };
  const P_NO_TIMING = { source: { audio: { v: 1, media: MEDIA, segments: [], timing: null, timingDropReason: "ASR_TIMING_INVALID" } } };
  const P_NO_BYTES = { source: { audio: { v: 1,
    media: { opfsPath: "media/rmm-absent.mp3", sha256: "rmm-absent", mime: "audio/mpeg" },
    segments: [ { i: 0, start: 0, end: 0.4, text: "אחת" }, { i: 1, start: 0.5, end: 1.0, text: "שתיים" } ],
    timing: { v: 1, unit: "row", entries: [ { o: 0, t: 0 }, { o: 1, t: 0.5 } ] } } } };

  try { await db.dbRun("DELETE FROM sentences WHERE text_id LIKE 'rmm-%'"); } catch (_) {}
  try { await db.dbRun("DELETE FROM texts WHERE id LIKE 'rmm-%'"); } catch (_) {}
  await db.createText({ id: "rmm-t1", text_key: "rmm-k1", title: "RMM ONE מדיה", source_text: "שלום עולם\\nמה קורה היום", table_model_meta_json: JSON.stringify(P_OK) });
  await db.addSentence("rmm-t1", { id: "rmm-t1-s1", he_plain: "שלום עולם", ru: "привет мир" });
  await db.addSentence("rmm-t1", { id: "rmm-t1-s2", he_plain: "מה קורה היום", ru: "что происходит" });
  await db.createText({ id: "rmm-t2", text_key: "rmm-k2", title: "RMM TWO", source_text: "טקסט", source_meta_json: JSON.stringify(P_NO_TIMING) });
  await db.addSentence("rmm-t2", { id: "rmm-t2-s1", he_plain: "טקסט", ru: "текст" });
  await db.createText({ id: "rmm-t3", text_key: "rmm-k3", title: "RMM THREE", source_text: "אחת\\nשתיים", table_model_meta_json: JSON.stringify(P_NO_BYTES) });
  await db.addSentence("rmm-t3", { id: "rmm-t3-s1", he_plain: "אחת", ru: "один" });
  await db.addSentence("rmm-t3", { id: "rmm-t3-s2", he_plain: "שתיים", ru: "два" });
  await db.createText({ id: "rmm-t4", text_key: "rmm-k4", title: "RMM FOUR", source_text: "רגיל" });
  await db.addSentence("rmm-t4", { id: "rmm-t4-s1", he_plain: "רגיל", ru: "обычный" });
  return true;
})()`;

async function main() {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("[room-media-smoke] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("[room-media-smoke] server failed"); srv.logs.forEach((l) => process.stderr.write(l)); await stopServer(srv.child); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const ok = (cond, msg) => { if (cond) console.log("  ✓ " + msg); else { failures.push(msg); console.log("  ✗ " + msg); } };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 20000 });

    const seeded = await pg.evaluate(SEED).catch((e) => { failures.push("seed failed: " + e.message); return false; });
    if (seeded) {
      // «Мои тексты» corpus grid
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".hub-cards", { timeout: 15000 });
      await pg.click('.hub-card[data-corpus="mytexts"]');
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 10000 });

      // 🎧-бейдж на карточке материала с медиа
      const badge = await pg.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".mytexts-grid .mytext-card-v"));
        const one = cards.find((c) => c.textContent.includes("RMM ONE"));
        const four = cards.find((c) => c.textContent.includes("RMM FOUR"));
        return { one: one ? !!one.querySelector(".mytext-media") : null, four: four ? !!four.querySelector(".mytext-media") : null };
      });
      ok(badge.one === true, "media badge 🎧 present on the media-imported card");
      ok(badge.four === false, "no media badge on a plain own text");

      const openCard = async (marker) => {
        await pg.evaluate((m) => { const cards = Array.from(document.querySelectorAll(".mytexts-grid .mytext-card-v")); const c = cards.find((x) => x.textContent.includes(m)); if (c) c.click(); }, marker);
        await pg.waitForFunction(() => { const r = document.getElementById("roomReader"); return r && !r.hidden; }, { timeout: 15000 });
      };
      const backToGrid = async () => {
        await pg.click("#readerBack");
        await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 10000 });
      };

      // ── rmm-t1: полный путь (байты + тайминг) ────────────────────────────────
      await openCard("RMM ONE");
      await pg.waitForFunction(() => {
        const stage = document.getElementById("roomMediaLocalStage");
        const p = document.getElementById("roomMediaLocalPlayer");
        return stage && !stage.hidden && p && p.getAttribute("src");
      }, { timeout: 15000 }).catch(() => failures.push("t1: local stage did not appear with a src"));
      const t1 = await pg.evaluate(() => ({
        barVisible: !(document.getElementById("roomMediaBar") || {}).hidden,
        note: (document.getElementById("roomMediaBarNote") || {}).textContent || "",
        replayButtons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
        bound: !!(window.StudioMediaKaraoke && window.StudioMediaKaraoke.getAudioEl()),
      }));
      ok(t1.barVisible, "t1: media bar visible");
      ok(t1.note === "", "t1: no honesty note (timing present), got '" + t1.note + "'");
      ok(t1.replayButtons === 2, "t1: 2 per-row replay buttons injected, got " + t1.replayButtons);
      ok(t1.bound, "t1: karaoke bound to the stage player");

      // seek + paint: seekToRow → currentTime сегмента, syncCurrent → .smk-row-active
      const seek = await pg.evaluate(() => {
        window.StudioMediaKaraoke.seekToRow(1);
        const el = window.StudioMediaKaraoke.getAudioEl();
        window.StudioMediaKaraoke.syncCurrent();
        return {
          curTime: el ? el.currentTime : -1,
          activeRow1: !!document.querySelector('#roomReaderTable tr[data-row-idx="1"].smk-row-active'),
        };
      });
      ok(Math.abs(seek.curTime - 0.5) < 0.3, "t1: seekToRow(1) moved player to ~0.5s, got " + seek.curTime);
      ok(seek.activeRow1, "t1: .smk-row-active painted on row 1 after sync");

      // rerender (смена aids) → кнопки re-инъецированы
      await pg.click("#readerAidsToggle");
      await pg.waitForSelector("#readerAids:not([hidden])", { timeout: 5000 });
      await pg.evaluate(() => { const sel = document.querySelector("#readerAids select"); if (sel && sel.options.length > 1) { sel.value = sel.options[sel.selectedIndex === 0 ? 1 : 0].value; sel.dispatchEvent(new Event("change")); } });
      await pg.waitForFunction(() => document.querySelectorAll("#roomReaderTable .smk-row-replay").length === 2, { timeout: 10000 }).catch(() => failures.push("t1: replay buttons did not survive rerenderReader"));
      console.log("  ✓ t1: replay buttons re-injected after aids rerender");
      await backToGrid();
      const barAfterClose = await pg.evaluate(() => (document.getElementById("roomMediaBar") || {}).hidden);
      ok(barAfterClose === true, "closing the reader hides the media bar");

      // ── rmm-t2: паспорт из source_meta_json (фолбэк колонок) + честный noTiming ──
      await openCard("RMM TWO");
      await pg.waitForFunction(() => !(document.getElementById("roomMediaBar") || {}).hidden, { timeout: 10000 }).catch(() => failures.push("t2: media bar did not appear (source_meta_json fallback broken)"));
      await sleep(600); // дать async-резолву блоба завершиться (note не должен смениться)
      const t2 = await pg.evaluate(() => ({
        note: (document.getElementById("roomMediaBarNote") || {}).textContent || "",
        expected: window.t("studio.media.noTiming"),
        replayButtons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
      }));
      ok(t2.note === t2.expected, "t2: honest noTiming note, got '" + t2.note + "'");
      ok(t2.replayButtons === 0, "t2: no replay buttons without timing, got " + t2.replayButtons);
      await backToGrid();

      // ── rmm-t3: байтов нет → fileMissing + «Открыть в Студии», без ▶︎ ──────────
      await openCard("RMM THREE");
      await pg.waitForFunction(() => {
        const n = document.getElementById("roomMediaBarNote");
        return n && n.textContent === window.t("studio.media.fileMissing");
      }, { timeout: 10000 }).catch(() => failures.push("t3: fileMissing note did not appear"));
      const t3 = await pg.evaluate(() => ({
        linkHidden: (document.getElementById("roomMediaStudioLink") || {}).hidden,
        linkHref: (document.getElementById("roomMediaStudioLink") || {}).getAttribute
          ? (document.getElementById("roomMediaStudioLink").getAttribute("href") || "") : "",
        replayButtons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
        stageHidden: (document.getElementById("roomMediaLocalStage") || {}).hidden,
      }));
      ok(t3.linkHidden === false, "t3: «Открыть в Студии» link visible");
      ok(t3.linkHref.includes("/index.html?room=1#/t/"), "t3: link deep-links to the Studio room-mode reader");
      ok(t3.replayButtons === 0, "t3: no replay buttons without bytes, got " + t3.replayButtons);
      ok(t3.stageHidden === true, "t3: local stage hidden without bytes");
      await backToGrid();

      // ── rmm-t4: без паспорта → бара нет ─────────────────────────────────────
      await openCard("RMM FOUR");
      await sleep(400);
      const t4 = await pg.evaluate(() => (document.getElementById("roomMediaBar") || {}).hidden);
      ok(t4 === true, "t4: no media bar on a passport-less text");
    }
    ok(!pageErrors.length, "no pageerror(s)" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s)"); process.exit(1); }
  console.log("[room-media-smoke] PASS");
}

main().catch((e) => { console.error("[room-media-smoke] crashed:", e); process.exit(1); });
