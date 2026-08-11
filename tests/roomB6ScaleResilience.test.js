"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const corePath = path.join(ROOT, "public", "js", "room-b6-core.js");

test("B6.0 exposes one pure scale/resilience contract", async () => {
  assert.ok(fs.existsSync(corePath), "B6 core module must exist before implementation can be green");
  const core = await import(pathToFileURL(corePath).href);
  assert.equal(core.ROOM_B6_LIMITS.pageSize, 48);
  assert.equal(core.ROOM_B6_LIMITS.apiMax, 96);
  assert.equal(core.ROOM_B6_LIMITS.cardPayloadBytes, 256 * 1024);
  assert.equal(core.ROOM_B6_LIMITS.presentationBytes, 8 * 1024);
});

test("B6.1 cursor is opaque, versioned, filter-bound and rejects tampering", async () => {
  const core = await import(pathToFileURL(corePath).href);
  const filters = { q: "tail", level: "B1", tags: ["news"], tagMode: "all", scope: "texts", sort: "title_asc", smart: "" };
  const fingerprint = await core.fingerprintBrowseFilters(filters);
  const cursor = core.encodeBrowseCursor({ fingerprint, sort: "title_asc", values: ["Tail", "item-4999"] });
  assert.doesNotMatch(cursor, /Tail|item-4999|tail|news/, "cursor must be opaque in transport");
  assert.deepEqual(core.decodeBrowseCursor(cursor, { fingerprint, sort: "title_asc" }).values, ["Tail", "item-4999"]);
  assert.throws(() => core.decodeBrowseCursor(cursor + "x", { fingerprint, sort: "title_asc" }), /CURSOR_INVALID/);
  assert.throws(() => core.decodeBrowseCursor(cursor, { fingerprint: "different", sort: "title_asc" }), /CURSOR_MISMATCH/);
});

test("B6.2 presentation state is allowlisted, bounded and content-free", async () => {
  const core = await import(pathToFileURL(corePath).href);
  const state = core.sanitizePresentationState({
    v: 1,
    surface: "corpus",
    corpus: "mytexts",
    drill: { level: "works", eraId: "revival", authorId: "author-1", workId: "work-1", title: "forbidden" },
    filters: { q: "private phrase", level: "B1", tags: ["private-tag"], tagMode: "all", scope: "both", sort: "title_asc", smart: "recent" },
    visible: 999,
    anchor: { itemId: "local-item-1", rowIndex: 22, title: "forbidden" },
    source_text: "forbidden",
  });
  assert.deepEqual(state.filters, { q: "private phrase", level: "B1", tags: ["private-tag"], tagMode: "all", scope: "both", sort: "title_asc", smart: "recent" });
  assert.equal(state.visible, 48);
  assert.deepEqual(state.anchor, { itemId: "local-item-1", rowIndex: 22 });
  const encoded = JSON.stringify(state);
  assert.ok(Buffer.byteLength(encoded) <= 8 * 1024);
  assert.doesNotMatch(encoded, /source_text|forbidden/);
  assert.equal(core.presentationHash(state), "#room=mytexts");
  assert.doesNotMatch(core.presentationHash(state), /private phrase|private-tag/);
});

test("B6.2 session mirror enforces version, TTL and byte budget", async () => {
  const core = await import(pathToFileURL(corePath).href);
  const now = Date.parse("2026-08-11T12:00:00.000Z");
  const raw = core.encodeSessionMirror({ surface: "corpus", corpus: "mytexts" }, now);
  assert.ok(Buffer.byteLength(raw) <= core.ROOM_B6_LIMITS.presentationBytes);
  assert.equal(core.decodeSessionMirror(raw, now + 1000).corpus, "mytexts");
  assert.equal(core.decodeSessionMirror(raw, now + core.ROOM_B6_LIMITS.sessionTtlMs + 1), null);
  assert.equal(core.decodeSessionMirror("{bad", now), null);
});

test("B6.3 connection lifecycle is explicit and waiting updates never auto-activate", async () => {
  const core = await import(pathToFileURL(corePath).href);
  assert.equal(core.nextConnectionState("online", "offline", { localReady: true }), "offline-ready");
  assert.equal(core.nextConnectionState("online", "offline", { localReady: false }), "offline-partial");
  assert.equal(core.nextConnectionState("offline-ready", "online"), "reconnecting");
  assert.equal(core.nextConnectionState("reconnecting", "probe-ok"), "online");
  assert.equal(core.nextConnectionState("reconnecting", "probe-failed"), "degraded-error");

  const sw = read("public/sw.js");
  const install = sw.slice(sw.indexOf("self.addEventListener(\"install\""), sw.indexOf("self.addEventListener(\"activate\""));
  assert.doesNotMatch(install, /skipWaiting\s*\(/, "install must leave an update waiting");
  assert.match(sw, /message[\s\S]*SKIP_WAITING[\s\S]*skipWaiting\s*\(/, "only an explicit client message activates the update");
});

test("B6.4 diagnostics are bounded, local-only and reject content-shaped fields", async () => {
  const core = await import(pathToFileURL(corePath).href);
  const ring = core.appendLocalDiagnostic([], { kind: "room.open", duration_ms: 123, result: "ok" }, 1000);
  assert.equal(ring.length, 1);
  assert.deepEqual(Object.keys(ring[0]).sort(), ["duration_ms", "kind", "result", "ts"]);
  assert.throws(() => core.appendLocalDiagnostic(ring, { kind: "room.error", query: "secret" }, 1001), /DIAGNOSTIC_FIELD_FORBIDDEN/);
  assert.throws(() => core.appendLocalDiagnostic(ring, { kind: "room.error", detail: { title: "secret" } }, 1001), /DIAGNOSTIC_FIELD_FORBIDDEN/);
  let many = [];
  for (let i = 0; i < core.ROOM_B6_LIMITS.diagnosticEntries + 20; i++) {
    many = core.appendLocalDiagnostic(many, { kind: "room.page", duration_ms: i, result: "ok" }, 2000 + i);
  }
  assert.equal(many.length, core.ROOM_B6_LIMITS.diagnosticEntries);
  assert.doesNotMatch(read("public/js/room-b6-core.js"), /fetch\s*\(|sendBeacon\s*\(|XMLHttpRequest|WebSocket/);
});

test("B6 implementation keeps list payload light, exact and DOM-windowed", () => {
  const db = read("public/db/local-db.js");
  const ui = read("public/js/library-ui.js");
  assert.match(db, /export async function listPersonalTextsPage/);
  assert.match(db, /export async function countPersonalTextsExact/);
  const page = db.slice(db.indexOf("const _PERSONAL_TEXT_PREDICATE"), db.indexOf("export async function getPersonalTextFacets"));
  assert.match(page, /COUNT\(\*\) OVER\s*\(\)/);
  assert.match(page, /snapshot_opened/);
  assert.match(page, /snapshot_progress/);
  assert.match(page, /hasMore \|\| reverseMode/);
  assert.match(page, /group_corpus/);
  assert.match(page, /Math\.min\([^\n]*96/);
  assert.match(page, /SUBSTR\(COALESCE\(t\.title/);
  assert.match(page, /LENGTH\(COALESCE\(t\.tags_json/);
  assert.match(page, /function _b6TextVariants/);
  assert.doesNotMatch(page, /source_text|source_meta_json\s+AS|table_model_meta_json\s+AS/);
  const myTexts = ui.slice(ui.indexOf("async function renderMyTextsCorpus"), ui.indexOf("// L1 — graduated landing"));
  assert.match(myTexts, /listPersonalTextsPage/);
  assert.match(myTexts, /ROOM_BROWSE_PAGE/);
  assert.doesNotMatch(myTexts, /myBrowseLimit\s*\+=|found\.slice\(0,\s*myBrowseLimit\)/);
  assert.match(myTexts, /room\.mytexts\.nextPage/);
  assert.match(myTexts, /room\.mytexts\.previousPage/);
});

test("B6 history/session and safe update hooks are wired on both shared shells", () => {
  const room = read("public/js/library-ui.js");
  const studio = read("public/index.html");
  const server = read("server.js");
  assert.match(room, /history\.(pushState|replaceState)/);
  assert.match(room, /addEventListener\('popstate'/);
  assert.match(room, /sessionStorage/);
  assert.match(room, /flushReaderProgress/);
  assert.match(room, /room_reconnect=' \+ Date\.now\(\)/);
  assert.match(room, /loadGroupCorpora\(\{ strictNetwork: true \}\)/);
  assert.match(room, /roomUpdateActivationRequested/);
  assert.match(studio, /studioUpdateActivationRequested/);
  assert.match(studio, /v3PrepareForAppUpdate/);
  assert.match(server, /SHELL_INTEGRITY_PATHS[\s\S]*\/js\/room-b6-core\.js[\s\S]*\/db\/local-db\.js/);
  assert.doesNotMatch(room, /history\.(pushState|replaceState)\([^\n]*myCorpusState\.q/);
});
