// room-colouring-perf-smoke.js — гейт: «Статус слов» в Читальном зале на длинном тексте не душит страницу.
// O-080 (Room): раскраска меняет class у каждого слова; наблюдатель оформления Worlds (world-activity.js)
// на каждое изменение делал запрос по всему документу — ~19 с из 25 занятого потока на тексте 477 строк.
// Локальный server.js: Студия импортирует текст из 480 строк → Зал (?my_text=…) с «Статусом слов».
//   R1 раскраска завершена за ≤ --max-decorate-ms (по умолчанию 20000)
//   R2 доля занятого потока за время раскраски ≤ --max-busy (по умолчанию 0.6)
//   R3 карточка слова во время раскраски открывается ≤ --max-card-ms (по умолчанию 2500)
const path = require("path");
const { spawn } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3316;
const BASE = `http://127.0.0.1:${PORT}`;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const MAX_DECORATE = arg("--max-decorate-ms", 20000), MAX_BUSY = arg("--max-busy", 0.6), MAX_CARD = arg("--max-card-ms", 2500);
const failures = [];
function ok(c, m) { if (c) console.log("  + " + m); else { console.log("  x " + m); failures.push(m); } }
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c) return; try { c.kill("SIGTERM"); } catch (_) {} await new Promise((r) => setTimeout(r, 1200)); if (process.platform === "win32") { try { require("child_process").execSync("taskkill /pid " + c.pid + " /T /F", { stdio: "ignore" }); } catch (_) {} } }
async function ready(ms = 40000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await new Promise((r) => setTimeout(r, 500)); } return false; }
const BASE_ROWS = [
  ["אני זוכר ששמעתי את זה מהמורה שלי בבית הספר", "אֲנִי זוֹכֵר שֶׁשָּׁמַעְתִּי אֶת זֶה מֵהַמּוֹרֶה שֶׁלִּי בְּבֵית הַסֵּפֶר", "я помню, что слышал это от учителя в школе"],
  ["הילדים הולכים לבית שלנו אחרי הצהריים", "הַיְּלָדִים הוֹלְכִים לַבַּיִת שֶׁלָּנוּ אַחֲרֵי הַצָּהֳרַיִם", "дети идут к нам домой после обеда"],
  ["היא כתבה מכתב ארוך לחברה הטובה שלה", "הִיא כָּתְבָה מִכְתָּב אָרֹךְ לַחֲבֵרָה הַטּוֹבָה שֶׁלָּהּ", "она написала длинное письмо своей подруге"],
  ["למה צריכים מאות מקומות במקררים בבית החולים", "לָמָּה צְרִיכִים מֵאוֹת מְקוֹמוֹת בַּמְּקָרְרִים בְּבֵית הַחוֹלִים", "зачем нужны сотни мест в холодильниках больницы"],
];
const ROWS = Array.from({ length: 480 }, (_, i) => { const b = BASE_ROWS[i % BASE_ROWS.length]; return { order_index: i, hebrew_plain: b[0], hebrew_niqqud: b[1], russian: b[2] + " " + i }; });

(async () => {
  console.log(`room-colouring-perf: «Статус слов» в Зале, ${ROWS.length} строк`);
  const srv = startServer();
  let browser = null; const pageErrors = [];
  try {
    if (!(await ready())) { console.error("server not ready"); process.exit(1); }
    const { chromium } = require("playwright");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1400, height: 950 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.wordStatus", "1"); localStorage.setItem("room.wordGloss", "1"); localStorage.setItem("room.wordRibbon", "1"); localStorage.setItem("room.contextConsent", "declined"); localStorage.setItem("v3.byokOnboardingDismissed", "1"); } catch (_) {} });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/?canon=skip", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.TextCardFormat && typeof window.ensureLocalDB === "function", null, { timeout: 60000 });
    const tid = await pg.evaluate(async (rows) => {
      const ldb = await window.ensureLocalDB();
      await ldb.importBundle(window.TextCardFormat.cardToBundle({ format: "linguistpro-text-card-v2", card: { title: "Длинный текст", source_text: "x", rows } }, { textKey: "room-perf" }), { mode: "skip" });
      return (await ldb.dbQuery("SELECT id FROM texts WHERE text_key = ?", ["room-perf"]))[0].id;
    }, ROWS);
    await ctx.addInitScript(() => {
      window.__lt = { blocked: 0, frames: 0, t0: 0 };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (window.__lt.t0 && e.startTime >= window.__lt.t0) { window.__lt.blocked += e.duration; window.__lt.frames++; } }).observe({ type: "long-animation-frame", buffered: true }); } catch (_) {}
    });
    await pg.goto(BASE + "/library.html?my_text=" + encodeURIComponent(tid), { waitUntil: "load" });
    await pg.waitForFunction(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length > 3000, null, { timeout: 120000 }).catch(async (e) => {
      console.log("    state:", await pg.evaluate(() => JSON.stringify({ url: location.href, rows: document.querySelectorAll("#proTable tbody tr").length, rmw: document.querySelectorAll(".rm-w").length, niq: document.querySelectorAll('#proTable td[data-col="niqqud"]').length, title: document.title })));
      await pg.screenshot({ path: path.join(REPO_ROOT, ".tmp", "room-colouring-debug.png") });
      throw e;
    });
    const t0 = Date.now();
    await pg.evaluate(() => { window.__lt.t0 = performance.now(); });
    await pg.waitForTimeout(800);
    const card = await pg.evaluate(() => new Promise((resolve) => {
      const sp = [...document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w')].find((s) => { const r = s.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 150; }) || document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w')[30];
      sp.scrollIntoView({ block: "center" });
      const t = performance.now(); sp.click();
      const w = () => { const c = document.querySelector(".rm-sheet-card"); const txt = c && c.offsetParent ? c.innerText : ""; if (/Мой статус|часть речи|Открыть на Pealim/.test(txt)) return resolve(Math.round(performance.now() - t)); if (performance.now() - t > 60000) return resolve(-1); setTimeout(w, 25); };
      w();
    }));
    await pg.keyboard.press("Escape").catch(() => {});
    let last = -1, lastChange = Date.now();
    while (Date.now() - t0 < 180000) {
      const n = await pg.evaluate(() => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w[class*="rm-w-"]').length);
      if (n !== last) { last = n; lastChange = Date.now(); } else if (Date.now() - lastChange > 4000) break;
      await pg.waitForTimeout(250);
    }
    const decorateMs = lastChange - t0;
    const lt = await pg.evaluate(() => window.__lt);
    const busy = decorateMs > 0 ? lt.blocked / decorateMs : 0;
    ok(last > 1000 && decorateMs <= MAX_DECORATE, `R1 раскраска ${last} слов за ${decorateMs} мс (порог ${MAX_DECORATE})`);
    ok(busy <= MAX_BUSY, `R2 поток занят ${Math.round(busy * 100)}% времени раскраски (${Math.round(lt.blocked)} мс в ${lt.frames} долгих кадрах; порог ${Math.round(MAX_BUSY * 100)}%)`);
    ok(card >= 0 && card <= MAX_CARD, `R3 карточка слова во время раскраски за ${card} мс (порог ${MAX_CARD})`);
    ok(pageErrors.length === 0, "нет ошибок страницы" + (pageErrors.length ? ": " + pageErrors.slice(0, 2).join(" | ") : ""));
  } catch (e) { console.error(e); failures.push(String(e && e.message || e)); }
  finally { try { if (browser) await browser.close(); } catch (_) {} await stopServer(srv); }
  console.log(failures.length ? `[room-colouring-perf-smoke] FAIL (${failures.length})` : "[room-colouring-perf-smoke] PASS");
  process.exit(failures.length ? 1 : 0);
})();
