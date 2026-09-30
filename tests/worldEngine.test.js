"use strict";
// LinguistPro Worlds — engine v2 contract (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const { core } = require("../public/js/world-engine.js");
const render = require("../public/js/world-render.js").core;
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
  const used = new Set(Object.values(atlas().atlases).map((a) => a.file));
  for (const f of files.filter((x) => x.endsWith(".png"))) assert.ok(used.has(f), `${f} is listed in atlas.json (no orphan art)`);
  for (const [name, a] of Object.entries(atlas().atlases)) {
    const bytes = fs.readFileSync(path.join(ROOT, PACK_DIR, a.file));
    assert.equal(bytes.length, a.bytes, `${a.file} size matches atlas.json`);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), a.sha256, `${name} checksum`);
    assert.equal(bytes.readUInt8(25), 6, `${a.file} is RGBA (real alpha channel, no painted checkerboard)`);
  }
});

test("committed world art is exactly reproducible from the .px sources", () => {
  assert.doesNotThrow(() => art.build(WORLD, { check: true }));
});

test("generated art keeps provenance: every pixelized source names its generation and the ledger records it", () => {
  const dir = path.join(ROOT, "art", "worlds", WORLD);
  const ledger = read("art/worlds/_gen/ledger.jsonl").trim().split("\n").map((l) => JSON.parse(l));
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".px"))) {
    const m = /from gen\/([a-z0-9-]+)/.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!m) continue;
    const id = m[1];
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "gen", id + ".json"), "utf8"));
    const src = fs.readFileSync(path.join(dir, "gen", id + ".jpg"));
    assert.equal(crypto.createHash("sha256").update(src).digest("hex"), meta.sha256, `${id}: stored source matches its generation record`);
    assert.ok(ledger.some((e) => e.ok && e.id === id && e.sha256 === meta.sha256), `${id} is in the spend ledger`);
    assert.ok(fs.existsSync(path.join(dir, "prompts", id + ".txt")), `${id}: prompt kept`);
    checked++;
  }
  assert.ok(checked >= 4, "timsah + three parallax layers are generated and traced");
  assert.ok(!/GEMINI_IMAGE_API_KEY|AIza[0-9A-Za-z_-]{20}/.test(read("art/worlds/_gen/ledger.jsonl")), "no key material in the ledger");
});

test("every Timsah pose shares one frame size and one ground anchor (no jitter between states)", () => {
  const frames = atlas().atlases.timsah.frames;
  assert.deepEqual(Object.keys(frames), ["idle", "blink", "walk-a", "walk-b", "hold", "jump"]);
  const first = frames.idle;
  for (const [id, f] of Object.entries(frames)) {
    assert.equal(f.w, first.w, id); assert.equal(f.h, first.h, id);
    assert.deepEqual(f.anchor, first.anchor, id);
  }
  assert.ok(first.h <= 48, "character stays within the art-bible scale next to ~36px street lamps");
});

test("parallax strips exist in all three lightings with identical geometry", () => {
  const a = atlas().atlases;
  for (const layer of ["hills", "city", "street"]) {
    const dims = ["day", "dusk", "night"].map((l) => { const x = a[`layer-${layer}-${l}-strip`]; assert.ok(x, `${layer} ${l}`); return x.width + "x" + x.height; });
    assert.equal(new Set(dims).size, 1, `${layer}: day/dusk/night share one geometry`);
  }
});

test("the stored choice is local, allowlisted, lively by default and remembers pause", () => {
  assert.equal(core.readChoice(null), null);
  assert.equal(core.readChoice("not json"), null);
  assert.equal(core.readChoice(JSON.stringify({ id: "unknown-world" })), null, "only registry ids load");
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD })), { id: WORLD, mode: "live", paused: false });
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD, mode: "calm", paused: true })), { id: WORLD, mode: "calm", paused: true });
  assert.deepEqual(core.readChoice(JSON.stringify({ id: WORLD, mode: "party" })), { id: WORLD, mode: "live", paused: false });
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
  bad((m) => { m.scenery.layers[0].sheet.day = "../../evil"; }, /layer hills sheet/);
  bad((m) => { m.scenery.lighting.night.sky = ["#000000"]; }, /lighting\.night/);
  bad((m) => { m.scenes[0].caption.ru = "<img src=x onerror=alert(1)>"; }, /scene ballot-drop text/);
  bad((m) => { m.actors.timsah.lines.he[0] = "<b>x</b>"; }, /actor timsah lines/);
  bad((m) => { m.scenes[0].durationMs = 3500; }, /scene ballot-drop duration/);
  bad((m) => { m.slots["table-overlay"] = { origin: 0.5, rest: [] }; }, /slot not allowed: table-overlay/);
  bad((m) => { m.scenes[0].trigger = "review.graded"; }, /scene ballot-drop trigger/);
  bad((m) => { m.locations.polling.phase = "vote"; }, /location polling/);
  bad((m) => { m.actors.timsah.fictional = false; }, /must be fictional or reference a CHARACTERS card/);
  bad((m) => { delete m.names.he; }, /names/);
  bad((m) => { m.engine = { min: 3, max: 3 }; }, /engine incompatible/);
  bad((m) => { delete m.scenes[0].staticPose; }, /staticPose/);
  bad((m) => { m.scenes[0].tracks[0].keys[1].frame = "wink"; }, /frame timsah\.wink/);
});

test("the governor: one scene at a time, cooldown, session cap, pause and busy states, no queue", () => {
  const g = core.createGovernor();
  let now = 0;
  assert.deepEqual(g.request("auto", now, { busy: "typing" }), { play: false, reason: "typing" });
  assert.deepEqual(g.request("auto", now, { reducedMotion: true }), { play: false, reason: "reduced-motion" });
  assert.deepEqual(g.request("auto", now, { paused: true }), { play: false, reason: "paused" });
  assert.deepEqual(g.request("auto", now, { hidden: true }), { play: false, reason: "hidden" });
  for (let i = 0; i < 3; i++) {
    assert.equal(g.request("auto", now).play, true, `auto #${i + 1}`);
    g.started("auto");
    assert.equal(g.request("auto", now).reason, "busy-scene");
    now += 2800; g.ended(now, "auto");
    if (i < 2) assert.equal(g.request("auto", now + 1000).reason, "cooldown");
    now += core.BUDGET.cooldownMs;
  }
  assert.equal(g.request("auto", now).reason, "session-cap");
  assert.equal(g.request("manual", now).play, true, "the user can always ask for a scene");
  assert.equal(g.request("manual", now, { hidden: true }).play, false);
  assert.equal(g.request("story", now).play, true, "a story beat is the payoff of the user's own step: no budget");
  assert.equal(g.request("story", now, { paused: true }).reason, "paused", "but it respects the world pause");
  assert.equal(g.request("story", now, { reducedMotion: true }).reason, "reduced-motion");
  const g2 = core.createGovernor();
  for (let i = 0; i < 10; i++) { assert.equal(g2.request("ambient", i).play, true); g2.started("ambient"); g2.ended(i, "ambient"); }
  assert.equal(g2.request("auto", 10).play, true, "ambient life never spends the reaction budget or cooldown");
  assert.equal(g2.request("ambient", 10, { busy: "typing" }).reason, "typing");
});

test("scene sampling: held steps, linear moves, frame cycles and arcs", () => {
  const sc = manifest().scenes[0];
  const at = (t) => Object.fromEntries(core.sampleScene(sc, t).map((p) => [p.actor, p]));
  assert.equal(at(0).timsah.frame, "idle");
  assert.equal(at(350).timsah.frame, "blink");
  assert.equal(at(800).timsah.frame, "hold");
  assert.equal(at(800).envelope.hidden, true);
  const mid = at(1550).envelope;
  assert.equal(mid.hidden, false);
  assert.ok(mid.x > 11 && mid.x < 30, "envelope travels toward the slot");
  assert.ok(mid.y > 14, "and arcs above the straight line");
  assert.equal(at(2100).envelope.hidden, true, "gone into the box");
  assert.equal(at(2300).box.frame, "box-glint");
  assert.equal(at(2100).timsah.frame, "jump", "Timsah celebrates");
  const walk = manifest().scenes[1].tracks[0];
  assert.equal(core.sampleTrack(walk, 0).frame, "walk-a");
  assert.equal(core.sampleTrack(walk, 200).frame, "walk-b");
  assert.equal(core.sampleTrack(walk, 1800).flip, true, "walking back faces the way he goes");
});

test("the journey follows the Studio phase: one location per phase, walk time bounded", () => {
  const m = manifest();
  assert.equal(core.locationForPhase(m, "add"), "hq");
  assert.equal(core.locationForPhase(m, "table"), "press");
  assert.equal(core.locationForPhase(m, "correct"), "press", "editing shares the press stop");
  assert.equal(core.locationForPhase(m, "save"), "polling");
  assert.equal(core.locationForPhase(m, "learn"), "count");
  assert.equal(core.locationForPhase(m, "whatever"), "hq");
  const j = core.journey(120, 920);
  assert.ok(j.ms >= 1200 && j.ms <= 3200, `${j.ms}`);
  assert.equal(core.sampleTrack(j.track, 0).flip, false);
  assert.equal(core.sampleTrack(core.journey(920, 120).track, 0).flip, true);
  assert.equal(core.sampleTrack(j.track, j.ms).x, 920);
  assert.equal(m.locations.count.lighting, "night", "counting night is always night");
});

test("renderer core: lighting by hour, seamless wrap, eased camera", () => {
  assert.equal(render.lightingFor(9), "day");
  assert.equal(render.lightingFor(18), "dusk");
  assert.equal(render.lightingFor(23), "night");
  assert.equal(render.lightingFor(3), "night");
  assert.equal(render.lightingFor(12, "night"), "night", "a location may force its lighting");
  for (const x of [0, -5, -300, 17, 1000]) {
    const o = render.wrapOffset(x, 287);
    assert.ok(o <= 0 && o > -287, `${x} → ${o}`);
  }
  assert.equal(render.cameraAt(0, 100, 0, 1000, 0), 0);
  assert.equal(render.cameraAt(0, 100, 0, 1000, 500), 50);
  assert.equal(render.cameraAt(0, 100, 0, 1000, 2000), 100);
  const r1 = render.mulberry32(26), r2 = render.mulberry32(26);
  assert.equal(r1(), r2(), "ambient placement is deterministic per seed");
});

test("privacy: the world choice never reaches telemetry, and the engine talks only to its own pack", () => {
  const engine = read("public/js/world-engine.js");
  const renderer = read("public/js/world-render.js");
  const fetches = [...engine.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ["url, { credentials: \"same-origin\" }"], "one fetch helper");
  assert.match(engine, /fetchJson\(reg\.base \+ "manifest\.json\?v=" \+ v\), fetchJson\(reg\.base \+ "atlas\.json\?v=" \+ v\)/);
  assert.doesNotMatch(renderer, /fetch\(|XMLHttpRequest|localStorage|document\.querySelector/, "the renderer only draws");
  for (const src of [engine, renderer]) {
    assert.doesNotMatch(src, /product-pulse|umami|sendBeacon|XMLHttpRequest|ProductPulse|\btrack\(|\bgtag\(/i);
  }
  // Pack text reaches the DOM as textContent only; the single innerHTML is a static glyph span.
  const html = [...engine.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(html, ["'<span aria-hidden=\"true\" class=\"lp-world-pause-icon\"></span>'"]);
  assert.doesNotMatch(engine, /insertAdjacentHTML|document\.write/);
  for (const f of ["public/js/product-telemetry.js", "public/js/pulse.js"]) {
    assert.doesNotMatch(read(f), /lp_world|data-world|LPWorld/, `${f} must not read the world choice`);
  }
  for (const reg of Object.values(core.REGISTRY)) assert.match(reg.base, /^\/worlds\/[a-z0-9-]+\/$/);
});

test("Studio wiring: slots, picker entry, engine, renderer and skin precached under the exact keys", () => {
  const studio = read("public/index.html");
  const sw = read("public/sw.js");
  const engine = read("public/js/world-engine.js");
  assert.match(studio, /<div class="classic-shell-head studio-vf3-shell">[\s\S]{0,400}<div class="lp-world-stage" data-world-slot="studio-stage" data-world-bottom-narrow="\.classic-shell-copy" hidden><\/div>/);
  assert.match(studio, /<body>\r?\n<script src="\/js\/app-nav\.js\?v=\d+"><\/script>\r?\n<div class="lp-world-backdrop" data-world-slot="page-backdrop" aria-hidden="true" hidden><\/div>/);
  assert.match(studio, /id="btnWorld"[^>]*onclick="window\.LPWorld&&window\.LPWorld\.openPicker\(\)"[^>]*data-i18n-aria-label="world\.btnTitle"/);
  const bootUrl = studio.match(/\/js\/world-boot\.js\?v=\d+/)[0];
  assert.ok(sw.includes(JSON.stringify(bootUrl)), `${bootUrl} precached exactly`);
  assert.doesNotMatch(studio, /world-engine\.js/, "the shell loads only the boot stub; the engine loads on demand");
  const boot = read("public/js/world-boot.js");
  const engineUrl = boot.match(/var ENGINE_URL = "([^"]+)"/)[1];
  assert.ok(sw.includes(JSON.stringify(engineUrl)), `${engineUrl} precached exactly`);
  assert.ok(Buffer.byteLength(boot) < 2000, "Classic pays for a tiny stub only");
  for (const name of ["CSS_URL", "RENDER_URL"]) {
    const url = engine.match(new RegExp(`var ${name} = "([^"]+)"`))[1];
    assert.ok(sw.includes(JSON.stringify(url)), `${url} precached exactly`);
    assert.ok(fs.existsSync(path.join(ROOT, "public", url.split("?")[0])));
  }
  assert.doesNotMatch(studio, /world-render\.js/, "the renderer is loaded on demand, never by the shell");
  assert.match(read("public/icons/linguistpro-ui.svg"), /<symbol id="lp-mark-world" viewBox="0 0 24 24">/);
  assert.doesNotMatch(sw, /\/worlds\//, "world art is fetched on demand only — never precached for Classic users");
});

test("the skin never restyles the study table or learning fonts; everything else is world-scoped", () => {
  const css = read("public/css/world-skin.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#tableContainer|reader-core|\.rc-|font-family\s*:(?![^;]*var\(--lp-font-(ui|hebrew-reading))/,
    "table internals and learning typography are out of bounds");
  for (const rule of css.split("}")) {
    if (/font-size|font-weight|letter-spacing|font-family/.test(rule)) assert.match(rule.split("{")[0], /\.lp-world-/, `type change outside world UI: ${rule.trim().slice(0, 80)}`);
    const selector = rule.split("{")[0];
    if (/\{/.test(rule) && !/html\[data-world\]/.test(selector)) {
      assert.match(selector, /lp-world-|@media|^\s*$/, `unscoped rule must belong to the world UI: ${selector.trim().slice(0, 80)}`);
    }
  }
  assert.match(css, /\.lp-world-pause \{[^}]*width: 44px; height: 44px;/, "the pause control is a 44px target");
});

test("world UI strings exist in ru, en and he", () => {
  const vm = require("node:vm");
  const keys = ["btnTitle", "pickerTitle", "pickerLead", "classic", "classicNote", "satireBadge", "modeLegend", "modeCalm", "modeLive", "privacy", "preview", "done", "pause", "resume"];
  for (const l of ["ru", "en", "he"]) {
    const box = { window: {} };
    vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box);
    const w = box.window.I18N_LOCALES[l].world;
    for (const k of keys) assert.equal(typeof w[k], "string", `${l} world.${k}`);
    assert.equal(typeof w.elections.note, "string");
  }
});
