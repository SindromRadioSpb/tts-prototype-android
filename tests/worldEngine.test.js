"use strict";
// LinguistPro Worlds — engine contract (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const { core } = require("../public/js/world-engine.js");
const art = require("../scripts/worlds/build-world-art.js");

const WORLD = "israel-elections-2026";
const PACK_DIR = `public/worlds/${WORLD}`;
const manifest = () => JSON.parse(read(`${PACK_DIR}/manifest.json`));
const atlas = () => JSON.parse(read(`${PACK_DIR}/atlas.json`));

test("the shipped Israel Elections pack satisfies the engine contract", () => {
  const res = core.validatePack(manifest(), atlas(), WORLD);
  assert.deepEqual(res.errors, []);
  assert.equal(manifest().version, core.REGISTRY[WORLD].pack, "registry pins the pack version it loads");
});

test("a pack ships only data and pixel images — no script, markup, stylesheet or SVG", () => {
  const files = fs.readdirSync(path.join(ROOT, PACK_DIR));
  for (const f of files) assert.match(f, /^(manifest\.json|atlas\.json|[a-z0-9-]+\.png)$/, f);
  for (const [name, a] of Object.entries(atlas().atlases)) {
    assert.ok(files.includes(a.file), `${name} → ${a.file} exists`);
    const bytes = fs.readFileSync(path.join(ROOT, PACK_DIR, a.file));
    assert.equal(bytes.length, a.bytes, `${a.file} size matches atlas.json`);
    assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"), a.sha256, `${a.file} checksum`);
    assert.equal(bytes.readUInt8(25), 6, `${a.file} is RGBA (real alpha channel, no painted checkerboard)`);
  }
});

test("committed world art is exactly reproducible from the hand-authored .px sources", () => {
  assert.doesNotThrow(() => art.build(WORLD, { check: true }));
});

test("every Timsah pose shares one frame size and one ground anchor (no jitter between states)", () => {
  const frames = atlas().atlases.timsah.frames;
  const ids = Object.keys(frames);
  assert.deepEqual(ids, ["idle", "blink", "walk", "hold"]);
  for (const id of ids) {
    assert.equal(frames[id].w, 32); assert.equal(frames[id].h, 32);
    assert.deepEqual(frames[id].anchor, [13, 30], id);
  }
  // Frames differ only where the pose changes: the head rows (0..12) of idle and hold are identical.
  const src = read(`art/worlds/${WORLD}/timsah.px`);
  const parsed = art.parsePx(src, "timsah.px");
  const byId = Object.fromEntries(parsed.frames.map((f) => [f.id, f.rows]));
  assert.deepEqual(byId.hold.slice(0, 13), byId.idle.slice(0, 13));
  assert.deepEqual(byId.walk.slice(0, 26), byId.idle.slice(0, 26));
});

test("the .px parser rejects ragged rows and unknown palette characters", () => {
  assert.throws(() => art.parsePx(". transparent\nk #000000\n@frame a 2x2\nkk\nk\n", "t"), /row 1 has 1 chars/);
  assert.throws(() => art.parsePx(". transparent\n@frame a 2x1\nkz\n", "t"), /unknown palette char/);
});

test("the stored choice is local, allowlisted and defaults to the calm mode", () => {
  assert.equal(core.readChoice(null), null);
  assert.equal(core.readChoice("not json"), null);
  assert.equal(core.readChoice(JSON.stringify({ id: "unknown-world" })), null, "only registry ids load");
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD })), { id: WORLD, mode: "calm" });
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD, mode: "live" })), { id: WORLD, mode: "live" });
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD, mode: "party" })), { id: WORLD, mode: "calm" });
  core.REGISTRY[WORLD].retired = true;
  try { assert.equal(core.readChoice(JSON.stringify({ id: WORLD })), null, "a retired world never loads again"); }
  finally { core.REGISTRY[WORLD].retired = false; }
});

test("validation refuses anything outside the declarative contract", () => {
  const bad = (mutate, pattern) => {
    const m = manifest(); mutate(m);
    const res = core.validatePack(m, atlas(), WORLD);
    assert.equal(res.ok, false, pattern.toString());
    assert.ok(res.errors.some((e) => pattern.test(e)), `${pattern} in ${res.errors.join(" | ")}`);
  };
  bad((m) => { m.skin.light.fontFamily = "Comic Sans"; }, /skin token not allowed: fontFamily/);
  bad((m) => { m.skin.light.page = "url(https://tracker.example/x.png)"; }, /skin\.light\.page/);
  bad((m) => { m.skin.dark.pageTile = "../../evil"; }, /skin\.dark\.pageTile/);
  bad((m) => { m.scenes[0].caption.ru = "<img src=x onerror=alert(1)>"; }, /scene ballot-drop text/);
  bad((m) => { m.scenes[0].durationMs = 3500; }, /scene ballot-drop duration/);
  bad((m) => { m.scenes[0].slot = "reading-table"; }, /scene ballot-drop slot/);
  bad((m) => { m.slots["table-overlay"] = { origin: 0.5, rest: [] }; }, /slot not allowed: table-overlay/);
  bad((m) => { m.scenes[0].trigger = "review.graded"; }, /scene ballot-drop trigger/);
  bad((m) => { m.actors.timsah.fictional = false; }, /must be fictional or reference a CHARACTERS card/);
  bad((m) => { delete m.names.he; }, /names/);
  bad((m) => { m.engine = { min: 2, max: 3 }; }, /engine incompatible/);
  bad((m) => { delete m.scenes[0].staticPose; }, /staticPose/);
  bad((m) => { m.scenes[0].tracks[0].keys[1].frame = "wink"; }, /frame timsah\.wink/);
});

test("the governor: one scene at a time, cooldown, session cap, never over busy states, no queue", () => {
  const g = core.createGovernor();
  let now = 0;
  assert.deepEqual(g.request("auto", now, { busy: "tts" }), { play: false, reason: "tts" });
  assert.deepEqual(g.request("auto", now, { reducedMotion: true }), { play: false, reason: "reduced-motion" });
  assert.deepEqual(g.request("auto", now, { hidden: true }), { play: false, reason: "hidden" });
  for (let i = 0; i < 3; i++) {
    assert.equal(g.request("auto", now).play, true, `auto #${i + 1}`);
    g.started("auto");
    assert.equal(g.request("auto", now).reason, "busy-scene");
    now += 2800; g.ended(now);
    if (i < 2) assert.equal(g.request("auto", now + 1000).reason, "cooldown");
    now += core.BUDGET.cooldownMs;
  }
  assert.equal(g.request("auto", now).reason, "session-cap");
  assert.equal(g.request("manual", now).play, true, "the user can always ask for a scene");
  assert.equal(g.request("manual", now, { hidden: true }).play, false);
  assert.equal(core.BUDGET.maxDurationMs, 3000);
  assert.equal(core.BUDGET.cooldownMs, 120000);
});

test("scene sampling: held steps, linear moves, frame cycles and arcs", () => {
  const sc = manifest().scenes[0];
  const at = (t) => Object.fromEntries(core.sampleScene(sc, t).map((p) => [p.actor, p]));
  assert.equal(at(0).timsah.frame, "idle");
  assert.equal(at(360).timsah.frame, "blink");
  assert.equal(at(800).timsah.frame, "hold");
  assert.equal(at(800).envelope.hidden, true);
  const mid = at(1650).envelope;
  assert.equal(mid.hidden, false);
  assert.ok(mid.x > -16 && mid.x < 0, "envelope travels toward the slot");
  assert.ok(mid.y > 12, "and arcs above the straight line");
  assert.equal(at(2200).envelope.hidden, true, "gone into the box");
  assert.equal(at(2300).box.frame, "box-glint");
  const walk = manifest().scenes[1].tracks[0];
  assert.equal(core.sampleTrack(walk, 0).frame, "walk");
  assert.equal(core.sampleTrack(walk, 200).frame, "idle");
  assert.equal(core.sampleTrack(walk, 0).flip, true);
  assert.equal(core.sampleTrack(walk, 650).x, -52);
});

test("dated scenes stop by themselves; live-only scenes stay out of calm mode", () => {
  assert.equal(core.sceneActive({ expires: "2026-11-30" }, "calm", "2026-12-01"), false);
  assert.equal(core.sceneActive({ expires: "2026-11-30" }, "calm", "2026-11-30"), true);
  assert.equal(core.sceneActive({ modes: ["live"] }, "calm", "2026-10-01"), false);
  assert.equal(core.sceneActive({ modes: ["live"] }, "live", "2026-10-01"), true);
});

test("privacy: the world choice never reaches telemetry, and the engine talks only to its own pack", () => {
  const engine = read("public/js/world-engine.js");
  const fetches = [...engine.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ["url, { credentials: \"same-origin\" }"], "one fetch helper");
  assert.match(engine, /fetchJson\(reg\.base \+ "manifest\.json\?v=" \+ v\), fetchJson\(reg\.base \+ "atlas\.json\?v=" \+ v\)/);
  assert.doesNotMatch(engine, /product-pulse|umami|sendBeacon|XMLHttpRequest|ProductPulse|track\(|gtag\(/i);
  assert.doesNotMatch(engine, /innerHTML|insertAdjacentHTML|document\.write/, "pack text reaches the DOM as textContent only");
  for (const f of ["public/js/product-telemetry.js", "public/js/pulse.js"]) {
    assert.doesNotMatch(read(f), /lp_world|data-world|LPWorld/, `${f} must not read the world choice`);
  }
  for (const reg of Object.values(core.REGISTRY)) assert.match(reg.base, /^\/worlds\/[a-z0-9-]+\/$/);
});

test("Studio wiring: stage slot, picker entry, engine and skin precached under the exact keys", () => {
  const studio = read("public/index.html");
  const sw = read("public/sw.js");
  const engine = read("public/js/world-engine.js");
  assert.match(studio, /<div class="lp-world-stage" data-world-slot="studio-stage" aria-hidden="true" hidden><\/div>/);
  assert.match(studio, /id="btnWorld"[^>]*onclick="window\.LPWorld&&window\.LPWorld\.openPicker\(\)"[^>]*data-i18n-aria-label="world\.btnTitle"/);
  const engineUrl = studio.match(/\/js\/world-engine\.js\?v=\d+/)[0];
  assert.ok(sw.includes(JSON.stringify(engineUrl)), `${engineUrl} precached exactly`);
  const cssUrl = engine.match(/var CSS_URL = "([^"]+)"/)[1];
  assert.ok(sw.includes(JSON.stringify(cssUrl)), `${cssUrl} precached exactly`);
  assert.ok(fs.existsSync(path.join(ROOT, "public", cssUrl.split("?")[0])));
  assert.match(read("public/icons/linguistpro-ui.svg"), /<symbol id="lp-mark-world" viewBox="0 0 24 24">/);
  // World art is fetched on demand only — never precached for Classic users.
  assert.doesNotMatch(sw, /\/worlds\//);
});

test("the skin never restyles the study table or learning fonts", () => {
  const css = read("public/css/world-skin.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#tableContainer|reader-core|\.rc-|font-family\s*:(?![^;]*var\(--lp-font-ui)/,
    "table internals and learning typography are out of bounds");
  for (const rule of css.split("}")) {
    if (/font-size|font-weight|letter-spacing/.test(rule)) assert.match(rule.split("{")[0], /\.lp-world-/, `type change outside world UI: ${rule.trim().slice(0, 80)}`);
  }
  for (const rule of css.split("}")) {
    if (!/html\[data-world\]/.test(rule) && /\{/.test(rule)) {
      const selector = rule.split("{")[0];
      assert.match(selector, /lp-world-|@media|^\s*$|\/\*/, `unscoped rule must belong to the world UI: ${selector.trim().slice(0, 80)}`);
    }
  }
});

test("world UI strings exist in ru, en and he", () => {
  const vm = require("node:vm");
  const keys = ["btnTitle", "pickerTitle", "pickerLead", "classic", "classicNote", "satireBadge", "modeLegend", "modeCalm", "modeLive", "privacy", "preview", "done"];
  for (const l of ["ru", "en", "he"]) {
    const box = { window: {} };
    vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box);
    const w = box.window.I18N_LOCALES[l].world;
    for (const k of keys) assert.equal(typeof w[k], "string", `${l} world.${k}`);
    assert.equal(typeof w.elections.note, "string");
  }
});
