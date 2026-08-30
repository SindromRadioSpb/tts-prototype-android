#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
function invariant(value, message) { if (!value) throw new Error(message); }

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--bundle") out.bundle = argv[++i];
    else if (argv[i] === "--workpack") out.workpack = argv[++i];
    else if (argv[i] === "--output-dir") out.outputDir = argv[++i];
    else throw new Error(`UNKNOWN_ARGUMENT:${argv[i]}`);
  }
  invariant(out.bundle && out.workpack && out.outputDir, "Usage: --bundle <learning.zip> --workpack <source-workpack.json> --output-dir <dir>");
  return out;
}

function safeOutput(root, taskId, assetPath) {
  const ext = path.extname(assetPath).toLowerCase();
  invariant([".jpg", ".jpeg", ".png", ".webp"].includes(ext), `UNSUPPORTED_ASSET_EXTENSION:${assetPath}`);
  const base = path.basename(assetPath).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const target = path.resolve(root, `${taskId}-${base}`);
  const resolvedRoot = path.resolve(root) + path.sep;
  invariant(target.startsWith(resolvedRoot), `OUTPUT_PATH_ESCAPE:${assetPath}`);
  return target;
}

async function main(argv = process.argv.slice(2)) {
  const options = args(argv);
  const bundleBytes = fs.readFileSync(options.bundle);
  const workpack = JSON.parse(fs.readFileSync(options.workpack, "utf8"));
  invariant(sha256(bundleBytes) === workpack.canonical_bundle_sha256, "CANONICAL_BUNDLE_HASH_MISMATCH");
  const zip = await JSZip.loadAsync(bundleBytes);
  fs.mkdirSync(options.outputDir, { recursive: true });
  const outputs = [];
  for (const task of workpack.tasks) {
    for (const asset of task.source_assets || []) {
      const entry = zip.file(asset.path);
      invariant(entry, `BUNDLE_ASSET_MISSING:${asset.path}`);
      const body = await entry.async("nodebuffer");
      invariant(body.length === asset.bytes, `ASSET_SIZE_MISMATCH:${asset.path}`);
      invariant(sha256(body) === asset.sha256, `ASSET_HASH_MISMATCH:${asset.path}`);
      const target = safeOutput(options.outputDir, task.task_id, asset.path);
      fs.writeFileSync(target, body);
      outputs.push({ task_id: task.task_id, source_path: asset.path, output_path: target, bytes: body.length, sha256: asset.sha256 });
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, batch_id: workpack.batch_id, asset_count: outputs.length, outputs }) + "\n");
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { args, safeOutput };
