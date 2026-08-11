#!/usr/bin/env node
"use strict";

// room-study-smoke.js — гейт учебного режима Зала (спека docs/superpowers/specs/2026-08-05-room-study-mode-design.md).
// Чистая математика ресайза проверяется в КОНТЕКСТЕ СТРАНИЦЫ (reader-core.js — ESM, пакет
// CommonJS, Node напрямую его не импортирует — тот же приём в reader-parity-smoke.js).
// DOM-инварианты режима — над настоящей library.html с сидом OPFS (шаблон room-media-smoke.js).

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3274;
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
async function ready(ms = 20000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const failures = [];
function ok(cond, msg) { if (!cond) { failures.push(msg); console.error("  x " + msg); } else { console.log("  + " + msg); } }

async function main() {
  const srv = startServer();
  if (!await ready()) { console.error("[room-study-smoke] server did not start"); await stopServer(srv.child); process.exit(1); }
  const { chromium } = require("playwright");
  const b = await chromium.launch();
  const pageErrors = [];
  try {
    // serviceWorkers: "block" — иначе SW отдаёт закешированный шелл и правки не видны.
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 845 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    // Сид ждёт ВИДИМОСТИ #tabCorpus, а не просто «БД отвечает»: замер 2026-08-05 в свежем
    // профиле — БД отзывается уже на ~1с, но первичный импорт канона идёт до ~32с и по ходу
    // пересоздаёт соединение, поэтому ранний сид падает с «reading 'statements'». Видимая
    // вкладка = импорт закончен = БД стабильна. Таймаут с запасом на медленную машину.
    // NB: сигнатура waitForFunction(fn, arg, options) — без null во втором аргументе
    // объект опций уходит в arg, а таймаут молча остаётся дефолтным (30с).
    const waitCorpusReady = () => pg.waitForFunction(
      () => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, null, { timeout: 90000 });
    await waitCorpusReady();

    // ── Секция 1: чистая математика связанного ресайза ──────────────────────
    console.log("[1] resize math");
    const math = await pg.evaluate(async () => {
      let m; try { m = await import("/js/reader-core.js"); } catch (e) { return { err: String(e) }; }
      if (typeof m.applyLinkedResize !== "function") return { err: "applyLinkedResize not exported" };
      const vis = { action: true, he: true, niqqud: true, translit: true, ru: true };
      const sum = (w) => [0, 1, 2, 3, 4].reduce((a, i) => a + w[i], 0);

      // (a) обычный сдвиг: сумма пары сохраняется, сумма всех = 100
      const w1 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w1, "he", "niqqud", 20, 20, 5);
      const a = { he: w1[1], niqqud: w1[2], total: sum(w1) };

      // (b) зеркальный сдвиг возвращает к исходному
      const w2 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w2, "he", "niqqud", 20, 20, 5);
      m.applyLinkedResize(vis, w2, "he", "niqqud", w2[1], w2[2], -5);
      const bsym = { he: w2[1], niqqud: w2[2] };

      // (c) кламп минимума: колонка не уходит ниже RESIZE_MIN_COL_PERCENT
      const w3 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w3, "he", "niqqud", 20, 20, -50);
      const c = { he: w3[1], min: m.RESIZE_MIN_COL_PERCENT, total: sum(w3) };

      // (d) кламп максимума
      const w4 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w4, "he", "niqqud", 20, 20, 500);
      const d = { he: w4[1], max: m.RESIZE_MAX_COL_PERCENT, total: sum(w4) };

      // (e) частичный набор колонок: сумма ВИДИМЫХ = 100
      const visPartial = { action: true, he: false, niqqud: true, translit: false, ru: true };
      const w5 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(visPartial, w5, "niqqud", "ru", 20, 24, 4);
      const e = { visibleTotal: w5[0] + w5[2] + w5[4] };
      return { a, bsym, c, d, e };
    });
    ok(!math.err, "reader-core: applyLinkedResize экспортирован (" + (math.err || "ok") + ")");
    if (!math.err) {
      ok(Math.abs(math.a.he - 25) < 1e-6 && Math.abs(math.a.niqqud - 15) < 1e-6,
        "resize: пара движется связанно (he 25 / niqqud 15), получено " + math.a.he + " / " + math.a.niqqud);
      ok(Math.abs(math.a.total - 100) < 1e-6, "resize: сумма всех = 100, получено " + math.a.total);
      ok(Math.abs(math.bsym.he - 20) < 1e-6 && Math.abs(math.bsym.niqqud - 20) < 1e-6,
        "resize: зеркальный сдвиг возвращает исходные ширины");
      ok(math.c.he >= math.c.min - 1e-6, "resize: минимум держится (" + math.c.he + " >= " + math.c.min + ")");
      ok(Math.abs(math.c.total - 100) < 1e-6, "resize: сумма после клампа минимума = 100");
      ok(math.d.he <= math.d.max + 1e-6, "resize: максимум держится (" + math.d.he + " <= " + math.d.max + ")");
      ok(Math.abs(math.e.visibleTotal - 100) < 1e-6,
        "resize: при частичном наборе сумма ВИДИМЫХ = 100, получено " + math.e.visibleTotal);
    }
    // ── сид OPFS: один текст с 12 строками (контента должно хватить на скролл) ──
    await pg.evaluate(async () => {
      const db = await import("/db/local-db.js");
      try { await db.dbRun("DELETE FROM sentences WHERE text_id LIKE 'rst-%'"); } catch (_) {}
      try { await db.dbRun("DELETE FROM texts WHERE id LIKE 'rst-%'"); } catch (_) {}
      await db.createText({ id: "rst-t1", text_key: "rst-k1", title: "RST STUDY", source_text: "טקסט" });
      for (let i = 0; i < 12; i++) {
        await db.addSentence("rst-t1", {
          id: "rst-t1-s" + i, he_plain: "שורה מספר " + i, he_niqqud: "שׁוּרָה מִסְפָּר " + i,
          translit: "shura mispar " + i, ru: "строка номер " + i,
        });
      }
      // rst-t2 — материал С МЕДИА: только на нём вне учебного режима вообще считается
      // высота окна таблицы, поэтому проверять её пересчёт можно лишь здесь.
      // ~2с валидного mp3: 80 кадров MPEG1 Layer3 128kbps/44.1kHz (приём room-media-smoke).
      const frame = new Uint8Array(417); frame[0] = 0xFF; frame[1] = 0xFB; frame[2] = 0x90; frame[3] = 0x00;
      const buf = new Uint8Array(417 * 80); for (let i = 0; i < 80; i++) buf.set(frame, i * 417);
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("media", { create: true });
      const fh = await dir.getFileHandle("rst-smoke.mp3", { create: true });
      const w = await fh.createWritable(); await w.write(buf); await w.close();
      const MEDIA = { opfsPath: "media/rst-smoke.mp3", sha256: "rst-smoke", mime: "audio/mpeg", sizeBytes: 417 * 80, durationSec: 2, originalName: "rst.mp3" };
      const passport = { source: { audio: { v: 1, media: MEDIA,
        segments: [{ i: 0, start: 0, end: 0.4, text: "שורה מספר 0" }, { i: 1, start: 0.5, end: 1.0, text: "שורה מספר 1" }],
        timing: { v: 1, unit: "row", entries: [{ o: 0, t: 0, end: 0.4 }, { o: 1, t: 0.5, end: 1.0 }] } } } };
      await db.createText({ id: "rst-t2", text_key: "rst-k2", title: "RST MEDIA", source_text: "שורה מספר 0\\nשורה מספר 1",
        table_model_meta_json: JSON.stringify(passport) });
      for (let i = 0; i < 12; i++) {
        await db.addSentence("rst-t2", { id: "rst-t2-s" + i, he_plain: "שורה מספר " + i, ru: "строка номер " + i });
      }
    });
    // Открыть засеянный материал: Корпус → «Мои тексты» → карточка RST STUDY.
    // Путь тот же, что в room-media-smoke — карточки «Моих текстов» живут в .mytexts-grid.
    const openStudyText = async (marker = "RST STUDY") => {
      await pg.goto(BASE + "/library.html", { waitUntil: "load" });
      await waitCorpusReady();
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".learning-home", { timeout: 20000 });
      await pg.click('.learning-corpus-entry[data-corpus="mytexts"]');
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 20000 });
      await pg.evaluate((m) => {
        const cards = [...document.querySelectorAll(".mytexts-grid .mytext-card-v")];
        const c = cards.find((x) => (x.textContent || "").includes(m));
        if (c) c.click();
      }, marker);
      await pg.waitForFunction(() => { const r = document.getElementById("roomReader"); return r && !r.hidden; }, null, { timeout: 20000 });
      await pg.waitForSelector("#proTable tbody tr", { timeout: 25000 });
      await waitLayoutSettled();
    };
    // Раскладка ридера доезжает асинхронно: чип покрытия дорисовывается В .reader-bar,
    // бар растёт, --room-thead-top пересчитывается и таблица уезжает. Мерить нужно по
    // САМОЙ таблице: у sticky-шапки top по определению не меняется, и как пробник
    // стабильности она бесполезна (первая версия этого гейта на ней и обманулась).
    const waitLayoutSettled = async () => {
      await pg.waitForFunction(() => {
        const t = document.getElementById("proTable");
        if (!t) return false;
        const top = Math.round(t.getBoundingClientRect().top);
        const prev = window.__rstTableTop;
        window.__rstTableTop = top;
        return prev === top;      // два последовательных замера совпали ⇒ раскладка встала
      }, null, { timeout: 20000, polling: 400 });
    };
    // Свежие координаты грипа НЕПОСРЕДСТВЕННО перед действием мыши.
    const gripPoint = async () => {
      await waitLayoutSettled();
      return pg.evaluate(() => {
        const g = [...document.querySelectorAll("#proTable thead .col-resizer")].find((x) => !x.classList.contains("hidden"));
        if (!g) return null;
        const r = g.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
      });
    };
    await openStudyText();

    // ── Секция 2: грипы ресайза ОЖИВЛЕНЫ (мышь и палец — один Pointer-путь) ──
    console.log("[2] column resize");
    const before = await pg.evaluate(() =>
      [...document.querySelectorAll("#proTable colgroup col")].map((c) => c.style.width).join("|"));
    const grip = await gripPoint();
    ok(!!grip, "грип ресайза найден в шапке таблицы Зала");
    if (grip) {
      // Кто реально лежит под курсором: настоящая мышь проходит hit-test, а синтетический
      // PointerEvent — нет, поэтому расхождение этих двух путей надо видеть в отчёте.
      const hitEl = await pg.evaluate((p) => {
        const e = document.elementFromPoint(p.x, p.y);
        return e ? (e.tagName + "." + (e.className || "") + "#" + (e.id || "")) : "(null)";
      }, grip);
      ok(/col-resizer/.test(hitEl), "под курсором именно грип, а не перекрывающий слой: " + hitEl);
      await pg.mouse.move(grip.x, grip.y);
      await pg.mouse.down();
      await pg.mouse.move(grip.x + 40, grip.y, { steps: 8 });
      await pg.mouse.up();
      const after = await pg.evaluate(() =>
        [...document.querySelectorAll("#proTable colgroup col")].map((c) => c.style.width).join("|"));
      ok(before !== after, "drag мышью МЕНЯЕТ ширины (было " + before + ", стало " + after + ")");
      const persisted = await pg.evaluate(() => localStorage.getItem("room.table.widths.v1"));
      ok(!!persisted && /baseWidths/.test(persisted), "ширины сохранены в room.table.widths.v1");
      const sum = await pg.evaluate(() =>
        [...document.querySelectorAll("#proTable colgroup col")].reduce((a, c) => a + parseFloat(c.style.width || 0), 0));
      ok(Math.abs(sum - 100) < 0.01, "сумма ширин видимых колонок = 100%, получено " + sum);

      // палец: тот же путь через Pointer Events (pointerType=touch)
      const before2 = await pg.evaluate(() =>
        [...document.querySelectorAll("#proTable colgroup col")].map((c) => c.style.width).join("|"));
      const g2 = await gripPoint();
      await pg.evaluate((p) => {
        const g = [...document.querySelectorAll("#proTable thead .col-resizer")].find((x) => !x.classList.contains("hidden"));
        const mk = (type, x) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: p.y, pointerId: 7, pointerType: "touch", isPrimary: true });
        g.dispatchEvent(mk("pointerdown", p.x));
        window.dispatchEvent(mk("pointermove", p.x - 30));
        window.dispatchEvent(mk("pointerup", p.x - 30));
      }, g2);
      const after2 = await pg.evaluate(() =>
        [...document.querySelectorAll("#proTable colgroup col")].map((c) => c.style.width).join("|"));
      ok(before2 !== after2, "drag ПАЛЬЦЕМ (pointerType=touch) меняет ширины");

      const hit = await pg.evaluate(() => {
        const g = [...document.querySelectorAll("#proTable thead .col-resizer")].find((x) => !x.classList.contains("hidden"));
        return { w: g.getBoundingClientRect().width, touchAction: getComputedStyle(g).touchAction };
      });
      ok(hit.touchAction === "none", "грип не отдаёт жест прокрутке (touch-action: none), получено " + hit.touchAction);
    }
    // ── Секция 3: панель «Аа» несёт контролы режима ─────────────────────────
    console.log("[3] aids panel");
    await pg.click("#readerAidsToggle");
    await pg.waitForSelector("#readerAids:not([hidden])", { timeout: 8000 });
    const panel = await pg.evaluate(() => {
      const p = document.getElementById("readerAids");
      return {
        hasToggle: !!p.querySelector("#roomStudyToggle"),
        hasSeg: !!p.querySelector("#roomActionColSeg"),
        segButtons: [...p.querySelectorAll("#roomActionColSeg button")].map((b) => b.getAttribute("data-mode")),
        hasReset: !!p.querySelector("#roomWidthsReset"),
        firstBlockIsStudy: !!(p.firstElementChild && p.firstElementChild.id === "roomStudyBlock"),
        rawKeys: /room\.study\./.test(p.textContent || ""),
        // Набор управляющих кнопок бара сверяем ПОИМЕННО: #readerCovChip — это чип
        // покрытия, который инжектится в тот же .reader-bar, поэтому счётчик врал бы.
        barIds: [...document.querySelectorAll("#roomReader .reader-bar button")].map((b) => b.id).sort().join(","),
      };
    });
    ok(panel.hasToggle, "панель: переключатель учебного режима присутствует");
    ok(panel.hasSeg && panel.segButtons.join(",") === "full,rail,hidden",
      "панель: сегмент служебной колонки full/rail/hidden, получено " + panel.segButtons.join(","));
    ok(panel.hasReset, "панель: кнопка сброса ширин присутствует");
    ok(panel.firstBlockIsStudy, "панель: блок учебного режима идёт ПЕРВЫМ");
    ok(!panel.rawKeys, "панель: нет непереведённых ключей room.study.* в тексте");
    ok(panel.barIds === "readerAidsToggle,readerBack,readerCovChip,readerFindToggle,roomReadAloud",
      "в .reader-bar тот же набор кнопок — новых не добавили (решение D2), получено " + panel.barIds);

    // дефолт служебной колонки при первом включении режима — «Рельс» (решение D4)
    await pg.evaluate(() => { localStorage.removeItem("room.actionColMode"); localStorage.removeItem("room.studyMode"); });
    await pg.click("#roomStudyToggle");
    await pg.waitForTimeout(300);
    const defMode = await pg.evaluate(() => localStorage.getItem("room.actionColMode"));
    ok(defMode === "rail", "первое включение режима ставит служебную колонку в «Рельс», получено " + defMode);
    const persistedMode = await pg.evaluate(() => localStorage.getItem("room.studyMode"));
    ok(persistedMode === "1", "состояние режима сохраняется (room.studyMode=1), получено " + persistedMode);
    // ── Секция 4: раскладка режима ──────────────────────────────────────────
    console.log("[4] study layout");
    await pg.evaluate(() => { localStorage.setItem("room.studyMode", "1"); localStorage.setItem("room.actionColMode", "rail"); });
    await openStudyText();
    const layout = await pg.evaluate(() => {
      const wrap = document.getElementById("roomReaderTable");
      const r = wrap.getBoundingClientRect();
      const hidden = (sel) => { const n = document.querySelector(sel); return !n || getComputedStyle(n).display === "none"; };
      const thead = document.querySelector("#proTable thead th");
      return {
        bodyHasClass: document.body.classList.contains("room-study"),
        readerPos: getComputedStyle(document.getElementById("roomReader")).position,
        headerHidden: hidden("header.room-header"),
        footerHidden: hidden("#roomFooter"),
        tipHidden: hidden("#readerTip"),
        chipHidden: hidden("#readerCovChip"),
        wrapOverflow: getComputedStyle(wrap).overflowY,
        wrapIsScroller: wrap.classList.contains("room-media-scroll"),
        wrapPctOfViewport: Math.round((r.height / window.innerHeight) * 100),
        theadTop: thead ? getComputedStyle(thead).top : null,
        maxH: wrap.style.maxHeight || "",
        vw: window.innerWidth,
      };
    });
    ok(layout.vw === 380, "вьюпорт ровно 380 CSS px, получено " + layout.vw);
    ok(layout.bodyHasClass, "body.room-study выставлен при открытом ридере");
    ok(layout.readerPos === "fixed", "#roomReader — fixed-колонка, получено " + layout.readerPos);
    ok(layout.headerHidden && layout.footerHidden && layout.tipHidden && layout.chipHidden,
      "шапка Зала, футер, подсказка и чип покрытия скрыты");
    ok(layout.wrapOverflow === "auto", "окно таблицы прокручивается само, получено " + layout.wrapOverflow);
    ok(layout.wrapIsScroller,
      "класс room-media-scroll ОСТАЁТСЯ — по нему караоке решает, какой скроллер двигать");
    ok(layout.wrapPctOfViewport >= 45,
      "таблице отдано >= 45% экрана (замер до фикса: 26%), получено " + layout.wrapPctOfViewport + "%");
    ok(parseFloat(layout.theadTop) === 0, "шапка таблицы липнет к верху ОКНА (top 0), получено " + layout.theadTop);
    ok(layout.maxH === "", 'в режиме JS не ставит max-height (высоту даёт flex), получено "' + layout.maxH + '"');

    // закрытие ридера снимает класс — иначе домашний экран остался бы без шапки
    await pg.click("#readerBack");
    await pg.waitForSelector("#roomContent:not([hidden])", { timeout: 15000 });
    const afterClose = await pg.evaluate(() => ({
      cls: document.body.classList.contains("room-study"),
      headerVisible: getComputedStyle(document.querySelector("header.room-header")).display !== "none",
      pref: localStorage.getItem("room.studyMode"),
    }));
    ok(!afterClose.cls, "выход из ридера снимает body.room-study");
    ok(afterClose.headerVisible, "шапка Зала возвращается на домашнем экране");
    ok(afterClose.pref === "1", "предпочтение режима переживает закрытие ридера");
    // ── Секция 5: рельс + анти-регресс главного дефекта ─────────────────────
    console.log("[5] rail");
    await pg.evaluate(() => {
      localStorage.setItem("room.studyMode", "1");
      localStorage.setItem("room.actionColMode", "rail");
      localStorage.setItem("room.heOn", "0");        // учебная конфигурация владельца:
      localStorage.setItem("room.translitOn", "0");  // видимы только Огласовки + Перевод
      localStorage.removeItem("room.table.widths.v1");
    });
    await openStudyText();
    const rail = await pg.evaluate(() => {
      const t = document.getElementById("proTable");
      const w = t.getBoundingClientRect().width;
      const px = (k) => { const th = t.querySelector('thead th[data-col="' + k + '"]'); return th ? th.getBoundingClientRect().width : 0; };
      const sum = [...t.querySelectorAll("colgroup col")].reduce((a, c) => a + parseFloat(c.style.width || 0), 0);
      const cell = t.querySelector('tbody td[data-col="action"]');
      return {
        tableWidth: w, action: px("action"), niqqud: px("niqqud"), ru: px("ru"),
        actionPct: (px("action") / w) * 100, sum,
        hasTts: !!(cell && cell.querySelector(".row-tts-btn")),
        hasExplain: !!(cell && cell.querySelector(".row-explain-btn")),
        hasBookmark: !!(cell && cell.querySelector(".row-bookmark-btn")),
      };
    });
    ok(Math.abs(rail.action - 34) <= 2, "рельс: служебная колонка ~34px, получено " + Math.round(rail.action));
    ok(rail.actionPct < 15,
      "АНТИ-РЕГРЕСС: доля служебной колонки не раздувается при двух содержательных колонках " +
      "(было 25.4%), получено " + rail.actionPct.toFixed(1) + "%");
    ok(Math.abs(rail.sum - 100) < 0.01, "рельс: сумма долей = 100%, получено " + rail.sum);
    ok(rail.niqqud > 130 && rail.ru > 155,
      "рельс: содержательные колонки выросли (было 114/137), получено " + Math.round(rail.niqqud) + "/" + Math.round(rail.ru));
    ok(rail.hasTts && rail.hasExplain && rail.hasBookmark,
      "рельс: кнопки строки ОСТАЛИСЬ в ячейке (tts/explain/bookmark: " +
      rail.hasTts + "/" + rail.hasExplain + "/" + rail.hasBookmark + ") — тупиков нет");

    // рельс переживает пересборку таблицы (смена настроек чтения)
    await pg.evaluate(() => { const p = document.getElementById("readerAids"); if (p && p.hidden) document.getElementById("readerAidsToggle").click(); });
    await pg.waitForSelector("#readerAids:not([hidden])", { timeout: 8000 });
    await pg.evaluate(() => {
      const cb = [...document.querySelectorAll("#readerAids label input[type=checkbox]")].filter((x) => x.id !== "roomStudyToggle")[0];
      if (cb) cb.click();     // «Иврит» вкл → rerenderReader
    });
    await pg.waitForTimeout(500);
    const afterRerender = await pg.evaluate(() => {
      const th = document.querySelector('#proTable thead th[data-col="action"]');
      return th ? th.getBoundingClientRect().width : 0;
    });
    ok(Math.abs(afterRerender - 34) <= 2, "рельс переживает rerenderReader, получено " + Math.round(afterRerender));

    // «Скрыта» убирает колонку из НАБОРА (вход билдера, не CSS)
    await pg.evaluate(() => { const b2 = document.querySelector('#roomActionColSeg button[data-mode="hidden"]'); if (b2) b2.click(); });
    await pg.waitForTimeout(500);
    const hiddenCols = await pg.evaluate(() => document.getElementById("proTable").getAttribute("data-cols"));
    ok(!/action/.test(hiddenCols || ""), "«Скрыта»: колонки action нет в data-cols, получено " + hiddenCols);
    // ── Секция 6: «Скрыта» — действия живут на активной строке ──────────────
    console.log("[6] hidden-mode overlay");
    await pg.evaluate(() => {
      localStorage.setItem("room.studyMode", "1");
      localStorage.setItem("room.actionColMode", "hidden");
    });
    await openStudyText();
    const noOverlayYet = await pg.evaluate(() => {
      const o = document.getElementById("roomRowActions");
      return !o || o.hidden;
    });
    ok(noOverlayYet, "«Скрыта»: без активной строки оверлея нет (не мозолит глаза)");

    // активная строка появляется штатным путём — подсветкой воспроизведения
    await pg.evaluate(() => {
      const tr = document.querySelector('#proTable tbody tr[data-row-idx="2"]');
      if (tr) tr.classList.add("row-playing");
      if (window.roomSyncActionOverlay) window.roomSyncActionOverlay();
    });
    await pg.waitForTimeout(300);
    const overlay = await pg.evaluate(() => {
      const o = document.getElementById("roomRowActions");
      if (!o || o.hidden) return null;
      const r = o.getBoundingClientRect();
      const tr = document.querySelector('#proTable tbody tr[data-row-idx="2"]');
      const rr = tr.getBoundingClientRect();
      return {
        buttons: [...o.querySelectorAll("button")].map((x) => x.getAttribute("data-act")),
        alignedToRow: Math.abs(r.top - rr.top) < 24,
        atLeadingEdge: Math.abs(r.left - rr.left) < 24,
      };
    });
    ok(!!overlay, "«Скрыта»: оверлей появился на активной строке");
    if (overlay) {
      ok(overlay.buttons.join(",") === "tts,bookmark,explain",
        "«Скрыта»: оверлей несёт кнопки строки, получено " + overlay.buttons.join(","));
      ok(overlay.alignedToRow && overlay.atLeadingEdge,
        "«Скрыта»: оверлей у левого края активной строки (там, где была колонка)");
    }
    // в режимах с колонкой оверлея быть не должно — иначе дубль управления.
    // Панель строится лениво: без её открытия кнопок сегмента в DOM ещё нет.
    await pg.evaluate(() => { const p = document.getElementById("readerAids"); if (p && p.hidden) document.getElementById("readerAidsToggle").click(); });
    await pg.waitForSelector("#readerAids:not([hidden])", { timeout: 8000 });
    await pg.evaluate(() => { const b3 = document.querySelector('#roomActionColSeg button[data-mode="rail"]'); if (b3) b3.click(); });
    await pg.waitForTimeout(400);
    const overlayGone = await pg.evaluate(() => {
      const o = document.getElementById("roomRowActions");
      return !o || o.hidden;
    });
    ok(overlayGone, "в режиме «Рельс» оверлея нет — управление не дублируется");
    // ── Секция 7: дисклеймер и честная высота вне режима ────────────────────
    console.log("[7] prov-note + honest height");
    await pg.evaluate(() => { localStorage.setItem("room.studyMode", "1"); localStorage.setItem("room.actionColMode", "rail"); });
    await openStudyText();
    const prov = await pg.evaluate(() => {
      const p = document.getElementById("readerProvNote");
      const wrap = document.getElementById("roomReaderTable");
      const t = document.getElementById("proTable");
      if (!p || !wrap || !t) return null;
      return {
        insideWrap: wrap.contains(p),
        afterTable: !!(t.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING),
        visibleAtTop: p.getBoundingClientRect().top < wrap.getBoundingClientRect().bottom,
      };
    });
    ok(prov && prov.insideWrap, "дисклеймер живёт ВНУТРИ окна таблицы");
    ok(prov && prov.afterTable, "дисклеймер идёт ПОСЛЕ таблицы (в конце материала)");
    ok(prov && !prov.visibleAtTop, "дисклеймер не виден, пока не доскроллили до конца");

    // переживает пересборку таблицы
    await pg.evaluate(() => { const p = document.getElementById("readerAids"); if (p && p.hidden) document.getElementById("readerAidsToggle").click(); });
    await pg.waitForSelector("#readerAids:not([hidden])", { timeout: 8000 });
    await pg.evaluate(() => {
      const cb = [...document.querySelectorAll("#readerAids label input[type=checkbox]")].filter((x) => x.id !== "roomStudyToggle")[0];
      if (cb) cb.click();
    });
    await pg.waitForTimeout(500);
    const provAfter = await pg.evaluate(() => {
      const p = document.getElementById("readerProvNote"), wrap = document.getElementById("roomReaderTable");
      return !!(p && wrap && wrap.contains(p));
    });
    ok(provAfter, "дисклеймер переживает rerenderReader");

    // ВНЕ режима высота окна таблицы считается только у материала С МЕДИА — на нём и
    // проверяем, что она отслеживает вьюпорт, а не замирает на значении при открытии.
    await pg.evaluate(() => { localStorage.setItem("room.studyMode", "0"); });
    await openStudyText("RST MEDIA");
    await pg.waitForFunction(() => {
      const w = document.getElementById("roomReaderTable");
      return !!(w && w.classList.contains("room-media-scroll") && /px/.test(w.style.maxHeight || ""));
    }, null, { timeout: 20000 });
    const h1 = await pg.evaluate(() => parseFloat(document.getElementById("roomReaderTable").style.maxHeight) || 0);
    await pg.setViewportSize({ width: 380, height: 640 });
    await pg.waitForTimeout(800);
    const h2 = await pg.evaluate(() => parseFloat(document.getElementById("roomReaderTable").style.maxHeight) || 0);
    ok(h1 > 0 && h2 > 0 && h2 < h1,
      "вне режима высота окна пересчитывается при уменьшении вьюпорта (" + Math.round(h1) + "px -> " + Math.round(h2) + "px)");
    await pg.setViewportSize({ width: 380, height: 845 });
    await pg.waitForTimeout(800);
    const h3 = await pg.evaluate(() => parseFloat(document.getElementById("roomReaderTable").style.maxHeight) || 0);
    ok(Math.abs(h3 - h1) < 30, "и возвращается назад при восстановлении вьюпорта (" + Math.round(h3) + "px ~ " + Math.round(h1) + "px)");

    // ГЛАВНЫЙ дефект вертикали: высота считалась при scrollY=0, когда шапка Зала (176px)
    // ещё в потоке. Прокрутив её прочь, пользователь эти пиксели таблице не возвращал.
    await pg.evaluate(() => window.scrollTo(0, 400));
    await pg.waitForTimeout(800);
    const hScrolled = await pg.evaluate(() => parseFloat(document.getElementById("roomReaderTable").style.maxHeight) || 0);
    ok(hScrolled > h3 + 20,
      "прокрутка шапки прочь ВОЗВРАЩАЕТ место таблице (" + Math.round(h3) + "px -> " + Math.round(hScrolled) + "px)");
    ok(!pageErrors.length, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s)"); process.exit(1); }
  console.log("[room-study-smoke] PASS");
}

main().catch((e) => { console.error("[room-study-smoke] crashed:", e); process.exit(1); });
