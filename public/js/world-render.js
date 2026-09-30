/*
 * LinguistPro Worlds — canvas scenery renderer (engine v2). Loaded by world-engine.js ONLY while a
 * world is on. Pure drawing: it receives a validated pack + decoded images and never touches app
 * data, the network or the DOM outside the canvases it was given.
 *
 * Model (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md §v2):
 *   - a world is a horizontal TRACK in logical pixels; locations sit at track x positions;
 *   - a camera (x) looks at the track; every layer draws at -camera.x * parallax (+ drift * t),
 *     repeating horizontally; props and actors live on the track (parallax 1);
 *   - lighting (day | dusk | night) picks sky stops and per-lighting sheet variants;
 *   - emitters add ambient life (drifting clouds, birds, twinkling stars);
 *   - art is drawn at integer scale with smoothing off, into a small logical canvas that CSS
 *     scales with image-rendering: pixelated — a few hundred thousand pixels per frame at most.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LPWorldRender = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── pure helpers (node-testable) ───────────────────────────────────────────

  function lightingFor(hour, forced) {
    if (forced === "day" || forced === "dusk" || forced === "night") return forced;
    if (hour >= 7 && hour < 17) return "day";
    if (hour >= 17 && hour < 19) return "dusk";
    return "night";
  }

  // Deterministic PRNG so ambient placement is stable per session seed (no flicker on resize).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Camera easing between locations: smoothstep over `ms`, returns x.
  function cameraAt(from, to, startedAt, ms, now) {
    if (ms <= 0) return to;
    var p = Math.min(1, Math.max(0, (now - startedAt) / ms));
    var s = p * p * (3 - 2 * p);
    return from + (to - from) * s;
  }

  // First visible tile offset for a horizontally repeating layer.
  function wrapOffset(x, period) {
    if (!(period > 0)) return 0;
    var m = x % period;
    return m > 0 ? m - period : m;
  }

  // 4x4 ordered dither between two stop colours → used for pixel-art sky bands.
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  var core = { lightingFor: lightingFor, mulberry32: mulberry32, cameraAt: cameraAt, wrapOffset: wrapOffset, BAYER: BAYER };
  if (typeof document === "undefined") return { core: core };

  // ── drawing ────────────────────────────────────────────────────────────────

  function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  // Sky: vertical stops painted in logical pixels with dithered transitions. Cached per
  // (lighting, height) as an ImageData-backed canvas; redrawn only when those change.
  // Sky: solid colour bands (one per stop) with a short dithered hand-off before each boundary —
  // the classic pixel-art sky. Full-height dithering reads as halftone noise between panels.
  function skyCanvas(stops, w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(c.width, c.height);
    var cols = stops.map(hexToRgb);
    var band = c.height / cols.length;
    var fade = Math.max(2, Math.min(8, Math.round(band * 0.18)));
    for (var y = 0; y < c.height; y++) {
      var i = Math.min(cols.length - 1, Math.floor(y / band));
      var toEdge = (i + 1) * band - y;           // rows left before the next band
      var mix = i < cols.length - 1 && toEdge <= fade ? 1 - toEdge / (fade + 1) : 0;
      for (var x = 0; x < c.width; x++) {
        var threshold = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        var col = mix > threshold ? cols[i + 1] : cols[i];
        var o = (y * c.width + x) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function frameOf(atlas, sheet, frame) {
    var a = atlas.atlases[sheet];
    return a && a.frames[frame] ? { sheet: sheet, rect: a.frames[frame] } : null;
  }

  // A renderer for one canvas. `kind` = "stage" (full scenery with actors) or "backdrop"
  // (sky + far layers only, vertical parallax from page scroll).
  function createRenderer(canvas, opts) {
    var pack = opts.pack, atlas = opts.atlas, images = opts.images;
    var scenery = pack.scenery;
    var ctx = canvas.getContext("2d", { alpha: false });
    var rand = mulberry32(opts.seed || 26);
    var state = {
      w: 0, h: 0, scale: 2, lighting: "day", cam: 0, camFrom: 0, camTo: 0, camStart: 0, camMs: 0,
      skyKey: "", sky: null, t0: performance.now(), clouds: [], birds: [], nextBird: 0, stars: [],
      pose: null, bubble: null, scrollY: 0
    };

    function resize(cssW, cssH, scale) {
      state.scale = scale;
      state.w = Math.max(1, Math.ceil(cssW / scale));
      state.h = Math.max(1, Math.ceil(cssH / scale));
      canvas.width = state.w; canvas.height = state.h;
      canvas.style.width = (state.w * scale) + "px";
      canvas.style.height = (state.h * scale) + "px";
      ctx.imageSmoothingEnabled = false;
      state.skyKey = "";
      seedAmbient();
    }

    function seedAmbient() {
      var em = scenery.emitters || {};
      state.clouds = [];
      var nc = em.clouds ? em.clouds.count : 0;
      for (var i = 0; i < nc; i++) {
        state.clouds.push({ frame: em.clouds.frames[i % em.clouds.frames.length], x: rand() * (state.w + 80) - 40,
          y: Math.round(em.clouds.y[0] + rand() * (em.clouds.y[1] - em.clouds.y[0])), v: em.clouds.speed[0] + rand() * (em.clouds.speed[1] - em.clouds.speed[0]) });
      }
      state.stars = [];
      var ns = em.stars ? em.stars.count : 0;
      for (var s = 0; s < ns; s++) state.stars.push({ x: Math.floor(rand() * state.w), y: Math.floor(rand() * state.h * (em.stars.band || 0.55)), p: rand() * 6.28, big: rand() < 0.15 });
    }

    function sheetName(spec) {
      if (typeof spec === "string") return spec;
      return spec[state.lighting] || spec.dusk || spec.day || spec.night;
    }

    function drawRepeat(sheet, frame, offsetX, bottomY) {
      var f = frameOf(atlas, sheet, frame);
      if (!f) return;
      var r = f.rect, img = images[atlas.atlases[sheet].file];
      if (!img) return;
      var x = wrapOffset(Math.round(offsetX), r.w);
      var y = state.h - bottomY - r.h;
      for (; x < state.w; x += r.w) ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
    }

    function drawSprite(sheet, frame, x, bottomY, flip) {
      var f = frameOf(atlas, sheet, frame);
      if (!f) return;
      var r = f.rect, img = images[atlas.atlases[sheet].file];
      if (!img) return;
      var ax = flip ? r.w - 1 - r.anchor[0] : r.anchor[0];
      var dx = Math.round(x - ax), dy = Math.round(state.h - bottomY - (r.anchor[1] + 1));
      if (flip) {
        ctx.save(); ctx.translate(dx + r.w, dy); ctx.scale(-1, 1);
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        ctx.restore();
      } else ctx.drawImage(img, r.x, r.y, r.w, r.h, dx, dy, r.w, r.h);
    }

    function drawSky() {
      var key = state.lighting + ":" + state.w + "x" + state.h;
      if (state.skyKey !== key) { state.sky = skyCanvas(scenery.lighting[state.lighting].sky, state.w, state.h); state.skyKey = key; }
      ctx.drawImage(state.sky, 0, 0);
    }

    function drawStars(t) {
      if (state.lighting !== "night") return;
      var col = scenery.lighting.night.star || "#e9eeff";
      for (var i = 0; i < state.stars.length; i++) {
        var s = state.stars[i];
        var on = Math.sin(t / 700 + s.p) > -0.35;
        if (!on) continue;
        ctx.fillStyle = col;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && Math.sin(t / 900 + s.p) > 0.6) { ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
      }
    }

    function drawCelestial() {
      var c = scenery.celestial && scenery.celestial[state.lighting];
      if (!c) return;
      drawSprite(c.sheet, c.frame, Math.round(state.w * c.at), state.h - c.top, false);
    }

    function drawClouds(dt) {
      var em = scenery.emitters && scenery.emitters.clouds;
      if (!em) return;
      var sheet = sheetName(em.sheet);
      for (var i = 0; i < state.clouds.length; i++) {
        var c = state.clouds[i];
        c.x += c.v * dt / 1000;
        if (c.x > state.w + 40) { c.x = -60; c.y = Math.round(em.y[0] + rand() * (em.y[1] - em.y[0])); }
        drawSprite(sheet, c.frame, c.x - state.cam * 0.04, state.h - c.y, false);
      }
    }

    function drawBirds(t, dt) {
      var em = scenery.emitters && scenery.emitters.birds;
      if (!em || em.lighting.indexOf(state.lighting) < 0) return;
      if (t > state.nextBird) {
        state.birds.push({ x: -10, y: Math.round(em.y[0] + rand() * (em.y[1] - em.y[0])), v: em.speed * (0.8 + rand() * 0.4) });
        if (rand() < 0.5) state.birds.push({ x: -22, y: state.birds[state.birds.length - 1].y + 4, v: state.birds[state.birds.length - 1].v });
        state.nextBird = t + em.every[0] + rand() * (em.every[1] - em.every[0]);
      }
      state.birds = state.birds.filter(function (b) { return b.x < state.w + 20; });
      for (var i = 0; i < state.birds.length; i++) {
        var b = state.birds[i];
        b.x += b.v * dt / 1000;
        drawSprite(em.sheet, em.frames[Math.floor(t / 160 + i) % em.frames.length], b.x, state.h - b.y, false);
      }
    }

    function drawLayers(kind, t, front) {
      var layers = scenery.layers || [];
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (kind === "backdrop" && !L.backdrop) continue;
        if (kind === "stage" && !!L.front !== !!front) continue;
        var sheet = sheetName(L.sheet);
        var drift = (L.drift || 0) * t / 1000;
        var vy = kind === "backdrop" ? Math.round(state.scrollY / state.scale * (L.scrollParallax || 0)) : 0;
        var frame = L.frames ? L.frames[Math.floor(t / (L.frameMs || 400)) % L.frames.length] : L.frame;
        drawRepeat(sheet, frame, -state.cam * L.parallax + drift, (kind === "backdrop" ? (L.backdropBottom || 0) : L.bottom) + vy);
      }
    }

    // back = true: buildings standing behind the street wall (drawn before front layers).
    function drawActors(back) {
      if (!state.pose) return;
      var list = state.pose.filter(function (p) { return !!p.back === !!back; })
        .sort(function (a, b) { return (a.z || 1) - (b.z || 1); });
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.hidden) continue;
        var actor = pack.actors[p.actor];
        if (!actor) continue;
        var ground = back ? (p.ground != null ? p.ground : scenery.backGround || 0) : scenery.groundY;
        drawSprite(sheetName(actor.sheet), p.frame, p.worldX - state.cam, ground + (p.y || 0), !!p.flip);
      }
    }

    function render(kind, now, dt) {
      var t = now - state.t0;
      if (state.camMs) {
        state.cam = cameraAt(state.camFrom, state.camTo, state.camStart, state.camMs, now);
        if (now - state.camStart >= state.camMs) state.camMs = 0;
      }
      drawSky();
      drawStars(t);
      drawCelestial();
      drawClouds(dt);
      if (kind === "stage") drawBirds(t, dt);
      if (kind === "backdrop") { drawLayers(kind, t); return; }
      drawLayers(kind, t, false);
      drawActors(true);
      drawLayers(kind, t, true);
      drawActors(false);
    }

    return {
      resize: resize,
      render: render,
      setLighting: function (l) { state.lighting = l; },
      lighting: function () { return state.lighting; },
      setScroll: function (y) { state.scrollY = y; },
      setPose: function (pose) { state.pose = pose; },
      camera: function () { return state.cam; },
      panTo: function (x, ms, now) {
        state.camFrom = state.cam; state.camTo = x; state.camStart = now; state.camMs = ms || 0;
        if (!ms) state.cam = x;
      },
      size: function () { return { w: state.w, h: state.h, scale: state.scale }; }
    };
  }

  return { core: core, createRenderer: createRenderer };
});
