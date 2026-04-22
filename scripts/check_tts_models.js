const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");
const modelsRoot = path.join(publicRoot, "tts", "models");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function manifestFiles() {
  return fs
    .readdirSync(modelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(modelsRoot, entry.name, "manifest.json"))
    .filter((filePath) => fs.existsSync(filePath));
}

function resolvePublicAssetPath(assetPath) {
  return path.join(publicRoot, String(assetPath || "").replace(/^\/+/, "").replace(/\//g, path.sep));
}

let missing = 0;

for (const manifestPath of manifestFiles()) {
  const manifest = readJson(manifestPath);
  const modelPath = resolvePublicAssetPath(manifest.modelPath);
  const configPath = resolvePublicAssetPath(manifest.configPath);

  console.log(`MANIFEST ${path.relative(repoRoot, manifestPath)}`);
  console.log(`  voiceId: ${manifest.voiceId}`);
  console.log(`  runtime: ${manifest.runtime}`);
  console.log(`  modelPath: ${manifest.modelPath}`);
  console.log(`  configPath: ${manifest.configPath}`);
  console.log(`  checksumSha256: ${manifest.checksumSha256 ? "present" : "missing"}`);
  console.log(`  configChecksumSha256: ${manifest.configChecksumSha256 ? "present" : "missing"}`);

  if (!fs.existsSync(modelPath)) {
    missing += 1;
    console.log(`  MISSING_MODEL: ${path.relative(repoRoot, modelPath)}`);
  }
  if (!fs.existsSync(configPath)) {
    missing += 1;
    console.log(`  MISSING_CONFIG: ${path.relative(repoRoot, configPath)}`);
  }
}

if (missing > 0) {
  process.exitCode = 1;
}
