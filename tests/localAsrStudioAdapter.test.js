const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
const localDb = fs.readFileSync(path.join(root, "public/db/local-db.js"), "utf8");

test("Local provider UI is hidden by default and Gemini remains first/reset default", () => {
  assert.match(html, /id="v3ImportAudioProviderWrap"[^>]*hidden/);
  const select = html.match(/<select id="v3ImportAudioProvider"[\s\S]*?<\/select>/)[0];
  assert.ok(select.indexOf('value="gemini"') < select.indexOf('value="local"'));
  assert.match(studio, /provider\.value = "gemini"; \/\/ experimental Local never changes the product default/);
  assert.match(studio, /LocalAsrClient\.isExperimentalEnabled\(\)/);
});

test("Local-to-Gemini switch has explicit consent and no implicit fallback call", () => {
  assert.match(studio, /localAsrCloudConsent/);
  assert.match(studio, /fallbackConsent/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "public/js/local-asr-client.js"), "utf8"),
    /GeminiFiles|generativelanguage\.googleapis\.com/
  );
});

test("normalizer and client load before Studio and are both precached", () => {
  const normalizer = html.indexOf('/js/local-asr-normalizer.js');
  const client = html.indexOf('/js/local-asr-client.js');
  const onboarding = html.indexOf('/js/local-asr-onboarding.js');
  const adapter = html.indexOf('/js/studio-import.js');
  assert.ok(normalizer > 0 && client > normalizer && onboarding > client && adapter > onboarding);
  assert.match(sw, /"\/js\/local-asr-normalizer\.js"/);
  assert.match(sw, /"\/js\/local-asr-client\.js"/);
  assert.match(sw, /"\/js\/local-asr-onboarding\.js"/);
});

test("beta onboarding is runtime-default-off and remains an exposure seam, not schema entitlement", () => {
  const onboarding = fs.readFileSync(path.join(root, "public/js/local-asr-onboarding.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /LOCAL_ASR_BETA_ENABLED \|\| "false"/);
  assert.match(onboarding, /location\.hash === "#local-asr-beta"/);
  assert.match(onboarding, /LocalAsrClient\.enroll\(\)/);
  assert.doesNotMatch(onboarding, /\/api\/.*entitle|user_entitlement|migration/i);
});

test("onboarding states the privacy boundary and never calls Gemini", () => {
  const onboarding = fs.readFileSync(path.join(root, "public/js/local-asr-onboarding.js"), "utf8");
  assert.match(onboarding, /THIS COMPUTER/);
  assert.match(onboarding, /CLOUD OFF/);
  assert.doesNotMatch(onboarding, /GeminiFiles|generativelanguage\.googleapis\.com|upload\/v1beta/);
  assert.match(studio, /localAsrOom/);
  assert.match(studio, /localAsrDiskLow/);
  assert.match(studio, /localAsrModelIntegrity/);
});

test("380px pairing layout resets the row flex-basis after switching to column", () => {
  assert.match(
    html,
    /@media \(max-width: 420px\)[\s\S]*?\.v3-local-asr-pair-row input \{ flex:0 0 auto; width:100%; \}/
  );
});

test("B+C import clears stale update authority and duplicate media is an explicit choice", () => {
  assert.match(studio, /v3SessionSet\(importSessionResetPatch\(\)\)/,
    "imported media must not inherit a prior card's baseTextId");
  assert.match(html, /findTextsByMediaSha/);
  assert.match(html, /allowDuplicateMedia/);
  assert.match(localDb, /export async function findTextsByMediaSha/);
  assert.match(localDb, /json_extract\(source_meta_json, '\$\.source\.audio\.media\.sha256'\)/);
});
