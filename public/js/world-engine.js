/*
 * LinguistPro Worlds — World Engine v2 (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md).
 *
 * A world is a versioned, DECLARATIVE pack under /worlds/<id>/: manifest.json + atlas.json + PNG.
 * No script, HTML, CSS or network target comes from a pack. The engine owns:
 *   - which worlds may load at all (REGISTRY; a retired id never loads again after an update);
 *   - where the world may draw (only elements the app marks with data-world-slot);
 *   - how skin values reach CSS (allowlisted tokens, validated colour values only);
 *   - motion: a living canvas scene (parallax, lighting, ambient life, a journey that follows the
 *     Studio phase), a visible pause control, OS reduced motion = one still frame;
 *   - reactions: one scene at a time, <= 3 s, cooldown and per-session cap for automatic ones.
 * Worlds decorate meaning, never alter it: no learner data, no telemetry, no queue of late events.
 * World choice lives only in this device's localStorage (lp_world_v1) and is sent nowhere.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LPWorld = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENGINE_VERSION = 2;
  var STORAGE_KEY = "lp_world_v1";
  var SCHEMA = "lp-world/2";
  var ATLAS_SCHEMA = "lp-world-atlas/1";
  // Kill switch: an id missing here, or retired, never loads — the next successful app update
  // withdraws a world everywhere (offline clients keep the old shell until they update).
  var REGISTRY = {
    "israel-elections-2026": { base: "/worlds/israel-elections-2026/", pack: "0.4.0", retired: false }
  };
  var MODES = ["calm", "live"];
  var LOCALES = ["ru", "en", "he"];
  var LIGHTINGS = ["day", "dusk", "night"];
  var PHASES = ["add", "correct", "table", "save", "learn"];
  var SLOTS = ["studio-stage", "page-backdrop"];
  var TRIGGER_RE = /^(manual|ambient|tap|studio\.table-ready|arrive\.[a-z0-9-]+)$/;
  var COLOR_TOKENS = ["page", "surface", "surfaceSoft", "ink", "line", "shadow", "accent", "accentInk", "plate", "plateInk"];
  var BUDGET = { maxAutoPerSession: 3, cooldownMs: 120000, maxDurationMs: 3000, maxManualDurationMs: 8000, ambientEveryMs: 22000 };
  var DEFAULT_SCALE = 2;
  var FRAME_MS = 33; // ~30 fps: pixel art does not need more, batteries prefer less
  var CSS_URL = "/css/world-skin.css?v=705";    // lockstep with the sw.js precache keys
  var RENDER_URL = "/js/world-render.js?v=705";

  // ── pure core ──────────────────────────────────────────────────────────────

  function readChoice(raw) {
    if (!raw) return null;
    var v;
    try { v = JSON.parse(raw); } catch (_) { return null; }
    if (!v || typeof v !== "object" || typeof v.id !== "string") return null;
    var reg = REGISTRY[v.id];
    if (!reg || reg.retired) return null;
    return { id: v.id, mode: MODES.indexOf(v.mode) >= 0 ? v.mode : "live", paused: v.paused === true };
  }

  function isPlainText(s) { return typeof s === "string" && s.length > 0 && s.length <= 400 && !/[<>]/.test(s); }
  function isColor(s) { return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s); }
  function isName(s) { return typeof s === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(s); }
  function localized(obj) { return !!obj && LOCALES.every(function (l) { return isPlainText(obj[l]); }); }
  function localizedList(obj) {
    return !!obj && LOCALES.every(function (l) { return Array.isArray(obj[l]) && obj[l].length > 0 && obj[l].every(isPlainText); });
  }
  function isNum(n, lo, hi) { return typeof n === "number" && isFinite(n) && n >= lo && n <= hi; }

  function atlasFrame(atlas, sheet, frame) {
    var a = atlas && atlas.atlases && atlas.atlases[sheet];
    return a && a.frames && a.frames[frame] ? { sheet: a, rect: a.frames[frame] } : null;
  }
  function sheetsOf(spec) {
    if (typeof spec === "string") return [spec];
    if (spec && typeof spec === "object") return LIGHTINGS.map(function (l) { return spec[l]; }).filter(Boolean);
    return [];
  }

  // Validates manifest + atlas against the engine contract. Returns { ok, errors }.
  function validatePack(manifest, atlas, expectedId) {
    var errors = [];
    function err(m) { errors.push(m); }
    if (!manifest || manifest.schema !== SCHEMA) return { ok: false, errors: ["schema"] };
    if (manifest.id !== expectedId) err("id mismatch");
    var eng = manifest.engine || {};
    if (!(eng.min <= ENGINE_VERSION && ENGINE_VERSION <= eng.max)) err("engine incompatible");
    if (!localized(manifest.names)) err("names");
    if (!localized(manifest.blurb)) err("blurb");
    if (!atlas || atlas.schema !== ATLAS_SCHEMA || atlas.world !== expectedId) err("atlas");
    var atlases = (atlas && atlas.atlases) || {};
    Object.keys(atlases).forEach(function (k) {
      if (!isName(k) || !/^[a-z0-9-]+\.png$/.test(atlases[k].file || "")) err("atlas file " + k);
    });
    function sheetOk(spec, frame, tag) {
      var list = sheetsOf(spec);
      if (!list.length) { err(tag + " sheet"); return; }
      list.forEach(function (s) { if (!atlases[s] || (frame && !atlases[s].frames[frame])) err(tag + " sheet " + s + (frame ? "." + frame : "")); });
    }
    ["light", "dark"].forEach(function (mode) {
      var skin = manifest.skin && manifest.skin[mode];
      if (!skin) { err("skin." + mode); return; }
      Object.keys(skin).forEach(function (k) {
        if (COLOR_TOKENS.indexOf(k) >= 0) { if (!isColor(skin[k])) err("skin." + mode + "." + k); }
        else err("skin token not allowed: " + k);
      });
    });
    var sc = manifest.scenery;
    if (!sc) err("scenery");
    else {
      if (!isNum(sc.sceneHeight, 40, 400) || !isNum(sc.groundY, 0, 200)) err("scenery size");
      LIGHTINGS.forEach(function (l) {
        var li = sc.lighting && sc.lighting[l];
        if (!li || !Array.isArray(li.sky) || li.sky.length < 2 || li.sky.length > 8 || !li.sky.every(isColor)) err("lighting." + l);
        ["star", "actorTint", "lampLight"].forEach(function (k) { if (li && li[k] != null && !isColor(li[k])) err("lighting." + l + "." + k); });
      });
      Object.keys(sc.celestial || {}).forEach(function (l) {
        var c = sc.celestial[l];
        if (LIGHTINGS.indexOf(l) < 0 || !c) { err("celestial " + l); return; }
        sheetOk(c.sheet, c.frame, "celestial " + l);
        if (!isNum(c.at, 0, 1) || !isNum(c.top, 0, 400)) err("celestial " + l + " position");
      });
      (sc.layers || []).forEach(function (L) {
        var tag = "layer " + (L && L.id);
        if (!L || !isName(L.id)) { err(tag); return; }
        sheetOk(L.sheet, L.frame, tag);
        if (!isNum(L.parallax, 0, 2) || !isNum(L.bottom || 0, 0, 400)) err(tag + " geometry");
        if (L.drift != null && !isNum(L.drift, -60, 60)) err(tag + " drift");
        (L.lamps || []).forEach(function (lp) { if (!isNum(lp.x, 0, 4096) || !isNum(lp.head, 0, 4096)) err(tag + " lamp"); });
      });
      var em = sc.emitters || {};
      if (em.clouds) { em.clouds.frames.forEach(function (f) { sheetOk(em.clouds.sheet, f, "clouds"); }); if (!isNum(em.clouds.count, 0, 40)) err("clouds count"); }
      if (em.birds) { em.birds.frames.forEach(function (f) { sheetOk(em.birds.sheet, f, "birds"); }); }
      if (em.stars && !isNum(em.stars.count, 0, 400)) err("stars count");
      (sc.walkers || []).forEach(function (w, i) {
        var a = manifest.actors && manifest.actors[w.actor];
        var frames = (w.frames || []).concat(w.rest ? [w.rest] : []);
        if (!a || !frames.length || !frames.every(function (f) { return sheetsOf(a.sheet).every(function (s) { return atlases[s] && atlases[s].frames[f]; }); })) err("walker " + i);
        if (!isNum(w.speed, 1, 120) || !Array.isArray(w.every) || !isNum(w.every[0], 1000, 600000) || !isNum(w.every[1], w.every[0], 600000)) err("walker " + i + " timing");
      });
    }
    var actors = manifest.actors || {};
    Object.keys(actors).forEach(function (id) {
      var a = actors[id];
      if (!isName(id) || !a || !sheetsOf(a.sheet).length || !sheetsOf(a.sheet).every(function (s) { return atlases[s]; })) { err("actor " + id); return; }
      if (a.fictional !== true && !a.prototypeRef) err("actor " + id + " must be fictional or reference a CHARACTERS card");
      if (a.names && !localized(a.names)) err("actor " + id + " names");
      if (a.lines && !localizedList(a.lines)) err("actor " + id + " lines");
    });
    function frameOk(actor, frame) {
      var a = actors[actor];
      return !!a && sheetsOf(a.sheet).length > 0 && sheetsOf(a.sheet).every(function (s) { return !!atlasFrame(atlas, s, frame); });
    }
    var locs = manifest.locations || {};
    Object.keys(locs).forEach(function (id) {
      var L = locs[id];
      if (!isName(id) || !L || PHASES.indexOf(L.phase) < 0 || !isNum(L.x, -100000, 100000)) { err("location " + id); return; }
      if (!localized(L.names)) err("location " + id + " names");
      if (L.lighting && LIGHTINGS.indexOf(L.lighting) < 0) err("location " + id + " lighting");
      if (L.sign) {
        var sg = L.sign;
        if (!isPlainText(sg.he) || !/[\u05d0-\u05ea]/.test(sg.he) || !isPlainText(sg.translit) || !localized(sg.gloss) || !isNum(sg.x, -400, 400)) err("location " + id + " sign");
      }
      (L.props || []).forEach(function (p) { if (!frameOk(p.actor, p.frame)) err("location " + id + " prop " + p.actor); });
      (L.fx || []).forEach(function (fx) {
        if (["papers", "searchlights"].indexOf(fx.kind) < 0) err("location " + id + " fx kind");
        if (fx.color != null && !isColor(fx.color)) err("location " + id + " fx color");
      });
    });
    var slots = manifest.slots || {};
    Object.keys(slots).forEach(function (slot) {
      if (SLOTS.indexOf(slot) < 0) { err("slot not allowed: " + slot); return; }
      var s = slots[slot];
      if (!isNum(s.origin, 0, 1)) err("slot " + slot + " origin");
      (s.rest || []).forEach(function (r) { if (!frameOk(r.actor, r.frame) || typeof r.x !== "number") err("slot " + slot + " rest " + r.actor); });
    });
    var ids = {};
    (manifest.scenes || []).forEach(function (s) {
      var tag = "scene " + (s && s.id);
      if (!s || !isName(s.id) || ids[s.id]) { err(tag + " id"); return; }
      ids[s.id] = true;
      if (!slots[s.slot]) err(tag + " slot");
      if (typeof s.trigger !== "string" || !TRIGGER_RE.test(s.trigger)) err(tag + " trigger");
      if (s.location && !locs[s.location]) err(tag + " location");
      var cap = s.trigger === "manual" ? BUDGET.maxManualDurationMs : BUDGET.maxDurationMs;
      if (!(s.durationMs > 0 && s.durationMs <= cap)) err(tag + " duration");
      if (!localized(s.title) || !localized(s.caption)) err(tag + " text");
      if (s.expires && !/^\d{4}-\d{2}-\d{2}$/.test(s.expires)) err(tag + " expires");
      if (s.modes && !s.modes.every(function (m) { return MODES.indexOf(m) >= 0; })) err(tag + " modes");
      (s.tracks || []).forEach(function (tr) {
        if (!actors[tr.actor]) { err(tag + " actor " + tr.actor); return; }
        var last = -1;
        (tr.keys || []).forEach(function (k) {
          if (!(k.t >= last && k.t <= s.durationMs)) err(tag + " key order " + tr.actor);
          last = k.t;
          if (k.frame && !frameOk(tr.actor, k.frame)) err(tag + " frame " + tr.actor + "." + k.frame);
          (k.cycle || []).forEach(function (f) { if (!frameOk(tr.actor, f)) err(tag + " cycle " + f); });
        });
      });
      if (!s.staticPose || !(s.staticPose || []).every(function (r) { return frameOk(r.actor, r.frame); })) err(tag + " staticPose");
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // Scene timeline sampling: steps for frames, linear for x/y, visibility via `hidden`.
  function sampleTrack(track, t) {
    var keys = track.keys || [];
    if (!keys.length) return null;
    var i = 0;
    while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
    var k = keys[i], n = keys[i + 1];
    var frame = k.frame, x = k.x, y = k.y || 0, hidden = !!k.hidden;
    if (k.cycle && k.cycle.length) frame = k.cycle[Math.floor((t - k.t) / (k.cycleMs || 160)) % k.cycle.length];
    if (n && !k.hold && t >= k.t) {
      var p = (t - k.t) / Math.max(1, n.t - k.t);
      if (typeof n.x === "number" && typeof x === "number") x = x + (n.x - x) * p;
      y = y + ((n.y || 0) - y) * p;
      if (typeof k.arc === "number") y += k.arc * 4 * p * (1 - p);
    }
    return { actor: track.actor, frame: frame, x: Math.round(x), y: Math.round(y), hidden: hidden, flip: !!k.flip };
  }
  function sampleScene(scene, t) {
    return (scene.tracks || []).map(function (tr) { return sampleTrack(tr, t); }).filter(Boolean);
  }

  function sceneActive(scene, mode, todayIso) {
    if (scene.expires && todayIso > scene.expires) return false;
    if (scene.modes && scene.modes.indexOf(mode) < 0) return false;
    return true;
  }

  // Journey between two locations: walk duration and a synthetic walking track.
  function journey(fromX, toX, cycle) {
    var dx = toX - fromX;
    var ms = Math.max(1200, Math.min(3200, Math.abs(dx) * 3));
    return { ms: ms, track: { actor: "timsah", keys: [
      { t: 0, cycle: cycle || ["walk-a", "walk-b"], cycleMs: 150, x: fromX, flip: dx < 0 },
      { t: ms, frame: "idle", x: toX, hold: true }
    ] } };
  }

  function locationForPhase(manifest, phase) {
    var locs = manifest.locations || {};
    var ids = Object.keys(locs);
    for (var i = 0; i < ids.length; i++) if (locs[ids[i]].phase === phase) return ids[i];
    // "correct" shares the table stop; anything unknown starts at the first location.
    if (phase === "correct") return locationForPhase(manifest, "table");
    return ids[0] || null;
  }

  // Budget governor. Late events are dropped, never queued. Kinds:
  //   auto    — spontaneous reactions (table ready …): cooldown + per-session cap;
  //   story   — the payoff of a user's own step (arriving at the polling station): no budget,
  //             but still never while paused, hidden or under reduced motion;
  //   ambient — background life in live mode: no budget, yields to everything else;
  //   manual  — the user asked (gallery / picker preview): only a hidden page stops it.
  function createGovernor(budget) {
    var b = Object.assign({}, BUDGET, budget || {});
    var autoCount = 0, lastEndAt = -Infinity, playing = false;
    return {
      request: function (kind, now, ctx) {
        ctx = ctx || {};
        if (playing) return { play: false, reason: "busy-scene" };
        if (ctx.hidden) return { play: false, reason: "hidden" };
        if (kind !== "manual") {
          if (ctx.reducedMotion) return { play: false, reason: "reduced-motion" };
          if (ctx.paused) return { play: false, reason: "paused" };
        }
        if (kind === "auto" || kind === "ambient") {
          if (ctx.busy) return { play: false, reason: ctx.busy };
        }
        if (kind === "auto") {
          if (autoCount >= b.maxAutoPerSession) return { play: false, reason: "session-cap" };
          if (now - lastEndAt < b.cooldownMs) return { play: false, reason: "cooldown" };
        }
        return { play: true };
      },
      started: function (kind) { playing = true; if (kind === "auto") autoCount++; },
      ended: function (now, kind) { playing = false; if (kind === "auto") lastEndAt = now; },
      state: function () { return { autoCount: autoCount, playing: playing, lastEndAt: lastEndAt }; }
    };
  }

  var core = {
    ENGINE_VERSION: ENGINE_VERSION, STORAGE_KEY: STORAGE_KEY, REGISTRY: REGISTRY, BUDGET: BUDGET,
    COLOR_TOKENS: COLOR_TOKENS, SLOTS: SLOTS, TRIGGER_RE: TRIGGER_RE, PHASES: PHASES,
    readChoice: readChoice, validatePack: validatePack, sampleScene: sampleScene, sampleTrack: sampleTrack,
    sceneActive: sceneActive, createGovernor: createGovernor, journey: journey, locationForPhase: locationForPhase
  };
  if (typeof document === "undefined") return { core: core };

  // ── DOM layer ──────────────────────────────────────────────────────────────

  var state = {
    choice: null, pack: null, atlas: null, base: "", images: {}, governor: createGovernor(),
    stage: null, backdrop: null, raf: 0, lastFrame: 0, listeners: [], observers: [], styleEl: null, linkEl: null,
    location: null, walk: null, scene: null, react: null, bubble: null, nextAmbient: 0, visible: true,
    walkers: [], walkerNext: []
  };

  function tr(key, fallback) {
    try { var v = window.t ? window.t(key) : null; if (v && v !== key) return v; } catch (_) {}
    return fallback || key;
  }
  function locale() {
    var l = (document.documentElement.getAttribute("lang") || "ru").slice(0, 2);
    return LOCALES.indexOf(l) >= 0 ? l : "ru";
  }
  function storageGet() { try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } }
  function storageSet(v) { try { if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); else localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  function reducedMotion() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function now() { return performance.now(); }

  // Why an automatic reaction must not start now. Reads states only — never content.
  function busyReason() {
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !a.closest("[data-world-ui]")) return "typing";
    var dialogs = document.querySelectorAll("dialog[open], [aria-modal='true'], .v3-modal[data-open='1']");
    for (var j = 0; j < dialogs.length; j++) if (dialogs[j].offsetParent !== null && !dialogs[j].hasAttribute("data-world-ui")) return "dialog";
    return null;
  }

  function assetUrl(file) { return state.base + file + "?v=" + encodeURIComponent(state.pack.version); }

  // ── skin ──
  function applySkin() {
    var decl = [];
    ["light", "dark"].forEach(function (mode) {
      var skin = state.pack.skin[mode];
      Object.keys(skin).forEach(function (k) {
        decl.push("--lpw-" + mode + "-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }) + ":" + skin[k]);
      });
    });
    decl.push("--lpw-scene-h:" + state.pack.scenery.sceneHeight, "--lpw-ground:" + state.pack.scenery.groundY);
    if (!state.styleEl) { state.styleEl = document.createElement("style"); state.styleEl.setAttribute("data-world-ui", ""); document.head.appendChild(state.styleEl); }
    state.styleEl.textContent = "html[data-world]{" + decl.join(";") + "}";
    ensureCss();
    document.documentElement.setAttribute("data-world", state.pack.id);
  }
  // The mapping stylesheet is requested only when a world turns on or the picker opens. Once
  // loaded it stays: every world rule is scoped to html[data-world], so it is inert under Classic.
  function ensureCss() {
    if (state.linkEl) return;
    state.linkEl = document.createElement("link");
    state.linkEl.rel = "stylesheet";
    state.linkEl.href = CSS_URL;
    state.linkEl.setAttribute("data-world-ui", "");
    document.head.appendChild(state.linkEl);
  }
  function clearSkin() {
    document.documentElement.removeAttribute("data-world");
    if (state.styleEl) { state.styleEl.remove(); state.styleEl = null; }
  }

  // ── loading ──
  function loadScript(src) {
    if (window.LPWorldRender) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.setAttribute("data-world-ui", "");
      s.onload = function () { window.LPWorldRender ? resolve() : reject(new Error("renderer missing")); };
      s.onerror = function () { reject(new Error("renderer load failed")); };
      document.head.appendChild(s);
    });
  }
  function loadImage(file) {
    if (state.images[file]) return Promise.resolve(state.images[file]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () { state.images[file] = img; resolve(img); };
      img.onerror = function () { reject(new Error("image " + file)); };
      img.src = assetUrl(file);
    });
  }
  // Only the sheets the current lighting needs are fetched (plus actors); others load on switch.
  function sheetsForLighting(lighting) {
    var p = state.pack, sc = p.scenery, set = {};
    function add(spec) {
      if (!spec) return;
      var s = typeof spec === "string" ? spec : (spec[lighting] || spec.dusk || spec.day || spec.night);
      if (s) set[s] = true;
    }
    (sc.layers || []).forEach(function (L) { add(L.sheet); });
    if (sc.celestial && sc.celestial[lighting]) add(sc.celestial[lighting].sheet);
    var em = sc.emitters || {};
    if (em.clouds) add(em.clouds.sheet);
    if (em.birds && em.birds.lighting.indexOf(lighting) >= 0) add(em.birds.sheet);
    Object.keys(p.actors).forEach(function (a) { add(p.actors[a].sheet); });
    return Object.keys(set).map(function (s) { return state.atlas.atlases[s].file; });
  }
  function loadLighting(lighting) { return Promise.all(sheetsForLighting(lighting).map(loadImage)); }

  // A location may force its lighting (counting night); a dark app theme means election night;
  // otherwise the learner's local clock picks day / dusk / night.
  function currentLighting() {
    var loc = state.location && state.pack.locations[state.location];
    var forced = loc && loc.lighting;
    if (!forced && document.body && document.body.classList.contains("theme-dark")) forced = "night";
    return window.LPWorldRender.core.lightingFor(new Date().getHours(), forced);
  }

  // ── stage geometry: full-bleed behind the Studio head, from the page top to the street band ──
  function layoutStage() {
    var st = state.stage;
    if (!st) return;
    var host = st.el.parentElement;
    var hr = host.getBoundingClientRect();
    // The app may declare a nearer bottom edge on narrow layouts (the street band under the title).
    var bottom = hr.bottom;
    var narrowSel = st.el.getAttribute("data-world-bottom-narrow");
    if (narrowSel && window.matchMedia && window.matchMedia("(max-width: 600px)").matches) {
      var until = host.querySelector(narrowSel);
      if (until) bottom = until.getBoundingClientRect().bottom;
    }
    var docW = document.documentElement.clientWidth;
    var top = hr.top + window.scrollY;                     // head top in page coordinates
    var height = bottom - hr.top + top;
    st.el.style.left = (-hr.left) + "px";
    st.el.style.top = (-top) + "px";
    st.el.style.width = docW + "px";
    st.el.style.height = height + "px";
    var scale = stageScale(st.el);
    st.scale = scale;
    st.renderer.resize(docW, height, scale);
    st.originPx = Math.round(docW * state.pack.slots["studio-stage"].origin);
    if (state.backdrop) state.backdrop.renderer.resize(docW, window.innerHeight, scale);
    if (state.location && !state.walk) st.renderer.panTo(cameraFor(locX()), 0, now());
    drawOnce();
  }
  function stageScale(el) {
    var v = parseInt(getComputedStyle(el).getPropertyValue("--lpw-scale"), 10);
    return v >= 1 && v <= 6 ? v : DEFAULT_SCALE;
  }

  // ── actors & camera ──
  function locX() { var L = state.pack.locations[state.location]; return L ? L.x : 0; }
  function cameraFor(worldX) {
    var st = state.stage;
    return worldX - Math.round((st ? st.originPx / st.scale : 60));
  }

  function composePose(t) {
    var p = state.pack, pose = [], base = locX();
    var controlled = {};
    if (state.scene) {
      var sc = state.scene;
      var sLoc = sc.def.location ? p.locations[sc.def.location].x : base;
      sampleScene(sc.def, t - sc.start).forEach(function (s, i) {
        var track = sc.def.tracks[i];
        controlled[s.actor] = true;
        pose.push(Object.assign({ z: track.z || 1 }, s, { worldX: sLoc + s.x }));
      });
    }
    if (state.walk && !controlled.timsah) {
      var w = state.walk;
      var s2 = sampleTrack(w.track, t - w.start);
      controlled.timsah = true;
      pose.push(Object.assign({ z: 3 }, s2, { worldX: s2.x }));
    }
    if (state.react && !controlled.timsah) {
      var r = state.react, rt = t - r.start;
      var hop = rt < 420 ? Math.round(8 * 4 * (rt / 420) * (1 - rt / 420)) : 0;
      controlled.timsah = true;
      pose.push({ actor: "timsah", frame: rt < 420 ? "jump" : "blink", worldX: base, y: hop, z: 3 });
    }
    walkersPose(t).forEach(function (w) { pose.push(w); });
    (p.slots["studio-stage"].rest || []).forEach(function (r) {
      if (!controlled[r.actor]) pose.push({ actor: r.actor, frame: blinkFrame(r.frame, t), worldX: base + r.x, y: 0, z: 3 });
    });
    Object.keys(p.locations).forEach(function (id) {
      var L = p.locations[id];
      (L.props || []).forEach(function (pr) {
        if (state.scene && state.scene.def.location === id && controlled[pr.actor]) return;
        pose.push({ actor: pr.actor, frame: pr.frame, worldX: L.x + pr.x, y: pr.y || 0, z: pr.z || 2, back: !!pr.back, ground: pr.ground });
      });
    });
    return pose;
  }
  // Street life: neighbours and a cat cross the view now and then (live mode only), in both
  // directions; the cat may sit down halfway. Positions live in world space, so a journey pans
  // past them naturally. Never while paused / reduced motion (the loop does not run then).
  function walkersPose(t) {
    var defs = state.pack.scenery.walkers || [];
    var st = state.stage;
    if (!st || !defs.length || !(state.choice && state.choice.mode === "live")) return [];
    var cam = st.renderer.camera(), viewW = st.renderer.size().w;
    defs.forEach(function (d, i) {
      if (state.walkerNext[i] == null) state.walkerNext[i] = t + d.every[0] * (0.3 + 0.7 * ((i * 7919) % 97) / 97);
      var busy = state.walkers.some(function (w) { return w.def === i; });
      if (!busy && t > state.walkerNext[i]) {
        var rightward = ((Math.floor(t) >> 4) + i) % 2 === 0;
        var sits = d.rest && ((Math.floor(t) >> 3) % 100) / 100 < (d.sitChance || 0);
        state.walkers.push({ def: i, x: rightward ? cam - 24 : cam + viewW + 24, dir: rightward ? 1 : -1, start: t, last: t,
          sitAt: sits ? cam + viewW * (0.35 + 0.3 * (((Math.floor(t) >> 5) % 10) / 10)) : null, sitUntil: 0 });
      }
    });
    var out = [];
    state.walkers = state.walkers.filter(function (w) {
      var d = defs[w.def], dt = Math.min(100, t - w.last);
      w.last = t;
      var frame;
      if (w.sitUntil && t < w.sitUntil) frame = d.rest;
      else {
        if (w.sitAt != null && (w.dir > 0 ? w.x >= w.sitAt : w.x <= w.sitAt)) { w.sitUntil = t + 2600; w.sitAt = null; frame = d.rest; }
        else { w.x += w.dir * d.speed * dt / 1000; frame = d.frames[Math.floor((t - w.start) / (d.cycleMs || 200)) % d.frames.length]; }
      }
      var gone = w.dir > 0 ? w.x > cam + viewW + 40 : w.x < cam - 40;
      if (gone) { state.walkerNext[w.def] = t + d.every[0] + (d.every[1] - d.every[0]) * (((Math.floor(t) >> 6) % 17) / 17); return false; }
      out.push({ actor: d.actor, frame: frame, worldX: w.x, y: 0, lane: d.lane || 0, z: 1, flip: w.dir < 0 });
      return true;
    });
    return out;
  }

  // Idle life: a blink every few seconds, deterministic so screenshots are reproducible.
  function blinkFrame(frame, t) { return frame === "idle" && (t % 4200) < 160 ? "blink" : frame; }

  // ── ticker ──
  function animating() {
    return !!state.pack && !document.hidden && !(state.choice && state.choice.paused) && !reducedMotion();
  }
  function renderFrame(t, dt) {
    var st = state.stage;
    if (state.walk) {
      var w = state.walk, wt = t - w.start;
      st && st.renderer.panTo(cameraFor(sampleTrack(w.track, Math.min(wt, w.ms)).x), 0, t);
      if (wt >= w.ms) { state.walk = null; onArrive(w.to); }
    }
    if (state.scene && t - state.scene.start >= state.scene.def.durationMs) endScene();
    if (state.react && t - state.react.start > 3200) { state.react = null; hideBubble(); }
    if (st && state.visible) {
      st.renderer.setPose(composePose(t));
      st.renderer.render("stage", t, dt);
      positionBubble();
      syncSign();
    }
    if (state.backdrop) {
      state.backdrop.renderer.setScroll(window.scrollY);
      if (st) state.backdrop.renderer.panTo(st.renderer.camera() + window.scrollY / 6, 0, t);
      state.backdrop.renderer.render("backdrop", t, dt);
    }
    if (state.choice && state.choice.mode === "live" && !state.scene && !state.walk && t > state.nextAmbient) {
      state.nextAmbient = t + BUDGET.ambientEveryMs;
      signal("ambient");
    }
  }
  function loop(ts) {
    state.raf = 0;
    if (!animating()) return;
    state.raf = requestAnimationFrame(loop);
    if (ts - state.lastFrame < FRAME_MS) return;
    var dt = state.lastFrame ? Math.min(100, ts - state.lastFrame) : FRAME_MS;
    state.lastFrame = ts;
    renderFrame(ts, dt);
  }
  function kick() {
    if (!state.raf && animating()) { state.lastFrame = 0; state.raf = requestAnimationFrame(loop); }
  }
  function drawOnce() {
    if (!state.pack) return;
    if (animating()) { kick(); return; }
    // Still frame (paused / reduced motion / hidden): finish transitions instantly, draw once.
    if (state.walk) { var to = state.walk.to; state.walk = null; onArrive(to, true); }
    renderFrame(now(), 0);
  }

  // ── scenes ──
  function scenesFor(trigger) {
    var mode = state.choice ? state.choice.mode : "live";
    return (state.pack.scenes || []).filter(function (s) { return s.trigger === trigger && sceneActive(s, mode, today()); });
  }
  function startScene(def, kind) {
    if (state.scene) return { played: false, reason: "busy-scene" };
    if (reducedMotion() || (state.choice && state.choice.paused)) {
      // No movement: show the static substitute until the next change.
      state.stage && state.stage.renderer.setPose(def.staticPose.map(function (r) {
        var base = def.location ? state.pack.locations[def.location].x : locX();
        return { actor: r.actor, frame: r.frame, worldX: base + r.x, y: 0, z: r.z || 1 };
      }));
      state.stage && state.stage.renderer.render("stage", now(), 0);
      return { played: true, static: true };
    }
    state.governor.started(kind);
    state.scene = { def: def, start: now(), kind: kind };
    kick();
    return { played: true };
  }
  function endScene() {
    if (!state.scene) return;
    var kind = state.scene.kind;
    state.scene = null;
    state.governor.ended(now(), kind);
    state.nextAmbient = Math.max(state.nextAmbient, now() + BUDGET.ambientEveryMs);
  }
  function signal(trigger) {
    if (!state.pack || !TRIGGER_RE.test(trigger) || trigger === "manual") return { played: false, reason: "inactive" };
    var list = scenesFor(trigger);
    if (!list.length) return { played: false, reason: "no-scene" };
    var kind = /^arrive\./.test(trigger) ? "story" : trigger === "ambient" ? "ambient" : "auto";
    // A story beat or reaction pre-empts background life; ambient never pre-empts anything.
    if (kind !== "ambient" && state.scene && state.scene.kind === "ambient") endScene();
    var d = state.governor.request(kind, now(), { hidden: document.hidden, reducedMotion: reducedMotion(), paused: state.choice && state.choice.paused, busy: busyReason() });
    if (!d.play) return { played: false, reason: d.reason };
    return startScene(list[0], kind);
  }
  function play(sceneId) {
    if (!state.pack) return { played: false, reason: "inactive" };
    var sc = (state.pack.scenes || []).filter(function (s) { return s.id === sceneId; })[0];
    if (!sc) return { played: false, reason: "unknown-scene" };
    endScene();
    if (sc.location && sc.location !== state.location) goTo(sc.location, true);
    var d = state.governor.request("manual", now(), { hidden: document.hidden });
    if (!d.play) return { played: false, reason: d.reason };
    return startScene(sc, "manual");
  }

  // ── journey ──
  function goTo(locId, instant) {
    if (!state.pack.locations[locId]) return;
    if (locId === state.location && !state.walk && !instant) return;
    var from = state.walk ? sampleTrack(state.walk.track, now() - state.walk.start).x : locX();
    var toX = state.pack.locations[locId].x;
    endScene();
    state.react = null; hideBubble();
    if (instant || !animating()) {
      state.walk = null;
      state.location = locId;
      onArrive(locId, true);
      return;
    }
    var j = journey(from, toX);
    state.walk = { track: j.track, ms: j.ms, start: now(), to: locId };
    kick();
  }
  function onArrive(locId, silent) {
    var prevLighting = state.stage && state.stage.renderer.lighting();
    state.location = locId;
    if (state.stage) state.stage.renderer.panTo(cameraFor(state.pack.locations[locId].x), 0, now());
    var lighting = currentLighting();
    if (lighting !== prevLighting) setLighting(lighting);
    if (!silent) signal("arrive." + locId);
    drawOnce();
  }
  function setLighting(lighting) {
    loadLighting(lighting).then(function () {
      if (!state.pack) return;
      if (state.stage) state.stage.renderer.setLighting(lighting);
      if (state.backdrop) state.backdrop.renderer.setLighting(lighting);
      document.documentElement.setAttribute("data-world-light", lighting);
      drawOnce();
    }).catch(function () {});
  }
  function watchPhase() {
    var el = document.getElementById("classicNextStep");
    if (!el || typeof MutationObserver === "undefined") { goTo(Object.keys(state.pack.locations)[0], true); return; }
    function sync(first) {
      var loc = locationForPhase(state.pack, el.getAttribute("data-phase") || "add");
      if (loc) goTo(loc, !!first);
    }
    var mo = new MutationObserver(function () { sync(false); });
    mo.observe(el, { attributes: true, attributeFilter: ["data-phase"] });
    state.observers.push(mo);
    sync(true);
  }

  // ── tap → reaction ──
  function lineFor(actorId) {
    var lines = state.pack.actors[actorId].lines;
    if (!lines) return null;
    var list = lines[locale()] || lines.ru;
    state.lineIndex = ((state.lineIndex == null ? -1 : state.lineIndex) + 1) % list.length;
    return list[state.lineIndex];
  }
  function onStageTap(e) {
    var st = state.stage;
    if (!st || state.walk) return;
    var r = st.canvas.getBoundingClientRect();
    var lx = (e.clientX - r.left) / st.scale, ly = (r.bottom - e.clientY) / st.scale;
    var tx = locX() - st.renderer.camera();
    var ground = state.pack.scenery.groundY;
    if (Math.abs(lx - tx) > 22 || ly < ground - 4 || ly > ground + 46) return;
    endScene();
    state.react = { start: now() };
    showBubble(lineFor("timsah"));
    if (!animating()) drawOnce(); else kick();
  }
  function showBubble(text) {
    if (!text || !state.stage) return;
    hideBubble();
    var b = document.createElement("div");
    b.className = "lp-world-bubble";
    b.setAttribute("aria-hidden", "true");
    b.lang = locale();
    b.dir = "auto";
    state.stage.el.appendChild(b);
    state.bubble = b;
    if (reducedMotion()) b.textContent = text;
    else {
      // typewriter: the full text reserves its width first, then characters appear
      b.textContent = text;
      var w = b.offsetWidth;
      b.style.width = w + "px";
      b.textContent = "";
      var i = 0;
      var timer = setInterval(function () {
        if (state.bubble !== b) { clearInterval(timer); return; }
        i += 2;
        b.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(timer);
      }, 28);
    }
    positionBubble();
  }
  // The bubble sits beside the speaker's head inside the street band (never over the panels):
  // to the right when there is room, otherwise to the left, tail pointing back at the head.
  function positionBubble() {
    var b = state.bubble, st = state.stage;
    if (!b || !st) return;
    var head = (locX() - st.renderer.camera()) * st.scale;
    var gap = 14 * st.scale;
    var right = head + gap + b.offsetWidth <= st.el.clientWidth - 8;
    // above the head, tail down to it; clamped inside the stage
    var left = Math.round(Math.max(8, Math.min(st.el.clientWidth - b.offsetWidth - 8, head - 12 * st.scale)));
    b.dataset.side = "up";
    b.style.setProperty("--lpw-tail", Math.max(10, Math.min(b.offsetWidth - 18, head - left)) + "px");
    b.style.left = "0px";
    b.style.transform = "translateX(" + left + "px)";
    b.style.bottom = ((state.pack.scenery.groundY + 43) * st.scale) + "px";
  }
  function hideBubble() { if (state.bubble) { state.bubble.remove(); state.bubble = null; } }

  // ── learning in the world: a Hebrew sign per location (a real control) + a route strip ──
  function speakHebrew(text) {
    try {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return false;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "he-IL"; u.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) { return false; }
  }
  function syncSign() {
    var st = state.stage;
    if (!st || !st.sign) return;
    var L = state.location && state.pack.locations[state.location];
    var sg = L && L.sign;
    if (!sg || state.walk) { st.sign.hidden = true; return; }
    if (st.sign.dataset.loc !== state.location) {
      st.sign.dataset.loc = state.location;
      st.signHe.textContent = sg.he;
      st.signTr.textContent = sg.translit;
      st.sign.setAttribute("aria-label", sg.he + " — " + (sg.gloss[locale()] || sg.gloss.ru) + ". " + tr("world.signListen", "Послушать"));
    }
    st.sign.hidden = false;
    // An A-frame on the pavement just left of Timsah: the landmark stays uncovered, the bubble
    // (above his head) never overlaps it. transform-only: following the camera never shifts layout.
    var head = (L.x - st.renderer.camera()) * st.scale;
    var x = head - 18 * st.scale - st.sign.offsetWidth;
    st.sign.style.left = "0px";
    st.sign.style.transform = "translateX(" + Math.round(Math.max(8, x)) + "px)";
    st.sign.style.bottom = Math.round((state.pack.scenery.groundY - 2) * st.scale) + "px";
    var ids = Object.keys(state.pack.locations), idx = ids.indexOf(state.location);
    Array.prototype.forEach.call(st.route.children, function (li, i) {
      li.dataset.state = i < idx ? "done" : i === idx ? "here" : "next";
    });
  }
  function onSign() {
    var L = state.pack.locations[state.location];
    if (!L || !L.sign) return;
    speakHebrew(L.sign.he);
    state.react = { start: now() };
    showBubble(L.sign.translit + " — " + (L.sign.gloss[locale()] || L.sign.gloss.ru));
    if (!animating()) drawOnce(); else kick();
  }

  // ── pause control (visible, WCAG 2.2.2) ──
  function syncPauseButton() {
    var st = state.stage;
    if (!st || !st.pause) return;
    var paused = !!(state.choice && state.choice.paused);
    st.pause.setAttribute("aria-pressed", paused ? "true" : "false");
    var label = paused ? tr("world.resume", "Оживить мир") : tr("world.pause", "Остановить мир");
    st.pause.setAttribute("aria-label", label);
    st.pause.title = label;
    st.pause.dataset.state = paused ? "paused" : "playing";
  }
  function togglePause() {
    if (!state.choice) return;
    state.choice.paused = !state.choice.paused;
    storageSet(state.choice);
    syncPauseButton();
    if (state.choice.paused) { endScene(); state.react = null; hideBubble(); drawOnce(); }
    else kick();
  }

  // ── mount / unmount ──
  function mountStage() {
    var el = document.querySelector('[data-world-slot="studio-stage"]');
    if (!el || !state.pack.slots["studio-stage"]) return;
    el.hidden = false;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    var pause = document.createElement("button");
    pause.type = "button";
    pause.className = "lp-world-pause";
    pause.setAttribute("data-world-ui", "");
    pause.innerHTML = '<span aria-hidden="true" class="lp-world-pause-icon"></span>';
    pause.addEventListener("click", togglePause);
    el.appendChild(pause);
    var sign = document.createElement("button");
    sign.type = "button";
    sign.className = "lp-world-sign";
    sign.setAttribute("data-world-ui", "");
    sign.hidden = true;
    var signHe = document.createElement("span");
    signHe.className = "lp-world-sign-he"; signHe.lang = "he"; signHe.dir = "rtl";
    var signTr = document.createElement("span");
    signTr.className = "lp-world-sign-tr"; signTr.lang = "he-Latn"; signTr.setAttribute("aria-hidden", "true");
    sign.appendChild(signHe); sign.appendChild(signTr);
    sign.addEventListener("click", onSign);
    el.appendChild(sign);
    var route = document.createElement("ol");
    route.className = "lp-world-route";
    route.setAttribute("aria-hidden", "true");
    Object.keys(state.pack.locations).forEach(function () { route.appendChild(document.createElement("li")); });
    el.appendChild(route);
    var renderer = window.LPWorldRender.createRenderer(canvas, { pack: state.pack, atlas: state.atlas, images: state.images, seed: 26 });
    state.stage = { el: el, canvas: canvas, pause: pause, sign: sign, signHe: signHe, signTr: signTr, route: route, renderer: renderer, scale: DEFAULT_SCALE, originPx: 0 };
    canvas.addEventListener("pointerdown", onStageTap);
    syncPauseButton();
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () { layoutStage(); });
      ro.observe(el.parentElement);
      state.observers.push(ro);
    }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (entries) { state.visible = entries[0].isIntersecting; });
      io.observe(el);
      state.observers.push(io);
    }
  }
  function mountBackdrop() {
    var el = document.querySelector('[data-world-slot="page-backdrop"]');
    if (!el || !state.pack.scenery.backdrop) return;
    el.hidden = false;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    state.backdrop = { el: el, canvas: canvas, renderer: window.LPWorldRender.createRenderer(canvas, { pack: state.pack, atlas: state.atlas, images: state.images, seed: 7 }) };
  }
  function unmount() {
    [state.stage, state.backdrop].forEach(function (m) {
      if (!m) return;
      while (m.el.firstChild) m.el.removeChild(m.el.firstChild);
      m.el.hidden = true;
      m.el.removeAttribute("style");
    });
    state.stage = null; state.backdrop = null; state.bubble = null;
    state.observers.forEach(function (o) { try { o.disconnect(); } catch (_) {} });
    state.observers = [];
  }

  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); state.listeners.push([target, type, fn, opts]); }
  function wireEvents() {
    // Studio's own table-job telemetry snapshot: only `state` is read — no text, no rows.
    on(window, "table-job-progress", function (e) { if (e && e.detail && e.detail.state === "done") signal("studio.table-ready"); });
    on(document, "visibilitychange", function () { if (document.hidden) endScene(); else { state.lastFrame = 0; kick(); } });
    on(window, "resize", function () { layoutStage(); });
    on(window, "scroll", function () { if (!animating()) drawOnce(); }, { passive: true });
    on(document, "i18n:changed", function () { syncPauseButton(); hideBubble(); if (state.stage && state.stage.sign) state.stage.sign.dataset.loc = ""; });
    if (typeof MutationObserver !== "undefined" && document.body) {
      var themeMo = new MutationObserver(function () {
        var l = currentLighting();
        if (state.stage && l !== state.stage.renderer.lighting()) setLighting(l);
      });
      themeMo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      state.observers.push(themeMo);
    }
    try {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      var onMq = function () { drawOnce(); kick(); };
      if (mq.addEventListener) { mq.addEventListener("change", onMq); state.listeners.push([mq, "change", onMq]); }
    } catch (_) {}
  }
  function unwireEvents() {
    state.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    state.listeners = [];
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function deactivate() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.scene = null; state.walk = null; state.react = null;
    unwireEvents();
    unmount();
    clearSkin();
    document.documentElement.removeAttribute("data-world-light");
    state.pack = null; state.atlas = null; state.images = {}; state.location = null;
    state.governor = createGovernor();
    document.dispatchEvent(new CustomEvent("lp-world:changed", { detail: { id: null } }));
  }

  function activate(choice) {
    var reg = REGISTRY[choice.id];
    state.base = reg.base;
    var v = encodeURIComponent(reg.pack);
    return Promise.all([fetchJson(reg.base + "manifest.json?v=" + v), fetchJson(reg.base + "atlas.json?v=" + v), loadScript(RENDER_URL)])
      .then(function (res) {
        var check = validatePack(res[0], res[1], choice.id);
        if (!check.ok) throw new Error("pack invalid: " + check.errors.slice(0, 5).join("; "));
        if (res[0].version !== reg.pack) throw new Error("pack version " + res[0].version + " != " + reg.pack);
        state.pack = res[0]; state.atlas = res[1]; state.choice = choice;
        state.location = null;   // set by the phase hook (or the first location) after layout
        return loadLighting(currentLighting());
      })
      .then(function () {
        applySkin();
        mountBackdrop();
        mountStage();
        var lighting = currentLighting();
        if (state.stage) state.stage.renderer.setLighting(lighting);
        if (state.backdrop) state.backdrop.renderer.setLighting(lighting);
        document.documentElement.setAttribute("data-world-light", lighting);
        wireEvents();
        layoutStage();
        watchPhase();
        state.nextAmbient = now() + 8000;
        kick();
        document.dispatchEvent(new CustomEvent("lp-world:changed", { detail: { id: choice.id, mode: choice.mode } }));
        return true;
      })
      .catch(function (e) {
        // A broken pack is a missing decoration, never a broken app: fall back to Classic.
        try { console.warn("[LPWorld] Classic fallback:", e && e.message); } catch (_) {}
        deactivate();
        return false;
      });
  }

  function boot() {
    try { if (/[?&]world=off\b/.test(location.search)) { storageSet(null); return Promise.resolve(false); } } catch (_) {}
    var choice = readChoice(storageGet());
    state.choice = choice;
    if (!choice) return Promise.resolve(false);
    return activate(choice);
  }

  function set(id, mode) {
    var choice = id ? readChoice(JSON.stringify({ id: id, mode: mode || "live" })) : null;
    if (state.pack) deactivate();
    storageSet(choice);
    state.choice = choice;
    return choice ? activate(choice) : Promise.resolve(false);
  }

  // ── picker (app-owned UI; strings from the app locales, pack text via textContent) ──

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  // Live thumbnail for a world option: the same renderer, loaded only when the picker opens.
  // A still frame under reduced motion; otherwise a gentle loop that stops when the dialog closes.
  function mountPreview(host, id, dlg) {
    var reg = REGISTRY[id];
    if (!reg) return;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-preview";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    var v = encodeURIComponent(reg.pack);
    Promise.all([fetchJson(reg.base + "manifest.json?v=" + v), fetchJson(reg.base + "atlas.json?v=" + v), loadScript(RENDER_URL)]).then(function (res) {
      var pack = res[0], atlas = res[1];
      if (!validatePack(pack, atlas, id).ok || !dlg.isConnected) return;
      var ids = Object.keys(pack.locations), pick = ids[ids.length - 1], loc = pack.locations[pick];
      var images = {}, lighting = loc.lighting || "dusk";
      var files = {};
      (pack.scenery.layers || []).forEach(function (L) { files[atlas.atlases[typeof L.sheet === "string" ? L.sheet : L.sheet[lighting]].file] = true; });
      var em = pack.scenery.emitters || {};
      if (em.clouds) files[atlas.atlases[typeof em.clouds.sheet === "string" ? em.clouds.sheet : em.clouds.sheet[lighting]].file] = true;
      Object.keys(pack.actors).forEach(function (a) { var sh = pack.actors[a].sheet; sh = typeof sh === "string" ? sh : (sh[lighting] || sh.dusk || sh.day || sh.night); if (sh) files[atlas.atlases[sh].file] = true; });
      return Promise.all(Object.keys(files).map(function (f) {
        return new Promise(function (ok) { var img = new Image(); img.onload = function () { images[f] = img; ok(); }; img.onerror = ok; img.src = reg.base + f + "?v=" + encodeURIComponent(pack.version); });
      })).then(function () {
        if (!dlg.isConnected) return;
        var r = window.LPWorldRender.createRenderer(canvas, { pack: pack, atlas: atlas, images: images, seed: 3 });
        var rect = host.getBoundingClientRect();
        r.resize(Math.max(160, Math.round(rect.width)), 112, 1);
        r.setLighting(lighting);
        var originX = loc.x;
        r.panTo(originX - Math.round(Math.max(160, rect.width) * 0.3), 0, performance.now());
        var props = (loc.props || []).map(function (pr) { return { actor: pr.actor, frame: pr.frame, worldX: loc.x + pr.x, y: 0, z: 1, back: !!pr.back }; });
        function pose(t) { return props.concat([{ actor: "timsah", frame: (t % 3600) < 150 ? "blink" : "idle", worldX: originX, y: 0, z: 3 }]); }
        var raf = 0, last = 0;
        function tick(t) {
          if (!dlg.isConnected || !dlg.open) return;
          raf = requestAnimationFrame(tick);
          if (t - last < 50) return;
          r.setPose(pose(t)); r.render("stage", t, last ? t - last : 50); last = t;
        }
        r.setPose(pose(0)); r.render("stage", performance.now(), 0);
        if (!reducedMotion()) raf = requestAnimationFrame(tick);
        dlg.addEventListener("close", function () { if (raf) cancelAnimationFrame(raf); });
      });
    }).catch(function () { canvas.remove(); });
  }

  function openPicker() {
    ensureCss();
    var existing = document.getElementById("lpWorldPicker");
    if (existing) existing.remove();
    var dlg = el("dialog", { id: "lpWorldPicker", class: "lp-world-picker", "data-world-ui": "", "aria-labelledby": "lpWorldPickerTitle" });
    var form = el("form", { method: "dialog", class: "lp-world-picker-form" });
    form.appendChild(el("h2", { id: "lpWorldPickerTitle" }, tr("world.pickerTitle", "Оформление")));
    form.appendChild(el("p", { class: "lp-world-picker-lead" }, tr("world.pickerLead", "")));

    var current = state.choice ? state.choice.id : "";
    var list = el("fieldset", { class: "lp-world-options" });
    list.appendChild(el("legend", { class: "lp-world-sr" }, tr("world.pickerTitle", "Оформление")));
    function option(value, title, note, badge) {
      var label = el("label", { class: "lp-world-option" });
      var input = el("input", { type: "radio", name: "lpWorld", value: value });
      if (value === current) input.checked = true;
      var copy = el("span", { class: "lp-world-option-copy" });
      var head = el("span", { class: "lp-world-option-title" }, title);
      if (badge) head.appendChild(el("span", { class: "lp-world-badge" }, badge));
      copy.appendChild(head);
      if (note) copy.appendChild(el("span", { class: "lp-world-option-note" }, note));
      label.appendChild(input); label.appendChild(copy);
      list.appendChild(label);
    }
    option("", tr("world.classic", "LinguistPro Classic"), tr("world.classicNote", ""));
    var names = { "israel-elections-2026": { ru: "Мир выборов в Израиле", en: "Israel Elections 2026", he: "עולם הבחירות 2026" } };
    Object.keys(REGISTRY).forEach(function (id) {
      if (REGISTRY[id].retired) return;
      option(id, (names[id] && names[id][locale()]) || id, tr("world.elections.note", ""), tr("world.satireBadge", ""));
      mountPreview(list.lastChild.querySelector(".lp-world-option-copy"), id, dlg);
    });
    form.appendChild(list);

    var modes = el("fieldset", { class: "lp-world-modes" });
    modes.appendChild(el("legend", {}, tr("world.modeLegend", "Движение")));
    [["live", tr("world.modeLive", "Живой")], ["calm", tr("world.modeCalm", "Спокойный")]].forEach(function (m) {
      var label = el("label", { class: "lp-world-option lp-world-option-compact" });
      var input = el("input", { type: "radio", name: "lpWorldMode", value: m[0] });
      if ((state.choice ? state.choice.mode : "live") === m[0]) input.checked = true;
      label.appendChild(input); label.appendChild(el("span", { class: "lp-world-option-title" }, m[1]));
      modes.appendChild(label);
    });
    form.appendChild(modes);
    form.appendChild(el("p", { class: "lp-world-privacy" }, tr("world.privacy", "")));

    var actions = el("div", { class: "lp-world-actions" });
    var preview = el("button", { type: "button", class: "lp-world-btn", "data-action": "preview" }, tr("world.preview", "Показать сценку"));
    var done = el("button", { type: "submit", class: "lp-world-btn lp-world-btn-primary", value: "done" }, tr("world.done", "Готово"));
    actions.appendChild(preview); actions.appendChild(done);
    form.appendChild(actions);
    dlg.appendChild(form);
    document.body.appendChild(dlg);

    function selected() {
      var w = form.querySelector("input[name=lpWorld]:checked");
      var m = form.querySelector("input[name=lpWorldMode]:checked");
      return { id: w ? w.value : "", mode: m ? m.value : "live" };
    }
    function syncModes() { modes.disabled = !selected().id; preview.disabled = !selected().id; }
    function applySelection() {
      var s = selected();
      var same = state.choice && state.choice.id === s.id && state.choice.mode === s.mode;
      if (same) return Promise.resolve(true);
      if (!s.id && !state.choice) return Promise.resolve(false);
      if (state.choice && state.choice.id === s.id) {
        state.choice.mode = s.mode; storageSet(state.choice); return Promise.resolve(true);
      }
      return set(s.id || null, s.mode);
    }
    form.addEventListener("change", function () { syncModes(); applySelection(); });
    preview.addEventListener("click", function () {
      applySelection().then(function () {
        var first = state.pack && (state.pack.scenes || []).filter(function (s) { return s.trigger !== "ambient"; })[0];
        dlg.close();
        if (first) setTimeout(function () { play(first.id); }, 150);
      });
    });
    dlg.addEventListener("close", function () { dlg.remove(); });
    syncModes();
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    return dlg;
  }

  function current() { return state.choice ? { id: state.choice.id, mode: state.choice.mode, paused: !!state.choice.paused, active: !!state.pack } : null; }
  function debugState() {
    return {
      choice: current(), governor: state.governor.state(), scene: state.scene ? { id: state.scene.def.id, kind: state.scene.kind } : null,
      walking: !!state.walk, location: state.location, lighting: state.stage ? state.stage.renderer.lighting() : null,
      busy: busyReason(), animating: animating(), camera: state.stage ? Math.round(state.stage.renderer.camera()) : null,
      stage: !!state.stage, backdrop: !!state.backdrop
    };
  }

  var api = {
    core: core, boot: boot, set: set, current: current, play: play, signal: signal, goTo: function (id) { if (state.pack) goTo(id, false); },
    setLighting: function (l) { if (state.pack && LIGHTINGS.indexOf(l) >= 0) setLighting(l); },
    togglePause: togglePause, stop: endScene, openPicker: openPicker, debugState: debugState
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); });
  else boot();
  return api;
});
