"use strict";
// Perf 2026-09-27: getKnownWordStates feeds the learner projection (Studio familiarity, Room home).
// Four json_extract calls parsed each of the owner's 30k word_study bodies four times
// (~310 ms); one multi-path json_extract parses it once (~215 ms), results identical 30191/30191.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const localDb = fs.readFileSync(path.join(__dirname, "..", "public", "db", "local-db.js"), "utf8");
const fn = localDb.slice(localDb.indexOf("export async function getKnownWordStates()"), localDb.indexOf("export async function getKnownWordStates()") + 1600);

test("word_study notes are read with one JSON parse per body", () => {
  assert.match(fn, /json_extract\(body_json,'\$\.lemma','\$\.word','\$\.pos','\$\.pealim_id'\) AS fields/);
  assert.equal((fn.match(/json_extract\(/g) || []).length, 1);
});

test("the multi-path read yields the same fields, including missing ones", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE notes_v2(id TEXT, note_type TEXT, body_json TEXT)");
  db.run(`INSERT INTO notes_v2 VALUES ('a','word_study','{"lemma":"שלום","word":"שָׁלוֹם","pos":"noun","pealim_id":123}'),
    ('b','word_study','{"word":"בית"}')`);
  const rows = db.exec("SELECT id, json_extract(body_json,'$.lemma','$.word','$.pos','$.pealim_id') AS fields FROM notes_v2 ORDER BY id")[0].values;
  assert.deepEqual(JSON.parse(rows[0][1]), ["שלום", "שָׁלוֹם", "noun", 123]);
  assert.deepEqual(JSON.parse(rows[1][1]), [null, "בית", null, null]);
});
