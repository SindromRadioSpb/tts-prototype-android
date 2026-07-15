#!/usr/bin/env node
"use strict";

// Wave 2 N1 independent gate: table oracle + real SQLite claim concurrency.
// Transport delivery is fake/content-free; existing transport smokes cover the
// real Web Push and Telegram protocols separately.
const fs = require("fs");
const os = require("os");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-n1-selector-"));
process.env.DATA_DIR = scratch;

const sqlite = require(path.join(REPO, "db", "sqlite"));
const migrate = require(path.join(REPO, "db", "migrate"));
const ledger = require(path.join(REPO, "db", "nudgeLedgerRepo"));
const LT = require(path.join(REPO, "db", "localtime"));
const N1 = require(path.join(REPO, "db", "nudgeCoordinator"));
const selector = require(path.join(REPO, "db", "nudgeChannelSelector"));

const failures = [];
let checks = 0;
const eq = (c, m) => { checks++; if (!c) failures.push(m); };
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

function oracle(push, telegram, last, selected, reason) {
  const got = selector.selectChannel({ pushEligible: push, telegramEligible: telegram, lastClaimedChannel: last });
  eq(got.selected === selected && got.reason === reason,
    `oracle ${push}/${telegram}/${last}: expected ${selected}/${reason}, got ${got.selected}/${got.reason}`);
}

function depsFor({ users, day, push = {}, telegram = {}, prefs = {}, fail = {}, prepareFail = {}, deliveries, delayClaim = 0 }) {
  return {
    listCandidateUsers: async () => users,
    getPrefs: async (u) => ({ enabled: 1, telegram_enabled: 1, timezone: "Asia/Jerusalem", window: "morning",
      quiet_start_local: 22, quiet_end_local: 8, ...(prefs[u] || {}) }),
    localParts: () => ({ day, hour: 10, minute: 0 }),
    windowOpen: (_h, _w, _s, _e) => true,
    claimedToday: (u, d) => ledger.claimedToday(u, d),
    lastClaimedChannel: (u) => ledger.lastClaimedChannel(u),
    claimDay: async (u, d, c, r) => { if (delayClaim) await new Promise((x) => setTimeout(x, delayClaim)); return ledger.claimDay(u, d, c, r); },
    getDue: async () => [{ item_key: "redacted" }, { item_key: "redacted2" }],
    getPushSubscriptions: async (u) => push[u] ? [{ endpoint: "redacted" }] : [],
    telegramEligibility: async (u) => telegram[u] === "backoff" ? { eligible: false, skip: "backoff" }
      : telegram[u] ? { eligible: true, state: { consecutive_ignored: 0 }, engaged: false } : { eligible: false, skip: "no_consent" },
    prepareTelegram: async (u) => prepareFail[u] ? { ok: false, skip: "no_consent" }
      : ({ ok: true, reason: "DUE_READY", text: "count-only", state: { consecutive_ignored: 0 }, engaged: false }),
    deliverPush: async (u) => { deliveries.push([u, "push"]); return { delivered: !fail[u], deliveryCount: fail[u] ? 0 : 1, failureCode: fail[u] ? "FIXTURE_FAIL" : null }; },
    deliverTelegram: async (u) => { deliveries.push([u, "telegram"]); return { delivered: !fail[u], deliveryCount: fail[u] ? 0 : 1, failureCode: fail[u] ? "FIXTURE_FAIL" : null }; },
  };
}

(async () => {
  await sqlite.initDb(path.join(scratch, "app.db"));
  await migrate.runMigrations({ migrationsDir: path.join(REPO, "migrations") });
  const db = sqlite.getDb();
  for (const u of ["u_alt", "u_push", "u_tg", "u_none", "u_fail", "u_conc", "u_a", "u_b",
    "u_muted", "u_quiet", "u_disabled", "u_backoff", "u_revoke"])
    await dbRun(db, `INSERT INTO users (id, role, display_name) VALUES (?, 'owner', ?)`, [u, u]);

  // Independent pure matrix (owner-approved semantics).
  oracle(true, true, null, "push", "COLD_START_PUSH");
  oracle(true, true, "push", "telegram", "ALTERNATE_AFTER_PUSH");
  oracle(true, true, "telegram", "push", "ALTERNATE_AFTER_TELEGRAM");
  oracle(true, false, "push", "push", "ONLY_PUSH_ELIGIBLE");
  oracle(false, true, "telegram", "telegram", "ONLY_TELEGRAM_ELIGIBLE");
  oracle(false, false, null, null, "NO_ELIGIBLE_CHANNEL");

  // Cold start then two local-day alternations, using the real ledger as anchor.
  const deliveries = [];
  for (const day of ["2026-07-15", "2026-07-16", "2026-07-17"]) {
    const c = N1.createCoordinator(depsFor({ users: ["u_alt"], day, push: { u_alt: 1 }, telegram: { u_alt: 1 }, deliveries }));
    const out = await c.run({ nowMs: Date.UTC(2026, 6, Number(day.slice(-2)), 7) });
    eq(out.claim_lost === 0 && out.delivered === 1, `alternation ${day} must claim and deliver once`);
  }
  eq(JSON.stringify(deliveries) === JSON.stringify([["u_alt","push"],["u_alt","telegram"],["u_alt","push"]]),
    "both-eligible sequence must be push -> telegram -> push");

  // Only-one-eligible must not be suppressed by history.
  const one = [];
  await N1.createCoordinator(depsFor({ users: ["u_push", "u_tg", "u_none"], day: "2026-07-15",
    push: { u_push: 1 }, telegram: { u_tg: 1 }, deliveries: one })).run({ nowMs: Date.UTC(2026,6,15,7) });
  eq(one.some((x) => x[0] === "u_push" && x[1] === "push") && one.some((x) => x[0] === "u_tg" && x[1] === "telegram"),
    "only eligible channel must be selected for each user");
  eq(!one.some((x) => x[0] === "u_none"), "neither-eligible user must not claim or deliver");
  eq(!(await ledger.claimedToday("u_none", "2026-07-15")), "neither-eligible must leave daily budget unclaimed");

  // Telegram backoff never suppresses an eligible Push path.
  const backed = [];
  const bo = await N1.createCoordinator(depsFor({ users: ["u_backoff"], day: "2026-07-15",
    push: { u_backoff: 1 }, telegram: { u_backoff: "backoff" }, deliveries: backed })).run();
  eq(bo.telegram_backoff === 1 && backed[0] && backed[0][1] === "push", "Telegram backoff must reduce to Push-only eligibility");

  // Consent revoked after selection but before claim: no fallback and no claim.
  const revoked = [];
  const rv = await N1.createCoordinator(depsFor({ users: ["u_revoke"], day: "2026-07-15",
    push: {}, telegram: { u_revoke: 1 }, prepareFail: { u_revoke: 1 }, deliveries: revoked })).run();
  eq(rv.no_consent === 1 && revoked.length === 0 && !(await ledger.claimedToday("u_revoke", "2026-07-15")),
    "action-time consent revoke must create no claim and no send");

  // Failed delivery keeps the claim and anchors next-day alternation.
  const failed = [];
  const f1 = await N1.createCoordinator(depsFor({ users: ["u_fail"], day: "2026-07-15", push: { u_fail: 1 }, telegram: { u_fail: 1 }, fail: { u_fail: 1 }, deliveries: failed })).run();
  eq(f1.delivery_failed === 1 && (await ledger.lastClaimedChannel("u_fail")) === "push", "failed Push must keep its claim");
  const same = await N1.createCoordinator(depsFor({ users: ["u_fail"], day: "2026-07-15", push: { u_fail: 1 }, telegram: { u_fail: 1 }, deliveries: failed })).run();
  eq(same.budget === 1 && failed.length === 1, "failed send must not fallback/retry on the same local day");
  await N1.createCoordinator(depsFor({ users: ["u_fail"], day: "2026-07-16", push: { u_fail: 1 }, telegram: { u_fail: 1 }, deliveries: failed })).run();
  eq(failed[1] && failed[1][1] === "telegram", "next day must alternate from the failed claimed channel");

  // Two independent coordinator instances bypass in-process single-flight and
  // race the REAL SQLite INSERT OR IGNORE. Exactly one adapter may run.
  const concurrent = [];
  const cd = depsFor({ users: ["u_conc"], day: "2026-07-15", push: { u_conc: 1 }, telegram: { u_conc: 1 }, deliveries: concurrent, delayClaim: 10 });
  const [cr1, cr2] = await Promise.all([N1.createCoordinator(cd).run(), N1.createCoordinator(cd).run()]);
  const concRows = await dbAll(db, `SELECT * FROM nudge_ledger WHERE user_id='u_conc' AND local_day='2026-07-15'`);
  eq(concRows.length === 1 && concurrent.length === 1, "concurrent coordinators must produce one claim and one adapter invocation");
  eq(cr1.claim_lost + cr2.claim_lost === 1, "one concurrent coordinator must explicitly lose the claim");

  // User-scoped inverse histories: never use a global last-channel bit.
  await ledger.claimDay("u_a", "2026-07-14", "push", "DUE_READY");
  await ledger.claimDay("u_b", "2026-07-14", "telegram", "DUE_READY");
  const isolated = [];
  await N1.createCoordinator(depsFor({ users: ["u_a", "u_b"], day: "2026-07-15", push: { u_a:1,u_b:1 }, telegram: { u_a:1,u_b:1 }, deliveries: isolated })).run();
  eq(isolated.some((x) => x[0] === "u_a" && x[1] === "telegram") && isolated.some((x) => x[0] === "u_b" && x[1] === "push"),
    "inverse histories must remain user-scoped");

  // Shared mute/quiet gates occur before any claim.
  const guarded = [];
  const gd = depsFor({ users: ["u_muted", "u_quiet"], day: "2026-07-15", push: { u_muted:1,u_quiet:1 }, telegram: { u_muted:1,u_quiet:1 },
    prefs: { u_muted: { muted_until: "2099-01-01T00:00:00.000Z" } }, deliveries: guarded });
  gd.windowOpen = (_h,_w,_s,_e) => false;
  // Give muted its own early gate; quiet also reaches window=false.
  const g = await N1.createCoordinator(gd).run({ nowMs: Date.UTC(2026,6,15,7) });
  eq(g.muted === 1 && g.outside_window === 1 && guarded.length === 0, "mute and quiet/window must block both channels before claim");
  const disabledDeliveries = [];
  const dis = await N1.createCoordinator(depsFor({ users: ["u_disabled"], day: "2026-07-15",
    push: { u_disabled:1 }, telegram: { u_disabled:1 }, prefs: { u_disabled: { enabled: 0 } }, deliveries: disabledDeliveries })).run();
  eq(dis.disabled === 1 && disabledDeliveries.length === 0 && !(await ledger.claimedToday("u_disabled", "2026-07-15")),
    "global opt-out must block both channels before claim");

  // DST oracle remains IANA-based (summer/winter differ).
  eq(LT.localParts("Asia/Jerusalem", Date.UTC(2026,6,1,6,30)).hour === 9 &&
     LT.localParts("Asia/Jerusalem", Date.UTC(2026,0,1,6,30)).hour === 8,
    "selector local-time dependency must preserve Israel DST");

  // Structural authority/rollback shields.
  const coordSrc = fs.readFileSync(path.join(REPO, "db", "nudgeCoordinator.js"), "utf8");
  const selectorSrc = fs.readFileSync(path.join(REPO, "db", "nudgeChannelSelector.js"), "utf8");
  const pushSrc = fs.readFileSync(path.join(REPO, "db", "pushRepo.js"), "utf8");
  const tgSrc = fs.readFileSync(path.join(REPO, "db", "nudgeRepo.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(REPO, "server.js"), "utf8");
  const pushAdapter = pushSrc.slice(pushSrc.indexOf("async function deliverNudge"), pushSrc.indexOf("// Immediate send"));
  const tgAdapter = tgSrc.slice(tgSrc.indexOf("async function deliverPreparedTelegram"), tgSrc.indexOf("async function runNudgeSweep"));
  eq(coordSrc.includes("claimDay") && !pushAdapter.includes("claimDay") && !tgAdapter.includes("claimDay"), "only coordinator may claim; adapters must not own policy budget");
  eq(!/require\s*\(/.test(selectorSrc), "pure selector module must have no database, clock or transport imports");
  eq(serverSrc.includes("NUDGE_CHANNEL_SELECTOR_ENABLED") || coordSrc.includes("NUDGE_CHANNEL_SELECTOR_ENABLED"), "runtime rollback flag must exist");
  eq((serverSrc.match(/runUnifiedSweep\(options\)/g) || []).length >= 3, "both admin routes and the scheduler must use unified sweep when enabled");
  eq(!coordSrc.includes("item_key") && !coordSrc.includes("console."), "coordinator must not log or inspect learner content/item keys");
  const oldFlag = process.env.NUDGE_CHANNEL_SELECTOR_ENABLED;
  process.env.NUDGE_CHANNEL_SELECTOR_ENABLED = "0"; eq(N1.flagOn() === false, "selector flag 0 must activate rollback mode");
  process.env.NUDGE_CHANNEL_SELECTOR_ENABLED = "true"; eq(N1.flagOn() === true, "selector flag true must activate unified mode");
  if (oldFlag == null) delete process.env.NUDGE_CHANNEL_SELECTOR_ENABLED; else process.env.NUDGE_CHANNEL_SELECTOR_ENABLED = oldFlag;

  await sqlite.closeDb();
  if (failures.length) {
    console.error(`[nudge-channel-selector-smoke] FAIL ${checks - failures.length}/${checks}`);
    failures.forEach((f) => console.error(" - " + f));
    process.exit(1);
  }
  console.log(`[nudge-channel-selector-smoke] PASS ${checks}/${checks}`);
})().catch(async (e) => { try { await sqlite.closeDb(); } catch (_) {} console.error(e); process.exit(1); });
