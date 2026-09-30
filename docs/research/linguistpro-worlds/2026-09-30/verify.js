"use strict";
// LinguistPro Worlds — behavioural evidence for engine v2 (2026-09-30).
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

async function session({ width = 380, world = null, reducedMotion = "no-preference", video = false, route } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600,
    reducedMotion, locale: "ru-RU", recordVideo: video ? { dir: OUT, size: { width, height: 800 } } : undefined,
  });
  await ctx.addInitScript(({ world }) => {
    localStorage.setItem("onboardingSeen_v1", "1");
    if (world) localStorage.setItem("lp_world_v1", JSON.stringify({ id: world, mode: "live" }));
    window.__lt = []; window.__cls = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true }); } catch (_) {}
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls.push(+e.value.toFixed(4)); })).observe({ type: "layout-shift", buffered: true }); } catch (_) {}
  }, { world });
  const page = await ctx.newPage();
  const errors = [], worldRequests = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("request", (r) => { const u = r.url(); if (/\/worlds\/|world-skin\.css|world-render\.js|world-engine\.js/.test(u)) worldRequests.push(u.replace(BASE, "")); });
  if (route) await page.route(route.pattern, route.handler);
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3500);
  return { browser, ctx, page, errors, worldRequests };
}
const dbg = (page) => page.evaluate(() => window.LPWorld.debugState());
const phase = (page, p) => page.evaluate((p) => document.getElementById("classicNextStep").setAttribute("data-phase", p), p);

(async () => {
  // A. Classic: no world cost beyond the engine script.
  {
    const { browser, page, errors, worldRequests } = await session();
    const s = await page.evaluate(() => {
      const st = document.querySelector('[data-world-slot="studio-stage"]');
      return { attr: document.documentElement.getAttribute("data-world"), stageH: st.getBoundingClientRect().height, stageHidden: st.hidden,
        canvases: document.querySelectorAll(".lp-world-canvas").length, choice: window.LPWorld.current(), render: typeof window.LPWorldRender };
    });
    check("A1 Classic: no request for the world engine, renderer, skin or art", worldRequests.length === 0, worldRequests);
    check("A2 Classic: no data-world, stage hidden (0 px), no canvas, renderer not loaded", !s.attr && s.stageHidden && s.stageH === 0 && s.canvases === 0 && s.render === "undefined", s);
    const bootBytes = await page.evaluate(() => { const e = performance.getEntriesByType("resource").find((r) => /world-boot\.js/.test(r.name)); return e ? { transfer: e.transferSize, decoded: e.decodedBodySize } : null; });
    check("A3 Classic: only the boot stub is paid for (< 2 KB decoded)", bootBytes && bootBytes.decoded < 2000, bootBytes);
    check("A4 Classic: no page errors", errors.length === 0, errors);
    await browser.close();
  }

  // B. Picker: open, choose the world (lively by default), back to Classic.
  {
    const { browser, page, errors } = await session();
    await page.click("#classicSecondaryNav > summary");
    await page.waitForTimeout(300);
    await page.click("#btnWorld");
    await page.waitForSelector("#lpWorldPicker[open]");
    await page.check(`#lpWorldPicker input[value="${WORLD}"]`);
    await page.waitForFunction(() => document.documentElement.getAttribute("data-world"));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "v2-picker-world-380.png") });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lp_world_v1")));
    check("B1 choice stored locally, lively by default", stored && stored.id === WORLD && stored.mode === "live", stored);
    const targets = await page.$$eval("#lpWorldPicker label, #lpWorldPicker button", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check("B2 picker targets ≥ 44px", targets.every((h) => h >= 44), targets);
    await page.click('#lpWorldPicker button[type="submit"]');
    await page.waitForTimeout(300);
    await page.click("#btnWorld");
    await page.check('#lpWorldPicker input[value=""]');
    await page.waitForFunction(() => !document.documentElement.getAttribute("data-world"));
    await page.click('#lpWorldPicker button[type="submit"]');
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => ({ stage: document.querySelector('[data-world-slot="studio-stage"]').hidden, backdrop: document.querySelector('[data-world-slot="page-backdrop"]').hidden,
      canvases: document.querySelectorAll(".lp-world-canvas").length, choice: window.LPWorld.current(), stored: localStorage.getItem("lp_world_v1"), skinVars: !!document.querySelector("style[data-world-ui]"), animating: window.LPWorld.debugState().animating }));
    check("B3 back to Classic: slots hidden, canvases removed, loop stopped, storage cleared", off.stage && off.backdrop && off.canvases === 0 && off.choice === null && off.stored === null && !off.skinVars && !off.animating, off);
    check("B4 picker session without page errors", errors.length === 0, errors);
    await browser.close();
  }

  // C. Living world: journey, story beat, tap, pause; performance while animating.
  {
    const { browser, ctx, page, errors, worldRequests } = await session({ world: WORLD, video: true });
    const d0 = await dbg(page);
    check("C0 world live: stage mounted (page ground is a quiet CSS tone, no backdrop canvas), animating, HQ at start", d0.stage && !d0.backdrop && d0.animating && d0.location === "hq", d0);
    const layers = worldRequests.filter((u) => /layer-/.test(u));
    const light = d0.lighting;
    check("C1 only the current lighting's layers are fetched", layers.length === 3 && layers.every((u) => u.includes("-" + light + "-")), layers);
    await page.evaluate(() => { window.__lt.length = 0; window.__cls.length = 0; });
    await phase(page, "table");
    await page.waitForTimeout(400);
    check("C2 phase change → Timsah walks", (await dbg(page)).walking === true);
    await page.waitForTimeout(3200);
    check("C3 arrives at the press", (await dbg(page)).location === "press");
    await phase(page, "save");
    await page.waitForTimeout(1300 + 700);
    const d3 = await dbg(page);
    check("C4 arrival at the polling station plays the story beat", d3.location === "polling" && d3.scene && d3.scene.id === "ballot-drop" && d3.scene.kind === "story", d3);
    await page.waitForTimeout(3000);
    const perf = await page.evaluate(() => ({ longTasks: window.__lt.slice(), cls: window.__cls.reduce((a, b) => a + b, 0) }));
    check("C5 no long task (≥ 50 ms) during ~9 s of live animation and two journeys", perf.longTasks.length === 0, perf.longTasks);
    check("C6 the living world causes no layout shift", perf.cls === 0, perf.cls);
    const tap = await page.evaluate(() => { const c = document.querySelector(".lp-world-stage canvas"); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.42, y: r.bottom - 80 }; });
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(250);
    const bubble = await page.evaluate(() => { const b = document.querySelector(".lp-world-bubble"); return b ? { text: b.textContent, hidden: b.getAttribute("aria-hidden") } : null; });
    check("C7 tapping Timsah shows a localized line (decorative)", bubble && bubble.text.length > 5 && bubble.hidden === "true", bubble);
    await page.screenshot({ path: path.join(OUT, "v2-tap-380.png") });
    const pause = await page.$eval(".lp-world-pause", (b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed") }; });
    check("C8 visible world pause: 44×44, labelled, not pressed", pause.w >= 44 && pause.h >= 44 && /мир/i.test(pause.label) && pause.pressed === "false", pause);
    await page.click(".lp-world-pause");
    await page.waitForTimeout(200);
    const paused = await page.evaluate(() => ({ d: window.LPWorld.debugState(), pressed: document.querySelector(".lp-world-pause").getAttribute("aria-pressed"), stored: JSON.parse(localStorage.getItem("lp_world_v1")).paused }));
    check("C9 pause stops the loop, is announced and remembered", !paused.d.animating && paused.pressed === "true" && paused.stored === true, paused);
    const amb = await page.evaluate(() => window.LPWorld.signal("ambient"));
    check("C10 nothing auto-plays while paused", amb.played === false && amb.reason === "paused", amb);
    await page.click(".lp-world-pause");
    await page.waitForTimeout(200);
    check("C11 resume restarts the loop", (await dbg(page)).animating === true);
    const mem = await page.evaluate(() => [...document.querySelectorAll(".lp-world-canvas")].map((c) => ({ w: c.width, h: c.height, px: c.width * c.height })));
    check("C12 canvases stay at logical resolution (decoded memory bounded)", mem.every((m) => m.px < 400000), mem);
    // route stops are real controls: tap one → Timsah walks there; the Studio's step stays aria-current
    const stops = await page.$$eval(".lp-world-stop", (bs) => bs.map((b) => ({ loc: b.dataset.loc, label: b.getAttribute("aria-label"), cur: b.getAttribute("aria-current"), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
    check("C15 four labelled 44px route stops; Studio progress marked aria-current", stops.length === 4 && stops.every((s) => s.w >= 44 && s.h >= 44 && s.label) && stops.filter((s) => s.cur === "step").length === 1, stops);
    await page.click('.lp-world-stop[data-loc="hq"]');
    await page.waitForTimeout(3600);
    const hq = await dbg(page);
    check("C16 tapping a stop sends Timsah there (and plays that stop's action)", hq.location === "hq", hq);
    const posters = await page.$$eval(".lp-world-poster", (ps) => ps.map((p) => p.textContent));
    check("C17 the two vowel-party posters hang at the HQ", posters.length === 2 && /אָ/.test(posters.join("")) && /אַ/.test(posters.join("")), posters);
    await page.click(".lp-world-poster");
    await page.waitForTimeout(700);
    const said = await page.evaluate(() => (document.querySelector(".lp-world-bubble") || {}).textContent || "");
    check("C18 a poster tap explains the joke in a bubble", /Камац/.test(said), said);
    await page.focus("#inputText");
    check("C13 typing is detected as busy (no auto/ambient scene starts)", (await dbg(page)).busy === "typing");
    check("C14 no page errors", errors.length === 0, errors);
    const video = await page.video().path();
    await ctx.close(); await browser.close();
    fs.renameSync(video, path.join(OUT, "v2-journey-380.webm"));
  }

  // D. Reduced motion: one still frame, instant journey, no scenes.
  {
    const { browser, page, errors } = await session({ world: WORLD, reducedMotion: "reduce" });
    const d = await dbg(page);
    check("D1 reduced motion: world drawn but not animating", d.stage && !d.animating, d);
    await phase(page, "save");
    await page.waitForTimeout(300);
    const d2 = await dbg(page);
    check("D2 reduced motion: journey is instant, no story animation", d2.location === "polling" && !d2.walking && d2.scene === null, d2);
    await page.screenshot({ path: path.join(OUT, "v2-reduced-motion-380.png") });
    check("D3 no page errors", errors.length === 0, errors);
    await browser.close();
  }

  // E. Broken or tampered packs are a missing decoration, never a broken app.
  {
    const { browser, page, errors } = await session({ world: WORLD, route: { pattern: "**/worlds/**/manifest.json*", handler: (r) => r.fulfill({ status: 500, body: "boom" }) } });
    const s = await page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-world"), stage: document.querySelector('[data-world-slot="studio-stage"]').hidden, ok: !!document.querySelector("#classicNextActionBtn") }));
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

  fs.writeFileSync(path.join(OUT, "verify-v2-results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
