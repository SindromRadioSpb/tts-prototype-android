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
    // #tabCorpus проявляется только когда БД поднялась — это и есть сигнал готовности к сиду.
    await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 25000 });

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
    });
    // Открыть засеянный материал: Корпус → «Мои тексты» → карточка RST STUDY.
    // Путь тот же, что в room-media-smoke — карточки «Моих текстов» живут в .mytexts-grid.
    const openStudyText = async () => {
      await pg.goto(BASE + "/library.html", { waitUntil: "load" });
      await pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, { timeout: 25000 });
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".hub-cards", { timeout: 20000 });
      await pg.click('.hub-card[data-corpus="mytexts"]');
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 20000 });
      await pg.evaluate(() => {
        const cards = [...document.querySelectorAll(".mytexts-grid .mytext-card-v")];
        const c = cards.find((x) => (x.textContent || "").includes("RST STUDY"));
        if (c) c.click();
      });
      await pg.waitForFunction(() => { const r = document.getElementById("roomReader"); return r && !r.hidden; }, { timeout: 20000 });
      await pg.waitForSelector("#proTable tbody tr", { timeout: 25000 });
    };
    await openStudyText();

    // ── Секция 2: грипы ресайза ОЖИВЛЕНЫ (мышь и палец — один Pointer-путь) ──
    console.log("[2] column resize");
    const before = await pg.evaluate(() =>
      [...document.querySelectorAll("#proTable colgroup col")].map((c) => c.style.width).join("|"));
    const grip = await pg.evaluate(() => {
      const g = [...document.querySelectorAll("#proTable thead .col-resizer")].find((x) => !x.classList.contains("hidden"));
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
    });
    ok(!!grip, "грип ресайза найден в шапке таблицы Зала");
    if (grip) {
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
      const g2 = await pg.evaluate(() => {
        const g = [...document.querySelectorAll("#proTable thead .col-resizer")].find((x) => !x.classList.contains("hidden"));
        const r = g.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
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
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s)"); process.exit(1); }
  console.log("[room-study-smoke] PASS");
}

main().catch((e) => { console.error("[room-study-smoke] crashed:", e); process.exit(1); });
