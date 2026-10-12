// word-gloss-ai-smoke.js — гейт Ф3 слоя слов: перевод слов в контексте (Gemini), Студия.
// Спека: docs/planning/word-layer/F3_SPEC_2026_10_11.md.
//
// По умолчанию /api/word-gloss-ctx ПОДМЕНЯЕТСЯ (page.route) — смоук бесплатный и детерминированный:
//   A1 кнопка «весь текст» → диалог согласия с оценкой → один запрос на 3 строки → подписи ИИ
//      (data-gloss-label=ai) у всех слов, сочетание в title, лента показывает перевод ИИ
//   A2 (Ф3б, владелец 2026-10-12) выключение ИИ = только «не дозаказывать»: оплаченные подписи остаются,
//      запросов нет; выключить/включить подстрочник — подписи ИИ снова из хранилища
//   A3 повторное включение → подписи ИИ из локального хранилища, без новых запросов
//   A4 ленивый режим: новая таблица, строка «звучит» → запрос сам, подписи ИИ появляются
//   A6 (Ф3в) карточка по тапу: «в контексте (ИИ)», сочетание, правка закреплена, откат
//   A5 без ключа → понятное сообщение, ни одного запроса
// --live-key-file <path>: дополнительно ЖИВОЙ прогон одной строки через реальный Gemini (ключ из файла
//   кладётся в localStorage одноразового профиля и нигде не печатается).
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3312;
const BASE = process.env.WORD_GLOSS_BASE || `http://127.0.0.1:${PORT}`;
const EXTERNAL = !!process.env.WORD_GLOSS_BASE;
const argv = process.argv.slice(2);
const liveKeyFile = (() => { const i = argv.indexOf("--live-key-file"); return i >= 0 ? argv[i + 1] : ""; })();
const shot = (n) => path.join(REPO_ROOT, ".tmp", "word-gloss-ai-" + n + ".png");
const failures = [];
function ok(c, m) { if (c) console.log("  + " + m); else { console.log("  x " + m); failures.push(m); } }
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c) return; try { c.kill("SIGTERM"); } catch (_) {} await new Promise((r) => setTimeout(r, 1200)); if (process.platform === "win32") { try { require("child_process").execSync(`taskkill /PID ${c.pid} /T /F`, { stdio: "ignore" }); } catch (_) {} } }
async function ready(ms = 40000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 400)); } return false; }

const ROWS = [
  { he: "אני זוכר ששמעתי את זה", he_niqqud: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה", translit: "x", ru: "я помню, что слышал это" },
  { he: "הילדים הולכים לבית שלנו", he_niqqud: "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ", translit: "x", ru: "дети идут к нашему дому" },
  { he: "היא כתבה מכתב ארוך", he_niqqud: "הִיא כָּתְבָה מִכְתָּב אָרֹךְ", translit: "x", ru: "она написала длинное письмо" },
];
const ROWS2 = [
  { he: "אנחנו ראינו את הבית", he_niqqud: "אֲנַחְנוּ רָאִינוּ אֶת הַבַּיִת", translit: "x", ru: "мы видели дом" },
  { he: "הוא כתב שיר", he_niqqud: "הוּא כָּתַב שִׁיר", translit: "x", ru: "он написал песню" },
];

(async () => {
  console.log("word-gloss-ai: перевод слов в контексте (Ф3), Студия" + (liveKeyFile ? " + ЖИВОЙ прогон" : ""));
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
        localStorage.setItem("studio.wordGloss", "1"); localStorage.setItem("studio.wordRibbon", "1"); localStorage.setItem("studio.wordGlossAi", "0");
        if (!localStorage.getItem("v3.geminiApiKey")) localStorage.setItem("v3.geminiApiKey", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE");
      } catch (_) {}
    });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    let calls = 0; const seenRows = [];
    await pg.route("**/api/word-gloss-ctx", async (route) => {
      calls++;
      const body = JSON.parse(route.request().postData() || "{}");
      (body.rows || []).forEach((r) => seenRows.push(r));
      const rows = (body.rows || []).map((r) => ({ i: r.i, glosses: r.words.map((w, k) => ({ gloss: "ИИ" + k + ":" + w.w.length, wrong_hint: false })),
        mwe: r.he.includes("לַבַּיִת") ? [{ from: 2, to: 3, gloss: "к нашему дому" }] : [], fromCache: false }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows, rejected: [], model: "fake", usage: null }) });
    });
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.StudioMorph && !!window.WordGloss && !!window.WordGlossAI && typeof window.renderTable === "function", null, { timeout: 30000 });
    await pg.evaluate(() => { const sweep = () => { try { window.v3OnboardingDismiss && window.v3OnboardingDismiss(false); } catch (_) {} document.querySelectorAll(".v3-modal:not(.hidden), [id*='OnboardingModal'], #v3Phase6Modal").forEach((m) => m.remove()); }; sweep(); setInterval(sweep, 400); });
    await pg.evaluate((rows) => { window.applyPreset("full"); window.v3RenderTableFromLibrary(rows); }, ROWS);
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss]').length >= 13, null, { timeout: 60000 });
    const ui = await pg.evaluate(() => ({ t: !!document.getElementById("studioWordGlossAiToggle"), b: !!document.getElementById("studioWordGlossAiAll") }));
    ok(ui.t && ui.b, "тумблер «Перевод слов ИИ» и кнопка «весь текст» в настройках таблицы");

    // A1 — весь текст
    await pg.evaluate(() => document.getElementById("studioWordGlossAiAll").click());
    await pg.waitForSelector(".wg-ai-consent", { timeout: 10000 }).catch(() => {});
    const dlg = await pg.evaluate(() => { const d = document.querySelector(".wg-ai-consent"); return d ? d.textContent : ""; });
    ok(/Gemini/.test(dlg) && /\$/.test(dlg) && /13/.test(dlg), "A1 диалог согласия: Gemini, число слов и оценка в $ (" + dlg.slice(0, 90) + ")");
    await pg.evaluate(() => document.querySelector(".wg-ai-consent .room-consent-ok").click());
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length === 13, null, { timeout: 20000 }).catch(() => {});
    const a1 = await pg.evaluate(() => {
      const sp = [...document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w')];
      const lb = sp.find((s) => s.getAttribute("data-niqqud") === "לַבַּיִת");
      return { ai: sp.filter((s) => s.getAttribute("data-gloss-label") === "ai").length, first: sp[2] && sp[2].getAttribute("data-gloss"), mwe: lb ? lb.getAttribute("title") : "" };
    });
    ok(a1.ai === 13 && calls === 1, `A1 все 13 слов получили перевод ИИ одним запросом (ai=${a1.ai}, запросов=${calls})`);
    ok(/^ИИ2:/.test(a1.first || ""), "A1 подпись слова = ответ ИИ для этого слова (" + a1.first + ")");
    ok(/к нашему дому/.test(a1.mwe || ""), "A1 сочетание показано в подсказке слова (" + a1.mwe + ")");
    ok(seenRows.every((r) => r.words.length && r.words.some((w) => w.hint)), "A1 офлайн-подсказки ушли в запрос");
    await pg.evaluate(() => document.querySelector('#proTable tbody tr[data-row-idx="0"]').classList.add("row-playing"));
    await pg.waitForFunction(() => { const g = document.querySelector(".rm-ribbon .rm-ribbon-chip:nth-child(3) .rm-ribbon-gloss"); return g && /^ИИ2:/.test(g.textContent); }, null, { timeout: 10000 }).catch(() => {});
    const rib = await pg.evaluate(() => { const c = document.querySelectorAll(".rm-ribbon .rm-ribbon-chip")[2]; return c ? [c.getAttribute("data-gloss-label"), c.querySelector(".rm-ribbon-gloss").textContent] : []; });
    ok(rib[0] === "ai" && /^ИИ2:/.test(rib[1] || ""), "A1 лента показывает перевод ИИ (" + rib.join(" ") + ")");
    await pg.screenshot({ path: shot("studio-380") });

    // A2 — выключение ИИ: оплаченное остаётся видимым, новых запросов нет
    const callsA2 = calls;
    await pg.evaluate(() => { const cb = document.getElementById("studioWordGlossAiToggle"); cb.checked = false; cb.dispatchEvent(new Event("change")); });
    await pg.waitForTimeout(1500);
    const a2 = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length);
    ok(a2 === 13 && calls === callsA2, `A2 выключение ИИ оставляет оплаченные подписи и не шлёт запросов (ai=${a2}, запросов=${calls - callsA2})`);
    await pg.evaluate(() => { const cb = document.getElementById("studioWordGlossToggle"); cb.checked = false; cb.dispatchEvent(new Event("change")); });
    await pg.waitForFunction(() => document.querySelectorAll('.rm-w[data-gloss-label="ai"]').length === 0, null, { timeout: 10000 }).catch(() => {});
    await pg.evaluate(() => { const cb = document.getElementById("studioWordGlossToggle"); cb.checked = true; cb.dispatchEvent(new Event("change")); });
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length === 13, null, { timeout: 20000 }).catch(() => {});
    const a2b = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length);
    ok(a2b === 13 && calls === callsA2, `A2 подстрочник выкл/вкл при выключенном ИИ — подписи ИИ из хранилища (ai=${a2b}, запросов=${calls - callsA2})`);

    // A3 — снова включить: из хранилища, без запросов
    const before = calls;
    await pg.evaluate(() => { const cb = document.getElementById("studioWordGlossAiToggle"); cb.checked = true; cb.dispatchEvent(new Event("change")); });
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length === 13, null, { timeout: 20000 }).catch(() => {});
    const a3 = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length);
    ok(a3 === 13 && calls === before, `A3 повторное включение — из хранилища, без новых запросов (ai=${a3}, новых запросов=${calls - before})`);

    // A6 (Ф3в) — карточка по тапу: строка «в контексте (ИИ)», сочетание, правка закреплена, откат
    const cardText = async () => pg.evaluate(() => { const c = document.querySelector(".rm-sheet-card"); return c && c.offsetParent ? c.innerText : ""; });
    const tapWord = async (row, k) => {
      await pg.evaluate(([row, k]) => { const sp = document.querySelectorAll('#proTable tbody tr[data-row-idx="' + row + '"] td[data-col="niqqud"] .rm-w')[k]; sp.scrollIntoView({ block: "center" }); sp.click(); }, [row, k]);
      await pg.waitForFunction(() => { const c = document.querySelector(".rm-sheet-card"); return c && c.offsetParent && /Мой статус|часть речи/.test(c.innerText); }, null, { timeout: 20000 }).catch(() => {});
    };
    const callsA6 = calls;
    await tapWord(0, 2);
    let txt = await cardText();
    ok(/в контексте \(ИИ\):\s*ИИ2:/.test(txt), "A6 карточка показывает перевод ИИ этого вхождения (" + (txt.match(/в контексте[^\n]*/) || [""])[0] + ")");
    await pg.click(".rm-sheet-card [data-rm-ai-edit]");
    await pg.fill(".rm-sheet-card [data-rm-ai-input]", "что я слышал");
    await pg.click(".rm-sheet-card [data-rm-ai-save]");
    await pg.waitForFunction(() => /в контексте \(исправлено\)/.test((document.querySelector(".rm-sheet-card") || {}).innerText || ""), null, { timeout: 10000 }).catch(() => {});
    txt = await cardText();
    const fixed = await pg.evaluate(() => { const sp = document.querySelectorAll('#proTable tbody tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w')[2]; return [sp.getAttribute("data-gloss"), sp.getAttribute("data-gloss-label")]; });
    ok(/в контексте \(исправлено\):\s*что я слышал/.test(txt) && /ИИ предлагал:\s*ИИ2:/.test(txt) && fixed[0] === "что я слышал" && fixed[1] === "user",
      "A6 правка: карточка «исправлено» + «ИИ предлагал», подпись слова = правка цветом «ваш» (" + fixed.join(" / ") + ")");
    await pg.screenshot({ path: shot("card-fixed-380") });
    // the correction survives a re-render of the table and is never re-requested
    await pg.keyboard.press("Escape").catch(() => {});
    await pg.evaluate((rows) => window.v3RenderTableFromLibrary(rows), ROWS);
    await pg.waitForFunction(() => { const sp = document.querySelectorAll('#proTable tbody tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w')[2]; return sp && sp.getAttribute("data-gloss") === "что я слышал"; }, null, { timeout: 20000 }).catch(() => {});
    const kept = await pg.evaluate(() => { const sp = document.querySelectorAll('#proTable tbody tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w')[2]; return sp && sp.getAttribute("data-gloss"); });
    ok(kept === "что я слышал" && calls === callsA6, `A6 правка переживает перерисовку таблицы, без запросов (${kept}, запросов ${calls - callsA6})`);
    // revert
    await tapWord(0, 2);
    await pg.click(".rm-sheet-card [data-rm-ai-edit]");
    await pg.click(".rm-sheet-card [data-rm-ai-revert]");
    await pg.waitForFunction(() => /в контексте \(ИИ\)/.test((document.querySelector(".rm-sheet-card") || {}).innerText || ""), null, { timeout: 10000 }).catch(() => {});
    const back = await pg.evaluate(() => { const sp = document.querySelectorAll('#proTable tbody tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w')[2]; return [sp.getAttribute("data-gloss"), sp.getAttribute("data-gloss-label")]; });
    ok(/^ИИ2:/.test(back[0]) && back[1] === "ai", "A6 «Вернуть перевод ИИ» возвращает подпись модели (" + back.join(" / ") + ")");
    await pg.keyboard.press("Escape").catch(() => {});
    // an expression is named on the card of a word inside it
    await tapWord(1, 2);
    txt = await cardText();
    ok(/сочетание:\s*к нашему дому/.test(txt), "A6 сочетание показано в карточке слова, входящего в него");
    await pg.keyboard.press("Escape").catch(() => {});

    // A4 — ленивый режим
    await pg.evaluate((rows) => window.v3RenderTableFromLibrary(rows), ROWS2);
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length >= 7, null, { timeout: 20000 });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => document.querySelector('#proTable tbody tr[data-row-idx="0"]').classList.add("smk-row-active"));
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length >= 4, null, { timeout: 30000 }).catch(() => {});
    const a4 = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length);
    ok(a4 >= 4 && calls > before, `A4 ленивый режим сам запросил перевод новой таблицы (ai=${a4}, запросов всего ${calls})`);

    // A5 — без ключа
    const c5 = calls;
    await pg.evaluate((rows) => { localStorage.removeItem("v3.geminiApiKey"); try { window.geminiKeyGet = () => ""; } catch (_) {} window.v3RenderTableFromLibrary(rows); }, [{ he: "שלום", he_niqqud: "שָׁלוֹם", translit: "x", ru: "мир" }]);
    await pg.waitForTimeout(800);
    const msg = await pg.evaluate(async () => window.WordGlossAI.runWholeText(document.getElementById("tableContainer")));
    ok(/ключ Gemini/.test(msg || "") && calls === c5, "A5 без ключа — понятное сообщение и ни одного запроса (" + msg + ")");

    // live — один реальный запрос через сервер
    if (liveKeyFile) {
      const key = fs.readFileSync(liveKeyFile, "utf8").trim();
      await pg.unroute("**/api/word-gloss-ctx");
      await pg.evaluate((k) => { localStorage.setItem("v3.geminiApiKey", k); window.geminiKeyGet = () => k; }, key);
      await pg.evaluate((rows) => window.v3RenderTableFromLibrary(rows), [{ he: "הם הביאו את החללים הביתה", he_niqqud: "הֵם הֵבִיאוּ אֶת הַחֲלָלִים הַבַּיְתָה", translit: "x", ru: "они привезли погибших домой" }]);
      await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length >= 5, null, { timeout: 20000 });
      await pg.waitForTimeout(400);
      await pg.evaluate(() => document.querySelector('#proTable tbody tr[data-row-idx="0"]').classList.add("row-playing"));
      await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[data-gloss-label="ai"]').length >= 5, null, { timeout: 120000 }).catch(() => {});
      const live = await pg.evaluate(() => [...document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w')].map((s) => s.getAttribute("data-gloss-label") + ":" + s.getAttribute("data-gloss")));
      ok(live.length >= 5 && live.every((x) => x.startsWith("ai:")) && /погибш/.test(live.join(" ")), "LIVE реальный Gemini через сервер: " + live.join(" | "));
      await pg.screenshot({ path: shot("live-380") });
    }
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));
  } catch (e) { console.error(String(e && e.message || e)); failures.push("exception"); }
  finally { try { if (browser) await browser.close(); } catch (_) {} await stopServer(srv); }
  if (failures.length) { console.log("[word-gloss-ai-smoke] FAIL (" + failures.length + ")"); process.exit(1); }
  console.log("[word-gloss-ai-smoke] PASS");
})();
