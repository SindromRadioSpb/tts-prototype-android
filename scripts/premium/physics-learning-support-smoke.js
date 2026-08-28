#!/usr/bin/env node
"use strict";

// Isolated HTTP + browser acceptance for the reviewed Physics learning layer.
// The database and all screenshots are fixture-owned; no user or production
// database is opened. Snapshot hashes remain the immutable production anchors,
// while snapshot_json is a bounded stand-in containing the exact task metadata
// needed by the resolver.

const assert = require("node:assert/strict");
const child = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const { chromium } = require("playwright");
const { main: applyAgentRights } = require("./apply-physics-learning-support-agent-rights");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = require("../../physics/year1-support/manifest.json");
const OUT = path.join(ROOT, "docs/research/physics-learning-derivatives/2026-08-27/implementation/screenshots");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function stop(processRef) {
  if (!processRef || processRef.exitCode != null) return;
  processRef.kill("SIGTERM");
  await Promise.race([new Promise(resolve => processRef.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (processRef.exitCode == null) processRef.kill("SIGKILL");
}
async function start(dataDir, enabled) {
  const port = await freePort();
  const processRef = child.spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), DATA_DIR: dataDir, DB_PATH: path.join(dataDir, "app.db"),
      AUTH_BOOTSTRAP_SECRET: "physics-learning-support-smoke-0123456789", PHYSICS_TASK_RESOURCES_PUBLIC_READ: "1",
      PHYSICS_TASK_LEARNING_SUPPORT_PUBLIC_READ: enabled ? "1" : "0", AGENT_ACCESS_UI_ENABLED: "0", AGENT_ACCESS_OAUTH_ENABLED: "0",
      AGENT_ACCESS_OAUTH_CLIENTS_ENABLED: "0", AGENT_ACCESS_MCP_ENABLED: "0" },
  });
  let logs = "";
  processRef.stdout.on("data", bytes => { logs += bytes; });
  processRef.stderr.on("data", bytes => { logs += bytes; });
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (processRef.exitCode != null) throw new Error(`SMOKE_SERVER_EXITED:${processRef.exitCode}\n${logs.slice(-4000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      const body = response.ok ? await response.json() : null;
      if (body?.db?.ready && body?.migrations?.ready) return { processRef, base: `http://127.0.0.1:${port}` };
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await stop(processRef);
  throw new Error(`SMOKE_SERVER_TIMEOUT\n${logs.slice(-4000)}`);
}
function snapshot(entry) {
  const [chapter] = entry.task_number.split(".").map(Number);
  return { library: { schema_version: 3, texts: [{ text_key: `physics-year1-task-${entry.task_number.replace(".", "-")}`,
    title: `Физика — задача ${entry.task_number}`, topic: `Глава ${chapter}`,
    source_meta: { physics_task: { schema: "linguistpro.physics.task-card.1", chapter, task_number: entry.task_number,
      source_image_sha256: entry.source_image_sha256 } },
    rows: [{ row_id: `row-${entry.task_number}`, order_index: 0, hebrew_plain: "שאלה בפיזיקה", russian: `Задача ${entry.task_number}` }] }], audio_assets: [] } };
}
async function seed(dataDir) {
  const db = await open(path.join(dataDir, "app.db"));
  const now = "2026-08-28T00:00:00.000Z";
  try {
    let owner = await get(db, "SELECT id,role FROM users WHERE lower(role)='owner' ORDER BY id LIMIT 1");
    if (!owner) {
      owner = { id: "physics-learning-smoke-owner", role: "owner" };
      await run(db, "INSERT INTO users(id,role,display_name) VALUES(?,?,?)", [owner.id, owner.role, "Physics learning smoke owner"]);
    }
    await run(db, `INSERT INTO published_corpora(corpus_id,slug,title,description,status,current_edition_id,created_by,updated_by,created_at,updated_at)
      VALUES('pc-physics-learning-smoke',?,'Физика — задачник, 1 год','Isolated exact-anchor smoke','DRAFT_ACTIVE',NULL,?,?,?,?)`,
    [MANIFEST.corpus_slug, owner.id, owner.id, now, now]);
    await run(db, `INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at)
      VALUES('draft-physics-learning-smoke','pc-physics-learning-smoke',1,1,'PUBLISHED',?,?,?,?)`, [owner.id, owner.id, now, now]);
    await run(db, `INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,asset_missing,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
      VALUES(?,'pc-physics-learning-smoke',?,'draft-physics-learning-smoke',?,?,74,0,0,1,'published-corpora/physics-learning-smoke.zip',0,?,?,?)`,
    [MANIFEST.edition.edition_id, MANIFEST.edition.edition_number, JSON.stringify({ schema_version: 1, exact_anchor_smoke: true }),
      MANIFEST.edition.manifest_sha256, "0".repeat(64), owner.id, now]);
    for (const entry of MANIFEST.tasks) {
      await run(db, `INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
        VALUES(?,?,?,?,?,?,'',?,?,1,0,0,'OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28','2026-08-28',0,0,0,1)`,
      [entry.edition_item_id, MANIFEST.edition.edition_id, `source-${entry.task_number}`, entry.public_work_id, entry.position_no,
        `Физика — задача ${entry.task_number}`, JSON.stringify(snapshot(entry)), entry.snapshot_sha256]);
    }
    await run(db, "UPDATE published_corpora SET status='PUBLISHED',current_edition_id=? WHERE corpus_id='pc-physics-learning-smoke'", [MANIFEST.edition.edition_id]);
    return owner.id;
  } finally { await close(db); }
}
async function browserAcceptance(base) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    const target = `${base}/library.html?public_corpus=${MANIFEST.corpus_slug}`;
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU" });
    await desktop.goto(target, { waitUntil: "domcontentloaded" });
    await desktop.getByRole("button", { name: "Проверить ответ" }).first().waitFor();
    await desktop.getByRole("button", { name: "Проверить ответ" }).first().click();
    await desktop.locator(".physics-inline-answer").first().waitFor();
    assert.ok((await desktop.locator(".physics-inline-answer").first().innerText()).length > 10); checks.push("answer-first");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-card-answer-desktop-ru.png"), fullPage: false });
    await desktop.getByRole("button", { name: "Понять и решить" }).first().click();
    await desktop.locator(".physics-learning-disclosure summary", { hasText: "Экзаменационное решение" }).waitFor();
    assert.equal(await desktop.locator(".physics-learning-overlay").count(), 1); checks.push("full-walkthrough");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-solution-desktop-ru.png"), fullPage: false });
    const examSummary = desktop.locator(".physics-learning-exam > summary");
    await examSummary.click(); await examSummary.scrollIntoViewIfNeeded();
    assert.ok(await desktop.locator(".physics-learning-exam .physics-math-op").count() > 0, "explicit multiplication sign missing");
    assert.ok(await desktop.locator(".physics-learning-exam sub").count() > 0, "semantic subscript missing");
    assert.doesNotMatch(await desktop.locator(".physics-learning-exam").innerText(), /\*/); checks.push("unambiguous-math");
    await desktop.screenshot({ path: path.join(OUT, "physics-learning-exam-desktop-ru.png"), fullPage: false });

    const mobile = await browser.newPage({ viewport: { width: 380, height: 844 }, isMobile: true, hasTouch: true, locale: "ru-RU" });
    await mobile.goto(target, { waitUntil: "domcontentloaded" });
    await mobile.getByRole("button", { name: "Понять и решить" }).first().waitFor();
    await mobile.getByRole("button", { name: "Понять и решить" }).first().click();
    await mobile.locator(".physics-learning-disclosure summary", { hasText: "Экзаменационное решение" }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true); checks.push("mobile-no-overflow");
    const viewer = await mobile.locator(".physics-learning-viewer").boundingBox();
    assert.ok(viewer && viewer.width === 380 && viewer.height >= 840); checks.push("mobile-fullscreen");
    await mobile.screenshot({ path: path.join(OUT, "physics-learning-solution-380-ru.png"), fullPage: false });
    await mobile.getByRole("button", { name: "Закрыть разбор" }).click();
    await mobile.locator("#roomLang").selectOption("he");
    await mobile.waitForFunction(() => document.documentElement.lang === "he" && document.documentElement.dir === "rtl");
    await mobile.getByRole("button", { name: "להבין ולפתור" }).first().click();
    await mobile.locator(".physics-learning-disclosure summary", { hasText: "פתרון מלא במבנה בחינה" }).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true); checks.push("he-rtl");
    await mobile.screenshot({ path: path.join(OUT, "physics-learning-solution-380-he-rtl.png"), fullPage: false });
  } finally { await browser.close(); }
  return checks;
}
async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-physics-learning-support-"));
  let running = null; let checks = 0;
  try {
    running = await start(dataDir, false);
    const first = MANIFEST.tasks[0], endpoint = `/api/public-corpora/${MANIFEST.corpus_slug}/works/${first.public_work_id}/learning-support`;
    let response = await fetch(running.base + endpoint);
    assert.equal(response.status, 404); checks += 1;
    assert.equal(response.headers.get("cache-control"), "no-store"); checks += 1;
    await stop(running.processRef); running = null;
    const ownerId = await seed(dataDir);
    const rightsArgs = ["--db-path", path.join(dataDir, "app.db"), "--edition-id", MANIFEST.edition.edition_id,
      "--expected-manifest-sha256", MANIFEST.edition.manifest_sha256, "--owner-id", ownerId,
      "--idempotency-key", "physics-learning-support-smoke-rights"];
    const dryRun = await applyAgentRights(rightsArgs);
    assert.equal(dryRun.mode, "DRY_RUN"); assert.equal(dryRun.applied_facts, 0); checks += 1;
    const applied = await applyAgentRights([...rightsArgs, "--apply"]);
    assert.equal(applied.mode, "APPLY"); assert.equal(applied.applied_facts, 74); checks += 1;
    running = await start(dataDir, true);
    response = await fetch(running.base + endpoint);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.task_number, first.task_number); assert.equal(body.derivative_sha256, first.sha256);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control"), /immutable/); assert.ok(response.headers.get("etag")); checks += 1;
    response = await fetch(running.base + endpoint, { headers: { "If-None-Match": response.headers.get("etag") } });
    assert.equal(response.status, 304); checks += 1;
    response = await fetch(`${running.base}/api/public-corpora/${MANIFEST.corpus_slug}/works/work_missing/learning-support`);
    assert.equal(response.status, 404); checks += 1;
    const browserChecks = await browserAcceptance(running.base); checks += browserChecks.length;
    process.stdout.write(JSON.stringify({ ok: true, checks, browser_checks: browserChecks, tasks: MANIFEST.tasks.length,
      screenshots: 5, isolated_data_dir: true, owner_profile: false, production_writes: false }) + "\n");
  } finally {
    await stop(running?.processRef);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`physics-learning-support-smoke: ${error.stack || error.message}\n`); process.exitCode = 1; });
