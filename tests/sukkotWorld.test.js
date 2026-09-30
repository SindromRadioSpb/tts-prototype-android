"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { core } = require("../public/js/world-engine");
const art = require("../scripts/worlds/build-world-art");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p));
const manifest = JSON.parse(read("public/worlds/sukkot/manifest.json"));
const atlas = JSON.parse(read("public/worlds/sukkot/atlas.json"));

test("Sukkot satisfies the shared contract and remains an additional choice", () => {
  assert.deepEqual(core.validatePack(manifest, atlas, "sukkot").errors, []);
  assert.equal(core.REGISTRY.sukkot.pack, manifest.version);
  assert.equal(core.DEFAULT_WORLD, "israel-elections-2026");
  assert.equal(core.REGISTRY.sukkot.category, "events");
  assert.equal(core.REGISTRY[core.DEFAULT_WORLD].category, "current-events");
  assert.equal(core.readChoice(JSON.stringify({ id: "sukkot" })).id, "sukkot");
});
test("Sukkot assets rebuild exactly and all runtime files are checked data or PNG", () => {
  art.build("sukkot", { check: true });
  for (const file of fs.readdirSync(path.join(root, "public/worlds/sukkot"))) {
    assert.match(file, /^(manifest\.json|atlas\.json|[a-z0-9-]+\.png)$/);
  }
  for (const sheet of Object.values(atlas.atlases)) {
    const b = read("public/worlds/sukkot/" + sheet.file);
    assert.equal(b.length, sheet.bytes);
    assert.equal(crypto.createHash("sha256").update(b).digest("hex"), sheet.sha256);
    assert.equal(b.readUInt32BE(16), sheet.width);
    assert.equal(b.readUInt32BE(20), sheet.height);
    assert.equal(b[25], 6);
  }
});
test("Sukkot preserves Timsah and supports each existing surface and Studio phase", () => {
  const original = JSON.parse(read("public/worlds/israel-elections-2026/atlas.json"));
  for (const sheet of ["timsah", "timsah-leisure", "cat", "people"]) assert.deepEqual(atlas.atlases[sheet], original.atlases[sheet]);
  assert.deepEqual(["add", "correct", "table", "save", "learn"].map(p => core.locationForPhase(manifest, p)), ["courtyard", "building", "building", "decorating", "welcome"]);
  for (const surface of ["studio", "room", "mediatheque"]) assert.ok(manifest.scenes.some(s => s.trigger === "manual" && s.surfaces.includes(surface)));
});
