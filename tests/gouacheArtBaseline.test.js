"use strict";
// 3.11.907: the gouache paintings are a baseline. A changed, added or removed file under
// public/art/gouache must come with `node scripts/art/gouache/art-manifest.js --write` in the same commit.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { current, diff, MANIFEST } = require("../scripts/art/gouache/art-manifest.js");

test("gouache art matches its stored baseline", () => {
  const stored = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).files;
  assert.deepEqual(diff(stored, current()), []);
});
