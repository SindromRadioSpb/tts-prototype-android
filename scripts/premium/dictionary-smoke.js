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
    // the SAME module instance as the page (a different ?v= would be a second, uninitialised local DB)
    const LDB_URL = (/import \* as localDb from '([^']+)'/.exec(require("fs").readFileSync(path.join(REPO_ROOT, "public/js/dictionary-ui.js"), "utf8")) || [])[1];
    await ctx.addInitScript((u) => { window.__LDB_URL = u; }, LDB_URL);
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
      // not mine: an auto-generated note (source=auto); its word has no status or review of mine
      const otherBody = { word: "אהבה", niqqud_variant: "אַהֲבָה", pos: "noun", meaning: "любовь" };
      await ldb.createCanonicalNote({ gen_dedup_key: window.NotesAutoGen.dedupKey(otherBody), body: otherBody, title: "אהבה", source: "auto", user_touched: 0 });
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
    ok(d1.length === 4 && Object.values(seed.keys).every((k) => byKey[k]), `D1 четыре записи — по одной на лемму из статусов и «моих слов»; автозаметка не моя (${d1.length})`);
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
    // D7 form drill on לכתוב: two rounds, the first answer of round 1 deliberately wrong
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForSelector("#dict-article .dict-drill-bar .dict-btn", { timeout: 30000 });
    const drill = await pg.evaluate(async () => {
      const art = document.getElementById("dict-article"), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = { rounds: [], wrongShown: "" };
      for (let round = 0; round < 2; round++) {
        (round === 0 ? art.querySelector(".dict-drill-bar .dict-btn") : [...art.querySelectorAll(".dict-drill-actions .dict-btn")][0]).click();
        await wait(50);
        for (let q = 0; q < 12; q++) {
          const opts = art.querySelector(".dict-drill-opts"); if (!opts || !art.querySelector(".dict-drill-opt")) break;
          const ans = opts.getAttribute("data-answer");
          const btns = [...opts.querySelectorAll(".dict-drill-opt")];
          const pick = round === 0 && q === 0 ? btns.find((b) => b.getAttribute("data-he") !== ans) : btns.find((b) => b.getAttribute("data-he") === ans);
          pick.click(); await wait(30);
          if (round === 0 && q === 0) out.wrongShown = (art.querySelector(".dict-drill-fb") || {}).innerText || "";
          const next = art.querySelector(".dict-drill-fb .primary"); next.click(); await wait(30);
        }
        out.rounds.push((art.querySelector(".dict-drill-total") || {}).textContent || "");
      }
      [...art.querySelectorAll(".dict-drill-actions .dict-btn")][1].click(); await wait(100);
      out.mastered = art.querySelectorAll(".rm-conj-body .dict-mastered").length;
      out.status = (art.querySelector(".dict-drill-bar .dict-note") || {}).textContent || "";
      return out;
    });
    ok(/Правильно/.test(drill.wrongShown) && /Верно 7 из 8/.test(drill.rounds[0]) && /Верно 8 из 8/.test(drill.rounds[1]),
      "D7 тренировка форм: ошибка показывает правильную форму, раунды " + drill.rounds.map((r) => r.split(".")[0]).join(" / "));
    ok(drill.mastered >= 7 && /Уверенно: [7-9] из/.test(drill.status), `D7 усвоенные формы отмечены в таблице (${drill.mastered}; «${drill.status}»)`);
    await pg.screenshot({ path: shot("drill-desktop") });

    // D8 production answers: typing (another cell is named; Russian layout converted) and letter tiles
    const prod = await pg.evaluate(async () => {
      const art = document.getElementById("dict-article"), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const strip = (s) => String(s || "").replace(/[֑-ׇ]/g, "");
      const HE2RU = { "א": "е", "ב": "с", "ג": "в", "ד": "ы", "ה": "м", "ו": "г", "ז": "я", "ח": "о", "ט": "н", "י": "р", "ך": "д", "כ": "а", "ל": "л", "ם": "щ", "מ": "т", "ן": "ш", "נ": "и", "ס": "ч", "ע": "п", "ף": "ж", "פ": "з", "ץ": "ю", "צ": "ь", "ק": "у", "ר": "к", "ש": "ф", "ת": "б" };
      const out = {};
      art.querySelector(".dict-drill-bar .dict-btn").click(); await wait(50);
      art.querySelector('.dict-drill-modes [data-mode="type"]').click(); await wait(30);
      const typeIn = async (text) => { const inp = art.querySelector(".dict-drill-input"); inp.value = text; inp.dispatchEvent(new Event("input")); out.converted = inp.value; await wait(10); art.querySelector(".dict-drill-type .primary").click(); await wait(30); };
      let ans = art.querySelector(".dict-drill-area").getAttribute("data-answer");
      const other = [...art.querySelectorAll(".rm-conj-body [data-slot]")].map((c) => strip(c.textContent).replace(/[^א-ת]/g, "")).find((x) => x && x !== strip(ans));
      await typeIn(other);
      out.otherNamed = (art.querySelector(".dict-drill-why") || {}).textContent || "";
      out.firstBad = !!art.querySelector(".dict-drill-fb.bad");
      art.querySelector(".dict-drill-fb .primary").click(); await wait(30);
      ans = art.querySelector(".dict-drill-area").getAttribute("data-answer");
      await typeIn(strip(ans).split("").map((c) => HE2RU[c] || c).join(""));
      out.layoutOk = !!art.querySelector(".dict-drill-fb.ok");
      out.layoutNote = (art.querySelector(".dict-drill-area .dict-note") || {}).textContent || "";
      art.querySelector(".dict-drill-fb .primary").click(); await wait(30);
      art.querySelector('.dict-drill-modes [data-mode="tiles"]').click(); await wait(30);
      ans = art.querySelector(".dict-drill-area").getAttribute("data-answer");
      for (const ch of strip(ans).replace(/[^א-ת]/g, "")) { const b = [...art.querySelectorAll(".dict-tiles .dict-tile")].find((x) => !x.disabled && x.getAttribute("data-ch") === ch); if (b) b.click(); await wait(5); }
      await wait(30);
      out.tilesOk = !!art.querySelector(".dict-drill-fb.ok");
      out.tiles = art.querySelectorAll(".dict-tiles .dict-tile").length;
      art.querySelector('.dict-drill-modes [data-mode="choice"]') && null;
      return out;
    });
    ok(prod.firstBad && /другую форму/.test(prod.otherNamed), "D8 ввод: чужая клетка названа («" + prod.otherNamed + "»)");
    ok(prod.layoutOk && /[א-ת]/.test(prod.converted) && /раскладк/.test(prod.layoutNote), "D8 ввод в русской раскладке переведён по клавишам и засчитан (" + prod.converted + ")");
    ok(prod.tilesOk && prod.tiles > 4, "D8 плитки: собрано по буквам и засчитано (плиток " + prod.tiles + ")");
    await pg.screenshot({ path: shot("drill-tiles-desktop") });
    await pg.evaluate(() => { try { localStorage.setItem("dict.drillMode_v1", "choice"); } catch (_) {} });

    // D9 the set: «Тренировать формы (N)» over the list — a round alternates between words
    await pg.click("#dict-article .dict-a-back").catch(() => {});
    await pg.reload({ waitUntil: "load" });
    await pg.waitForSelector("#dict-train-forms", { timeout: 60000 });
    const setBtn = await pg.textContent("#dict-train-forms");
    await pg.click("#dict-train-forms");
    await pg.waitForSelector("#dict-article .dict-drill-opt", { timeout: 30000 });
    const setRun = await pg.evaluate(async () => {
      const art = document.getElementById("dict-article"), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const lemmas = new Set();
      for (let q = 0; q < 14; q++) {
        const area = art.querySelector(".dict-drill-opts"); if (!area || !art.querySelector(".dict-drill-opt")) break;
        lemmas.add(art.querySelector(".dict-drill-head .he").textContent);
        const ans = area.getAttribute("data-answer");
        [...area.querySelectorAll(".dict-drill-opt")].find((b) => b.getAttribute("data-he") === ans).click(); await wait(20);
        art.querySelector(".dict-drill-fb .primary").click(); await wait(20);
      }
      return { title: (art.querySelector(".dict-set-title") || {}).textContent || "", total: (art.querySelector(".dict-drill-total") || {}).textContent || "", lemmas: lemmas.size };
    });
    ok(/Тренировать формы \([2-4]\)/.test(setBtn) && /Тренировка форм/.test(setRun.title) && /Верно 10 из 10/.test(setRun.total) && setRun.lemmas >= 2,
      `D9 набор из словаря: ${setBtn} → «${setRun.title}», ${setRun.total.split(".")[0]}, слов в раунде ${setRun.lemmas}`);
    await pg.screenshot({ path: shot("drill-set-desktop") });
    await pg.click(".dict-drill-actions .dict-btn:nth-child(2)").catch(() => {});
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForSelector("#dict-article .dict-a-status", { timeout: 30000 });
    await pg.waitForTimeout(800);

    // D4 status from the article = the same canon write as in the text
    const stBefore = await pg.evaluate(async (k) => (await import(window.__LDB_URL)).getWordStatus(k), seed.keys.katav);
    let clickErr = '';
    await pg.click('#dict-article .dict-a-status button:has-text("почти знаю")').catch((e) => { clickErr = String(e).slice(0, 200); });
    await pg.waitForTimeout(800);
    if (clickErr || process.env.DICT_DEBUG) console.log('    D4 debug: before=' + stBefore + ' clickErr=' + clickErr);
    const st = await pg.evaluate(async (k) => {
      const ldb = await import(window.__LDB_URL);
      return ldb.getWordStatus(k);
    }, seed.keys.katav);
    ok(st === "l4", "D4 статус из статьи записан по тому же канон-ключу (" + st + ")");

    // D6 «Учить эти» → the Room's training on this set
    await pg.waitForSelector("#dict-train .dict-btn", { timeout: 10000 });
    const btnText = await pg.textContent("#dict-train .dict-btn");
    await Promise.all([pg.waitForURL(/library\.html/, { timeout: 30000 }), pg.click("#dict-train .dict-btn")]);
    await pg.waitForFunction(() => { const s = document.querySelector(".room-study"); if (!s || s.hidden) return false; const b = s.querySelector(".room-study-body"); return b && b.innerText.trim() && !/Собираю/.test(b.innerText); }, null, { timeout: 90000 }).catch(() => {});
    const train = await pg.evaluate(() => { const s = document.querySelector(".room-study"); const b = s && s.querySelector(".room-study-body"); return { open: !!(s && !s.hidden), title: (s && (s.querySelector(".room-study-title") || {}).textContent) || "", empty: !!(b && b.querySelector(".room-study-empty")), text: b ? b.innerText.slice(0, 160) : "", url: location.search }; });
    ok(/Учить эти \(4\)/.test(btnText) && train.open && /словаря/.test(train.title) && !train.empty && !/review=set/.test(train.url),
      "D6 «Учить эти (4)» открывает тренировку в Зале на этих словах («" + train.title + "»: " + train.text.replace(/\s+/g, " ").slice(0, 80) + ")");
    await pg.screenshot({ path: shot("train-from-dictionary") });
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });
    await pg.waitForFunction(() => [...window.LPDictionary.state.entries.values()].every((e) => e.reading !== undefined), null, { timeout: 60000 }).catch(() => {});

    // D10 «Прогресс»: counts by status, change over a week (all marks are from today), form weak spots → drill
    await pg.click('[data-view="progress"]');
    await pg.waitForFunction(() => { const v = document.getElementById("dict-prog-view"); return v && !v.hidden && v.querySelector(".dict-pbar"); }, null, { timeout: 30000 });
    const prog = await pg.evaluate(() => {
      const v = document.getElementById("dict-prog-view");
      return { text: v.innerText, segs: v.querySelectorAll(".dict-pbar i").length, rows: v.querySelectorAll(".dict-ptable tbody tr").length, weeks: v.querySelectorAll(".dict-pweek").length,
        formBtns: [...v.querySelectorAll(".dict-pweak .dict-btn")].map((b) => b.textContent), listHidden: document.getElementById("dict-words-view").hidden };
    });
    ok(/Сейчас: 4 слов/.test(prog.text) && prog.segs >= 3 && prog.rows >= 3 && prog.listHidden, `D10 прогресс: сейчас 4 слова, полоса из ${prog.segs} статусов, таблица ${prog.rows} строк`);
    ok(/За неделю: стало «знаю» \+0 · поднялись по шкале 0 · новых слов 4/.test(prog.text), "D10 динамика по журналу отметок: за неделю новых слов 4 (" + (prog.text.match(/За неделю:[^\n]*/) || [""])[0] + ")");
    console.log("    D10 weeks", prog.weeks, JSON.stringify((prog.text.match(/[^\n]*7 дней[^\n]*/) || [""])[0]));
    ok(prog.weeks === 8 && /Последние 7 дней: \d+ повторений|За последние 7 дней повторений не было/.test(prog.text), "D10 повторения по неделям: 8 столбцов и строка за 7 дней");
    ok(/Слабые места — формы/.test(prog.text) && prog.formBtns.some((t) => /Тренировать формы/.test(t)), "D10 слабые места форм с кнопкой «Тренировать формы» (" + prog.formBtns.join(" | ") + ")");
    await pg.screenshot({ path: shot("progress-desktop"), fullPage: true });
    await pg.locator("#dict-prog-view .dict-pweak .dict-btn").filter({ hasText: "Тренировать формы" }).first().click();
    await pg.waitForSelector("#dict-article .dict-drill-area", { timeout: 30000 });
    const fromProg = await pg.evaluate(() => (document.querySelector("#dict-article .dict-set-title") || {}).textContent || "");
    ok(/Тренировка форм: [1-9]/.test(fromProg), "D10 «Тренировать формы» из слабого места открывает раунд («" + fromProg + "»)");
    await pg.click('[data-view="words"]');

    // D11 XLSX study book of the current view: six sheets; word ↔ table links; example in bold; self-test formulas
    await pg.waitForSelector("#dict-xlsx", { timeout: 30000 });
    const xlsxBtn = await pg.textContent("#dict-xlsx");
    const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click("#dict-xlsx")]);
    const xlsxPath = path.join(REPO_ROOT, ".tmp", "dictionary-export.xlsx");
    await dl.saveAs(xlsxPath);
    const xl = await pg.evaluate(async (katavKey) => {
      const ex = window.LPDictionary.lastExport; if (!ex) return null;
      const zip = await window.JSZip.loadAsync(ex.blob);
      const wb = await zip.file("xl/workbook.xml").async("string");
      const sh = async (i) => zip.file("xl/worksheets/sheet" + i + ".xml").async("string");
      const s2 = await sh(2), s3 = await sh(3), s5 = await sh(5);
      // the Словарь row of לכתוב → its table block → back to the same row
      const rowOf = s2.split("<row ").find((r) => r.includes(">" + katavKey + "<"));
      const n = rowOf ? rowOf.slice(rowOf.indexOf('r="') + 3, rowOf.indexOf('"', rowOf.indexOf('r="') + 3)) : "";
      const lk = '<hyperlink ref="Q' + n + '" location="' + "'Таблицы'!";
      const loc = n && s2.includes(lk) ? s2.slice(s2.indexOf(lk) + lk.length).split('"')[0] : '';   // e.g. L15:L2015 (a tall range in the hidden jump column)
      const toTable = (/^[A-Z]+(\d+):/.exec(loc) || [])[1] || '';
      const back = toTable ? s3.includes('<hyperlink ref="A' + toTable + '" location="' + "'Словарь'!X" + n + ':') : false;
      return { words: ex.words, forms: ex.forms, tests: ex.tests, sheets: [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), toTable, back,
        boldEx: s2.includes('<rPr><b/><color rgb="FF1B4FB8"/></rPr><t xml:space="preserve">כָּתְבָה</t>'), formula: s5.includes("_xlfn.UNICHAR"),
        appLink: (await zip.file("xl/worksheets/_rels/sheet2.xml.rels").async("string")).includes("dictionary.html?word=") };
    }, seed.keys.katav);
    ok(xlsxBtn.includes("Скачать XLSX (4)") && xl && xl.words === 4 && xl.forms > 40 && xl.sheets.join() === "Начать,Словарь,Таблицы,Формы,Проверь себя,Прогресс" && /^linguistpro-dictionary-[0-9-]{10}[.]xlsx$/.test(dl.suggestedFilename()),
      `D11 XLSX: ${dl.suggestedFilename()} — листы ${xl && xl.sheets.join("/")}, слов ${xl && xl.words}, форм ${xl && xl.forms}, заданий ${xl && xl.tests}`);
    ok(xl && xl.toTable && xl.back, "D11 переход слово → его таблица → обратно к той же строке (Таблицы!A" + (xl && xl.toTable) + ")");
    ok(xl && xl.boldEx && xl.formula && xl.appLink, "D11 пример со словом жирным, формулы проверки, ссылка «в приложении»");
    // «открыть ↗» lands on the word's article
    await pg.goto(BASE + "/dictionary.html?word=" + encodeURIComponent(seed.keys.katav), { waitUntil: "load" });
    await pg.waitForFunction(() => { const a = document.getElementById("dict-article"); return a && !a.hidden && a.querySelector(".dict-a-word"); }, null, { timeout: 60000 }).catch(() => {});
    const deep = await pg.evaluate(() => (document.querySelector("#dict-article .dict-a-word .he") || {}).textContent || "");
    ok(/לִכְתּוֹב/.test(deep), "D11 ссылка из книги dictionary.html?word= открывает статью слова («" + deep + "»)");
    // D15 «Корень как гнездо»: the article of לכתוב shows the root family with my statuses; the practice round
    // tells relatives apart (options from the same family only)
    await pg.waitForFunction(() => { const s = document.querySelector("#dict-article details.dict-a-sec summary"); return [...document.querySelectorAll("#dict-article summary")].some((x) => /Гнездо корня/.test(x.textContent)); }, null, { timeout: 30000 }).catch(() => {});
    const nest = await pg.evaluate(() => {
      const sum = [...document.querySelectorAll("#dict-article summary")].find((x) => /Гнездо корня/.test(x.textContent));
      const sec = sum && sum.parentElement;
      return { title: sum ? sum.textContent : "", chips: sec ? sec.querySelectorAll(".dict-fam button").length : 0, coloured: sec ? sec.querySelectorAll('.dict-fam button[class*="dict-st-"]').length : 0,
        drill: !!document.getElementById("dict-nest-drill"), learn: !!document.getElementById("dict-nest-learn") };
    });
    ok(/Гнездо корня כתב/.test(nest.title) && nest.chips >= 3 && nest.coloured === nest.chips && nest.drill && nest.learn, `D15 гнездо корня в статье: «${nest.title}», слов ${nest.chips}, все с цветом статуса`);
    await pg.evaluate(() => { const sum = [...document.querySelectorAll('#dict-article summary')].find((x) => /Гнездо корня/.test(x.textContent)); if (sum && !sum.parentElement.open) sum.click(); });
    await pg.click("#dict-nest-drill");
    await pg.waitForSelector("#dict-article .dict-drill-opt", { timeout: 10000 });
    const nestRun = await pg.evaluate(async () => {
      const art = document.getElementById("dict-article"), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let opts4 = true;
      for (let q = 0; q < 12; q++) {
        const area = art.querySelector(".dict-drill-area"); if (!area || !art.querySelector(".dict-drill-opt:not([disabled])")) break;
        const btns = [...area.querySelectorAll(".dict-drill-opt")];
        if (btns.length !== 4) opts4 = false;
        btns.find((b) => b.getAttribute("data-key") === area.getAttribute("data-answer")).click(); await wait(20);
        art.querySelector(".dict-drill-fb .primary").click(); await wait(20);
      }
      return { total: (art.querySelector(".dict-drill-total") || {}).textContent || "", opts4, title: (art.querySelector(".dict-set-title") || {}).textContent || "" };
    });
    ok(/Верно (\d+) из \1/.test(nestRun.total) && nestRun.opts4 && /Гнездо корня/.test(nestRun.title), `D15 тренировка гнезда: ${nestRun.total} (4 варианта из этого же гнезда)`);
    await pg.screenshot({ path: shot("nest-desktop") });

    // D15 «Слово в новых предложениях»: לכתוב was learnt in «Смоук словаря» (row 3); the check must come from another text
    const anchor = await pg.evaluate(async (k) => {
      const ldb = await import(window.__LDB_URL);
      await ldb.createText({ id: "dict-smoke-2", text_key: "dict-smoke-2", title: "Второй текст смоука" });
      await ldb.addSentence("dict-smoke-2", { id: "ds2-s1", order_index: 0, he_plain: "המורה כתב על הלוח", he_niqqud: "הַמּוֹרֶה כָּתַב עַל הַלּוּחַ", ru: "учитель написал на доске" });
      const sid = (await ldb.dbQuery("SELECT s.id FROM sentences s JOIN texts t ON t.id = s.text_id WHERE t.text_key = 'dict-smoke' AND s.order_index = 2"))[0].id;
      await ldb.setWordStatus(k, "l2", { due: Date.now() - 1000, interval: 1, reps: 1, lapses: 0 }, { textKey: "dict-smoke", sentenceId: String(sid), orderIndex: 2, surface: "כתבה" });
      return (await ldb.getWordsWithSource([k]))[0];
    }, seed.keys.katav);
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4 && document.getElementById("dict-train-newctx"), null, { timeout: 60000 });
    await pg.fill("#dict-q", "כתב");
    await pg.waitForFunction(() => /\(1\)/.test((document.getElementById("dict-train-newctx") || {}).textContent || ""), null, { timeout: 30000 }).catch(() => {});
    const ncBtn = await pg.textContent("#dict-train-newctx");
    await Promise.all([pg.waitForURL(/library\.html/, { timeout: 30000 }), pg.click("#dict-train-newctx")]);
    await pg.waitForFunction(() => { const s = document.querySelector(".room-study"); if (!s || s.hidden) return false; const b = s.querySelector(".room-study-body"); return b && b.innerText.trim() && !/Собираю/.test(b.innerText); }, null, { timeout: 90000 }).catch(() => {});
    const nc = await pg.evaluate(() => { const s = document.querySelector(".room-study"); const b = s && s.querySelector(".room-study-body");
      return { title: (s && (s.querySelector(".room-study-title") || {}).textContent) || "", text: b ? b.innerText : "", empty: !!(b && b.querySelector(".room-study-empty")) }; });
    ok(anchor && anchor.source && anchor.source.textKey === "dict-smoke" && /В новых предложениях \(1\)/.test(ncBtn) && /новых предложениях/.test(nc.title) && !nc.empty
      && /учитель написал на доске|הַלּוּחַ|Второй текст смоука/.test(nc.text) && !/она написала длинное письмо/.test(nc.text),
      `D15 слово в новом предложении (${ncBtn}): «${nc.title}» — задание из другого текста (${nc.text.replace(/\s+/g, " ").slice(0, 90)})`);
    await pg.screenshot({ path: shot("newctx-training") });
    // back to the status the later checks expect («почти знаю»); the schedule and its anchor stay
    await pg.evaluate(async (k) => { const ldb = await import(window.__LDB_URL); await ldb.setWordStatus(k, "l4"); }, seed.keys.katav);
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });


    // D12 «Слова этого текста» (T1/T2): the Room's lemmas == the lens's lemmas (one scan, one key); live statuses
    // with «не размечено»; familiarity from the Room's engine; one-by-one marking writes the canon with the text
    // place; bulk «знаю» with undo; «Учить эти» with unmarked words asks first.
    await pg.goto(BASE + "/library.html?my_text=" + encodeURIComponent(seed.tid), { waitUntil: "load" });
    await pg.waitForFunction(() => document.querySelectorAll("#roomReaderTable .rm-w").length >= 10, null, { timeout: 60000 });
    const roomKeys = await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
      const items = await window.ReaderMorph.collectReviewItems(document.getElementById("roomReaderTable"), await ldb.getAllWordStatuses());
      return items.map((x) => x.lemmaKey).sort();
    });
    await pg.goto(BASE + "/dictionary.html?text=" + encodeURIComponent(seed.tid), { waitUntil: "load" });
    await pg.waitForFunction(() => { const S = window.LPDictionary && window.LPDictionary.state; return S && S.text && S.text.scan && document.querySelectorAll(".dict-row").length >= 3; }, null, { timeout: 60000 });
    await pg.waitForFunction(() => /Знакомо \d+%|не посчитана|появится/.test(document.getElementById("dict-textbar").innerText), null, { timeout: 60000 }).catch(() => {});
    const lens = await pg.evaluate(() => {
      const S = window.LPDictionary.state;
      const keys = [...S.entries.values()].filter((e) => e.inText).map((e) => e.key).sort();
      const rows = [...document.querySelectorAll(".dict-row")].map((b) => ({ key: b.getAttribute("data-key"), meta: b.querySelector(".dict-row-meta").innerText }));
      return { keys, rows, bar: document.getElementById("dict-textbar").innerText, counts: document.getElementById("dict-counts").innerText, sort: document.getElementById("dict-sort").value };
    });
    ok(roomKeys.length >= 5 && JSON.stringify(roomKeys) === JSON.stringify(lens.keys), `D12 леммы текста в словаре = леммы Зала (${lens.keys.length} = ${roomKeys.length})`);
    const katavRow = lens.rows.find((r) => r.key === seed.keys.katav), unmarked = lens.rows.filter((r) => /не размечено/.test(r.meta));
    ok(katavRow && /почти знаю/.test(katavRow.meta) && /в тексте: 1/.test(katavRow.meta) && unmarked.length >= 2 && lens.sort === "textOrder",
      `D12 живой статус и «в тексте: N», неразмеченные видны (${unmarked.length}), порядок по тексту`);
    ok(/Знакомо \d+% слов текста/.test(lens.bar) && /не размечено/.test(lens.counts), "D12 знакомость текста тем же движком, что Зал («" + (lens.bar.match(/Знакомо[^\n]*/) || [""])[0] + "»)");
    await pg.screenshot({ path: shot("text-lens-desktop") });
    // one-by-one marking in the status palette of the article: «знаю» (6) for the first, «незнакомо» (2) for the second
    await pg.click("#dict-triage");
    await pg.waitForSelector("#dict-article .dict-triage-status", { timeout: 30000 });
    const palette = await pg.evaluate(() => [...document.querySelectorAll("#dict-article .dict-triage-status button")].map((b) => b.className.replace(" on", "")));
    const t1 = await pg.evaluate(() => document.querySelector("#dict-article .dict-triage-word .he").textContent);
    await pg.screenshot({ path: shot("triage-desktop") });
    const k1 = await pg.getAttribute("#dict-article .dict-triage", "data-key");
    await pg.keyboard.press("6"); await pg.waitForTimeout(600);
    const k2 = await pg.getAttribute("#dict-article .dict-triage", "data-key");
    await pg.keyboard.press("2"); await pg.waitForTimeout(900);
    const marked = await pg.evaluate(async (keys) => {
      const ldb = await import(window.__LDB_URL), out = [];
      for (const k of keys) { const r = (await ldb.dbQuery("SELECT status, srs_text_key, srs_due FROM word_status WHERE lemma_key = ?", [k]))[0] || {}; out.push({ key: k, db: r.status, tk: r.srs_text_key, due: !!r.srs_due }); }
      return out;
    }, [k1, k2]);
    const mk = k1 !== k2 && marked[0].db === "known" ? marked[0] : null, ml1 = marked[1].db === "l1" ? marked[1] : null;
    ok(palette.join() === "dict-st-new,dict-st-l1,dict-st-l2,dict-st-l3,dict-st-l4,dict-st-known,dict-st-ignore", "D12 разметка — палитра статусов как в статье слова (" + palette.length + " цветов)");
    ok(t1 && mk && !mk.due && ml1 && ml1.due && ml1.tk === "dict-smoke", `D12 разметка: «знаю» без расписания, «не знаю» в повторение с местом из текста (${JSON.stringify(ml1)})`);
    await pg.click("#dict-article .dict-a-back").catch(async () => { await pg.evaluate(() => document.querySelector("#dict-article .dict-a-back").click()); });
    await pg.waitForTimeout(400);
    // bulk «знаю» on the rest + undo
    const before = await pg.evaluate(() => [...window.LPDictionary.state.entries.values()].filter((e) => e.inText && !e.textStatus).length);
    await pg.click("#dict-bulk-known");
    await pg.waitForTimeout(800);
    const mid = await pg.evaluate(() => [...window.LPDictionary.state.entries.values()].filter((e) => e.inText && !e.textStatus).length);
    await pg.click("#dict-toast .dict-toast-act");
    await pg.waitForTimeout(1000);
    const after = await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL), S = window.LPDictionary.state, st = await ldb.getAllWordStatuses();
      const un = [...S.entries.values()].filter((e) => e.inText && !e.textStatus);
      return { n: un.length, dbClear: un.every((e) => !st[e.key]) };
    });
    ok(before >= 1 && mid === 0 && after.n === before && after.dbClear, `D12 массово «знаю» (${before}) и отмена вернула их неразмеченными`);
    // «Учить эти» with unmarked words asks first
    await pg.click("#dict-train-these");
    const choice = await pg.waitForSelector("#dict-train-markl1", { timeout: 5000 }).then(() => pg.textContent("#dict-train-markl1")).catch(() => "");
    ok(/Отметить их как «незнакомо» и учить/.test(choice), "D12 «Учить эти» с неразмеченными словами предлагает выбор («" + choice + "»)");
    // D13 (T4) «словарик к тексту»: forecast by the Room's engine → «Показать эти»; (T3) XLSX of the text with «Текст»
    await pg.reload({ waitUntil: "load" });
    await pg.waitForSelector("#dict-plan-show", { timeout: 60000 }).catch(() => {});
    const plan = await pg.evaluate(() => { const T = window.LPDictionary.state.text; return { line: (document.querySelector(".dict-plan-line") || {}).innerText || "", n: T && T.plan ? T.plan.frontier.length : -1, now: T && T.plan ? T.plan.now : null }; });
    let shown = -1;
    if (plan.n > 0) { await pg.click("#dict-plan-show"); await pg.waitForTimeout(400); shown = await pg.evaluate(() => document.querySelectorAll(".dict-row").length); }
    ok(plan.n > 0 && /знакомость \d+% → \d+%/.test(plan.line) && shown > 0 && shown <= plan.n, `D13 словарик к тексту: «${plan.line.split("\n")[0]}», показано ${shown}`);
    await pg.screenshot({ path: shot("text-plan-desktop") });
    await pg.click('#dict-active .dict-chip').catch(() => {});
    await pg.waitForTimeout(300);
    const [dl2] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click("#dict-xlsx")]);
    await dl2.saveAs(path.join(REPO_ROOT, ".tmp", "dictionary-text-export.xlsx"));
    const tx = await pg.evaluate(async () => {
      const ex = window.LPDictionary.lastExport, zip = await window.JSZip.loadAsync(ex.blob);
      const wb = await zip.file("xl/workbook.xml").async("string"), s3 = await zip.file("xl/worksheets/sheet3.xml").async("string"), s1 = await zip.file("xl/worksheets/sheet1.xml").async("string");
      return { sheets: [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), amber: s3.includes('color rgb="FFB45309"'), links: (s3.match(/location="'Словарь'!X\d+:X\d+"/g) || []).length, title: s1.includes("Слова текста «Смоук словаря»") };
    });
    ok(tx.sheets.join() === "Начать,Словарь,Текст,Таблицы,Формы,Проверь себя,Прогресс" && tx.amber && tx.links >= 1 && tx.title && /Смоук-словаря/.test(dl2.suggestedFilename()),
      `D13 XLSX по тексту: ${dl2.suggestedFilename()} — лист «Текст», неразмеченные оранжевым, ссылок на слова ${tx.links}`);

    // D14 a public text (a Ben-Yehuda work opened in the Room) is a text of the lens too
    await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
      await ldb.createText({ id: "by-smoke", text_key: "by-smoke", title: "Бен-Иегуда смоук", source_meta_json: JSON.stringify({ corpus: { byehuda_id: 99 } }) });
      await ldb.addSentence("by-smoke", { id: "by-s1", order_index: 0, he_plain: "הילד כתב מכתב", he_niqqud: "הַיֶּלֶד כָּתַב מִכְתָּב", ru: "мальчик написал письмо" });
    });
    await pg.goto(BASE + "/dictionary.html?text=by-smoke", { waitUntil: "load" });
    await pg.waitForFunction(() => { const S = window.LPDictionary && window.LPDictionary.state; return S && S.text && S.text.scan && document.querySelectorAll(".dict-row").length >= 2; }, null, { timeout: 60000 }).catch(() => {});
    const by = await pg.evaluate(() => ({ bar: document.getElementById("dict-textbar").innerText, rows: document.querySelectorAll(".dict-row").length,
      groups: [...document.querySelectorAll("#dict-text-sel optgroup")].map((g) => g.label), toast: document.getElementById("dict-toast").innerText }));
    ok(/Бен-Иегуда смоук/.test(by.bar) && /Проект Бен-Иегуда/.test(by.bar) && by.rows >= 2 && by.groups.includes("Мои тексты") && by.groups.includes("Проект Бен-Иегуда") && !/нет на устройстве/.test(by.toast),
      `D14 текст корпуса Бен-Иегуда в срезе: слов ${by.rows}, группы выбора ${by.groups.join(" / ")}`);
    await pg.goto(BASE + "/dictionary.html?text=" + encodeURIComponent(seed.tid), { waitUntil: "load" });
    await pg.waitForFunction(() => { const S = window.LPDictionary && window.LPDictionary.state; return S && S.text && S.text.scan; }, null, { timeout: 60000 });

    // D18 (Д5.1) the lens of a set: a collection of my Mediatheque (two texts on the device + one that is not) and a topic
    // holding it; every lemma of both texts, «в K текстах», the set's familiarity between its texts' own numbers (a
    // token-weighted mean can't leave that range), a mark takes its place from the text the word occurs in, XLSX by text
    await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
      const d = { schema: "linguistpro-mediatheque-v1",
        references: [{ kind: "personal", textKey: "dict-smoke" }, { kind: "personal", textKey: "dict-smoke-2" }, { kind: "personal", textKey: "dict-smoke-gone" }],
        saved: [], categories: [{ id: "t1", title: "Тема смоука", description: "", parentId: null, items: [] }],
        collections: [{ id: "c1", title: "Подборка смоука", description: "", pinned: false, items: ["my/dict-smoke-2", "my/dict-smoke", "my/dict-smoke-gone"], categoryId: "t1" }],
        views: [], annotations: [], home: { title: "", description: "", featured: null, sections: ["continue", "pinned", "recent", "topics"] } };
      window.MediathequeCore.validate(d);
      await ldb.dbQuery("INSERT OR REPLACE INTO mediatheque_personal(singleton, revision, structure_json, undo_json, updated_at) VALUES (1, 1, ?, NULL, ?)", [JSON.stringify(d), new Date().toISOString()]);
    });
    await pg.goto(BASE + "/dictionary.html?text=" + encodeURIComponent("@col:c1"), { waitUntil: "load" });
    await pg.waitForFunction(() => { const T = window.LPDictionary && window.LPDictionary.state.text; return T && T.scan && T.fit && T.texts.every((t) => t.fit && t.fit.status !== "PENDING"); }, null, { timeout: 90000 }).catch(() => {});
    const set = await pg.evaluate(() => {
      const S = window.LPDictionary.state, T = S.text;
      const rows = [...document.querySelectorAll(".dict-row")].map((b) => ({ key: b.getAttribute("data-key"), meta: b.querySelector(".dict-row-meta").innerText }));
      return { isSet: T.isSet, n: T.texts.length, order: T.texts.map((t) => t.key), missing: T.missing, bar: document.getElementById("dict-textbar").innerText, rows,
        lemmas: Array.from(S.entries.values()).filter((e) => e.inText).length,
        pct: T.fit && T.fit.recorded_familiar_pct_lower_bound, parts: T.texts.map((t) => t.fit && t.fit.recorded_familiar_pct_lower_bound),
        groups: [...document.querySelectorAll("#dict-text-sel optgroup")].map((g) => g.label), sel: document.getElementById("dict-text-sel").value,
        counts: document.getElementById("dict-counts").innerText };
    });
    const katavSet = set.rows.find((r) => r.key === seed.keys.katav) || { meta: "" };
    const inRange = set.pct != null && set.parts.every((p) => p != null) && set.pct >= Math.min(...set.parts) - 0.01 && set.pct <= Math.max(...set.parts) + 0.01;
    ok(set.isSet && set.n === 2 && set.order.join() === "dict-smoke-2,dict-smoke" && set.missing === 1 && /Подборка смоука/.test(set.bar) && /подборка Медиатеки · текстов: 2/.test(set.bar)
      && /Не на устройстве: 1/.test(set.bar) && set.sel === "@col:c1" && set.groups.includes("Подборки Медиатеки") && set.groups.includes("Темы Медиатеки"),
      `D18 подборка Медиатеки в срезе: ${set.n} текста в её порядке, 1 нет на устройстве, группы выбора ${set.groups.join(" / ")}`);
    ok(/в подборке: \d+ · в 2 текстах/.test(katavSet.meta) && /Лемм в подборке: \d+/.test(set.counts) && set.lemmas > lens.keys.length,
      `D18 леммы обоих текстов (${set.lemmas} > ${lens.keys.length}), «${katavSet.meta.split("\n").find((x) => /подборке/.test(x)) || katavSet.meta}»`);
    ok(/Знакомо \d+% слов подборки/.test(set.bar) && inRange, `D18 знакомость подборки ${set.pct}% — между знакомостью её текстов (${set.parts.join(" / ")})`);
    await pg.waitForSelector("#dict-plan-show", { timeout: 60000 }).catch(() => {});
    const setPlan = await pg.evaluate(() => { const p = document.querySelector(".dict-plan"); return p ? p.innerText : ""; });
    ok(/Словарик к подборке/.test(setPlan) && /слова подборки: знакомость \d+% → \d+%/.test(setPlan), "D18 словарик к подборке: «" + setPlan.split(/\n/).slice(0, 2).join(" ") + "»");
    await pg.screenshot({ path: shot("set-lens-desktop") });
    await pg.setViewportSize({ width: 380, height: 845 });
    await pg.click(".dict-set-texts summary");
    await pg.waitForTimeout(300);
    const setWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!setWide, "D18 срез подборки и список её текстов на 380 px без прокрутки вбок");
    await pg.screenshot({ path: shot("set-lens-380") });
    await pg.setViewportSize({ width: 1280, height: 900 });
    // (owner 2026-10-14) a word of «Не разобрано» opens the tap card; its ▶ icon has its size (on this page the bare SVG
    // used to grow to 300×150 over the card and take its clicks)
    await pg.setViewportSize({ width: 1280, height: 900 });
    // the chip calls ReaderMorph.openWordCard(surface, niqqud) — the same call, for a name the resolver can't key
    if (await pg.$(".dict-unsure summary")) { await pg.click(".dict-unsure summary"); await pg.click(".dict-unsure[open] .dict-unsure-list .dict-chip"); }
    else await pg.evaluate(() => window.ReaderMorph.openWordCard("אלפריד", "אַלְפְרִיד"));
    await pg.waitForSelector(".rm-speak svg", { timeout: 30000 }).catch(() => {});
    const icon = await pg.evaluate(() => { const s = document.querySelector(".rm-speak svg"), b = document.querySelector(".rm-speak");
      if (!s || !b) return null; const r = s.getBoundingClientRect(), br = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bw: Math.round(br.width) }; });
    ok(icon && icon.w <= 24 && icon.h <= 24 && icon.bw <= 40, `D18 карточка слова из «Не разобрано»: значок ▶ ${icon && icon.w}×${icon && icon.h} px внутри кнопки ${icon && icon.bw} px`);
    // (owner 2026-10-14) the card is ON TOP and opaque: this page has no shared theme, the card's background was transparent
    const face = await pg.evaluate(() => { const c = document.querySelector(".rm-sheet.rm-open .rm-sheet-card"); if (!c) return null;
      const r = c.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
      return { bg: getComputedStyle(c).backgroundColor, onTop: !!(top && c.contains(top)) }; });
    ok(face && face.onTop && !/rgba\(0, 0, 0, 0\)|transparent/.test(face.bg), `D18 карточка слова поверх страницы и непрозрачна: фон ${face && face.bg}`);
    await pg.keyboard.press("Escape").catch(() => {});
    await pg.evaluate(() => { const x = document.querySelector(".rm-sheet.rm-open .rm-sheet-x, .rm-sheet-x"); if (x) x.click(); });
    // a word only in the second text: its mark takes the place from THAT text
    await pg.fill("#dict-q", "לוח"); await pg.waitForTimeout(500);
    const luachKey = await pg.evaluate(() => { const r = document.querySelector(".dict-row"); return r && r.getAttribute("data-key"); });
    await pg.click("#dict-triage");
    await pg.waitForSelector('.dict-triage [data-triage="l1"]', { timeout: 20000 });
    const triSent = await pg.textContent(".dict-triage");
    await pg.click('.dict-triage [data-triage="l1"]');
    await pg.waitForTimeout(800);
    const luach = await pg.evaluate(async (k) => (await (await import(window.__LDB_URL)).getWordsWithSource([k]))[0], luachKey);
    ok(luach && luach.source && luach.source.textKey === "dict-smoke-2" && /Второй текст смоука/.test(triSent),
      `D18 отметка в подборке берёт место из текста слова (${luach && luach.source && luach.source.textKey}), в разметке — название текста`);
    await pg.evaluate(async (k) => { const ldb = await import(window.__LDB_URL); await ldb.setWordStatus(k, ""); }, luachKey).catch(() => {});
    await pg.goto(BASE + "/dictionary.html?text=" + encodeURIComponent("@col:c1"), { waitUntil: "load" });
    await pg.waitForFunction(() => { const T = window.LPDictionary && window.LPDictionary.state.text; return T && T.scan && document.querySelectorAll(".dict-row").length >= 5; }, null, { timeout: 90000 });
    const [dl3] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click("#dict-xlsx")]);
    const setx = await pg.evaluate(async () => {
      const ex = window.LPDictionary.lastExport, zip = await window.JSZip.loadAsync(ex.blob);
      const s3 = await zip.file("xl/worksheets/sheet3.xml").async("string"), s1 = await zip.file("xl/worksheets/sheet1.xml").async("string");
      return { h1: s3.includes("Второй текст смоука"), h2: s3.includes("Смоук словаря"), first: s3.indexOf("Второй текст смоука") < s3.indexOf("Смоук словаря"), title: s1.includes("Слова подборки «Подборка смоука»") };
    });
    ok(setx.h1 && setx.h2 && setx.first && setx.title, `D18 XLSX подборки (${dl3.suggestedFilename()}): лист «Текст» — оба текста под своими заголовками, в порядке подборки`);
    // a topic = the collections inside it
    await pg.selectOption("#dict-text-sel", "@cat:t1");
    await pg.waitForFunction(() => { const T = window.LPDictionary.state.text; return T && T.id === "@cat:t1" && T.scan; }, null, { timeout: 90000 });
    const topic = await pg.evaluate(() => { const T = window.LPDictionary.state.text; return { n: T.texts.length, bar: document.getElementById("dict-textbar").innerText }; });
    ok(topic.n === 2 && /тема Медиатеки/.test(topic.bar), `D18 тема Медиатеки = её подборки: ${topic.n} текста`);
    // (Д5.2) the Studio's multi-select: dictionary.html?texts=<id>,<id>
    await pg.goto(BASE + "/dictionary.html?texts=" + encodeURIComponent(seed.tid) + ",by-smoke", { waitUntil: "load" });
    await pg.waitForFunction(() => { const T = window.LPDictionary && window.LPDictionary.state.text; return T && T.scan && /^@ids:/.test(document.getElementById("dict-text-sel").value); }, null, { timeout: 90000 });
    const picked = await pg.evaluate(() => { const T = window.LPDictionary.state.text; return { kind: T.kind, n: T.texts.length, title: T.title, groups: [...document.querySelectorAll("#dict-text-sel optgroup")].map((g) => g.label), sel: document.getElementById("dict-text-sel").value }; });
    ok(picked.kind === "ids" && picked.n === 2 && /Выбранные тексты \(2\)/.test(picked.title) && picked.groups[0] === "Мой набор текстов" && /^@ids:/.test(picked.sel),
      `D18 выбранные в Студии тексты — срез «${picked.title}»`);
    // (Д5.3) frequency: a band keeps exactly the rows whose shown count is in it
    await pg.click("#dict-filter-btn");
    await pg.click('#dict-filters .dict-chip:has-text("редкие (1)")');
    await pg.waitForTimeout(400);
    const rare = await pg.evaluate(() => [...document.querySelectorAll(".dict-row-meta")].map((m) => (m.innerText.match(/в подборке: (\d+)/) || [])[1]));
    const activeFreq = await pg.textContent("#dict-active");
    ok(rare.length >= 1 && rare.every((n) => n === "1") && /частота в подборке: редкие \(1\)/.test(activeFreq), `D19 частота «редкие (1)» в подборке: ${rare.length} слов, у всех «в подборке: 1»`);
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });
    await pg.click("#dict-filter-btn");
    const fGroup = await pg.evaluate(() => [...document.querySelectorAll("#dict-filters .dict-fgroup > span")].map((s) => s.textContent).find((t) => /Частота/.test(t)) || "");
    await pg.click('#dict-filters .dict-chip:has-text("не встречались")');
    await pg.waitForTimeout(400);
    const zero = await pg.evaluate(() => ({ rows: [...document.querySelectorAll(".dict-row-meta")].map((m) => m.innerText), all: window.LPDictionary.state.view.length }));
    ok(/Частота в моих текстах/.test(fGroup) && zero.rows.every((m) => !/встреч: [1-9]/.test(m)), `D19 «не встречались» в моих словах: ${zero.rows.length} слов, ни у одного «встреч: N»`);

    // D20 (Д5.2) the Studio's ways in: a library card, the multi-select bar and the open saved card → the dictionary's lens
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => typeof window.v3OpenDictionaryWords === "function" && typeof window.ensureLocalDB === "function", null, { timeout: 60000 });
    await pg.waitForTimeout(800);   // the first-run onboarding dialog would cover the Studio's buttons
    await pg.evaluate(() => { try { if (window.v3OnboardingDismiss) window.v3OnboardingDismiss(true); } catch (_) {} });
    await pg.evaluate(() => { window.v3LibraryOpen ? window.v3LibraryOpen() : (typeof v3LibraryOpen === "function" && v3LibraryOpen()); });
    const cardSel = `#v3LibraryList [data-text-id="${seed.tid}"]`;
    await pg.waitForSelector(cardSel + ' button[data-act="dictwords"]', { timeout: 30000 });
    // the opened address is what matters (a new tab of the same origin); record window.open instead of chasing popups
    await pg.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
    await pg.click(cardSel + ' button[data-act="dictwords"]');
    await pg.check(cardSel + ' input[data-act="select"]');
    await pg.click("#v3LibraryBulkDictWords");
    const opened = await pg.evaluate(() => window.__opened.map((u) => new URL(u, location.href).href));
    const url1 = opened[0] || "", url2 = opened[1] || "";
    ok(url1.endsWith("/dictionary.html?text=" + encodeURIComponent(seed.tid)) && /\/dictionary\.html\?text(s)?=/.test(url2) && url2.includes(encodeURIComponent(seed.tid)),
      `D20 Студия → словарь: карточка библиотеки (${url1.replace(BASE, "")}), «Слова выбранных» (${url2.replace(BASE, "")})`);
    await pg.evaluate((id) => v3LibraryOpenText(id, { resume: false }), seed.tid);
    await pg.waitForFunction((id) => { const b = document.getElementById("btnDictWords"); return b && !b.disabled && b.dataset.textId === id; }, seed.tid, { timeout: 30000 }).catch(() => {});
    const ow = await pg.evaluate(() => { const b = document.getElementById("btnDictWords"); return { on: !!b && !b.disabled, id: b && b.dataset.textId, text: b && b.textContent.trim() }; });
    ok(ow.on && ow.id === seed.tid && /Слова/.test(ow.text), `D20 открытая карточка Студии: «${ow.text}» рядом с Anki, ведёт на срез этого текста`);

    // D21 (owner 2026-10-14) every place of a word is reachable — no cap at 40, «Показать ещё» past 20 — and the sticky
    // article stays below the app strip while the list scrolls
    await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
      await ldb.createText({ id: "dict-smoke-many", text_key: "dict-smoke-many", title: "Много мест смоука" });
      for (let i = 0; i < 45; i++) await ldb.addSentence("dict-smoke-many", { id: "dsm-" + i, order_index: i, he_plain: "התלמיד כתב מכתב מספר " + (i + 1), he_niqqud: "הַתַּלְמִיד כָּתַב מִכְתָּב מִסְפָּר " + (i + 1), ru: "ученик написал письмо номер " + (i + 1) });
    });
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4 && document.querySelectorAll(".dict-row").length >= 4, null, { timeout: 60000 });
    await pg.fill("#dict-q", "כתב"); await pg.waitForTimeout(500);
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForSelector("#dict-places-more", { timeout: 90000 }).catch(() => {});
    const pl1 = await pg.evaluate(() => ({ head: (document.querySelector('#dict-article [data-sec="places"] summary, #dict-article details summary') || {}).textContent || "",
      heads: [...document.querySelectorAll("#dict-article summary")].map((x) => x.textContent), n: document.querySelectorAll("#dict-article .dict-place").length }));
    const total = Number(((pl1.heads.find((h) => /Места в моих текстах/.test(h)) || "").match(/· (\d+)/) || [])[1] || 0);
    let guard = 0;
    while (await pg.$("#dict-places-more") && guard++ < 10) { await pg.click("#dict-places-more"); await pg.waitForTimeout(400); }
    const pl2 = await pg.evaluate(() => document.querySelectorAll("#dict-article .dict-place").length);
    ok(total >= 46 && pl1.n === 20 && pl2 === total, `D21 все места слова доступны: заголовок «${total}», сначала 20, после «Показать ещё» — ${pl2}`);
    // the owner's case: a long list scrolled while a word is open (a short viewport makes the list longer than the window)
    await pg.setViewportSize({ width: 1280, height: 520 });
    await pg.fill("#dict-q", ""); await pg.waitForTimeout(600);
    const stick = await pg.evaluate(async () => {
      window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) / 2)); await new Promise((r) => setTimeout(r, 300));
      const nav = document.querySelector(".lp-app-nav"), art = document.getElementById("dict-article");
      return { nav: nav ? nav.getBoundingClientRect().bottom : 0, art: art ? art.getBoundingClientRect().top : -1, y: window.scrollY };
    });
    await pg.setViewportSize({ width: 1280, height: 900 });
    ok(stick.y > 0 && stick.art >= stick.nav - 0.5, `D21 статья при прокрутке списка ниже панели навигации (верх статьи ${Math.round(stick.art)} ≥ низ навигации ${Math.round(stick.nav)})`);

    // D22 (Д6) «Собрать набор»: a Ben-Yehuda work (the real catalog index; its body from a fixture locally, real on
    // production), two works of a public corpus (one answers 503) and a text of the device → one lens. The download goes
    // through CorpusMaterialize (the Room's way); a failure is named, the rest still comes; a downloaded work is on the
    // device afterwards. DICT_BASE (production) uses the live catalogs and needs no fixtures.
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });
    const fx = await pg.evaluate(async (external) => {
      const v = await (await fetch("/api/corpus-catalog/benyehuda")).json();
      const ix = await (await fetch("/data/benyehuda/" + v.index_file)).json();
      const card = ix.ready.find((c) => !c.bundle_sha256 && !c.learning_edition_id && c.title && c.segments < 60) || ix.ready.find((c) => !c.learning_edition_id && c.segments < 60);
      // production: a real public corpus and its first work
      let pub = null;
      if (external) {
        const list = (await (await fetch("/api/public-corpora")).json()).corpora || [];
        for (const c of list) { const cat = await (await fetch("/api/public-corpora/" + encodeURIComponent(c.slug))).json(); const it = (cat.items || [])[0]; if (it) { pub = { slug: c.slug, work: it.public_work_id, title: it.title }; break; } }
      }
      return { version: v.version, card, pub };
    }, EXTERNAL);
    const byBundle = (key, title) => ({ library: { texts: [{ text_key: key, title, source_text: "הילד קרא ספר\nהספר היה ארוך", source_meta: { corpus: { byehuda_id: Number(fx.card.id) } },
      rows: [{ order_index: 0, he_plain: "הילד קרא ספר", he_niqqud: "הַיֶּלֶד קָרָא סֵפֶר", ru: "мальчик читал книгу" }, { order_index: 1, he_plain: "הספר היה ארוך", he_niqqud: "הַסֵּפֶר הָיָה אָרֹךְ", ru: "книга была длинной" }] }] } });
    const H = "d".repeat(64), PUB = EXTERNAL ? fx.pub.slug : "dict-smoke-pub", PUBW = EXTERNAL ? [fx.pub.work] : ["w1", "w2"];
    const pubItem = (w, title) => ({ public_work_id: w, title, creator: "Автор смоука", snapshot_sha256: H, public_read_allowed: true, public_stream_allowed: false, package_download_allowed: false, position_no: 1,
      expected_audio_count: 0, included_audio_count: 0, asset_missing: 0, package_complete: true });
    if (!EXTERNAL) {
      await ctx.route("**/data/benyehuda/works/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(byBundle(fx.card.text_key, fx.card.title)) }));
      await ctx.route("**/api/public-corpora**", (route) => {
        const u = new URL(route.request().url());
        const edition = { edition_id: "ed_smoke", edition_number: 1, manifest_sha256: "e".repeat(64), item_count: 2, asset_count: 0, asset_missing: 0, package_complete: true };
        const corpus = { corpus_id: "pc_smoke", slug: PUB, title: "Корпус смоука" };
        if (u.pathname === "/api/public-corpora") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, corpora: [corpus] }) });
        if (u.pathname === "/api/public-corpora/" + PUB) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ corpus, edition, items: [pubItem("w1", "Первая публичная работа"), pubItem("w2", "Вторая публичная работа")] }) });
        if (u.pathname.endsWith("/works/w2")) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
        if (u.pathname.endsWith("/works/w1")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ corpus, edition: Object.assign({}, edition, { item_count: 1 }), assets: [],
          item: Object.assign(pubItem("w1", "Первая публичная работа"), { snapshot: { library: { texts: [{ text_key: "pub-src-w1", title: "Первая публичная работа", source_text: "המורה כתב שיר",
            rows: [{ order_index: 0, he_plain: "המורה כתב שיר", he_niqqud: "הַמּוֹרֶה כָּתַב שִׁיר", ru: "учитель написал песню" }] }] } } }) }) });
        return route.fallback();
      });
    }
    await pg.reload({ waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });
    await pg.click("#dict-scope-text");
    await pg.click("#dict-sb-open");
    await pg.waitForSelector("#dict-setbuild .dict-sb-src", { timeout: 20000 });
    const srcs = await pg.evaluate(() => [...document.querySelectorAll("#dict-setbuild .dict-sb-src option")].map((o) => o.value));
    // 1) Ben-Yehuda: search by the work's title
    await pg.selectOption("#dict-setbuild .dict-sb-src", "by");
    await pg.waitForSelector("#dict-setbuild .dict-sb-q", { timeout: 20000 });
    await pg.fill("#dict-setbuild .dict-sb-q", fx.card.title.replace(/[֑-ׇ]/g, "").split(/\s+/).slice(0, 2).join(" "));
    await pg.waitForFunction(() => /Найдено: \d+/.test((document.querySelector("#dict-setbuild .dict-sb-results + .dict-note") || {}).textContent || ""), null, { timeout: 60000 }).catch(() => {});
    await pg.waitForSelector(`#dict-setbuild [data-sb-key="by:${fx.card.id}"]`, { timeout: 60000 });
    const byNote = await pg.textContent("#dict-setbuild .dict-sb-results + .dict-note");
    await pg.check(`#dict-setbuild [data-sb-key="by:${fx.card.id}"]`);
    // 2) the public corpus: both works
    await pg.selectOption("#dict-setbuild .dict-sb-src", "pub:" + PUB);
    await pg.fill("#dict-setbuild .dict-sb-q", "");   // the query is kept across sources (one author in several catalogs)
    await pg.waitForSelector(`#dict-setbuild [data-sb-key="pub:${PUB}:${PUBW[0]}"]`, { timeout: 30000 });
    for (const w of PUBW) await pg.check(`#dict-setbuild [data-sb-key="pub:${PUB}:${w}"]`);
    // 3) a text of the device
    await pg.selectOption("#dict-setbuild .dict-sb-src", "device");
    await pg.fill("#dict-setbuild .dict-sb-q", "Смоук словаря");
    await pg.waitForSelector(`#dict-setbuild [data-sb-key="local:${seed.tid}"]`, { timeout: 20000 });
    await pg.check(`#dict-setbuild [data-sb-key="local:${seed.tid}"]`);
    const sum = await pg.textContent("#dict-setbuild .dict-sb-sum");
    await pg.click("#dict-sb-apply");
    await pg.waitForFunction(() => { const T = window.LPDictionary.state.text; return T && T.kind === "ids" && T.scan; }, null, { timeout: 120000 }).catch(() => {});
    await pg.waitForTimeout(500);
    const built = await pg.evaluate(async (k) => {
      const T = window.LPDictionary.state.text, ldb = await import(window.__LDB_URL);
      const by = await ldb.dbQuery("SELECT id, source_meta_json FROM texts WHERE text_key = ?", [k]);
      return { n: T && T.texts.length, titles: T ? T.texts.map((t) => t.title) : [], toast: document.getElementById("dict-toast").innerText, sel: document.getElementById("dict-text-sel").value,
        byOnDevice: by.length === 1, panelHidden: document.getElementById("dict-setbuild").hidden, rows: document.querySelectorAll(".dict-row").length };
    }, fx.card.text_key);
    ok(srcs.includes("device") && srcs.includes("by") && srcs.includes("pub:" + PUB) && /Найдено: \d+/.test(byNote) && Number((byNote.match(/Найдено: (\d+)/) || [])[1]) < 100,
      `D22 источники набора: устройство, Бен-Иегуда, публичные корпуса с сервера (${srcs.length}); поиск по каталогу Бен-Иегуды «${byNote.trim()}»`);
    ok(new RegExp("Выбрано: " + (PUBW.length + 2) + " · скачать: " + (PUBW.length + 1)).test(sum), `D22 корзина: «${sum.trim()}»`);
    ok(built.n === 3 && built.byOnDevice && built.panelHidden && /^@ids:/.test(built.sel) && built.rows >= 3 && /Скачано: 2\./.test(built.toast)
      && (EXTERNAL ? !/Не удалось/.test(built.toast) : /Не удалось: 1 — «Вторая публичная работа» \(public work 503\)/.test(built.toast)),
      `D22 набор из 3 текстов (${built.titles.join(" · ")}), работа Бен-Иегуды теперь на устройстве; итог «${built.toast.trim()}»`);
    await pg.click("#dict-sb-open");
    await pg.selectOption("#dict-setbuild .dict-sb-src", "by");
    await pg.fill("#dict-setbuild .dict-sb-q", fx.card.title.replace(/[֑-ׇ]/g, "").split(/\s+/).slice(0, 2).join(" "));
    await pg.waitForSelector(`#dict-setbuild [data-sb-key="by:${fx.card.id}"]`, { timeout: 60000 });
    const onDev = await pg.evaluate((id) => !!document.querySelector(`#dict-setbuild [data-sb-key="by:${id}"]`).closest("label").querySelector(".dict-sb-on"), fx.card.id);
    await pg.setViewportSize({ width: 380, height: 845 });
    await pg.waitForTimeout(300);
    const sbWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await pg.screenshot({ path: shot("setbuild-380") });
    await pg.setViewportSize({ width: 1280, height: 900 });
    ok(onDev && !sbWide, "D22 скачанная работа помечена «на устройстве»; панель набора на 380 px без прокрутки вбок");
    if (!EXTERNAL) { await ctx.unroute("**/data/benyehuda/works/**"); await ctx.unroute("**/api/public-corpora**"); }

    // D23 (Д7, owner 2026-10-14) a form that is ONE Pealim cell is its lemma; marks on the spelling key move to the lemma
    // once (the later mark wins a conflict); the set list counts the form under the lemma; «Не разобрано» is grouped
    const mig = await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL), RM = window.ReaderMorph, eng = await RM.ensureEngine(), NA = window.NotesAutoGen;
      await ldb.createText({ id: "dict-smoke-id", text_key: "dict-smoke-id", title: "Формы смоука" });
      await ldb.addSentence("dict-smoke-id", { id: "dsi-1", order_index: 0, he_plain: "לתלמידי ילדי אלפריד", he_niqqud: "לְתַלְמִידֵי יַלְדֵי אַלְפְרִיד", ru: "ученикам — детям Альфреда" });
      await ldb.addSentence("dict-smoke-id", { id: "dsi-2", order_index: 1, he_plain: "והשועל ראה", he_niqqud: "וְהַשּׁוּעָל רָאָה", ru: "и лис увидел" });
      const oldKey = async (s, n) => RM.statusKeyForCard(NA, await RM.resolveOffline(eng, s, n), n, s);
      const kShir = await oldKey("לתלמידי", "לְתַלְמִידֵי"), kShual = await oldKey("והשועל", "וְהַשּׁוּעָל"), kAlf = await oldKey("אלפריד", "אַלְפְרִיד");
      const at = (k, iso) => ldb.dbQuery("UPDATE word_status SET updated_at = ? WHERE lemma_key = ?", [iso, k]);
      await ldb.setWordStatus(kShir, "l1");                                   // A: the lemma has no mark → moves
      await ldb.setWordStatus("pid:7738", "known"); await at("pid:7738", "2026-01-01T00:00:00.000Z");
      await ldb.setWordStatus(kShual, "l3"); await at(kShual, "2026-06-01T00:00:00.000Z");   // B: the spelling is later → wins
      await ldb.setWordStatus(kAlf, "l2");                                     // C: a name — no lemma, stays
      const sum = await RM.migrateSpellingMarks(ldb, { force: true });
      const st = async (k) => (await ldb.getWordStatus(k)) || "";
      return { kShir, kShual, kAlf, sum, shir: await st("pid:3610"), shirOld: await st(kShir), shual: await st("pid:7738"), shualOld: await st(kShual), alf: await st(kAlf),
        again: await RM.migrateSpellingMarks(ldb, {}), backup: JSON.parse(localStorage.getItem("lp.identityMigration_v1.backup") || "[]") };
    });
    ok(/#/.test(mig.kShir) && mig.shir === "l1" && mig.shirOld === "" && mig.shual === "l3" && mig.shualOld === "" && mig.alf === "l2" && mig.again === null && mig.backup.length === 2 && mig.backup.some((x) => x.to === "pid:7738" && x.toStatus === "known"),
      `D23 перенос отметок: ${mig.kShir}→pid:3610 «${mig.shir}», ${mig.kShual}→pid:7738 «${mig.shual}» (поздняя отметка написания победила), имя ${mig.kAlf} осталось «${mig.alf}»; повторный запуск не идёт; итог ${JSON.stringify(mig.sum)}`);
    await pg.goto(BASE + "/dictionary.html?text=dict-smoke-id", { waitUntil: "load" });
    await pg.waitForFunction(() => { const T = window.LPDictionary && window.LPDictionary.state.text; return T && T.scan && T.fit; }, null, { timeout: 60000 });
    const idl = await pg.evaluate(() => { const T = window.LPDictionary.state.text, S = window.LPDictionary.state;
      return { keys: Array.from(T.scan.group.keys()), unsure: Array.from(T.scan.unsure.keys()), groups: [...document.querySelectorAll(".dict-unsure > summary")].map((x) => x.textContent),
        fam: document.getElementById("dict-textbar").innerText, counts: T.fit && T.fit.counts,
        chips: document.querySelectorAll('[data-unsure-group="name"] .dict-chip, [data-unsure-group="none"] .dict-chip').length }; });
    // (owner 2026-10-14) every unparsed word has its chip: a capped list (120) hid most of «Нет в словаре»
    ok(idl.unsure.length > 0 && idl.chips === idl.unsure.length, `D23 «Не разобрано»: в списке ${idl.chips} слов из ${idl.unsure.length}`);
    ok(idl.keys.includes("pid:3610") && idl.keys.includes("pid:2650") && idl.keys.includes("pid:7738") && idl.unsure.includes("אלפריד") && !idl.unsure.includes("ילדי")
      && idl.groups.some((g) => /Имена и названия|Не разобрано/.test(g)) && /Знакомо \d+% слов текста/.test(idl.fam) && /Считается по словам этого списка/.test(idl.fam)
      && idl.counts && idl.counts.eligible_denominator === idl.counts.familiar + idl.counts.explicit_new + idl.counts.untracked + idl.counts.unresolved,
      `D23 срез: формы לתלמידי/ילדי/והשועל — леммы ${idl.keys.filter((k) => /3610|2650|7738/.test(k)).join(",")}; не разобрано: ${idl.unsure.join(",")} (${idl.groups.join(" | ")}); знакомость по ключам списка ${JSON.stringify(idl.counts)}`);


    // D24 (Д8-К, owner 2026-10-14; docs/planning/word-layer/F4_D8K_ROLE_CRITIQUE_2026_10_14.md) every word of a text has a
    // place: a word Pealim does not know is a Dicta entry (its key == the Room tap's key), its meaning is the word layer's;
    // a name goes to «Имена и названия», a function word behind a prefix under the checkbox; a Pealim word the layer calls
    // a name is flagged and «Это имя (здесь)» moves it — for this text only; the device's Dicta lexicon is stored
    const d24 = await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL), W = window.WordGlossAI;
      await ldb.createText({ id: "dict-smoke-dicta", text_key: "dict-smoke-dicta", title: "Слова Dicta" });
      const rows = [
        { id: "dsd-1", order_index: 0, he_plain: "פודקאסט חדש עם זהב ג'יהאד", he_niqqud: "פּוֹדְקַאסְט חָדָשׁ עִם זָהָב גִּ'יהָאד", ru: "новый подкаст с Захавом, джихад" },
        { id: "dsd-2", order_index: 1, he_plain: "וזה אלחנן", he_niqqud: "וְזֶה אֶלְחָנָן", ru: "и это Эльханан" },
      ];
      for (const r of rows) await ldb.addSentence("dict-smoke-dicta", r);
      const t = (word, niqqud, posDicta, lemma, stem, prefix) => ({ word, niqqud, posDicta, lemma, lemmas: lemma ? [lemma] : [], stem: stem || word, prefix: prefix || "", confident: false });
      await ldb.saveSentenceMorph("dict-smoke-dicta", "dsd-1", "dicta-morph-v1", [t("פודקאסט", "פּוֹדְקַאסְט", "noun", ""), t("חדש", "חָדָשׁ", "adjective", "חדש"),
        t("עם", "עִם", "preposition", "עם"), t("זהב", "זָהָב", "noun", "זהב"), t("ג'יהאד", "גִּ'יהָאד", "noun", "", "ג'יהאד")], "dicta-morph");
      await ldb.saveSentenceMorph("dict-smoke-dicta", "dsd-2", "dicta-morph-v1", [t("וזה", "וְזֶה", "pronoun", "זה", "זה", "ו"), t("אלחנן", "אֶלְחָנָן", "propernoun", "אלחנן")], "dicta-morph");
      const g = (x) => ({ gloss: x, wrong_hint: false });
      const layer = { schema: W.LAYER_SCHEMA, rows: [
        { order_index: 0, key: W.rowPayloadFromData(rows[0]).key, glosses: [g("подкаст"), g("новый"), g("с"), g("имя: Захав"), g("джихад"), g("джихад")], mwe: [] },   // the layer counts the pointed words: גִּ'יהָאד is two
        { order_index: 1, key: W.rowPayloadFromData(rows[1]).key, glosses: [g("и это"), g("имя: Эльханан")], mwe: [] }] };
      const rem = await W.remember(layer, rows);
      const lex = await window.LPDictionary.morphHost.refreshDictaLexicon();
      const stored = (await ldb.dbQuery("SELECT skeleton, lemma, cls FROM dicta_lexicon WHERE skeleton IN ('פודקאסט','גיהאד','וזה','אלחננ')", [])) || [];   // the stored skeleton folds finals
      return { rem, lexSize: lex ? lex.size : 0, stored: stored.map((r) => r.skeleton + ":" + r.cls) };
    });
    await pg.goto(BASE + "/dictionary.html?text=dict-smoke-dicta", { waitUntil: "load" });
    await pg.waitForFunction(() => { const T = window.LPDictionary && window.LPDictionary.state.text; return T && T.scan && T.fit && T.title === "Слова Dicta"; }, null, { timeout: 60000 });
    const look24 = async () => pg.evaluate(async () => {
      const T = window.LPDictionary.state.text, RM = window.ReaderMorph;
      const row = (k) => { const b = document.querySelector('.dict-row[data-key="' + k + '"]'); return b ? b.innerText : ""; };
      const tap = await RM.resolveWordLight("פודקאסט", "פּוֹדְקַאסְט");
      const sec = (g) => [...document.querySelectorAll('[data-unsure-group="' + g + '"] .dict-chip')].map((c) => c.textContent);
      return { keys: Array.from(T.scan.group.keys()), unsure: Array.from(T.scan.unsure.keys()), func: Array.from(T.scan.func.keys()),
        podcastRow: row("dl:פודקאסט#noun"), jihadRow: row("dl:גיהאד#noun"), tapKey: tap && tap.lemmaKey, tapLabel: tap && tap.label,
        names: sec("name"), none: sec("none"), check: sec("name-check"), funcHidden: !!(document.querySelector('[data-unsure-group="func"]') || {}).hidden,
        hasNameHere: !!document.querySelector('[data-name-here]') };
    });
    const a24 = await look24();
    ok(d24.rem.stored === 2 && d24.lexSize >= 4 && ["פודקאסט:content", "גיהאד:content", "וזה:function", "אלחננ:name"].every((x) => d24.stored.includes(x)),
      `D24 лексикон Dicta устройства сохранён: ${d24.stored.join(", ")} (слой перевода: ${d24.rem.stored} строки)`);
    ok(/по разбору Dicta/.test(a24.podcastRow) && /подкаст/.test(a24.podcastRow) && a24.tapKey === "dl:פודקאסט#noun" && a24.tapLabel === "dicta",
      `D24 запись Dicta: «${a24.podcastRow.replace(/\s+/g, " ").trim()}»; тап в Зале — тот же ключ ${a24.tapKey} (${a24.tapLabel})`);
    ok(a24.keys.includes("dl:גיהאד#noun") && /джихад/.test(a24.jihadRow) && !a24.unsure.some((u) => /^(ג|יהאד)$/.test(u)),
      `D24 ג'יהאד — одно слово, не обрывки: «${a24.jihadRow.replace(/\s+/g, " ").trim()}»`);
    ok(a24.func.includes("וזה") && a24.funcHidden && a24.names.some((x) => /אֶלְחָנָן/.test(x)) && a24.none.length === 0,
      `D24 וְזֶה — служебное (под галочкой, скрыто); имена: ${a24.names.join(" ")}; «Не разобрано» пусто`);
    ok(a24.hasNameHere && a24.check.some((x) => /זָהָב/.test(x)),
      `D24 זָהָב: «золото» по словарю, «имя: Захав» по переводу → «Проверьте: похоже на имя»`);
    await pg.click('[data-name-here]');
    await pg.waitForFunction(() => { const T = window.LPDictionary.state.text; return T && T.scan && T.nameAt && T.nameAt.size > 0
      && [...document.querySelectorAll('[data-unsure-group="name"] .dict-chip')].some((c) => /זָהָב/.test(c.textContent)); }, null, { timeout: 60000 });
    const b24 = await look24();
    const goldKey = a24.keys.find((k) => /^pid:/.test(k) && !b24.keys.includes(k));
    ok(b24.names.some((x) => /זָהָב/.test(x)) && b24.check.length === 0 && !!goldKey,
      `D24 «Это имя (здесь)»: זָהָב теперь в «Имена и названия» (${b24.names.join(" ")}), в списке слов нет ${goldKey}`);
    await pg.click("#dict-show-func");
    const funcShown24 = await pg.evaluate(() => !(document.querySelector('[data-unsure-group="func"]') || {}).hidden);
    await pg.setViewportSize({ width: 380, height: 845 });
    await pg.evaluate(() => document.querySelectorAll(".dict-unsure").forEach((d) => { d.open = true; }));
    await pg.waitForTimeout(300);
    const wide24 = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await pg.screenshot({ path: shot("dicta-lens-380"), fullPage: true });
    await pg.setViewportSize({ width: 1280, height: 900 });
    ok(funcShown24 && !wide24, "D24 галочка показывает служебные слова; срез на 380 px без прокрутки вбок");

    // D16 list tools: a mass status change on any view (palette → confirm → canon write → undo), a saved filter set,
    // the source filter, and «▶ медиа с этого места» for a place in a text with media timing
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4 && document.getElementById("dict-bulkst"), null, { timeout: 60000 });
    await pg.fill("#dict-q", "בית"); await pg.waitForTimeout(500);
    const bulkBefore = await pg.evaluate(async (k) => (await import(window.__LDB_URL)).getWordStatus(k), seed.keys.bayit);
    await pg.click("#dict-bulkst");
    await pg.click('.dict-bulkst [data-bulk-status="l3"]');
    const confirmText = await pg.textContent(".dict-bulkst");
    await pg.click("#dict-bulkst-apply");
    await pg.waitForTimeout(1000);
    const bulkAfter = await pg.evaluate(async (k) => (await import(window.__LDB_URL)).getWordStatus(k), seed.keys.bayit);
    const bulkToast = await pg.textContent("#dict-toast");
    await pg.click("#dict-toast .dict-toast-act");
    await pg.waitForTimeout(1000);
    const bulkUndo = await pg.evaluate(async (k) => (await import(window.__LDB_URL)).getWordStatus(k), seed.keys.bayit);
    ok(bulkBefore === "l1" && /Поставить «вспоминаю» 1 сл/.test(confirmText) && bulkAfter === "l3" && /изменено 1/.test(bulkToast) && bulkUndo === "l1",
      `D16 массовая смена статуса: ${bulkBefore} → ${bulkAfter} («${bulkToast.split("Отменить")[0].trim()}») → отмена → ${bulkUndo}`);
    await pg.fill("#dict-q", ""); await pg.waitForTimeout(400);
    // a saved set: «глагол» → save → reset → apply the saved chip
    await pg.click("#dict-filter-btn");
    await pg.locator("#dict-filters .dict-chip").filter({ hasText: /^глагол$/ }).click();
    await pg.click("#dict-save-view");
    await pg.fill(".dict-saveview input", "Глаголы смоука");
    await pg.click('.dict-saveview button[type="submit"]');
    await pg.waitForTimeout(300);
    await pg.locator("#dict-filters .dict-chip").filter({ hasText: /^глагол$/ }).click();
    await pg.waitForTimeout(300);
    const allRows = await pg.evaluate(() => document.querySelectorAll(".dict-row").length);
    await pg.locator("#dict-saved .dict-chip").filter({ hasText: "Глаголы смоука" }).click();
    await pg.waitForTimeout(400);
    const setRows = await pg.evaluate(() => [...document.querySelectorAll(".dict-row .dict-row-meta")].map((m) => m.innerText));
    const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem("dict.savedViews_v1") || "[]").map((v) => v.name));
    ok(allRows >= 4 && setRows.length >= 1 && setRows.length < allRows && setRows.every((m) => /глагол/.test(m)) && stored.includes("Глаголы смоука"),
      `D16 сохранённый набор «Глаголы смоука»: ${setRows.length} из ${allRows}, хранится на устройстве`);
    await pg.click('#dict-saved .dict-saved-del');
    await pg.click('#dict-active .dict-chip:not(.dict-chip-save)').catch(() => {});
    // the source filter
    await pg.locator("#dict-filters .dict-chip").filter({ hasText: /^Мои тексты$/ }).click();
    await pg.waitForTimeout(300);
    const mine = await pg.evaluate(() => document.querySelectorAll(".dict-row").length);
    await pg.locator("#dict-filters .dict-chip").filter({ hasText: /^Мои тексты$/ }).click();
    await pg.locator("#dict-filters .dict-chip").filter({ hasText: /^Медиатека и общедоступные тексты$/ }).click();
    await pg.waitForTimeout(300);
    const pub = await pg.evaluate(() => ({ rows: document.querySelectorAll(".dict-row").length, empty: !!document.querySelector(".dict-empty") }));
    ok(mine >= 2 && pub.rows === 0 && pub.empty, `D16 фильтр «где встречалось»: мои тексты ${mine}, Медиатека 0 (пусто честно)`);
    await pg.click("#dict-filter-btn");
    // «▶ медиа с этого места»: the second smoke text gets a media passport with timing
    await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
      await ldb.dbRun("UPDATE texts SET table_model_meta_json = ? WHERE id = 'dict-smoke-2'", [JSON.stringify({ source: { audio: { v: 1, segments: [{ start: 0, end: 2.5, text: "x" }], timing: { v: 1, rows: [{ start: 0, end: 2.5 }] } } } })]);
    });
    await pg.goto(BASE + "/dictionary.html?word=" + encodeURIComponent(seed.keys.katav), { waitUntil: "load" });
    await pg.waitForFunction(() => { const a = document.getElementById("dict-article"); return a && /Места в моих текстах/.test(a.innerText) && !/Ищу…/.test(a.innerText); }, null, { timeout: 60000 }).catch(() => {});
    const media = await pg.evaluate(() => [...document.querySelectorAll("#dict-article .dict-media-link")].map((a) => a.getAttribute("href")));
    ok(media.length === 1 && /my_text=dict-smoke-2&at=0&play=1/.test(media[0]), "D16 «▶ медиа с этого места» только у места в тексте с таймингом (" + media.join() + ")");
    await pg.goto(BASE + media[0], { waitUntil: "load" });
    const cue = await pg.waitForFunction(() => /нет отметки времени|Нажмите ▶/.test((document.querySelector(".room-toast, #roomToast, [class*=toast]") || {}).innerText || document.body.innerText), null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok(cue, "D16 Зал по ссылке открывает строку и честно отвечает про ▶ (подсказка нажать или «нет отметки времени»)");
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });
    // D17 «Скачать .apkg»: the dictionary hands the set to the Studio; the deck is built by the Studio's own rich
    // word-card builder (same guid = lemma key, same fields as a Studio text export)
    await pg.waitForSelector("#dict-apkg", { timeout: 30000 });
    const apkgBtn = await pg.textContent("#dict-apkg");
    // the button shows up before the background reading pass ends: export with readings still pending (3.11.761)
    await pg.evaluate(() => window.LPDictionary.state.entries.forEach((e) => { e.reading = undefined; e.paradigm = undefined; }));
    const [studio] = await Promise.all([ctx.waitForEvent("page", { timeout: 30000 }), pg.click("#dict-apkg")]);
    const dlA = await studio.waitForEvent("download", { timeout: 120000 }).catch(() => null);
    const apkg = await studio.evaluate(() => window.__lpLastDictionaryApkg || null).catch(() => null);
    const apkgName = dlA ? dlA.suggestedFilename() : "";
    if (dlA) await dlA.saveAs(path.join(REPO_ROOT, ".tmp", "dictionary-set.apkg"));
    const nA = Number((apkgBtn.match(/\((\d+)\)/) || [])[1]);
    ok(apkg && apkg.cards === nA && /^LinguistPro-dictionary-\d{4}-\d\d-\d\d\.apkg$/.test(apkgName) && apkg.fields && "Conjugation" in apkg.fields && "Mnemonic" in apkg.fields,
      `D17 .apkg из словаря собран построителем Студии: ${apkgName}, карточек ${apkg && apkg.cards} из ${nA}, поля ${apkg && apkg.fields ? Object.keys(apkg.fields).join("/") : "—"}`);
    await studio.close().catch(() => {});

    await pg.goto(BASE + "/dictionary.html?text=" + encodeURIComponent(seed.tid), { waitUntil: "load" });
    await pg.waitForFunction(() => { const S = window.LPDictionary && window.LPDictionary.state; return S && S.text && S.text.scan; }, null, { timeout: 60000 });

    // phone width, Hebrew UI
    await pg.setViewportSize({ width: 380, height: 845 });
    await pg.evaluate(() => localStorage.setItem("app.locale", "he"));
    await pg.reload({ waitUntil: "load" });
    await pg.waitForFunction(() => { const S = window.LPDictionary && window.LPDictionary.state; return S && S.text && S.text.scan && document.querySelectorAll(".dict-row").length >= 3; }, null, { timeout: 60000 });
    const lensWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await pg.screenshot({ path: shot("text-lens-380-he"), fullPage: true });
    await pg.click("#dict-triage");
    await pg.waitForSelector("#dict-article .dict-triage-status", { timeout: 30000 });
    const triWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await pg.screenshot({ path: shot("triage-380-he") });
    ok(!lensWide && !triWide, "D12 срез текста и разметка на 380 px без прокрутки вбок (he)");
    await pg.setViewportSize({ width: 1280, height: 900 });
    await pg.evaluate(() => localStorage.setItem("app.locale", "ru"));
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.LPDictionary && window.LPDictionary.state.entries.size >= 4, null, { timeout: 60000 });

    // D5 scale: 1000 entries
    await pg.evaluate(async () => {
      const ldb = await import(window.__LDB_URL);
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
    // the form drill at phone width (HE): the task panel fits without sideways scroll
    await pg.reload({ waitUntil: "load" });   // at 380 px the article replaces the list
    await pg.waitForFunction(() => document.querySelectorAll(".dict-row").length >= 10, null, { timeout: 60000 });
    await pg.fill("#dict-q", "כתב"); await pg.waitForTimeout(400);
    await pg.click(`.dict-row[data-key="${seed.keys.katav}"]`);
    await pg.waitForSelector("#dict-article .dict-drill-bar .dict-btn", { timeout: 30000 });
    await pg.click("#dict-article .dict-drill-bar .dict-btn");
    await pg.waitForSelector("#dict-article .dict-drill-opt", { timeout: 10000 });
    await pg.evaluate(() => document.querySelector("#dict-article .dict-drill-opts").scrollIntoView({ block: "center" }));
    const drillWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!drillWide, "D7 тренировка форм на 380 px без прокрутки вбок (he)");
    await pg.screenshot({ path: shot("drill-380-he") });
    for (const m of ["tiles", "type"]) {
      await pg.click(`#dict-article .dict-drill-modes [data-mode="${m}"]`);
      await pg.waitForTimeout(150);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!w, `D8 «${m}» на 380 px без прокрутки вбок (he)`);
      await pg.screenshot({ path: shot("drill-380-he-" + m) });
    }
    await pg.goto(BASE + "/dictionary.html", { waitUntil: "load" });
    await pg.waitForFunction(() => document.querySelectorAll(".dict-row").length >= 10, null, { timeout: 60000 });
    await pg.click('[data-view="progress"]');
    await pg.waitForSelector("#dict-prog-view .dict-pbar", { timeout: 60000 });
    const progWide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!progWide, "D10 прогресс на 380 px без прокрутки вбок (he)");
    await pg.screenshot({ path: shot("progress-380-he"), fullPage: true });
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
