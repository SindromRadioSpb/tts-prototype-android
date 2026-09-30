/*
 * LinguistPro Worlds — World Engine v1 (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md).
 *
 * A world is a versioned, DECLARATIVE pack under /worlds/<id>/: manifest.json + atlas.json + PNG.
 * No script, HTML, CSS or network target comes from a pack. The engine owns:
 *   - which worlds may load at all (REGISTRY; a retired id never loads again after an update);
 *   - where decoration may appear (only elements the app marks with data-world-slot);
 *   - how skin values reach CSS (allowlisted tokens, validated colour/image values only);
 *   - when scenes play (one at a time, <= 3 s, cooldown, per-session cap, never over TTS/media,
 *     typing, an open dialog or a hidden page; reduced motion = static pose, no movement).
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

  var ENGINE_VERSION = 1;
  var STORAGE_KEY = "lp_world_v1";
  var SCHEMA = "lp-world/1";
  var ATLAS_SCHEMA = "lp-world-atlas/1";
  // Kill switch: an id missing here, or retired, never loads — the next successful app update
  // withdraws a world everywhere (offline clients keep the old shell until they update).
  var REGISTRY = {
    "israel-elections-2026": { base: "/worlds/israel-elections-2026/", pack: "0.1.0", retired: false }
  };
  var MODES = ["calm", "live"];
  var LOCALES = ["ru", "en", "he"];
  var SLOTS = ["studio-stage"];
  var TRIGGERS = ["studio.table-ready", "manual", "ambient"];
  var COLOR_TOKENS = ["page", "surface", "surfaceSoft", "ink", "line", "shadow", "accent", "accentInk", "stageSky", "stageHaze"];
  var IMAGE_TOKENS = ["pageTile", "stageStrip"];
  var BUDGET = { maxAutoPerSession: 3, cooldownMs: 120000, maxDurationMs: 3000, maxManualDurationMs: 8000 };
  // Integer pixel scale comes from CSS (--lpw-scale: 2 on phones, 3 on wide layouts) so art
  // never lands on a fractional grid; this is only the fallback.
  var DEFAULT_SCALE = 2;
  var CSS_URL = "/css/world-skin.css?v=705"; // lockstep with the sw.js precache key

  // ── pure core ──────────────────────────────────────────────────────────────

  function readChoice(raw) {
    if (!raw) return null;
    var v;
    try { v = JSON.parse(raw); } catch (_) { return null; }
    if (!v || typeof v !== "object" || typeof v.id !== "string") return null;
    var reg = REGISTRY[v.id];
    if (!reg || reg.retired) return null;
    return { id: v.id, mode: MODES.indexOf(v.mode) >= 0 ? v.mode : "calm" };
  }

  function isPlainText(s) { return typeof s === "string" && s.length > 0 && s.length <= 400 && !/[<>]/.test(s); }
  function isColor(s) { return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s); }
  function isName(s) { return typeof s === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(s); }
  function localized(obj) { return !!obj && LOCALES.every(function (l) { return isPlainText(obj[l]); }); }

  function atlasFrame(atlas, sheet, frame) {
    var a = atlas && atlas.atlases && atlas.atlases[sheet];
    return a && a.frames && a.frames[frame] ? { sheet: a, rect: a.frames[frame] } : null;
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
    ["light", "dark"].forEach(function (mode) {
      var skin = manifest.skin && manifest.skin[mode];
      if (!skin) { err("skin." + mode); return; }
      Object.keys(skin).forEach(function (k) {
        if (COLOR_TOKENS.indexOf(k) >= 0) { if (!isColor(skin[k])) err("skin." + mode + "." + k); }
        else if (IMAGE_TOKENS.indexOf(k) >= 0) { if (!atlases[skin[k]]) err("skin." + mode + "." + k); }
        else err("skin token not allowed: " + k);
      });
    });
    var actors = manifest.actors || {};
    Object.keys(actors).forEach(function (id) {
      var a = actors[id];
      if (!isName(id) || !a || !atlases[a.sheet]) { err("actor " + id); return; }
      if (a.fictional !== true && !a.prototypeRef) err("actor " + id + " must be fictional or reference a CHARACTERS card");
      if (a.names && !localized(a.names)) err("actor " + id + " names");
    });
    function frameOk(actor, frame) { var a = actors[actor]; return !!(a && atlasFrame(atlas, a.sheet, frame)); }
    var slots = manifest.slots || {};
    Object.keys(slots).forEach(function (slot) {
      if (SLOTS.indexOf(slot) < 0) { err("slot not allowed: " + slot); return; }
      var s = slots[slot];
      if (!(typeof s.origin === "number" && s.origin >= 0 && s.origin <= 1)) err("slot " + slot + " origin");
      (s.rest || []).forEach(function (r) { if (!frameOk(r.actor, r.frame) || typeof r.x !== "number") err("slot " + slot + " rest " + r.actor); });
    });
    var ids = {};
    (manifest.scenes || []).forEach(function (sc) {
      var tag = "scene " + (sc && sc.id);
      if (!sc || !isName(sc.id) || ids[sc.id]) { err(tag + " id"); return; }
      ids[sc.id] = true;
      if (!slots[sc.slot]) err(tag + " slot");
      if (TRIGGERS.indexOf(sc.trigger) < 0) err(tag + " trigger");
      var cap = sc.trigger === "manual" ? BUDGET.maxManualDurationMs : BUDGET.maxDurationMs;
      if (!(sc.durationMs > 0 && sc.durationMs <= cap)) err(tag + " duration");
      if (!localized(sc.title) || !localized(sc.caption)) err(tag + " text");
      if (sc.expires && !/^\d{4}-\d{2}-\d{2}$/.test(sc.expires)) err(tag + " expires");
      if (sc.modes && !sc.modes.every(function (m) { return MODES.indexOf(m) >= 0; })) err(tag + " modes");
      (sc.tracks || []).forEach(function (tr) {
        if (!actors[tr.actor]) { err(tag + " actor " + tr.actor); return; }
        var last = -1;
        (tr.keys || []).forEach(function (k) {
          if (!(k.t >= last && k.t <= sc.durationMs)) err(tag + " key order " + tr.actor);
          last = k.t;
          if (k.frame && !frameOk(tr.actor, k.frame)) err(tag + " frame " + tr.actor + "." + k.frame);
          (k.cycle || []).forEach(function (f) { if (!frameOk(tr.actor, f)) err(tag + " cycle " + f); });
        });
      });
      if (!sc.staticPose || !(sc.staticPose || []).every(function (r) { return frameOk(r.actor, r.frame); })) err(tag + " staticPose");
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

  // Budget governor. Late events are dropped, never queued.
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
          if (ctx.busy) return { play: false, reason: ctx.busy };
          if (autoCount >= b.maxAutoPerSession) return { play: false, reason: "session-cap" };
          if (now - lastEndAt < b.cooldownMs) return { play: false, reason: "cooldown" };
        }
        return { play: true };
      },
      started: function (kind) { playing = true; if (kind !== "manual") autoCount++; },
      ended: function (now) { playing = false; lastEndAt = now; },
      state: function () { return { autoCount: autoCount, playing: playing, lastEndAt: lastEndAt }; }
    };
  }

  var core = {
    ENGINE_VERSION: ENGINE_VERSION, STORAGE_KEY: STORAGE_KEY, REGISTRY: REGISTRY, BUDGET: BUDGET,
    COLOR_TOKENS: COLOR_TOKENS, IMAGE_TOKENS: IMAGE_TOKENS, SLOTS: SLOTS, TRIGGERS: TRIGGERS,
    readChoice: readChoice, validatePack: validatePack, sampleScene: sampleScene, sampleTrack: sampleTrack,
    sceneActive: sceneActive, createGovernor: createGovernor
  };
  if (typeof document === "undefined") return { core: core };

  // ── DOM layer ──────────────────────────────────────────────────────────────

  var state = { choice: null, pack: null, atlas: null, governor: createGovernor(), stages: {}, raf: 0, current: null, listeners: [], styleEl: null, linkEl: null };

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

  // Why a decorative scene must not start now. Reads states only — never content.
  function busyReason() {
    try { if (window.speechSynthesis && window.speechSynthesis.speaking) return "tts"; } catch (_) {}
    var media = document.querySelectorAll("audio, video");
    for (var i = 0; i < media.length; i++) if (!media[i].paused && !media[i].ended) return "media";
    if (document.querySelector(".yt-playing, [data-playing='1']")) return "media";
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !a.closest("[data-world-ui]")) return "typing";
    var dialogs = document.querySelectorAll("dialog[open], [aria-modal='true'], .v3-modal[data-open='1']");
    for (var j = 0; j < dialogs.length; j++) if (dialogs[j].offsetParent !== null && !dialogs[j].hasAttribute("data-world-ui")) return "dialog";
    return null;
  }

  function assetUrl(file) { return state.base + file + "?v=" + encodeURIComponent(state.pack.version); }

  function applySkin() {
    var html = document.documentElement;
    var decl = [];
    ["light", "dark"].forEach(function (mode) {
      var skin = state.pack.skin[mode];
      Object.keys(skin).forEach(function (k) {
        var name = "--lpw-" + mode + "-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
        var v = IMAGE_TOKENS.indexOf(k) >= 0 ? 'url("' + assetUrl(state.atlas.atlases[skin[k]].file) + '")' : skin[k];
        decl.push(name + ":" + v);
        if (IMAGE_TOKENS.indexOf(k) >= 0) {
          var a = state.atlas.atlases[skin[k]];
          // Logical pixel sizes; CSS multiplies by the integer --lpw-scale of the current layout.
          decl.push(name + "-w:" + a.width, name + "-h:" + a.height);
        }
      });
    });
    if (!state.styleEl) { state.styleEl = document.createElement("style"); state.styleEl.setAttribute("data-world-ui", ""); document.head.appendChild(state.styleEl); }
    state.styleEl.textContent = "html[data-world]{" + decl.join(";") + "}";
    ensureCss();
    html.setAttribute("data-world", state.pack.id);
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

  function makeSprite(actorId) {
    var el = document.createElement("div");
    el.className = "lp-world-sprite";
    el.dataset.actor = actorId;
    return el;
  }
  function paintSprite(el, actorId, frame, x, y, originPx, flip, SCALE) {
    var actor = state.pack.actors[actorId];
    var f = atlasFrame(state.atlas, actor.sheet, frame);
    if (!f) { el.hidden = true; return; }
    var r = f.rect;
    el.hidden = false;
    el.style.width = (r.w * SCALE) + "px";
    el.style.height = (r.h * SCALE) + "px";
    el.style.backgroundImage = 'url("' + assetUrl(f.sheet.file) + '")';
    el.style.backgroundSize = (f.sheet.width * SCALE) + "px " + (f.sheet.height * SCALE) + "px";
    el.style.backgroundPosition = (-r.x * SCALE) + "px " + (-r.y * SCALE) + "px";
    // anchor = ground point; the stage floor is its bottom edge. A deliberate `flip` (walking
    // left) mirrors the sprite around its anchor; RTL never flips anything by itself.
    var ax = flip ? (r.w - 1 - r.anchor[0]) : r.anchor[0];
    var left = originPx + (x - ax) * SCALE;
    var up = (y - (r.h - 1 - r.anchor[1])) * SCALE;
    // Movement is transform-only: it composites without layout, so scenes add no layout shift.
    el.style.left = "0px";
    el.style.bottom = "0px";
    el.style.transform = "translate(" + left + "px," + (-up) + "px)" + (flip ? " scaleX(-1)" : "");
  }

  function stageOrigin(stage, slot) { return Math.round(stage.clientWidth * slot.origin); }
  function stageScale(stage) {
    var v = parseInt(getComputedStyle(stage).getPropertyValue("--lpw-scale"), 10);
    return v >= 1 && v <= 6 ? v : DEFAULT_SCALE;
  }

  function paintPose(slotName, pose) {
    var st = state.stages[slotName];
    if (!st) return;
    var slot = state.pack.slots[slotName];
    var origin = stageOrigin(st.el, slot);
    var scale = stageScale(st.el);
    var seen = {};
    pose.forEach(function (p) {
      var key = p.key || p.actor;
      seen[key] = true;
      if (!st.sprites[key]) { st.sprites[key] = makeSprite(p.actor); st.el.appendChild(st.sprites[key]); }
      st.sprites[key].style.zIndex = String(p.z || 1);
      if (p.hidden) st.sprites[key].hidden = true;
      else paintSprite(st.sprites[key], p.actor, p.frame, p.x, p.y || 0, origin, !!p.flip, scale);
    });
    Object.keys(st.sprites).forEach(function (k) { if (!seen[k]) st.sprites[k].hidden = true; });
  }
  function restPose(slotName) { return (state.pack.slots[slotName].rest || []).map(function (r) { return Object.assign({ key: r.actor }, r); }); }

  function mountStages() {
    var els = document.querySelectorAll("[data-world-slot]");
    for (var i = 0; i < els.length; i++) {
      var name = els[i].getAttribute("data-world-slot");
      if (SLOTS.indexOf(name) < 0 || !state.pack.slots[name]) continue;
      var el = els[i];
      el.setAttribute("aria-hidden", "true");
      el.hidden = false;
      state.stages[name] = { el: el, sprites: {} };
      paintPose(name, restPose(name));
    }
  }
  function unmountStages() {
    Object.keys(state.stages).forEach(function (k) {
      var st = state.stages[k];
      Object.keys(st.sprites).forEach(function (s) { st.sprites[s].remove(); });
      st.el.hidden = true;
    });
    state.stages = {};
  }

  function stopScene() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.current) {
      var slot = state.current.slot;
      state.current = null;
      state.governor.ended(performance.now());
      if (state.stages[slot]) paintPose(slot, restPose(slot));
    }
  }

  function trackPose(scene, t) {
    return sampleScene(scene, t).map(function (p, i) {
      var track = scene.tracks[i];
      return Object.assign({ key: track.key || track.actor, z: track.z }, p);
    });
  }

  function playScene(scene, kind) {
    if (!state.stages[scene.slot]) return { played: false, reason: "no-slot" };
    var decision = state.governor.request(kind, performance.now(), {
      hidden: document.hidden, reducedMotion: reducedMotion(), busy: kind === "manual" ? null : busyReason()
    });
    if (!decision.play) return { played: false, reason: decision.reason };
    if (reducedMotion()) {
      // No movement: show the scene's static substitute once, then return to rest.
      state.governor.started(kind);
      state.current = { slot: scene.slot, id: scene.id };
      paintPose(scene.slot, scene.staticPose.map(function (r) { return Object.assign({ key: r.key || r.actor }, r); }));
      state.raf = requestAnimationFrame(function wait(start) {
        state.raf = requestAnimationFrame(function tick(now) {
          if (now - start >= Math.min(scene.durationMs, 2000)) stopScene(); else state.raf = requestAnimationFrame(tick);
        });
      });
      return { played: true, static: true };
    }
    state.governor.started(kind);
    state.current = { slot: scene.slot, id: scene.id };
    var start = performance.now();
    function tick(now) {
      if (!state.current) return;
      var t = now - start;
      if (t >= scene.durationMs || document.hidden) { stopScene(); return; }
      if (kind !== "manual" && busyReason()) { stopScene(); return; }
      paintPose(scene.slot, trackPose(scene, t));
      state.raf = requestAnimationFrame(tick);
    }
    paintPose(scene.slot, trackPose(scene, 0));
    state.raf = requestAnimationFrame(tick);
    return { played: true };
  }

  function scenesFor(trigger) {
    var mode = state.choice ? state.choice.mode : "calm";
    return (state.pack.scenes || []).filter(function (s) { return s.trigger === trigger && sceneActive(s, mode, today()); });
  }
  function signal(trigger) {
    if (!state.pack || TRIGGERS.indexOf(trigger) < 0 || trigger === "manual") return { played: false, reason: "inactive" };
    var list = scenesFor(trigger);
    if (!list.length) return { played: false, reason: "no-scene" };
    return playScene(list[0], "auto");
  }
  function play(sceneId) {
    if (!state.pack) return { played: false, reason: "inactive" };
    var sc = (state.pack.scenes || []).filter(function (s) { return s.id === sceneId; })[0];
    if (!sc) return { played: false, reason: "unknown-scene" };
    if (state.current) stopScene();
    return playScene(sc, "manual");
  }

  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); state.listeners.push([target, type, fn, opts]); }
  function wireEvents() {
    // Studio: the existing table-job telemetry snapshot. Only `state` is read — no text, no rows.
    on(window, "table-job-progress", function (e) {
      if (e && e.detail && e.detail.state === "done") signal("studio.table-ready");
    });
    on(document, "visibilitychange", function () { if (document.hidden) stopScene(); });
    on(window, "resize", function () { Object.keys(state.stages).forEach(function (k) { if (!state.current) paintPose(k, restPose(k)); }); });
    var liveTimer = 0;
    if (state.choice.mode === "live" && scenesFor("ambient").length) {
      liveTimer = setInterval(function () { signal("ambient"); }, 45000);
      state.listeners.push([null, "interval", liveTimer]);
    }
  }
  function unwireEvents() {
    state.listeners.forEach(function (l) { if (l[1] === "interval") clearInterval(l[2]); else l[0].removeEventListener(l[1], l[2], l[3]); });
    state.listeners = [];
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function deactivate() {
    stopScene();
    unwireEvents();
    unmountStages();
    clearSkin();
    state.pack = null; state.atlas = null;
    state.governor = createGovernor();
    document.dispatchEvent(new CustomEvent("lp-world:changed", { detail: { id: null } }));
  }

  function activate(choice) {
    var reg = REGISTRY[choice.id];
    state.base = reg.base;
    var v = encodeURIComponent(reg.pack);
    return Promise.all([fetchJson(reg.base + "manifest.json?v=" + v), fetchJson(reg.base + "atlas.json?v=" + v)])
      .then(function (res) {
        var check = validatePack(res[0], res[1], choice.id);
        if (!check.ok) throw new Error("pack invalid: " + check.errors.slice(0, 5).join("; "));
        if (res[0].version !== reg.pack) throw new Error("pack version " + res[0].version + " != " + reg.pack);
        state.pack = res[0]; state.atlas = res[1]; state.choice = choice;
        applySkin();
        mountStages();
        wireEvents();
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
    var choice = id ? readChoice(JSON.stringify({ id: id, mode: mode || "calm" })) : null;
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
    });
    form.appendChild(list);

    var modes = el("fieldset", { class: "lp-world-modes" });
    modes.appendChild(el("legend", {}, tr("world.modeLegend", "Движение")));
    [["calm", tr("world.modeCalm", "Спокойный")], ["live", tr("world.modeLive", "Живой")]].forEach(function (m) {
      var label = el("label", { class: "lp-world-option lp-world-option-compact" });
      var input = el("input", { type: "radio", name: "lpWorldMode", value: m[0] });
      if ((state.choice ? state.choice.mode : "calm") === m[0]) input.checked = true;
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
      return { id: w ? w.value : "", mode: m ? m.value : "calm" };
    }
    function syncModes() { modes.disabled = !selected().id; preview.disabled = !selected().id; }
    function applySelection() {
      var s = selected();
      var same = state.choice && state.choice.id === s.id && state.choice.mode === s.mode;
      if (same) return Promise.resolve(true);
      if (!s.id && !state.choice) return Promise.resolve(false);
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

  function current() { return state.choice ? { id: state.choice.id, mode: state.choice.mode, active: !!state.pack } : null; }
  function debugState() { return { choice: current(), governor: state.governor.state(), scene: state.current, busy: busyReason(), stages: Object.keys(state.stages) }; }

  var api = { core: core, boot: boot, set: set, current: current, play: play, signal: signal, stop: stopScene, openPicker: openPicker, debugState: debugState };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); });
  else boot();
  return api;
});
