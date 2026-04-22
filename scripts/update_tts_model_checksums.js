const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");
const modelsRoot = path.join(publicRoot, "tts", "models");

function parseLangArg(argv) {
  const index = argv.indexOf("--lang");
  if (index === -1) return null;
  return String(argv[index + 1] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolvePublicAssetPath(assetPath) {
  return path.join(publicRoot, String(assetPath || "").replace(/^\/+/, "").replace(/\//g, path.sep));
}

const filterLangs = parseLangArg(process.argv.slice(2));
const langs = Array.isArray(filterLangs) && filterLangs.length ? new Set(filterLangs) : null;

const manifestFiles = fs
  .readdirSync(modelsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => !langs || langs.has(entry.name))
  .map((entry) => path.join(modelsRoot, entry.name, "manifest.json"))
  .filter((filePath) => fs.existsSync(filePath));

let hasMissing = false;

for (const manifestPath of manifestFiles) {
  const manifest = readJson(manifestPath);
  const modelFile = resolvePublicAssetPath(manifest.modelPath);
  const configFile = resolvePublicAssetPath(manifest.configPath);

  console.log(`UPDATE ${path.relative(repoRoot, manifestPath)}`);

  if (!fs.existsSync(modelFile)) {
    hasMissing = true;
    console.log(`  MISSING_MODEL: ${path.relative(repoRoot, modelFile)}`);
  } else {
    manifest.checksumSha256 = sha256(modelFile);
    console.log(`  checksumSha256: ${manifest.checksumSha256}`);
  }

  if (!fs.existsSync(configFile)) {
    hasMissing = true;
    console.log(`  MISSING_CONFIG: ${path.relative(repoRoot, configFile)}`);
  } else {
    manifest.configChecksumSha256 = sha256(configFile);
    console.log(`  configChecksumSha256: ${manifest.configChecksumSha256}`);
  }

  writeJson(manifestPath, manifest);
}

if (hasMissing) {
  process.exitCode = 1;
}
