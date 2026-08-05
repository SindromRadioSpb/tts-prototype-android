// studio-morph-smoke.js — гейт Студии: «Статус слов» + морф-карточка на тапе
// (спека docs/superpowers/specs/2026-08-05-studio-word-status-morph-card-design.md).
//
// Шаблон room-study-smoke.js: свой порт, serviceWorkers:"block" (SW отдаёт старый shell),
// small-writes-only (OPFS-headless-safe). Таблица — СИНТЕТИЧЕСКАЯ несохранённая
// (v3RenderTableFromLibrary), ровно кейс «карточка текста ещё не в библиотеке».
//
// Сценарии:
//   A1 тумблер #studioWordStatusToggle + легенда 7 точек; палитра РЕАЛЬНО покрашена
//      (computed background точки ≠ transparent — регресс-гард на съеденный :root)
//   A2 шит «Строка таблицы» удалён (DOM отсутствует)
//   A3 после рендера слова обёрнуты в .rm-w (he-ячейки)
//   A4 тумблер ON → у решённых слов появляется раскраска (.rm-w-new и т.п.)
//   A5 тап по слову → карточка .rm-sheet.rm-open с палитрой из 7 статусов
//   A6 клик по статусу l3 → строка в word_status появилась со статусом l3 + перекраска .rm-w-l3
//   A7 метка посеяла FSRS-расписание (getSrsSchedule непусто) — канон P5.6 на несохранённой таблице
//   A8 edit-mode: тап по слову НЕ открывает карточку; после выхода — открывает
const path = require("path");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  return spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
async function stopServer(child) {
  if (!child) return;
  try { child.kill("SIGTERM"); } catch (_) {}
  await new Promise((r) => setTimeout(r, 1500));
  if (process.platform === "win32") {
    try { require("child_process").execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" }); } catch (_) {}
  } else { try { child.kill("SIGKILL"); } catch (_) {} }
}
async function ready(ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) return true; } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const failures = [];
function ok(cond, msg) {
  if (cond) console.log("  + " + msg);
  else { console.log("  x " + msg); failures.push(msg); }
}

(async () => {
  console.log("studio-morph: тумблер/палитра/карточка/метка/FSRS-посев/edit-mode (несохранённая таблица)");
  const srv = startServer();
  let browser = null;
  try {
    if (!(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 845 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.locale", "ru");
        // consent Dicta: declined → карточка резолвит офлайн, диалог согласия не перекрывает клики
        localStorage.setItem("room.contextConsent", "declined");
        localStorage.setItem("studio.wordStatus", "0");
      } catch (_) {}
    });
    const pg = await ctx.newPage();
    const pageErrors = [];
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    // ВАЖНО (waitForFunction-ловушка): 2-й аргумент — arg, опции ТРЕТЬИМ
    await pg.waitForFunction(() => !!window.StudioMorph && !!window.MorphHost && typeof window.renderTable === "function", null, { timeout: 30000 });
    // Первозапускные модалы (Phase6 → Onboarding → BYOK) всплывают АСИНХРОННО слоями —
    // периодический свип, а не разовая зачистка. rm-sheet карточки — не .v3-modal, не задет.
    await pg.evaluate(() => {
      const sweep = () => {
        try { if (typeof window.v3OnboardingDismiss === "function") window.v3OnboardingDismiss(false); } catch (_) {}
        document.querySelectorAll(".v3-modal:not(.hidden), [id*='OnboardingModal'], #v3Phase6Modal").forEach((m) => m.remove());
      };
      sweep(); setInterval(sweep, 400);
    });

    // A1 — тумблер + легенда + живая палитра
    const a1 = await pg.evaluate(() => {
      const cb = document.getElementById("studioWordStatusToggle");
      const dots = document.querySelectorAll("#studioWordStatusLegend .reader-status-dot");
      let painted = false;
      if (dots.length) {
        const bg = getComputedStyle(dots[0]).backgroundColor;
        painted = !!bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      }
      return { cb: !!cb, dots: dots.length, painted };
    });
    ok(a1.cb, "тумблер «Статус слов» присутствует в панели настроек таблицы");
    ok(a1.dots === 7, `легенда: 7 точек статусов (got ${a1.dots})`);
    ok(a1.painted, "палитра точек реально покрашена (:root-токены дошли до страницы)");

    // A2 — шит удалён
    const a2 = await pg.evaluate(() => ({
      sheet: !!document.getElementById("classicRowSheet"),
      backdrop: !!document.getElementById("classicRowSheetBackdrop"),
    }));
    ok(!a2.sheet && !a2.backdrop, "шит «Строка таблицы» удалён из DOM");

    // Синтетическая НЕСОХРАНЁННАЯ таблица (нет _v3_textId/_v3_sentenceId)
    await pg.evaluate(() => {
      window.v3RenderTableFromLibrary([
        { he: "אני הולך הביתה", he_niqqud: "אֲנִי הוֹלֵךְ הַבַּיְתָה", translit: "ani holekh habayta", ru: "я иду домой" },
        { he: "מלחמה קשה מאוד", he_niqqud: "מִלְחָמָה קָשָׁה מְאֹד", translit: "milchama kasha meod", ru: "очень тяжёлая война" },
        { he: "ספר טוב מאוד", he_niqqud: "סֵפֶר טוֹב מְאֹד", translit: "sefer tov meod", ru: "очень хорошая книга" },
      ]);
    });

    // A3 — обёртка слов
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="he"] .rm-w').length >= 9, null, { timeout: 15000 });
    ok(true, "слова таблицы обёрнуты в .rm-w (тап-слой активен)");

    // A4 — тумблер ON → раскраска решённых слов (офлайн-словарь грузится лениво — ждём щедро)
    await pg.evaluate(() => {
      const cb = document.getElementById("studioWordStatusToggle");
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change")); }
    });
    let colored = false;
    try {
      await pg.waitForFunction(() => document.querySelectorAll("#proTable .rm-w-new, #proTable .rm-w-l1, #proTable .rm-w-l2, #proTable .rm-w-l3, #proTable .rm-w-l4, #proTable .rm-w-known, #proTable .rm-w-learning").length > 0, null, { timeout: 45000 });
      colored = true;
    } catch (_) {}
    ok(colored, "тумблер ON → решённые слова раскрашены (несохранённая таблица, глобальный профиль)");

    // A5 — тап по слову → карточка с палитрой (слово с уверенным разбором: מלחמה)
    const target = pg.locator('#proTable td[data-col="he"] .rm-w', { hasText: "מלחמה" }).first();
    await target.click();
    await pg.waitForFunction(() => !!document.querySelector(".rm-sheet.rm-open") && document.querySelectorAll(".rm-status-btn").length >= 7, null, { timeout: 30000 });
    ok(true, "тап по слову открывает морф-карточку с палитрой статусов");

    // A6+A7 — метка l3: word_status появился + FSRS-посев + перекраска
    const before = await pg.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const all = await db.getAllWordStatuses();
      return Object.keys(all).length;
    });
    await pg.locator('.rm-sheet [data-rm-status="l3"]').first().click();
    await pg.waitForFunction(async (prev) => {
      const db = await import("/db/local-db.js");
      const all = await db.getAllWordStatuses();
      return Object.values(all).filter((s) => s === "l3").length > 0 && Object.keys(all).length > prev;
    }, before, { timeout: 20000 });
    ok(true, "клик по статусу l3 → строка word_status создана (глобально по лемме)");
    // посев идёт ПОСЛЕ первой status-записи (второй setWordStatus с sched) — retry-цикл,
    // не одиночный снапшот и не waitForFunction (async-предикат там флейково падает)
    let seeded = 0;
    for (let i = 0; i < 40 && !seeded; i++) {
      try {
        seeded = await pg.evaluate(async () => {
          const db = await import("/db/local-db.js");
          return Object.keys((await db.getSrsSchedule()) || {}).length;
        });
      } catch (_) { seeded = 0; }
      if (!seeded) await pg.waitForTimeout(500);
    }
    ok(seeded > 0, `метка посеяла FSRS-расписание (rows=${seeded}) — канон P5.6 жив на несохранённой таблице`);
    let repainted = false;
    try {
      await pg.waitForFunction(() => document.querySelectorAll("#proTable .rm-w-l3").length > 0, null, { timeout: 20000 });
      repainted = true;
    } catch (_) {}
    ok(repainted, "слово перекрасилось в цвет l3 сразу после метки");

    // закрыть карточку
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(400);

    // A8 — edit-mode подавляет карточку
    await pg.evaluate(() => { window.tableEditModeEnter(); });
    await pg.waitForTimeout(300);
    await pg.locator('#proTable td[data-col="he"] .rm-w', { hasText: "ספר" }).first().click({ force: true });
    await pg.waitForTimeout(800);
    const inEdit = await pg.evaluate(() => !!document.querySelector(".rm-sheet.rm-open"));
    ok(!inEdit, "в режиме правки тап по слову НЕ открывает карточку");
    await pg.evaluate(() => { window.tableEditModeExit(true); });
    await pg.waitForTimeout(600);
    await pg.locator('#proTable td[data-col="he"] .rm-w', { hasText: "ספר" }).first().click();
    let afterEdit = false;
    try {
      await pg.waitForFunction(() => !!document.querySelector(".rm-sheet.rm-open"), null, { timeout: 20000 });
      afterEdit = true;
    } catch (_) {}
    ok(afterEdit, "после выхода из режима правки карточка снова открывается");

    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? " (" + pageErrors.join("; ") + ")" : ""));
    await browser.close(); browser = null;
  } catch (e) {
    failures.push("unhandled: " + (e && e.message ? e.message : e));
    console.error(e);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    await stopServer(srv);
  }
  if (failures.length) { console.log(`[studio-morph-smoke] FAIL (${failures.length})`); process.exit(1); }
  console.log("[studio-morph-smoke] PASS");
  process.exit(0);
})();
