const fs = require("node:fs");
const path = require("node:path");

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

function manifestFiles(filterLangs) {
  const langs = Array.isArray(filterLangs) && filterLangs.length ? new Set(filterLangs) : null;
  return fs
    .readdirSync(modelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !langs || langs.has(entry.name))
    .map((entry) => path.join(modelsRoot, entry.name, "manifest.json"))
    .filter((filePath) => fs.existsSync(filePath));
}

function resolvePublicAssetPath(assetPath) {
  return path.join(publicRoot, String(assetPath || "").replace(/^\/+/, "").replace(/\//g, path.sep));
}

function checkFile(label, assetPath) {
  if (!assetPath) return null;
  const resolvedPath = resolvePublicAssetPath(assetPath);
  if (fs.existsSync(resolvedPath)) return null;
  return `${label}: ${path.relative(repoRoot, resolvedPath)}`;
}

function checkDirectory(label, assetPath) {
  if (!assetPath) return null;
  const resolvedPath = resolvePublicAssetPath(assetPath);
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) return null;
  return `${label}: ${path.relative(repoRoot, resolvedPath)}`;
}

let missing = 0;
const filterLangs = parseLangArg(process.argv.slice(2));

for (const manifestPath of manifestFiles(filterLangs)) {
  const manifest = readJson(manifestPath);
  const checks = [
    checkFile("MISSING_MODEL", manifest.modelPath),
    checkFile("MISSING_CONFIG", manifest.configPath),
    checkFile("MISSING_TOKENS", manifest.tokensPath),
    checkFile("MISSING_DATA_DIR_INDEX", manifest.dataDirIndexPath),
    checkDirectory("MISSING_DATA_DIR", manifest.dataDirPath)
  ].filter(Boolean);

  console.log(`MANIFEST ${path.relative(repoRoot, manifestPath)}`);
  console.log(`  voiceId: ${manifest.voiceId}`);
  console.log(`  runtime: ${manifest.runtime}`);
  console.log(`  modelPath: ${manifest.modelPath}`);
  console.log(`  configPath: ${manifest.configPath}`);
  console.log(`  tokensPath: ${manifest.tokensPath || "n/a"}`);
  console.log(`  dataDirPath: ${manifest.dataDirPath || "n/a"}`);
  console.log(`  checksumSha256: ${manifest.checksumSha256 ? "present" : "missing"}`);
  console.log(`  configChecksumSha256: ${manifest.configChecksumSha256 ? "present" : "missing"}`);

  for (const issue of checks) {
    missing += 1;
    console.log(`  ${issue}`);
  }
}

if (missing > 0) {
  process.exitCode = 1;
}
