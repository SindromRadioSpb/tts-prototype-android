"use strict";

// Discover committed-style test files only inside tests/. Node's implicit
// discovery also visits local scratch checkouts and executes helper scripts.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { smokeServerEnv } = require("./smoke-server-env");
const root = path.resolve(__dirname, "..");

function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return discover(file);
    return entry.isFile() && (/\.test\.[cm]?js$/.test(entry.name) || entry.name === "i18n.smoke.js") ? [file] : [];
  }).sort();
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-unit-tests-"));
try {
  const result = spawnSync(process.execPath,
    ["--test", "--test-concurrency=4", ...process.argv.slice(2), ...discover(path.join(root, "tests"))],
    { cwd: root, env: smokeServerEnv(dataDir, 0), stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
