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
  // fix1-T6 round: deferDb (opt-in) makes ensureLocalDB() return its OWN controllable promise
  // PER CALL (dbCalls[]), same technique as installRetellRaceMocks() above — needed to pause
  // run() mid-`await estimateTextCoverage(...)` (AFTER a successful fetch) so a test can call
  // close() into that exact window (fix-round Important #3).
  const dbCalls = [];
  const ensureLocalDBImpl = opts.deferDb
    ? () => {
        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        dbCalls.push({ promise: promise, resolve: resolve });
        return promise;
      }
    : async () => ({ getKnownWordStates: async () => ({}) });
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
    ensureLocalDB: ensureLocalDBImpl,
    geminiKeyGet: () => (opts.key !== undefined ? opts.key : "AIzaFAKEKEYFORTEST00000000000000000"),
    confirm: (msg) => { confirmCalls.push(msg); return opts.confirmReturns !== undefined ? opts.confirmReturns : true; },
    showToast: (msg, kind) => { toastCalls.push({ msg: msg, kind: kind }); },
    v3SessionGet: () => (opts.session !== undefined ? opts.session : null),
    v3SessionSet: (patch) => { sessionSetCalls.push(patch); },
    v3LastImportMeta: opts.priorImportMeta !== undefined ? opts.priorImportMeta : null,
  };
  // fix2 (final-review Important 1, design §4.3): window.v3RetellSavedTextInfo is the index.html
  // bridge to {textId, sourceText} of the active SAVED card. Present by default (returning
  // opts.savedInfo, or null when a test doesn't care) so existing session-id tests must OPT IN
  // with matching savedInfo to keep getting the "saved" branch — mirrors the real contract: a
  // session id alone is no longer enough. opts.noSavedInfoBridge omits the property entirely, to
  // exercise the "bridge missing → fail conservative" path.
  if (!opts.noSavedInfoBridge) {
    global.window.v3RetellSavedTextInfo = () => (opts.savedInfo !== undefined ? opts.savedInfo : null);
  }
  const fetchCalls = [];
  global.fetch = (url, init) => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    fetchCalls.push({ url: url, init: init, resolve: resolve });
    return promise;
  };
  return { els, fetchCalls, confirmCalls, toastCalls, sessionSetCalls, classListCalls, dbCalls };
}

function uninstallRetellRunMocks() {
  delete global.window;
  delete global.document;
  delete global.localStorage;
  delete global.fetch;
}

// Resolves every not-yet-resolved entry in a deferDb dbCalls[] array, round by round, ticking
// the event loop between rounds — needed because run()'s covBefore→covAfter chain is
// SEQUENTIAL: estimateTextCoverage(data.retell) (covAfter) is only CALLED once covBeforeP
// settles, so its own _ldb() call (and dbCalls entry) doesn't exist until a round AFTER
// covBeforeP's entry is resolved.
async function pumpDbCalls(dbCallsArr, rounds) {
  const resolvedIdx = new Set();
  for (let r = 0; r < (rounds || 6); r++) {
    for (let i = 0; i < dbCallsArr.length; i++) {
      if (!resolvedIdx.has(i)) {
        resolvedIdx.add(i);
        dbCallsArr[i].resolve({ getKnownWordStates: async () => ({}) });
      }
    }
    await tick();
  }
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

// ---- Fix round 1 (coordinator review T6) — 3 R11-sensitive coverage gaps -------------------
// All three prior run() tests left window.v3LastImportMeta === null and session === null, so
// fromImport===true (Step 2/design §5's provenance-chain rule) and the confirmReplace (saved-
// original) wording branch were never exercised; the existing race test only aborts BEFORE the
// fetch resolves (guard #1), never during the coverage-after awaits (guard #2).

test("run(): fromImport === true — a prior import passport whose textSnapshot MATCHES the composer text propagates into retell.derivedFrom.importKind/importSource (design §5 provenance chain)", async () => {
  const originalText = "טקסט מהאינטרנט לפני פישוט";
  const mocks = installRetellRunMocks({
    session: null,
    priorImportMeta: { kind: "url", source: "https://ex.am/a", textSnapshot: originalText },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = originalText;
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    const im = global.window.v3LastImportMeta;
    assert.equal(im.kind, "retell", "run() must overwrite v3LastImportMeta with the RETELL passport");
    assert.equal(im.source, "https://ex.am/a", "originLabel must prefer the matching import's source (fromImport branch)");
    assert.equal(im.retell.derivedFrom.importKind, "url");
    assert.equal(im.retell.derivedFrom.importSource, "https://ex.am/a");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): non-matching prior import passport (textSnapshot differs from composer text) must NOT be treated as fromImport — importKind/importSource stay null", async () => {
  const mocks = installRetellRunMocks({
    session: null,
    priorImportMeta: { kind: "url", source: "https://ex.am/a", textSnapshot: "совсем другой текст, не совпадает" },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט שהוקלד ידנית";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    const im = global.window.v3LastImportMeta;
    assert.equal(im.retell.derivedFrom.importKind, null, "mismatched textSnapshot must NOT leak a stale import's kind onto this text");
    assert.equal(im.retell.derivedFrom.importSource, null);
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): saved original (session.textId set) — confirmReplace wording (NOT confirmReplaceUnsaved), derivedFrom.textId carries the saved id", async () => {
  // fix2: session id alone is no longer sufficient (final-review Important 1) — the bridge must
  // ALSO confirm textId+sourceText match the composer text, same criterion as
  // v3RestoreSavedTableIfUnchanged.
  const mocks = installRetellRunMocks({
    session: { textId: "t-1" },
    savedInfo: { textId: "t-1", sourceText: "טקסט שמור בספרייה" },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט שמור בספרייה";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 1);
    assert.match(mocks.confirmCalls[0], /Оригинал сохранён в Библиотеке/, "saved-original wording when session.textId/baseTextId is set");
    assert.doesNotMatch(mocks.confirmCalls[0], /НЕ сохранён/, "must NOT fall back to the unsaved wording");

    const im = global.window.v3LastImportMeta;
    assert.equal(im.retell.derivedFrom.textId, "t-1", "derivedFrom.textId must carry the saved original's id");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): saved original via session.baseTextId (not textId) — same confirmReplace wording, derivedFrom.textId carries baseTextId", async () => {
  // fix2: bridge must confirm textId+sourceText match — same as the session.textId test above.
  const mocks = installRetellRunMocks({
    session: { baseTextId: "base-42", textId: null },
    savedInfo: { textId: "base-42", sourceText: "טקסט שמור, נערך" },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט שמור, נערך";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.match(mocks.confirmCalls[0], /Оригинал сохранён в Библиотеке/);
    assert.equal(global.window.v3LastImportMeta.retell.derivedFrom.textId, "base-42");
  } finally {
    uninstallRetellRunMocks();
  }
});

// ---- Fix round 2 (final-review Important 1, design §4.3): savedId must NOT trust a session id
// alone. After "Импорт → В поле ввода" the session can carry a PRIOR card's baseTextId
// (v3SessionMarkDraft) — unrelated to the just-imported text. "Сохранён" requires BOTH a
// session id AND that the composer text still matches THAT card's sourceText (same criterion as
// v3RestoreSavedTableIfUnchanged), reached through window.v3RetellSavedTextInfo.

test("run(): session id present but bridge's sourceText does NOT match the composer text (stale baseTextId from a prior card) — confirmReplaceUnsaved, derivedFrom.textId===null (R9 guard)", async () => {
  const mocks = installRetellRunMocks({
    session: { baseTextId: "T1" },
    savedInfo: { textId: "T1", sourceText: "СОВЕРШЕННО ДРУГОЙ текст, чужой карточки" },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט מיובא, לא שמור";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 1);
    assert.match(mocks.confirmCalls[0], /Оригинал НЕ сохранён/, "text mismatch must fall back to the unsaved wording, NOT trust the stale session id");
    assert.doesNotMatch(mocks.confirmCalls[0], /Оригинал сохранён в Библиотеке/);

    const im = global.window.v3LastImportMeta;
    assert.equal(im.retell.derivedFrom.textId, null, "a mismatched card's textId must NEVER leak into persisted provenance (R9)");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): session id present AND bridge's sourceText matches the composer text — confirmReplace, derivedFrom.textId carries the id", async () => {
  const mocks = installRetellRunMocks({
    session: { baseTextId: "T1" },
    savedInfo: { textId: "T1", sourceText: "טקסט תואם בדיוק" },
  });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט תואם בדיוק";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 1);
    assert.match(mocks.confirmCalls[0], /Оригинал сохранён в Библиотеке/);
    assert.equal(global.window.v3LastImportMeta.retell.derivedFrom.textId, "T1");
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): session id present but window.v3RetellSavedTextInfo bridge does NOT exist — must fail conservatively (unsaved), never fall back to the old unchecked trust", async () => {
  const mocks = installRetellRunMocks({
    session: { textId: "t-9" },
    noSavedInfoBridge: true,
  });
  try {
    assert.equal(typeof global.window.v3RetellSavedTextInfo, "undefined", "test setup sanity: bridge must be genuinely absent");
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט כלשהו";
    SRfresh.openFromComposer();
    const p = SRfresh.run();
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "טקסט פשוט", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await p;

    assert.equal(mocks.confirmCalls.length, 1);
    assert.match(mocks.confirmCalls[0], /Оригинал НЕ сохранён/, "missing bridge must be treated conservatively as unsaved");
    assert.equal(global.window.v3LastImportMeta.retell.derivedFrom.textId, null);
  } finally {
    uninstallRetellRunMocks();
  }
});

test("run(): race-guard #2 — closing the modal WHILE run() is suspended inside estimateTextCoverage AFTER a successful fetch must NOT confirm/land/passport/toast", async () => {
  const mocks = installRetellRunMocks({ deferDb: true });
  try {
    const SRfresh = require(STUDIO_RETELL_PATH);
    mocks.els.inputText.value = "טקסט מקורי";
    SRfresh.openFromComposer(); // its own cov-now estimate → dbCalls[0], left pending (irrelevant here)
    const p = SRfresh.run();
    assert.equal(mocks.fetchCalls.length, 1);
    assert.equal(mocks.dbCalls.length, 2,
      "openFromComposer's cov-now (0) + run()'s covBeforeP (1) must both have reached _ldb() BEFORE the fetch even resolves");

    // Fetch succeeds — run() passes the FIRST race-guard (right after fetch/json, already
    // covered by the race test above) and suspends on `covBefore = await covBeforeP`.
    mocks.fetchCalls[0].resolve(fakeResponse(true, {
      ok: true, retell: "STALE — must never land after guard #2", model: "gemini-flash-latest",
      promptId: "p1", fromCache: true, cacheKey: "c1",
    }));
    await tick();
    assert.equal(mocks.dbCalls.length, 2,
      "covAfter's estimateTextCoverage must NOT have started yet — covBeforeP hasn't resolved, confirming we're paused exactly inside guard #2's window");

    // User hits Cancel WHILE run() is suspended INSIDE the coverage estimate — the SECOND
    // race-guard under test here (after both coverage awaits), distinct from the earlier race
    // test which aborts BEFORE the fetch even resolves (guard #1).
    SRfresh.close();
    const statusBeforeStaleResolve = mocks.els.v3RetellStatus.textContent;

    // The abandoned coverage lookups finally resolve AFTER the abort — covBeforeP's resolve
    // cascades into covAfter's OWN (later) _ldb() call, picked up by pumpDbCalls' next round.
    await pumpDbCalls(mocks.dbCalls);
    await p;

    assert.equal(mocks.confirmCalls.length, 0, "stale-after-coverage resolve must never prompt confirm()");
    assert.equal(mocks.els.inputText.value, "טקסט מקורי", "stale retell must NEVER land in the composer");
    assert.equal(mocks.els.v3RetellStatus.textContent, statusBeforeStaleResolve,
      "stale resolve must not repaint a status line that no longer belongs to it");
    assert.equal(global.window.v3LastImportMeta, null, "no passport must be built from a stale/abandoned run()");
    assert.equal(mocks.sessionSetCalls.length, 0);
    assert.equal(mocks.toastCalls.length, 0, "no success toast for a landing that never happened");
  } finally {
    uninstallRetellRunMocks();
  }
});
