"use strict";

// scripts/premium/lib/corpusLedger.js — BRR-P0-006 work-ledger (pure).
//
// The full-corpus pre-run is a multi-DAY, resumable job. The shipped producer only
// resumes at the per-SEGMENT cache level (it re-scans + re-hashes every work each
// run); at ~26K works that is wasteful and has no notion of "N works/day, continue
// tomorrow". This ledger tracks per-WORK status + a per-UTC-day request budget so a
// run can stop on the daily free-tier quota and resume cleanly the next day.
//
// PURE: all functions operate on a plain ledger object and an explicitly-passed
// `day` string (the caller supplies the UTC date — never Date.now() here, so the
// logic is deterministic + unit-testable). loadLedger/saveLedger are the only
// fs-touching wrappers.
//
// Ledger shape:
//   {
//     version: 1,
//     works: { "<byehuda_id>": { status, tier, segments, reqs, niqqud, ru_filled,
//                                content_hash, error, day } },
//     daily: { "<YYYY-MM-DD>": reqsUsed }
//   }
// status ∈ pending | done | failed | deferred-giant | skipped

const fs = require("fs");

const LEDGER_VERSION = 1;
const STATUS = Object.freeze({ PENDING: "pending", DONE: "done", FAILED: "failed", DEFERRED: "deferred-giant", SKIPPED: "skipped" });

function emptyLedger() {
  return { version: LEDGER_VERSION, works: {}, daily: {} };
}

function loadLedger(path) {
  try {
    const raw = JSON.parse(fs.readFileSync(path, "utf8"));
    if (raw && typeof raw === "object" && raw.works && raw.daily) return raw;
  } catch (_) {}
  return emptyLedger();
}

function saveLedger(path, ledger) {
  fs.writeFileSync(path, JSON.stringify(ledger));
}

// Add any not-yet-present work ids as pending. `entries` = [{ id, tier }]. Never
// downgrades an existing entry (resume-safe: a done work stays done).
function seedLedger(ledger, entries) {
  let added = 0;
  for (const e of entries) {
    const id = String(e && e.id != null ? e.id : "");
    if (!id) continue;
    if (!ledger.works[id]) { ledger.works[id] = { status: STATUS.PENDING, tier: e.tier || null }; added++; }
    else if (e.tier && ledger.works[id].tier == null) ledger.works[id].tier = e.tier;
  }
  return added;
}

function setStatus(ledger, id, status, info, day) {
  const w = ledger.works[String(id)] || (ledger.works[String(id)] = { status: STATUS.PENDING, tier: null });
  w.status = status;
  if (info && typeof info === "object") for (const k of ["tier", "segments", "reqs", "niqqud", "ru_filled", "content_hash", "error"]) if (info[k] !== undefined) w[k] = info[k];
  if (day) w.day = day;
  return w;
}
function markDone(ledger, id, info, day) { return setStatus(ledger, id, STATUS.DONE, info, day); }
function markFailed(ledger, id, error, day) { return setStatus(ledger, id, STATUS.FAILED, { error: String(error || "error") }, day); }
function markDeferredGiant(ledger, id, info, day) { return setStatus(ledger, id, STATUS.DEFERRED, info, day); }
function markSkipped(ledger, id, info, day) { return setStatus(ledger, id, STATUS.SKIPPED, info, day); }

// Record Gemini requests spent on a given UTC day (free-tier daily budget).
function recordReqs(ledger, day, n) {
  const d = String(day);
  ledger.daily[d] = (ledger.daily[d] || 0) + (Number(n) || 0);
  return ledger.daily[d];
}
function dayReqsUsed(ledger, day) { return ledger.daily[String(day)] || 0; }
function dayQuotaRemaining(ledger, day, perDay) { return Math.max(0, (Number(perDay) || 0) - dayReqsUsed(ledger, day)); }

// Pending (and optionally retry-failed) work ids, in the order given by `orderedIds`
// (so the caller controls tiering — e.g. known-era first). Excludes done/skipped and,
// by default, deferred-giant (processed in a separate giant pass).
function pendingWorks(ledger, orderedIds, opts) {
  const o = opts || {};
  const includeFailed = o.includeFailed !== false; // retry failed by default
  const includeGiant = !!o.includeGiant;
  const out = [];
  for (const id of orderedIds) {
    const w = ledger.works[String(id)];
    if (!w || w.status === STATUS.PENDING) { out.push(String(id)); continue; }
    if (w.status === STATUS.FAILED && includeFailed) { out.push(String(id)); continue; }
    if (w.status === STATUS.DEFERRED && includeGiant) { out.push(String(id)); continue; }
  }
  return out;
}

function stats(ledger) {
  const s = { total: 0, pending: 0, done: 0, failed: 0, deferredGiant: 0, skipped: 0, segments: 0, reqs: 0, niqqud: 0, ru_filled: 0 };
  for (const id in ledger.works) {
    const w = ledger.works[id]; s.total++;
    if (w.status === STATUS.PENDING) s.pending++;
    else if (w.status === STATUS.DONE) s.done++;
    else if (w.status === STATUS.FAILED) s.failed++;
    else if (w.status === STATUS.DEFERRED) s.deferredGiant++;
    else if (w.status === STATUS.SKIPPED) s.skipped++;
    s.segments += Number(w.segments || 0); s.reqs += Number(w.reqs || 0);
    s.niqqud += Number(w.niqqud || 0); s.ru_filled += Number(w.ru_filled || 0);
  }
  return s;
}

module.exports = {
  LEDGER_VERSION, STATUS, emptyLedger, loadLedger, saveLedger, seedLedger,
  markDone, markFailed, markDeferredGiant, markSkipped, setStatus,
  recordReqs, dayReqsUsed, dayQuotaRemaining, pendingWorks, stats,
};
