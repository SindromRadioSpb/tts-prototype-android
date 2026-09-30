"use strict";
// Fresh browser contexts and a disposable local server; AUDIT_BASE selects production read-only UI smoke.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("../smoke-server-env");
const root = path.resolve(__dirname, "../..");
const out = path.resolve(process.env.AUDIT_OUT || path.join(root, ".tmp/worlds-sukkot-smoke"));
fs.mkdirSync(out, { recursive: true });
let server, browser, dataDir;
const evidence = [];
function pass(name, details) { evidence.push({ name, details }); console.log("PASS", name, JSON.stringify(details || "")); }
(async () => {
  let base = process.env.AUDIT_BASE;
  if (!base) {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-worlds-"));
    server = spawn(process.execPath, ["-e", SMOKE_SERVER_BOOTSTRAP], { cwd: root,
      env: smokeServerEnv(dataDir, 0), stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
    server.stderr.on("data", () => {});
    base = "http://127.0.0.1:" + await waitForSmokeServer(server, 30000);
  }
  browser = await chromium.launch();
  for (const [width, lang] of [[380, "ru"], [380, "he"], [768, "en"], [1280, "ru"], [1280, "he"]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(({ lang }) => {
      localStorage.setItem("onboardingSeen_v1", "1");
      if (!localStorage.getItem("lp_world_v1")) localStorage.setItem("lp_world_v1", JSON.stringify({ id: "sukkot", lighting: "day", mode: "live" }));
      localStorage.setItem("app.locale", lang);
    }, { lang });
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    for (const route of ["/", "/library.html", "/mediatheque.html"]) {
      await page.goto(base + route, { waitUntil: "load" });
      await page.waitForFunction(() => window.LPWorld?.current()?.active);
      await page.evaluate(async lang => {
        if (window.appSetLocale) window.appSetLocale(lang);
      }, lang);
      const expectedLocation = route === "/" ? "courtyard" : route === "/library.html" ? "reading" : "cinema";
      await page.waitForFunction(expected => LPWorld.debugState().location === expected, expectedLocation);
      const d = await page.evaluate(() => LPWorld.debugState());
      assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
      assert.equal(d.choice.id, "sukkot");
      assert.equal(d.choice.active, true);
      assert.equal(d.animating, false);
      assert.equal(d.location, route === "/" ? "courtyard" : route === "/library.html" ? "reading" : "cinema");
      for (const light of ["day", "dusk", "night"]) {
        await page.evaluate(light => LPWorld.setLighting(light), light);
        await page.waitForFunction(light => LPWorld.debugState().lighting === light, light);
      }
      await page.evaluate(() => LPWorld.setLighting("day"));
      await page.waitForFunction(() => LPWorld.debugState().lighting === "day");
      if (lang === "en") await page.evaluate(() => document.body.classList.add("theme-dark"));
      await page.screenshot({ path: path.join(out, `${width}-${lang}-${d.location}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      pass(`surface ${width} ${lang} ${route}`, { location: d.location, lighting: "day/dusk/night" });
    }
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => window.LPWorld?.current()?.active);
    await page.evaluate(() => LPWorld.openPicker());
    if (lang === "en") await page.evaluate(() => document.body.classList.add("theme-dark"));
    await page.locator("#lpWorldPicker").waitFor({ state: "visible" });
    assert.equal(await page.locator(".lp-world-category").count(), 2);
    assert.equal(await page.locator("input[name=lpWorld]").count(), 3);
    await page.screenshot({ path: path.join(out, `${width}-${lang}-picker.png`) });
    await page.locator('input[name="lpWorld"][value="israel-elections-2026"]').check();
    await page.waitForFunction(() => LPWorld.current()?.active && LPWorld.current().id === "israel-elections-2026");
    await page.locator('input[name="lpWorld"][value="sukkot"]').check();
    await page.waitForFunction(() => LPWorld.current()?.active && LPWorld.current().id === "sukkot");
    await page.locator('input[name="lpWorldLight"][value="night"]').check();
    await page.waitForFunction(() => LPWorld.debugState().lighting === "night");
    await page.locator('input[name="lpWorldMode"][value="calm"]').check();
    assert.equal(await page.evaluate(() => LPWorld.current().mode), "calm");
    await page.keyboard.press("Escape");
    await page.locator("#lpWorldPicker").waitFor({ state: "detached" });
    assert.equal(await page.locator("#lpWorldPicker").count(), 0);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => LPWorld.current()?.active);
    assert.equal(await page.evaluate(() => LPWorld.debugState().lighting), "night");
    await page.locator(".lp-world-pause").click();
    assert.equal(await page.evaluate(() => LPWorld.current().paused), true);
    await page.evaluate(() => LPWorld.openPicker());
    await page.locator('input[name="lpWorld"][value=""]').check();
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-world")), false);
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.evaluate(() => LPWorld.current()), null);
    assert.deepEqual(errors, []);
    pass(`picker, persistence, pause and Classic ${width} ${lang}`);
    await ctx.close();
  }
  // A large synthetic registry exercises the same catalog without shipping placeholder worlds.
  for (const fallback of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 380, height: 800 }, serviceWorkers: "block" });
    await ctx.addInitScript(fallback => {
      localStorage.setItem("lp_world_v1", '{"id":"classic"}');
      localStorage.setItem("onboardingSeen_v1", "1");
      if (fallback) window.IntersectionObserver = undefined;
    }, fallback);
    const page = await ctx.newPage(), requests = [];
    page.on("request", r => { if (r.url().includes("/worlds/")) requests.push(r.url()); });
    await page.route("**/worlds/catalog-*/**", async route => {
      const url = new URL(route.request().url()), parts = url.pathname.split("/"), id = parts[2], file = parts[3];
      let body = fs.readFileSync(path.join(root, "public/worlds/sukkot", file));
      if (file === "manifest.json") { const m = JSON.parse(body); m.id = id; body = Buffer.from(JSON.stringify(m)); }
      if (file === "atlas.json") { const a = JSON.parse(body); a.world = id; body = Buffer.from(JSON.stringify(a)); }
      await route.fulfill({ body, contentType: file.endsWith("png") ? "image/png" : "application/json" });
    });
    await page.goto(base + "/", { waitUntil: "load" });
    await page.evaluate(async () => {
      if (LPWorld.stub) await LPWorld.load();
      for (let i = 0; i < 18; i++) LPWorld.core.REGISTRY["catalog-" + i] = {
        ...LPWorld.core.REGISTRY.sukkot, base: "/worlds/catalog-" + i + "/", category: "literature",
        names: { ru: "Test " + i, en: "Test " + i, he: "Test " + i }
      };
      window.__previewFrames = 0;
      LPWorld.openPicker();
    });
    await page.waitForTimeout(800);
    assert.equal(requests.some(u => u.includes("catalog-17/")), false);
    assert.ok(requests.filter(u => u.includes("manifest.json")).length <= 2);
    await page.locator('input[value="catalog-17"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => performance.getEntriesByType("resource").some(r => r.name.includes("catalog-17/manifest")));
    await page.waitForTimeout(500);
    // Count preview paints, independent of the world's own RAF.
    await page.evaluate(() => {
      const original = CanvasRenderingContext2D.prototype.drawImage;
      const target = document.querySelector('input[value="catalog-17"]').closest("label").querySelector("canvas");
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas === target) window.__previewFrames++;
        return original.apply(this, args);
      };
    });
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => window.__previewFrames > 0), JSON.stringify(await page.evaluate(() => ({ hidden: document.hidden, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, canvases: [...document.querySelectorAll(".lp-world-preview")].slice(-2).map(c => ({ width:c.width, top:c.getBoundingClientRect().top, bottom:c.getBoundingClientRect().bottom })) }))));
    await page.evaluate(() => document.getElementById("lpWorldPicker").scrollTop = 0);
    await page.waitForTimeout(150);
    const offscreen = await page.evaluate(() => window.__previewFrames);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__previewFrames), offscreen);
    await page.keyboard.press("Escape");
    await page.locator("#lpWorldPicker").waitFor({ state: "detached" });
    const closed = await page.evaluate(() => window.__previewFrames);
    const requestCount = requests.length;
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__previewFrames), closed);
    assert.equal(requests.length, requestCount);
    // Stale pack completion must not resurrect a dismissed world.
    await page.route("**/worlds/sukkot/manifest.json*", async route => { await new Promise(r => setTimeout(r, 150)); await route.continue(); });
    await page.evaluate(async () => { const pending = LPWorld.set("sukkot"); await LPWorld.set(null); await pending; });
    assert.equal(await page.evaluate(() => LPWorld.current()), null);
    pass(`lazy catalog, hidden/closed animation, stale-load cancellation (fallback=${fallback})`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ base, passed: evidence.length, evidence }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) { const exited = new Promise(r => server.once("exit", r)); server.kill(); await exited; }
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});
