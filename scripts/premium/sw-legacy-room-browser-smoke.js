"use strict";

// Exercise the unchanged 3.11.729 shell and worker against real target files.
// Unlike the general SW smoke, this never rewrites a version or application body.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const http = require("node:http"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("../smoke-server-env");
const ROOT = path.resolve(__dirname, "../.."), LEGACY = "3a4a68619c8e3483b6b1f7c68e5f6e21463f79de";
const argument = name => process.argv.find(value => value.startsWith("--" + name + "="))?.split("=").slice(1).join("=");
const current = path.resolve(argument("current-root") || ROOT);
const expectTwo = process.argv.includes("--expect-two-confirmations");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "lp-sw-real-legacy-"));
const reportPath = path.resolve(argument("report") || path.join(ROOT, ".tmp/sw-legacy-report.json"));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const read = file => fs.readFileSync(path.join(current, file), "utf8");
const targetVersion = read("public/sw.js").match(/CACHE_VERSION = "v([^"]+)"/)[1];
const moduleKey = read("public/library.html").match(/library-ui\.js\?v=(\d+)/)[1];
const report = { startedAt: new Date().toISOString(), legacyCommit: LEGACY, targetVersion,
  expectedConfirmations: expectTwo ? 2 : 1, states: [], errors: [], runtimeHashes: {},
  scope: "Real unchanged legacy source; disposable loopback servers and browser; seeded learner state; no cache or OPFS deletion" };
for (const file of ["public/sw.js", "public/library.html", "public/js/library-ui.js", "public/index.html", "server.js"]) {
  report.runtimeHashes[file] = hash(fs.readFileSync(path.join(current, file)));
}
let browser, proxy, observed, phase = "legacy", hold = true, held = [], holdCount = 0;
const children = [];
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
  children.push(child);
  const logs = []; child.stdout.on("data", value => logs.push(String(value))); child.stderr.on("data", value => logs.push(String(value)));
  try { return await waitForSmokeServer(child, 30000); }
  catch (error) { fs.writeFileSync(path.join(out, name + "-server.log"), logs.join("")); throw error; }
}
async function ready(page) { await page.waitForFunction(() => window.__roomReady, null, { timeout: 90000 }); }
async function state(page, name) {
  const result = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const version = await new Promise(resolve => {
      const worker = navigator.serviceWorker.controller; if (!worker) return resolve(null);
      const channel = new MessageChannel(), timer = setTimeout(() => resolve("timeout"), 5000);
      channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data.version); };
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    });
    return { url: location.href, footer: document.querySelector("#roomFooterVersion")?.textContent,
      module: document.querySelector('script[src*="library-ui.js"]')?.getAttribute("src"), workerVersion: version,
      active: reg?.active?.state, waiting: reg?.waiting?.state, installing: reg?.installing?.state,
      toast: Boolean(document.querySelector(".room-update-toast")) };
  });
  report.states.push({ name, at: new Date().toISOString(), ...result }); save(); return result;
}
async function canonical(page) {
  const rows = await page.evaluate(async () => {
    const db = window.__localDB, tables = await db.dbQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", []), result = {};
    for (const { name } of tables) {
      if (!/^[a-z0-9_]+$/i.test(name) || /^(sqlite_|_)/.test(name) || /ingredient|cache|projection|migration|fts|dict|lexicon|pealim/.test(name)) continue;
      result[name] = (await db.dbQuery('SELECT * FROM "' + name + '"', [])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return result;
  });
  return Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, { rows: values.length, sha256: hash(JSON.stringify(values)) }]));
}
async function seed(page) {
  await page.evaluate(async () => {
    const db = window.__localDB, date = "2026-10-05T00:00:00Z", id = "legacy-learner-fixture";
    await db.dbRun("INSERT INTO texts (id,text_key,title,source_text,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [id, id, "Learner fixture", "fixture", "fixture", date, date]);
    await db.dbRun("INSERT INTO sentences (id,text_id,order_index,he_plain,ru,meta_json,created_at) VALUES (?,?,0,?,?,?,?)", [id + "-row", id, "fixture", "Manual translation fixture", '{"manual":true}', date]);
    await db.dbRun("INSERT INTO text_progress (text_id,last_row_idx,updated_at) VALUES (?,1,?)", [id, date]);
    await db.dbRun("INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", [id + "-note", "text", id, id, "free", "Fixture note", '{"markdown":"Learner note"}', date, date]);
    await db.dbRun("INSERT INTO review_log (id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES (?,?,?,?,?,?,?,?,?)", [id + "-review", "lemma:fixture", "review", date, 3, "fixture", "lab", 123, "{}"]);
  });
}
function releaseInstall() { hold = false; for (const forward of held.splice(0)) forward(); }
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
      const url = new URL(req.url, "http://127.0.0.1");
      if (phase === "target" && hold && url.pathname === "/js/library-ui.js" && url.searchParams.get("v") === moduleKey) { holdCount++; held.push(forward); }
      else forward();
    });
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve)); const base = "http://127.0.0.1:" + proxy.address().port;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "allow" });
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => { localStorage.setItem("app.locale", "ru"); localStorage.setItem("phase6Decision_v1", "declined"); localStorage.setItem("onboardingSeen_v1", "1"); });
    const warm = await context.newPage(); warm.on("pageerror", error => report.errors.push(String(error)));
    const route = base + "/library.html?canon=skip#room=hub";
    await warm.goto(route); await ready(warm); await warm.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 90000 });
    await warm.reload(); await ready(warm); const initial = await state(warm, "Controlled unchanged legacy"); assert.equal(initial.workerVersion, "3.11.729");
    await seed(warm); const baseline = await canonical(warm); report.canonicalTables = Object.keys(baseline).length;
    phase = "target"; const page = await context.newPage(); observed = page; page.on("pageerror", error => report.errors.push(String(error)));
    await page.goto(route); await page.locator(".room-update-toast .ru-upd").waitFor({ timeout: 90000 });
    for (let i = 0; i < 200 && holdCount === 0; i++) await new Promise(resolve => setTimeout(resolve, 50)); assert.ok(holdCount > 0);
    const early = await state(page, "Mismatch toast while target installs"); assert.equal(early.waiting, undefined); assert.equal(early.installing, "installing");
    await Promise.all([page.waitForNavigation({ timeout: 90000 }), page.locator(".room-update-toast .ru-upd").click()]); report.confirmations = 1;
    await ready(page); await page.locator(".room-update-toast .ru-upd").waitFor({ timeout: 90000 });
    const pending = await state(page, "Confirmed before install completes"); assert.equal(pending.footer.replace(/^v/, ""), "3.11.729"); assert.ok(pending.url.includes("room_update=" + targetVersion));
    assert.deepEqual(await canonical(page), baseline);
    let otherNavigations = 0; warm.on("framenavigated", () => otherNavigations++);
    if (expectTwo) {
      releaseInstall(); const deadline = Date.now() + 90000;
      while (!await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration("/"))?.waiting))) { if (Date.now() > deadline) throw new Error("Legacy waiting timeout"); await new Promise(resolve => setTimeout(resolve, 100)); }
      const waiting = await state(page, "Waiting after first confirmation"); assert.equal(waiting.waiting, "installed"); assert.equal(waiting.workerVersion, "3.11.729");
      await Promise.all([page.waitForNavigation({ timeout: 90000 }), page.locator(".room-update-toast .ru-upd").click()]); report.confirmations++;
    } else {
      const navigation = page.waitForNavigation({ timeout: 90000 }); releaseInstall(); await navigation;
    }
    await ready(page); await page.waitForFunction(version => document.querySelector("#roomFooterVersion")?.textContent.replace(/^v/, "") === version, targetVersion, { timeout: 90000 });
    const complete = await state(page, "Update completed"); assert.equal(complete.workerVersion, targetVersion); assert.ok(!complete.url.includes("room_update=")); assert.equal(complete.toast, false);
    assert.equal(otherNavigations, 0); report.otherTabNavigations = otherNavigations; assert.deepEqual(await canonical(page), baseline); report.canonicalUnchanged = true;
    assert.equal(report.confirmations, report.expectedConfirmations); assert.deepEqual(report.errors, []); report.result = "pass"; report.completedAt = new Date().toISOString(); save();
    await page.screenshot({ path: path.join(out, "complete.png") }); console.log(JSON.stringify({ result: report.result, legacy: "3.11.729", target: targetVersion, confirmations: report.confirmations, canonicalTables: report.canonicalTables, reportPath, out }));
  } catch (error) {
    report.result = "fail"; report.failure = error.stack; if (observed) await state(observed, "Failure state").catch(() => {}); save(); throw error;
  } finally {
    releaseInstall(); if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    for (const child of children) child.kill(); if (browser) await browser.close(); clearTimeout(watchdog);
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
