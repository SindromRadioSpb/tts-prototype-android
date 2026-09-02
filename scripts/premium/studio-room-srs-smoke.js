#!/usr/bin/env node
"use strict";

// STUDIO-SRS-TRAINER-REPLACEMENT: bounded cross-surface + three-source gate.
// Runs only in an isolated Playwright profile backed by its own OPFS database.

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3312;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "docs", "research", "room-training-premium-release", "2026-08-11", "screenshots");
const failures = [];
let checks = 0;
const check = (value, message) => { checks++; if (!value) { failures.push(message); console.error("  x " + message); } else console.log("  + " + message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  child.stdout.on("data", (x) => logs.push(String(x)));
  child.stderr.on("data", (x) => logs.push(String(x)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const done = await new Promise((resolve) => { const timer = setTimeout(() => resolve(false), 5000); child.once("exit", () => { clearTimeout(timer); resolve(true); }); });
  if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {} await sleep(200); }
  return false;
}

function staticContracts() {
  const studio = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const room = fs.readFileSync(path.join(ROOT, "public", "js", "library-ui.js"), "utf8");
  const db = fs.readFileSync(path.join(ROOT, "public", "db", "local-db.js"), "utf8");
  const morph = fs.readFileSync(path.join(ROOT, "public", "js", "reader-morph.js"), "utf8");
  const locales = ["ru", "en", "he"].map((x) => fs.readFileSync(path.join(ROOT, "public", "i18n", "locales", x + ".js"), "utf8"));

  check(/id="btnSrsTrainer"[^>]*onclick="v3OpenRoomReview\(\)"/.test(studio), "Studio primary review CTA routes to Room, not the legacy modal");
  check(/function v3OpenRoomReview\(\)/.test(studio) && /library\.html\?review=due&from=studio/.test(studio), "Studio handoff contains identifiers only");
  check(/function consumeDueReviewHandoff\(\)/.test(room) && /searchParams\.delete\(['"]review['"]\)/.test(room), "Room consumes and normalizes the due deep-link");
  check(/data-studio-due/.test(studio) && /ReaderMorph\.dueCounts/.test(studio), "Studio count uses the canonical Room due predicate");
  check(/id="studioReviewAnkiExport"/.test(studio) && /v3SrsDownloadApkg/.test(studio), "Anki .apkg export remains independently reachable");
  check(!/function v3SrsTrainerOpen\(\)[\s\S]{0,260}classList\.remove\(["']hidden["']\)/.test(studio), "legacy Studio trainer modal is absent from the user route");
  // T1 (ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02 §5.1) supersedes the predecessor packet's
  // "ranking stays lapses-first" decision: a total order on srs_lapses made the tail of a large
  // backlog unreachable. Ranking is now a bounded quota inside TrainQueue.composeSession. The
  // half of this guard that still matters — the due query carries no source quota or filter —
  // is asserted unchanged, and source-neutrality is what T2 scoping must not break either.
  check(/ORDER BY (?:w\.)?srs_due ASC/.test(db) && !/ORDER BY (?:w\.)?srs_lapses DESC/.test(db), "due query is neutrally ordered — ranking lives in the trainer, not the query");
  // Assert on the FUNCTION BODY, not on a character window after the name. The old window-based
  // form fired on any prose that merely mentioned getDueWithSource within 1200 chars of an
  // unrelated `corpus_id` — it flagged a comment while missing nothing real. Extracting the body
  // is strictly stronger: a corpus filter anywhere inside it fails, at any distance.
  const dueBody = (db.match(/export async function getDueWithSource[\s\S]*?\n}\n/) || [""])[0];
  check(dueBody.length > 0, "getDueWithSource must be locatable for the source-neutrality guard");
  check(!/group_corpus|corpus_id|source_meta/.test(dueBody), "due query has no source quota/filter");
  check(/weaknessShare/.test(fs.readFileSync(path.join(ROOT, "public", "js", "train-queue.js"), "utf8")), "weakness ranking survives as a bounded quota in the trainer engine");
  check(/(?:const|let) evidenceScope\s*=\s*item\._wordOnly\s*\?\s*['"]lexeme['"]/.test(room) && /evidence_scope:\s*evidenceScope/.test(room), "word-only fallback preserves lexeme evidence scope");
  check(/function rankByWeakness/.test(morph) && /b\.lp\s*-\s*a\.lp/.test(morph), "weakness/lapses priority remains canonical");
  for (const locale of locales) check(/studioReview:\s*\{[\s\S]*title:[\s\S]*start:[\s\S]*allDone:[\s\S]*noSchedule:/.test(locale), "review surface locale is complete");
}

async function browserContracts() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const dueTriggerSelector = '#roomDueCta:not([hidden]), .learning-home-action[data-learning-due]:not([hidden])';
  const dueTrigger = () => page.locator(dueTriggerSelector).first();
  // T1 — the due review opens on a launch screen stating the session arithmetic before the
  // learner commits; one tap starts it. Every entry point in this gate goes through here, so
  // the extra step is asserted once instead of patched at four call sites.
  // The app-update toast (z-index 1300, bottom: 64px) can float over the bottom sheet
  // (z-index 990) after a version change — dismiss it as a learner would rather than
  // force-clicking through it, so this gate keeps exercising the real flow.
  const startFromLaunch = async () => {
    await page.waitForSelector(".room-study:not([hidden]) .room-train-launch", { timeout: 30000 });
    const later = page.locator(".room-update-toast .ru-later");
    if (await later.count()) { await later.first().click({ timeout: 5000 }).catch(() => {}); }
    await page.locator("[data-train-launch-start]").click();
  };
  await page.addInitScript(() => {
    localStorage.setItem("localMode", "1");
    localStorage.setItem("phase6FirstOpenSeen", "smoke");
    localStorage.setItem("onboardingSeen_v1", JSON.stringify({ action: "smoke" }));
    localStorage.setItem("v3.byokOnboardingDismissed", "1");
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  try {
    await page.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });
    await page.waitForFunction(() => { const tab = document.getElementById("tabCorpus"); return tab && !tab.hidden; }, null, { timeout: 30000 });
    const fixture = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const now = Date.now();
      const defs = [
        { kind: "ben-yehuda", id: "sru-by", key: "sru:by:work:1", title: "Fixture Ben-Yehuda", surface: "בית", niqqud: "בַּיִת", ru: "Это большой дом.", he: "זֶה בַּיִת גָּדוֹל.", meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: "fixture-by-1" } }, lapses: 3 },
        { kind: "study-song", id: "sru-song", key: "sru:song:study-songs-pilot:1", title: "Fixture Study Song", surface: "שיר", niqqud: "שִׁיר", ru: "Это красивая песня.", he: "זֶה שִׁיר יָפֶה.", meta: { group_corpus: { schema: 1, corpus_id: "study-songs-pilot", work_id: "fixture-song-1", visibility: "GROUP_RESTRICTED" } }, lapses: 2 },
        { kind: "my-text", id: "sru-mine", key: "sru:mine:1", title: "Fixture My Text", surface: "ספר", niqqud: "סֵפֶר", ru: "Это хорошая книга.", he: "זֶה סֵפֶר טוֹב.", meta: { origin: "studio", material_kind: "user_text" }, lapses: 1 },
      ];
      const rows = [];
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        await db.createText({ id: d.id, text_key: d.key, title: d.title, source_text: d.he, source_meta_json: JSON.stringify(d.meta) });
        await db.addSentence(d.id, { id: d.id + "-s0", he_plain: window.ReaderMorph.stripNiqqud(d.he), he_niqqud: d.he, ru: d.ru });
        const card = await window.ReaderMorph.resolveWordLight(d.surface, d.niqqud);
        if (!card || !card.lemmaKey) { rows.push({ kind: d.kind, error: "unresolved" }); continue; }
        const at = now - (i + 2) * 86400000;
        const seedMeta = { interval: 0, reps: 0, lapses: d.lapses, keyer_version: window.LemmaCanon.KEYER_VERSION };
        const state = window.FsrsCore.seedFromSm2(seedMeta, at);
        const seed = { item_key: card.lemmaKey, kind: "seed", reviewed_at: new Date(at).toISOString(), grade: null, source: "seed-sm2", meta: seedMeta };
        seed.id = window.LemmaCanon.seedId(card.lemmaKey, seedMeta);
        await db.appendReviewLog(seed);
        await db.setWordStatus(card.lemmaKey, "l1", { due: window.FsrsCore.dueAt(state), interval: window.FsrsCore.intervalFor(state), reps: state.reps, lapses: state.lapses, stability: state.stability, difficulty: state.difficulty, reviewedAt: state.lastReviewedAt, scheme: "fsrs" }, { textKey: d.key, sentenceId: d.id + "-s0", orderIndex: 0, surface: d.surface });
        rows.push({ kind: d.kind, lemmaKey: card.lemmaKey, textKey: d.key });
      }
      const due = await db.getDueWithSource(now);
      const resolved = [];
      for (const item of due.filter((x) => rows.some((r) => r.lemmaKey === x.lemmaKey))) {
        const sentence = await db.getSentenceForReview(item.source.sentenceId, item.source.textKey, item.source.orderIndex);
        const text = (await db.dbQuery("SELECT title, source_meta_json FROM texts WHERE text_key=?", [item.source.textKey]))[0];
        resolved.push({ lemmaKey: item.lemmaKey, textKey: item.source.textKey, surface: item.source.surface, sentence: !!sentence, title: text && text.title, meta: text && JSON.parse(text.source_meta_json || "{}"), lapses: item.srs.lapses, dueMs: item.srs.due });
      }
      const log = await db.getReviewLog();
      return { rows, resolved, beforeLog: log.length, beforeGradeEvents: log.filter((x) => x.kind === "review" || x.kind === "skip").length };
    });
    check(fixture.rows.length === 3 && fixture.rows.every((x) => x.lemmaKey), "three fixture words resolve to canonical lemma keys");
    check(fixture.resolved.length === 3, "getDueWithSource(now) returns Ben-Yehuda, Study Song and My Text");
    check(fixture.resolved.every((x) => x.sentence && x.textKey), "all three source anchors resolve through getSentenceForReview");
    check(new Set(fixture.resolved.map((x) => x.textKey)).size === 3, "mixed queue returns all three sources with no corpus quota");
    check(fixture.resolved[0].dueMs <= fixture.resolved[1].dueMs && fixture.resolved[1].dueMs <= fixture.resolved[2].dueMs, "T1: the mixed queue is ordered by due date, not by lapses (weakness is a bounded quota in the trainer)");
    check(fixture.resolved.some((x) => x.meta.corpus && x.meta.corpus.byehuda_id === "fixture-by-1"), "Ben-Yehuda metadata remains attached to its source text");
    check(fixture.resolved.some((x) => x.meta.group_corpus && x.meta.group_corpus.corpus_id === "study-songs-pilot"), "Study Song metadata uses group_corpus identity, not title matching");
    check(fixture.resolved.some((x) => x.meta.material_kind === "user_text"), "My Text metadata remains attached to its source text");

    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(dueTriggerSelector, { timeout: 20000 });
    const roomDueBefore = Number(((await dueTrigger().textContent()) || "").match(/\d+/)?.[0] || 0);
    await dueTrigger().click();
    // T1 — the due review now opens on a launch screen that states the arithmetic (what is due,
    // what was done today, what this session will serve) before the learner commits. One tap
    // starts it; the start control is focused so the extra step costs a keystroke.
    await page.waitForSelector(".room-study:not([hidden]) .room-train-launch", { timeout: 30000 });
    const launchPlan = (await page.locator(".room-train-launch-facts").textContent() || "").trim();
    check(/\d/.test(launchPlan), "launch screen states the session arithmetic before starting (" + launchPlan.replace(/\s+/g, " ") + ")");
    await startFromLaunch();
    await page.waitForSelector(".room-study:not([hidden]) .room-train-progress", { timeout: 30000 });
    const progress = (await page.locator(".room-train-progress").textContent() || "").trim();
    check(progress === "1 / 3", "mixed three-source Room session contains all three items (" + progress + ")");
    const trainerA11y = await page.evaluate(() => {
      const sheet = document.querySelector('.room-study:not([hidden])');
      const card = sheet && sheet.querySelector('.room-study-card');
      const progressEl = sheet && sheet.querySelector('.room-train-progress');
      const sizes = ['.room-study-x', '.room-train-chseg:not([disabled])', '.room-study-speak', '.room-train-skip']
        .map((selector) => { const node = sheet && sheet.querySelector(selector); const box = node && node.getBoundingClientRect(); return { selector, width: box && box.width, height: box && box.height }; });
      return {
        label: sheet && sheet.getAttribute('aria-label'),
        focusInside: !!(card && card.contains(document.activeElement)),
        progressRole: progressEl && progressEl.getAttribute('role'),
        progressNow: progressEl && progressEl.getAttribute('aria-valuenow'),
        sizes,
      };
    });
    check(trainerA11y.label === "Повторение" && trainerA11y.focusInside && trainerA11y.progressRole === "progressbar" && trainerA11y.progressNow === "1",
      "Room review has a truthful accessible title, enters focus and announces progress");
    check(trainerA11y.sizes.every((x) => x.height >= 44 && (x.selector === '.room-train-chseg:not([disabled])' || x.width >= 44)),
      "Room review primary controls meet the 44px target: " + JSON.stringify(trainerA11y.sizes));
    await page.locator('.room-train-skip').focus();
    await page.keyboard.press('Tab');
    check(await page.locator('.room-study-x').evaluate((el) => document.activeElement === el), "Room review traps forward Tab focus inside the dialog");
    await page.screenshot({ path: path.join(SHOTS, "room-training-desktop-ru.png"), fullPage: true });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.screenshot({ path: path.join(SHOTS, "room-training-380-ru.png"), fullPage: true });
    check(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), "Room review 380px RU has no horizontal overflow");
    await page.evaluate(() => { document.body.classList.remove('theme-light'); document.body.classList.add('theme-dark'); });
    const roomDark = await page.evaluate(() => ({ dark: document.body.classList.contains('theme-dark'), overflow: document.documentElement.scrollWidth > window.innerWidth }));
    check(roomDark.dark && !roomDark.overflow, "Room review remains usable without overflow in dark theme");
    await page.evaluate(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); });
    await page.evaluate(() => window.appSetLocale && window.appSetLocale("he"));
    await sleep(150);
    await page.screenshot({ path: path.join(SHOTS, "room-training-380-he-rtl.png"), fullPage: true });
    const roomHe = await page.evaluate(() => ({ dir: document.documentElement.dir, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    check(roomHe.dir === "rtl" && !roomHe.overflow, "Room review 380px HE/RTL has no horizontal overflow");
    await page.evaluate(() => window.appSetLocale && window.appSetLocale("ru"));
    await page.setViewportSize({ width: 1280, height: 900 });
    const afterOpen = await page.evaluate(async () => (await import("/db/local-db.js")).countReviewLog());
    check(afterOpen === fixture.beforeLog, "opening the training session appends zero review_log rows");
    await page.click('.room-study-x');
    const afterClose = await page.evaluate(async () => (await import("/db/local-db.js")).countReviewLog());
    check(afterClose === fixture.beforeLog, "closing without an answer appends zero review_log rows");
    const returnFocus = await page.evaluate((selector) => {
      const active = document.activeElement;
      const visible = Array.from(document.querySelectorAll(selector)).filter((node) => node.getClientRects().length && !node.hidden);
      return {
        ok: visible.includes(active),
        active: active ? { id: active.id || '', cls: active.className || '', text: String(active.textContent || '').trim().slice(0, 60) } : null,
        visible: visible.map((node) => ({ id: node.id || '', cls: node.className || '', text: String(node.textContent || '').trim().slice(0, 60) })),
      };
    }, dueTriggerSelector);
    check(returnFocus.ok, "closing Room review returns focus to its visible trigger: " + JSON.stringify(returnFocus));

    await dueTrigger().click();
    await startFromLaunch();
    await page.waitForSelector(".room-train-progress", { timeout: 30000 });
    await page.locator('.room-train-opt[data-correct="1"]').click();
    await page.waitForSelector(".room-train-reveal", { timeout: 10000 });
    const graded = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const allLog = await db.getReviewLog();
      const count = allLog.length;
      const gradeEvents = allLog.filter((x) => x.kind === "review" || x.kind === "skip").length;
      const due = await db.getDueWithSource(Date.now());
      const key = (await db.getReviewLog()).filter((x) => x.kind === "review").slice(-1)[0].item_key;
      const stored = (await db.getSrsSchedule())[key];
      const status = await db.getWordStatus(key);
      const lastReview = (await db.getReviewLog(key)).filter((x) => x.kind === "review").slice(-1)[0];
      let meta = {}; try { meta = JSON.parse(lastReview.meta_json || "{}"); } catch (_) {}
      const replayed = window.FsrsCore.replay(await db.getReviewLog(key));
      return { count, gradeEvents, key, due: due.length, stored, replayed, status, evidenceScope: meta.evidence_scope, trainingStage: meta.training_stage };
    });
    check(graded.gradeEvents === fixture.beforeGradeEvents + 1, "one completed grade appends exactly one canonical review event");
    check(graded.count === fixture.beforeLog + 1, "one due grade appends one total review_log row (no automatic manual mark)");
    check(graded.status === "l1", "training grade preserves the asserted manual status axis");
    check(graded.evidenceScope === "recognition", "MC answer records recognition evidence instead of unsupported production");
    check(graded.trainingStage === "l2", "verified answer advances the replayable exercise stage without mutating manual status");
    check(Math.abs(graded.stored.stability - graded.replayed.stability) < 1e-9 && Math.abs(graded.stored.difficulty - graded.replayed.difficulty) < 1e-9 && graded.stored.due === graded.replayed.dueMs, "replay(review_log) equals stored FSRS projection: " + JSON.stringify({ stored: graded.stored, replayed: graded.replayed }));
    await page.locator('.room-train-opt[data-correct="1"]').click({ force: true }).catch(() => {});
    const afterDuplicate = await page.evaluate(async () => (await (await import("/db/local-db.js")).getReviewLog()).filter((x) => x.kind === "review" || x.kind === "skip").length);
    check(afterDuplicate === graded.gradeEvents, "repeat click cannot duplicate the review event");
    await page.click('.room-study-x');

    const atomic = await page.evaluate(async () => {
      const db = await import("/db/local-db.js");
      const key = "atomic-fault#noun", id = "atomic-fault-review";
      await db.dbRun(`INSERT INTO word_status (lemma_key,status,updated_at,srs_due,srs_interval,srs_reps,srs_lapses,srs_stability,srs_difficulty,srs_reviewed_at,srs_scheme)
                      VALUES (?, 'l2', strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, 2, 1, 0, 2, 5, ?, 'fsrs')`,
        [key, new Date(Date.now() + 86400000).toISOString(), new Date(Date.now() - 86400000).toISOString()]);
      const before = (await db.getSrsSchedule())[key];
      await db.execRaw(`CREATE TRIGGER room_training_atomic_fault BEFORE UPDATE ON word_status
                        WHEN NEW.lemma_key = 'atomic-fault#noun'
                        BEGIN SELECT RAISE(ABORT, 'ROOM_TRAINING_FAULT'); END;`);
      const result = await db.commitReviewAttempt({
        row: { id, item_key: key, kind: "review", reviewed_at: new Date().toISOString(), grade: 3, source: "room-due-queue", channel: "read:mc", meta: { evidence_scope: "recognition" } },
        sched: { due: Date.now() + 86400000, interval: 3, reps: 2, lapses: 0, stability: 3, difficulty: 5, reviewedAt: Date.now(), scheme: "fsrs" },
      });
      await db.execRaw(`DROP TRIGGER IF EXISTS room_training_atomic_fault;`);
      const after = (await db.getSrsSchedule())[key];
      const log = await db.dbQuery(`SELECT id FROM review_log WHERE id=?`, [id]);
      return { result, logCount: log.length, sameDue: before.due === after.due, status: await db.getWordStatus(key) };
    });
    check(atomic.result && atomic.result.committed === false && atomic.logCount === 0 && atomic.sameDue && atomic.status === "l2",
      "fault after log insert rolls back event and projection while preserving manual status");

    await page.evaluate(async () => { const db = await import("/db/local-db.js"); await db.closeLocalDB(); });
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForFunction(() => window.__localDBInitPromise, null, { timeout: 15000 });
    await page.evaluate(() => window.__localDBInitPromise);
    await page.waitForSelector("[data-studio-due]", { timeout: 10000 }).catch(() => {});
    const studioDue = await page.locator("[data-studio-due]").first().textContent().catch(() => "");
    check(Number(studioDue) === graded.due && graded.due === roomDueBefore - 1, "Studio and Room read the same due count after one grade");
    check(await page.locator("#studioReviewAnkiExport").count() === 1, "Anki export remains visible outside the retired modal");

    const primary = page.locator("#btnSrsTrainer");
    await primary.focus();
    const primaryA11y = await primary.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { active: document.activeElement === el, height: box.height, label: (el.getAttribute("aria-label") || el.textContent || "").trim() };
    });
    check(primaryA11y.active && primaryA11y.height >= 44 && primaryA11y.label.length > 0, "Studio CTA is keyboard-focusable, named and at least 44px high");
    await page.evaluate(() => window.v3ThemeSet && window.v3ThemeSet("dark"));
    const darkState = await primary.evaluate((el) => ({ dark: document.body.classList.contains("theme-dark"), visible: el.getBoundingClientRect().height > 0, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    check(darkState.dark && darkState.visible && !darkState.overflow, "review surface remains visible without overflow in dark theme");
    await page.evaluate(() => window.v3ThemeSet && window.v3ThemeSet("light"));

    await primary.click();
    await page.waitForURL(/\/library\.html/);
    await startFromLaunch();
    await page.waitForSelector(".room-study:not([hidden]) .room-train-progress", { timeout: 30000 });
    await page.click('.room-study-x');
    await page.goBack({ waitUntil: "load" });
    check(new URL(page.url()).pathname === "/", "Back from Room returns to Studio after the handoff");
    await page.waitForSelector("#btnSrsTrainer", { timeout: 15000 });
    await page.waitForFunction(() => /^\d+$/.test((document.querySelector("[data-studio-due]")?.textContent || "").trim()), null, { timeout: 20000 });

    await page.setViewportSize({ width: 380, height: 844 });
    const ruOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!ruOverflow, "380px RU has no horizontal overflow");
    await page.evaluate(() => window.appSetLocale && window.appSetLocale("he"));
    await sleep(150);
    const heLayout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, dir: document.documentElement.dir }));
    check(!heLayout.overflow && heLayout.dir === "rtl", "380px HE/RTL has no horizontal overflow");

    await page.evaluate(async () => { if (window.__localDB) await window.__localDB.closeLocalDB(); });
    await page.goto(BASE + "/library.html?canon=skip&review=due&from=studio", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const handoff = { url: page.url(), open: await page.locator(".room-study:not([hidden])").count() };
    check(handoff.open === 1 && !/[?&](review|from)=/.test(handoff.url), "deep-link auto-opens once and normalizes the URL");
    if (handoff.open) await page.click('.room-study-x');
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(800);
    check(await page.locator(".room-study:not([hidden])").count() === 0, "refresh after manual close does not auto-open again");

    // The two remaining fixture words exercise one bounded same-session reinforcement pass:
    // miss word A, finish word B, retry A once, then finish without an infinite loop.
    await page.waitForSelector(dueTriggerSelector, { timeout: 20000 });
    await dueTrigger().click();
    await startFromLaunch();
    await page.waitForSelector('.room-train-progress[data-reinforcement="0"]', { timeout: 30000 });
    await page.locator('.room-train-opt[data-correct="0"]').first().click();
    await page.waitForSelector('.room-train-reveal');
    await page.click('[data-train-next]');
    await page.locator('.room-train-opt[data-correct="1"]').click();
    await page.waitForSelector('.room-train-reveal');
    await page.click('[data-train-next]');
    await page.waitForSelector('.room-train-progress[data-reinforcement="1"]');
    const retryBefore = await page.evaluate(async () => (await (await import('/db/local-db.js')).getReviewLog()).filter((x) => x.kind === 'review' || x.kind === 'skip').length);
    await page.locator('.room-train-opt[data-correct="1"]').click();
    await page.waitForSelector('.room-train-reveal');
    const retryAfter = await page.evaluate(async () => (await (await import('/db/local-db.js')).getReviewLog()).filter((x) => x.kind === 'review' || x.kind === 'skip').length);
    check(retryAfter === retryBefore + 1, "same-session reinforcement is a real second attempt with exactly one event");
    await page.click('[data-train-next]');
    check(await page.locator('.room-train-summary').count() === 1 && await page.locator('.room-train-progress').count() === 0,
      "reinforcement is bounded to one pass and reaches the session summary");
    check(pageErrors.length === 0, "browser run has no page errors: " + pageErrors.join(" | "));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

(async () => {
  staticContracts();
  const server = startServer();
  try {
    if (!await ready()) throw new Error("server did not become ready\n" + server.logs.join(""));
    await browserContracts();
  } finally { await stopServer(server.child); }
  if (failures.length) {
    console.error(`studio-room-srs-smoke: FAIL ${failures.length}/${checks}`);
    process.exit(1);
  }
  console.log(`studio-room-srs-smoke: PASS ${checks}/${checks}`);
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
