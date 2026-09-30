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

    // Lighting integration: actors are multiplied by the lighting's tint (cached per sheet+tint),
    // so a daylight-saturated sprite never sits pasted onto a night street.
    var tintCache = {};
    function tinted(sheet, img) {
      var tint = scenery.lighting[state.lighting] && scenery.lighting[state.lighting].actorTint;
      if (!tint || tint.toLowerCase() === "#ffffff") return img;
      var key = sheet + tint;
      if (tintCache[key]) return tintCache[key];
      var c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      var x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = "multiply";
      x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = "destination-in";
      x.drawImage(img, 0, 0);
      tintCache[key] = c;
      return c;
    }

    function drawSprite(sheet, frame, x, bottomY, flip, tint) {
      var f = frameOf(atlas, sheet, frame);
      if (!f) return;
      var r = f.rect, img = images[atlas.atlases[sheet].file];
      if (!img) return;
      if (tint) img = tinted(sheet, img);
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
      if (!em || (em.lighting && em.lighting.indexOf(state.lighting) < 0)) return;
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

    // A flat stepped pixel ellipse on the pavement; shrinks while the actor is in the air.
    function contactShadow(sheet, frame, x, ground, lift) {
      var f = frameOf(atlas, sheet, frame);
      if (!f) return;
      var w = Math.max(6, Math.round(f.rect.w * 0.55) - Math.min(8, lift));
      var y = state.h - ground - 1;
      ctx.fillStyle = "rgba(10, 8, 24, 0.28)";
      ctx.fillRect(Math.round(x - w / 2), y, w, 1);
      ctx.fillRect(Math.round(x - w / 2) + 2, y + 1, Math.max(2, w - 4), 1);
    }

    // Night: every street lamp gets a stepped halo and a soft stepped pool on the pavement
    // (solid low-alpha bands — a checkerboard reads as a rendering glitch).
    function drawLampLight(L) {
      var li = scenery.lighting[state.lighting];
      if (!li || !li.lampLight || !L.lamps) return;
      var f = frameOf(atlas, sheetName(L.sheet), L.frame);
      if (!f) return;
      var period = f.rect.w, off = wrapOffset(Math.round(-state.cam * L.parallax), period);
      var rgb = hexToRgb(li.lampLight), col = function (a) { return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")"; };
      for (var base = off; base < state.w + period; base += period) {
        for (var i = 0; i < L.lamps.length; i++) {
          var lx = base + L.lamps[i].x, hy = state.h - (L.bottom || 0) - L.lamps[i].head - 1;
          if (lx < -40 || lx > state.w + 40) continue;
          for (var r = 5; r >= 1; r--) {
            ctx.fillStyle = col(0.07 * (6 - r));
            ctx.fillRect(lx - r * 2, hy - r, r * 4 + 1, r * 2 + 1);
          }
          ctx.fillStyle = col(1);
          ctx.fillRect(lx - 1, hy - 1, 3, 2);
          // a soft light cone down to the pavement
          var gy0 = state.h - scenery.groundY - 2;
          for (var yy = hy + 2; yy < gy0; yy += 2) {
            var half = Math.round(2 + (yy - hy) * 0.28);
            ctx.fillStyle = col(0.045);
            ctx.fillRect(lx - half, yy, half * 2 + 1, 2);
          }
          var gy = state.h - scenery.groundY - 2;
          var bands = [[20, 0.07], [14, 0.08], [8, 0.09]];
          for (var k = 0; k < bands.length; k++) {
            ctx.fillStyle = col(bands[k][1]);
            ctx.fillRect(lx - bands[k][0], gy - 1 + k, bands[k][0] * 2 + 1, 4 - k);
          }
        }
      }
    }

    // Location set-pieces drawn by the engine (no extra art): paper slips flying out of the press,
    // searchlights sweeping the sky over counting night.
    var papers = [], nextPaper = 0;
    // Campaign posters: pixel paper on the facade (party colour, light top edge, two tape strips),
    // tinted by the world's light like everything else; the DOM only overlays the crisp text.
    function mulTint(hex) {
      var tint = scenery.lighting[state.lighting] && scenery.lighting[state.lighting].actorTint;
      var c = hexToRgb(hex), t = tint ? hexToRgb(tint) : [255, 255, 255];
      return "rgb(" + Math.round(c[0] * t[0] / 255) + "," + Math.round(c[1] * t[1] / 255) + "," + Math.round(c[2] * t[2] / 255) + ")";
    }
    function drawPosters() {
      var locs = pack.locations || {};
      Object.keys(locs).forEach(function (id) {
        var L = locs[id];
        (L.posters || []).forEach(function (po, n) {
          var pt = pack.parties && pack.parties[po.party];
          if (!pt) return;
          var x = Math.round(L.x + po.x - 11 - state.cam), y = state.h - (scenery.backGround || 30) - (po.y || 0) - 26;
          if (x < -30 || x > state.w + 30) return;
          ctx.fillStyle = mulTint("#1b1f2e"); ctx.fillRect(x, y, 22, 26);
          ctx.fillStyle = mulTint(pt.color); ctx.fillRect(x + 1, y + 1, 20, 24);
          ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x + 1, y + 1, 20, 2);
          ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x + 1, y + 23, 20, 2);
          ctx.fillStyle = mulTint("#efe6c8");
          ctx.fillRect(x - 1 + (n ? 1 : 0), y - 1, 6, 3);
          ctx.fillRect(x + 17 - (n ? 1 : 0), y - 1, 6, 3);
        });
      });
    }

    function drawFx(t, dt, front) {
      var locs = pack.locations || {};
      Object.keys(locs).forEach(function (id) {
        var L = locs[id];
        (L.fx || []).forEach(function (fx) {
          var sx0 = L.x + (typeof fx.x === "number" ? fx.x : 0) - state.cam;
          if (sx0 < -160 || sx0 > state.w + 160) return;
          if (fx.kind === "searchlights" && !front) {
            var rgb = hexToRgb(fx.color || "#fff1c4");
            (fx.x || []).forEach(function (ox, n) {
              var x = L.x + ox - state.cam, y = state.h - fx.y;
              var ang = -Math.PI / 2 + (n ? 0.35 : -0.35) + Math.sin(t / 2600 + n * 1.7) * 0.32;
              var len = Math.max(state.h, 180), spread = 0.09;
              ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.2)";
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + Math.cos(ang - spread) * len, y + Math.sin(ang - spread) * len);
              ctx.lineTo(x + Math.cos(ang + spread) * len, y + Math.sin(ang + spread) * len);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.9)";
              ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
            });
          }
          if (fx.kind === "tally" && !front) {
            // two vowel parties, bars racing up and always landing on a tie (no winner, ever)
            var bx = Math.round(L.x + fx.x - state.cam), by = state.h - fx.y;
            var cyc = (t % 6000) / 6000;
            (fx.parties || []).forEach(function (pid, n) {
              var pt = pack.parties && pack.parties[pid];
              if (!pt) return;
              var wobble = cyc < 0.7 ? Math.abs(Math.sin(t / (380 + n * 170))) : 1;
              var hgt = Math.max(2, Math.round(14 * Math.min(1, cyc / 0.7) * (0.55 + 0.45 * wobble)));
              var x = bx + n * 8;
              ctx.fillStyle = "#101426"; ctx.fillRect(x - 1, by - 15, 7, 16);
              ctx.fillStyle = pt.color; ctx.fillRect(x, by - hgt, 5, hgt);
            });
          }
          if (fx.kind === "papers" && front) {
            if (dt > 0 && t > nextPaper) {
              papers.push({ x: L.x + fx.x, y: fx.y, vx: 8 + rand() * 14, vy: 10 + rand() * 10, born: t, spin: rand() < 0.5 });
              nextPaper = t + (fx.every || 300);
            }
          }
        });
      });
      if (!front) return;
      papers = papers.filter(function (p) { return t - p.born < 2600; });
      for (var i = 0; i < papers.length; i++) {
        var p = papers[i], age = (t - p.born) / 1000;
        var px = Math.round(p.x + p.vx * age - state.cam), py = Math.round(state.h - (p.y + p.vy * age - 9 * age * age));
        var flip = Math.floor((t - p.born) / 180 + (p.spin ? 1 : 0)) % 2;
        ctx.fillStyle = "#1b1f2e";
        ctx.fillRect(px - 1, py - 1, flip ? 5 : 4, flip ? 3 : 4);
        ctx.fillStyle = "#fbf7ea";
        ctx.fillRect(px, py, flip ? 3 : 2, flip ? 1 : 2);
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
        var ground = back ? (p.ground != null ? p.ground : scenery.backGround || 0) : scenery.groundY + (p.lane || 0);
        var sx = p.worldX - state.cam;
        if (!back) contactShadow(sheetName(actor.sheet), p.frame, sx, ground, p.y || 0);
        drawSprite(sheetName(actor.sheet), p.frame, sx, ground + (p.y || 0), !!p.flip, !back);
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
      drawPosters();
      drawFx(t, dt, false);
      drawLayers(kind, t, true);
      (scenery.layers || []).forEach(function (L) { if (L.front) drawLampLight(L); });
      drawActors(false);
      drawFx(t, dt, true);
      if (scenery.curb) {
        ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(0, state.h - 3, state.w, 3);
        ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(0, state.h - 4, state.w, 1);
      }
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
