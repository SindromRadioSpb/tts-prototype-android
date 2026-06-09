#!/usr/bin/env node
"use strict";

// run-corpus-prebake.js — BRR-P0-006 full-corpus pre-run runner (RUN LOCALLY).
//
// Owner decisions 2026-06-09 (docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md):
//   A) scope  = tiered (known-era originals first; size-tiering + giant-defer at run time)
//   B) speed  = free-tier only (1500 Gemini req/day, $0) → daily-quota stop + resume
//   C) audio  = on-demand computed-key (runner does NOT pre-bake tail audio)
//   D) niqqud = Dicta-cloud with backoff
//
// THIS INCREMENT = the resumable PLANNER + work-ledger (offline, deterministic):
// it selects the originals, orders them known-era-first, seeds the ledger, and prints
// the day-by-day free-tier schedule + ETA from the measured reqs/work. It does NOT yet
// run the translate/niqqud bake loop — that lands in the next increment (it reuses the
// shipped producer's translateWork/niqqud orchestration via an extracted lib/ingestCore;
// see the plan doc). Running the bake without that is intentionally refused (no stub).
//
//   node scripts/premium/run-corpus-prebake.js --plan
//   node scripts/premium/run-corpus-prebake.js --plan --gemini-per-day 1500 --reqs-per-work 5.7
//
// Ledger: .tmp/benyehuda/prebake-ledger.json (resume-safe; re-running --plan re-seeds
// only new ids and reports current progress without resetting done works).

const fs = require("fs");
const path = require("path");

const by = require("./lib/benyehuda");
const ledgerLib = require("./lib/corpusLedger");

const REPO = path.resolve(__dirname, "..", "..");
const BY_DIR = path.join(REPO, ".tmp", "benyehuda");
const CSV_PATH = path.join(BY_DIR, "pseudocatalogue.csv");
const ESTIMATE_PATH = path.join(REPO, ".tmp", "by-prerun-estimate.json");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
function flag(name) { return process.argv.indexOf("--" + name) >= 0; }

const PLAN = flag("plan");
const BAKE = flag("bake");
const GEMINI_PER_DAY = Number(arg("gemini-per-day", 1500)) || 1500;
const LEDGER_PATH = String(arg("ledger", path.join(BY_DIR, "prebake-ledger.json")));

// reqs/work: prefer the measured estimate (.tmp/by-prerun-estimate.json), else default.
function defaultReqsPerWork() {
  try {
    const est = JSON.parse(fs.readFileSync(ESTIMATE_PATH, "utf8"));
    const reqs = est && est.translation_gemini && est.translation_gemini.requests_est;
    const orig = est && est.corpus && est.corpus.originals;
    if (reqs && orig) return reqs / orig;
  } catch (_) {}
  return 5.7;
}
const REQS_PER_WORK = Number(arg("reqs-per-work", defaultReqsPerWork())) || 5.7;

function selectAndOrderOriginals(rows) {
  const originals = rows.filter((r) => !by.cleanField(r.translators) && by.cleanField(r.path) && by.cleanField(r.ID));
  const known = [], rest = [];
  for (const r of originals) {
    let era = null; try { era = by.eraForAuthor(r.authors); } catch (_) {}
    (era ? known : rest).push({ id: String(by.cleanField(r.ID)), tier: era ? "known-era" : "rest", era: era || null });
  }
  return { originals, known, rest, ordered: [...known, ...rest] };
}

function main() {
  if (!fs.existsSync(CSV_PATH)) { console.error("CSV not found: " + CSV_PATH + "\nRun `node scripts/premium/ingest-benyehuda.js` once (or measure-corpus-prerun.js) to fetch it."); process.exit(2); }
  if (BAKE) {
    console.error("[prebake] --bake is NOT wired in this increment (no stub). The translate/niqqud bake loop\n" +
      "          (free-tier daily-quota + 429-detect + per-shard output, reusing the producer core via\n" +
      "          lib/ingestCore) is the next increment — see docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md.\n" +
      "          Use --plan for the schedule + to seed/inspect the ledger.");
    process.exit(2);
  }
  if (!PLAN) { console.error("[prebake] pass --plan (the bake loop is the next increment). See --help in the header."); process.exit(2); }

  const { rows } = by.parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const sel = selectAndOrderOriginals(rows);

  const ledger = ledgerLib.loadLedger(LEDGER_PATH);
  const added = ledgerLib.seedLedger(ledger, sel.ordered);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  ledgerLib.saveLedger(LEDGER_PATH, ledger);
  const s = ledgerLib.stats(ledger);

  const pending = ledgerLib.pendingWorks(ledger, sel.ordered.map((e) => e.id)).length;
  const worksPerDay = Math.max(1, Math.floor(GEMINI_PER_DAY / REQS_PER_WORK));
  const etaDays = Math.ceil(pending / worksPerDay);

  console.log("=== BRR-P0-006 PRE-RUN PLAN (free-tier, tiered, resumable) ===");
  console.log(`corpus: ${rows.length} works | originals ${sel.originals.length} (translations handled separately)`);
  console.log(`tiers:  known-era ${sel.known.length} (FIRST) → rest ${sel.rest.length}`);
  console.log(`ledger: ${LEDGER_PATH} (seeded +${added} new) | done ${s.done} · pending ${s.pending} · failed ${s.failed} · deferred-giant ${s.deferredGiant} · skipped ${s.skipped}`);
  console.log(`budget: ${GEMINI_PER_DAY} Gemini req/day · ~${REQS_PER_WORK.toFixed(1)} req/work → ~${worksPerDay} works/day`);
  console.log(`ETA:    ~${etaDays} days to drain ${pending} pending originals ($0 free-tier) — giants deferred to a capped tail pass at run time`);
  console.log("audio:  on-demand computed-key (NOT pre-baked here); niqqud: Dicta-cloud w/ backoff; review_status=machine.");
  console.log("next:   wire the bake loop (translate/niqqud via lib/ingestCore, per-shard output, 429-detect) — see plan doc.");
}

main();
