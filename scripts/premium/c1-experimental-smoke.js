#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const REPO = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(REPO, relative), "utf8");
const failures = [];
let checks = 0;
function ok(condition, message) { checks++; if (!condition) failures.push(message); }

const server = read("server.js");
const index = read("public/index.html");
const page = read("public/pronunciation.html");
const client = read("public/js/pronunciation-lab.js");
const entry = read("public/js/pronunciation-entry.js");
const sw = read("public/sw.js");
const companion = read("c1_companion/c1_companion.py");

ok(server.includes('C1_EXPERIMENTAL_ENABLED') && server.includes('c1ExperimentalEnabled'), "runtime flag must exist in client config");
ok(server.includes('microphone=(self)') && server.includes('PRONUNCIATION_CSP'), "pronunciation shell must have microphone-self and strict CSP");
ok(server.includes("http://127.0.0.1:8765") && !server.includes("/api/pronunciation"), "Node server must allow loopback UI but expose no pronunciation API");
ok(index.includes('id="btnPronunciationLab"') && index.includes('id="v3IdePronunciationBtn"'), "Studio must expose both classic and IDE entry points");
ok(index.includes('/js/pronunciation-entry.js') && entry.includes('c1ExperimentalEnabled'), "entry points must obey the runtime rollback flag");
ok(page.includes("60%") && page.includes("30%") && page.includes("2/10"), "measured quality must be visible in static HTML");
ok(page.includes('id="c1Accept"') && page.includes('id="c1Activate"'), "explicit per-device opt-in must exist");
ok(client.includes('http://127.0.0.1:8765') && client.includes('X-C1-Token'), "client must use token-gated loopback only");
ok(!client.includes('/api/pronunciation') && !client.includes('review_log') && !client.includes('FSRS') && !client.includes('sendBeacon'), "client must have no server audio or learner-state/analytics path");
ok(companion.includes('(\"127.0.0.1\", args.port)') && !companion.includes('0.0.0.0'), "companion must bind loopback only");
ok(companion.includes('hmac.compare_digest') && companion.includes('MAX_AUDIO_BYTES') && companion.includes('temp_path.unlink'), "companion must enforce token, body cap and temp deletion");
ok(companion.includes('EXERCISE_NOT_ALLOWED') && companion.includes('len(distorted) != 25'), "companion must enforce the 25-target allowlist");
ok(!companion.includes('requests.') && !companion.includes('urllib.request') && !companion.includes('review_log'), "companion must have no provider/server/learner-state client");
ok(sw.includes('v3.11.238') && sw.includes('/pronunciation.html') && sw.includes('/js/pronunciation-lab.js'), "new shell assets must be versioned and precached");

function loadLocale(code) {
  const sandbox = { window: { I18N_LOCALES: {} } };
  vm.runInNewContext(read(`public/i18n/locales/${code}.js`), sandbox);
  return sandbox.window.I18N_LOCALES[code];
}
const required = [
  "navLabel","navTitle","title","experimental","disclosureBody","boundary","optInCheck","connectBody",
  "labTitle","record","resultQuality","resultUnscorableTitle","resultClearTitle","resultIssueTitle",
  "privacyAudio","license","errorConnect","errorMic","errorScore",
];
for (const code of ["ru", "en", "he"]) {
  const locale = loadLocale(code);
  ok(locale && locale.pronunciation, `${code}: pronunciation locale block must exist`);
  for (const key of required) ok(typeof locale.pronunciation[key] === "string" && locale.pronunciation[key].length > 3, `${code}: missing pronunciation.${key}`);
}

if (failures.length) {
  console.error(`[c1-experimental-smoke] FAIL ${checks - failures.length}/${checks}`);
  failures.forEach((failure) => console.error(" - " + failure));
  process.exit(1);
}
console.log(`[c1-experimental-smoke] PASS ${checks}/${checks}`);
