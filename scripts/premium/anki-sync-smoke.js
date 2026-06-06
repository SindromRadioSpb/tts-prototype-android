#!/usr/bin/env node
"use strict";

// anki-sync-smoke.js — R-3 Anki Connect bidirectional sync (READ path).
//
// Verifies, WITHOUT a live Anki (serviceWorkers blocked, no AnkiConnect), via
// the __v3AnkiConnectMock seam:
//   • v3AnkiCardStatsToLocalState (PURE) maps every AnkiConnect cardsInfo shape
//     to LinguistPro SM2 fields: type→state, queue −1→suspended (NOT "known"),
//     factor→ease (default 2.5, clamp [1.3,4.0]), reps/lapses, due derived
//     locally from mod+interval (Anki `due` is NOT imported).
//   • v3AnkiFetchWordReviewStates resolves each Anki word card back to the
//     CANONICAL local note via the lp_note_<id> tag (homograph-proof), skips
//     untagged matches, batches notesInfo/cardsInfo, and picks the most-reviewed
//     representative card per note. Offline (findNotes throws) → {ok:false}.
//
// All cases are pure/mock → no DB, no network, no Anki.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3258;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[anki-sync-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[anki-sync-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[anki-sync-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      out.hasMapper = typeof window.v3AnkiCardStatsToLocalState === "function";
      out.hasFetch = typeof window.v3AnkiFetchWordReviewStates === "function";
      if (!out.hasMapper || !out.hasFetch) return out;

      const M = window.v3AnkiCardStatsToLocalState;

      // ── Pure mapper: state by type, suspended by queue ──
      const MOD = 1700000000; // fixed epoch seconds (no Date.now in fixtures)
      const review = M({ cardId: 1, type: 2, queue: 2, interval: 30, factor: 2600, reps: 10, lapses: 1, mod: MOD });
      out.m_reviewState = review.state === "review";
      out.m_reviewEase = Math.abs(review.ease_factor - 2.6) < 1e-9;
      out.m_reviewIvl = review.interval_days === 30;
      out.m_reviewReps = review.reps === 10 && review.lapses === 1;
      // due derived locally = date(mod + ivl*86400) — NOT Anki's `due`.
      const expDue = new Date((MOD + 30 * 86400) * 1000).toISOString().slice(0, 10);
      out.m_dueDerived = review.due_date === expDue;

      out.m_learning = M({ type: 1, queue: 1, interval: 0, factor: 0, reps: 2, mod: MOD }).state === "learning";
      out.m_new = M({ type: 0, queue: 0, interval: 0, factor: 0, reps: 0, mod: MOD }).state === "new";
      out.m_relearning = M({ type: 3, queue: 1, interval: 1, factor: 2000, reps: 5, lapses: 3, mod: MOD }).state === "relearning";

      // Suspended review card → 'suspended', NOT 'review'/'known'.
      const susp = M({ type: 2, queue: -1, interval: 30, factor: 2500, reps: 8, mod: MOD });
      out.m_suspended = susp.state === "suspended";

      // reps>0 but type 0 (forgotten/reset) → 'new' (R-3.2 won't materialize it).
      const reset = M({ type: 0, queue: 0, interval: 0, factor: 1800, reps: 4, lapses: 2, mod: MOD });
      out.m_resetIsNew = reset.state === "new" && reset.interval_days === 0;

      // factor → ease: 0→2.5, clamp low (100→1.3), clamp high (9000→4.0), passthrough.
      out.m_easeDefault = M({ type: 0, factor: 0, mod: MOD }).ease_factor === 2.5;
      out.m_easeClampLow = M({ type: 2, factor: 100, interval: 1, mod: MOD }).ease_factor === 1.3;
      out.m_easeClampHigh = M({ type: 2, factor: 9000, interval: 1, mod: MOD }).ease_factor === 4.0;
      out.m_easePass = Math.abs(M({ type: 2, factor: 2450, interval: 1, mod: MOD }).ease_factor - 2.45) < 1e-9;

      // No mod → due null (can't derive without a timestamp).
      out.m_noModNoDue = M({ type: 2, interval: 5, factor: 2500, reps: 3, mod: 0 }).due_date === null;

      // Negative/garbage interval & reps clamp to 0.
      const junk = M({ type: 2, interval: -5, reps: -3, lapses: -1, factor: 2500, mod: MOD });
      out.m_clampNonNeg = junk.interval_days === 0 && junk.reps === 0 && junk.lapses === 0;

      // ── Fetch orchestrator via mock AnkiConnect ──
      const makeMock = (cfg) => {
        const calls = [];
        const fn = async (action, params) => {
          calls.push({ action, params: params || {} });
          if (Object.prototype.hasOwnProperty.call(cfg, action)) {
            return (typeof cfg[action] === "function") ? cfg[action](params || {}) : cfg[action];
          }
          return null;
        };
        fn._calls = calls;
        return fn;
      };

      // F1 — 3 notes: AAA (1 card), BBB (2 cards, pick most-reviewed), 3rd untagged → skipped.
      {
        const mock = makeMock({
          findNotes: () => [11, 22, 33],
          notesInfo: (p) => {
            const map = {
              11: { noteId: 11, tags: ["linguistpro", "lp_word", "lp_note_AAA"], cards: [110] },
              22: { noteId: 22, tags: ["lp_word", "lp_note_BBB"], cards: [220, 221] },
              33: { noteId: 33, tags: ["lp_word"], cards: [330] }, // no lp_note_ → untagged
            };
            return (p.notes || []).map((id) => map[id]);
          },
          cardsInfo: (p) => {
            const map = {
              110: { cardId: 110, type: 2, queue: 2, interval: 20, factor: 2500, reps: 6, lapses: 0, mod: MOD },
              220: { cardId: 220, type: 1, queue: 1, interval: 0, factor: 0, reps: 2, lapses: 0, mod: MOD },
              221: { cardId: 221, type: 2, queue: 2, interval: 40, factor: 2700, reps: 9, lapses: 1, mod: MOD },
              330: { cardId: 330, type: 2, queue: 2, interval: 5, factor: 2500, reps: 1, lapses: 0, mod: MOD },
            };
            return (p.cards || []).map((id) => map[id]);
          },
        });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiFetchWordReviewStates();
        window.__v3AnkiConnectMock = null;
        out.F1_ok = r.ok === true;
        out.F1_count = r.states.length === 2;                       // 33 skipped
        out.F1_untagged = r.untagged === 1;
        out.F1_totalCards = r.totalCards === 3;                     // 110,220,221 (330 untagged not collected)
        const aaa = r.states.find((s) => s.localNoteId === "AAA");
        const bbb = r.states.find((s) => s.localNoteId === "BBB");
        out.F1_aaaMapped = !!aaa && aaa.stat.state === "review" && aaa.stat.reps === 6;
        out.F1_bbbRepresentative = !!bbb && bbb.stat.reps === 9 && bbb.stat.interval_days === 40; // most-reviewed card
        out.F1_no33 = !r.states.some((s) => s.localNoteId === "" || s.ankiNoteId === 33);
      }

      // F2 — empty deck (findNotes []) → ok, empty states.
      {
        window.__v3AnkiConnectMock = makeMock({ findNotes: () => [] });
        const r = await window.v3AnkiFetchWordReviewStates();
        window.__v3AnkiConnectMock = null;
        out.F2_empty = r.ok === true && r.states.length === 0 && r.totalNotes === 0;
      }

      // F3 — AnkiConnect offline (findNotes throws) → {ok:false, error}.
      {
        window.__v3AnkiConnectMock = makeMock({ findNotes: () => { throw new Error("Failed to fetch"); } });
        const r = await window.v3AnkiFetchWordReviewStates();
        window.__v3AnkiConnectMock = null;
        out.F3_offline = r.ok === false && /Failed to fetch/.test(String(r.error || ""));
      }

      // F4 — batching: 250 notes → notesInfo called ≥2× (chunks of 200), all mapped.
      {
        const ids = Array.from({ length: 250 }, (_, i) => 1000 + i);
        const mock = makeMock({
          findNotes: () => ids,
          notesInfo: (p) => (p.notes || []).map((id) => ({ noteId: id, tags: ["lp_word", "lp_note_N" + id], cards: [id * 10] })),
          cardsInfo: (p) => (p.cards || []).map((id) => ({ cardId: id, type: 2, queue: 2, interval: 10, factor: 2500, reps: 3, lapses: 0, mod: MOD })),
        });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiFetchWordReviewStates();
        window.__v3AnkiConnectMock = null;
        const niCalls = mock._calls.filter((c) => c.action === "notesInfo").length;
        const ciCalls = mock._calls.filter((c) => c.action === "cardsInfo").length;
        out.F4_allMapped = r.states.length === 250;
        out.F4_batchedNotes = niCalls >= 2;
        out.F4_batchedCards = ciCalls >= 2;
      }

      return out;
    });

    test("window exports present (mapper + fetch)", R.hasMapper && R.hasFetch, JSON.stringify({ m: R.hasMapper, f: R.hasFetch }));

    // pure mapper
    test("map: review card → state review", R.m_reviewState === true);
    test("map: factor 2600 → ease 2.6", R.m_reviewEase === true);
    test("map: interval passthrough (days)", R.m_reviewIvl === true);
    test("map: reps/lapses passthrough", R.m_reviewReps === true);
    test("map: due derived locally (mod+ivl, NOT Anki due)", R.m_dueDerived === true);
    test("map: type 1 → learning", R.m_learning === true);
    test("map: type 0 → new", R.m_new === true);
    test("map: type 3 → relearning", R.m_relearning === true);
    test("map: queue −1 → suspended (NOT known)", R.m_suspended === true);
    test("map: reps>0 but type 0 → new (forgotten/reset)", R.m_resetIsNew === true);
    test("map: factor 0 → ease 2.5 default", R.m_easeDefault === true);
    test("map: ease clamp low (→1.3)", R.m_easeClampLow === true);
    test("map: ease clamp high (→4.0)", R.m_easeClampHigh === true);
    test("map: ease passthrough (2.45)", R.m_easePass === true);
    test("map: no mod → due null", R.m_noModNoDue === true);
    test("map: negative interval/reps/lapses clamp to 0", R.m_clampNonNeg === true);

    // fetch orchestrator
    test("fetch: 2 tagged notes mapped, untagged skipped", R.F1_ok === true && R.F1_count === true);
    test("fetch: untagged count = 1", R.F1_untagged === true);
    test("fetch: only tagged notes' cards collected", R.F1_totalCards === true);
    test("fetch: AAA mapped (1 card)", R.F1_aaaMapped === true);
    test("fetch: BBB representative = most-reviewed card", R.F1_bbbRepresentative === true);
    test("fetch: untagged note excluded from states", R.F1_no33 === true);
    test("fetch: empty deck → ok + empty states", R.F2_empty === true);
    test("fetch: offline (findNotes throws) → {ok:false,error}", R.F3_offline === true);
    test("fetch: 250 notes all mapped (batched notesInfo)", R.F4_allMapped === true && R.F4_batchedNotes === true);
    test("fetch: cardsInfo batched (chunks of 200)", R.F4_batchedCards === true);

    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[anki-sync-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
