// word-gloss-smoke.js — гейт слоя слов Ф1+Ф2: подстрочник + лента слов, Студия и Зал;
// Ф2 — подпись = перевод встретившейся формы, карточка: «в тексте» + матрица «лицо × время».
// Спеки: docs/planning/word-layer/F1_SPEC_2026_10_11.md, F2_SPEC_2026_10_11.md.
//
// Шаблон studio-morph-smoke.js / room-study-smoke.js: свой порт, serviceWorkers:"block",
// синтетическая несохранённая таблица Студии + засеянный в OPFS текст Зала.
//
// Студия (380px):
//   S1 тумблеры «Подстрочник» / «Лента слов» присутствуют
//   S2 подстрочник: слова огласованной колонки получают data-gloss; ששמעתי → «что я слышал(а)» (Ф2);
//      подпись реально отрисована ПОД словом (::before, высота слова выросла)
//   S3 лента: строка «звучит» (row-playing) → полоса видна, чипов столько же, сколько слов строки,
//      подписи совпадают с подстрочником; тап по чипу открывает ту же морф-карточку;
//   S3b карточка: «в тексте: что я слышал(а)», матрица «лицо × время», ▶ на PERF-1s с переводом,
//      матрица не шире карточки на 380px (прокрутка внутри, не страницы)
//   S4 смена звучащей строки (smk-row-active) → лента показывает её слова
//   S5 режим правки снимает подстрочник и ленту
//   S6 тумблеры OFF → атрибуты и полоса сняты; ни одной ошибки страницы
// Зал (380px): Z1 тумблеры в «Аа»; Z2 подстрочник на засеянном тексте; Z3 лента звучащей строки
// + тап по чипу → карточка. Скриншоты 380px + desktop → .tmp/word-gloss-*.png
const path = require("path");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3301;
// WORD_GLOSS_BASE=https://… → проверка опубликованного результата: свой сервер не поднимается,
// засев идёт только в OPFS одноразового профиля браузера (данные владельца не затрагиваются).
const EXTERNAL = process.env.WORD_GLOSS_BASE || "";
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`;
const shot = (n) => path.join(REPO_ROOT, ".tmp", "word-gloss-" + (EXTERNAL ? "prod-" : "") + n + ".png");

function startServer() {
  return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
}
async function stopServer(child) {
  if (!child) return;
  try { child.kill("SIGTERM"); } catch (_) {}
  await new Promise((r) => setTimeout(r, 1500));
  if (process.platform === "win32") { try { require("child_process").execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" }); } catch (_) {} }
  else { try { child.kill("SIGKILL"); } catch (_) {} }
}
async function ready(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) return true; } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
const failures = [];
function ok(cond, msg) { if (cond) console.log("  + " + msg); else { console.log("  x " + msg); failures.push(msg); } }

// Синтетические фразы (не цитаты): приставка ש, артикль, ל + слитый артикль, притяжательное, прошедшее.
const ROWS = [
  { he: "אני זוכר ששמעתי את זה", he_niqqud: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה", translit: "ani zokher sheshamati et ze", ru: "я помню, что слышал это" },
  { he: "הילדים הולכים לבית שלנו", he_niqqud: "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ", translit: "hayeladim holkhim labayit shelanu", ru: "дети идут к нашему дому" },
  { he: "היא כתבה מכתב ארוך", he_niqqud: "הִיא כָּתְבָה מִכְתָּב אָרֹךְ", translit: "hi katva mikhtav arokh", ru: "она написала длинное письмо" },
];

async function glossState(pg, scope) {
  return pg.evaluate((scope) => {
    const root = document.querySelector(scope) || document;
    const spans = [...root.querySelectorAll('#proTable tbody td[data-col="niqqud"] .rm-w')];
    const by = (w) => spans.find((s) => (s.getAttribute("data-niqqud") || "") === w);
    const sh = by("שֶׁשָּׁמַעְתִּי"), kt = by("כָּתְבָה"), lb = by("לַבַּיִת");
    const before = sh ? getComputedStyle(sh, "::before").content : "";
    const cs = sh ? getComputedStyle(sh) : null, bcs = sh ? getComputedStyle(sh, "::before") : null;
    return {
      layout: cs ? [cs.display, cs.flexDirection, bcs.order].join("/") : "",
      on: spans.filter((s) => s.hasAttribute("data-gloss")).length, total: spans.length,
      sh: sh ? [sh.getAttribute("data-gloss"), sh.getAttribute("data-gloss-hint")] : null,
      kt: kt ? [kt.getAttribute("data-gloss"), kt.getAttribute("data-gloss-hint")] : null,
      lb: lb ? [lb.getAttribute("data-gloss"), lb.getAttribute("data-gloss-hint")] : null,
      before, shH: sh ? sh.getBoundingClientRect().height : 0,
    };
  }, scope);
}
async function ribbonState(pg) {
  return pg.evaluate(() => {
    const r = document.querySelector(".rm-ribbon");
    if (!r) return { exists: false };
    const chips = [...r.querySelectorAll(".rm-ribbon-chip")];
    return { exists: true, hidden: r.hidden, bar: r.classList.contains("rm-ribbon--bar"),
      he: chips.map((c) => c.querySelector(".rm-ribbon-he").textContent), gl: chips.map((c) => c.querySelector(".rm-ribbon-gloss").textContent),
      shown: r.getBoundingClientRect().height > 20 };
  });
}

(async () => {
  console.log("word-gloss: подстрочник + лента слов (Студия + Зал)");
  const srv = EXTERNAL ? null : startServer();
  let browser = null;
  const pageErrors = [];
  try {
    if (!EXTERNAL && !(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();

    // ══ Студия ══════════════════════════════════════════════════════════════
    for (const vp of [{ name: "380", width: 380, height: 845 }, { name: "desktop", width: 1280, height: 860 }]) {
      const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: vp.width, height: vp.height } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("app.locale", "ru");
          localStorage.setItem("room.contextConsent", "declined");
          localStorage.setItem("studio.wordStatus", "0");
          localStorage.setItem("studio.wordGloss", "0"); localStorage.setItem("studio.wordRibbon", "0");
          localStorage.setItem("v3.byokOnboardingDismissed", "1");
        } catch (_) {}
      });
      const pg = await ctx.newPage();
      pg.on("pageerror", (e) => pageErrors.push("studio " + vp.name + ": " + String(e)));
      await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
      await pg.waitForFunction(() => !!window.StudioMorph && !!window.WordGloss && typeof window.renderTable === "function", null, { timeout: 30000 });
      await pg.evaluate(() => {
        const sweep = () => {
          try { if (typeof window.v3OnboardingDismiss === "function") window.v3OnboardingDismiss(false); } catch (_) {}
          document.querySelectorAll(".v3-modal:not(.hidden), [id*='OnboardingModal'], #v3Phase6Modal").forEach((m) => m.remove());
        };
        sweep(); setInterval(sweep, 400);
      });
      if (vp.name === "380") {
        const s1 = await pg.evaluate(() => ({ g: !!document.getElementById("studioWordGlossToggle"), r: !!document.getElementById("studioWordRibbonToggle") }));
        ok(s1.g && s1.r, "S1 тумблеры «Подстрочник» и «Лента слов» в настройках таблицы Студии");
      }
      await pg.evaluate((rows) => { window.applyPreset("full"); window.v3RenderTableFromLibrary(rows); }, ROWS);
      await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length >= 13, null, { timeout: 15000 });

      // S2 — подстрочник
      await pg.evaluate(() => { document.getElementById("studioWordGlossToggle").click(); });
      await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss]').length >= 13, null, { timeout: 60000 });
      const g = await glossState(pg, "#tableContainer");
      if (vp.name === "380") {
        ok(g.on === g.total && g.total >= 13, `S2 все слова огласованной колонки получили подпись (${g.on}/${g.total})`);
        ok(g.sh && g.sh[0] === "что я слышал(а)" && !g.sh[1], "S2 שֶׁשָּׁמַעְתִּי → «что я слышал(а)» (got " + JSON.stringify(g.sh) + ")");
        ok(g.kt && g.kt[0] === "она писала" && !g.kt[1], "S2 כָּתְבָה → «она писала» (got " + JSON.stringify(g.kt) + ")");
        ok(g.lb && /^к \+ /.test(g.lb[0]), "S2 לַבַּיִת → приставка «к +» (got " + JSON.stringify(g.lb) + ")");
        ok(g.before && g.before !== "none" && g.before.includes("слышал"), "S2 подпись реально отрисована (::before content=" + g.before.slice(0, 40) + ")");
        ok(g.layout === "inline-flex/column/2", "S2 подпись стоит ПОД словом (раскладка " + g.layout + ")");
      }

      // S3 — лента: строка «звучит»
      await pg.evaluate(() => { document.getElementById("studioWordRibbonToggle").click(); });
      await pg.waitForTimeout(300);
      await pg.evaluate(() => { const tr = document.querySelector('#proTable tbody tr[data-row-idx="0"]'); tr.classList.add("row-playing"); });
      await pg.waitForFunction(() => { const r = document.querySelector(".rm-ribbon"); return r && !r.hidden && r.querySelectorAll(".rm-ribbon-chip").length >= 5 && ![...r.querySelectorAll(".rm-ribbon-gloss")].some((x) => x.textContent === "…"); }, null, { timeout: 20000 });
      const r1 = await ribbonState(pg);
      if (vp.name === "380") {
        ok(r1.exists && !r1.hidden && r1.shown, "S3 лента видна, когда строка звучит");
        ok(r1.he.length === 5 && r1.he[2] === "שֶׁשָּׁמַעְתִּי", "S3 чипы = слова звучащей строки по порядку (" + r1.he.join(" ") + ")");
        ok(r1.gl[2] === "что я слышал(а)", "S3 подпись чипа = подпись подстрочника (" + r1.gl[2] + ")");
      }
      await pg.evaluate(() => { const t = document.getElementById("tableContainer"); if (t) t.scrollIntoView({ block: "start" }); });
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: shot("studio-" + vp.name) });
      if (vp.name === "380") {
        await pg.locator(".rm-ribbon-chip").nth(2).click();   // настоящий (trusted) тап пользователя
        await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 20000 }).catch(() => {});
        await pg.waitForFunction(() => { const s = document.querySelector(".rm-sheet.rm-open"); return s && !/Анализ…|Загрузка|Loading/.test(s.textContent || ""); }, null, { timeout: 20000 }).catch(() => {});
        const card = await pg.evaluate(() => {
          const s = document.querySelector(".rm-sheet.rm-open"), any = document.querySelector(".rm-sheet");
          return { open: s ? s.textContent.replace(/\s+/g, " ") : "", any: any ? any.className : "none",
            active: (document.querySelector(".rm-w.rm-w-active") || {}).textContent || "" };
        });
        if (!/слыш/.test(card.open)) await pg.screenshot({ path: shot("studio-chip-tap-fail") });
        ok(/слыш/.test(card.open), "S3 тап по чипу открывает морф-карточку того же слова" + (/слыш/.test(card.open) ? "" : " (" + card.open.slice(0, 300) + ")"));
        // S3b — Ф2: строка формы + матрица «лицо × время»
        const mx = await pg.evaluate(async () => {
          const s = document.querySelector(".rm-sheet.rm-open");
          const det = s && s.querySelector("details.rm-acc-conj");
          if (det) { det.open = true; await new Promise((r) => setTimeout(r, 250)); det.scrollIntoView({ block: "start" }); }
          const hl = s && s.querySelector(".v3-conj-mx .v3-conj-cell-hl");
          const sc = s && s.querySelector(".v3-conj-mx-scroll");
          return {
            form: ((s && s.querySelector(".rm-form-line")) || {}).textContent || "",
            mx: s ? s.querySelectorAll(".v3-conj-mx").length : 0,
            hlSlot: hl ? hl.getAttribute("data-slot") : "", hlRu: hl ? (hl.querySelector(".v3-conj-ru") || {}).textContent : "",
            cur: hl ? !!hl.querySelector(".v3-conj-cur") : false,
            ruCells: s ? s.querySelectorAll(".v3-conj-ru").length : 0,
            fits: sc ? sc.getBoundingClientRect().right <= s.getBoundingClientRect().right + 1 : false,
            pageX: document.documentElement.scrollWidth <= window.innerWidth + 1,
          };
        });
        ok(/в тексте:\s*что я слышал\(а\)/.test(mx.form), "S3b карточка: строка «в тексте: что я слышал(а)» (" + mx.form + ")");
        ok(mx.mx >= 1 && mx.hlSlot === "PERF-1s" && mx.cur && mx.hlRu === "я слышал(а)", "S3b матрица: ▶ на PERF-1s с переводом (" + JSON.stringify(mx) + ")");
        ok(mx.ruCells >= 20, "S3b перевод в клетках матрицы (" + mx.ruCells + ")");
        ok(mx.fits && mx.pageX, "S3b матрица не шире карточки и страница без горизонтальной прокрутки");
        await pg.screenshot({ path: shot("studio-card-matrix-380") });
        await pg.keyboard.press("Escape");
        await pg.waitForTimeout(400);

        // S4 — другая строка звучит (караоке медиа)
        await pg.evaluate(() => {
          document.querySelector('#proTable tbody tr[data-row-idx="0"]').classList.remove("row-playing");
          document.querySelector('#proTable tbody tr[data-row-idx="2"]').classList.add("smk-row-active");
        });
        await pg.waitForFunction(() => { const c = document.querySelector(".rm-ribbon .rm-ribbon-he"); return c && c.textContent === "הִיא"; }, null, { timeout: 10000 }).catch(() => {});
        const r2 = await ribbonState(pg);
        ok(r2.he[0] === "הִיא" && r2.gl[1] === "она писала", "S4 лента следует за звучащей строкой караоке (" + r2.he.join(" ") + " | " + r2.gl[1] + ")");

        // S5 — режим правки снимает слой
        // режим правки = класс tbl-edit-mode на #proTable (studio-morph.editModeOn); StudioMorph.refresh — штатный хук
        await pg.evaluate(() => { document.getElementById("proTable").classList.add("tbl-edit-mode"); window.StudioMorph.refresh(); });
        await pg.waitForTimeout(700);
        const e = await pg.evaluate(() => ({ gl: document.querySelectorAll(".rm-w[data-gloss]").length, rb: !!document.querySelector(".rm-ribbon") }));
        ok(e.gl === 0 && !e.rb, `S5 режим правки снимает подстрочник и ленту (gloss=${e.gl}, ribbon=${e.rb})`);
        await pg.evaluate(() => { document.getElementById("proTable").classList.remove("tbl-edit-mode"); window.StudioMorph.refresh(); });
        await pg.waitForTimeout(700);

        // S6 — выключение
        await pg.evaluate(() => { document.getElementById("studioWordGlossToggle").click(); document.getElementById("studioWordRibbonToggle").click(); });
        await pg.waitForTimeout(500);
        const off = await pg.evaluate(() => ({ gl: document.querySelectorAll(".rm-w[data-gloss]").length, on: !!document.querySelector(".rm-gloss-on"), rb: !!document.querySelector(".rm-ribbon") }));
        ok(off.gl === 0 && !off.on && !off.rb, "S6 тумблеры OFF снимают атрибуты, класс и ленту");
      }
      await ctx.close();
    }

    // ══ Зал ═════════════════════════════════════════════════════════════════
    for (const vp of [{ name: "380", width: 380, height: 845 }, { name: "desktop", width: 1280, height: 860 }]) {
      const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: vp.width, height: vp.height } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.contextConsent", "declined");
          localStorage.setItem("room.wordGloss", "1"); localStorage.setItem("room.wordRibbon", "1");
        } catch (_) {}
      });
      const pg = await ctx.newPage();
      pg.on("pageerror", (e) => pageErrors.push("room " + vp.name + ": " + String(e)));
      await pg.goto(BASE + "/library.html", { waitUntil: "load" });
      const corpusReady = () => pg.waitForFunction(() => { const t = document.getElementById("tabCorpus"); return t && !t.hidden; }, null, { timeout: 90000 });
      await corpusReady();
      // Свежий профиль: первичный импорт канона пересоздаёт соединение с БД и может потерять ранний
      // засев (замер 2026-10-11: из 2 строк выжила 1, в другом прогоне 0 — при любом значении тумблеров).
      // Поэтому засев идемпотентный и проверяется ПОСЛЕ перезагрузки, с досевом до совпадения.
      const seed = (rows) => pg.evaluate(async (rows) => {
        const db = window.__localDB;
        const have = new Set(((await db.getSentences("wgs-t1").catch(() => [])) || []).map((s) => s.id));
        if (!have.size) { try { await db.createText({ id: "wgs-t1", text_key: "wgs-k1", title: "WGS GLOSS", source_text: "טקסט" }); } catch (_) {} }
        for (let i = 0; i < rows.length; i++) {
          if (have.has("wgs-t1-s" + i)) continue;
          await db.addSentence("wgs-t1", { id: "wgs-t1-s" + i, he_plain: rows[i].he, he_niqqud: rows[i].he_niqqud, translit: rows[i].translit, ru: rows[i].ru });
        }
      }, rows);
      let seeded = 0;
      for (let attempt = 0; attempt < 4 && seeded !== ROWS.length; attempt++) {
        await seed(ROWS);
        await pg.goto(BASE + "/library.html", { waitUntil: "load" });
        await corpusReady();
        seeded = await pg.evaluate(async () => ((await window.__localDB.getSentences("wgs-t1").catch(() => [])) || []).length);
      }
      if (seeded !== ROWS.length) throw new Error("room seed did not persist: " + seeded + "/" + ROWS.length);
      await pg.click("#tabCorpus");
      await pg.waitForSelector(".learning-home", { timeout: 20000 });
      await pg.click('.learning-corpus-entry[data-corpus="mytexts"]');
      await pg.waitForSelector(".mytexts-corpus .mytexts-grid", { timeout: 20000 });
      await pg.evaluate(() => { const c = [...document.querySelectorAll(".mytexts-grid .mytext-card-v")].find((x) => (x.textContent || "").includes("WGS GLOSS")); if (c) c.click(); });
      await pg.waitForFunction(() => { const r = document.getElementById("roomReader"); return r && !r.hidden; }, null, { timeout: 20000 });
      try { await pg.waitForSelector("#roomReaderTable #proTable tbody tr", { state: "attached", timeout: 25000 }); }
      catch (e) { await pg.screenshot({ path: shot("room-open-fail-" + vp.name) }); throw e; }
      await pg.waitForFunction(() => document.querySelectorAll('#roomReaderTable td[data-col="niqqud"] .rm-w[data-gloss]').length >= 13, null, { timeout: 60000 }).catch(() => {});
      const g = await glossState(pg, "#roomReaderTable");
      if (vp.name === "380") {
        ok(g.on >= 13, `Z2 подстрочник в Зале на засеянном тексте (${g.on}/${g.total})`);
        ok(g.sh && g.sh[0] === "что я слышал(а)", "Z2 та же подпись, что в Студии (" + JSON.stringify(g.sh) + ")");
      }
      await pg.evaluate(() => { const tr = document.querySelector('#roomReaderTable #proTable tbody tr[data-row-idx="1"]'); if (tr) tr.classList.add("row-playing"); });
      await pg.waitForFunction(() => { const r = document.querySelector(".rm-ribbon"); return r && !r.hidden && r.querySelectorAll(".rm-ribbon-chip").length >= 4 && ![...r.querySelectorAll(".rm-ribbon-gloss")].some((x) => x.textContent === "…"); }, null, { timeout: 20000 }).catch(() => {});
      const r = await ribbonState(pg);
      if (vp.name === "380") {
        ok(r.exists && !r.hidden && r.he.length === 4 && r.he[0] === "הַיְּלָדִים", "Z3 лента Зала показывает звучащую строку (" + (r.he || []).join(" ") + ")");
        await pg.click("#readerAidsToggle").catch(() => {});
        await pg.waitForSelector("#readerWordGlossToggle", { timeout: 8000 }).catch(() => {});
        const z1 = await pg.evaluate(() => ({ g: document.getElementById("readerWordGlossToggle"), r: document.getElementById("readerWordRibbonToggle") }) && ({
          g: !!document.getElementById("readerWordGlossToggle") && document.getElementById("readerWordGlossToggle").checked,
          r: !!document.getElementById("readerWordRibbonToggle") && document.getElementById("readerWordRibbonToggle").checked }));
        ok(z1.g && z1.r, "Z1 тумблеры в «Аа» Зала отражают сохранённое состояние");
        await pg.click("#readerAidsToggle").catch(() => {});   // закрыть «Аа» перед скриншотом
        await pg.waitForTimeout(300);
      }
      await pg.screenshot({ path: shot("room-" + vp.name) });
      if (vp.name === "380") {
        await pg.locator(".rm-ribbon-chip").nth(1).click();
        await pg.waitForSelector(".rm-sheet.rm-open", { timeout: 20000 }).catch(() => {});
        await pg.waitForFunction(() => { const s = document.querySelector(".rm-sheet.rm-open"); return s && !/Анализ…|Загрузка|Loading/.test(s.textContent || ""); }, null, { timeout: 20000 }).catch(() => {});
        const card = await pg.evaluate(() => { const s = document.querySelector(".rm-sheet.rm-open"); return s ? s.textContent : ""; });
        ok(/идти|ходить/.test(card), "Z3 тап по чипу Зала открывает карточку слова");
      }
      await ctx.close();
    }
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    console.error(e); failures.push("exception: " + (e && e.message));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer(srv);
  }
  console.log("screenshots → .tmp/word-gloss-{studio,room}-{380,desktop}.png");
  if (failures.length) { console.log("[word-gloss-smoke] FAIL (" + failures.length + ")"); process.exit(1); }
  console.log("[word-gloss-smoke] PASS");
})();
