#!/usr/bin/env node
// scripts/research/rotate-token-smoke.js — A2 happy-path smoke (v3.3.1).
//
// Verifies the full rotate_token.js round-trip:
//   1. Provision cohort with known plaintext token T1.
//   2. GET aggregates with T1 → 200.
//   3. Run rotate_token.js --cohort <code> → capture new plaintext T2 from stdout.
//   4. GET aggregates with T1 → 401/403 (old token immediately invalid).
//   5. GET aggregates with T2 → 200.
//   6. cohort_meta.json has exactly one token_rotations entry with prev_hash_prefix.
//   7. deletions.log has a "token_rotation" line.
//
// Exits 0 on success, 1 on any assertion failure.

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3187;
const COHORT_CODE = "ROTATE-SMOKE";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer(port, researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), RESEARCH_DATA_DIR: researchDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
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
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

function httpGetStatus(urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: PORT, path: urlPath, method: "GET", headers,
    }, (res) => { resolve(res.statusCode); res.resume(); });
    req.on("error", reject);
    req.end();
  });
}

function provisionCohort(researchDir, code, tokenPlain) {
  const cdir = path.join(researchDir, code);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify({
    code, schema_version: "v1", created_at: new Date().toISOString(),
    k_anonymity_threshold: 5, retention_until: "2028-12-31",
    outcome_scale: "0-100", consent_version_minimum: "1.0",
    researcher_token_hash: crypto.createHash("sha256").update(tokenPlain).digest("hex"),
  }, null, 2));
}

function runCli(args, env) {
  const r = spawnSync(process.execPath, ["scripts/research/rotate_token.js", ...args], {
    cwd: REPO_ROOT, env: { ...process.env, ...env }, encoding: "utf8",
  });
  return { stdout: r.stdout || "", stderr: r.stderr || "", code: r.status };
}

function extractNewToken(stdout) {
  // CLI prints the new plaintext on the line AFTER "New researcher token …"
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("New researcher token")) {
      const cand = (lines[i + 1] || "").trim();
      if (cand && /^[A-Za-z0-9_\-]+$/.test(cand)) return cand;
    }
  }
  return null;
}

async function main() {
  const researchDir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-smoke-"));
  const oldToken = "old-plaintext-" + crypto.randomBytes(8).toString("hex");
  provisionCohort(researchDir, COHORT_CODE, oldToken);

  let server, failed = 0, passed = 0;
  const test = (name, cond, extra) => {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
  };

  try {
    server = startServer(PORT, researchDir);
    const ready = await waitForReady();
    if (!ready) throw new Error("server did not become ready");
    console.log(`[rotate-smoke] server up on :${PORT}; researchDir=${researchDir}`);

    // 1. Old token works against GET aggregates.
    const aggPath = `/api/research/v1/cohort/${encodeURIComponent(COHORT_CODE)}/aggregates`;
    const s0 = await httpGetStatus(aggPath, { Authorization: `Bearer ${oldToken}` });
    test("baseline: old token GET aggregates → 200", s0 === 200, "got " + s0);

    // 2. Run rotate CLI.
    const cli = runCli(["--cohort", COHORT_CODE, "--reason", "smoke test"],
                       { RESEARCH_DATA_DIR: researchDir });
    test("CLI exit code = 0", cli.code === 0, "exit " + cli.code + " stderr=" + cli.stderr);

    const newToken = extractNewToken(cli.stdout);
    test("CLI printed new plaintext token", !!newToken, "stdout did not match expected layout");
    if (!newToken) throw new Error("aborting — could not extract new token");

    // 3. Old token must immediately stop working.
    const s1 = await httpGetStatus(aggPath, { Authorization: `Bearer ${oldToken}` });
    test("old token GET aggregates → 401/403 after rotation", s1 === 401 || s1 === 403,
         "got " + s1 + " (expected 401 or 403)");

    // 4. New token works.
    const s2 = await httpGetStatus(aggPath, { Authorization: `Bearer ${newToken}` });
    test("new token GET aggregates → 200", s2 === 200, "got " + s2);

    // 5. cohort_meta.json has token_rotations entry.
    const meta = JSON.parse(fs.readFileSync(path.join(researchDir, COHORT_CODE, "cohort_meta.json"), "utf8"));
    test("meta.token_rotations has 1 entry", Array.isArray(meta.token_rotations) && meta.token_rotations.length === 1,
         "got " + JSON.stringify(meta.token_rotations));
    test("rotation entry has prev_hash_prefix",
         meta.token_rotations[0] && typeof meta.token_rotations[0].prev_hash_prefix === "string");
    test("rotation entry has reason from --reason flag",
         meta.token_rotations[0] && meta.token_rotations[0].reason === "smoke test");
    test("meta.researcher_token_hash changed",
         meta.researcher_token_hash !== crypto.createHash("sha256").update(oldToken).digest("hex"));

    // 6. deletions.log has audit line.
    const auditPath = path.join(researchDir, COHORT_CODE, "deletions.log");
    test("deletions.log exists", fs.existsSync(auditPath));
    if (fs.existsSync(auditPath)) {
      const audit = fs.readFileSync(auditPath, "utf8");
      test("deletions.log contains 'token_rotation' line", audit.includes("token_rotation"));
      test("deletions.log mentions cohort code", audit.includes(`cohort=${COHORT_CODE}`));
    }

    console.log(`\n[rotate-smoke] ${passed}/${passed + failed} passed`);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error("[rotate-smoke] fatal:", e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    if (server) await stopServer(server);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[rotate-smoke] unhandled:", e); process.exit(1); });
}
