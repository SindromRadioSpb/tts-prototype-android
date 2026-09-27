"use strict";
// Perf 2026-09-27 (owner profile: 519 texts, 74k sentences, 25 MB of list metadata): the Studio
// Library list took 2.6 s. Two causes, both measured: a per-text provider subquery that read
// every sentence row (934 ms → 64 ms with a covering index) and ASR segments/timing inside
// source_meta_json shipped with every list row. Opening a text still reads the full row.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const localDb = fs.readFileSync(path.join(__dirname, "..", "public", "db", "local-db.js"), "utf8");
const listMetaSql = localDb.match(/const _LIST_SOURCE_META_SQL = `([\s\S]*?)`;/)[1];

test("migration 054 makes the list's provider summary an index-only read", async () => {
  const { MIGRATIONS } = await import("../public/db/migrations.js");
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE texts(id TEXT PRIMARY KEY, is_archived INTEGER DEFAULT 0); CREATE TABLE sentences(id TEXT PRIMARY KEY, text_id TEXT, he TEXT, translation_provider TEXT); CREATE INDEX ix_sentences_text_id ON sentences(text_id);");
  db.run(MIGRATIONS[53]);
  const plan = db.exec(`EXPLAIN QUERY PLAN SELECT (SELECT GROUP_CONCAT(DISTINCT NULLIF(LOWER(TRIM(s.translation_provider)), ''))
      FROM sentences s WHERE s.text_id = texts.id) FROM texts WHERE is_archived = 0`)[0].values.map((row) => row[3]).join(" | ");
  assert.match(plan, /COVERING INDEX ix_sentences_text_provider/);
});

test("list rows carry source_meta without ASR segments and timing, everything else intact", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE texts(id TEXT, source_meta_json TEXT)");
  const meta = { corpus: { id: "c1" }, provider: "gemini", source: { audio: { v: 2, video: { videoId: "x" }, segments: [{ t: 1 }], timing: { entries: 1 }, timingMap: { a: 1 } } } };
  db.run("INSERT INTO texts VALUES ('a', ?), ('b', 'not json'), ('c', NULL)", [JSON.stringify(meta)]);
  const rows = db.exec(`SELECT id, ${listMetaSql} FROM texts ORDER BY id`)[0].values;
  const light = JSON.parse(rows[0][1]);
  assert.deepEqual(light.source.audio, { v: 2, video: { videoId: "x" } });
  assert.deepEqual(light.corpus, { id: "c1" });
  assert.equal(light.provider, "gemini");
  assert.equal(rows[1][1], "not json");
  assert.equal(rows[2][1], null);
});

test("listTextsLight uses the trimmed metadata column", () => {
  const fn = localDb.slice(localDb.indexOf("export async function listTextsLight"), localDb.indexOf("// B6.1 — dedicated personal-card browse contract"));
  assert.match(fn, /\.replace\('texts\."source_meta_json"', _LIST_SOURCE_META_SQL\)/);
});
