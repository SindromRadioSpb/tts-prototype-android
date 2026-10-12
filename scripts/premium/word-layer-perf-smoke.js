// word-layer-perf-smoke.js — гейт O-080: длинная таблица Студии не должна душить страницу.
// docs/planning/OBSERVATIONS_LOG.md O-080. Студия, ~480 строк, включены «Статус слов», подстрочник,
// лента и ИИ (ленивый режим; /api/word-gloss-ctx подменён). Меряем:
//   P1 время полной раскраски статусов всех слов огласовки;
//   P2 открытие карточки слова (тап) ВО ВРЕМЯ раскраски — до содержимого «Мой статус»;
//   P3 число изменений текста слов при раскраске без смены огласовки (должно быть 0).
// Пороги: --max-decorate-ms (по умолчанию 20000), --max-card-ms (по умолчанию 3000).
const path = require("path");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3314;
const BASE = process.env.WORD_GLOSS_BASE || `http://127.0.0.1:${PORT}`;
const EXTERNAL = !!process.env.WORD_GLOSS_BASE;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const MAX_DECORATE = arg("--max-decorate-ms", 20000), MAX_CARD = arg("--max-card-ms", 3000);
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
const BASE_ROWS = [
  { he: "אני זוכר ששמעתי את זה", he_niqqud: "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה", translit: "x", ru: "я помню, что слышал это" },
  { he: "הילדים הולכים לבית שלנו", he_niqqud: "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ", translit: "x", ru: "дети идут к нашему дому" },
  { he: "היא כתבה מכתב ארוך", he_niqqud: "הִיא כָּתְבָה מִכְתָּב אָרֹךְ", translit: "x", ru: "она написала длинное письмо" },
  { he: "אנחנו ראינו את הבית", he_niqqud: "אֲנַחְנוּ רָאִינוּ אֶת הַבַּיִת", translit: "x", ru: "мы видели дом" },
  { he: "הוא כתב שיר יפה מאוד", he_niqqud: "הוּא כָּתַב שִׁיר יָפֶה מְאוֹד", translit: "x", ru: "он написал очень красивую песню" },
  { he: "למה צריכים מאות מקומות במקררים", he_niqqud: "לָמָּה צְרִיכִים מֵאוֹת מְקוֹמוֹת בַּמְּקָרְרִים", translit: "x", ru: "зачем нужны сотни мест в холодильниках" },
];
const ROWS = Array.from({ length: 480 }, (_, i) => ({ ...BASE_ROWS[i % BASE_ROWS.length], ru: BASE_ROWS[i % BASE_ROWS.length].ru + " " + i }));

(async () => {
  console.log(`word-layer-perf: длинная таблица Студии (${ROWS.length} строк), O-080`);
  const srv = EXTERNAL ? null : startServer();
  let browser = null; const pageErrors = [];
  try {
    if (!EXTERNAL && !(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.contextConsent", "declined");
        localStorage.setItem("studio.wordStatus", "1"); localStorage.setItem("v3.byokOnboardingDismissed", "1");
        localStorage.setItem("studio.wordGloss", "1"); localStorage.setItem("studio.wordRibbon", "1"); localStorage.setItem("studio.wordGlossAi", "1");
        localStorage.setItem("v3.geminiApiKey", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE");
      } catch (_) {}
    });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.route("**/api/word-gloss-ctx", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const rows = (body.rows || []).map((r) => ({ i: r.i, glosses: r.words.map((w, k) => ({ gloss: "ИИ" + k, wrong_hint: false })), mwe: [] }));
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows, rejected: [], model: "fake" }) });
    });
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.StudioMorph && !!window.WordGloss && !!window.WordGlossAI && typeof window.v3RenderTableFromLibrary === "function", null, { timeout: 60000 });
    await pg.evaluate(() => { const sweep = () => { try { window.v3OnboardingDismiss && window.v3OnboardingDismiss(false); } catch (_) {} document.querySelectorAll(".v3-modal:not(.hidden), [id*='OnboardingModal'], #v3Phase6Modal").forEach((m) => m.remove()); }; sweep(); setTimeout(sweep, 1500); });
    // count text rewrites of word spans (each one is a childList mutation the table observers see)
    await pg.evaluate(() => {
      window.__textWrites = 0;
      const mo = new MutationObserver((ms) => { for (const m of ms) if (m.type === "childList" && m.target && m.target.classList && m.target.classList.contains("rm-w")) window.__textWrites++; });
      mo.observe(document.getElementById("tableContainer") || document.body, { subtree: true, childList: true });
    });
    const t0 = Date.now();
    await pg.evaluate((rows) => { window.applyPreset("full"); window.v3RenderTableFromLibrary(rows); }, ROWS);
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length > 2000, null, { timeout: 60000 });
    const total = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length);
    // P2 — tap a word while the decoration is still running
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => { const r = document.querySelector('#proTable tbody tr[data-row-idx="3"]'); if (r) r.scrollIntoView({ block: "start" }); });
    await pg.waitForTimeout(300);
    const card = await pg.evaluate(() => new Promise((resolve) => {
      const sp = [...document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w')].find((s) => { const r = s.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 120; });
      const decoratedAtTap = document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[class*="rm-w-"]').length;
      const t = performance.now(); sp.click();
      const w = () => { const c = document.querySelector(".rm-sheet-card"); const txt = c && c.offsetParent ? c.innerText : "";
        if (/Мой статус/.test(txt)) return resolve({ ms: Math.round(performance.now() - t), decoratedAtTap });
        if (performance.now() - t > 60000) return resolve({ ms: -1, decoratedAtTap }); setTimeout(w, 25); };
      w();
    }));
    await pg.keyboard.press("Escape").catch(() => {});
    // P1 — decoration of every niqqud word
    // decoration is done when the decorated count stops growing (function/unknown words get no class)
    let last = -1, lastChange = Date.now();
    while (Date.now() - t0 < 300000) {
      const n = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[class*="rm-w-"]').length);
      if (n !== last) { last = n; lastChange = Date.now(); } else if (Date.now() - lastChange > 4000) break;
      await pg.waitForTimeout(250);
    }
    const decorateMs = lastChange - t0;
    const decorated = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[class*="rm-w-"]').length);
    const writes = await pg.evaluate(() => window.__textWrites);
    ok(decorated > 0 && decorateMs <= MAX_DECORATE, `P1 раскраска ${decorated}/${total} слов за ${decorateMs} мс (порог ${MAX_DECORATE})`);
    ok(card.ms >= 0 && card.ms <= MAX_CARD, `P2 карточка слова во время раскраски открылась за ${card.ms} мс (раскрашено к тапу ${card.decoratedAtTap}; порог ${MAX_CARD})`);
    ok(writes === 0, `P3 раскраска без смены огласовки не переписывает текст слов (записей ${writes})`);
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""));
  } catch (e) {
    console.error(e); failures.push(String(e && e.message || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer(srv);
  }
  console.log(failures.length ? `[word-layer-perf-smoke] FAIL (${failures.length})` : "[word-layer-perf-smoke] PASS");
  process.exit(failures.length ? 1 : 0);
})();
