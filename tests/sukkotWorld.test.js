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
  assert.equal(core.DEFAULT_WORLD, "sukkot");
  assert.equal(core.REGISTRY.sukkot.category, "events");
  assert.equal(core.REGISTRY["israel-elections-2026"].category, "current-events");
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

test("Sukkot Mediatheque reuses all four Studio stories and ends at the fixed evening stop", () => {
  const surface = manifest.surfaces.mediatheque;
  assert.deepEqual(core.routeLocations(manifest, surface), ["courtyard", "building", "decorating", "welcome", "cinema"]);
  assert.equal(surface.location, "courtyard");
  assert.equal(manifest.locations.cinema.lighting, "night");
  for (const source of manifest.scenes.filter(s => s.surfaces.includes("studio"))) {
    const clone = manifest.scenes.find(s => s.id === "media-" + source.id);
    assert.deepEqual(clone, { ...source, id: "media-" + source.id, slot: "media-stage", surfaces: ["mediatheque"] });
  }
  assert.equal(manifest.scenery.walkers[0].lane, 0);
  const election = JSON.parse(read("public/worlds/israel-elections-2026/manifest.json"));
  assert.equal(election.scenery.walkers[0].lane, 6);
  assert.deepEqual(core.routeLocations(election, election.surfaces.studio), Object.keys(election.locations).filter(id => election.locations[id].phase));
});
test("trial defaults replace old settings once and preserve subsequent choices, including Classic", () => {
  const vm = require("node:vm");
  for (const old of [null, {id:"classic"}, {id:"israel-elections-2026",mode:"calm",lighting:"night",paused:true}]) {
    const values = new Map(old ? [["lp_world_v1",JSON.stringify(old)]] : []);
    const run = () => vm.runInNewContext(read("public/js/world-boot.js").toString(), {
      window: {}, location: {search:""}, localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) },
      document: {createElement: () => ({setAttribute(){}}), head:{appendChild(){}}}
    });
    run();
    assert.deepEqual(JSON.parse(values.get("lp_world_v1")), {id:"sukkot",mode:"live",paused:false,lighting:"day"});
    const custom = JSON.stringify(old || {id:"classic"});
    values.set("lp_world_v1",custom);run();assert.equal(values.get("lp_world_v1"),custom);
  }
});
