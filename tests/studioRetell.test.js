"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SR = require("../public/js/studio-retell.js");
const IR = require("../ingest/retell.js");
const RM = require("../public/js/reader-morph.js");

test("LEVELS клиент/сервер совпадают ПО ПОСТРОЕНИЮ (config-string-match)", () => {
  assert.deepEqual(SR.LEVELS, IR.LEVELS);
});

test("estimateRetellCost: копейки на статье, ≤$0.05 на 100К символов; usd≥0.01 для лейбла", () => {
  const small = SR.estimateRetellCost(4000);   // статья
  const big = SR.estimateRetellCost(100000);   // потолок входа (≈48.5К ток., замер long-probe $0.027)
  assert.ok(small.usd >= 0.01 && small.usd <= 0.02, JSON.stringify(small));
  assert.ok(big.usd >= 0.02 && big.usd <= 0.05, JSON.stringify(big));
  assert.ok(big.seconds >= 20 && big.seconds <= 60);
});

test("buildRetellPassport: kind retell, snapshot = ПЕРЕСКАЗ, без audio/captions, derivedFrom собран", () => {
  const p = SR.buildRetellPassport({
    originLabel: "מאמר על חינוך", importKind: "url", importSource: "https://ex.am/a",
    savedTextId: "t-123", savedTitle: "Статья", level: "B1",
    model: "gemini-flash-latest", retellText: "משפט אחד.\nמשפט שני.",
    coverage: { before: 0.61, after: 0.84, zone: "in" },
  });
  assert.equal(p.kind, "retell");
  assert.equal(p.method, "gemini-retell");
  assert.equal(p.textSnapshot, "משפט אחד.\nמשפט שני.");   // снимок = пересказ, иначе edited врёт
  assert.equal(p.audio, undefined);                        // R11: медиа-паспорт НЕ наследуется
  assert.equal(p.captions, undefined);
  assert.equal(p.retell.v, 1);
  assert.equal(p.retell.level, "B1");
  assert.equal(p.retell.derivedFrom.textId, "t-123");
  assert.equal(p.retell.derivedFrom.importKind, "url");
  assert.equal(p.retell.coverage.after, 0.84);
  assert.ok(p.at && p.warnings.length === 0);
});

test("aggregateCoverage: токен-взвешенная доля знакомого + зона; пусто/нет знаний → null", () => {
  const cfg = { KNOWN_STATES: { known: true, l2: true }, classifyZone: (c) => (c >= 0.9 ? "easy" : c >= 0.7 ? "in" : "hard") };
  const items = [{ key: "pid:1", freq: 8 }, { key: "pid:2", freq: 1 }, { key: "שלום#noun", freq: 1 }];
  const r = SR.aggregateCoverage(items, { "pid:1": "known", "pid:2": "new" }, cfg);
  assert.equal(r.tokens, 10);
  assert.equal(r.knownTok, 8);
  assert.equal(r.pct, 0.8);
  assert.equal(r.zone, "in");
  assert.equal(SR.aggregateCoverage([], { "pid:1": "known" }, cfg), null);
  assert.equal(SR.aggregateCoverage(items, {}, cfg), null); // пустой профиль → честно нет цифры
});

test("collectTypeFreq: иврит-типы без огласовок, функциональные слова отфильтрованы functionGate", () => {
  const items = SR.collectTypeFreq("הילד אכל תפוח. הילד רץ אל הבית.", RM);
  const map = Object.fromEntries(items.map((i) => [i.surface, i.freq]));
  assert.equal(map["הילד"], 2);          // контент-слово, 2 употребления
  assert.equal(map["תפוח"], 1);
  assert.equal(map["אל"], undefined);    // предлог — functionGate isFunc → исключён
  assert.ok(items.every((i) => i.freq >= 1 && /[א-ת]/.test(i.surface)));
});

test("collectTypeFreq: пустой/неивритский текст → []", () => {
  assert.deepEqual(SR.collectTypeFreq("", RM), []);
  assert.deepEqual(SR.collectTypeFreq("hello world 123", RM), []);
});

// ---- fix1 (code review 2026-07-29): race-safe coverage paint in openFromComposer() ----------
// Bug: the .then(function (c) { if (c && pendingSource) {...} }) callback checked pendingSource's
// TRUTHINESS, not the identity of THIS call's source. estimateTextCoverage() is slow (OPFS +
// resolver loop) — open text A, close (or reopen with text B) BEFORE A's promise settles, and
// A's stale resolve would paint ITS coverage number over B's, onto the WRONG text (R11-class:
// wrong-source data silently presented as current). Fix: capture `var mySrc = pendingSource;`
// right after assignment and check `pendingSource === mySrc` in the callback.
//
// This function is browser-only (bare `document`/`window`/`localStorage` reads, `estimateText-
// Coverage`'s internal RM/CorpusVocab/_ldb() calls) — it cannot be driven with real reader-
// morph.js without also faking OPFS/IndexedDB. Rather than skip coverage, we shim a minimal DOM +
// window (same technique as tests/studioYtPlayer.test.js's installBrowserMocks()) with FAKE
// ReaderMorph/CorpusVocab/ensureLocalDB — no real morphology needed, since the race lives purely
// in the .then() ordering, not in the resolver's correctness (that part is already covered by the
// collectTypeFreq/aggregateCoverage pure-function tests above).
const STUDIO_RETELL_PATH = require.resolve("../public/js/studio-retell.js");

function makeRetellEl(overrides) {
  return Object.assign({ value: "", textContent: "", hidden: true,
    classList: { add() {}, remove() {} } }, overrides || {});
}

// Deferred-per-call window.ensureLocalDB(): each _ldb() call gets its OWN controllable promise,
// so the test can resolve a LATER call's DB lookup before an EARLIER (stale) one — reproducing
// "close and reopen with different text before the first coverage promise settles" deterministically.
function installRetellRaceMocks() {
  const els = {
    inputText: makeRetellEl(),
    v3RetellCost: makeRetellEl(),
    v3RetellStatus: makeRetellEl(),
    v3RetellCovNow: makeRetellEl({ hidden: true }),
    v3RetellLevel: makeRetellEl({ options: [], appendChild(o) { this.options.push(o); } }),
    v3RetellModal: makeRetellEl(),
  };
  global.document = {
    getElementById: (id) => els[id] || null,
    createElement: () => makeRetellEl(),
  };
  global.localStorage = { getItem: () => null, setItem() {} };
  const dbCalls = [];
  global.window = {
    ReaderMorph: {
      stripNiqqud: (s) => s,
      functionGate: () => ({ isFunc: false }), // nothing is a function-word — keep every token
      ensureEngine: async () => ({ NA: {} }),
      resolveCore: async (eng, surface) => ({ surface }), // any surface "resolves" to a truthy card
      statusKeyForCard: (NA, card, niqqud, surface) => surface, // key by surface — trivial knownMap
    },
    CorpusVocab: {
      CFG: { KNOWN_STATES: { known: true } },
      classifyZone: (pct) => (pct >= 0.99 ? "easy" : "hard"),
    },
    ensureLocalDB: () => {
      const d = {};
      d.promise = new Promise((resolve) => { d.resolve = resolve; });
      dbCalls.push(d);
      return d.promise;
    },
  };
  return { els, dbCalls };
}

function uninstallRetellRaceMocks() {
  delete global.window;
  delete global.document;
  delete global.localStorage;
}

function tick(ms) { return new Promise((r) => setTimeout(r, ms || 5)); }

test("openFromComposer: stale coverage promise (text A) must NOT overwrite the CURRENT text's (B) coverage line (fix1 race-guard)", async () => {
  const { els, dbCalls } = installRetellRaceMocks();
  try {
    const SRfresh = require(STUDIO_RETELL_PATH); // same cached instance — module state (pendingSource) is fine to share, this test owns the whole sequence

    // Open A: two fully-known words → coverage should resolve to pct=1.0, zone="easy" — IF it
    // ever gets to paint, which (correctly) it must not, since B supersedes it before it settles.
    els.inputText.value = "אבא אמא";
    SRfresh.openFromComposer();
    assert.equal(dbCalls.length, 1, "A's estimateTextCoverage must have reached _ldb()");

    // User closes, then reopens with a DIFFERENT text B before A's DB lookup ever resolves.
    SRfresh.close();
    els.inputText.value = "ילד ילדה";
    SRfresh.openFromComposer();
    assert.equal(dbCalls.length, 2, "B's estimateTextCoverage must have reached its OWN _ldb()");

    // B resolves FIRST (one word known, one not → pct=0.5, zone="hard").
    dbCalls[1].resolve({ getKnownWordStates: async () => ({ ילד: "known", ילדה: "new" }) });
    await tick();
    const bText = els.v3RetellCovNow.textContent;
    assert.match(bText, /~50%/, "B's coverage must have painted: " + bText);
    assert.match(bText, /hard/);
    assert.equal(els.v3RetellCovNow.hidden, false);

    // NOW A's stale promise finally resolves (100% known — a completely different number).
    dbCalls[0].resolve({ getKnownWordStates: async () => ({ אבא: "known", אמא: "known" }) });
    await tick();

    // The display must still show B's numbers — A's late resolve must be a silent no-op.
    assert.equal(els.v3RetellCovNow.textContent, bText,
      "stale A resolve must NOT overwrite the current (B) coverage line");
    assert.doesNotMatch(els.v3RetellCovNow.textContent, /~100%/, "A's number must never appear");
  } finally {
    uninstallRetellRaceMocks();
  }
});

// ---- Task 6: run() — fetch call, confirm gate, landing, passport, race-guard --------------
// run() is browser-only (fetch/document/window/localStorage + estimateTextCoverage's OPFS
// chain), so it is shimmed the same way as the fix1 race test above: a minimal DOM + window,
// plus fake ReaderMorph/CorpusVocab/ensureLocalDB (coverage resolves immediately here — the
// scenarios below race the FETCH call, not the coverage estimate, which fix1 already covers).
function fakeResponse(ok, jsonBody) {
  return { ok: ok, json: async () => jsonBody };
}

function installRetellRunMocks(opts) {
  opts = opts || {};
  const els = {
    inputText: makeRetellEl({ value: "", dispatchEvent() {} }),
    v3RetellCost: makeRetellEl(),
    v3RetellStatus: makeRetellEl(),
    v3RetellCovNow: makeRetellEl({ hidden: true }),
    v3RetellLevel: makeRetellEl({ value: opts.level || "B1", options: [], appendChild(o) { this.options.push(o); } }),
    v3RetellModal: makeRetellEl(),
    v3RetellGo: makeRetellEl({ disabled: false }),
  };
  const classListCalls = [];
  els.v3RetellModal.classList = {
    add: (c) => classListCalls.push(["add", c]),
    remove: (c) => classListCalls.push(["remove", c]),
  };
  global.document = {
    getElementById: (id) => els[id] || null,
    createElement: () => makeRetellEl(),
  };
  global.localStorage = { getItem: () => null, setItem() {} };
  const toastCalls = [];
  const confirmCalls = [];
  const sessionSetCalls = [];
  global.window = {
    ReaderMorph: {
      stripNiqqud: (s) => s,
      functionGate: () => ({ isFunc: false }),
      ensureEngine: async () => ({ NA: {} }),
      resolveCore: async (eng, surface) => ({ surface }),
      statusKeyForCard: (NA, card, niqqud, surface) => surface,
    },
    CorpusVocab: {
      CFG: { KNOWN_STATES: { known: true } },
      classifyZone: (pct) => (pct >= 0.99 ? "easy" : "hard"),
    },
    // empty profile → aggregateCoverage's anyKnown-guard → null (honest no-number), unless a
    // test explicitly wants a real coverage line (covNow/covAfter tested separately above).
    ensureLocalDB: async () => ({ getKnownWordStates: async () => ({}) }),
    geminiKeyGet: () => (opts.key !== undefined ? opts.key : "AIzaFAKEKEYFORTEST00000000000000000"),
    confirm: (msg) => { confirmCalls.push(msg); return opts.confirmReturns !== undefined ? opts.confirmReturns : true; },
    showToast: (msg, kind) => { toastCalls.push({ msg: msg, kind: kind }); },
    v3SessionGet: () => (opts.session !== undefined ? opts.session : null),
    v3SessionSet: (patch) => { sessionSetCalls.push(patch); },
    v3LastImportMeta: null,
  };
  const fetchCalls = [];
  global.fetch = (url, init) => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    fetchCalls.push({ url: url, init: init, resolve: resolve });
    return promise;
  };
  return { els, fetchCalls, confirmCalls, toastCalls, sessionSetCalls, classListCalls };
}

function uninstallRetellRunMocks() {
  delete global.window;
  delete global.document;
  delete global.localStorage;
  delete global.fetch;
}

test("run(): no key → honest disabled-status, no fetch/confirm/landing (Step 5 no-key scenario)", async () => {
  const mocks = installRetellRunMocks({ key: "" });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט מקורי";
    SRfresh.openFromComposer();
    await SRfresh.run();
    assert.equal(mocks.fetchCalls.length, 0, "no key → must never call the endpoint");
    assert.equal(mocks.confirmCalls.length, 0);
    assert.match(mocks.els.v3RetellStatus.textContent, /Gemini|BYOK|ключ/i);
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): happy path — lands retell text, builds retell passport, resets session to a NEW draft, closes modal, toasts coverage", async () => {
  const mocks = installRetellRunMocks({ session: null }); // unsaved-original scenario
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט מקורי לפני פישוט";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    assert.equal(mocks.fetchCalls.length, 1, "run() must call the endpoint synchronously up to the first await");
    assert.equal(mocks.els.v3RetellGo.disabled, true, "Go must be disabled while working");
    const body = JSON.parse(mocks.fetchCalls[0].init.body);
    assert.equal(body.text, "טקסט מקורי לפני פישוט");
    assert.equal(body.level, "B1");
    assert.equal(body.geminiApiKey, "AIzaFAKEKEYFORTEST00000000000000000");

    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט אחרי", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 1, "must confirm before replacing the field");
    assert.match(mocks.confirmCalls[0], /Оригинал НЕ сохранён/, "unsaved-original wording when session has no baseTextId/textId");
    assert.equal(mocks.els.inputText.value, "טקסט פשוט אחרי", "retell must land in the composer");

    const im = global.window.v3LastImportMeta;
    assert.equal(im.kind, "retell");
    assert.equal(im.method, "gemini-retell");
    assert.equal(im.textSnapshot, "טקסט פשוט אחרי");
    assert.equal(im.retell.level, "B1");
    assert.equal(im.retell.derivedFrom.textId, null);

    assert.equal(mocks.sessionSetCalls.length, 1);
    assert.deepEqual(mocks.sessionSetCalls[0], { textId: null, baseTextId: null, mode: "draft", title: null });

    assert.ok(mocks.classListCalls.some((c) => c[0] === "add" && c[1] === "hidden"), "modal must close on landing");
    assert.equal(mocks.toastCalls.length, 1);
    assert.equal(mocks.toastCalls[0].kind, "success");
    assert.equal(mocks.els.v3RetellGo.disabled, false, "Go re-enabled after landing");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): server error_code maps through ERROR_KEY to a status message, re-enables Go, never touches the composer", async () => {
  const mocks = installRetellRunMocks();
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(false, { ok: false, error_code: "GEMINI_KEY_REJECTED" }));
    await p;

    assert.equal(mocks.confirmCalls.length, 0, "must never confirm on a failed call");
    assert.equal(mocks.els.inputText.value, "טקסט", "composer must be untouched on failure");
    assert.equal(mocks.els.v3RetellGo.disabled, false, "Go re-enabled after failure");
    assert.notEqual(mocks.els.v3RetellStatus.textContent, "", "failure must surface a status message, never silent");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): race-guard — closing the modal (Cancel) while the fetch is in flight must NOT land the stale retell, confirm, or touch status", async () => {
  const mocks = installRetellRunMocks();
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט מקורי";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    assert.equal(mocks.fetchCalls.length, 1);

    // User hits Cancel (or backdrop) WHILE the request is still in flight.
    SRfresh.close();
    const statusBeforeStaleResolve = mocks.els.v3RetellStatus.textContent;

    // The (now-abandoned) request finally resolves successfully — this must be a silent no-op:
    // no confirm(), no composer overwrite, no status/Go-button mutation belonging to a closed
    // modal instance (same race-guard idiom as openFromComposer's fix1 above, extended to run()).
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "STALE RESULT — must never appear", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 0, "stale resolve must never prompt confirm()");
    assert.equal(mocks.els.inputText.value, "טקסט מקורי", "stale retell must NEVER land in the composer");
    assert.equal(mocks.els.v3RetellStatus.textContent, statusBeforeStaleResolve,
      "stale resolve must not repaint a status line that no longer belongs to it");
    assert.equal(global.window.v3LastImportMeta, null, "no passport must be built from a stale/abandoned run()");
    assert.equal(mocks.sessionSetCalls.length, 0);
  } finally {
    uninstallRetellRunMocks();
  }
});
