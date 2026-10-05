"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const corePath = path.resolve(__dirname, "../public/js/room-b6-core.js");
const load = () => import(pathToFileURL(corePath).href);

const hostPath = path.resolve(__dirname, "../public/js/library-ui.js");
function hostFunction(name, nextMarker) {
  const source = fs.readFileSync(hostPath, "utf8");
  const start = source.indexOf("function " + name + "(");
  const end = source.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, "host function boundary: " + name);
  return source.slice(start, end);
}

function hostStateHarness(core) {
  const historyEntries = [], mirrors = [];
  const context = vm.createContext({ roomB6: core, ROOM_BROWSE_PAGE: core.ROOM_B6_LIMITS.pageSize,
    corpusFilter: {}, myCorpusState: {}, corpusNav: {}, corpusBrowseMode: "read", activeTrack: "corpus", _roomInitialState: null,
    publicCorpusBrowseStates: new Map(), groupCorpusStates: new Map(),
    history: { replaceState: (state, title, url) => historyEntries.push({ mode: "replace", state, url }) },
    localDb: new Proxy({}, { get: () => { throw new Error("presentation must not access canonical DB"); } }),
  });
  vm.runInContext(hostFunction("roomApplyStateFields", "async function roomApplyHistoryState"), context);
  const activeFilters = () => context.corpusNav.corpus === "mytexts" ? context.myCorpusState
    : context.corpusNav.corpus.startsWith("public:") ? context.publicCorpusBrowseStates.get(context.corpusNav.corpus.slice(7))
      : context.corpusNav.corpus.startsWith("group:") ? context.groupCorpusStates.get(context.corpusNav.corpus.slice(6)) : context.corpusFilter;
  context.roomCurrentPresentationState = overrides => core.sanitizePresentationState({
    surface: context.corpusNav.corpus.startsWith("group:") ? "group" : "corpus", corpus: context.corpusNav.corpus,
    mode: context.corpusBrowseMode, filters: activeFilters(), page: Math.floor((activeFilters().start || 0) / 48) + 1,
    ...overrides,
  });
  context.roomStateUrl = state => "/library.html" + core.presentationHash(state);
  context.roomStorePresentation = state => mirrors.push(core.encodeSessionMirror(state, 1000));
  context.roomPushPresentationState = () => {
    const state = context.roomCurrentPresentationState();
    historyEntries.push({ mode: "push", state, url: context.roomStateUrl(state) });
  };
  return { context, historyEntries, mirrors, activeFilters };
}

test("Back replaces selected facets with a complete earlier view for every source", async () => {
  const core = await load();
  for (const [corpus, surface] of [["benyehuda", "corpus"], ["public:physics", "corpus"], ["group:study-songs", "group"], ["mytexts", "mytexts"]]) {
    const harness = hostStateHarness(core);
    const { context, activeFilters } = harness;
    context.roomApplyStateFields({ surface, corpus, filters: { genre: "poetry", length: "short", lang: "he", theme: "nature",
      readyOnly: true, readableOnly: true, exactForm: true, hasAudio: true, reviewed: true, tags: ["private tag"], smart: "recent",
      status: "reading", audio: "partial", section: "12", provider: "gemini", scopeAuthorQid: "Q12407209", scopeEra: "modern" } });
    const earlier = core.sanitizePresentationState({ surface, corpus, filters: { q: "earlier private query", genre: "", length: "" } });
    assert.equal(earlier.filters.genre, undefined, "v1 wire sanitizer may omit empty facets");
    const restored = context.roomApplyStateFields(earlier);
    const filters = activeFilters();
    for (const key of ["genre", "length", "lang", "theme", "smart", "provider", "scopeAuthor", "scopeAuthorQid", "scopeEra"]) {
      assert.equal(filters[key], "", corpus + ": cleared " + key);
    }
    for (const key of ["readyOnly", "readableOnly", "exactForm", "hasAudio", "reviewed"]) assert.equal(filters[key], false, corpus + key);
    assert.equal(filters.tags.length, 0);
    assert.equal(filters.q, "earlier private query");
    if (corpus.startsWith("public:") || corpus.startsWith("group:")) {
      assert.equal(filters.status, "all");
      assert.equal(filters.audio, "all");
    }
    if (corpus.startsWith("public:")) assert.equal(filters.section, "all");
    assert.doesNotMatch(decodeURIComponent(core.presentationHash(restored)), /earlier|private query|private tag|status=|audio=|section=/);
    assert.equal(harness.historyEntries.length, 0, "applying a view alone does not create a history entry");
    assert.equal(harness.mirrors.length, 0);
  }
  for (const [corpus, scope, sort] of [["benyehuda", "corpus", "ready"], ["public:physics", "all", "position"],
    ["group:study-songs", "texts", "position"], ["mytexts", "texts", "opened_desc"]]) {
    const { context, activeFilters } = hostStateHarness(core);
    const restored = context.roomApplyStateFields({ surface: corpus.startsWith("group:") ? "group" : "corpus", corpus, filters: {} });
    assert.equal(activeFilters().scope, scope);
    assert.equal(activeFilters().sort, sort);
    context.roomApplyStateFields(core.decodeSessionMirror(core.encodeSessionMirror(restored, 1000), 1001));
    assert.equal(activeFilters().scope, scope, "source default survives another refresh");
    assert.equal(activeFilters().sort, sort, "source sort default survives another refresh");
  }
});

test("out-of-range page clamps once to the last real page and repairs tab state and URL", async () => {
  const core = await load();
  assert.deepEqual(core.clampBrowsePage(100000, 100), { page: 3, lastPage: 3, start: 96, end: 100, total: 100 });
  assert.deepEqual(core.clampBrowsePage(100000, 0), { page: 1, lastPage: 1, start: 0, end: 0, total: 0 });
  assert.equal(core.clampBrowsePage(2, 48).page, 1);
  assert.equal(core.clampBrowsePage(3, 96).start, 48);
  assert.equal(core.clampBrowsePage(2, 49).end, 49);
  for (const [corpus, surface] of [["benyehuda", "corpus"], ["public:study-songs", "corpus"], ["group:study-songs", "group"]]) {
    const { context, activeFilters, historyEntries, mirrors } = hostStateHarness(core);
    const restored = context.roomApplyStateFields({ surface, corpus, page: 100000, filters: { q: "private query" } });
    const window = context.roomClampPresentationPage(activeFilters(), 100);
    assert.equal(window.page, 3);
    assert.equal(activeFilters().start, 96);
    assert.equal(restored.page, 3, "the final restore store must not resurrect the invalid page");
    assert.equal(historyEntries.length, 1);
    assert.equal(historyEntries[0].mode, "replace");
    assert.equal(historyEntries[0].state.page, 3);
    const url = new URL(historyEntries[0].url, "https://example.invalid");
    assert.doesNotMatch(decodeURIComponent(url.href), /private query/);
    if (surface === "group") assert.equal(url.hash, "#room=group");
    else assert.equal(new URLSearchParams(url.hash.slice(1)).get("page"), "3");
    assert.equal(core.decodeSessionMirror(mirrors[0], 1001).page, 3);
    assert.equal(core.decodeSessionMirror(mirrors[0], 1001).filters.q, "private query");
    context.roomClampPresentationPage(activeFilters(), 100);
    assert.equal(historyEntries.length, 1, "repeated paint needs no additional correction");
  }
});

test("actual Ben paged renderer shows the final rows after an oversized restored page", async () => {
  const core = await load();
  const harness = hostStateHarness(core), { context, activeFilters, historyEntries } = harness;
  class Node {
    constructor(options = {}) { this.className = options.class || ""; this.children = []; this.handlers = {}; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children.length = 0; }
    addEventListener(kind, handler) { this.handlers[kind] = handler; }
    querySelector() { return this.children[0] || null; }
    focus() { this.focused = true; }
  }
  context.el = (tag, options) => new Node(options);
  context.tt = (key, fallback) => fallback || key;
  context.corpusReadyMap = () => new Map();
  context.corpusSearchRowToCard = row => row;
  context.renderCorpusWorkRow = card => Object.assign(new Node(), { id: card.id });
  context.window = {};
  vm.runInContext(hostFunction("appendPagedWorkRows", "// ── BRR S1/S2"), context);
  context.roomApplyStateFields({ surface: "corpus", corpus: "benyehuda", page: 100000, filters: { q: "private query" } });
  const container = new Node(), items = Array.from({ length: 100 }, (_, id) => ({ sr: { id: String(id), r: false } }));
  context.appendPagedWorkRows(container, items, null, { presentationPage: true });
  assert.deepEqual(container.children[0].children.map(node => node.id), ["96", "97", "98", "99"]);
  assert.equal(activeFilters().start, 96);
  assert.equal(historyEntries[0].state.page, 3);
  assert.equal(container.children[1].children[2].disabled, true, "last-page Next is disabled");
  container.children[1].children[0].handlers.click();
  assert.equal(activeFilters().start, 48);
  assert.equal(container.children[0].children.length, 48);
  assert.equal(container.children[0].children[0].id, "48");
  assert.equal(historyEntries.at(-1).mode, "push");
  assert.equal(historyEntries.at(-1).state.page, 2);
  const source = fs.readFileSync(hostPath, "utf8");
  assert.match(source, /roomClampPresentationPage\(browseState, found\.length\)/, "public painter uses the same actual-result clamp");
  assert.match(source, /groupBrowseOffset=roomClampPresentationPage\(state,found\.length\)\.start/, "group painter updates both its offset and stored view");
});

test("public corpus and catalog facets roundtrip without query or personal state", async () => {
  const core = await load();
  const input = { surface: "corpus", corpus: "public:study-songs", mode: "explore", page: 3,
    drill: { level: "works", eraId: "modern", authorId: "Q12407209", workId: "private-work" },
    filters: { q: "arbitrary personal words שלום", genre: "poetry", lang: "he", length: "short", theme: "nature",
      sort: "title_asc", scope: "corpus", tags: ["private-tag"], smart: "struggling", level: "private-level",
      provider: "private-provider", readyOnly: true, hasAudio: false, reviewed: true, exactForm: false,
      readableOnly: true }, anchor: { itemId: "private-local-id", rowIndex: 500 } };
  const hash = core.presentationHash(input);
  const decoded = core.presentationStateFromHash(hash);
  assert.equal(decoded.corpus, "public:study-songs");
  assert.equal(decoded.mode, "explore");
  assert.equal(decoded.page, 3);
  assert.equal(decoded.drill.authorId, "Q12407209");
  assert.equal(decoded.drill.eraId, "modern");
  assert.equal(decoded.drill.level, "works");
  for (const key of ["genre", "lang", "length", "theme", "sort", "scope", "readyOnly", "hasAudio", "reviewed", "exactForm"]) {
    assert.equal(decoded.filters[key], input.filters[key], key);
  }
  assert.equal(core.presentationHash(decoded), hash, "stable exact public projection");
  assert.equal(decoded.filters.q, "");
  assert.deepEqual(decoded.filters.tags, []);
  assert.equal(decoded.filters.smart, "");
  assert.equal(decoded.anchor.itemId, "");
  assert.equal(decoded.drill.workId, "");
  assert.doesNotMatch(decodeURIComponent(hash), /arbitrary|שלום|private-|struggling|readableOnly/);
  assert.ok(Buffer.byteLength(hash) <= core.ROOM_B6_LIMITS.presentationUrlBytes);
});

test("ordinary query stays tab-local on history restore and refresh", async () => {
  const core = await load();
  const now = Date.parse("2026-10-04T12:00:00Z");
  const earlier = core.sanitizePresentationState({ surface: "corpus", corpus: "benyehuda", filters: { q: "earlier query" } });
  const latest = core.sanitizePresentationState({ surface: "corpus", corpus: "benyehuda", filters: { q: "later query", tags: ["private tag"] } });
  const hash = core.presentationHash(latest);
  assert.equal(hash, "#room=benyehuda");
  assert.equal(core.restorePresentationState({ hash, historyState: earlier,
    sessionMirror: core.encodeSessionMirror(latest, now) }, now).filters.q, "earlier query", "Back owns its history entry");
  const refreshed = core.restorePresentationState({ hash, sessionMirror: core.encodeSessionMirror(latest, now) }, now);
  assert.equal(refreshed.filters.q, "later query");
  assert.deepEqual(refreshed.filters.tags, ["private tag"]);
  assert.equal(core.restorePresentationState({ hash }, now).filters.q, "", "a separate tab has no query");
  assert.equal(core.restorePresentationState({ hash, sessionMirror: core.encodeSessionMirror(latest, now) },
    now + core.ROOM_B6_LIMITS.sessionTtlMs + 1).filters.q, "");
});

test("explicit public navigation wins over another corpus or facet state", async () => {
  const core = await load();
  const stale = core.sanitizePresentationState({ surface: "corpus", corpus: "benyehuda", mode: "explore",
    filters: { q: "private query", genre: "poetry" } });
  assert.equal(core.restorePresentationState({ hash: "#room=public%3Astudy-songs", historyState: stale }).corpus, "public:study-songs");
  assert.equal(core.restorePresentationState({ hash: "#room=hub", historyState: stale }).surface, "hub");
  const explicit = core.restorePresentationState({ hash: "#room=benyehuda&mode=explore&genre=prose&rv=2", historyState: stale });
  assert.equal(explicit.filters.genre, "prose");
  assert.equal(explicit.filters.q, "");
});

test("author drill, unknown length and legacy opened sort preserve app state", async () => {
  const core = await load();
  const now = 1000;
  const authors = core.sanitizePresentationState({ surface: "corpus", corpus: "benyehuda", mode: "explore", page: 4,
    drill: { level: "authors", eraId: "modern" }, filters: { length: "unknown", sort: "opened" } });
  const hash = core.presentationHash(authors);
  const decoded = core.presentationStateFromHash(hash);
  assert.equal(decoded.drill.level, "authors");
  assert.equal(decoded.filters.length, "unknown");
  assert.equal(decoded.page, 4);
  assert.equal(core.presentationHash(decoded), hash);
  assert.doesNotMatch(hash, /sort=opened/, "a personal recent-open sort remains local");
  const refreshed = core.restorePresentationState({ hash, sessionMirror: core.encodeSessionMirror(authors, now) }, now);
  assert.equal(refreshed.filters.sort, "opened");
  assert.equal(refreshed.drill.level, "authors");
  for (const [corpus, surface] of [["public:study-songs", "corpus"], ["group:study-songs", "group"]]) {
    const state = core.sanitizePresentationState({ surface, corpus, page: 5, filters: { q: "tab-local query", sort: "opened" } });
    const restored = core.restorePresentationState({ hash: core.presentationHash(state),
      sessionMirror: core.encodeSessionMirror(state, now) }, now);
    assert.equal(restored.corpus, corpus);
    assert.equal(restored.page, 5);
    assert.equal(restored.filters.sort, "opened");
  }
  assert.equal(core.presentationStateFromHash("#room=benyehuda&view=era&rv=2").drill.level, "era", "legacy era drill stays decodable");
});

test("public and group status, audio and physics section filters stay tab-local", async () => {
  const core = await load();
  const now = 1000;
  for (const status of ["all", "new", "reading", "finished"]) {
    for (const audio of ["all", "full", "partial", "none", "complete", "missing"]) {
      for (const [corpus, surface] of [["public:physics", "corpus"], ["group:study-songs", "group"]]) {
        const state = core.sanitizePresentationState({ surface, corpus, filters: { q: "local words", scope: "title", status, audio, section: "12" } });
        const hash = core.presentationHash(state);
        assert.doesNotMatch(hash, /status=|audio=|section=|local/);
        const restored = core.restorePresentationState({ hash, sessionMirror: core.encodeSessionMirror(state, now) }, now);
        assert.equal(restored.filters.status, status);
        assert.equal(restored.filters.audio, audio);
        assert.equal(restored.filters.section, "12");
        assert.equal(restored.filters.scope, "title");
        assert.equal(restored.filters.q, "local words");
      }
    }
  }
  for (const section of ["all", "1", 15, "9999"]) {
    assert.equal(core.sanitizePresentationState({ filters: { section } }).filters.section, String(section));
  }
  for (const filters of [{ status: "private status" }, { audio: "private audio" }, { section: "private text" },
    { section: 0 }, { section: -1 }, { section: "01" }, { section: "10000" }, { section: "1e2" }]) {
    const sanitized = core.sanitizePresentationState({ filters }).filters;
    assert.equal(sanitized.status, undefined);
    assert.equal(sanitized.audio, undefined);
    assert.equal(sanitized.section, undefined);
  }
  const input = { surface: "corpus", corpus: "public:physics", filters: { q: "public question", scope: "all", status: "all", audio: "all", section: "all" } };
  const shared = core.sharedSearchHash(input);
  assert.ok(shared);
  assert.doesNotMatch(shared, /status=|audio=|section=/);
  assert.equal(core.presentationStateFromHash(shared).filters.scope, "all");
  assert.equal(core.presentationStateFromHash(shared).filters.q, "public question");
  for (const extra of [{ status: "reading" }, { status: "unknown-status" }, { audio: "complete" },
    { audio: "partial" }, { audio: "unknown-audio" }, { section: "12" }, { section: "unknown-section" }]) {
    assert.equal(core.sharedSearchHash({ ...input, filters: { ...input.filters, ...extra } }), null, JSON.stringify(extra));
  }
});

test("query enters a link only through explicit public search share", async () => {
  const core = await load();
  const input = { surface: "corpus", corpus: "benyehuda", mode: "explore",
    filters: { q: "Хана Сенеш שלום", scope: "fulltext", genre: "poetry", sort: "length" } };
  const ordinary = core.presentationHash({ ...input, sharedSearch: true });
  assert.doesNotMatch(decodeURIComponent(ordinary), /Хана|Сенеш|שלום|share=/, "an incidental flag cannot opt in");
  const shared = core.sharedSearchHash(input);
  assert.ok(shared);
  assert.equal(new URLSearchParams(shared.slice(1)).get("q"), input.filters.q);
  assert.equal(new URLSearchParams(shared.slice(1)).get("share"), "1");
  const decoded = core.presentationStateFromHash(shared);
  assert.equal(decoded.filters.q, input.filters.q);
  assert.equal(decoded.filters.scope, "fulltext");
  assert.equal(decoded.sharedSearch, true);
  const previous = core.sanitizePresentationState({ ...input, surface: "reader",
    filters: { ...input.filters, q: "old query", tags: ["old personal tag"], smart: "recent" },
    anchor: { itemId: "private-reader", rowIndex: 900 } });
  const restored = core.restorePresentationState({ hash: shared, historyState: previous });
  assert.equal(restored.surface, "corpus");
  assert.equal(restored.filters.q, input.filters.q);
  assert.deepEqual(restored.filters.tags, []);
  assert.equal(restored.filters.smart, "");
  assert.equal(restored.anchor.itemId, "");
  assert.equal(core.presentationStateFromHash("#room=benyehuda&q=unconsented").filters.q, "");
});

test("private and personal search scopes never produce a share link", async () => {
  const core = await load();
  const base = { surface: "corpus", corpus: "benyehuda", filters: { q: "private words", scope: "texts" } };
  const privateCases = [
    { corpus: "mytexts" }, { corpus: "group:secret-team" }, { corpus: "private:team" },
    { surface: "mytexts" }, { surface: "group" }, { surface: "hub" },
    { filters: { ...base.filters, scope: "notes" } }, { filters: { ...base.filters, scope: "both" } },
    { filters: { ...base.filters, scope: "rows" } }, { filters: { ...base.filters, scope: "notes+rows" } },
    { filters: { ...base.filters, scope: "private" } }, { filters: { ...base.filters, scope: "group" } },
    { filters: { ...base.filters, tags: ["private-tag"] } }, { filters: { ...base.filters, smart: "struggling" } },
    { filters: { ...base.filters, status: "reading" } }, { filters: { ...base.filters, status: "new" } },
    { filters: { ...base.filters, readableOnly: true } }, { filters: { ...base.filters, q: "#private-tag" } },
    { filters: { ...base.filters, q: 'text tag:"personal tag"' } },
  ];
  for (const input of privateCases) assert.equal(core.sharedSearchHash({ ...base, ...input }), null, JSON.stringify(input));
  assert.equal(core.sharedSearchHash(null), null);
  for (const route of ["mytexts", "group%3Asecret-team", "group"]) {
    const decoded = core.presentationStateFromHash(`#room=${route}&share=1&q=private`);
    assert.equal(decoded.filters.q, "");
  }
  for (const extra of ["scope=notes", "scope=rows", "scope=both", "tags=private", "smart=struggling", "notes=private", "profile=private", "status=reading", "section=12", "audio=full"]) {
    assert.equal(core.presentationStateFromHash(`#room=benyehuda&share=1&q=private&${extra}`).filters.q, "", extra);
  }
});

test("group identity stays in the tab and legacy group links are decode-only", async () => {
  const core = await load();
  const local = core.sanitizePresentationState({ surface: "group", corpus: "group:secret-team", filters: { q: "private query" } });
  assert.equal(core.presentationHash(local), "#room=group");
  assert.equal(core.restorePresentationState({ hash: "#room=group", historyState: local }).corpus, "group:secret-team");
  assert.equal(core.restorePresentationState({ hash: "#room=group" }).surface, "hub");
  const legacy = core.presentationStateFromHash("#room=group%3Asecret-team");
  assert.equal(legacy.corpus, "group:secret-team");
  assert.equal(core.presentationHash(legacy), "#room=group");
  assert.equal(core.presentationStateMatchesHash(local, "#room=group%3Aother-team"), false);
  assert.equal(core.presentationHash({ surface: "mytexts", corpus: "benyehuda", mode: "explore", filters: { genre: "prose" } }), "#room=mytexts");
});

test("URL decoder rejects ambiguous encoding and bounds all allowed fields", async () => {
  const core = await load();
  for (const hash of ["#mentor", "#room=unknown", "#room=%ZZ", "#room=%E0%A4", "#room=benyehuda&room=mytexts",
    "#room=benyehuda&page=1&page=2", "#room=benyehuda&rv=99", "#room=public%3A../../secret", "#room=" + "a".repeat(5000)]) {
    assert.equal(core.presentationStateFromHash(hash), null, hash.slice(0, 120));
  }
  const safe = core.presentationStateFromHash("#room=benyehuda&mode=bad&author=private-author&era=secret&genre=private-tag&lang=../../private&length=CEFR-B1&theme=private%20text&page=100001&sort=progress&scope=notes&rv=2");
  assert.equal(safe.mode, "read");
  assert.equal(safe.page, 1);
  assert.equal(safe.drill.authorId, "");
  assert.equal(safe.drill.eraId, "");
  assert.equal(safe.filters.scope, "texts");
  assert.equal(core.presentationHash(safe), "#room=benyehuda");
  for (const page of [0, -1, 1.2, Infinity, "1e2", "9999999", "100001", "private"]) {
    assert.equal(core.sanitizePresentationState({ page }).page, 1);
  }
  assert.equal(core.sanitizePresentationState({ page: 100000 }).page, 100000);
  const maximalQuery = core.sharedSearchHash({ surface: "corpus", corpus: "public:" + "a".repeat(120),
    filters: { q: "😀".repeat(1000) } });
  assert.ok(Buffer.byteLength(maximalQuery) <= core.ROOM_B6_LIMITS.presentationUrlBytes);
  assert.equal(Array.from(core.presentationStateFromHash(maximalQuery).filters.q).length, 256);
});

test("v1 local state and reader deep-link ownership remain compatible", async () => {
  const core = await load();
  const old = { v: 1, surface: "corpus", corpus: "benyehuda", drill: { level: "works", authorId: "legacy-author" },
    filters: { q: "legacy private query", tags: ["legacy-tag"], scope: "notes", sort: "opened_desc" }, anchor: { itemId: "local-item", rowIndex: 12 } };
  const envelope = JSON.stringify({ v: 1, savedAt: 1000, state: old });
  const decoded = core.decodeSessionMirror(envelope, 1001);
  assert.equal(decoded.filters.q, old.filters.q);
  assert.deepEqual(decoded.filters.tags, old.filters.tags);
  assert.equal(decoded.anchor.itemId, "local-item");
  assert.equal(decoded.v, 1);
  assert.equal(core.restorePresentationState({ hash: "", historyState: old }, 1001).filters.q, old.filters.q);
  assert.equal(core.restorePresentationState({ hash: "#room=benyehuda", historyState: old }, 1001).drill.authorId, "legacy-author");
  assert.equal(core.restorePresentationState({ hash: "#room=benyehuda", sessionMirror: envelope }, 1001).filters.q, old.filters.q);
  assert.equal(core.presentationStateFromHash("#room=mytexts").corpus, "mytexts");
  assert.equal(core.presentationStateFromHash("#room=hub").surface, "hub");
  // Reader identity still belongs to the host's existing request parameters.
  const url = new URL("https://example.invalid/library.html?public_corpus=study-songs&public_work=work-1&public_snapshot=hash" + core.presentationHash({ surface: "reader", corpus: "public:study-songs" }));
  assert.equal(url.searchParams.get("public_work"), "work-1");
  assert.equal(core.presentationStateFromHash(url.hash).corpus, "public:study-songs");
});

test("codec remains pure and existing diagnostics reject query-shaped fields", async () => {
  const core = await load();
  const source = fs.readFileSync(corePath, "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|sendBeacon\s*\(|XMLHttpRequest|WebSocket|history\.(?:pushState|replaceState)|sessionStorage\.(?:setItem|removeItem)|localStorage\.(?:setItem|removeItem)/);
  for (const key of ["query", "url", "referrer", "tags", "note", "profile", "user_id"]) {
    assert.throws(() => core.appendLocalDiagnostic([], { kind: "room.search", [key]: "private value" }, 1000), /DIAGNOSTIC_FIELD_FORBIDDEN/);
  }
});
