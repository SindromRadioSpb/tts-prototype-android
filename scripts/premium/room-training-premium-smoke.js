#!/usr/bin/env node
"use strict";

// Contract-first red/green gate for the approved Room Training premium-release slice.
// Runtime DB/browser assertions are added alongside the implementation; these static guards
// deliberately fail on the pre-slice code and protect the architectural seams thereafter.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const room = read("public/js/library-ui.js");
const db = read("public/db/local-db.js");
const html = read("public/library.html");
const policy = read("public/js/grade-policy.js");
const locales = ["ru", "en", "he"].map((x) => read(`public/i18n/locales/${x}.js`));
const failures = [];
let checks = 0;
function check(ok, message) { checks++; if (!ok) failures.push(message); }

check(/export async function commitReviewAttempt\s*\(/.test(db), "local DB exposes one transactional review commit");
check(/BEGIN(?:\s+IMMEDIATE)?;[\s\S]{0,8000}INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+review_log[\s\S]{0,8000}(?:INSERT INTO|UPDATE)\s+word_status[\s\S]{0,8000}COMMIT;/i.test(db), "review event and projection commit in one transaction");
check(/await\s+localDb\.commitReviewAttempt\s*\(/.test(room), "Room grade path calls the transactional writer");
const gradeBody = (room.match(/async function checkTrainAnswer[\s\S]*?\n}\nfunction renderTrainReveal/) || [""])[0];
check(!/setWordStatus\s*\(/.test(gradeBody), "training grade does not mutate the asserted manual-status axis");
check(/training_stage:\s*trainingStage/.test(gradeBody) && /row\.kind === ['"]mark['"]/.test(room), "exercise progression replays grade evidence with later manual marks as overrides");
check(/getTrainingStageRows\(items\.map/.test(room) && /export async function getTrainingStageRows/.test(db), "session progression reads only its bounded item history");
check(/commitResult[\s\S]*?committed/.test(gradeBody), "UI checks the commit result before showing success");
check(/evidenceScopeFor/.test(room) && /evidence_scope:\s*evidenceScope/.test(room), "actual task mode writes deterministic evidence scope");
check(/function evidenceScopeFor\s*\(/.test(policy), "shared grade policy classifies actual Room task evidence");
check(/_crossChannelExposure/.test(room) && /evidenceScope === ['"]unsupported_production['"]/.test(room), "mid-card channel switching cannot overstate unsupported production");
const directAnchorBody = (room.match(/async function _buildDueSourcedItems[\s\S]*?if \(!ladder \|\| !laddered\.length\) return items;/) || [""])[0];
check(/card\.lemmaKey\s*!==\s*d\.lemmaKey/.test(directAnchorBody), "direct source anchors pass the canonical identity gate");
check(/function restartTraining[\s\S]{0,500}s\.cross\s*\?\s*startDueReview\(\)\s*:\s*startTraining\(\)/.test(room), "summary continuation preserves cross-text mode");
check(/retryQueue/.test(room) && /retryPhase/.test(room), "failed words receive one bounded same-session reinforcement phase");
check(/roomFocusInto\([^)]*room-study-card/.test((room.match(/async function startDueReview[\s\S]*?\n}/) || [""])[0]), "due review moves focus into the dialog");
check(/roomFocusTrap/.test(room), "study dialog traps focus while open");
check(/role:\s*['"]progressbar['"]/.test(room) && /aria-live['"]?:\s*['"]polite['"]/.test(room), "progress and feedback expose screen-reader semantics");
check(/\.room-study-x[\s\S]{0,260}(?:min-width|width):\s*44px[\s\S]{0,160}(?:min-height|height):\s*44px/.test(html), "close target meets the 44px project standard");
check(/\.room-train-chseg[\s\S]{0,260}min-height:\s*44px/.test(html) && /\.room-train-skip[\s\S]{0,260}min-height:\s*44px/.test(html), "channel and don't-know controls meet the 44px standard");
check(/room\.morph\.study\.reviewTitle/.test(room) && locales.every((x) => /reviewTitle\s*:/.test(x)), "due-review title is localized in ru/en/he");
check(/data-train-source/.test(room) && locales.every((x) => /sourceMissing\s*:/.test(x)), "source continuity action and missing-source recovery are localized");

// Owner-confirmed invariant: these supports stay visible before the answer.
check(/data-train-rowspeak/.test(room) && /if \(built\.ru\) body\.appendChild\(el\('div', \{ class: 'room-train-ctxq'/.test(room), "sentence audio and full translation scaffold remain in the question");

if (failures.length) {
  console.error(`room-training-premium-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`room-training-premium-smoke: PASS ${checks}/${checks}`);
