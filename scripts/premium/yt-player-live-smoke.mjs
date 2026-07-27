// scripts/premium/yt-player-live-smoke.mjs
// W2-S5a: живая проверка, что <iframe credentialless> действительно даёт рабочий YouTube-плеер
// на странице с COEP: require-corp, и что cross-origin isolation при этом НЕ ломается.
// Обычный iframe там не стартует (разведка 2026-07-27) — контроль включён в проверку.
import { chromium } from "playwright";

const url = (process.argv.find((a) => a.startsWith("--url=")) || "--url=http://localhost:3000").slice(6);
const VIDEO = "dQw4w9WgXcQ";

const PROBE = (credentialless) => `(() => new Promise(res => {
  const out = { isolatedBefore: window.crossOriginIsolated, credentialless: ${credentialless} };
  const ifr = document.createElement('iframe');
  ${credentialless ? "ifr.setAttribute('credentialless','');" : ""}
  ifr.width = 320; ifr.height = 180; ifr.allow = 'autoplay';
  ifr.src = 'https://www.youtube.com/embed/${VIDEO}?enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  document.body.appendChild(ifr);
  const boot = () => new window.YT.Player(ifr, { events: {
    onReady: e => { const p = e.target; try { p.mute(); p.playVideo(); } catch (_) {}
      setTimeout(() => { let t1 = 0, t2 = 0, d = 0;
        try { d = p.getDuration(); t1 = p.getCurrentTime(); } catch (_) {}
        setTimeout(() => { try { t2 = p.getCurrentTime(); } catch (_) {}
          out.ready = true; out.duration = d; out.clockAdvances = t2 > t1;
          out.isolatedAfter = window.crossOriginIsolated; res(out); }, 2200); }, 2200); },
    onError: e => { out.ready = false; out.ytError = e.data; res(out); } } });
  if (window.YT && window.YT.Player) boot();
  else { window.onYouTubeIframeAPIReady = boot;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { out.apiErr = true; res(out); }; document.head.appendChild(s); }
  setTimeout(() => { out.timeout = true; out.isolatedAfter = window.crossOriginIsolated; res(out); }, 25000);
}))()`;

let failed = 0;
for (const channel of [undefined, "chrome", "msedge"]) {
  const label = channel || "bundled-chromium";
  let browser;
  try { browser = await chromium.launch(channel ? { channel } : {}); }
  catch (e) { console.log(`skip ${label}: not installed`); continue; }
  const page = await (await browser.newContext()).newPage();
  const resp = await page.goto(`${url}/?v=s5asmoke`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const coep = resp.headers()["cross-origin-embedder-policy"];
  const good = await page.evaluate(PROBE(true));
  const control = await page.evaluate(PROBE(false));
  const problems = [];
  if (coep !== "require-corp") problems.push(`COEP is "${coep}" — the isolation this slice depends on changed`);
  if (!good.ready) problems.push(`credentialless player not ready (${good.ytError ?? (good.timeout ? "timeout" : "?")})`);
  if (!good.clockAdvances) problems.push("credentialless player clock does not advance");
  if (good.isolatedAfter !== true) problems.push("crossOriginIsolated lost after embedding");
  if (control.ready) problems.push("control: plain iframe now works — re-check whether credentialless is still needed");
  console.log(`${problems.length ? "FAIL" : "ok  "} ${label} v${browser.version()}: ready=${good.ready} clock=${good.clockAdvances} isolated=${good.isolatedAfter} control.ready=${control.ready}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;

  // Step 3B: караоке ДОЛЖНО ехать от адаптера, а не только от blob: строим adapter, отдаём его
  // StudioMediaKaraoke со синтетическим entries и смотрим, что подсветка идёт за часами плеера.
  // Требует StudioYtPlayer/StudioMediaKaraoke на странице (Task 8 script-теги в index.html) —
  // локальная сборка их несёт, прод (пока не задеплоена эта ветка) — нет; в этом случае честно
  // пропускаем, а не молча ослабляем проверку.
  const hasModules = await page.evaluate(() => !!(window.StudioYtPlayer && window.StudioMediaKaraoke));
  if (!hasModules) {
    console.log(`skip ${label} karaoke: StudioYtPlayer/StudioMediaKaraoke not present on this page (build predates Task 8, or prod)`);
  } else {
    const karaoke = await page.evaluate(`(() => new Promise(res => {
  const out = {};
  const mount = document.createElement('div'); document.body.appendChild(mount);
  // таблица-заглушка: караоке красит tr[data-row-idx] внутри #proTable
  if (!document.getElementById('proTable')) {
    const t = document.createElement('table'); t.id = 'proTable';
    const tb = document.createElement('tbody');
    for (let i = 0; i < 4; i++) { const tr = document.createElement('tr'); tr.setAttribute('data-row-idx', String(i)); tb.appendChild(tr); }
    t.appendChild(tb); document.body.appendChild(t);
  }
  window.StudioYtPlayer.create(mount, '${VIDEO}').then(async (ad) => {
    out.adapterReady = true;
    const entries = [{ o: 0, t: 0 }, { o: 2, t: 3 }];   // ССЫЛОЧНОЕ равенство: один и тот же массив
    await window.StudioMediaKaraoke.start({ media: ad, entries: entries, rowCount: 4 });
    out.isActiveAfterStart = window.StudioMediaKaraoke.isActive();
    setTimeout(() => {
      out.paintedEarly = !!document.querySelector('#proTable tr.smk-row-active');
      out.tEarly = ad.currentTime;
      ad.currentTime = 4;                                 // перемотка через сеттер адаптера
      setTimeout(() => {
        const hot = [...document.querySelectorAll('#proTable tr.smk-row-active')].map(tr => tr.getAttribute('data-row-idx'));
        out.hotRowsAfterSeek = hot;
        window.StudioMediaKaraoke.stop();
        out.paintedAfterStop = !!document.querySelector('#proTable tr.smk-row-active');
        out.pausedAfterStop = ad.paused;
        window.StudioYtPlayer.destroy(ad);
        res(out);
      }, 2500);
    }, 2500);
  }).catch(e => { out.createError = String(e && e.code || e); res(out); });
  setTimeout(() => { out.timeout = true; res(out); }, 30000);
}))()`);

    const kProblems = [];
    if (karaoke.timeout) kProblems.push("karaoke check timed out");
    if (karaoke.createError) kProblems.push(`StudioYtPlayer.create() failed: ${karaoke.createError}`);
    if (!karaoke.adapterReady) kProblems.push("adapter never became ready");
    if (!karaoke.isActiveAfterStart) kProblems.push("StudioMediaKaraoke.isActive() is false right after start()");
    if (!karaoke.paintedEarly) kProblems.push("highlight never appeared before the seek (not clock-driven)");
    const hotRows = Array.isArray(karaoke.hotRowsAfterSeek) ? karaoke.hotRowsAfterSeek : [];
    const followsSeek = hotRows.length > 0 && hotRows.every((r) => r === "2" || r === "3");
    if (!followsSeek) kProblems.push(`highlight after seek to t=4 is ${JSON.stringify(hotRows)}, expected only rows "2"/"3"`);
    if (karaoke.paintedAfterStop) kProblems.push("highlight still painted after stop()");
    if (!karaoke.pausedAfterStop) kProblems.push("adapter not paused after stop()");
    console.log(`${kProblems.length ? "FAIL" : "ok  "} ${label} karaoke: adapterReady=${karaoke.adapterReady} isActiveAfterStart=${karaoke.isActiveAfterStart} paintedEarly=${karaoke.paintedEarly} hotRowsAfterSeek=${JSON.stringify(hotRows)} paintedAfterStop=${karaoke.paintedAfterStop} pausedAfterStop=${karaoke.pausedAfterStop}`);
    if (kProblems.length) {
      kProblems.forEach((p) => console.log(`      - ${p}`));
      console.log(`      full object: ${JSON.stringify(karaoke)}`);
    }
    failed += kProblems.length ? 1 : 0;
  }

  await browser.close();
}
if (failed) { console.error(`\nyt-player live smoke FAILED (${failed} browser(s))`); process.exit(1); }
console.log("\nyt-player live smoke OK");
