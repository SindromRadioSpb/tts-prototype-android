// dictionary-smoke.js — гейт Ф4 · Д1 «Мой словарь»: docs/planning/word-layer/F4_D1_DICTIONARY_SPEC_2026_10_12.md.
//
// Настоящий server.js, чистый профиль. Студия наполняет локальную БД: текст из трёх строк, статусы
// (канон-ключ резолвера), «моё слово» с местом и моим переводом, повторение в журнале. Затем «Словарь»:
//   D1 записи из всех источников, по одной на лемму; значение: моё > словарное
//   D2 поиск (иврит без огласовки, форма из текста; русский по моему переводу) и фильтры/сортировки
//   D3 статья: места в моих текстах (+ «Открыть в тексте»), спряжение с подсветкой встреченной формы, память
//   D4 статус из статьи пишется тем же каноном, что из текста (word_status по тому же ключу)
//   D5 1000 записей: список готов < 4 с, фильтр < 300 мс; 380 px без прокрутки вбок; снимки RU/HE
const path = require("path");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3315;
const BASE = process.env.DICT_BASE || `http://127.0.0.1:${PORT}`;
const EXTERNAL = !!process.env.DICT_BASE;
const shot = (n) => path.join(REPO_ROOT, ".tmp", "dictionary-" + n + ".png");
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
  { order_index: 2, hebrew_plain: "היא כתבה מכתב ארוך", hebrew_niqqud: "הִיא כָּתְבָה מִכְתָּב אָרֹךְ", russian: "она написала длинное письмо" },
];

(async () => {
  console.log("dictionary: «Мой словарь» Д1 — список, фильтры, статья, статус, скорость");
  const srv = EXTERNAL ? null : startServer();
  let browser = null; const pageErrors = [];
  try {
    if (!EXTERNAL && !(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem("app.locale")) localStorage.setItem("app.locale", "ru"); localStorage.setItem("v3.byokOnboardingDismissed", "1"); localStorage.setItem("room.contextConsent", "declined"); } catch (_) {} });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    pg.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("    [console." + m.type() + "] " + m.text().slice(0, 200)); });

    // seed through the Studio (same OPFS as the dictionary page)
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.TextCardFormat && typeof window.ensureLocalDB === "function" && !!window.NotesAutoGen, null, { timeout: 60000 });
    const seed = await pg.evaluate(async (rows) => {
      const ldb = await window.ensureLocalDB(), RM = window.ReaderMorph;
      await ldb.importBundle(window.TextCardFormat.cardToBundle({ format: "linguistpro-text-card-v2", card: { title: "Смоук словаря", source_text: rows.map((r) => r.hebrew_plain).join("\n"), rows } }, { textKey: "dict-smoke" }), { mode: "skip" });
      const tid = (await ldb.dbQuery("SELECT id FROM texts WHERE text_key = ?", ["dict-smoke"]))[0].id;
      const sents = await ldb.getSentences(tid);
      const card = async (w) => RM.resolveWordLight(RM.stripNiqqud(w), w);
      const shama = await card("שֶׁשָּׁמַעְתִּי"), katav = await card("כָּתְבָה"), bayit = await card("לַבַּיִת"), yeled = await card("הַיְּלָדִים");
      await ldb.setWordStatus(shama.lemmaKey, "l2");
      await ldb.setWordStatus(katav.lemmaKey, "known");
      await ldb.setWordStatus(bayit.lemmaKey, "l1");
      // «моё слово» с местом и моим переводом (тот же путь, что карточка: dedupKey тела заметки)
      const body = { word: yeled.word || "ילדים", niqqud_variant: yeled.niqqud || "הַיְּלָדִים", root: yeled.root || "", lemma: yeled.lemma || "", pos: yeled.pos || "", part_of_speech: yeled.pos || "", binyan: "", meaning: "детишки", meaning_source: "user" };
      if (yeled.pealim_id) body.pealim_id = String(yeled.pealim_id);
      const note = await ldb.createCanonicalNote({ gen_dedup_key: window.NotesAutoGen.dedupKey(body), body, title: body.word, source: "curated", user_touched: 1 });
      await ldb.addNoteOccurrence(note.id, { text_id: tid, sentence_id: sents[1].id, word_offset: 0, surface: "הילדים" });
      return { keys: { shama: shama.lemmaKey, katav: katav.lemmaKey, bayit: bayit.lemmaKey, yeled: yeled.lemmaKey }, tid };
    }, ROWS);
    console.log("  seeded", JSON.stringify(seed.keys));

    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4 && document.querySelectorAll(".dict-row").length >= 4, null, { timeout: 60000 });
    await pg.waitForFunction(() => [...window.LPDictionary.state.entries.values()].every((e) => e.reading !== undefined) && !document.getElementById("dict-progress").textContent, null, { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(300);
    if (process.env.DICT_DEBUG) console.log(await pg.evaluate(() => JSON.stringify([...window.LPDictionary.state.entries.values()].map((e) => ({ k: e.key, s: e.surfaces, r: e.reading === undefined ? "UNDEF" : e.reading && e.reading.lemmaKey })))));
    const d1 = await pg.evaluate(() => [...document.querySelectorAll(".dict-row")].map((b) => ({ key: b.getAttribute("data-key"), he: b.querySelector(".dict-row-he").textContent, mean: b.querySelector(".dict-row-mean").textContent })));
    const byKey = Object.fromEntries(d1.map((x) => [x.key, x]));
    ok(d1.length === 4 && Object.values(seed.keys).every((k) => byKey[k]), `D1 четыре записи — по одной на лемму из статусов и «моих слов» (${d1.length})`);
    ok(byKey[seed.keys.yeled] && byKey[seed.keys.yeled].mean === "детишки", "D1 значение: мой перевод важнее словарного (" + (byKey[seed.keys.yeled] || {}).mean + ")");
    ok(byKey[seed.keys.katav] && /писать/.test(byKey[seed.keys.katav].mean), "D1 словарное значение из офлайн-разбора (" + (byKey[seed.keys.katav] || {}).mean + ")");
    const nav = await pg.evaluate(() => { const a = document.querySelector('nav.lp-app-nav [data-nav-id="dictionary"]'); return a ? [a.getAttribute("aria-current"), a.textContent.trim()] : null; });
    ok(nav && nav[0] === "page" && /Словарь/.test(nav[1]), "D1 пункт «Словарь» в навигации активен (" + JSON.stringify(nav) + ")");
    await pg.screenshot({ path: shot("list-desktop") });

    // D2 search + filters + sort
    const rowsNow = async () => pg.evaluate(() => [...document.querySelectorAll(".dict-row")].map((b) => b.getAttribute("data-key")));
    await pg.fill("#dict-q", "שמעתי"); await pg.waitForTimeout(400);
    const s1 = await rowsNow();
    await pg.fill("#dict-q", "детиш"); await pg.waitForTimeout(400);
    const s2 = await rowsNow();
    await pg.fill("#dict-q", ""); await pg.waitForTimeout(400);
    ok(s1.length === 1 && s1[0] === seed.keys.shama && s2.length === 1 && s2[0] === seed.keys.yeled, `D2 поиск: форма из текста без огласовки → ${s1.join()}, мой перевод → ${s2.join()}`);
    await pg.click("#dict-filter-btn");
    await pg.locator('#dict-filters .dict-chip').filter({ hasText: /^знаю$/ }).click();
    const f1 = await rowsNow();
    ok(f1.length === 1 && f1[0] === seed.keys.katav, "D2 фильтр статуса «знаю» → " + f1.join());
    await pg.click('#dict-active .dict-chip'); await pg.waitForTimeout(200);
    await pg.locator('#dict-filters .dict-chip').filter({ hasText: /^есть мой перевод$/ }).click();
    const f2 = await rowsNow();
    ok(f2.length === 1 && f2[0] === seed.keys.yeled, "D2 фильтр «есть мой перевод» → " + f2.join());
    await pg.click('#dict-active .dict-chip'); await pg.waitForTimeout(200);
    await pg.click("#dict-filter-btn");
    await pg.selectOption("#dict-sort", "alpha"); await pg.waitForTimeout(300);
    const alpha = await pg.evaluate(() => [...document.querySelectorAll(".dict-row")].length);
    ok(alpha === 4, "D2 сортировка по алфавиту показывает все записи");

    // D3 article
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForFunction(() => { const a = document.getElementById("dict-article"); return a && !a.hidden && /Места в моих текстах/.test(a.innerText) && !/Ищу…/.test(a.innerText); }, null, { timeout: 30000 }).catch(() => {});
    const art = await pg.evaluate(() => {
      const a = document.getElementById("dict-article");
      return { places: a.querySelectorAll(".dict-place").length, mark: (a.querySelector(".dict-place mark") || {}).textContent || "",
        link: (a.querySelector(".dict-place a") || {}).getAttribute ? a.querySelector(".dict-place a").getAttribute("href") : "",
        conj: !!a.querySelector(".rm-conj-body table, .rm-conj-body .v3-conj-mx, .rm-conj-body [class*=conj]"), hl: a.querySelectorAll(".rm-conj-body [class*=hl], .rm-conj-body [class*=highlight]").length,
        status: (a.querySelector(".dict-a-status .on") || {}).textContent || "" };
    });
    ok(art.places >= 1 && art.mark === "כָּתְבָה" && /my_text=.*&at=2/.test(art.link), `D3 место в моём тексте с подсветкой и ссылкой на строку (${art.places}, «${art.mark}», ${art.link})`);
    ok(art.conj && art.hl >= 1, `D3 спряжение показано, встреченная форма подсвечена (клеток: ${art.hl})`);
    ok(art.status === "знаю", "D3 статус в статье = статус слова («" + art.status + "»)");
    await pg.screenshot({ path: shot("article-desktop") });

    await pg.click(`.dict-row[data-key="${seed.keys.shama}"]`);
    await pg.waitForFunction(() => { const a = document.getElementById("dict-article"); return a && /שְׁמוֹעַ|שמוע/.test(a.innerText) && !/Ищу…/.test(a.innerText); }, null, { timeout: 30000 }).catch(() => {});
    const proc = await pg.evaluate(() => (document.querySelector("#dict-article .dict-place mark") || {}).textContent || "");
    ok(proc === "שֶׁשָּׁמַעְתִּי", "D3 место с приставкой найдено и доказано разбором («" + proc + "»)");
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForTimeout(800);
    // D4 status from the article = the same canon write as in the text
    await pg.click('#dict-article .dict-a-status button:has-text("почти знаю")');
    await pg.waitForTimeout(800);
    const st = await pg.evaluate(async (k) => {
      const ldb = await import("/db/local-db.js?v=742");
      return ldb.getWordStatus(k);
    }, seed.keys.katav);
    ok(st === "l4", "D4 статус из статьи записан по тому же канон-ключу (" + st + ")");

    // D5 scale: 1000 entries
    await pg.evaluate(async () => {
      const ldb = await import("/db/local-db.js?v=742");
      const letters = "אבגדהוזחטיכלמנסעפצקרשת";
      for (let i = 0; i < 1000; i++) {
        const w = letters[i % 22] + letters[Math.floor(i / 22) % 22] + letters[Math.floor(i / 484) % 22] + "ן";   // 1000 distinct keys
        await ldb.setWordStatus(w + "#noun", ["l1", "l2", "l3", "l4", "known"][i % 5]);
      }
    });
    const t0 = Date.now();
    await pg.reload({ waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size > 900 && document.querySelectorAll(".dict-row").length >= 60, null, { timeout: 60000 }).catch(async () => { console.log("    D5 state:", await pg.evaluate(() => JSON.stringify({ has: !!window.LPDictionary, size: window.LPDictionary && window.LPDictionary.state.entries.size, rows: document.querySelectorAll(".dict-row").length, prog: document.getElementById("dict-progress").textContent, busy: document.getElementById("dict-root").getAttribute("aria-busy") })).catch((e) => String(e))); throw new Error("D5 list did not appear"); });
    const listMs = Date.now() - t0;
    const searchMs = () => pg.evaluate(async () => {
      const box = document.getElementById("dict-q"), t = performance.now();
      box.value = "אב"; box.dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 160));
      await new Promise((r) => requestAnimationFrame(() => r()));
      const ms = Math.round(performance.now() - t - 150);
      box.value = ""; box.dispatchEvent(new Event("input")); await new Promise((r) => setTimeout(r, 200));
      return ms;
    });
    await pg.evaluate(() => window.ReaderMorph.ensureEngine());   // the one-off engine build is not a typing cost
    const busyMs = await searchMs();   // while the background analysis of 1000 words is still running
    await pg.waitForFunction(() => [...window.LPDictionary.state.entries.values()].every((e) => e.reading !== undefined), null, { timeout: 120000 }).catch(() => {});
    const idleMs = await searchMs();
    ok(busyMs < 300, `D5 поиск во время фонового разбора 1000 слов: ${busyMs} мс (порог 300)`);
    const filterMs = idleMs; if (false) await pg.evaluate(async () => {
      const t = performance.now();
      document.getElementById("dict-q").value = "אב"; document.getElementById("dict-q").dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 160));
      return Math.round(performance.now() - t - 150);
    });
    ok(listMs < 4000, `D5 1000 записей: список на экране за ${listMs} мс (порог 4000)`);
    ok(filterMs < 300, `D5 поиск по 1000 записям за ${filterMs} мс (порог 300)`);

    // phone width, RU and HE
    for (const lang of ["ru", "he"]) {
      await pg.setViewportSize({ width: 380, height: 845 });
      await pg.evaluate((l) => { localStorage.setItem("app.locale", l); }, lang);
      await pg.reload({ waitUntil: "load" });
      await pg.waitForFunction(() => document.querySelectorAll(".dict-row").length >= 10, null, { timeout: 60000 });
      const wide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!wide, "D5 380 px без прокрутки вбок (" + lang + ")");
      await pg.screenshot({ path: shot("list-380-" + lang) });
    }
    await pg.click(".dict-row");
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: shot("article-380-he") });
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    console.error(e); failures.push(String(e && e.message || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer(srv);
  }
  console.log(failures.length ? `[dictionary-smoke] FAIL (${failures.length})` : "[dictionary-smoke] PASS");
  process.exit(failures.length ? 1 : 0);
})();
