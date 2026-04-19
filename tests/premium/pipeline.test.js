"use strict";

// Pipeline-level tests for provider dispatch, retry, and fallback.
// These cover the behavior Phase 2.5.4 cares about:
//   - normal char accounting on gcp success
//   - quota errors surface with no auto-fallback
//   - transient errors retry once, then fall back to madlad
//   - config errors don't retry
//   - unknown-kind errors don't fall back
//   - madlad provider bypasses gcp
//   - doc-cache hit short-circuits before any provider call
//   - BAD_INPUT short-circuits before any provider call
//
// Strategy: the pipeline captures its dependencies as module singletons
// (gcpProvider, pythonClient, quota, cacheRepo, etc.). We mutate those
// singletons' methods at test time so the pipeline sees our stubs.

const path = require("node:path");
const os   = require("node:os");
const fs   = require("node:fs");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Quota file must be isolated BEFORE requiring quota.js (it snapshots the env at load).
process.env.PREMIUM_QUOTA_FILE = path.join(os.tmpdir(), `pipeline-qta-${process.pid}.json`);
process.env.GCP_FREE_TIER_CHARS = "10000";
try { fs.unlinkSync(process.env.PREMIUM_QUOTA_FILE); } catch (_) {}

const cacheRepo     = require("../../db/translationCacheRepo");
const overridesRepo = require("../../db/translationOverridesRepo");
const historyRepo   = require("../../db/translationHistoryRepo");
const gcpProvider   = require("../../db/premium/providers/gcp");
const pythonClient  = require("../../db/premium/pythonClient");
const quota         = require("../../db/premium/quota");

const pipeline = require("../../db/premium/pipeline");

// Save real recordGcpUsage before beforeEach stubs overwrite it.
// Tests that need to assert quota file state restore this reference.
const _realRecordGcpUsage = quota.recordGcpUsage;

let docCacheStore, segCacheStore;
let gcpCalls, pyNakdanCalls, pyTranslateCalls, quotaCalls;

function resetRepos() {
  docCacheStore = new Map();
  segCacheStore = new Map();

  cacheRepo.getDocByKey = async (key) => docCacheStore.get(key) || null;
  cacheRepo.putDoc      = async (doc) => {
    docCacheStore.set(doc.cacheKey, {
      rows: doc.rows,
      created_at: new Date().toISOString(),
      provider: doc.provider,
      target_lang: doc.targetLang,
      segmenter_version: doc.segmenterVersion,
      nikud_version: doc.nikudVersion,
      translit_profile: doc.translitProfile,
      translator_version: doc.translatorVersion,
    });
  };
  cacheRepo.getSegments = async (keys) => {
    const m = new Map();
    for (const k of keys) if (segCacheStore.has(k)) m.set(k, segCacheStore.get(k));
    return m;
  };
  cacheRepo.putSegment  = async (seg) => {
    segCacheStore.set(seg.cacheKey, { he_niqqud: seg.heNiqqud, translit: seg.translit, ru: seg.ru });
  };

  overridesRepo.lookupByHashes = async () => new Map();
  historyRepo.append = async () => {};
}

function resetStubs() {
  gcpCalls = [];
  pyNakdanCalls = [];
  pyTranslateCalls = [];
  quotaCalls = [];

  gcpProvider.isAvailable = () => true;
  gcpProvider.translateBatch = async (segs) => {
    gcpCalls.push({ segs: segs.map(s => s.he), call_n: gcpCalls.length + 1 });
    return {
      results: segs.map(s => ({ index: s.index, ru: `GCP[${s.he}]` })),
      model_version: "gcp-translate-v3-nmt",
      chars: segs.reduce((a, s) => a + (s.he ? s.he.length : 0), 0),
    };
  };

  pythonClient.nakdan = async (texts) => {
    pyNakdanCalls.push({ texts: texts.slice() });
    return {
      ok: true,
      status: 200,
      body: {
        results: texts.map(t => `${t}[niqqud]`),
        model_version: "dictabert-test",
      },
    };
  };
  pythonClient.translate = async (segs) => {
    pyTranslateCalls.push({ segs: segs.map(s => s.he), call_n: pyTranslateCalls.length + 1 });
    return {
      ok: true,
      status: 200,
      body: {
        results: segs.map(s => ({ index: s.index, ru: `MADLAD[${s.he}]` })),
        model_version: "madlad-test",
      },
    };
  };

  quota.recordGcpUsage = (args) => { quotaCalls.push(args); };
}

beforeEach(() => {
  resetRepos();
  resetStubs();
});

// ---------------------------------------------------------------------------

test("gcp happy path: rows stamped by gcp, chars recorded, no fallback", async () => {
  const text = "שלום עולם.";
  const out = await pipeline.translateTable({ text, provider: "gcp", target_lang: "ru" });

  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].ru, `GCP[${text}]`);
  assert.equal(out.rows[0].he, text);
  assert.equal(out.provenance.provider, "gcp");
  assert.equal(out.provenance.actual_provider, undefined, "no fallback occurred");
  assert.equal(out.provenance.fallback_reason, undefined);
  assert.equal(gcpCalls.length, 1);
  assert.equal(pyTranslateCalls.length, 0, "madlad not touched on gcp success");
  assert.equal(pyNakdanCalls.length, 1, "nikud sidecar was called for niqqud");
  assert.equal(quotaCalls.length, 1);
  assert.equal(quotaCalls[0].chars, text.length);
  assert.equal(quotaCalls[0].error, undefined);
});

test("gcp quota error does NOT trigger madlad fallback and records kind=quota", async () => {
  gcpProvider.translateBatch = async () => {
    const e = new Error("gcp quota");
    e.provider = "gcp";
    e.upstream = "translate";
    e.kind = "quota";
    e.fallbackable = false;
    throw e;
  };

  await assert.rejects(
    pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" }),
    (err) => {
      assert.equal(err.kind, "quota");
      assert.equal(err.provider, "gcp");
      return true;
    }
  );

  assert.equal(pyTranslateCalls.length, 0, "no madlad fallback on quota error");
  assert.equal(quotaCalls.length, 1);
  assert.equal(quotaCalls[0].chars, 0);
  assert.equal(quotaCalls[0].error && quotaCalls[0].error.kind, "quota");
});

test("transient retry succeeds on the second attempt (no madlad, one quota debit)", async () => {
  let n = 0;
  gcpProvider.translateBatch = async (segs) => {
    n++;
    if (n === 1) {
      const e = new Error("gcp 503");
      e.provider = "gcp"; e.upstream = "translate";
      e.kind = "transient"; e.fallbackable = true;
      throw e;
    }
    return {
      results: segs.map(s => ({ index: s.index, ru: `GCP-RETRY[${s.he}]` })),
      model_version: "gcp-translate-v3-nmt",
      chars: segs.reduce((a, s) => a + s.he.length, 0),
    };
  };

  const out = await pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" });
  assert.equal(n, 2, "gcp called twice");
  assert.equal(pyTranslateCalls.length, 0, "no madlad when retry wins");
  assert.equal(out.rows[0].ru, "GCP-RETRY[שלום עולם.]");
  assert.equal(out.provenance.actual_provider, undefined);
  assert.equal(quotaCalls.length, 1);
  assert.equal(quotaCalls[0].chars, "שלום עולם.".length);
});

test("transient twice → falls back to madlad with fallback_reason", async () => {
  let n = 0;
  gcpProvider.translateBatch = async () => {
    n++;
    const e = new Error("gcp 503");
    e.provider = "gcp"; e.upstream = "translate";
    e.kind = "transient"; e.fallbackable = true;
    throw e;
  };

  const out = await pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" });
  assert.equal(n, 2, "gcp attempted twice before giving up");
  assert.equal(pyTranslateCalls.length, 1, "madlad called exactly once");
  assert.equal(out.rows[0].ru, "MADLAD[שלום עולם.]");
  assert.equal(out.provenance.provider, "gcp", "requested provider preserved");
  assert.equal(out.provenance.actual_provider, "madlad");
  assert.equal(out.provenance.fallback_reason, "transient");
  assert.equal(quotaCalls.length, 0, "no quota debit when gcp never produces chars");
});

test("config error (provider not available) throws without retry or fallback", async () => {
  gcpProvider.isAvailable = () => false;

  await assert.rejects(
    pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" }),
    (err) => {
      assert.equal(err.kind, "config");
      assert.equal(err.provider, "gcp");
      return true;
    }
  );

  assert.equal(gcpCalls.length, 0);
  assert.equal(pyTranslateCalls.length, 0);
  assert.equal(quotaCalls.length, 0);
});

test("unknown-kind error does NOT fall back (fallbackable=false)", async () => {
  gcpProvider.translateBatch = async () => {
    const e = new Error("gcp weird");
    e.provider = "gcp"; e.upstream = "translate";
    e.kind = "unknown"; e.fallbackable = false;
    throw e;
  };

  await assert.rejects(
    pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" }),
    (err) => { assert.equal(err.kind, "unknown"); return true; }
  );

  assert.equal(pyTranslateCalls.length, 0, "no fallback on unknown kind");
  assert.equal(quotaCalls.length, 0);
});

test("provider=madlad bypasses gcp entirely", async () => {
  const out = await pipeline.translateTable({ text: "שלום עולם.", provider: "madlad" });

  assert.equal(gcpCalls.length, 0);
  assert.equal(pyTranslateCalls.length, 1);
  assert.equal(out.rows[0].ru, "MADLAD[שלום עולם.]");
  assert.equal(out.provenance.provider, "madlad");
  assert.equal(out.provenance.actual_provider, undefined);
  assert.equal(quotaCalls.length, 0, "madlad never debits the gcp quota");
});

test("doc cache hit short-circuits: no provider calls on the second run", async () => {
  const text = "שלום עולם.";
  await pipeline.translateTable({ text, provider: "gcp" });

  // Reset counters; keep the populated caches.
  gcpCalls = []; pyNakdanCalls = []; pyTranslateCalls = []; quotaCalls = [];

  const out = await pipeline.translateTable({ text, provider: "gcp" });
  assert.equal(out.fromCache, true);
  assert.equal(out.provenance.cache_level, "doc");
  assert.equal(gcpCalls.length, 0);
  assert.equal(pyNakdanCalls.length, 0);
  assert.equal(pyTranslateCalls.length, 0);
  assert.equal(quotaCalls.length, 0);
});

test("BAD_INPUT: empty text rejects before any provider is touched", async () => {
  await assert.rejects(
    pipeline.translateTable({ text: "   ", provider: "gcp" }),
    (err) => { assert.equal(err.code, "BAD_INPUT"); return true; }
  );
  assert.equal(gcpCalls.length, 0);
  assert.equal(pyNakdanCalls.length, 0);
  assert.equal(pyTranslateCalls.length, 0);
});

test("BAD_INPUT: unsupported provider rejects before any provider is touched", async () => {
  await assert.rejects(
    pipeline.translateTable({ text: "שלום עולם.", provider: "notreal" }),
    (err) => { assert.equal(err.code, "BAD_INPUT"); return true; }
  );
  assert.equal(gcpCalls.length, 0);
  assert.equal(pyNakdanCalls.length, 0);
  assert.equal(pyTranslateCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 5.4 additions: quota HTTP status propagation + near_limit transition
// ---------------------------------------------------------------------------

test("quota error (HTTP 429): err.status propagated and quota state records kind=quota, no madlad", async () => {
  // Use real quota accounting so we can assert the persisted state, not just the stub spy.
  quota._resetForTest();
  quota.recordGcpUsage = _realRecordGcpUsage;

  gcpProvider.translateBatch = async () => {
    const e = new Error("GCP quota exceeded (HTTP 429)");
    e.provider = "gcp"; e.upstream = "translate";
    e.status = 429; e.kind = "quota"; e.fallbackable = false;
    throw e;
  };

  await assert.rejects(
    pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" }),
    (err) => {
      assert.equal(err.kind, "quota");
      assert.equal(err.status, 429, "HTTP status must be preserved on the thrown error");
      return true;
    }
  );

  assert.equal(pyTranslateCalls.length, 0, "no madlad fallback on HTTP 429 quota error");

  const st = quota.getGcpStatus();
  assert.equal(st.chars, 0, "no chars debited when gcp throws quota error");
  assert.equal(st.lastError && st.lastError.kind, "quota", "quota error must be persisted to quota state");
});

test("near_limit: gcp call that crosses 90% threshold flips near_limit in quota state", async () => {
  // Use real quota accounting so we can observe the near_limit transition.
  quota._resetForTest();
  quota.recordGcpUsage = _realRecordGcpUsage;

  // Pre-seed to 89% (8900/10000) — near_limit must be false at this point.
  _realRecordGcpUsage({ chars: 8900 });
  assert.equal(quota.getGcpStatus().near_limit, false, "sanity: 89% is below near_limit threshold");

  // GCP returns 200 chars → cumulative 9100/10000 = 91%, crosses the 90% threshold.
  gcpProvider.translateBatch = async (segs) => ({
    results: segs.map(s => ({ index: s.index, ru: `GCP[${s.he}]` })),
    model_version: "gcp-translate-v3-nmt",
    chars: 200,
  });

  await pipeline.translateTable({ text: "שלום עולם.", provider: "gcp" });

  const st = quota.getGcpStatus();
  assert.ok(st.near_limit, "near_limit must flip true after cumulative chars cross 90%");
  assert.ok(st.chars >= 9100, `expected >=9100 chars recorded, got ${st.chars}`);
});
