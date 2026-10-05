"use strict";

// Actual historical workers and actual note editors: unchanged saved SQL does
// not prove preservation of the current unsaved draft in the mounted page.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const http = require("node:http"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("../smoke-server-env");
const ROOT = path.resolve(__dirname, "../..");
const LEGACY = "3a4a68619c8e3483b6b1f7c68e5f6e21463f79de";
const argument = name => process.argv.find(value => value.startsWith("--" + name + "="))?.split("=").slice(1).join("=");
const current = path.resolve(argument("current-root") || ROOT);
const expectLoss = process.argv.includes("--expect-draft-loss");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "lp-sw-room-draft-"));
const reportPath = path.resolve(argument("report") || path.join(ROOT, ".tmp/sw-room-draft-report.json"));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const read = file => fs.readFileSync(path.join(current, file), "utf8");
const targetVersion = read("public/sw.js").match(/CACHE_VERSION = "v([^"]+)"/)[1];
const moduleKey = read("public/library.html").match(/library-ui\.js\?v=(\d+)/)[1];
const report = { startedAt: new Date().toISOString(), legacyCommit: LEGACY, targetVersion,
  expectedOutcome: expectLoss ? "reproduce rejected marker bridge P1" : "preserve draft and wait for explicit confirmation",
  scope: "Disposable native browser, actual note editor; no owner data, providers or cache/OPFS deletion", runtimeHashes: {}, cases: [] };
for (const file of ["public/sw.js", "public/library.html", "public/js/library-ui.js", "public/index.html", "server.js"]) {
  report.runtimeHashes[file] = hash(fs.readFileSync(path.join(current, file)));
}
const children = [];
let browser, proxy, phase = "legacy", hold = true, held = [], holdCount = 0;
function save() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
}
function legacySource() {
  const source = path.join(out, "legacy"), archive = path.join(out, "legacy.tar");
  fs.mkdirSync(source);
  execFileSync("git", ["archive", "--format=tar", "-o", archive, LEGACY], { cwd: ROOT, windowsHide: true });
  execFileSync("tar", ["-xf", archive, "-C", source], { windowsHide: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(source, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  return source;
}
async function start(source, name) {
  const child = spawn(process.execPath, ["-e", SMOKE_SERVER_BOOTSTRAP], { cwd: source, windowsHide: true,
    env: smokeServerEnv(path.join(out, name + "-data"), 0), stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.push(child); child.stdout.resume(); child.stderr.resume();
  return waitForSmokeServer(child, 30000);
}
function releaseInstall() { hold = false; for (const forward of held.splice(0)) forward(); }
async function waitUntil(probe, label) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Draft smoke timeout: " + label);
}
async function workerVersion(page) {
  return page.evaluate(() => new Promise(resolve => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return resolve(null);
    const channel = new MessageChannel(), timer = setTimeout(() => resolve("timeout"), 5000);
    channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data.version); };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  }));
}
async function state(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return { url: location.href, footer: document.querySelector("#roomFooterVersion")?.textContent,
      installing: reg?.installing?.state, waiting: reg?.waiting?.state, documentTag: window.__draftSmokeDocumentTag };
  });
}
async function notesHash(page) {
  await page.waitForFunction(() => window.__localDB?.isReady?.());
  return hash(await page.evaluate(async () => JSON.stringify(await window.__localDB.dbQuery("SELECT * FROM notes_v2 ORDER BY id", []))));
}
async function fresh(base) {
  phase = "legacy"; hold = true; held = []; holdCount = 0;
  const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 1280, height: 850 } });
  context.setDefaultTimeout(45000);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem("app.locale", "ru"); localStorage.setItem("room.contextConsent", "declined");
    localStorage.setItem("phase6Decision_v1", "declined"); localStorage.setItem("onboardingSeen_v1", "1");
  });
  const warm = await context.newPage();
  await warm.goto(base + "/library.html?canon=skip#room=hub");
  await warm.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await warm.reload(); await warm.waitForFunction(() => window.__roomReady && window.__localDB?.isReady?.());
  // Finish the legacy boot's registration/update work before switching servers.
  await warm.evaluate(async () => { await (await navigator.serviceWorker.getRegistration("/")).update(); });
  await waitUntil(() => warm.evaluate(async () => !(await navigator.serviceWorker.getRegistration("/"))?.installing), "legacy boot settles");
  assert.equal(await workerVersion(warm), "3.11.729");
  await warm.evaluate(async () => {
    const db = window.__localDB;
    await db.createText({ id: "draft-smoke", text_key: "draft-smoke", title: "Synthetic draft fixture", source_text: "שלום עולם" });
    await db.addSentence("draft-smoke", { id: "draft-smoke-row", he_plain: "שלום עולם", he_niqqud: "שָׁלוֹם עוֹלָם", ru: "Синтетическая строка" });
  });
  return { context, warm };
}
async function scenario(base, name) {
  const { context, warm } = await fresh(base);
  const result = { name, startedAt: new Date().toISOString(), explicitUpdateClicks: 0, navigations: 0, otherTabNavigations: 0, errors: [] };
  report.cases.push(result);
  try {
    phase = "target";
    const page = await context.newPage(); page.on("pageerror", error => result.errors.push(String(error)));
    const marker = "room_update=" + targetVersion;
    await page.goto(base + "/library.html?canon=skip&my_text=draft-smoke" + (name === "forged-marker" ? "&" + marker : "") + "#room=hub");
    await page.locator("#roomReaderTable .rm-w").first().waitFor();
    if (name === "draft-after-confirmation") {
      await page.locator(".room-update-toast .ru-upd").waitFor();
      await Promise.all([page.waitForNavigation(), page.locator(".room-update-toast .ru-upd").click()]);
      result.explicitUpdateClicks = 1;
      await page.locator("#roomReaderTable .rm-w").first().waitFor();
      assert.ok(page.url().includes(marker), "Real legacy confirmation must produce the target marker");
    }
    await page.locator("#roomReaderTable .rm-w").first().click();
    await page.locator(".rm-save").click(); await page.locator(".rm-save.rm-save-done").waitFor();
    await page.locator(".rm-save.rm-save-done").click();
    await page.locator("[data-rm-note-editor]:not([hidden])").waitFor();
    await page.locator("[data-rm-note-save]:not([disabled])").waitFor();
    await page.locator("[data-rm-note-meaning]").fill("UNSAVED-synthetic-meaning");
    await page.locator("[data-rm-note-mnemonic]").fill("UNSAVED-synthetic-mnemonic");
    result.draftBefore = { meaning: await page.locator("[data-rm-note-meaning]").inputValue(), mnemonic: await page.locator("[data-rm-note-mnemonic]").inputValue() };
    result.notesBefore = await notesHash(page);
    await page.evaluate(() => { window.__draftSmokeDocumentTag = "draft-" + Math.random(); });
    result.before = { ...await state(page), workerVersion: await workerVersion(page) };
    assert.equal(result.before.workerVersion, "3.11.729"); assert.equal(result.before.installing, "installing");
    assert.ok(holdCount > 0, "Target install must stay held until the new unsaved draft exists");
    await page.screenshot({ path: path.join(out, name + "-before.png") });
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) result.navigations++; });
    warm.on("request", request => { if (request.isNavigationRequest() && request.frame() === warm.mainFrame()) result.otherTabNavigations++; });
    releaseInstall();
    if (expectLoss) {
      await page.waitForFunction(version => document.querySelector("#roomFooterVersion")?.textContent.replace(/^v/, "") === version, targetVersion);
      await page.locator("#roomReaderTable .rm-w").first().waitFor();
    } else {
      await page.waitForFunction(() => window.__roomReady);
      // Several ordinary page hooks can enqueue reg.update(). Require a stable
      // installed waiting worker, rather than sampling one gap between jobs.
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration("/")).update(); });
      let waitingSince = 0;
      await waitUntil(async () => {
        const currentState = await state(page);
        if (currentState.installing || currentState.waiting !== "installed") { waitingSince = 0; return false; }
        if (!waitingSince) waitingSince = Date.now();
        return Date.now() - waitingSince >= 750;
      }, "target waiting worker settles");
    }
    result.after = { ...await state(page), workerVersion: await workerVersion(page) };
    result.draftAfter = await page.locator("[data-rm-note-meaning]").count() ? {
      meaning: await page.locator("[data-rm-note-meaning]").inputValue(), mnemonic: await page.locator("[data-rm-note-mnemonic]").inputValue(),
    } : null;
    result.notesAfter = await notesHash(page);
    result.notesUnchanged = result.notesBefore === result.notesAfter;
    result.draftPreserved = JSON.stringify(result.draftBefore) === JSON.stringify(result.draftAfter);
    assert.equal(result.otherTabNavigations, 0); assert.equal(result.notesUnchanged, true); assert.deepEqual(result.errors, []);
    if (expectLoss) {
      assert.ok(result.navigations > 0); assert.equal(result.draftPreserved, false);
      result.result = "reproduced-p1";
    } else {
      assert.equal(result.navigations, 0); assert.equal(result.after.workerVersion, "3.11.729");
      assert.equal(result.after.waiting, "installed"); assert.equal(result.after.documentTag, result.before.documentTag);
      assert.equal(result.draftPreserved, true); result.result = "pass";
    }
    await page.screenshot({ path: path.join(out, name + "-after.png") });
    result.completedAt = new Date().toISOString(); save();
  } catch (error) { result.result = "fail"; result.failure = error.stack; save(); throw error; }
  finally { releaseInstall(); await context.close(); }
}
async function run() {
  const watchdog = setTimeout(() => { for (const child of children) child.kill(); process.exit(1); }, 240000); watchdog.unref();
  try {
    const oldPort = await start(legacySource(), "legacy"), newPort = await start(current, "target");
    proxy = http.createServer((req, res) => {
      const port = phase === "legacy" ? oldPort : newPort;
      const forward = () => {
        const headers = { ...req.headers, host: "127.0.0.1:" + port };
        delete headers["if-none-match"]; delete headers["if-modified-since"];
        const up = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
        up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(up);
      };
      const url = new URL(req.url, "http://fixture");
      if (phase === "target" && hold && url.pathname === "/js/library-ui.js" && url.searchParams.get("v") === moduleKey) { holdCount++; held.push(forward); }
      else forward();
    });
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const base = "http://127.0.0.1:" + proxy.address().port;
    for (const name of ["forged-marker", "draft-after-confirmation"]) await scenario(base, name);
    report.result = expectLoss ? "reproduced-p1" : "pass"; report.completedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ result: report.result, targetVersion, cases: report.cases.length, reportPath, out }));
  } finally {
    releaseInstall(); if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    for (const child of children) child.kill(); if (browser) await browser.close(); clearTimeout(watchdog);
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
