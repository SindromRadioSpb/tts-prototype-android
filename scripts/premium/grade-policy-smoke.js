#!/usr/bin/env node
"use strict";
// smoke:grade-policy — гейт D1 (AI_MENTOR_RECON §14 D1, пре-условие CLG-P6 №3).
// Чистый Node, без DB/браузера:
//   1) матрица decideGrade — production-провал на рецептивно-сильном → Hard(2), все
//      остальные ветви → бинарный грейд; skip никогда не смягчается (R17-B);
//   2) классификация каналов (prefix до ':'), обе формы prev-state (клиентская sched-строка,
//      legacy SM2, серверная проекция);
//   3) policyMeta — провенанс только на applied;
//   4) channelStats (learnerProjectionRepo) — production/receptive счётчики, skip/seed/mark
//      исключены, пусто → null;
//   5) fsrsStep принимает ЧИСЛОВОЙ грейд (2=Hard) и байт-совместим с boolean-вызовами —
//      расписание и log-строка шагаются одним policy-грейдом (replay==stored by construction).
// Run: node scripts/premium/grade-policy-smoke.js [--gate]

const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const GP = require(path.join(REPO, "public", "js", "grade-policy.js"));
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const FC = require(path.join(REPO, "public", "js", "fsrs-core.js"));
const PR = require(path.join(REPO, "db", "learnerProjectionRepo.js"));

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

// ── фикстуры лога ────────────────────────────────────────────────────────────
const T = (h) => `2026-06-0${h}T10:00:00.000Z`;
const seedRow = { id: "seed:x#abc", kind: "seed", reviewed_at: T(1), grade: null, source: "seed-sm2", channel: null };
const readOk = { id: "r1", kind: "review", reviewed_at: T(2), grade: 3, source: "room-recall", channel: "read:mc" };
const tapOk = { id: "r2", kind: "review", reviewed_at: T(3), grade: 3, source: "reading-tap", channel: "reading:tap" };
const dictOk = { id: "r3", kind: "review", reviewed_at: T(4), grade: 3, source: "room-recall", channel: "dictate:typed" };
const dictFail = { id: "r4", kind: "review", reviewed_at: T(5), grade: 1, source: "room-recall", channel: "dictate:tiles" };
const strong = { scheme: "fsrs", stability: 12.5, difficulty: 5, reps: 4, lapses: 0 };

// ── 1. классификация каналов ────────────────────────────────────────────────
eq(GP.isProductionChannel("dictate") && GP.isProductionChannel("dictate:typed") && GP.isProductionChannel("reverse:tiles"),
  "dictate/reverse (с режимом и без) must be production");
eq(!GP.isProductionChannel("read") && !GP.isProductionChannel("read:mc") && !GP.isProductionChannel("listen:mc") &&
  !GP.isProductionChannel("reading:tap") && !GP.isProductionChannel(null) && !GP.isProductionChannel(""),
  "read/listen/reading:tap/null must be receptive");
eq(GP.channelFamily("reverse") === "production" && GP.channelFamily("read") === "receptive", "channelFamily mapping");

// ── 2. формы prev-state ──────────────────────────────────────────────────────
eq(GP.hasMemoryState(strong), "fsrs sched-row must count as memory");
eq(GP.hasMemoryState({ due: 1750000000000, interval: 3 }), "legacy SM2 row (due) must count as memory");
eq(GP.hasMemoryState({ stability: 4.2, difficulty: 6 }), "server projection shape must count as memory");
eq(!GP.hasMemoryState(null) && !GP.hasMemoryState({}) && !GP.hasMemoryState({ stability: 0 }), "no/zero memory must not count");

// ── 3. матрица decideGrade ──────────────────────────────────────────────────
const d = (o) => GP.decideGrade(o);
let r;
r = d({ correct: true, channel: "dictate:typed", prevState: strong, rows: [seedRow, readOk] });
eq(r.grade === 3 && !r.applied, "correct → 3, policy not applied");
r = d({ correct: false, skipped: true, channel: "dictate:typed", prevState: strong, rows: [seedRow, readOk] });
eq(r.grade === 1 && !r.applied && r.reason === "skip", "skip must NEVER be softened (R17-B)");
r = d({ correct: false, channel: "read:mc", prevState: strong, rows: [seedRow, readOk] });
eq(r.grade === 1 && !r.applied, "receptive fail → Again(1)");
r = d({ correct: false, channel: "dictate:typed", prevState: strong, rows: [seedRow, readOk] });
eq(r.grade === 2 && r.applied === true && r.reason === "production-fail-receptive-strong",
  "D1 CORE: production fail on receptive-strong → Hard(2)");
r = d({ correct: false, channel: "reverse:tiles", prevState: strong, rows: [tapOk] });
eq(r.grade === 2 && r.applied, "reverse fail + reading-tap success evidence → Hard(2)");
r = d({ correct: false, channel: "dictate:typed", prevState: strong, rows: [seedRow] });
eq(r.grade === 2 && r.applied, "seed row (imported memory) counts as receptive evidence → Hard(2)");
r = d({ correct: false, channel: "dictate:typed", prevState: null, rows: [readOk] });
eq(r.grade === 1 && !r.applied, "no memory state → Again(1) even on production");
r = d({ correct: false, channel: "dictate:typed", prevState: strong, rows: [seedRow, readOk, dictOk] });
eq(r.grade === 1 && !r.applied && r.reason === "production-fail",
  "prior production SUCCESS → real lapse → Again(1)");
r = d({ correct: false, channel: "dictate:typed", prevState: strong, rows: [dictFail] });
eq(r.grade === 1 && !r.applied, "no receptive evidence (only production fails) → Again(1)");
r = d({ correct: false, channel: "dictate:typed", prevState: { due: 999 }, rows: [seedRow] });
eq(r.grade === 2 && r.applied, "legacy SM2 memory + seed evidence → Hard(2)");

// ── 4. policyMeta ───────────────────────────────────────────────────────────
const m1 = GP.policyMeta({ grade: 2, applied: true, reason: "production-fail-receptive-strong" });
eq(m1.raw_grade === 1 && m1.grade_policy === GP.POLICY_VERSION && m1.grader === "deterministic",
  "applied policy must stamp raw_grade/grade_policy/grader");
eq(Object.keys(GP.policyMeta({ grade: 1, applied: false })).length === 0, "non-applied policy must stamp nothing");

// ── 5. channelStats (learnerProjectionRepo, pure) ───────────────────────────
const cs = PR.channelStats([seedRow, readOk, tapOk, dictOk, dictFail,
  { id: "h1", kind: "review", reviewed_at: T(6), grade: 2, source: "room-recall", channel: "dictate:typed" },
  { id: "s1", kind: "skip", reviewed_at: T(7), grade: 1, source: "room-recall", channel: "read:mc" },
  { id: "m1", kind: "mark", reviewed_at: T(8), grade: null, source: "word-mark", channel: null },
]);
eq(!!cs && cs.receptive.reps === 2 && cs.receptive.good === 2 && cs.receptive.again === 0,
  "receptive stats: 2 good reviews (skip/seed/mark excluded), got " + JSON.stringify(cs && cs.receptive));
eq(!!cs && cs.production.reps === 3 && cs.production.good === 1 && cs.production.again === 1 && cs.production.hard === 1 &&
  cs.production.last_grade === 2,
  "production stats: good+again+hard, last_grade=2, got " + JSON.stringify(cs && cs.production));
eq(PR.channelStats([seedRow, { id: "m2", kind: "mark", reviewed_at: T(2), grade: null, source: "word-mark" }]) === null,
  "no review rows → channelStats null (never a fabricated zero-object)");

// ── 6. fsrsStep: числовой грейд + байт-парити boolean-вызовов ───────────────
const NOW = Date.parse("2026-06-10T10:00:00.000Z");
const stepBoolTrue = RM.fsrsStep(FC, null, true, NOW);
const stepNum3 = RM.fsrsStep(FC, null, 3, NOW);
eq(JSON.stringify(stepBoolTrue.sched) === JSON.stringify(stepNum3.sched), "fsrsStep(true) must equal fsrsStep(3) byte-for-byte");
const stepBoolFalse = RM.fsrsStep(FC, null, false, NOW);
const stepNum1 = RM.fsrsStep(FC, null, 1, NOW);
eq(JSON.stringify(stepBoolFalse.sched) === JSON.stringify(stepNum1.sched), "fsrsStep(false) must equal fsrsStep(1)");
const prevFsrs = { scheme: "fsrs", stability: 12.5, difficulty: 5, reps: 4, lapses: 0, reviewedAt: NOW - 5 * 86400000 };
const hard = RM.fsrsStep(FC, prevFsrs, 2, NOW);
const again = RM.fsrsStep(FC, prevFsrs, 1, NOW);
const direct2 = FC.nextState({ stability: 12.5, difficulty: 5, reps: 4, lapses: 0, lastReviewedAt: NOW - 5 * 86400000 }, 2, NOW);
eq(Math.abs(hard.sched.stability - direct2.stability) < 1e-9 && hard.sched.lapses === direct2.lapses,
  "fsrsStep(2) must equal FC.nextState(...,2,...) — Hard reaches the scheduler unmangled");
eq(hard.sched.lapses === prevFsrs.lapses && again.sched.lapses === prevFsrs.lapses + 1,
  "D1 semantics: Hard(2) must NOT count a lapse, Again(1) must, got hard=" + hard.sched.lapses + " again=" + again.sched.lapses);
eq(hard.sched.due > NOW && again.sched.due === NOW,
  "product contract: Again→due now, Hard→due in the future");

const TOTAL = 24;
if (failures.length) {
  console.error(`smoke:grade-policy FAIL (${TOTAL - failures.length}/${TOTAL})`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
} else {
  console.log(`smoke:grade-policy OK (${TOTAL}/${TOTAL}) — D1: матрица decideGrade (production-провал на рецептивно-сильном → Hard, skip не смягчается) · формы prev-state · policyMeta-провенанс · channelStats production/receptive · fsrsStep числовой грейд (Hard без lapse, boolean байт-парити)`);
}
