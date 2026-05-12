#!/usr/bin/env node
// scripts/research/seed_research_fake_cohort.js — Phase 11.5 §10.
//
// Generates a deterministic mock cohort for dashboard development +
// teacher-smoke. Writes:
//   <RESEARCH_DATA_DIR>/<code>/cohort_meta.json   (via createCohort)
//   <RESEARCH_DATA_DIR>/<code>/<YYYY-MM-DD>.jsonl (14 days × 12 students)
//   <RESEARCH_DATA_DIR>/<code>/outcomes.csv       (synthetic exam scores
//                                                  correlated with engagement)
//
// Composition:
//   • 12 students, 14 days each (one student withdraws on day 7).
//   • 3 engagement groups:
//       high   (4 students): 60+ min/day, 30+ cards/day, exam 85+
//       medium (5 students): 30 min/day, 15 cards/day, exam 70-85
//       low    (3 students): 10 min/day, 5  cards/day, exam 50-70
//   • Per-day noise ±15%.
//
// Usage:
//   node scripts/research/seed_research_fake_cohort.js \
//     --code FAKE-COH-1 [--token <STR>] [--start-date YYYY-MM-DD] [--days 14] [--students 12]

"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { cohortDir, cohortExists, createCohort } = require("../../research/storage");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[k] = true; }
    else { args[k] = next; i++; }
  }
  return args;
}

function uuidV4() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Seeded PRNG so the seed is deterministic given a known --code (for
// reproducible test fixtures). xmur3 + sfc32 from popular gist.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const s = xmur3(seedStr);
  return sfc32(s(), s(), s(), s());
}

function isoDay(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }

const ENGAGEMENT_GROUPS = [
  { name: "high",   count: 4, base: { active_min: 60, cards: 30, notes: 5, audio_ms: 600000, search: 4 }, exam: [85, 95] },
  { name: "medium", count: 5, base: { active_min: 30, cards: 15, notes: 3, audio_ms: 280000, search: 2 }, exam: [70, 85] },
  { name: "low",    count: 3, base: { active_min: 10, cards: 5,  notes: 1, audio_ms: 90000,  search: 1 }, exam: [50, 70] },
];

function noisyScale(rng, base) {
  // ±15% noise.
  return Math.max(0, Math.round(base * (1 + (rng() - 0.5) * 0.3)));
}

function buildDailyMetrics(rng, baseBucket, dayIdx) {
  const m = {};
  m.active_minutes_real = noisyScale(rng, baseBucket.active_min);
  m.sessions_count = Math.max(1, Math.round(m.active_minutes_real / 25));
  m.active_days_count = 1;
  m.audio_play_ms_total = noisyScale(rng, baseBucket.audio_ms);
  m.cards_reviewed = noisyScale(rng, baseBucket.cards);
  // Quality drops with engagement: high engagers ~85% correct, low ~60%.
  const correctPct = 0.6 + 0.25 * (baseBucket.cards / 30);
  m.cards_correct = Math.round(m.cards_reviewed * Math.min(0.95, correctPct + (rng() - 0.5) * 0.1));
  m.cards_again = Math.max(0, m.cards_reviewed - m.cards_correct);
  m.srs_error_rate = m.cards_reviewed > 0
    ? Math.round((m.cards_again / m.cards_reviewed) * 100) / 100
    : 0;
  m.cards_added_to_srs = Math.max(0, Math.round(m.cards_reviewed * 0.2));
  m.notes_created = noisyScale(rng, baseBucket.notes);
  m.notes_edited = Math.round(m.notes_created * 0.4);
  m.search_queries_count = noisyScale(rng, baseBucket.search);
  m.smart_tag_overrides_count = rng() < 0.2 ? 1 : 0;
  m.translit_toggles_count = Math.round(rng() * 5);
  m.texts_opened_distinct = Math.max(1, Math.round(m.sessions_count * 0.7));
  m.texts_opened_total = m.texts_opened_distinct * 2;
  m.sentences_read_distinct = Math.round(m.cards_reviewed * 1.5);
  m.sentences_read_total = m.sentences_read_distinct * 2;
  // Time-of-day histogram: light morning + heavy evening pattern.
  const histogram = {};
  for (let h = 0; h < 24; h++) histogram[String(h)] = 0;
  // Distribute sessions across 8-22 hours with bias toward 18-21.
  for (let i = 0; i < m.sessions_count; i++) {
    const hour = Math.floor(8 + rng() * 14 + (rng() < 0.4 ? 4 : 0));
    const cap = Math.min(23, Math.max(0, hour));
    histogram[String(cap)] = (histogram[String(cap)] || 0) + 1;
  }
  m.time_of_day_histogram = histogram;
  m.audio_replay_distribution = {
    "1": Math.round(m.sentences_read_distinct * 0.5),
    "2": Math.round(m.sentences_read_distinct * 0.3),
    "3": Math.round(m.sentences_read_distinct * 0.15),
    "4plus": Math.round(m.sentences_read_distinct * 0.05),
  };
  return m;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.code) {
    console.error("Usage: node scripts/research/seed_research_fake_cohort.js --code <COHORT_CODE> [--token TOK] [--start-date YYYY-MM-DD] [--days 14] [--students 12]");
    process.exit(1);
  }
  const code = String(args.code).trim();
  if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
    console.error(`error: --code "${code}" must match [A-Z0-9-]{4,16}`);
    process.exit(2);
  }

  const tokenPlain = args.token ? String(args.token) : ("seed-token-" + crypto.randomBytes(8).toString("hex"));
  const days = Number(args.days) || 14;
  const startDate = args["start-date"]
    ? new Date(args["start-date"] + "T00:00:00Z")
    : addDays(new Date(), -days);
  const studentCountOverride = args.students ? Number(args.students) : null;

  if (cohortExists(code)) {
    console.error(`error: cohort "${code}" already exists. Remove the directory first or pick a different --code.`);
    process.exit(3);
  }

  // Provision cohort_meta with hashed token.
  createCohort({
    code,
    researcherTokenPlain: tokenPlain,
    retentionUntil: isoDay(addDays(new Date(), 730)),
    outcomeScale: "0-100",
    kAnonymityThreshold: 5,
    consentVersionMinimum: "1.0",
  });

  const rng = makeRng(code);
  const cdir = cohortDir(code);

  // Build the student roster.
  let groups = ENGAGEMENT_GROUPS;
  if (studentCountOverride && studentCountOverride !== 12) {
    // Scale the groups proportionally if user overrode --students count.
    const ratio = studentCountOverride / 12;
    groups = ENGAGEMENT_GROUPS.map((g) => ({ ...g, count: Math.max(1, Math.round(g.count * ratio)) }));
  }

  const roster = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      roster.push({ student_id: uuidV4(), group: g });
    }
  }
  // Pick one student to withdraw mid-cohort (day 7 by default).
  const withdrawIdx = Math.floor(rng() * roster.length);
  const withdrawDay = Math.min(days - 1, 7);

  // Generate uploads day by day, student by student. Group by upload_ts so
  // jsonl files match the production write pattern.
  const uploadsByDate = new Map();
  for (let d = 0; d < days; d++) {
    const date = isoDay(addDays(startDate, d));
    const sinceDate = isoDay(addDays(startDate, Math.max(0, d - 1)));
    if (!uploadsByDate.has(date)) uploadsByDate.set(date, []);
    for (let s = 0; s < roster.length; s++) {
      const stu = roster[s];
      if (s === withdrawIdx && d >= withdrawDay) continue;
      // Skip ~10% of days for low-engager realism.
      const skipChance = stu.group.name === "low" ? 0.3 : (stu.group.name === "medium" ? 0.1 : 0.05);
      if (rng() < skipChance) continue;
      const metrics = buildDailyMetrics(rng, stu.group.base, d);
      uploadsByDate.get(date).push({
        format: "linguistpro-research-v1",
        student_id: stu.student_id,
        cohort_code: code,
        upload_ts: date,
        since_ts: sinceDate,
        consent_version: "1.0",
        context: { app_version: "3.2.0", platform: "web/desktop" },
        metrics,
      });
    }
  }
  // Write one jsonl per date.
  for (const [date, list] of uploadsByDate) {
    const lines = list.map((p) => JSON.stringify(p)).join("\n") + "\n";
    fs.writeFileSync(path.join(cdir, `${date}.jsonl`), lines, "utf8");
  }
  // Audit-log withdrawal.
  const wstu = roster[withdrawIdx];
  fs.appendFileSync(
    path.join(cdir, "deletions.log"),
    `${new Date(addDays(startDate, withdrawDay).getTime() + 12 * 3600_000).toISOString()} student_id=${wstu.student_id} reason=user_withdrawal records_removed=${withdrawDay} (synthetic seed)\n`,
    "utf8"
  );

  // Outcomes CSV — exam scores correlated with engagement (Pearson r > 0.6
  // expected after aggregation), some self-reported, some teacher-uploaded.
  const outLines = ["student_id,pre_test_score,post_test_score,exam_date,uploaded_by"];
  const examDate = isoDay(addDays(startDate, days + 1));
  for (let s = 0; s < roster.length; s++) {
    const stu = roster[s];
    if (s === withdrawIdx) continue; // withdrawn — no exam recorded
    const [lo, hi] = stu.group.exam;
    const post = Math.round(lo + rng() * (hi - lo));
    const pre = Math.max(30, post - Math.round(15 + rng() * 25));
    const by = rng() < 0.5 ? "teacher" : "self-report";
    outLines.push(`${stu.student_id},${pre},${post},${examDate},${by}`);
  }
  fs.writeFileSync(path.join(cdir, "outcomes.csv"), outLines.join("\n") + "\n", "utf8");

  console.log("Fake cohort seeded:");
  console.log(`  code:                  ${code}`);
  console.log(`  RESEARCH_DATA_DIR:     ${path.dirname(cdir)}`);
  console.log(`  cohort_dir:            ${cdir}`);
  console.log(`  students:              ${roster.length} (1 withdrew on day ${withdrawDay})`);
  console.log(`  days_simulated:        ${days}`);
  console.log(`  date_range:            ${isoDay(startDate)} … ${isoDay(addDays(startDate, days - 1))}`);
  console.log(`  outcomes.csv rows:     ${outLines.length - 1}`);
  console.log("");
  console.log("Researcher token (plaintext — not stored):");
  console.log(`  ${tokenPlain}`);
  console.log("");
  console.log("Open dashboard:");
  console.log(`  http://localhost:<PORT>/teacher.html`);
  console.log(`  cohort code = ${code}`);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("seed failed:", e && e.message ? e.message : e); process.exit(1); }
}
