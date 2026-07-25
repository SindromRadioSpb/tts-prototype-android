#!/usr/bin/env node
"use strict";
// ───────────────────────────────────────────────────────────────────────────
// ingest-pdf-gold.js — OWNER-RUN gold harness for the Studio Ingest W1 PDF
// branch (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25, Task 12).
//
// R11 measure-before-scale: before announcing PDF ingest to pilot users, the
// owner runs this against 10-20 real Hebrew PDFs with a real Gemini key
// (BYOK — there is no server-side Gemini key) and manually grades the raw
// extraction output. Gate: >=80% files marked ✅ in REPORT.md -> PDF branch
// keeps full status; otherwise it stays `beta` (persistent warning) in the UI.
//
// This is a REAL network + REAL LLM run: it hits a running server's
// POST /api/ingest/extract-file {kind:"pdf"} for every *.pdf in --dir. It is
// run by the owner on demand, NEVER wired into `npm test` or CI.
//
// Usage:
//   node scripts/premium/ingest-pdf-gold.js --dir <folder of Hebrew PDFs> \
//     --key <GEMINI_KEY> --out docs/research/ingest-pdf-gold/<YYYY-MM-DD>/ \
//     [--base http://localhost:3000]
//
// Output (artifact rule, CLAUDE.md): writes to the TRACKED --out folder
// (default suggestion: docs/research/ingest-pdf-gold/<date>/), never .tmp:
//   - <name>.extracted.txt   one per successfully-processed PDF, RAW model text
//   - REPORT.md              table (file/size/method/warnings/len/hebrew%/verdict)
//   - README.md              what/how/command/commit, owner-edits-what
//
// Best-effort per-item (feedback_silent_batch_partial_failure): one PDF
// erroring does NOT abort the run; the error is recorded in its row and the
// script still exits 0 after writing whatever it could.
// ───────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ── CLI parsing (space-separated "--name value", matches run-corpus-prebake.js) ──
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--")
    ? process.argv[i + 1]
    : def;
}

const DIR = arg("dir", "");
const KEY_RAW = arg("key", process.env.INGEST_SMOKE_GEMINI_KEY || "");
const OUT = arg("out", "");
const BASE = String(arg("base", "http://localhost:3000")).replace(/\/+$/, "");

const GEMINI_KEY_RE = /^(AIza|AQ\.)/;

function printUsage() {
  console.log(`Usage:
  node scripts/premium/ingest-pdf-gold.js --dir <folder of Hebrew PDFs> --key <GEMINI_KEY> \\
    --out docs/research/ingest-pdf-gold/<YYYY-MM-DD>/ [--base http://localhost:3000]

--out is REQUIRED (a reproducible, explicit tracked path — see CLAUDE.md artifact rule).
This is a LIVE run (real network + real Gemini quota) — run by the owner on demand, not in CI.`);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch (_) {
    return "unknown (git rev-parse failed)";
  }
}

function hebrewRatio(text) {
  const nonSpace = String(text || "").replace(/\s/g, "");
  if (!nonSpace.length) return 0;
  const heChars = (nonSpace.match(/[\u0590-\u05FF]/g) || []).length;
  return heChars / nonSpace.length;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function mdEscape(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function extractOnePdf(filePath) {
  const bytes = fs.readFileSync(filePath);
  const dataBase64 = bytes.toString("base64");
  const res = await fetch(`${BASE}/api/ingest/extract-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "pdf",
      mimeType: "application/pdf",
      dataBase64,
      filename: path.basename(filePath),
      geminiApiKey: KEY_RAW,
    }),
  });
  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (_) {
    data = null;
  }
  const sizeKB = bytes.length / 1024;
  if (!(res.status === 200 && data && data.ok === true)) {
    const errMsg = data ? data.error || JSON.stringify(data) : rawText.slice(0, 300);
    return { ok: false, sizeKB, error: `HTTP ${res.status}: ${errMsg}` };
  }
  return {
    ok: true,
    sizeKB,
    text: data.text || "",
    method: data.method,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

async function main() {
  if (!DIR) {
    printUsage();
    fail("--dir <folder of Hebrew PDFs> is required.");
  }
  if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
    fail(`--dir does not exist or is not a directory: ${DIR}`);
  }
  const key = String(KEY_RAW || "").trim();
  if (!key || !GEMINI_KEY_RE.test(key)) {
    fail(
      "missing or malformed Gemini API key. Pass --key <GEMINI_KEY> or set env " +
        "INGEST_SMOKE_GEMINI_KEY. Expected format /^(AIza|AQ\\.)/  (BYOK — there is no server-side key)."
    );
  }
  if (!OUT) {
    printUsage();
    fail(
      "--out is required (e.g. docs/research/ingest-pdf-gold/2026-07-25/). " +
        "Pass it explicitly so the run is reproducible — this script does not guess a date for you."
    );
  }

  const outDir = path.isAbsolute(OUT) ? OUT : path.join(REPO_ROOT, OUT);
  fs.mkdirSync(outDir, { recursive: true });

  const pdfFiles = fs
    .readdirSync(DIR)
    .filter((f) => /\.pdf$/i.test(f))
    .sort();
  if (!pdfFiles.length) {
    fail(`no *.pdf files found in --dir: ${DIR}`);
  }

  console.log(`ingest-pdf-gold: base=${BASE}`);
  console.log(`Found ${pdfFiles.length} PDF file(s) in ${DIR}. Processing sequentially (concurrency 1)...`);

  const rows = [];
  let succeeded = 0;
  let errored = 0;

  // Sequential (concurrency 1) — respects Gemini rate limits, matches the
  // brief's "cap concurrency at 1" instruction.
  for (const file of pdfFiles) {
    const filePath = path.join(DIR, file);
    process.stdout.write(`  ${file} ... `);
    try {
      const result = await extractOnePdf(filePath);
      if (result.ok) {
        succeeded++;
        const outName = file.replace(/\.pdf$/i, "") + ".extracted.txt";
        fs.writeFileSync(path.join(outDir, outName), result.text, "utf8");
        const ratio = hebrewRatio(result.text);
        console.log(`ok (${result.text.length} chars, ${pct(ratio)} Hebrew)`);
        rows.push({
          file,
          sizeKB: result.sizeKB,
          method: result.method,
          warnings: result.warnings,
          textLength: result.text.length,
          hebrewRatio: ratio,
          error: null,
        });
      } else {
        errored++;
        console.log(`ERROR: ${result.error}`);
        rows.push({
          file,
          sizeKB: result.sizeKB,
          method: null,
          warnings: [],
          textLength: 0,
          hebrewRatio: null,
          error: result.error,
        });
      }
    } catch (e) {
      errored++;
      const msg = e && e.message ? e.message : String(e);
      console.log(`ERROR (exception): ${msg}`);
      let sizeKB = null;
      try {
        sizeKB = fs.statSync(filePath).size / 1024;
      } catch (_) {}
      rows.push({ file, sizeKB, method: null, warnings: [], textLength: 0, hebrewRatio: null, error: msg });
    }
  }

  const commit = gitCommit();
  const generatedAt = new Date().toISOString();

  // ── REPORT.md ──────────────────────────────────────────────────────────
  const reportLines = [];
  reportLines.push("# PDF Extraction Gold Report — Studio Ingest W1");
  reportLines.push("");
  reportLines.push(`Generated: ${generatedAt}`);
  reportLines.push(`Source commit: ${commit}`);
  reportLines.push(`Server base: ${BASE}`);
  reportLines.push(`Input dir: ${DIR} (${pdfFiles.length} PDF file(s))`);
  reportLines.push(
    `Command: node scripts/premium/ingest-pdf-gold.js --dir ${DIR} --key <REDACTED> --out ${OUT}` +
      (BASE !== "http://localhost:3000" ? ` --base ${BASE}` : "")
  );
  reportLines.push("");
  reportLines.push("## Gate criterion (owner fills in the `Verdict` column manually)");
  reportLines.push("");
  reportLines.push(
    "For each file, open its `<name>.extracted.txt` (RAW model output, unedited) and judge: is " +
      "this text usable for the he→ru translate-table pipeline WITHOUT manual cleanup? Mark:"
  );
  reportLines.push("- ✅ usable as-is");
  reportLines.push("- ⚠ usable but needs light cleanup (stray characters, wrong line breaks, minor omissions)");
  reportLines.push("- ❌ not usable (garbled, missing large chunks, wrong language, hallucinated content)");
  reportLines.push("");
  reportLines.push(
    "**W1 exit gate: >=80% of files marked ✅** → the PDF ingest branch keeps full (non-beta) " +
      "status. Below 80% → mark the PDF branch `beta` in the UI (persistent warning) until " +
      "extraction quality improves (R11 measure-before-scale)."
  );
  reportLines.push("");
  reportLines.push("## Results");
  reportLines.push("");
  reportLines.push("| File | Size (KB) | Method | Warnings | Text Length | Hebrew % | Verdict |");
  reportLines.push("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const sizeStr = r.sizeKB != null ? r.sizeKB.toFixed(1) : "?";
    const methodStr = r.error ? `ERROR: ${mdEscape(r.error)}` : mdEscape(r.method);
    const warningsStr = r.error ? "-" : r.warnings.length ? mdEscape(r.warnings.join(", ")) : "(none)";
    const lenStr = r.error ? "-" : String(r.textLength);
    const heStr = r.error ? "-" : pct(r.hebrewRatio);
    reportLines.push(`| ${mdEscape(r.file)} | ${sizeStr} | ${methodStr} | ${warningsStr} | ${lenStr} | ${heStr} | |`);
  }
  reportLines.push("");
  reportLines.push("## Summary");
  reportLines.push("");
  reportLines.push(`- Total PDFs: ${pdfFiles.length}`);
  reportLines.push(`- Extracted successfully (text written to <name>.extracted.txt): ${succeeded}`);
  reportLines.push(`- Errors (see row above, no .extracted.txt written): ${errored}`);
  if (errored) {
    reportLines.push("");
    reportLines.push("### Errors detail");
    for (const r of rows) {
      if (r.error) reportLines.push(`- **${r.file}**: ${r.error}`);
    }
  }
  reportLines.push("");
  fs.writeFileSync(path.join(outDir, "REPORT.md"), reportLines.join("\n"), "utf8");

  // ── README.md ─────────────────────────────────────────────────────────
  const readmeLines = [];
  readmeLines.push(`# PDF Ingest Gold Harness — ${path.basename(outDir)}`);
  readmeLines.push("");
  readmeLines.push(
    "**What this is.** Owner-run gold-eval artifact for the Studio Ingest W1 PDF branch " +
      "(`POST /api/ingest/extract-file` with `kind:\"pdf\"`). Each `<name>.extracted.txt` is the " +
      "RAW, UNEDITED model output for one input PDF — read it to judge extraction quality, do NOT " +
      "hand-edit it. `REPORT.md` is the summary table; the owner manually fills in the `Verdict` " +
      "column (✅/⚠/❌) per file, then reads off the >=80%-✅ gate result described at the top of " +
      "REPORT.md."
  );
  readmeLines.push("");
  readmeLines.push("**How generated.**");
  readmeLines.push("- Script: `scripts/premium/ingest-pdf-gold.js`");
  readmeLines.push(
    `- Command: \`node scripts/premium/ingest-pdf-gold.js --dir ${DIR} --key <GEMINI_KEY> --out ${OUT}\`` +
      (BASE !== "http://localhost:3000" ? ` \`--base ${BASE}\`` : "")
  );
  readmeLines.push(`- Source commit: ${commit}`);
  readmeLines.push(`- Server base: ${BASE}`);
  readmeLines.push(`- Generated: ${generatedAt}`);
  readmeLines.push(`- Input PDFs processed: ${pdfFiles.length} (${succeeded} ok, ${errored} error)`);
  readmeLines.push("");
  readmeLines.push("**Files in this folder.**");
  readmeLines.push("- `README.md` — this file.");
  readmeLines.push("- `REPORT.md` — the table the owner annotates (Verdict column) + the gate criterion.");
  readmeLines.push(
    "- `<name>.extracted.txt` — one per successfully-processed input PDF, RAW extract-file output " +
      "text. DO NOT EDIT — read-only evidence for grading; edit REPORT.md's Verdict column instead. " +
      "A PDF that errored has no corresponding `.extracted.txt` (see its row / the Errors detail " +
      "section in REPORT.md)."
  );
  readmeLines.push("");
  readmeLines.push(
    "**What the owner edits.** Only the `Verdict` column in `REPORT.md`. Nothing else in this " +
      "folder should be hand-edited — re-run the script (it overwrites the whole folder) to " +
      "regenerate everything else."
  );
  readmeLines.push("");
  fs.writeFileSync(path.join(outDir, "README.md"), readmeLines.join("\n"), "utf8");

  console.log("");
  console.log(`Wrote ${succeeded} <name>.extracted.txt file(s), REPORT.md, README.md to: ${outDir}`);
  console.log(`Summary: ${pdfFiles.length} total, ${succeeded} ok, ${errored} error(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ingest-pdf-gold FAILED (unexpected):", e && e.stack ? e.stack : e);
  process.exit(1);
});
