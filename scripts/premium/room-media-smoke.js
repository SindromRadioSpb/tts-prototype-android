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

  // t5 — КОМПОЗИТНЫЙ паспорт (Import Center / portable, кейс «В сокрытии - 1»): media только
  // с sha256 (БЕЗ opfsPath — контракт media-ref, релинк по SHA), сегменты в start_ms/end_ms,
  // timing: true (булева сводка), одна строка правлена (строгий align откажет → позиционный путь).
  // 24 реплики: контент ДЛИННЕЕ вьюпорта — иначе контекст-скроллу некуда ехать (max_scroll_top≈0).
  const HEB = "אבגדהוזחטיכלמנסעפצקרשתםן";
  const CUES = Array.from({ length: 24 }, (_, k) => "שורה מספר " + HEB[k] + " בטבלה");
  const fh2 = await dir.getFileHandle("rmm-comp.mp3", { create: true });
  const w2 = await fh2.createWritable(); await w2.write(buf); await w2.close();
  const P_COMPOSITE = { source: { audio: { v: 1,
    media: { sha256: "rmm-comp", mime: "audio/mpeg", originalName: "comp.mp3", sizeBytes: 417 * 80, durationSec: 2 },
    segments: CUES.map((t, k) => ({ authority: "corrected", caption_segment_id: "cue:" + k, quality_flags: [],
      source_segment_ids: [], speaker: null, start_ms: k * 200 + 100, end_ms: k * 200 + 280, text: t })),
    timing: true } } };
  await db.createText({ id: "rmm-t5", text_key: "rmm-k5", title: "RMM FIVE composite", source_text: CUES.join("\\n"), table_model_meta_json: JSON.stringify(P_COMPOSITE) });
  for (let i = 0; i < CUES.length; i++) {
    const he = i === 6 ? CUES[i] + " בערך" : CUES[i];   // одна правленая строка
    await db.addSentence("rmm-t5", { id: "rmm-t5-s" + i, he_plain: he, ru: "ряд " + i });
  }

  // t6 — video/mp4 mime → стейдж свопается в <video>; iOS-контракт playsinline обязан стоять
  // (декодируемость байтов не важна: своп и атрибуты — синхронный DOM до загрузки метаданных).
  const P_VIDEO = { source: { audio: { v: 1,
    media: { opfsPath: "media/rmm-smoke.mp3", sha256: "rmm-smoke", mime: "video/mp4", originalName: "v.mp4" },
    segments: [ { i: 0, start: 0, end: 0.4, text: "אחת" }, { i: 1, start: 0.5, end: 1.0, text: "שתיים" } ],
    timing: { v: 1, unit: "row", entries: [ { o: 0, t: 0 }, { o: 1, t: 0.5 } ] } } } };
  await db.createText({ id: "rmm-t6", text_key: "rmm-k6", title: "RMM SIX video", source_text: "אחת\\nשתיים", table_model_meta_json: JSON.stringify(P_VIDEO) });
  await db.addSentence("rmm-t6", { id: "rmm-t6-s1", he_plain: "אחת", ru: "один" });
  await db.addSentence("rmm-t6", { id: "rmm-t6-s2", he_plain: "שתיים", ru: "два" });

  // t7 — exact Studio binding wins when the saved composite passport cannot
  // derive timing (3 source cues vs 2 learning rows). This is the imported
  // portable-package shape that regressed on iPhone while Studio still worked.
  const EXACT_SHA = "e".repeat(64);
  const EXACT_CUES = ["פתיח מיותר", "שורה מדויקת אחת", "שורה מדויקת שתיים"];
  const P_EXACT = { source: { audio: { v: 1,
    media: { opfsPath: "media/rmm-comp.mp3", sha256: EXACT_SHA, mime: "audio/mpeg", originalName: "exact.mp3", sizeBytes: 417 * 80, durationSec: 2 },
    segments: EXACT_CUES.map((t, k) => ({ caption_segment_id: "saved:" + k, start_ms: k * 500, end_ms: k * 500 + 400, text: t })),
    timing: true } } };
  await db.createText({ id: "rmm-t7", text_key: "rmm-k7", title: "RMM SEVEN exact binding", source_text: EXACT_CUES.slice(1).join("\\n"), table_model_meta_json: JSON.stringify(P_EXACT) });
  await db.addSentence("rmm-t7", { id: "rmm-t7-s1", he_plain: EXACT_CUES[1], ru: "точная строка один" });
  await db.addSentence("rmm-t7", { id: "rmm-t7-s2", he_plain: EXACT_CUES[2], ru: "точная строка два" });
  const repo = window.MediaPackageRepository.createRepository(db, window.MediaPackageCore);
  const created = await repo.createPackage({ media: { sha256: EXACT_SHA, mime: "audio/mpeg", duration_ms: 2000,
      original_name: "exact.mp3", opfs_path: "media/rmm-comp.mp3", size_bytes: 417 * 80 },
    raw_revision: { role: "raw_original", track_fingerprint: "rmm-exact-binding", canonical_sha256: "d".repeat(64),
      segments: EXACT_CUES.map((t, k) => ({ source_segment_id: "source:" + k, start_ms: k * 500, end_ms: k * 500 + 400,
        text: t, speaker: null, quality_flags: [] })), provenance: { provider: "smoke" } } });
  const exactRevision = await repo.getRevision(created.corrected_revision_id);
  await repo.bindText({ text_id: "rmm-t7", package_id: created.package_id, track_id: created.corrected_track_id,
    revision_id: exactRevision.revision_id, revision_sha256: exactRevision.canonical_sha256,
    mapping: { schema: "studio-row-source-v2", rows: [
      { row_index: 0, caption_segment_id: exactRevision.segments[1].caption_segment_id },
      { row_index: 1, caption_segment_id: exactRevision.segments[2].caption_segment_id },
    ] } });
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
    // NB: сигнатура waitForFunction(fn, arg, options) — без null во втором аргументе объект
    // опций уходит в arg, а таймаут молча остаётся дефолтным (30с). Первичный импорт канона
    // в пустой OPFS замерен в ~32с (2026-08-05), то есть гейт держался на удаче.
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, null, { timeout: 90000 });

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
      // 2026-08-05: бар называет ПРИЧИНУ (MediaHost.timingDropExplain), а не общую строку —
      // фикстура несёт timingDropReason='ASR_TIMING_INVALID', значит ждём именно её текст.
      // Проверка усилена: заодно требуем, чтобы это НЕ была общая noTiming-заглушка (иначе
      // регресс «диагноз снова спрятан» прошёл бы мимо гейта).
      const t2 = await pg.evaluate(() => ({
        note: (document.getElementById("roomMediaBarNote") || {}).textContent || "",
        expected: window.t("studio.media.timingWhy.asrInvalid"),
        generic: window.t("studio.media.noTiming"),
        replayButtons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
      }));
      ok(t2.note === t2.expected, "t2: причина отсутствия караоке названа словами, got '" + t2.note + "'");
      ok(t2.note !== t2.generic, "t2: диагноз не спрятан за общей строкой noTiming");
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
      const t3mode = await pg.evaluate(() => {
        const wrap = document.getElementById("roomReaderTable");
        const th = wrap.querySelector("#proTable thead th");
        const bar = document.querySelector("#roomReader .reader-bar");
        return { windowed: wrap.classList.contains("room-media-scroll"),
                 thTop: th ? parseFloat(getComputedStyle(th).top) : null,
                 barH: bar ? bar.getBoundingClientRect().height : 0 };
      });
      ok(t3mode.windowed === false, "t3: no media visible → table stays in the page flow (no scroll window)");
      ok(t3mode.thTop != null && t3mode.thTop >= t3mode.barH - 1, "t3: window mode thead pins under the reader-bar (" + t3mode.thTop + " vs " + t3mode.barH + ")");
      ok(t3.linkHref.includes("/index.html?room=1#/t/"), "t3: link deep-links to the Studio room-mode reader");
      ok(t3.replayButtons === 0, "t3: no replay buttons without bytes, got " + t3.replayButtons);
      ok(t3.stageHidden === true, "t3: local stage hidden without bytes");
      await backToGrid();

      // ── rmm-t4: без паспорта → бара нет ─────────────────────────────────────
      await openCard("RMM FOUR");
      await sleep(400);
      const t4 = await pg.evaluate(() => (document.getElementById("roomMediaBar") || {}).hidden);
      ok(t4 === true, "t4: no media bar on a passport-less text");
      await backToGrid();

      // ── rmm-t5: композитный паспорт — SHA-фолбэк блоба + позиционный тайминг ──
      await openCard("RMM FIVE");
      await pg.waitForFunction(() => {
        const stage = document.getElementById("roomMediaLocalStage");
        const p = document.getElementById("roomMediaLocalPlayer");
        return stage && !stage.hidden && p && p.getAttribute("src");
      }, { timeout: 15000 }).catch(() => failures.push("t5: stage did not appear (SHA-fallback blob resolve broken)"));
      const t5 = await pg.evaluate(() => ({
        note: (document.getElementById("roomMediaBarNote") || {}).textContent || "",
        replayButtons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
        bound: !!(window.StudioMediaKaraoke && window.StudioMediaKaraoke.getAudioEl()),
      }));
      ok(t5.note === "", "t5: no honesty note (composite timing rebuilt), got '" + t5.note + "'");
      ok(t5.replayButtons === 24, "t5: 24 replay buttons on composite card, got " + t5.replayButtons);
      ok(t5.bound, "t5: karaoke bound via SHA-resolved blob");
      const t5seek = await pg.evaluate(() => {
        window.StudioMediaKaraoke.seekToRow(2);
        const el = window.StudioMediaKaraoke.getAudioEl();
        window.StudioMediaKaraoke.syncCurrent();
        return { curTime: el ? el.currentTime : -1,
                 active2: !!document.querySelector('#roomReaderTable tr[data-row-idx="2"].smk-row-active') };
      });
      ok(Math.abs(t5seek.curTime - 0.5) < 0.3, "t5: seekToRow(2) → ~0.5s (ms→sec conversion), got " + t5seek.curTime);
      ok(t5seek.active2, "t5: positional timing paints row 2");

      // МЕДИА-РЕЖИМ (зеркало Студии): таблица — собственное скролл-окно под закреплённым
      // плеером; шапка липнет к верху КОНТЕЙНЕРА; активная строка — вторая видимая ВНУТРИ окна.
      const ctx = await pg.evaluate(async () => {
        window.StudioMediaKaraoke.seekToRow(12);
        window.StudioMediaKaraoke.syncCurrent();
        await new Promise((r) => setTimeout(r, 400));   // scrollTop мгновенный (как в Студии)
        const wrap = document.getElementById("roomReaderTable");
        const th = wrap.querySelector("#proTable thead th");
        const cs = th ? getComputedStyle(th) : null;
        const active = wrap.querySelector("tr.smk-row-active");
        const prev = wrap.querySelector('tr[data-row-idx="11"]');
        const wrapRect = wrap.getBoundingClientRect();
        const prevH = prev ? prev.getBoundingClientRect().height : 0;
        return {
          mediaScroll: wrap.classList.contains("room-media-scroll"),
          maxHeight: wrap.style.maxHeight,
          wrapScrollTop: wrap.scrollTop,
          stickyPos: cs ? cs.position : null,
          stickyTop: cs ? cs.top : null,
          wrapTop: wrapRect.top,
          expected: wrapRect.top + Math.min(prevH + 2, wrap.clientHeight * 0.32),
          activeTop: active ? active.getBoundingClientRect().top : null,
          barVisible: (document.getElementById("roomMediaBar") || {}).getBoundingClientRect
            ? document.getElementById("roomMediaBar").getBoundingClientRect().top >= 0 : null,
        };
      });
      ok(ctx.mediaScroll, "media mode: table wrap is its OWN scroll container (room-media-scroll)");
      ok(/px/.test(ctx.maxHeight), "media mode: wrap has a JS-set max-height, got '" + ctx.maxHeight + "'");
      ok(ctx.stickyPos === "sticky" && parseFloat(ctx.stickyTop) === 0, "media mode: thead pins to the CONTAINER top (top 0), got " + ctx.stickyTop);
      ok(ctx.wrapScrollTop > 0, "media mode: follow scrolled the WRAP (scrollTop " + ctx.wrapScrollTop + "), not the page");
      ok(ctx.activeTop != null && Math.abs(ctx.activeTop - ctx.expected) < 24,
        "active row is the SECOND visible row inside the wrap (top " + ctx.activeTop + " ≈ " + ctx.expected + ")");
      ok(ctx.barVisible === true, "media bar (and player above it) stays on screen while following");
      const hdrStatic = await pg.evaluate(() => getComputedStyle(document.querySelector(".room-header")).position);
      ok(hdrStatic === "static", "site header is non-sticky while reading, got " + hdrStatic);
      await backToGrid();

      // ── rmm-t6: video-mime → <video> с playsinline (iOS не разворачивает в полный экран) ──
      await openCard("RMM SIX");
      await pg.waitForFunction(() => {
        const p = document.getElementById("roomMediaLocalPlayer");
        return p && p.tagName === "VIDEO";
      }, { timeout: 15000 }).catch(() => failures.push("t6: player did not swap to <video>"));
      const t6 = await pg.evaluate(() => {
        const p = document.getElementById("roomMediaLocalPlayer");
        return p ? { tag: p.tagName, inline: p.hasAttribute("playsinline"), webkit: p.hasAttribute("webkit-playsinline") } : null;
      });
      ok(t6 && t6.tag === "VIDEO", "t6: stage swapped to <video>");
      ok(t6 && t6.inline && t6.webkit, "t6: playsinline + webkit-playsinline present (iOS inline playback)");
      await backToGrid();

      // ── rmm-t7: off-by-one composite refuses inference; exact binding restores it ──
      await openCard("RMM SEVEN");
      await pg.waitForFunction(() => document.querySelectorAll("#roomReaderTable .smk-row-replay").length === 2,
        { timeout: 15000 }).catch(() => failures.push("t7: exact binding did not restore 2 replay buttons"));
      const t7 = await pg.evaluate(() => ({
        buttons: document.querySelectorAll("#roomReaderTable .smk-row-replay").length,
        source: window.StudioMediaKaraoke && window.StudioMediaKaraoke.getAudioPassport
          ? (window.StudioMediaKaraoke.getAudioPassport() || {}).timingSource : null,
      }));
      ok(t7.buttons === 2, "t7: exact binding restores 2/2 replay buttons despite 3/2 cue mismatch");
    }
    ok(!pageErrors.length, "no pageerror(s)" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s): " + failures.join(" | ")); process.exit(1); }
  console.log("[room-media-smoke] PASS");
}

main().catch((e) => { console.error("[room-media-smoke] crashed:", e); process.exit(1); });
