"use strict";
// LinguistPro Worlds — behavioural evidence for the vertical slice (2026-09-30).
// Usage: node verify.js   (AUDIT_BASE default http://127.0.0.1:3000; writes ./evidence/*)
// Each check prints PASS/FAIL with measured values; exit code 1 on any FAIL.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "evidence");
fs.mkdirSync(OUT, { recursive: true });
const WORLD = "israel-elections-2026";
let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
}

async function session({ width = 380, world = null, reducedMotion = "no-preference", dark = false, video = false, route } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600,
    reducedMotion, colorScheme: dark ? "dark" : "light", locale: "ru-RU",
    recordVideo: video ? { dir: OUT, size: { width, height: 800 } } : undefined,
  });
  await ctx.addInitScript(({ world }) => {
    localStorage.setItem("onboardingSeen_v1", "1");
    if (world) localStorage.setItem("lp_world_v1", JSON.stringify({ id: world, mode: "calm" }));
    // Evidence instrumentation (test-only): long tasks and layout shifts.
    window.__lt = []; window.__cls = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true }); } catch (_) {}
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls.push(+e.value.toFixed(4)); })).observe({ type: "layout-shift", buffered: true }); } catch (_) {}
  }, { world });
  const page = await ctx.newPage();
  const errors = [], worldRequests = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("request", (r) => { const u = r.url(); if (/\/worlds\/|world-skin\.css/.test(u)) worldRequests.push(u.replace(BASE, "")); });
  if (route) await page.route(route.pattern, route.handler);
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  return { browser, ctx, page, errors, worldRequests };
}
const dbg = (page) => page.evaluate(() => window.LPWorld.debugState());

(async () => {
  // A. Classic: the world costs no art/skin request and no running work.
  {
    const { browser, page, errors, worldRequests } = await session();
    const s = await page.evaluate(() => {
      const st = document.querySelector("[data-world-slot]");
      return { attr: document.documentElement.getAttribute("data-world"), stageH: st.getBoundingClientRect().height, stageHidden: st.hidden,
        engine: typeof window.LPWorld, choice: window.LPWorld.current() };
    });
    check("A1 Classic: no world or skin request", worldRequests.length === 0, worldRequests);
    check("A2 Classic: no data-world, stage hidden with zero height", !s.attr && s.stageHidden && s.stageH === 0, s);
    check("A3 Classic: engine present but idle", s.engine === "object" && s.choice === null, s.choice);
    const engineBytes = await page.evaluate(() => { const e = performance.getEntriesByType("resource").find((r) => /world-engine\.js/.test(r.name)); return e ? { transfer: e.transferSize, decoded: e.decodedBodySize } : null; });
    check("A4 Classic: engine script cost measured", !!engineBytes, engineBytes);
    check("A5 Classic: no page errors", errors.length === 0, errors);
    await browser.close();
  }

  // B. Picker: open from «Разделы и настройки», choose the world, then back to Classic.
  {
    const { browser, page, errors, worldRequests } = await session();
    await page.click("#classicSecondaryNav > summary");
    await page.waitForTimeout(300);
    await page.click("#btnWorld");
    await page.waitForSelector("#lpWorldPicker[open]");
    const btn = await page.$eval("#btnWorld", (b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label") }; });
    check("B1 picker entry ≥ 44×44 with a localized name", btn.w >= 44 && btn.h >= 44 && /Оформление/.test(btn.label), btn);
    await page.screenshot({ path: path.join(OUT, "picker-classic-380.png") });
    await page.check(`#lpWorldPicker input[value="${WORLD}"]`);
    await page.waitForFunction(() => document.documentElement.getAttribute("data-world"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "picker-world-380.png") });
    const targets = await page.$$eval("#lpWorldPicker label, #lpWorldPicker button", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check("B2 picker targets ≥ 44px", targets.every((h) => h >= 44), targets);
    const stored = await page.evaluate(() => localStorage.getItem("lp_world_v1"));
    check("B3 choice stored locally only", stored === JSON.stringify({ id: WORLD, mode: "calm" }), stored);
    await page.click('#lpWorldPicker button[type="submit"]');
    await page.waitForTimeout(300);
    await page.click("#btnWorld");
    await page.check('#lpWorldPicker input[value=""]');
    await page.waitForFunction(() => !document.documentElement.getAttribute("data-world"));
    await page.click('#lpWorldPicker button[type="submit"]');
    const off = await page.evaluate(() => ({ stage: document.querySelector("[data-world-slot]").hidden, sprites: document.querySelectorAll(".lp-world-sprite").length, choice: window.LPWorld.current(), stored: localStorage.getItem("lp_world_v1"), skinVars: !!document.querySelector("style[data-world-ui]") }));
    check("B4 back to Classic: stage hidden, sprites removed, storage cleared, skin vars gone", off.stage && off.sprites === 0 && off.choice === null && off.stored === null && !off.skinVars, off);
    check("B5 picker session without page errors", errors.length === 0, errors);
    await browser.close();
  }

  // C. Real Studio event → scene; budget; suppression; video evidence.
  {
    const { browser, ctx, page, errors, worldRequests } = await session({ world: WORLD, video: true });
    check("C0 world pack requested on demand", worldRequests.some((u) => /manifest\.json/.test(u)) && worldRequests.some((u) => /timsah\.png/.test(u)), worldRequests);
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__lt.length = 0; window.__cls.length = 0; });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("table-job-progress", { detail: { state: "done", readyRows: 5, totalRows: 5 } })));
    await page.waitForTimeout(100);
    const during = await dbg(page);
    check("C1 table-job-progress done → ballot-drop plays", during.scene && during.scene.id === "ballot-drop", during);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "scene-midflight-380.png") });
    await page.waitForTimeout(1600);
    const scenePerf = await page.evaluate(() => ({ longTasks: window.__lt.slice(), cls: window.__cls.reduce((a, b) => a + b, 0) }));
    const after = await dbg(page);
    check("C2 scene ends by itself within 3 s and returns to rest", after.scene === null && after.governor.autoCount === 1, after);
    const again = await page.evaluate(() => { window.dispatchEvent(new CustomEvent("table-job-progress", { detail: { state: "done" } })); return window.LPWorld.debugState(); });
    check("C3 a second table-ready inside the cooldown is dropped, not queued", again.scene === null && again.governor.autoCount === 1, again.governor);
    const progress = await page.evaluate(() => { window.dispatchEvent(new CustomEvent("table-job-progress", { detail: { state: "running" } })); return window.LPWorld.debugState().scene; });
    check("C4 non-final progress never triggers", progress === null);
    await page.focus("#inputText");
    const typing = await page.evaluate(() => window.LPWorld.debugState().busy);
    check("C5 typing is detected as busy", typing === "typing", typing);
    await page.evaluate(() => document.activeElement.blur());
    const manual = await page.evaluate(() => window.LPWorld.play("ballot-drop"));
    check("C6 manual play bypasses the auto budget", manual.played === true, manual);
    await page.waitForTimeout(3100);
    check("C7 no long task (≥ 50 ms) while the scene plays", scenePerf.longTasks.length === 0, scenePerf.longTasks);
    check("C8 the scene causes no layout shift", scenePerf.cls === 0, scenePerf.cls);
    const mem = await page.evaluate(() => [...document.querySelectorAll(".lp-world-sprite")].length);
    check("C9 sprite elements bounded (no leak across plays)", mem <= 3, mem);
    check("C10 no page errors", errors.length === 0, errors);
    const video = await page.video().path();
    await ctx.close(); await browser.close();
    fs.renameSync(video, path.join(OUT, "scene-ballot-drop-380.webm"));
  }

  // D. Reduced motion: no automatic scene; manual play shows the static substitute.
  {
    const { browser, page, errors } = await session({ world: WORLD, reducedMotion: "reduce" });
    const auto = await page.evaluate(() => window.LPWorld.signal("studio.table-ready"));
    check("D1 reduced motion: automatic reaction suppressed", auto.played === false && auto.reason === "reduced-motion", auto);
    const manual = await page.evaluate(() => window.LPWorld.play("ballot-drop"));
    await page.waitForTimeout(200);
    const frames = await page.$$eval(".lp-world-sprite:not([hidden])", (els) => els.map((e) => e.dataset.actor + "@" + e.style.left));
    await page.screenshot({ path: path.join(OUT, "scene-static-reduced-motion-380.png") });
    check("D2 reduced motion: manual play is a static pose", manual.played && manual.static === true, { manual, frames });
    check("D3 no page errors", errors.length === 0, errors);
    await browser.close();
  }

  // E. A broken pack is a missing decoration, never a broken app.
  {
    const { browser, page, errors } = await session({ world: WORLD, route: { pattern: "**/worlds/**/manifest.json*", handler: (r) => r.fulfill({ status: 500, body: "boom" }) } });
    const s = await page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-world"), stage: document.querySelector("[data-world-slot]").hidden, ok: !!document.querySelector("#classicNextActionBtn") }));
    check("E1 failed pack → Classic fallback, Studio intact", !s.attr && s.stage && s.ok, s);
    check("E2 no page errors from the failure", errors.length === 0, errors);
    await browser.close();
  }
  {
    const { browser, page } = await session({ world: WORLD, route: { pattern: "**/worlds/**/manifest.json*", handler: async (r) => { const res = await r.fetch(); const j = await res.json(); j.skin.light.page = "url(https://evil.example/t.png)"; r.fulfill({ response: res, json: j }); } } });
    const attr = await page.evaluate(() => document.documentElement.getAttribute("data-world"));
    check("E3 tampered pack (external URL in a colour token) is refused", !attr, attr);
    await browser.close();
  }

  // F. Emergency exit by URL.
  {
    const { browser, page } = await session({ world: WORLD });
    await page.goto(BASE + "/?world=off", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-world"), stored: localStorage.getItem("lp_world_v1") }));
    check("F1 ?world=off turns the world off and forgets the choice", !s.attr && s.stored === null, s);
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "verify-results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
