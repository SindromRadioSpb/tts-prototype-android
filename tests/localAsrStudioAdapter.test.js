const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");

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
  const adapter = html.indexOf('/js/studio-import.js');
  assert.ok(normalizer > 0 && client > normalizer && adapter > client);
  assert.match(sw, /"\/js\/local-asr-normalizer\.js"/);
  assert.match(sw, /"\/js\/local-asr-client\.js"/);
});

test("380px pairing layout resets the row flex-basis after switching to column", () => {
  assert.match(
    html,
    /@media \(max-width: 420px\)[\s\S]*?\.v3-local-asr-pair-row input \{ flex:0 0 auto; width:100%; \}/
  );
});
