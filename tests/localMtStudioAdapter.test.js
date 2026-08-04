const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const client = fs.readFileSync(path.join(root, "public", "js", "local-mt-client.js"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "public", "js", "local-mt-onboarding.js"), "utf8");

test("Studio loads local MT after the shared pairing client and before inline routing", () => {
  const asr = html.indexOf('<script src="/js/local-asr-client.js"></script>');
  const mt = html.indexOf('<script src="/js/local-mt-client.js"></script>');
  const table = html.indexOf('<script src="/js/local-mt-table.js"></script>');
  const inlineRoute = html.indexOf("async function v3TranslateTableLocalMt");
  assert.ok(asr >= 0 && asr < mt && mt < table && table < inlineRoute);
});

test("runtime exposure is a separate default-off server flag", () => {
  assert.match(server, /LOCAL_MT_BETA_ENABLED\s*\|\|\s*"false"/);
  assert.match(server, /localMt:\s*\{[\s\S]*?beta:\s*localMtBetaEnabled/);
  assert.match(html, /LocalMtOnboarding\.configure\(j/);
});

test("MADLAD branches to loopback before cloud endpoint selection and cache is provider-scoped", () => {
  const branch = html.indexOf('if (requestedProvider === "madlad")');
  const endpoint = html.indexOf('const endpoint = usePremium ? "/api/translate-table-v2"');
  assert.ok(branch >= 0 && branch < endpoint);
  assert.match(html, /cache\.provider === requestedProvider/);
  assert.match(html, /const usePremium = provider === "gcp" \|\| provider === "google-free"/);

  const start = html.indexOf("async function v3TranslateTableLocalMt");
  const end = html.indexOf("async function translateTable()", start);
  const localRoute = html.slice(start, end);
  assert.match(localRoute, /new window\.LocalMtClient\.Client\(\)/);
  assert.match(localRoute, /LocalMtTable\.translateSegments\(/);
  assert.doesNotMatch(localRoute, /apiCall\(|\/api\/translate|fetch\(/);
});

test("Material Revision and Text Card Builder route MADLAD through the shared loopback mapper", () => {
  const revision = fs.readFileSync(path.join(root, "public", "js", "studio-material-revision.js"), "utf8");
  const revisionStart = revision.indexOf("if(provider==='madlad')");
  const revisionMadlad = revision.slice(revisionStart, revision.indexOf("}else{", revisionStart));
  assert.match(revisionMadlad, /LocalMtTable\.translateSegments/);
  assert.doesNotMatch(revisionMadlad, /apiCall\(|\/api\/translate/);
  assert.match(revision, /provider==='madlad'[\s\S]*?field==='ru'/);

  const tcbStart = html.indexOf("async function v3TcbProcessJob");
  const tcbEnd = html.indexOf("async function v3TextCardBuilderBuildAll", tcbStart);
  const tcb = html.slice(tcbStart, tcbEnd);
  assert.match(tcb, /provider === 'madlad'[\s\S]*?LocalMtTable\.translateSegments/);
  const tcbMadladStart = tcb.indexOf("if (provider === 'madlad')");
  assert.doesNotMatch(tcb.slice(tcbMadladStart, tcb.indexOf("} else {", tcbMadladStart)), /apiCall\(|\/api\/translate/);
});

test("readiness distinguishes every required state and only ready enables MADLAD", () => {
  for (const state of ["absent", "unpaired", "model_missing", "installing", "ready", "busy", "error"]) {
    assert.match(html, new RegExp(`${state}:`));
  }
  assert.match(html, /option\.disabled = state !== "ready"/);
});

test("browser MT calls only authenticated versioned loopback endpoints and shares the ASR token store", () => {
  assert.match(client, /window\.LocalAsrClient\.getPairingToken/);
  assert.doesNotMatch(client, /TOKEN_KEY|pairingToken\s*=\s*"linguistpro/);
  assert.doesNotMatch(client, /"\/translate"|"\/models\/status"|"\/models\/warmup"/);
  assert.doesNotMatch(client, /\/api\/|gemini|google-free|translate-table/iu);
  assert.match(client, /BASE_URL = "http:\/\/127\.0\.0\.1:8799"/);
  assert.match(client, /authorization: "Bearer " \+ token/);
});

test("onboarding exposes local privacy, resource, consent, deletion and draft limitations", () => {
  assert.match(onboarding, /10\.74 GB/);
  assert.match(onboarding, /60 GB/);
  assert.match(onboarding, /LIMITED EVIDENCE \/ NO BILINGUAL HUMAN VALIDATION/);
  assert.match(onboarding, /installModel\(true\)/);
  assert.match(onboarding, /deleteModel/);
  assert.match(onboarding, /127\.0\.0\.1:8799/);
});
