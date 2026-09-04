"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

test("curated numeral overrides point to the exact shipped Pealim number entries", () => {
  const root = path.join(__dirname, "..");
  const store = JSON.parse(fs.readFileSync(path.join(root, "public/data/inflection/pealim-pos-overrides.v1.json"), "utf8"));
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
  const byId = new Map(data.paradigms.map((entry) => [String(entry.pealim_id), entry]));
  assert.equal(Object.keys(store.overrides).length, 10);
  for (const [id, override] of Object.entries(store.overrides)) {
    const paradigm = byId.get(id);
    assert.ok(paradigm, `${id} exists`);
    assert.equal(paradigm.kind, "invariant", `${id} is an invariant number entry`);
    assert.match(paradigm.meaning, /^(один|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)/, `${id} has a numeric gloss`);
    assert.equal(override.context_pos, "numeral");
    assert.equal(override.lexical_pos, "numeral");
  }
});
