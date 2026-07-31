const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
const localDb = fs.readFileSync(path.join(root, "public/db/local-db.js"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "public/js/local-asr-onboarding.js"), "utf8");

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
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /LOCAL_ASR_BETA_ENABLED \|\| "false"/);
  assert.match(server, /supportedBrowsers: \["Chrome"\]/);
  assert.doesNotMatch(server, /supportedBrowsers: \[[^\]]*"Edge"/);
  assert.match(onboarding, /location\.hash === "#local-asr-beta"/);
  assert.match(onboarding, /LocalAsrClient\.enroll\(\)/);
  assert.doesNotMatch(onboarding, /\/api\/.*entitle|user_entitlement|migration/i);
});

test("onboarding states the privacy boundary and never calls Gemini", () => {
  assert.match(onboarding, /THIS COMPUTER/);
  assert.match(onboarding, /CLOUD OFF/);
  assert.doesNotMatch(onboarding, /GeminiFiles|generativelanguage\.googleapis\.com|upload\/v1beta/);
  assert.match(studio, /localAsrOom/);
  assert.match(studio, /localAsrDiskLow/);
  assert.match(studio, /localAsrModelIntegrity/);
});

test("pairing help names the exact Companion control and remains session-only", () => {
  assert.match(onboarding, /localAsrTokenHelpTitle/);
  assert.match(onboarding, /Copy token for browser/);
  assert.match(onboarding, /Windows Start/);
  assert.match(onboarding, /LOCAL_ASR_COMPANION_GUIDE/);
  const client = fs.readFileSync(path.join(root, "public/js/local-asr-client.js"), "utf8");
  assert.match(client, /getPairingToken[\s\S]*browserStore\("session"\)/);
  assert.doesNotMatch(client, /localStorage[^\n]*PAIRING_TOKEN|PAIRING_TOKEN[^\n]*localStorage/i);
});

test("both Local ASR connection actions expose a proximal connected state and reset it honestly", () => {
  assert.match(onboarding, /setConnectionState\(true\)[\s\S]*studio\.localAsrBeta\.connected/);
  assert.match(onboarding, /localAsrToken[\s\S]*addEventListener\("input"[\s\S]*setConnectionState\(false\)/);
  assert.match(studio, /setLocalAsrConnectionState\(true\)[\s\S]*studio\.import\.localAsrReady/);
  assert.match(studio, /function onLocalAsrTokenChanged\(\)[\s\S]*setLocalAsrConnectionState\(false\)/);
  assert.match(html, /id="v3ImportLocalAsrToken"[\s\S]*oninput="StudioImport\.onLocalAsrTokenChanged\(\)"/);
  assert.match(html, /#localAsrConnect\[data-connected="true"\],#v3ImportLocalAsrPair\[data-connected="true"\]/);
});

test("Import keeps companion pairing feedback inside the Local setup block", () => {
  assert.match(
    html,
    /data-i18n="studio\.import\.localAsrPrivacyHint"[\s\S]*?id="v3ImportLocalAsrPairStatus"[^>]*aria-live="polite"/
  );
  const pairFlow = studio.match(/async function pairLocalAsr\(\)[\s\S]*?\n  }/)[0];
  assert.match(pairFlow, /setLocalAsrPairStatus\(key,/);
  assert.match(pairFlow, /setLocalAsrPairStatus\(error/);
  assert.doesNotMatch(pairFlow, /setStatus\(/);
});

test("Local ASR help is allowlisted, localized, and available in the offline shell", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  for (const filename of [
    "LOCAL_ASR_COMPANION_GUIDE.md",
    "LOCAL_ASR_COMPANION_GUIDE.en.md",
    "LOCAL_ASR_COMPANION_GUIDE.he.md",
  ]) {
    assert.ok(fs.existsSync(path.join(root, "docs", filename)), filename + " must exist");
    assert.match(server, new RegExp(filename.replace(/\./g, "\\.")));
    assert.match(sw, new RegExp("/docs/" + filename.replace(/\./g, "\\.")));
  }
});

test("Companion presents pairing as a primary task and bundles the same help canon", () => {
  const companion = fs.readFileSync(path.join(root, "ai-local/ai_local/companion.py"), "utf8");
  const build = fs.readFileSync(path.join(root, "ai-local/scripts/build_companion.ps1"), "utf8");
  const installer = fs.readFileSync(path.join(root, "ai-local/installer/LinguistProLocalAsr.iss"), "utf8");
  assert.match(companion, /Connect LinguistPro in Chrome/);
  assert.match(companion, /Copy token for browser/);
  assert.doesNotMatch(companion, /Chrome\/Edge/);
  assert.match(companion, /Help \/ Справка/);
  assert.match(build, /LOCAL_ASR_COMPANION_GUIDE\.md/);
  assert.match(installer, /Local ASR help \(RU\)/);
});

test("380px pairing layout resets the row flex-basis after switching to column", () => {
  assert.match(
    html,
    /@media \(max-width: 420px\)[\s\S]*?\.v3-local-asr-pair-row input \{ flex:0 0 auto; width:100%; \}/
  );
});

test("mobile onboarding pairing controls cannot widen the Local ASR dialog", () => {
  assert.match(
    html,
    /\.local-asr-beta-panel \{[^}]*box-sizing:border-box;[^}]*max-width:100%;[^}]*\}/
  );
  assert.match(
    html,
    /@media \(max-width:600px\)[\s\S]*?\.local-asr-inline \{[^}]*min-width:0;[^}]*width:100%;[^}]*\}/
  );
  assert.match(
    html,
    /@media \(max-width:600px\)[\s\S]*?\.local-asr-inline input \{[^}]*box-sizing:border-box;[^}]*min-width:0;[^}]*max-width:100%;[^}]*width:100%;[^}]*\}/
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
