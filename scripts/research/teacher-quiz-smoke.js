#!/usr/bin/env node
// scripts/research/teacher-quiz-smoke.js — v3.3.5 C7 teacher dashboard
// renders calibrated-quiz outcome columns.
//
// 3 Playwright cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13:
//   1. Quiz score (quiz_score_normalized) renders in per-student table.
//   2. CEFR band column shows the correct band.
//   3. Teacher CSV still wins for post_test_score when both sources have
//      a score, AND quiz fields remain visible (merge, not replace).
//
// Pipeline:
//   - mktemp -d → RESEARCH_DATA_DIR
//   - provision a small cohort with k_anonymity_threshold=1 + sha256(token)
//   - seed 3 students:
//       student A → quiz outcome only (quiz_score=72, band=B2, se=0.41)
//       student B → quiz outcome (quiz_score=42, band=B1, se=0.55)
//                   + teacher CSV row with post_test_score=88, pre=70
//       student C → quiz outcome only (quiz_score=18, band=A1, se=0.62)
//   - spawn server.js with the temp dir
//   - load /teacher.html, log in, wait for #studentTable
//   - assert quiz, CEFR, SE columns + values + merge behavior

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3201;
const BASE = `http://127.0.0.1:${PORT}`;
const COHORT = "QUIZTC-V1";
const TOKEN = "tok_quiz_teacher_smoke_v1";

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer(researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT), RESEARCH_DATA_DIR: researchDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

function provisionCohort(researchDir) {
  const cdir = path.join(researchDir, COHORT);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify({
    code: COHORT, schema_version: "v1", created_at: new Date().toISOString(),
    k_anonymity_threshold: 1,    // permissive for smoke
    retention_until: "2028-12-31",
    outcome_scale: "0-100", consent_version_minimum: "1.0",
    researcher_token_hash: crypto.createHash("sha256").update(TOKEN).digest("hex"),
  }, null, 2));
  return cdir;
}

function seedQuizPayload(cdir, sid, date, quizScore, band, se) {
  const payload = {
    format: "linguistpro-research-v1",
    student_id: sid, cohort_code: COHORT,
    upload_ts: date, since_ts: date,
    consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      sessions_count: 1, active_minutes_real: 20,
      outcome: {
        quiz_score_normalized: quizScore,
        quiz_cefr_band: band,
        quiz_se: se,
        quiz_completed_at: date,
        quiz_version: "ulpan_diagnostic_v1",
        outcome_capture_method: "calibrated-quiz",
      },
    },
  };
  fs.appendFileSync(path.join(cdir, `${date}.jsonl`),
                    JSON.stringify(payload) + "\n", "utf8");
}

function seedOutcomesCsv(cdir, rows) {
  const header = "student_id,pre_test_score,post_test_score,exam_date,uploaded_by\n";
  const body = rows.map((r) =>
    `${r.student_id},${r.pre_test_score},${r.post_test_score},${r.exam_date},${r.uploaded_by}`
  ).join("\n") + "\n";
  fs.writeFileSync(path.join(cdir, "outcomes.csv"), header + body);
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[teacher-quiz-smoke] playwright missing:", e.message); process.exit(1); }

  const researchDir = fs.mkdtempSync(path.join(os.tmpdir(), "teacher-quiz-smoke-"));
  console.log(`[teacher-quiz-smoke] researchDir = ${researchDir}`);
  const cdir = provisionCohort(researchDir);

  const date = "2026-05-15";
  const sidA = "00000000-0000-4000-8000-0000000000aa";
  const sidB = "00000000-0000-4000-8000-0000000000bb";
  const sidC = "00000000-0000-4000-8000-0000000000cc";
  seedQuizPayload(cdir, sidA, date, 72, "B2", 0.412);
  seedQuizPayload(cdir, sidB, date, 42, "B1", 0.551);
  seedQuizPayload(cdir, sidC, date, 18, "A1", 0.622);
  seedOutcomesCsv(cdir, [
    { student_id: sidB, pre_test_score: 70, post_test_score: 88, exam_date: date, uploaded_by: "teacher@ulpan.example" },
  ]);

  const srv = startServer(researchDir);
  const ready = await waitForReady();
  if (!ready) {
    console.error("[teacher-quiz-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[teacher-quiz-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    await page.goto(BASE + "/teacher.html", { waitUntil: "load" });
    await page.fill('#cohortInput', COHORT);
    await page.fill('#tokenInput', TOKEN);
    await page.click('#loginBtn');
    await page.waitForSelector("#studentTable table", { timeout: 10000 });

    // Read header labels + rows in a single evaluate.
    const grid = await page.evaluate(() => {
      const table = document.querySelector("#studentTable table");
      if (!table) return null;
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim().replace(/[↑↓]\s*$/, "").trim());
      const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
      return { headers, rows };
    });

    if (!grid) {
      console.error("[teacher-quiz-smoke] #studentTable did not render");
      process.exit(1);
    }

    const colIdx = (label) => grid.headers.indexOf(label);
    const quizCol = colIdx("quiz");
    const cefrCol = colIdx("CEFR");
    const seCol   = colIdx("SE");
    const postCol = colIdx("post");
    const idCol   = colIdx("student_id");

    // Case 1 — quiz column present and contains 72, 42, 18 across rows.
    let quizValues = [];
    if (quizCol >= 0) quizValues = grid.rows.map((r) => r[quizCol]).filter((v) => v && v !== "—");
    const hasAll = quizValues.includes("72") && quizValues.includes("42") && quizValues.includes("18");
    test("Case 1: quiz column renders quiz_score_normalized values for 3 students",
         quizCol >= 0 && hasAll,
         "quizCol=" + quizCol + " values=" + JSON.stringify(quizValues));

    // Case 2 — CEFR column present and contains B2/B1/A1.
    let cefrValues = [];
    if (cefrCol >= 0) cefrValues = grid.rows.map((r) => r[cefrCol]);
    const hasBands = cefrValues.includes("B2") && cefrValues.includes("B1") && cefrValues.includes("A1");
    test("Case 2: CEFR column renders A1/B1/B2 for the 3 students",
         cefrCol >= 0 && hasBands,
         "cefrCol=" + cefrCol + " values=" + JSON.stringify(cefrValues));

    // Case 3 — find the row where quiz=42 (uniquely sidB by quiz score).
    // Assert this row ALSO has post=88 (from teacher CSV) and cefr=B1
    // (from quiz). Proves merge behavior: teacher CSV is authoritative
    // for post_test_score; quiz fields preserved on merge.
    const rowB = grid.rows.find((r) => r[quizCol] === "42");
    test("Case 3: student with quiz=42 (sidB) has post=88 (teacher CSV) AND cefr=B1 (quiz merged)",
         rowB && rowB[postCol] === "88" && rowB[cefrCol] === "B1",
         rowB ? JSON.stringify({ post: rowB[postCol], quiz: rowB[quizCol], cefr: rowB[cefrCol] }) : "no row with quiz=42");

    // Bonus diagnostic — SE column populated.
    if (seCol >= 0) {
      const seValues = grid.rows.map((r) => r[seCol]).filter((v) => v && v !== "—");
      console.log("  · (bonus) SE column values: " + JSON.stringify(seValues));
    }
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n[teacher-quiz-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[teacher-quiz-smoke] fatal:", e); process.exit(1); });
