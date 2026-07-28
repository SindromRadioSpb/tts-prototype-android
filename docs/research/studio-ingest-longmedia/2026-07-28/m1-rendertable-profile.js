// M1 (S12 brainstorm, R10): профиль renderTable на 400/800/1700/3000 строк.
// Мобильная аппроксимация: viewport 380×844 + CDP CPU throttle 6x.
// Два сценария: (a) один renderTable(N) целиком; (b) прогрессивная симуляция —
// renderTable(prefix) на каждом куске по 150 строк (цена прогрессива БЕЗ правки renderTable).
"use strict";
const path = require("path");
const { chromium } = require(path.join("E:\\projects\\tts-prototype-android", "node_modules", "playwright"));

const HE = "אתמול הלכתי לשוק לקנות ירקות טריים בשביל ארוחת הערב";
const NQ = "אֶתְמוֹל הָלַכְתִּי לַשּׁוּק לִקְנוֹת יְרָקוֹת טְרִיִּים בִּשְׁבִיל אֲרוּחַת הָעֶרֶב";
const TL = "etmol halakhti lashuk liknot yerakot triyim bishvil aruchat haerev";
const RU = "Вчера я пошёл на рынок купить свежие овощи для ужина";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 150)));
  await page.goto("http://localhost:3000/?v=s12profile", { waitUntil: "domcontentloaded", timeout
: 60000 });
  await page.waitForFunction(() => typeof window.renderTable === "function" || typeof renderTable === "function", null, { timeout: 30000 }).catch(() => {});
  const hasFn = await page.evaluate(() => typeof renderTable === "function");
  console.log("renderTable global:", hasFn);
  if (!hasFn) { await browser.close(); process.exit(1); }

  const results = await page.evaluate(async ({ HE, NQ, TL, RU }) => {
    function mkRows(n) {
      const rows = [];
      for (let i = 0; i < n; i++) {
        rows.push({ he: HE + " " + i, he_niqqud: NQ, translit: TL + " " + i, ru: RU + " " + i, segment_index: i });
      }
      return rows;
    }
    async function settled() { // включаем layout+paint
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const out = [];
    for (const n of [400, 800, 1700, 3000]) {
      const rows = mkRows(n);
      // (a) одна полная отрисовка
      const t0 = performance.now();
      renderTable(rows);
      const tCall = performance.now() - t0;
      await settled();
      const tSettled = performance.now() - t0;
      const nodes = document.getElementById("tableContainer").querySelectorAll("*").length;
      // (b) прогрессив: перерисовка префиксом по 150
      renderTable([]); await settled();
      const p0 = performance.now();
      let worst = 0;
      for (let k = 150; k < n + 150; k += 150) {
        const c0 = performance.now();
        renderTable(rows.slice(0, Math.min(k, n)));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        worst = Math.max(worst, performance.now() - c0);
      }
      const pTotal = performance.now() - p0;
      renderTable([]); await settled();
      out.push({ n, fullCallMs: Math.round(tCall), fullSettledMs: Math.round(tSettled), domNodes: nodes,
                 progressiveTotalMs: Math.round(pTotal), progressiveWorstChunkMs: Math.round(worst),
                 heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null });
    }
    return out;
  }, { HE, NQ, TL, RU });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
