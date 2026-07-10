"use strict";

// Gate: smoke:miniapp-home — CLG-P8.2 (TELEGRAM_MINI_APP_P8_RECON §5.2/§12).
// Tests the EXACT production composer (agent/miniappHome.buildHomePayload) on a hermetic
// temp DB. Oracle independence: expected counts are HAND-DERIVED from the seed plan below
// (never recomputed via the repo under test); the local-midnight boundary row is crafted
// 1 minute BEFORE the same startOfLocalDay instant the composer uses.
// Teeth: annulled review does not count as done · yesterday row excluded · mark/skip not
// "done" · MNAR (composer writes NOTHING: review_log + exposure row-counts unchanged) ·
// payload = CLOSED key set, no item_key / no Hebrew content · flag-off → recommendation null.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const { initDb, getDb, closeDb } = require(path.join(ROOT, "db", "sqlite"));
const { runMigrations } = require(path.join(ROOT, "db", "migrate"));
const identity = require(path.join(ROOT, "db", "identityRepo"));
const learnerGraphRepo = require(path.join(ROOT, "db", "learnerGraphRepo"));
const LT = require(path.join(ROOT, "db", "localtime"));
const miniappHome = require(path.join(ROOT, "agent", "miniappHome"));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const dbRun = (sql, p = []) => new Promise((res, rej) => getDb().run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbGet = (sql, p = []) => new Promise((res, rej) => getDb().get(sql, p, (e, r) => e ? rej(e) : res(r)));

(async () => {
  delete process.env.AGENT_REVIEW_WRITE;   // flag OFF by default in this gate

  const dir = path.join(ROOT, ".tmp", "miniapp-home-smoke");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "app.db");
  for (const suf of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }
  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(ROOT, "migrations") });

  const owner = await identity.ensureOwnerUser();
  const userId = owner.id;
  const now = Date.now();

  // Same tz default the composer will resolve (no prefs row seeded → defaults).
  const sinceIso = LT.startOfLocalDay(LT.DEFAULT_TZ, now, 0);

  // ── seed plan (expected today.completed = 2: rows r1 + r2 ONLY) ──
  const HE = "שלום";   // Hebrew marker for the leak-gate assert
  const iso = (ms) => new Date(ms).toISOString();
  const rows = [
    // counted:
    { id: "r1", kind: "review", ch: "read:mc",    at: iso(now - 3600e3), grade: 3 },
    { id: "r2", kind: "review", ch: "dictate:tg", at: iso(now - 7200e3), grade: 3 },
    // NOT counted:
    { id: "r3", kind: "review", ch: "reverse:tg", at: iso(now - 1800e3), grade: 1 },              // annulled below (and LATEST by time)
    { id: "a3", kind: "annul",  ch: null,          at: iso(now - 900e3),  grade: null, meta: { annul_of: "r3" } },
    { id: "r4", kind: "review", ch: "read:mc",    at: iso(Date.parse(sinceIso) - 60e3), grade: 3 }, // 1 min before local midnight = yesterday
    { id: "m1", kind: "mark",   ch: null,          at: iso(now - 600e3),  grade: null, meta: { status: "l2" } },
    { id: "s1", kind: "skip",   ch: "read",        at: iso(now - 500e3),  grade: 2 },
  ];
  for (const r of rows) {
    await dbRun(
      `INSERT INTO review_log (user_id, id, item_key, kind, reviewed_at, grade, source, channel, meta_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, r.id, "pid:9999" + HE, r.kind, r.at, r.grade, "smoke", r.ch, JSON.stringify(r.meta || {})]
    );
  }

  // ── getTodayActivity: hand-derived oracle ──
  const act = await learnerGraphRepo.getTodayActivity(userId, { sinceIso });
  ok("today: completed == 2 (annulled/yesterday/mark/skip excluded)", act.completed === 2);
  ok("today: by_type read==1", act.by_type.read === 1);
  ok("today: by_type dictate==1", act.by_type.dictate === 1);
  ok("today: no reverse type (annulled)", act.by_type.reverse == null);

  // ── composer: MNAR + payload shape ──
  const cntBefore = await dbGet(`SELECT (SELECT COUNT(*) FROM review_log) AS rl, (SELECT COUNT(*) FROM tg_stimulus_exposure) AS ex`);
  const payload = await miniappHome.buildHomePayload(userId, { lang: "ru", nowMs: now });
  const cntAfter = await dbGet(`SELECT (SELECT COUNT(*) FROM review_log) AS rl, (SELECT COUNT(*) FROM tg_stimulus_exposure) AS ex`);
  ok("MNAR: review_log unchanged by home build", cntBefore.rl === cntAfter.rl);
  ok("MNAR: exposure ledger unchanged by home build", cntBefore.ex === cntAfter.ex);

  ok("payload: today.completed == 2", payload.today.completed === 2);
  ok("payload: closed key set", JSON.stringify(Object.keys(payload).sort()) ===
    JSON.stringify(["counts", "last_review_at", "recommendation", "today"]));
  const raw = JSON.stringify(payload);
  ok("privacy: no item_key in payload", raw.indexOf("item_key") === -1 && raw.indexOf("pid:9999") === -1);
  ok("privacy: no Hebrew content in payload", !/[֐-׿]/.test(raw));
  // last_review_at must skip the annulled r3 (latest review by time). Canon semantics
  // (getAgentContext): kind IN ('review','skip') — an explicit skip IS activity, so the
  // expected value is the s1 skip row (newest non-annulled), NOT r1.
  ok("honesty: last_review_at skips annulled latest row (skip counts as activity)",
    payload.last_review_at === rows[6].at);
  ok("flag-off: recommendation null (write-path off → no over-claim)", payload.recommendation === null);

  // flag ON with empty projections → selector honestly finds nothing → still null, no throw
  process.env.AGENT_REVIEW_WRITE = "1";
  const payload2 = await miniappHome.buildHomePayload(userId, { lang: "en", nowMs: now });
  ok("flag-on empty profile: recommendation null (nothing eligible)", payload2.recommendation === null);
  delete process.env.AGENT_REVIEW_WRITE;

  await closeDb();
  console.log(`\nsmoke:miniapp-home — ${pass}/${pass + fail} passed`);
  if (fail) { console.error(`FAILED: ${fail}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
