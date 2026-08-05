# Room Study Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать Читальному залу «учебный режим»: экран отдаётся видео и таблице, служебная колонка сжимается до рельса 34px (или прячется), ширины колонок тянутся мышью и пальцем — всё из существующей панели «Аа».

**Architecture:** Всё делается **входом в parity-залоченный билдер** (`visibleColumns` / `baseWidths` в `readerConfig()`) и **post-render chrome + CSS**, тем же паттерном, что медиа-хост, закладки и 🤖. Движок ресайза Студии переносится в общий `public/js/reader-core.js` как чистая функция + тонкий DOM-биндер; `public/index.html` **не трогается**. Учебный режим — класс `body.room-study`, переводящий `#roomReader` в `position: fixed` flex-колонку, где таблица забирает остаток без арифметики высоты.

**Tech Stack:** Vanilla ES-модули (`public/js/*.js`), инлайновый CSS в `public/library.html`, i18n `public/i18n/locales/{ru,en,he}.js`, PWA `public/sw.js`, гейты — Node + Playwright (`scripts/premium/*-smoke.js`, стиль `room-media-smoke.js`).

**Спека:** `docs/superpowers/specs/2026-08-05-room-study-mode-design.md`
**Замеры:** `docs/research/room-study-mode-ux/2026-08-05/`

## Global Constraints

- `public/index.html` **не трогать** — Студия заморожена до Stage 2 (канон CLAUDE.md). Ресайз-движок в Студии остаётся своей копией.
- `buildBilingualTableHtml` в `public/js/reader-core.js` **не менять** — байт-паритет гейтится `npm run smoke:reader-parity`. Разрешено добавлять в файл **новые экспорты**, но не править существующий билдер.
- Каждая новая UI-строка обязана попасть во **все три** локали `public/i18n/locales/{ru,en,he}.js` — `tt(key, fallback)`-фолбэк недостижим при загруженном `t()`.
- Любое изменение `library.html` / локалей / шелла → **bump `CACHE_VERSION`** в `public/sw.js` (сейчас `"v3.11.309"` → `"v3.11.310"`).
- Мобильный контракт: проверка на **380×845 CSS px**. В тестовом браузере `devicePixelRatio` может быть 0.8 — тогда окно ставится 304×676; сверять по `window.innerWidth === 380`.
- Никаких новых кнопок в `.reader-bar` (решение владельца D2). Единственная точка входа — панель `#readerAids` («Аа»).
- Никаких новых жестов по строке: тап по слову = морфология, долгий тап по слову = статус, тап по «Переводу» = озвучка, тап по пустому месту строки = перемотка медиа.
- Персист-ключи: `room.studyMode`, `room.actionColMode`, `room.table.widths.v1`. Ключ Студии `ttsDashboard_table_settings_v1` **не трогать**.
- Константы: рельс = **34px**, `RESIZE_MIN_COL_PERCENT = 6`, `RESIZE_MAX_COL_PERCENT = 90`, базовые ширины `[15, 20, 20, 21, 24]` (порядок `TABLE_COL_ORDER = ["action","he","niqqud","translit","ru"]`).

---

## File Structure

| Файл | Ответственность |
|---|---|
| `public/js/reader-core.js` | **+** `RESIZE_MAX_COL_PERCENT`, `applyLinkedResize()` (чистая математика), `attachColumnResize()` (тонкий pointer-биндер). Существующий билдер и геометрия не меняются. |
| `public/js/library-ui.js` | Состояние режима и служебной колонки, блок панели «Аа», покраска ширин `<col>`, перенос дисклеймера, оверлей активной строки, ранний выход расчёта высоты, привязка ресайза. |
| `public/library.html` | CSS: `body.room-study` (fixed-flex, скрытие chrome, sticky-шапка окна), рельс, крупная хит-зона грипа, оверлей. |
| `public/i18n/locales/{ru,en,he}.js` | 9 новых ключей `room.study.*`. |
| `public/sw.js` | Bump `CACHE_VERSION`. |
| `scripts/premium/room-study-smoke.js` | Новый гейт: чистая математика (в контексте страницы, как `reader-parity-smoke`) + DOM-инварианты режима над реальной `library.html` с сидом OPFS (шаблон `room-media-smoke.js`). |
| `package.json` | `"smoke:room-study": "node scripts/premium/room-study-smoke.js"`. |

---

## Task 1: Чистая математика связанного ресайза в reader-core

**Files:**
- Modify: `public/js/reader-core.js` (добавить после `normalizeVisibleBaseWidthsTo100`, ~строка 232)
- Create: `scripts/premium/room-study-smoke.js`
- Modify: `package.json` (секция `scripts`)

**Interfaces:**
- Consumes: существующие экспорты `TABLE_COL_ORDER`, `RESIZE_MIN_COL_PERCENT`, `normalizeVisibleBaseWidthsTo100(visibleColumns, baseWidths)`.
- Produces:
  - `export const RESIZE_MAX_COL_PERCENT = 90;`
  - `export function applyLinkedResize(visibleColumns, baseWidths, leftKey, rightKey, startLeft, startRight, deltaPercent) -> baseWidths` (мутирует `baseWidths` на месте и возвращает его).

- [ ] **Step 1: Написать падающий гейт**

Создать `scripts/premium/room-study-smoke.js`. Гейт поднимает сервер и гоняет проверки **в контексте страницы** — `reader-core.js` это ESM, а пакет CommonJS, поэтому Node напрямую его не импортирует (тот же приём в `reader-parity-smoke.js:203`).

```js
#!/usr/bin/env node
"use strict";

// room-study-smoke.js — гейт учебного режима Зала (спека 2026-08-05).
// Чистая математика ресайза проверяется в контексте страницы (reader-core.js — ESM,
// пакет CommonJS), DOM-инварианты режима — над настоящей library.html с сидом OPFS.

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
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const failures = [];
function ok(cond, msg) { if (!cond) { failures.push(msg); console.error("  ✗ " + msg); } else { console.log("  ✓ " + msg); } }

async function main() {
  const srv = startServer();
  if (!await ready()) { console.error("[room-study-smoke] server did not start"); await stopServer(srv.child); process.exit(1); }
  const { chromium } = require("playwright");
  const b = await chromium.launch();
  try {
    const pg = await b.newPage({ viewport: { width: 380, height: 845 } });
    await pg.goto(BASE + "/library.html", { waitUntil: "domcontentloaded" });

    // ── Секция 1: чистая математика связанного ресайза ──────────────────────
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
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s)"); process.exit(1); }
  console.log("[room-study-smoke] PASS");
}

main().catch((e) => { console.error("[room-study-smoke] crashed:", e); process.exit(1); });
```

- [ ] **Step 2: Зарегистрировать npm-скрипт**

В `package.json`, в объект `scripts`, рядом с `"smoke:room-media"`:

```json
"smoke:room-study": "node scripts/premium/room-study-smoke.js",
```

- [ ] **Step 3: Прогнать гейт — должен упасть**

Run: `npm run smoke:room-study`
Expected: FAIL — `reader-core: applyLinkedResize экспортирован (Error: ... applyLinkedResize not exported)`

- [ ] **Step 4: Реализовать чистую функцию**

В `public/js/reader-core.js` сразу после `normalizeVisibleBaseWidthsTo100` (после строки `}` на ~232):

```js
// Верхний предел ширины одной колонки — защита от «почти всё в одну» (значение
// Студии, index.html RESIZE_MAX_COL_PERCENT). Пара min/max задаёт коридор drag'а.
export const RESIZE_MAX_COL_PERCENT = 90;

// Связанный ресайз пары соседних колонок: сумма пары сохраняется, поэтому таблица
// не «дышит» целиком, а перераспределяет ширину между двумя соседями. Портирован из
// index.html applyLinkedResize БЕЗ изменения поведения (Студия остаётся на своей копии
// до Stage 2). Мутирует baseWidths на месте — контракт остальных функций этого модуля.
export function applyLinkedResize(visibleColumns, baseWidths, leftKey, rightKey, startLeft, startRight, deltaPercent) {
  let newLeft = startLeft + deltaPercent;
  let newRight = startRight - deltaPercent;
  const min = RESIZE_MIN_COL_PERCENT;
  const max = RESIZE_MAX_COL_PERCENT;
  const total = startLeft + startRight;
  if (newLeft < min) { newLeft = min; newRight = total - newLeft; }
  if (newLeft > max) { newLeft = max; newRight = total - newLeft; }
  if (newRight < min) { newRight = min; newLeft = total - newRight; }
  if (newRight > max) { newRight = max; newLeft = total - newRight; }
  newLeft = Math.max(min, Math.min(max, newLeft));
  newRight = Math.max(min, Math.min(max, newRight));
  const li = TABLE_COL_ORDER.indexOf(leftKey);
  const ri = TABLE_COL_ORDER.indexOf(rightKey);
  if (li >= 0) baseWidths[li] = newLeft;
  if (ri >= 0) baseWidths[ri] = newRight;
  normalizeVisibleBaseWidthsTo100(visibleColumns, baseWidths);
  return baseWidths;
}
```

- [ ] **Step 5: Прогнать гейт — должен пройти**

Run: `npm run smoke:room-study`
Expected: PASS, 7 зелёных проверок секции 1.

- [ ] **Step 6: Убедиться, что билдер не задет**

Run: `npm run smoke:reader-parity`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add public/js/reader-core.js scripts/premium/room-study-smoke.js package.json
git commit -m "feat(room): applyLinkedResize в reader-core + гейт smoke:room-study"
```

---

## Task 2: Живой drag ширин в Зале (мышь + палец)

**Files:**
- Modify: `public/js/reader-core.js` (добавить после `applyLinkedResize`)
- Modify: `public/js/library-ui.js` (состояние ширин + привязка после рендера)
- Modify: `public/library.html` (CSS хит-зоны грипа)
- Modify: `scripts/premium/room-study-smoke.js` (секция 2)

**Interfaces:**
- Consumes: `applyLinkedResize`, `TABLE_COL_ORDER`, `computeEffectiveWidths`, `normalizeVisibleBaseWidthsTo100` из Task 1 и существующих экспортов.
- Produces:
  - `export function attachColumnResize(mount, opts) -> { detach() }`, где
    `opts = { getState: () => ({ visibleColumns, baseWidths }), onLiveUpdate: (baseWidths) => void, onCommit: (baseWidths) => void }`.
  - В `library-ui.js`: `roomTableWidths` (массив 5 чисел, персист `room.table.widths.v1`),
    `roomPaintColWidths()`, `roomResetColWidths()`.

- [ ] **Step 1: Дописать падающие проверки в гейт**

В `scripts/premium/room-study-smoke.js` добавить сид OPFS и секцию 2. Вставить перед `} finally {`:

```js
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
    await pg.reload({ waitUntil: "domcontentloaded" });
    const openStudyText = async () => {
      await pg.waitForSelector(".hub-card", { timeout: 15000 });
      await pg.evaluate(() => {
        const c = [...document.querySelectorAll(".hub-card")].find((x) => /Мои тексты/.test(x.textContent || ""));
        if (c) c.click();
      });
      await pg.waitForSelector("#roomContent .work-card-cta", { timeout: 15000 });
      await pg.evaluate(() => {
        const cards = [...document.querySelectorAll("#roomContent .work-card")];
        const card = cards.find((x) => /RST STUDY/.test(x.textContent || "")) || cards[0];
        const cta = card && card.querySelector(".work-card-cta");
        if (cta) cta.click();
      });
      await pg.waitForSelector("#proTable tbody tr", { timeout: 20000 });
    };
    await openStudyText();

    // ── Секция 2: грипы ресайза ОЖИВЛЕНЫ (мышь и палец — один Pointer-путь) ──
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

      // палец: тот же путь через Pointer Events (touchscreen-эмуляция Playwright)
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
```

- [ ] **Step 2: Прогнать гейт — секция 2 падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `drag мышью МЕНЯЕТ ширины (было 15%|20%|20%|21%|24%, стало 15%|20%|20%|21%|24%)`

- [ ] **Step 3: Реализовать биндер в reader-core**

В `public/js/reader-core.js` после `applyLinkedResize`:

```js
// Тонкий pointer-биндер связанного ресайза. Один и тот же путь обслуживает мышь на
// десктопе и палец на телефоне — Pointer Events не различают их, а `.col-resizer` уже
// несёт touch-action: none, поэтому прокрутка жест не перехватывает.
//   opts = {
//     getState,      // () => ({ visibleColumns, baseWidths }) — живое состояние вызывающего
//     onLiveUpdate,  // (baseWidths) => void — перекрасить <col> без пересборки таблицы
//     onCommit,      // (baseWidths) => void — персист по отпусканию
//     onResetPair,   // optional (leftKey, rightKey) => void — двойной тап по грипу
//   }
export function attachColumnResize(mount, opts) {
  opts = opts || {};
  if (!mount) return { detach() {} };
  const getState = typeof opts.getState === "function" ? opts.getState : () => null;
  const live = typeof opts.onLiveUpdate === "function" ? opts.onLiveUpdate : () => {};
  const commit = typeof opts.onCommit === "function" ? opts.onCommit : () => {};
  let drag = null;

  const gripAt = (target) => (target && target.closest ? target.closest(".col-resizer[data-resize='1']") : null);

  const onDown = (e) => {
    const grip = gripAt(e.target);
    if (!grip || grip.classList.contains("hidden")) return;
    const th = grip.closest("th"), table = grip.closest("table");
    if (!th || !table) return;
    const leftKey = th.getAttribute("data-col");
    if (!leftKey) return;
    const cols = (table.getAttribute("data-cols") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const li = cols.indexOf(leftKey);
    if (li < 0 || li + 1 >= cols.length) return;        // последняя колонка пары не имеет
    const rightKey = cols[li + 1];
    const widthPx = table.getBoundingClientRect().width;
    if (!widthPx || widthPx < 20) return;
    const st = getState();
    if (!st || !st.baseWidths) return;
    drag = {
      pointerId: e.pointerId, startX: e.clientX, widthPx, leftKey, rightKey,
      startLeft: Number(st.baseWidths[TABLE_COL_ORDER.indexOf(leftKey)]) || 0,
      startRight: Number(st.baseWidths[TABLE_COL_ORDER.indexOf(rightKey)]) || 0,
    };
    try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    try { document.body.classList.add("resizing-cols"); } catch (_) {}
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });
    e.preventDefault();
    e.stopPropagation();                                 // tap-seek Зала не должен видеть drag
  };

  const onMove = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const st = getState();
    if (!st || !st.baseWidths) return;
    const delta = ((e.clientX - drag.startX) / drag.widthPx) * 100;
    applyLinkedResize(st.visibleColumns, st.baseWidths, drag.leftKey, drag.rightKey, drag.startLeft, drag.startRight, delta);
    live(st.baseWidths);
    e.preventDefault();
  };

  const onUp = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    drag = null;
    try { document.body.classList.remove("resizing-cols"); } catch (_) {}
    window.removeEventListener("pointermove", onMove, { passive: false });
    window.removeEventListener("pointerup", onUp, { passive: false });
    window.removeEventListener("pointercancel", onUp, { passive: false });
    const st = getState();
    if (st && st.baseWidths) {
      normalizeVisibleBaseWidthsTo100(st.visibleColumns, st.baseWidths);
      live(st.baseWidths);
      commit(st.baseWidths);
    }
    e.preventDefault();
  };

  const onDbl = (e) => {
    const grip = gripAt(e.target);
    if (!grip || typeof opts.onResetPair !== "function") return;
    const th = grip.closest("th"), table = grip.closest("table");
    if (!th || !table) return;
    const leftKey = th.getAttribute("data-col");
    const cols = (table.getAttribute("data-cols") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const li = cols.indexOf(leftKey);
    if (li < 0 || li + 1 >= cols.length) return;
    opts.onResetPair(leftKey, cols[li + 1]);
    e.preventDefault();
  };

  mount.addEventListener("pointerdown", onDown);
  mount.addEventListener("dblclick", onDbl);
  return {
    detach() {
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("dblclick", onDbl);
      window.removeEventListener("pointermove", onMove, { passive: false });
      window.removeEventListener("pointerup", onUp, { passive: false });
      window.removeEventListener("pointercancel", onUp, { passive: false });
      drag = null;
    },
  };
}
```

- [ ] **Step 4: Состояние ширин в library-ui.js**

Рядом с `readerCfg` (после строки `function saveReaderCfg() {...}`, ~448) добавить:

```js
// ── Учебный режим: ширины колонок Зала ───────────────────────────────────────
// Хранятся ОТДЕЛЬНО от Студии (её ключ ttsDashboard_table_settings_v1 не трогаем):
// поверхности разные, и учебная раскладка не должна утаскивать за собой Студию.
// Массив позиционно выровнен к TABLE_COL_ORDER = [action, he, niqqud, translit, ru].
const ROOM_WIDTHS_KEY = 'room.table.widths.v1';
const ROOM_WIDTHS_DEFAULT = [15, 20, 20, 21, 24];
let roomTableWidths = ROOM_WIDTHS_DEFAULT.slice();
function loadRoomTableWidths() {
  try {
    const raw = localStorage.getItem(ROOM_WIDTHS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.baseWidths) || parsed.baseWidths.length !== 5) return;
    const nums = parsed.baseWidths.map((n) => Number(n));
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return;
    roomTableWidths = nums;
  } catch (_) {}
}
function saveRoomTableWidths() {
  try { localStorage.setItem(ROOM_WIDTHS_KEY, JSON.stringify({ baseWidths: roomTableWidths })); } catch (_) {}
}
function roomResetColWidths() {
  roomTableWidths = ROOM_WIDTHS_DEFAULT.slice();
  saveRoomTableWidths();
  roomPaintColWidths();
}
```

- [ ] **Step 5: Отдать живые ширины билдеру**

В `readerConfig()` (`library-ui.js:3479`) заменить строку

```js
    baseWidths: [15, 20, 20, 21, 24],
```

на

```js
    // ЖИВОЙ массив, а не литерал: билдер нормализует его на месте (контракт
    // normalizeVisibleBaseWidthsTo100), и результат drag'а переживает пересборку таблицы.
    baseWidths: roomTableWidths,
```

- [ ] **Step 6: Покраска `<col>` и привязка биндера**

Добавить рядом с `rerenderReader` (`library-ui.js:5451`):

```js
// Перекрасить <col> без пересборки таблицы. ВАЖНО: билдер пишет ширины ИНЛАЙНОМ
// (style="width:…%"), поэтому CSS-правилом их не задать — проверено, `!important`
// проигрывает. Значит ширины всегда назначаются здесь, в JS, после рендера.
function roomPaintColWidths() {
  const mount = $('roomReaderTable');
  const table = mount && mount.querySelector('#proTable');
  if (!table) return;
  const eff = readerCore.computeEffectiveWidths(readerConfig().visibleColumns, roomTableWidths);
  table.querySelectorAll('colgroup col[data-col]').forEach((c) => {
    const k = c.getAttribute('data-col');
    c.style.width = Number(eff[k] || 0).toFixed(6) + '%';
  });
}
let roomColResize = null;
function attachRoomColResize() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  if (roomColResize) { try { roomColResize.detach(); } catch (_) {} roomColResize = null; }
  roomColResize = readerCore.attachColumnResize(mount, {
    getState: () => ({ visibleColumns: readerConfig().visibleColumns, baseWidths: roomTableWidths }),
    onLiveUpdate: () => roomPaintColWidths(),
    onCommit: () => saveRoomTableWidths(),
    onResetPair: (leftKey, rightKey) => {
      const order = readerCore.TABLE_COL_ORDER;
      roomTableWidths[order.indexOf(leftKey)] = ROOM_WIDTHS_DEFAULT[order.indexOf(leftKey)];
      roomTableWidths[order.indexOf(rightKey)] = ROOM_WIDTHS_DEFAULT[order.indexOf(rightKey)];
      readerCore.normalizeVisibleBaseWidthsTo100(readerConfig().visibleColumns, roomTableWidths);
      saveRoomTableWidths();
      roomPaintColWidths();
    },
  });
}
```

- [ ] **Step 7: Вызывать привязку после каждого рендера**

В `attachReaderAudio()` (`library-ui.js:3491`) — она зовётся и из `rerenderReader`, и из открытия — добавить перед закрывающей строкой `karaokeActive = false; setReadAloudBtn(false);`:

```js
  attachRoomColResize();    // ресайз колонок переживает пересборку таблицы
  roomPaintColWidths();     // ширины из persisted-состояния
```

- [ ] **Step 8: Загрузить ширины при старте**

В `boot()` (`library-ui.js:9090`) сразу после `loadReaderCfg();`:

```js
  loadRoomTableWidths();   // ширины колонок Зала — до первого рендера таблицы
```

- [ ] **Step 9: Крупная хит-зона грипа**

В `public/library.html`, в блок стилей рядом с `#roomReader #proTable thead th` (~строка 1038), добавить:

```css
    /* Ресайз колонок в Зале: волосяная линия 10px недостижима пальцем (замер
       2026-08-05: 4 грипа 10×79px, попасть невозможно). На тач-устройствах —
       широкая невидимая зона захвата + видимая линия-подсказка. */
    @media (pointer: coarse) {
      #roomReader #proTable .col-resizer { width: 24px; right: -12px; }
    }
    #roomReader #proTable .col-resizer::after { background: var(--table-border); opacity: .55; }
    #roomReader #proTable th:hover .col-resizer::after { opacity: 1; }
```

- [ ] **Step 10: Bump SW**

В `public/sw.js:32` заменить `const CACHE_VERSION = "v3.11.309";` на `const CACHE_VERSION = "v3.11.310";`

- [ ] **Step 11: Прогнать гейт — должен пройти**

Run: `npm run smoke:room-study`
Expected: PASS, включая «drag мышью МЕНЯЕТ ширины», «drag ПАЛЬЦЕМ … меняет ширины», «сумма ширин = 100%».

- [ ] **Step 12: Прогнать соседние гейты**

Run: `npm run smoke:reader-parity && npm run smoke:room-media`
Expected: обе PASS.

- [ ] **Step 13: Коммит**

```bash
git add public/js/reader-core.js public/js/library-ui.js public/library.html public/sw.js scripts/premium/room-study-smoke.js
git commit -m "feat(room): живой ресайз колонок в Зале — мышь и палец, персист ширин"
```

---

## Task 3: Локали и блок панели «Аа»

**Files:**
- Modify: `public/i18n/locales/ru.js`, `public/i18n/locales/en.js`, `public/i18n/locales/he.js`
- Modify: `public/js/library-ui.js` (`buildAidsPanel`, состояние режима и служебной колонки)
- Modify: `scripts/premium/room-study-smoke.js` (секция 3)

**Interfaces:**
- Consumes: `roomTableWidths`, `roomResetColWidths()` из Task 2.
- Produces:
  - `studyModeOn() -> boolean`, `studyModeSet(on: boolean)`
  - `actionColMode() -> 'full' | 'rail' | 'hidden'`, `actionColModeSet(mode)`
  - i18n-ключи `room.study.toggle|hint|actionCol|actionFull|actionRail|actionHidden|widths|widthsHint|widthsReset`

- [ ] **Step 1: Дописать падающие проверки в гейт**

Добавить в `scripts/premium/room-study-smoke.js` после секции 2:

```js
    // ── Секция 3: панель «Аа» несёт контролы режима ─────────────────────────
    await pg.click('#readerAidsToggle');
    await pg.waitForSelector('#readerAids:not([hidden])', { timeout: 5000 });
    const panel = await pg.evaluate(() => {
      const p = document.getElementById('readerAids');
      return {
        hasToggle: !!p.querySelector('#roomStudyToggle'),
        hasSeg: !!p.querySelector('#roomActionColSeg'),
        segButtons: [...p.querySelectorAll('#roomActionColSeg button')].map((b) => b.getAttribute('data-mode')),
        hasReset: !!p.querySelector('#roomWidthsReset'),
        firstBlockIsStudy: p.firstElementChild && p.firstElementChild.id === 'roomStudyBlock',
        rawKeys: /room\.study\./.test(p.textContent || ''),
        barButtons: document.querySelectorAll('#roomReader .reader-bar button').length,
      };
    });
    ok(panel.hasToggle, 'панель: переключатель учебного режима присутствует');
    ok(panel.hasSeg && panel.segButtons.join(',') === 'full,rail,hidden',
      'панель: сегмент служебной колонки full/rail/hidden, получено ' + panel.segButtons.join(','));
    ok(panel.hasReset, 'панель: кнопка сброса ширин присутствует');
    ok(panel.firstBlockIsStudy, 'панель: блок учебного режима идёт ПЕРВЫМ');
    ok(!panel.rawKeys, 'панель: нет непереведённых ключей room.study.* в тексте');
    ok(panel.barButtons === 4, 'в .reader-bar по-прежнему 4 кнопки (новых не добавили), получено ' + panel.barButtons);

    // дефолт служебной колонки при первом включении режима — «Рельс» (решение D4)
    await pg.evaluate(() => { localStorage.removeItem('room.actionColMode'); });
    await pg.click('#roomStudyToggle');
    const defMode = await pg.evaluate(() => localStorage.getItem('room.actionColMode'));
    ok(defMode === 'rail', 'первое включение режима ставит служебную колонку в «Рельс», получено ' + defMode);
    const persisted = await pg.evaluate(() => localStorage.getItem('room.studyMode'));
    ok(persisted === '1', 'состояние режима сохраняется (room.studyMode=1), получено ' + persisted);
```

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `панель: переключатель учебного режима присутствует`

- [ ] **Step 3: Добавить ключи в русскую локаль**

В `public/i18n/locales/ru.js`, в объект `room` рядом с блоком `reader:` (~2510), добавить секцию:

```js
    study: {
      toggle: "🎬 Учебный режим",
      hint: "Экран отдаётся видео и таблице",
      actionCol: "Служебная колонка",
      actionFull: "Полная",
      actionRail: "Рельс",
      actionHidden: "Скрыта",
      widths: "Ширины колонок",
      widthsHint: "Тяните ‖ между заголовками; двойной тап — сброс пары",
      widthsReset: "↺ Сброс",
    },
```

- [ ] **Step 4: Добавить ключи в английскую локаль**

В `public/i18n/locales/en.js`, в тот же объект `room`:

```js
    study: {
      toggle: "🎬 Study mode",
      hint: "The screen goes to the video and the table",
      actionCol: "Service column",
      actionFull: "Full",
      actionRail: "Rail",
      actionHidden: "Hidden",
      widths: "Column widths",
      widthsHint: "Drag ‖ between headers; double-tap resets the pair",
      widthsReset: "↺ Reset",
    },
```

- [ ] **Step 5: Добавить ключи в ивритскую локаль**

В `public/i18n/locales/he.js`, в тот же объект `room`:

```js
    study: {
      toggle: "🎬 מצב לימוד",
      hint: "המסך מוקדש לווידאו ולטבלה",
      actionCol: "עמודת פעולות",
      actionFull: "מלאה",
      actionRail: "צרה",
      actionHidden: "מוסתרת",
      widths: "רוחב העמודות",
      widthsHint: "גררו ‖ בין הכותרות; הקשה כפולה מאפסת את הזוג",
      widthsReset: "↺ איפוס",
    },
```

- [ ] **Step 6: Состояние режима и служебной колонки**

В `public/js/library-ui.js` сразу после блока ширин из Task 2 добавить:

```js
// ── Учебный режим (спека 2026-08-05) ─────────────────────────────────────────
// Включается ТОЛЬКО вручную из панели «Аа» (решение владельца D5) — никакого
// автовключения для медиа-материалов. Класс body.room-study живёт лишь пока открыт
// ридер: он прячет шапку и футер, а на домашнем экране это было бы тупиком.
const STUDY_MODE_KEY = 'room.studyMode';
const ACTION_COL_KEY = 'room.actionColMode';
const ACTION_COL_MODES = ['full', 'rail', 'hidden'];
function studyModeOn() { try { return localStorage.getItem(STUDY_MODE_KEY) === '1'; } catch (_) { return false; } }
function actionColMode() {
  try {
    const v = localStorage.getItem(ACTION_COL_KEY);
    return ACTION_COL_MODES.indexOf(v) >= 0 ? v : 'rail';   // D4 — дефолт «Рельс»
  } catch (_) { return 'rail'; }
}
function actionColModeSet(mode) {
  const m = ACTION_COL_MODES.indexOf(mode) >= 0 ? mode : 'rail';
  try { localStorage.setItem(ACTION_COL_KEY, m); } catch (_) {}
  rerenderReader();          // 'hidden' меняет НАБОР колонок → нужна пересборка таблицы
}
function studyModeSet(on) {
  try { localStorage.setItem(STUDY_MODE_KEY, on ? '1' : '0'); } catch (_) {}
  // первое включение фиксирует дефолтный «Рельс», чтобы состояние было явным
  try { if (on && !localStorage.getItem(ACTION_COL_KEY)) localStorage.setItem(ACTION_COL_KEY, 'rail'); } catch (_) {}
  applyStudyModeClass();
  rerenderReader();
}
function applyStudyModeClass() {
  const readerOpen = !!($('roomReader') && !$('roomReader').hidden);
  document.body.classList.toggle('room-study', readerOpen && studyModeOn());
}
```

- [ ] **Step 7: Блок панели «Аа»**

В `buildAidsPanel()` (`library-ui.js:5461`) сразу после `panel.innerHTML = '';` и ДО объявления `addSelect` вставить:

```js
  // ── Блок учебного режима — ПЕРВЫМ в панели (решение D2: новых кнопок в баре нет) ──
  const studyBlock = el('div', { class: 'reader-study-block', attrs: { id: 'roomStudyBlock' } });
  const studyLab = el('label', { class: 'reader-aids-status' });
  const studyCb = el('input', { attrs: { type: 'checkbox', id: 'roomStudyToggle' } });
  studyCb.checked = studyModeOn();
  studyCb.addEventListener('change', () => studyModeSet(studyCb.checked));
  studyLab.appendChild(studyCb);
  studyLab.appendChild(el('span', { i18n: 'room.study.toggle', text: tt('room.study.toggle', '🎬 Учебный режим') }));
  studyBlock.appendChild(studyLab);
  studyBlock.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.study.hint', text: tt('room.study.hint', 'Экран отдаётся видео и таблице') }));

  // Служебная колонка: Полная / Рельс / Скрыта. Видимость СОДЕРЖАТЕЛЬНЫХ колонок уже
  // управляется элементами ниже — не дублируем; без переключателя была только эта.
  const segRow = el('div', { class: 'reader-study-row' });
  segRow.appendChild(el('span', { i18n: 'room.study.actionCol', text: tt('room.study.actionCol', 'Служебная колонка') }));
  const seg = el('div', { class: 'reader-study-seg', attrs: { id: 'roomActionColSeg', role: 'radiogroup', 'aria-label': tt('room.study.actionCol', 'Служебная колонка') } });
  [['full', 'room.study.actionFull', 'Полная'], ['rail', 'room.study.actionRail', 'Рельс'], ['hidden', 'room.study.actionHidden', 'Скрыта']]
    .forEach(([mode, key, fb]) => {
      const b = el('button', { i18n: key, text: tt(key, fb), attrs: { type: 'button', 'data-mode': mode, role: 'radio' } });
      b.setAttribute('aria-checked', String(actionColMode() === mode));
      b.addEventListener('click', () => {
        actionColModeSet(mode);
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute('data-mode') === mode)));
      });
      seg.appendChild(b);
    });
  segRow.appendChild(seg);
  studyBlock.appendChild(segRow);

  const wRow = el('div', { class: 'reader-study-row' });
  wRow.appendChild(el('span', { i18n: 'room.study.widths', text: tt('room.study.widths', 'Ширины колонок') }));
  const wReset = el('button', { i18n: 'room.study.widthsReset', text: tt('room.study.widthsReset', '↺ Сброс'), attrs: { type: 'button', id: 'roomWidthsReset' } });
  wReset.addEventListener('click', roomResetColWidths);
  wRow.appendChild(wReset);
  studyBlock.appendChild(wRow);
  studyBlock.appendChild(el('div', { class: 'reader-aids-hint', i18n: 'room.study.widthsHint', text: tt('room.study.widthsHint', 'Тяните ‖ между заголовками; двойной тап — сброс пары') }));
  panel.appendChild(studyBlock);
```

- [ ] **Step 8: CSS блока**

В `public/library.html` рядом с правилами `.reader-aids` добавить:

```css
    /* Блок учебного режима — первый в панели «Аа» (спека 2026-08-05). */
    .reader-study-block { border-bottom: 1px solid var(--border-soft); padding-bottom: 10px; margin-bottom: 10px; }
    .reader-study-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; font-size: 13px; }
    .reader-study-seg { display: inline-flex; border: 1px solid var(--border-soft); border-radius: 8px; overflow: hidden; }
    .reader-study-seg button {
      width: auto; appearance: none; border: 0; background: transparent; color: var(--text-secondary);
      font: inherit; padding: 6px 10px; cursor: pointer;
    }
    .reader-study-seg button[aria-checked="true"] { background: var(--accent); color: var(--accent-contrast); font-weight: 700; }
    #roomWidthsReset { width: auto; appearance: none; border: 1px solid var(--border-soft); background: transparent; color: var(--text-secondary); border-radius: 7px; padding: 5px 10px; font: inherit; cursor: pointer; }
```

- [ ] **Step 9: Прогнать гейты**

Run: `npm run smoke:room-study && npm run smoke:i18n`
Expected: обе PASS. `smoke:i18n` подтверждает наличие ключей во всех трёх локалях и отсутствие дублей.

- [ ] **Step 10: Коммит**

```bash
git add public/i18n/locales public/js/library-ui.js public/library.html scripts/premium/room-study-smoke.js
git commit -m "feat(room): блок учебного режима в панели «Аа» + локали ru/en/he"
```

---

## Task 4: Раскладка учебного режима — экран отдаётся таблице

**Files:**
- Modify: `public/library.html` (CSS `body.room-study`)
- Modify: `public/js/library-ui.js` (`roomMediaApplyLayout`, `openReader`, `closeReader`, `_karaokeRowFollowable`)
- Modify: `scripts/premium/room-study-smoke.js` (секция 4)

**Interfaces:**
- Consumes: `studyModeOn()`, `applyStudyModeClass()` из Task 3.
- Produces: инвариант «в учебном режиме `#roomReaderTable` — flex-остаток и собственный скроллер с классом `room-media-scroll`».

- [ ] **Step 1: Дописать падающие проверки**

Добавить в гейт секцию 4:

```js
    // ── Секция 4: раскладка режима ──────────────────────────────────────────
    await pg.evaluate(() => { localStorage.setItem('room.studyMode', '1'); });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await openStudyText();
    const layout = await pg.evaluate(() => {
      const wrap = document.getElementById('roomReaderTable');
      const r = wrap.getBoundingClientRect();
      const hidden = (sel) => { const n = document.querySelector(sel); return !n || getComputedStyle(n).display === 'none'; };
      const thead = document.querySelector('#proTable thead th');
      return {
        bodyHasClass: document.body.classList.contains('room-study'),
        readerPos: getComputedStyle(document.getElementById('roomReader')).position,
        headerHidden: hidden('header.room-header'),
        footerHidden: hidden('#roomFooter'),
        tipHidden: hidden('#readerTip'),
        wrapOverflow: getComputedStyle(wrap).overflowY,
        wrapIsScroller: wrap.classList.contains('room-media-scroll'),
        wrapPctOfViewport: Math.round((r.height / window.innerHeight) * 100),
        theadTop: thead ? getComputedStyle(thead).top : null,
        vw: window.innerWidth,
      };
    });
    ok(layout.vw === 380, 'вьюпорт ровно 380 CSS px, получено ' + layout.vw);
    ok(layout.bodyHasClass, 'body.room-study выставлен при открытом ридере');
    ok(layout.readerPos === 'fixed', '#roomReader — fixed-колонка, получено ' + layout.readerPos);
    ok(layout.headerHidden && layout.footerHidden && layout.tipHidden, 'шапка Зала, футер и подсказка скрыты');
    ok(layout.wrapOverflow === 'auto', 'окно таблицы прокручивается само, получено ' + layout.wrapOverflow);
    ok(layout.wrapIsScroller,
      'класс room-media-scroll ОСТАЁТСЯ — по нему караоке решает, какой скроллер двигать');
    ok(layout.wrapPctOfViewport >= 45,
      'таблице отдано >= 45% экрана (замер до фикса: 26%), получено ' + layout.wrapPctOfViewport + '%');
    ok(parseFloat(layout.theadTop) === 0, 'шапка таблицы липнет к верху ОКНА (top 0), получено ' + layout.theadTop);
    const noMaxH = await pg.evaluate(() => document.getElementById('roomReaderTable').style.maxHeight || '');
    ok(noMaxH === '', 'в режиме JS не ставит max-height (высоту даёт flex), получено "' + noMaxH + '"');

    // закрытие ридера снимает класс — иначе домашний экран остался бы без шапки
    await pg.click('#readerBack');
    await pg.waitForSelector('#roomContent:not([hidden])', { timeout: 10000 });
    const afterClose = await pg.evaluate(() => ({
      cls: document.body.classList.contains('room-study'),
      headerVisible: getComputedStyle(document.querySelector('header.room-header')).display !== 'none',
      pref: localStorage.getItem('room.studyMode'),
    }));
    ok(!afterClose.cls, 'выход из ридера снимает body.room-study');
    ok(afterClose.headerVisible, 'шапка Зала возвращается на домашнем экране');
    ok(afterClose.pref === '1', 'предпочтение режима переживает закрытие ридера');
```

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `body.room-study выставлен при открытом ридере`

- [ ] **Step 3: CSS режима**

В `public/library.html` рядом с блоком `#roomReader .reader-table-wrap.room-media-scroll` (~строка 1043) добавить:

```css
    /* ── УЧЕБНЫЙ РЕЖИМ (спека 2026-08-05) ────────────────────────────────────
       Замер @380×845 до фикса: из 845px экрана таблице доставалось 220px (26%,
       одна видимая строка) — 779px съедали шапка, бар, подсказка, видео,
       дисклеймер и футер. Режим отдаёт остаток экрана таблице и убирает
       арифметику высоты: раскладка — flex-колонка, а не вычисленный max-height. */
    body.room-study header.room-header,
    body.room-study #readerTip,
    body.room-study #readerCovChip,
    body.room-study #roomFooter { display: none !important; }
    body.room-study #roomReader {
      position: fixed; inset: 0; z-index: 5;
      display: flex; flex-direction: column;
      max-width: none; margin: 0;
      background: var(--bg-page);
    }
    body.room-study #roomReader .reader-bar,
    body.room-study #roomMediaBar,
    body.room-study #readerAids,
    body.room-study #readerFind,
    body.room-study #readerSubtitle { flex: 0 0 auto; }
    body.room-study #readerAids { max-height: 60vh; overflow-y: auto; }
    body.room-study #roomReaderTable {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; max-height: none !important; padding: 0 8px 8px;
    }
    /* Таблица скроллится в СВОЁМ окне ⇒ шапка липнет к верху контейнера, а не окна
       браузера. Без этого правила она уезжает на высоту бара и оставляет пустую полосу. */
    body.room-study #roomReader #proTable thead th { top: 0 !important; }
```

- [ ] **Step 4: Класс на открытии и закрытии ридера**

В `openReader()` (`library-ui.js:5651`) сразу после строки с `classList.add('room-reading')` добавить:

```js
  try { applyStudyModeClass(); } catch (_) {}   // учебный режим живёт только внутри ридера
```

В `closeReader()` (`library-ui.js:5809`) сразу после строки с `classList.remove('room-reading')` добавить:

```js
  try { document.body.classList.remove('room-study'); } catch (_) {}   // домашний экран без шапки был бы тупиком
```

- [ ] **Step 5: Ранний выход расчёта высоты — но класс остаётся**

В `roomMediaApplyLayout()` (`library-ui.js:3633`) заменить тело функции на:

```js
function roomMediaApplyLayout() {
  const wrap = $('roomReaderTable'); if (!wrap) return;
  const stage = $('roomMediaLocalStage'), yt = $('roomMediaYtMount');
  const mediaVisible = (stage && !stage.hidden) || (yt && !yt.hidden);
  // Учебный режим: окно таблицы — flex-остаток, считать нечего. Но КЛАСС обязан
  // остаться: по нему roomMediaFollowRange решает, какой скроллер двигать, и без
  // него слежение караоке ушло бы в ветку страничного скролла (спека, ловушка).
  if (document.body.classList.contains('room-study')) {
    wrap.classList.add('room-media-scroll');
    wrap.style.maxHeight = '';
    return;
  }
  if (mediaVisible) {
    wrap.classList.add('room-media-scroll');
    // высота окна таблицы = остаток вьюпорта под плеером; меряется от ЖИВОГО rect,
    // поэтому пересчёт обязателен на скролле/повороте (шапка Зала уезжает — место
    // должно вернуться таблице). Раньше расчёт делался единожды при scrollY=0.
    const h = Math.max(220, window.innerHeight - Math.max(0, wrap.getBoundingClientRect().top) - 10);
    wrap.style.maxHeight = h + 'px';
  } else {
    wrap.classList.remove('room-media-scroll');
    wrap.style.maxHeight = '';
  }
}
```

- [ ] **Step 6: Полоса «следования» караоке считается от активного скроллера**

Заменить `_karaokeRowFollowable` (`library-ui.js:3533`) на:

```js
function _karaokeRowFollowable(tr) {
  try {
    const r = tr.getBoundingClientRect();
    // В учебном/медиа-режиме прокручивается ОКНО ТАБЛИЦЫ, а не страница: полосу
    // «человек следит за воспроизведением» надо мерить от того же скроллера, иначе
    // «уступи ручному скроллу / вернись» срабатывает не там, куда смотрит человек.
    const mount = $('roomReaderTable');
    const inWindow = mount && mount.classList.contains('room-media-scroll');
    const box = inWindow ? mount.getBoundingClientRect() : null;
    const top = box ? box.top : 0;
    const height = box ? box.height : (window.innerHeight || document.documentElement.clientHeight || 0);
    if (!height) return false;
    const center = (r.top + r.bottom) / 2;
    return center > top + height * 0.15 && center < top + height * 0.85;
  } catch (_) { return false; }
}
```

- [ ] **Step 7: Прогнать гейт**

Run: `npm run smoke:room-study`
Expected: PASS, включая «таблице отдано >= 45% экрана».

- [ ] **Step 8: Прогнать медиа-гейт (он проверяет ту же геометрию вне режима)**

Run: `npm run smoke:room-media`
Expected: PASS — вне учебного режима поведение не изменилось.

- [ ] **Step 9: Коммит**

```bash
git add public/library.html public/js/library-ui.js scripts/premium/room-study-smoke.js
git commit -m "feat(room): раскладка учебного режима — экран отдан видео и таблице"
```

---

## Task 5: Рельс — служебная колонка 34px

**Files:**
- Modify: `public/js/library-ui.js` (`readerConfig`, `roomPaintColWidths`)
- Modify: `public/library.html` (компактный CSS рельса)
- Modify: `scripts/premium/room-study-smoke.js` (секция 5)

**Interfaces:**
- Consumes: `actionColMode()` (Task 3), `roomPaintColWidths()` (Task 2).
- Produces: `ROOM_RAIL_PX = 34`; `roomPaintColWidths()` учитывает режим рельса.

- [ ] **Step 1: Дописать падающие проверки**

Добавить в гейт секцию 5:

```js
    // ── Секция 5: рельс + анти-регресс главного дефекта ─────────────────────
    await pg.evaluate(() => {
      localStorage.setItem('room.studyMode', '1');
      localStorage.setItem('room.actionColMode', 'rail');
      localStorage.setItem('room.heOn', '0');        // учебная конфигурация владельца:
      localStorage.setItem('room.translitOn', '0');  // видимы только Огласовки + Перевод
      localStorage.removeItem('room.table.widths.v1');
    });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await openStudyText();
    const rail = await pg.evaluate(() => {
      const t = document.getElementById('proTable');
      const w = t.getBoundingClientRect().width;
      const px = (k) => { const th = t.querySelector('thead th[data-col="' + k + '"]'); return th ? th.getBoundingClientRect().width : 0; };
      const sum = [...t.querySelectorAll('colgroup col')].reduce((a, c) => a + parseFloat(c.style.width || 0), 0);
      const cell = t.querySelector('tbody td[data-col="action"]');
      const btn = cell && cell.querySelector('.row-tts-btn');
      return {
        tableWidth: w, action: px('action'), niqqud: px('niqqud'), ru: px('ru'),
        actionPct: (px('action') / w) * 100, sum,
        hasTts: !!btn, hasExplain: !!cell.querySelector('.row-explain-btn'), hasBookmark: !!cell.querySelector('.row-bookmark-btn'),
      };
    });
    ok(Math.abs(rail.action - 34) <= 2, 'рельс: служебная колонка ≈34px, получено ' + Math.round(rail.action));
    ok(rail.actionPct < 15,
      'АНТИ-РЕГРЕСС: доля служебной колонки не раздувается при двух содержательных колонках ' +
      '(было 25.4%), получено ' + rail.actionPct.toFixed(1) + '%');
    ok(Math.abs(rail.sum - 100) < 0.01, 'рельс: сумма долей = 100%, получено ' + rail.sum);
    ok(rail.niqqud > 130 && rail.ru > 155,
      'рельс: содержательные колонки выросли (было 114/137), получено ' + Math.round(rail.niqqud) + '/' + Math.round(rail.ru));
    ok(rail.hasTts && rail.hasExplain && rail.hasBookmark,
      'рельс: ▶, 🤖 и ☆ ОСТАЛИСЬ в ячейке — тупиков нет');

    // рельс переживает пересборку таблицы (смена настроек чтения)
    await pg.evaluate(() => { const p = document.getElementById('readerAids'); if (p && p.hidden) document.getElementById('readerAidsToggle').click(); });
    await pg.waitForSelector('#readerAids:not([hidden])', { timeout: 5000 });
    await pg.evaluate(() => {
      const cb = [...document.querySelectorAll('#readerAids label input[type=checkbox]')][0];
      if (cb) cb.click();     // «Иврит» вкл → rerenderReader
    });
    await pg.waitForTimeout(400);
    const afterRerender = await pg.evaluate(() => {
      const t = document.getElementById('proTable');
      const th = t.querySelector('thead th[data-col="action"]');
      return th ? th.getBoundingClientRect().width : 0;
    });
    ok(Math.abs(afterRerender - 34) <= 2, 'рельс переживает rerenderReader, получено ' + Math.round(afterRerender));

    // «Скрыта» убирает колонку из НАБОРА (вход билдера, не CSS)
    await pg.evaluate(() => { localStorage.setItem('room.actionColMode', 'hidden'); });
    await pg.evaluate(() => { const b = document.querySelector('#roomActionColSeg button[data-mode="hidden"]'); if (b) b.click(); });
    await pg.waitForTimeout(400);
    const hiddenCols = await pg.evaluate(() => document.getElementById('proTable').getAttribute('data-cols'));
    ok(!/action/.test(hiddenCols || ''), '«Скрыта»: колонки action нет в data-cols, получено ' + hiddenCols);
```

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `рельс: служебная колонка ≈34px, получено 85`

- [ ] **Step 3: Служебная колонка как вход билдера**

В `readerConfig()` (`library-ui.js:3472`) заменить строку `action: true,` на:

```js
      // «Скрыта» убирает колонку из НАБОРА — это легальный вход parity-залоченного
      // билдера (Студия делает так же), а не косметика поверх готовой таблицы.
      action: actionColMode() !== 'hidden',
```

- [ ] **Step 4: Рельс в покраске ширин**

Заменить `roomPaintColWidths()` (добавлена в Task 2) на:

```js
// Ширина рельса. Замер живого DOM: содержимое action-ячейки занимает 57px при колонке
// 85px, а ▶ появляется только на активной строке — то есть колонка была широкой не из-за
// иконок, а из-за доли. 34px хватает на ▶ 26×26 плюс рамки, ничего не теряется.
const ROOM_RAIL_PX = 34;
function roomPaintColWidths() {
  const mount = $('roomReaderTable');
  const table = mount && mount.querySelector('#proTable');
  if (!table) return;
  const visible = readerConfig().visibleColumns;
  const eff = readerCore.computeEffectiveWidths(visible, roomTableWidths);
  const cols = [...table.querySelectorAll('colgroup col[data-col]')];
  if (!cols.length) return;
  const total = table.getBoundingClientRect().width;
  const railOn = actionColMode() === 'rail' && visible.action && total > 0
    && cols.some((c) => c.getAttribute('data-col') === 'action');
  if (railOn) {
    // Пересчёт ПОСЛЕ нормализации: доля action фиксируется в пикселях, остальное
    // делится между содержательными колонками пропорционально их базам. Иначе доля
    // action снова уплывёт при смене набора колонок (корень исходной жалобы: 15%→25.4%).
    const railPct = Math.min(40, (ROOM_RAIL_PX / total) * 100);
    const rest = 100 - railPct;
    let sum = 0;
    cols.forEach((c) => { const k = c.getAttribute('data-col'); if (k !== 'action') sum += Number(eff[k] || 0); });
    if (sum <= 0) sum = 1;
    cols.forEach((c) => {
      const k = c.getAttribute('data-col');
      const pct = k === 'action' ? railPct : (Number(eff[k] || 0) / sum) * rest;
      c.style.width = pct.toFixed(6) + '%';
    });
    return;
  }
  cols.forEach((c) => {
    const k = c.getAttribute('data-col');
    c.style.width = Number(eff[k] || 0).toFixed(6) + '%';
  });
}
```

- [ ] **Step 5: Компактный CSS рельса**

В `public/library.html`, следом за CSS учебного режима из Task 4, добавить:

```css
    /* Рельс: колонка сжата до 34px — иконки центрируются и теряют лишние отступы.
       Ничего не прячем: ▶ (и сегодня видимый только на активной строке), 🤖 и ☆
       остаются на месте, сжимается пустота. */
    body.room-study.study-rail #proTable td[data-col="action"] { padding: 2px 0; }
    body.room-study.study-rail #proTable .col-action-row { justify-content: center; gap: 0; }
    body.room-study.study-rail #proTable .row-tts-btn { width: 26px; height: 26px; min-width: 0; padding: 0; font-size: 12px; }
    body.room-study.study-rail #proTable .row-explain-btn,
    body.room-study.study-rail #proTable .row-bookmark-btn { font-size: 13px; line-height: 1.15; padding: 0; }
    body.room-study.study-rail #proTable .row-audio-ind { display: none; }
```

- [ ] **Step 6: Класс режима рельса на body**

В `applyStudyModeClass()` (Task 3) заменить тело на:

```js
function applyStudyModeClass() {
  const readerOpen = !!($('roomReader') && !$('roomReader').hidden);
  const on = readerOpen && studyModeOn();
  document.body.classList.toggle('room-study', on);
  document.body.classList.toggle('study-rail', on && actionColMode() === 'rail');
}
```

И в `actionColModeSet(mode)` добавить вызов перед `rerenderReader()`:

```js
  applyStudyModeClass();
```

- [ ] **Step 7: Прогнать гейт**

Run: `npm run smoke:room-study`
Expected: PASS, включая «АНТИ-РЕГРЕСС: доля служебной колонки не раздувается».

- [ ] **Step 8: Коммит**

```bash
git add public/js/library-ui.js public/library.html scripts/premium/room-study-smoke.js
git commit -m "feat(room): рельс служебной колонки 34px + анти-регресс раздувания доли"
```

---

## Task 6: «Скрыта» — действия на активной строке

**Files:**
- Modify: `public/js/library-ui.js` (оверлей)
- Modify: `public/library.html` (CSS оверлея)
- Modify: `scripts/premium/room-study-smoke.js` (секция 6)

**Interfaces:**
- Consumes: `actionColMode()` (Task 3).
- Produces: `roomSyncActionOverlay()` — синхронизирует оверлей `#roomRowActions` с активной строкой.

- [ ] **Step 1: Дописать падающие проверки**

Добавить в гейт секцию 6:

```js
    // ── Секция 6: «Скрыта» — действия живут на активной строке ──────────────
    await pg.evaluate(() => {
      localStorage.setItem('room.studyMode', '1');
      localStorage.setItem('room.actionColMode', 'hidden');
    });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await openStudyText();
    const noOverlayYet = await pg.evaluate(() => {
      const o = document.getElementById('roomRowActions');
      return !o || o.hidden;
    });
    ok(noOverlayYet, '«Скрыта»: без активной строки оверлея нет (не мозолит глаза)');

    // активная строка появляется штатным путём — подсветкой воспроизведения
    await pg.evaluate(() => {
      const tr = document.querySelector('#proTable tbody tr[data-row-idx="2"]');
      if (tr) tr.classList.add('row-playing');
      if (window.roomSyncActionOverlay) window.roomSyncActionOverlay();
    });
    await pg.waitForTimeout(200);
    const overlay = await pg.evaluate(() => {
      const o = document.getElementById('roomRowActions');
      if (!o || o.hidden) return null;
      const r = o.getBoundingClientRect();
      const tr = document.querySelector('#proTable tbody tr[data-row-idx="2"]');
      const rr = tr.getBoundingClientRect();
      return {
        buttons: [...o.querySelectorAll('button')].map((b) => b.getAttribute('data-act')),
        alignedToRow: Math.abs(r.top - rr.top) < 24,
        atLeadingEdge: Math.abs(r.left - rr.left) < 24,
      };
    });
    ok(!!overlay, '«Скрыта»: оверлей появился на активной строке');
    if (overlay) {
      ok(overlay.buttons.join(',') === 'tts,bookmark,explain',
        '«Скрыта»: оверлей несёт ▶/☆/🤖, получено ' + overlay.buttons.join(','));
      ok(overlay.alignedToRow && overlay.atLeadingEdge,
        '«Скрыта»: оверлей у левого края активной строки (там, где была колонка)');
    }
```

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `«Скрыта»: оверлей появился на активной строке`

- [ ] **Step 3: Реализовать оверлей**

В `public/js/library-ui.js` после `roomPaintColWidths()` добавить:

```js
// «Скрыта»: колонки нет, поэтому ▶/☆/🤖 всплывают на АКТИВНОЙ строке — той, что уже
// подсвечена воспроизведением или караоке. Новых жестов не вводим: тап по строке и так
// перематывает медиа, а значит делает её активной. Кнопки не создаются заново — оверлей
// проксирует клик на настоящие кнопки строки, чтобы вся логика осталась одна.
function roomSyncActionOverlay() {
  const mount = $('roomReaderTable');
  if (!mount) return;
  let box = $('roomRowActions');
  if (actionColMode() !== 'hidden' || !studyModeOn()) { if (box) box.hidden = true; return; }
  const tr = mount.querySelector('#proTable tbody tr.row-playing, #proTable tbody tr.smk-row-active');
  if (!tr) { if (box) box.hidden = true; return; }
  if (!box) {
    box = el('div', { class: 'room-row-actions', attrs: { id: 'roomRowActions', role: 'toolbar', 'aria-label': tt('room.study.actionCol', 'Служебная колонка') } });
    [['tts', '▶'], ['bookmark', '☆'], ['explain', '🤖']].forEach(([act, label]) => {
      const b = el('button', { text: label, attrs: { type: 'button', 'data-act': act } });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = mount.querySelector('#proTable tbody tr.row-playing, #proTable tbody tr.smk-row-active');
        if (!row) return;
        const sel = act === 'tts' ? '.row-tts-btn' : act === 'bookmark' ? '.row-bookmark-btn' : '.row-explain-btn';
        const real = row.querySelector(sel);
        if (real) real.click();   // вся логика остаётся в исходных кнопках
      });
      box.appendChild(b);
    });
    mount.appendChild(box);
  }
  const rr = tr.getBoundingClientRect(), mr = mount.getBoundingClientRect();
  box.hidden = false;
  box.style.top = (rr.top - mr.top + mount.scrollTop) + 'px';
  box.style.left = (rr.left - mr.left) + 'px';
}
window.roomSyncActionOverlay = roomSyncActionOverlay;   // гейт дергает синхронизацию явно
```

- [ ] **Step 4: Звать синхронизацию там, где меняется активная строка**

В `onKaraokeRowChange(idx)` (`library-ui.js:3542`) добавить последней строкой функции (после `if (tr && tr.scrollIntoView) {...}`):

```js
  try { roomSyncActionOverlay(); } catch (_) {}
```

В `roomMediaFollowRange(range)` (`library-ui.js:3655`) добавить сразу после `recordProgress(range.rowStart);`:

```js
  try { roomSyncActionOverlay(); } catch (_) {}
```

В `attachReaderAudio()` рядом с уже добавленными в Task 2 вызовами:

```js
  try { roomSyncActionOverlay(); } catch (_) {}   // пересборка таблицы уносит оверлей
```

- [ ] **Step 5: CSS оверлея**

В `public/library.html` после CSS рельса добавить:

```css
    /* «Скрыта»: плавающая группа действий у левого края активной строки — там же,
       где стояла служебная колонка (порядок колонок LTR независимо от RTL-текста). */
    .room-row-actions {
      position: absolute; z-index: 4; display: flex; flex-direction: column; gap: 2px;
      padding: 2px; border-radius: 8px; background: var(--bg-card); box-shadow: 0 2px 8px rgba(0,0,0,.28);
    }
    .room-row-actions[hidden] { display: none; }
    .room-row-actions button {
      width: 26px; height: 24px; appearance: none; border: 0; background: transparent;
      color: var(--text-primary); font-size: 13px; line-height: 1; padding: 0; cursor: pointer;
    }
    body.room-study #roomReaderTable { position: relative; }   /* якорь для оверлея */
```

- [ ] **Step 6: Прогнать гейт**

Run: `npm run smoke:room-study`
Expected: PASS, включая три проверки оверлея.

- [ ] **Step 7: Коммит**

```bash
git add public/js/library-ui.js public/library.html scripts/premium/room-study-smoke.js
git commit -m "feat(room): режим «Скрыта» — действия строки на активной строке"
```

---

## Task 7: Дисклеймер в конец таблицы + честная высота вне режима

**Files:**
- Modify: `public/js/library-ui.js` (перенос дисклеймера, пересчёт высоты)
- Modify: `public/library.html` (CSS дисклеймера в окне)
- Modify: `scripts/premium/room-study-smoke.js` (секция 7)
- Modify: `docs/superpowers/specs/2026-08-05-room-study-mode-design.md` (пометка статуса)

**Interfaces:**
- Consumes: `roomMediaApplyLayout()` (Task 4).
- Produces: `roomPlaceProvNote()`; пересчёт высоты окна на `scroll`/`resize`/`orientationchange` вне режима.

- [ ] **Step 1: Дописать падающие проверки**

Добавить в гейт секцию 7:

```js
    // ── Секция 7: дисклеймер и честная высота вне режима ────────────────────
    await pg.evaluate(() => { localStorage.setItem('room.studyMode', '1'); localStorage.setItem('room.actionColMode', 'rail'); });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await openStudyText();
    const prov = await pg.evaluate(() => {
      const p = document.getElementById('readerProvNote');
      const wrap = document.getElementById('roomReaderTable');
      const t = document.getElementById('proTable');
      return {
        insideWrap: !!(p && wrap && wrap.contains(p)),
        afterTable: !!(p && t && (t.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)),
        visibleAtTop: (() => { const r = p.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return r.top < w.bottom; })(),
      };
    });
    ok(prov.insideWrap, 'дисклеймер живёт ВНУТРИ окна таблицы');
    ok(prov.afterTable, 'дисклеймер идёт ПОСЛЕ таблицы (в конце материала)');
    ok(!prov.visibleAtTop, 'дисклеймер не виден, пока не доскроллили до конца');

    // переживает пересборку таблицы
    await pg.evaluate(() => { const p = document.getElementById('readerAids'); if (p && p.hidden) document.getElementById('readerAidsToggle').click(); });
    await pg.waitForSelector('#readerAids:not([hidden])', { timeout: 5000 });
    await pg.evaluate(() => { const cb = [...document.querySelectorAll('#readerAids label input[type=checkbox]')][0]; if (cb) cb.click(); });
    await pg.waitForTimeout(400);
    const provAfter = await pg.evaluate(() => {
      const p = document.getElementById('readerProvNote'), wrap = document.getElementById('roomReaderTable');
      return !!(p && wrap && wrap.contains(p));
    });
    ok(provAfter, 'дисклеймер переживает rerenderReader');

    // вне режима высота окна пересчитывается на resize (раньше считалась однажды)
    await pg.evaluate(() => { localStorage.setItem('room.studyMode', '0'); });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await openStudyText();
    const h1 = await pg.evaluate(() => document.getElementById('roomReaderTable').style.maxHeight || '');
    await pg.setViewportSize({ width: 380, height: 700 });
    await pg.waitForTimeout(300);
    const h2 = await pg.evaluate(() => document.getElementById('roomReaderTable').style.maxHeight || '');
    ok(h1 === '' || h1 !== h2, 'вне режима высота окна пересчитывается при изменении вьюпорта (' + h1 + ' → ' + h2 + ')');
    await pg.setViewportSize({ width: 380, height: 845 });
```

- [ ] **Step 2: Прогнать — падает**

Run: `npm run smoke:room-study`
Expected: FAIL — `дисклеймер живёт ВНУТРИ окна таблицы`

- [ ] **Step 3: Перенос дисклеймера**

В `public/js/library-ui.js` после `roomSyncActionOverlay()` добавить:

```js
// Дисклеймер «Перевод и огласовка — машинные» переезжает в КОНЕЦ окна таблицы: он
// честен и обязан остаться (R9), но 17px постоянной служебной строки посреди учебного
// экрана — плата ни за что. В конце материала он виден ровно тогда, когда дочитали.
// ВАЖНО: rerenderReader делает mount.innerHTML = …, поэтому перенос повторяется после
// каждого рендера — тем же паттерном, что медиа-бар и закладки.
function roomPlaceProvNote() {
  const wrap = $('roomReaderTable'), note = $('readerProvNote');
  if (!wrap || !note) return;
  if (note.parentElement !== wrap) wrap.appendChild(note);
  else if (note.previousElementSibling && note.previousElementSibling.id !== 'proTable') wrap.appendChild(note);
}
```

- [ ] **Step 4: Звать перенос после каждого рендера**

В `attachReaderAudio()` рядом с вызовами из Task 2 и Task 6 добавить:

```js
  try { roomPlaceProvNote(); } catch (_) {}   // дисклеймер — последним в окне таблицы
```

- [ ] **Step 5: CSS дисклеймера внутри окна**

В `public/library.html` после CSS оверлея добавить:

```css
    /* Дисклеймер внутри окна таблицы — отступ от последней строки, без «прилипания». */
    #roomReaderTable > .reader-prov-note { margin: 12px 4px 4px; }
```

- [ ] **Step 6: Честный пересчёт высоты вне режима**

В `roomMediaWireOnce()` (`library-ui.js:3825`) заменить строку

```js
  window.addEventListener('resize', () => { try { roomMediaApplyLayout(); } catch (_) {} }, { passive: true });
```

на

```js
  // Высота окна таблицы считалась ОДНАЖДЫ при scrollY=0, когда 176px шапки Зала ещё в
  // потоке — прокрутив шапку прочь, пользователь эти пиксели таблице не возвращал.
  // Пересчёт на скролле/повороте (через rAF, чтобы не дёргать layout на каждом кадре).
  let _layoutRaf = null;
  const relayout = () => {
    if (_layoutRaf != null) return;
    _layoutRaf = requestAnimationFrame(() => { _layoutRaf = null; try { roomMediaApplyLayout(); } catch (_) {} });
  };
  window.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('orientationchange', relayout, { passive: true });
  window.addEventListener('scroll', relayout, { passive: true });
```

- [ ] **Step 7: Прогнать полный набор гейтов**

Run: `npm run smoke:room-study && npm run smoke:room-media && npm run smoke:reader-parity && npm run smoke:i18n && npm run test:api-smoke`
Expected: все PASS.

- [ ] **Step 8: Скриншот @380 перед коммитом (обязателен по CLAUDE.md)**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 380, height: 845 } });
  await p.goto('http://localhost:3000/library.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.setItem('room.studyMode','1'); localStorage.setItem('room.actionColMode','rail'); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'docs/research/room-study-mode-ux/2026-08-05/screenshots/shipped-study-mode-380.png' });
  await b.close();
})();
"
```

Открыть `docs/research/room-study-mode-ux/2026-08-05/screenshots/shipped-study-mode-380.png` и посмотреть глазами перед `git add`.

- [ ] **Step 9: Отметить спеку как реализованную**

В `docs/superpowers/specs/2026-08-05-room-study-mode-design.md` в шапке заменить строку статуса на:

```markdown
**Статус:** РЕАЛИЗОВАНО (см. `docs/superpowers/plans/2026-08-05-room-study-mode.md`) · решения D1–D5 владельца
```

- [ ] **Step 10: Коммит**

```bash
git add public/js/library-ui.js public/library.html scripts/premium/room-study-smoke.js docs/superpowers/specs docs/research/room-study-mode-ux
git commit -m "feat(room): дисклеймер в конец таблицы + честный пересчёт высоты окна"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие спеки:**

| Раздел спеки | Задача |
|---|---|
| §3.1 панель «Аа» | Task 3 |
| §3.2 учебный режим, скрытие chrome, flex-раскладка, sticky top:0 | Task 4 |
| §3.2 класс `room-media-scroll` остаётся | Task 4, Step 5 |
| §3.3 три положения служебной колонки | Task 5 (full/rail) + Task 6 (hidden) |
| §3.4 живой drag, 24px, двойной тап, персист | Task 2 |
| §3.5 дисклеймер в конец таблицы | Task 7 |
| §4 контракт: локали, SW, ключи персиста | Task 2 (SW), Task 3 (локали, ключи) |
| §5 ловушка 1 (ширина `<col>` только из JS) | Task 2 Step 6, Task 5 Step 4 |
| §5 ловушка 2 (sticky-шапка) | Task 4 Step 3 |
| §5 ловушка 3 (перерисовка стирает post-render) | Task 2 Step 7, Task 5 (гейт), Task 6 Step 4, Task 7 Step 4 |
| §5 ловушка 4 (пересчёт после нормализации) | Task 5 Step 4 |
| §5 ловушка 5 (`stopPropagation` на pointerdown) | Task 2 Step 3 |
| §5 ловушка 6 (полоса караоке от скроллера) | Task 4 Step 6 |
| §6 гейт `smoke:room-study` (4 группы проверок) | Task 1 (математика), Task 2 (drag), Task 5 (анти-регресс), Task 6 (нет тупиков) |
| Дефект №2 из §1 (высота при scrollY=0) | Task 4 Step 5 + Task 7 Step 6 |

**Заглушек нет.** Каждый шаг несёт готовый код или точную команду.

**Согласованность имён проверена:** `roomPaintColWidths` (Task 2 → переопределяется в Task 5),
`attachRoomColResize`, `roomResetColWidths`, `roomSyncActionOverlay`, `roomPlaceProvNote`,
`applyStudyModeClass` (Task 3 → расширяется в Task 5), `studyModeOn/Set`, `actionColMode/Set`,
`ROOM_RAIL_PX`, `ROOM_WIDTHS_KEY/DEFAULT`, `applyLinkedResize`, `attachColumnResize`,
`RESIZE_MAX_COL_PERCENT` — используются под одними и теми же именами во всех задачах.
