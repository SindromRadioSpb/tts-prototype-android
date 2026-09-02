#!/usr/bin/env node
"use strict";
// smoke:train-queue — T1 serving-order engine gate.
// Pure Node assertions over public/js/train-queue.js (no DOM, no DB, no browser).
// Plan: docs/superpowers/plans/2026-09-02-room-trainer-t1-serving-order.md

const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..");
const TQ = require(path.join(ROOT, "public/js/train-queue.js"));

const failures = [];
let checks = 0;
function check(ok, message) { checks++; if (!ok) failures.push(message); }

function item(lemmaKey, srs, status) {
  return { lemmaKey: lemmaKey, status: status || "", _srs: srs || null };
}

// ── Suite 1: determinism contract ────────────────────────────────────────────
// Strip comments first: the module's own prose says "no Math.random", and a guard that
// matched documentation instead of code would be theatre.
const rawSrc = fs.readFileSync(path.join(ROOT, "public/js/train-queue.js"), "utf8");
const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
check(!/Math\.random/.test(src), "train-queue.js must contain no Math.random (project invariant)");
check(!/Date\.now/.test(src), "train-queue.js must contain no Date.now (nowMs is injected)");
// The stripper itself must work: the module documents the rule in a comment, so the raw
// text mentions it while the stripped code must not. If this ever inverts, the two guards
// above have stopped proving anything.
check(/Math\.random/.test(rawSrc) && !/Math\.random/.test(src),
  "the comment stripper must remove prose while leaving code — guard is only meaningful if it does");
check(TQ.ENGINE_VERSION === "train-queue-v1", "ENGINE_VERSION must be train-queue-v1, got " + TQ.ENGINE_VERSION);

// ── Suite 2: dayHash ─────────────────────────────────────────────────────────
check(TQ.dayHash("aleph", "2026-09-02") === TQ.dayHash("aleph", "2026-09-02"),
  "dayHash must be stable for the same (key, day)");
check(TQ.dayHash("aleph", "2026-09-02") !== TQ.dayHash("aleph", "2026-09-03"),
  "dayHash must differ across days for the same key");
check(TQ.dayHash("aleph", "2026-09-02") !== TQ.dayHash("bet", "2026-09-02"),
  "dayHash must differ across keys on the same day");
check(Number.isInteger(TQ.dayHash("aleph", "2026-09-02")) && TQ.dayHash("aleph", "2026-09-02") >= 0,
  "dayHash must return a non-negative integer");

// ── Suite 3: dayPermute ──────────────────────────────────────────────────────
const pool = [];
for (let i = 0; i < 40; i++) pool.push(item("w" + i, { due: 0, interval: 3, reps: 2, lapses: 0 }));

const dayA1 = TQ.dayPermute(pool, "2026-09-02").map((x) => x.lemmaKey);
const dayA2 = TQ.dayPermute(pool, "2026-09-02").map((x) => x.lemmaKey);
const dayB = TQ.dayPermute(pool, "2026-09-03").map((x) => x.lemmaKey);

check(dayA1.join(",") === dayA2.join(","), "dayPermute must be stable within a day");
check(dayA1.join(",") !== dayB.join(","), "dayPermute must reorder across days");
check(dayA1.slice().sort().join(",") === pool.map((x) => x.lemmaKey).slice().sort().join(","),
  "dayPermute must be a true permutation — no member lost or duplicated");
check(dayA1.length === pool.length, "dayPermute must preserve length");
check(TQ.dayPermute(null, "2026-09-02").length === 0, "dayPermute(null) must return []");

// how many of the first 12 change between two consecutive days — the variety signal.
// Two independent 12-subsets of 40 overlap by ~3.6 on average; 12 means the order did not
// change at all, which is exactly the defect this engine exists to fix.
const headA = new Set(dayA1.slice(0, 12));
const overlap = dayB.slice(0, 12).filter((k) => headA.has(k)).length;
check(overlap <= 8, "the served head must genuinely churn between consecutive days, overlap=" + overlap);

// Guards the defect class found while building this module: if the day is folded into the
// hash in a way that shifts every key by the same amount, the permutation is preserved and
// the same words are served for ever. The day-to-day deltas must therefore be well spread.
const deltas = new Set(pool.map((x) => (TQ.dayHash(x.lemmaKey, "2026-09-03") - TQ.dayHash(x.lemmaKey, "2026-09-02")) >>> 0));
check(deltas.size >= Math.floor(pool.length * 0.9),
  "day-to-day hash deltas must be well spread (a constant or near-constant shift preserves the order), got "
  + deltas.size + " distinct of " + pool.length);

// The permutation must also churn over a longer horizon, not just between adjacent days.
const week = [];
for (let d = 2; d <= 8; d++) week.push(TQ.dayPermute(pool, "2026-09-0" + d).slice(0, 12).map((x) => x.lemmaKey).join(","));
check(new Set(week).size === week.length, "each day in a week must produce a distinct served head");

// ── Suite 4: bucketOf ────────────────────────────────────────────────────────
check(TQ.bucketOf(item("a", { due: 0, interval: 0, reps: 3, lapses: 2 })) === "learning",
  "interval 0 with reps>0 is the most recent answer having been Again → learning");
check(TQ.bucketOf(item("b", { due: 0, interval: 5, reps: 0, lapses: 0 })) === "new",
  "reps 0 (manual-mark seed, never recall-tested) → new");
check(TQ.bucketOf(item("c", null)) === "new", "no schedule at all → new");
check(TQ.bucketOf(item("d", { due: 0, interval: 30, reps: 6, lapses: 0 }, "known")) === "known",
  "status 'known' with a live interval → known");
check(TQ.bucketOf(item("e", { due: 0, interval: 9, reps: 4, lapses: 1 })) === "overdue",
  "an ordinary graded due word → overdue");
check(TQ.bucketOf(item("f", { due: 0, interval: 0, reps: 2, lapses: 1 }, "known")) === "learning",
  "a KNOWN word whose last answer failed must be learning, not known");

// ── Suite 5: relativeOverdueness ─────────────────────────────────────────────
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);
check(Math.abs(TQ.relativeOverdueness(item("g", { due: NOW, interval: 10, reps: 3, reviewedAt: NOW - 10 * 86400000 }), NOW) - 1) < 1e-9,
  "a word reviewed exactly one interval ago has relative overdueness 1");
check(TQ.relativeOverdueness(item("h", { due: NOW, interval: 10, reps: 3, reviewedAt: NOW - 30 * 86400000 }), NOW) > 2.9,
  "three intervals late must score close to 3");
check(TQ.relativeOverdueness(item("i", { due: NOW, interval: 4, reps: 3, reviewedAt: null }), NOW) >= 1,
  "a legacy row without reviewedAt must fall back to due-minus-interval, never NaN");

// ── Suite 6: composeSession ──────────────────────────────────────────────────
function due(key, opts) {
  opts = opts || {};
  return item(key, {
    due: NOW - 86400000,
    interval: opts.interval == null ? 6 : opts.interval,
    reps: opts.reps == null ? 3 : opts.reps,
    lapses: opts.lapses || 0,
    reviewedAt: NOW - (opts.elapsed == null ? 7 : opts.elapsed) * 86400000
  }, opts.status || "");
}

const big = [];
for (let i = 0; i < 208; i++) big.push(due("k" + String(i).padStart(3, "0"), { lapses: i < 6 ? 9 : 0 }));

const base = { nowMs: NOW, dayStr: "2026-09-02", sessionSize: 20, reviewsRemaining: 60, newRemaining: 10 };
const s1 = TQ.composeSession(big, base);
const s1b = TQ.composeSession(big, base);
const s2 = TQ.composeSession(big, Object.assign({}, base, { dayStr: "2026-09-03" }));

check(s1.items.length === 20, "session must honour sessionSize=20, got " + s1.items.length);
check(s1.items.map((x) => x.lemmaKey).join(",") === s1b.items.map((x) => x.lemmaKey).join(","),
  "composeSession must be deterministic for the same day");
check(s1.items.map((x) => x.lemmaKey).join(",") !== s2.items.map((x) => x.lemmaKey).join(","),
  "composeSession must produce a different session the next day");
check(new Set(s1.items.map((x) => x.lemmaKey)).size === s1.items.length,
  "a session must never repeat a word");

// bounded weakness quota — the six lapse-9 words may not take over the session
const lapsed = new Set(big.filter((x) => x._srs.lapses === 9).map((x) => x.lemmaKey));
const lapsedServed = s1.items.filter((x) => lapsed.has(x.lemmaKey)).length;
check(lapsedServed <= Math.round(20 * 0.25),
  "weakness must be a bounded quota (<=25% of the session), got " + lapsedServed);
check(lapsedServed > 0, "the weakness quota must still surface weak words, got " + lapsedServed);

// The quota itself must rotate. Ranking it strictly by lapses rebuilds the defect one scale
// down: a handful of heavily-lapsed words would then fill the quota every single day.
const quotaDays = [];
for (let d = 2; d <= 9; d++) {
  const day = "2026-09-0" + d;
  quotaDays.push(TQ.composeSession(big, Object.assign({}, base, { dayStr: day }))
    .items.filter((x) => lapsed.has(x.lemmaKey)).map((x) => x.lemmaKey).sort().join(","));
}
check(new Set(quotaDays).size > 1,
  "the weakness quota must rotate inside its lapse tier, got the same set every day: " + quotaDays[0]);

// coverage across 20 simulated days — the headline T1 metric
const seen20 = new Set();
for (let d = 1; d <= 20; d++) {
  const day = "2026-09-" + String(d).padStart(2, "0");
  TQ.composeSession(big, Object.assign({}, base, { dayStr: day })).items.forEach((x) => seen20.add(x.lemmaKey));
}
check(seen20.size >= 120, "20 simulated sessions must reach a large share of a 208-word backlog, got " + seen20.size);

// answered-today exclusion
const exclude = s1.items.map((x) => x.lemmaKey);
const s3 = TQ.composeSession(big, Object.assign({}, base, { excludeKeys: exclude }));
check(s3.items.every((x) => exclude.indexOf(x.lemmaKey) < 0),
  "words answered today must not be served again in the same day");
check(s3.excludedToday === exclude.length,
  "excludedToday must report how many candidates were filtered, got " + s3.excludedToday);

// exhausted day → honest repeat rather than an empty screen
const small = [due("s1"), due("s2")];
const s4 = TQ.composeSession(small, Object.assign({}, base, { excludeKeys: ["s1", "s2"] }));
check(s4.items.length === 2 && s4.repeatedToday === true,
  "with every candidate already answered the session repeats them and says so, got " + JSON.stringify({ n: s4.items.length, r: s4.repeatedToday }));

// daily limits
const s5 = TQ.composeSession(big, Object.assign({}, base, { reviewsRemaining: 5 }));
check(s5.items.length === 5, "reviewsRemaining must cap the session, got " + s5.items.length);
const s6 = TQ.composeSession(big, Object.assign({}, base, { reviewsRemaining: 0 }));
check(s6.items.length === 0, "a spent review budget must serve nothing, got " + s6.items.length);

// known refresh reaches the cross-text session (defect D-C)
const mixed = [];
for (let i = 0; i < 40; i++) mixed.push(due("m" + i));
for (let i = 0; i < 20; i++) mixed.push(due("kn" + i, { status: "known", interval: 40 }));
const s7 = TQ.composeSession(mixed, base);
const knownServed = s7.items.filter((x) => x.status === "known").length;
check(knownServed > 0 && knownServed <= Math.round(20 * 0.15) + 1,
  "the cross-text session must interleave a capped known-refresh share, got " + knownServed);
check(s7.buckets.known === 20, "buckets must report the full candidate census, got " + JSON.stringify(s7.buckets));

// new words respect newRemaining
const withNew = [];
for (let i = 0; i < 10; i++) withNew.push(due("r" + i));
for (let i = 0; i < 30; i++) withNew.push(due("n" + i, { reps: 0, interval: 1 }));
const s8 = TQ.composeSession(withNew, Object.assign({}, base, { newRemaining: 3 }));
check(s8.servedNew === 3, "newRemaining must cap new words, got " + s8.servedNew);
check(s8.servedReview === s8.items.length - s8.servedNew,
  "servedReview + servedNew must equal the session size");

check(TQ.composeSession([], base).items.length === 0, "an empty candidate list yields an empty session");
check(TQ.composeSession(null, base).items.length === 0, "a null candidate list yields an empty session");

// ── Suite 7: queueLoad ───────────────────────────────────────────────────────
const sched = {};
for (let i = 0; i < 100; i++) sched["q" + i] = { due: NOW - 1000, interval: 10 };   // all due, I=10
for (let i = 0; i < 100; i++) sched["f" + i] = { due: NOW + 5 * 86400000, interval: 20 };
const load = TQ.queueLoad({ schedule: sched, statusMap: null, nowMs: NOW, reviewsPerDay: 12 });

check(load.dueNow === 100, "queueLoad must count only words due now, got " + load.dueNow);
check(load.scheduled === 200, "queueLoad must count every scheduled word, got " + load.scheduled);
check(Math.abs(load.inflowPerDay - (100 / 10 + 100 / 20)) < 1e-9,
  "inflow is the sum of 1/interval over scheduled words, got " + load.inflowPerDay);
check(load.requiredPerDay === 15, "requiredPerDay must round the inflow up, got " + load.requiredPerDay);
check(load.growing === true, "12 reviews/day against an inflow of 15 must be reported as growing");

const okLoad = TQ.queueLoad({ schedule: sched, statusMap: null, nowMs: NOW, reviewsPerDay: 60 });
check(okLoad.growing === false, "60 reviews/day against an inflow of 15 must not be reported as growing");

const ignored = { z1: { due: NOW - 1000, interval: 10 } };
const ignLoad = TQ.queueLoad({ schedule: ignored, statusMap: { z1: "ignore" }, nowMs: NOW, reviewsPerDay: 60 });
check(ignLoad.dueNow === 0 && ignLoad.scheduled === 0,
  "ignored words must not count toward due or load, got " + JSON.stringify(ignLoad));

const zero = TQ.queueLoad({ schedule: null, statusMap: null, nowMs: NOW, reviewsPerDay: 60 });
check(zero.dueNow === 0 && zero.requiredPerDay === 0 && zero.growing === false,
  "an empty schedule must produce a zeroed, non-growing load");

// ── Suite 8: wiring guards ───────────────────────────────────────────────────
const room = fs.readFileSync(path.join(ROOT, "public/js/library-ui.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/library.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
const db = fs.readFileSync(path.join(ROOT, "public/db/local-db.js"), "utf8");

check(/<script src="\/js\/train-queue\.js"><\/script>/.test(html), "library.html must load train-queue.js");
check(/"\/js\/train-queue\.js"/.test(sw), "sw.js must precache train-queue.js");
check(/ORDER BY w\.srs_due ASC/.test(db) && !/ORDER BY w\.srs_lapses DESC/.test(db),
  "getDueWithSource must no longer be a total order on srs_lapses");
check(/export async function getAnsweredSince\s*\(/.test(db), "local DB exposes getAnsweredSince");
check(/export async function getDayGradeCounts\s*\(/.test(db), "local DB exposes getDayGradeCounts");

const dueBody = (room.match(/async function startDueReview[\s\S]*?\n}\n/) || [""])[0];
check(dueBody.length > 0, "startDueReview must be locatable for the wiring guards");
check(/_composeDueSession/.test(dueBody), "startDueReview must select through the shared composition step");
check(!/rankByWeakness\([^)]*\)\.slice\(0, TRAIN_N\)/.test(dueBody),
  "startDueReview must not re-apply the lapses total order after composition");
// The Room aliases the engine (const TQ = window.TrainQueue), as it does for ReaderMorph, so
// assert the reach and the call rather than a string literal that an alias would break.
check(/window\.TrainQueue/.test(room), "the Room must reach the TrainQueue engine");
check(/\.composeSession\(/.test(room), "the Room must select through composeSession");
check(/\.queueLoad\(/.test(room), "the Room must compute the honest queue load");
check(/getAnsweredSince/.test(room), "the Room must exclude words already answered today");

const buildBody = (room.match(/async function _buildDueSourcedItems[\s\S]*?\n}\n/) || [""])[0];
check(buildBody.length > 0, "_buildDueSourcedItems must be locatable for the wiring guards");
check(!/TRAIN_N \* 2/.test(buildBody),
  "the 24-item prefix cut must be gone — assembly happens after selection, not before it");

check(/function trainPrefs\s*\(/.test(room) && /function trainPrefsSet\s*\(/.test(room),
  "the Room must expose session-size and daily-limit preferences");
check(/function _dayStartIso\s*\(/.test(room), "the Room must compute local midnight for the day fold");

// ── Suite 9: cross-text distractor pool (defect D-A) ─────────────────────────
check(/function _crossDistractorPool\s*\(/.test(room),
  "the Room must build a distractor pool for cross-text sessions");
const launchCalls = room.match(/_launchTrainSession\([^;]*?cross:\s*true[^;]*?\)/g) || [];
check(launchCalls.length >= 3, "every cross-text launch site must be found, got " + launchCalls.length);
check(launchCalls.every((c) => /pool:/.test(c)),
  "every cross-text launch must pass an explicit distractor pool, otherwise the session's own "
  + "words become its multiple-choice options; got " + JSON.stringify(launchCalls));
// The pool builder must gate identity — a distractor that is not the word it claims to be
// would be a fabricated option (R11).
const poolBody = (room.match(/async function _crossDistractorPool[\s\S]*?\n}\n/) || [""])[0];
check(/card\.lemmaKey !== key/.test(poolBody) || /card\.lemmaKey\s*!==\s*key/.test(poolBody),
  "the distractor pool must pass the canonical identity gate");

if (failures.length) {
  console.error(`train-queue-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`train-queue-smoke: PASS ${checks}/${checks}`);
