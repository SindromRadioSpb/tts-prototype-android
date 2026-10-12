// word-gloss-ai-material-smoke.js — гейт Ф3б: перевод слов ИИ едет с материалом.
// Спека: docs/planning/word-layer/F3B_BUILD_AND_EXPORT_SPEC_2026_10_12.md.
//
// Настоящая Студия (server.js, локальная БД), /api/word-gloss-ctx ПОДМЕНЁН (бесплатно, детерминированно):
//   M1 сохранённая карточка → перевод по ДАННЫМ (как этап сборки), строка-повтор оплачивается один раз
//   M2 экспорт карточки текста (text-card-v2) и экспорт библиотеки несут слой этой карточки
//   M3 стираем локальный слой → импорт карточки → подстрочник показывает подписи ИИ без запросов,
//      при ВЫКЛЮЧЕННОМ тумблере ИИ (решение владельца 2026-10-12: оплаченное видно всегда)
//   M4 медиа-строка: кнопка ▶︎ в ячейке перевода не меняет ключ строки (тот же перевод, без запроса)
const path = require("path");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3313;
const BASE = process.env.WORD_GLOSS_BASE || `http://127.0.0.1:${PORT}`;
const EXTERNAL = !!process.env.WORD_GLOSS_BASE;
const shot = (n) => path.join(REPO_ROOT, ".tmp", "word-gloss-ai-material-" + n + ".png");
const failures = [];
function ok(c, m) { if (c) console.log("  + " + m); else { console.log("  x " + m); failures.push(m); } }
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) {
  if (!c) return;
  try { c.kill("SIGTERM"); } catch (_) {}
  await new Promise((r) => setTimeout(r, 1200));
  if (process.platform === "win32") { try { require("child_process").execSync("taskkill /pid " + c.pid + " /T /F", { stdio: "ignore" }); } catch (_) {} }
}
async function ready(ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 500)); }
  return false;
}

const ROWS = [
  { order_index: 0, hebrew_plain: "אני זוכר ששמעתי את זה", hebrew_niqqud: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה", russian: "я помню, что слышал это" },
  { order_index: 1, hebrew_plain: "הילדים הולכים לבית שלנו", hebrew_niqqud: "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ", russian: "дети идут к нашему дому" },
  { order_index: 2, hebrew_plain: "אני זוכר ששמעתי את זה", hebrew_niqqud: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה", russian: "я помню, что слышал это" },
];

(async () => {
  console.log("word-gloss-ai-material: перевод слов ИИ при сборке и в экспорте (Ф3б)");
  const srv = EXTERNAL ? null : startServer();
  let browser = null; const pageErrors = [];
  try {
    if (!EXTERNAL && !(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 845 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.contextConsent", "declined");
        localStorage.setItem("studio.wordStatus", "0"); localStorage.setItem("v3.byokOnboardingDismissed", "1");
        localStorage.setItem("studio.wordGloss", "1"); localStorage.setItem("studio.wordRibbon", "0"); localStorage.setItem("studio.wordGlossAi", "0");
        localStorage.setItem("v3.geminiApiKey", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE");
      } catch (_) {}
    });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    let calls = 0; const seenRu = [];
    await pg.route("**/api/word-gloss-ctx", async (route) => {
      calls++;
      const body = JSON.parse(route.request().postData() || "{}");
      (body.rows || []).forEach((r) => seenRu.push(r.ru));
      const rows = (body.rows || []).map((r) => ({ i: r.i, glosses: r.words.map((w, k) => ({ gloss: "ИИ" + k, wrong_hint: false })), mwe: [], fromCache: false }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows, rejected: [], model: "fake", usage: null }) });
    });
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.WordGlossAI && !!window.TextCardFormat && typeof window.ensureLocalDB === "function" && typeof window.v3TcsBuildCardPayload === "function", null, { timeout: 60000 });

    // M1 — сохранённая карточка, перевод по данным
    const m1 = await pg.evaluate(async (rows) => {
      const ldb = await window.ensureLocalDB();
      const card = { format: "linguistpro-text-card-v2", card: { title: "Ф3б смоук", source_text: rows.map((r) => r.hebrew_plain).join("\n"), rows } };
      await ldb.importBundle(window.TextCardFormat.cardToBundle(card, { textKey: "f3b-smoke-src" }), { mode: "skip" });
      const id = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key=?", ["f3b-smoke-src"]))[0].id;
      const sentences = await ldb.getSentences(id);
      const out = await window.WordGlossAI.glossCard(sentences, {});
      return { id, out };
    }, ROWS);
    ok(m1.out.rows === 3 && m1.out.covered === 3 && calls === 1 && seenRu.length === 2,
      `M1 карточка переведена по данным, повтор строки оплачен один раз (покрыто ${m1.out.covered}/${m1.out.rows}, строк в запросе ${seenRu.length}, запросов ${calls})`);

    // M2 — экспорт карточки и библиотеки несут слой
    const m2 = await pg.evaluate(async (id) => {
      const payload = await window.v3TcsBuildCardPayload(id);
      const ldb = await window.ensureLocalDB();
      const bundle = await ldb.exportBundle({ textIds: [id] });
      const t = ((bundle.library || bundle).texts || []).find((x) => String(x.text_id) === String(id));
      window.__f3bPayload = payload;
      return { card: payload.card.word_gloss_ai_layer && payload.card.word_gloss_ai_layer.rows.length, lib: t && t.word_gloss_ai_layer && t.word_gloss_ai_layer.rows.length };
    }, m1.id);
    ok(m2.card === 3 && m2.lib === 3, `M2 экспорт карточки и библиотеки несёт слой (карточка ${m2.card}, библиотека ${m2.lib} строк)`);

    // M3 — стираем слой устройства, импортируем карточку, показываем при выключенном ИИ
    const before = calls;
    const m3 = await pg.evaluate(async () => {
      window.WordGlossAI._mem.clear();
      await new Promise((resolve) => { const rq = indexedDB.open("lp-word-gloss-ai", 1); rq.onsuccess = () => { const tx = rq.result.transaction("rows", "readwrite"); tx.objectStore("rows").clear(); tx.oncomplete = () => resolve(); }; rq.onerror = () => resolve(); });
      const ldb = await window.ensureLocalDB();
      await ldb.importBundle(window.TextCardFormat.cardToBundle(window.__f3bPayload, { textKey: "f3b-smoke-imported" }), { mode: "skip" });
      const id = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key=?", ["f3b-smoke-imported"]))[0].id;
      const rows = await ldb.getSentences(id);
      window.applyPreset("full");
      window.v3RenderTableFromLibrary(rows.map((r) => ({ he: r.he_plain, he_niqqud: r.he_niqqud, translit: r.translit || "x", ru: r.ru })));
      return { id, mem: window.WordGlossAI._mem.size };
    });
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length >= 14, null, { timeout: 30000 }).catch(() => {});
    const aiLabels = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length);
    ok(m3.mem >= 2 && aiLabels === 14 && calls === before,
      `M3 после импорта подписи ИИ видны без запросов при выключенном тумблере (подписей ${aiLabels}/14, запросов ${calls - before})`);
    await pg.screenshot({ path: shot("imported-380") });

    // M4 — ▶︎ медиа-строки в ячейке перевода не меняет ключ
    const m4 = await pg.evaluate(() => {
      const tr = document.querySelector('#proTable tbody tr[data-row-idx="1"]');
      const td = tr.querySelector('td[data-col="ru"]');
      td.appendChild(document.createTextNode(" "));
      const b = document.createElement("button"); b.className = "smk-row-replay"; b.textContent = "▶︎"; td.appendChild(b);
      tr.removeAttribute("data-wg-ai-key");
      return { hit: !!window.WordGlossAI.lookup(tr) };
    });
    ok(m4.hit && calls === before, "M4 кнопка ▶︎ в ячейке перевода не меняет ключ строки");
    // M5 — лента длинной строки переносится в ряды и не уезжает вбок (владелец 2026-10-12)
    const m5 = await pg.evaluate(async () => {
      localStorage.setItem("studio.wordRibbon", "1");
      const long = "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה הִיא כָּתְבָה מִכְתָּב אָרֹךְ אֲנַחְנוּ רָאִינוּ אֶת הַבַּיִת הוּא כָּתַב שִׁיר יָפֶה";
      window.v3RenderTableFromLibrary([{ he: long.replace(/[֑-ׇ]/g, ""), he_niqqud: long, translit: "x", ru: "длинная строка" }]);
      await new Promise((r) => setTimeout(r, 1500));
      const cb = document.getElementById("studioWordRibbonToggle"); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change")); }
      document.querySelector('#proTable tbody tr[data-row-idx="0"]').classList.add("row-playing");
      await new Promise((r) => setTimeout(r, 1500));
      const list = document.querySelector(".rm-ribbon .rm-ribbon-list"); const chip = list && list.querySelector(".rm-ribbon-chip");
      return list ? { chips: list.children.length, h: list.clientHeight, chipH: chip ? chip.offsetHeight : 0, sideways: list.scrollWidth > list.clientWidth + 1 } : null;
    });
    ok(m5 && m5.chips >= 20 && m5.h > m5.chipH * 1.5 && !m5.sideways, "M5 лента длинной строки переносится в ряды без прокрутки вбок (" + JSON.stringify(m5) + ")");
    await pg.screenshot({ path: shot("ribbon-wrap-380") });
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    console.error(e); failures.push(String(e && e.message || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer(srv);
  }
  console.log(failures.length ? `[word-gloss-ai-material-smoke] FAIL (${failures.length})` : "[word-gloss-ai-material-smoke] PASS");
  process.exit(failures.length ? 1 : 0);
})();
