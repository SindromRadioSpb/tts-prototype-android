/* Five places of one painted valley, each in daylight and at night. Browser-side; needs painter.js.
   Composition rule: the inline-start 45% stays calm (the section title sits there), the focal light
   sits in the far third. Pages mirror the picture for RTL. */
(function () {
  "use strict";
  var G = window.G, R = G.R, S = (window.SCENES = {});

  function city(ctx, W, o) {
    var x = o.x0 == null ? -40 : o.x0, end = o.x1 == null ? W + 40 : o.x1;
    while (x < end) {
      var w = R(o.w[0], o.w[1]), t = x / W, env = o.env ? o.env(t) : 1;
      var h = R(o.h[0], o.h[1]) * env, y = o.base - h, col = G.jit(G.pick(o.cols), 0.012, 0.05, 0.025);
      if (G.r() < (o.gap || 0)) { x += w * 0.5; continue; }
      G.box(ctx, x, y, w, h + 30, col, 1, o.wob == null ? 2.5 : o.wob);
      /* a darker side plane and a roof lip */
      G.box(ctx, x + w * R(0.62, 0.8), y, w * 0.4, h + 30, G.shade(col, -0.035), 0.75, 2);
      if (o.rim) G.line(ctx, x + 2, y + 1, x + w - 2, y + 1, o.rimW || 3, o.rim, R(0.5, 0.95), 1.2);
      if (G.r() < (o.roof == null ? 0.5 : o.roof)) {
        var rx = x + R(0.15, 0.6) * w, rw = w * R(0.15, 0.35), rh = R(8, 34) * (o.sc || 1);
        G.box(ctx, rx, y - rh, rw, rh + 4, G.shade(col, -0.02), 1, 1.5);
        if (G.r() < 0.6) {
          var ah = R(30, 120) * (o.sc || 1);
          G.line(ctx, rx + rw / 2, y - rh, rx + rw / 2 + R(-3, 3), y - rh - ah, 2 * (o.sc || 1), G.shade(col, -0.04), 1, 0.8);
          if (o.beacon && G.r() < 0.6) { G.blob(ctx, rx + rw / 2, y - rh - ah, 4, 4, 0, o.beacon, 1, 0.2); G.glow(ctx, rx + rw / 2, y - rh - ah, 26, o.beacon, 0.7); }
        }
      }
      if (o.win) {
        var cw = o.cell[0] * R(0.85, 1.2), ch = o.cell[1] * R(0.85, 1.2), lit = R(o.lit[0], o.lit[1]);
        for (var yy = y + ch * 0.8; yy < o.base - ch * 0.4; yy += ch) {
          var rowLit = G.r() < 0.16;
          for (var xx = x + cw * 0.6; xx < x + w - cw * 0.6; xx += cw) {
            if (G.r() > lit && !rowLit) { if (o.dim && G.r() < 0.5) G.box(ctx, xx, yy, cw * 0.56, ch * 0.5, o.dim, 0.5, 0.8); continue; }
            var wc = G.jit(G.pick(o.win), 0.02, 0.08, 0.05);
            G.box(ctx, xx, yy, cw * R(0.5, 0.62), ch * R(0.42, 0.56), wc, R(0.75, 1), 0.9);
            if (o.winGlow && G.r() < 0.12) G.glow(ctx, xx + cw * 0.3, yy + ch * 0.25, cw * 2.6, wc, 0.32);
          }
        }
      }
      if (o.signs && h > 150 && G.r() < 0.62) {
        var m = 1 + (G.r() < 0.4 ? 1 : 0);
        for (var si = 0; si < m; si++) {
          var vert = G.r() < 0.6, sw = vert ? R(22, 40) : Math.min(w * 0.8, R(70, 150)), sh = vert ? Math.min(h * 0.55, R(90, 200)) : R(26, 44);
          var sx = vert ? (G.r() < 0.5 ? x - sw * 0.7 : x + w - sw * 0.3) : x + R(0.05, 0.2) * w, sy = vert ? y + R(0.08, 0.35) * h : y + R(0.1, 0.6) * h, sc2 = G.pick(o.signs);
          G.glow(ctx, sx + sw / 2, sy + sh / 2, Math.max(sw, sh) * 1.3, sc2, o.signGlow || 0.5);
          G.box(ctx, sx - 4, sy - 4, sw + 8, sh + 8, o.signFrame || G.shade(sc2, -0.3), 1, 1.6);
          G.box(ctx, sx, sy, sw, sh, sc2, 0.96, 1.6);
          var marks = vert ? (sh / 30) | 0 : (sw / 26) | 0;
          for (var mk = 0; mk < marks; mk++) {
            var ux = vert ? sx + sw / 2 : sx + 13 + mk * ((sw - 24) / Math.max(1, marks - 1)), uy = vert ? sy + 16 + mk * ((sh - 30) / Math.max(1, marks - 1)) : sy + sh / 2;
            G.dab(ctx, ux, uy, vert ? sw * 0.5 : 11, vert ? 8 : sh * 0.46, R(-0.5, 0.5), o.signInk || "#ffffff", 0.75, 0);
          }
        }
      }
      x += w * R(0.82, 1.06);
    }
  }

  function trunk(ctx, x, top, bottom, w, pal, litSide) {
    var s = G.r() * 90, L = [], Rr = [], y;
    for (y = top; y <= bottom; y += 10) {
      var t = (y - top) / (bottom - top), flare = 1 + Math.pow(t, 5) * 1.5 + Math.pow(1 - t, 6) * 0.5;
      var ww = w * flare * 0.5;
      L.push([x - ww + (G.fbm(y * 0.006, 1, s, 3) - 0.5) * w * 0.16, y]);
      Rr.push([x + ww + (G.fbm(y * 0.006, 5, s, 3) - 0.5) * w * 0.16, y]);
    }
    var path = function () {
      ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
      L.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      for (var i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
      ctx.closePath();
    };
    G.clip(ctx, path, function () {
      ctx.fillStyle = G.css(pal.dark); ctx.fillRect(x - w * 3, top, w * 6, bottom - top);
      var i, n = (bottom - top) * w / 260;
      for (i = 0; i < n; i++) G.dab(ctx, x + R(-1.4, 1.4) * w, R(top, bottom), R(8, 20), R(40, 150), R(-0.08, 0.08), G.jit(G.pick([pal.dark, pal.bark, pal.bark2]), 0.02, 0.06, 0.03), R(0.5, 0.95), 1);
      /* moss: denser and brighter on the side that faces the light */
      for (i = 0; i < n * 1.6; i++) {
        var k = Math.pow(G.r(), 0.5), xx = x + litSide * w * (0.75 - k * 1.1) + R(-0.1, 0.1) * w, yy = R(top, bottom);
        if (G.fbm(xx * 0.004, yy * 0.003, s + 9, 3) < 0.44 + k * 0.14) continue;
        var c = k < 0.3 ? pal.mossHi : k < 0.62 ? pal.moss : pal.mossDark;
        G.blob(ctx, xx, yy, R(5, 15), R(4, 10), R(-1, 1), G.jit(c, 0.02, 0.08, 0.04), R(0.55, 1), 0.34);
      }
      for (i = 0; i < n * 0.5; i++) G.dab(ctx, x + litSide * w * R(0.62, 1.25), R(top, bottom), R(3, 8), R(14, 70), R(-0.06, 0.06), G.jit(pal.spark, 0.02, 0.06, 0.03), R(0.35, 0.9), 0);
    });
  }

  /* ───────────── Студия: рассвет над полями ───────────── */
  S.studio = function (ctx, W, H, night) {
    G.seed(night ? 4112 : 4111);
    var P = night ? {
      sky: [[0, "#0b1433"], [0.3, "#16265a"], [0.5, "#2b3f7c"], [0.6, "#4f5d94"], [0.68, "#8e7c9a"]],
      cloud: { shadow: "#18224e", deep: "#10173a", mid: "#27376a", light: "#3d4f88", hi: "#6f7fb4", base: "#1a2450" },
      streaks: ["#3d4a80", "#6b6a9a", "#a58fa6"],
      r1: ["#394b85", "#5c6a9c"], r2: ["#243765", "#46578c"], r3: ["#0d1b36", "#1a3350"], rim: "#6f86b8",
      mist: "#7f8cb8", sun: "#c7b4c9", sunA: 0.3, shaft: "#8fa2e0", shaftA: 0.07,
      field: [[0, "#3b5270"], [0.12, "#1f3f58"], [0.45, "#16344a"], [1, "#0a1f30"]], leaf: ["#0a1f2c", "#11303c", "#1c4a4c", "#2f6a62"],
      flower: ["#8f8a4e", "#b3a758", "#d6c66a"], flowerHi: "#f0e39a", flowerSh: "#5c5a3c", con: ["#081424", "#0e2034", "#2c4a78"], vig: "#04081c"
    } : {
      sky: [[0, "#5d88bb"], [0.24, "#8fb1cf"], [0.42, "#c9d6cf"], [0.55, "#f3e6a6"], [0.66, "#fbd47c"]],
      cloud: { shadow: "#6f86b0", deep: "#5a709e", mid: "#a9b6c8", light: "#eadfbe", hi: "#fff6cf", base: "#8aa0c2" },
      streaks: ["#fff3bd", "#fbe08e", "#e9c9a0", "#b9c1cf"],
      r1: ["#8e9fd0", "#c6cfe6"], r2: ["#5d73b0", "#a3b3d8"], r3: ["#17324e", "#2b5a66"], rim: "#f4e08a",
      mist: "#e8e6dc", sun: "#fff6c8", sunA: 0.95, shaft: "#fff0b0", shaftA: 0.2,
      field: [[0, "#c2c66e"], [0.12, "#7fa868"], [0.45, "#357a55"], [1, "#143f36"]], leaf: ["#0f3a34", "#1d5a42", "#3d8a4e", "#8cc35e"],
      flower: ["#f2b632", "#f7cd3a", "#fbe05a"], flowerHi: "#fff5a6", flowerSh: "#c97a1a", con: ["#10283e", "#1a4250", "#7fa07a"], vig: "#1a2440"
    };
    var hz = H * 0.62, sunX = W * 0.63, sunY = H * 0.475, i;
    G.wash(ctx, 0, 0, W, hz + 60, P.sky);
    if (night) G.stars(ctx, W, hz * 0.8, 520, ["#ffffff", "#cfd9ff", "#ffe9c4"]);
    G.glow(ctx, sunX, sunY, W * 0.34, P.sun, P.sunA * 0.75);
    G.glow(ctx, sunX, sunY, W * 0.12, P.sun, P.sunA);
    if (!night) { G.blob(ctx, sunX, sunY, 44, 44, 0, "#fffdf2", 1, 0.03); G.glow(ctx, sunX, sunY, 190, "#fff8d0", 1); }
    if (night) { G.blob(ctx, W * 0.82, H * 0.2, 46, 46, 0, "#f3ecd2", 1, 0.03); G.blob(ctx, W * 0.82 + 20, H * 0.2 - 9, 44, 44, 0, G.ramp(P.sky, 0.2), 1, 0.03); G.glow(ctx, W * 0.82, H * 0.2, 220, "#cfd6ff", 0.35); }
    /* clouds, lit from below by the rising sun */
    var L = night ? { lx: 0.5, ly: -0.6 } : { lx: 0.5, ly: -0.3 };
    G.cloud(ctx, W * 0.2, H * 0.19, W * 0.42, H * 0.15, P.cloud, L);
    G.cloud(ctx, W * 0.63, H * 0.13, W * 0.5, H * 0.13, P.cloud, L);
    G.cloud(ctx, W * 0.93, H * 0.27, W * 0.3, H * 0.12, P.cloud, L);
    G.cloud(ctx, W * 0.07, H * 0.36, W * 0.26, H * 0.09, P.cloud, L);
    G.streak(ctx, W * 0.5, H * 0.43, W * 0.9, H * 0.05, P.streaks, 70);
    G.streak(ctx, W * 0.66, H * 0.36, W * 0.4, H * 0.03, P.streaks, 36);
    /* receding ranges */
    G.ridge(ctx, W, H, { seed: 11, base: H * 0.63, amp: H * 0.36, freq: 0.0009, shape: function (t) { return 0.45 + 0.75 * Math.exp(-Math.pow((t - 0.3) / 0.22, 2)); }, top: P.r1[0], bottom: P.r1[1], foot: H * 0.64, strokes: 500, dl: 0.02 });
    G.mist(ctx, W, H * 0.6, H * 0.08, P.mist, 0.55);
    G.ridge(ctx, W, H, { seed: 23, base: H * 0.67, amp: H * 0.34, freq: 0.0009, top: P.r2[0], bottom: P.r2[1], foot: H * 0.68, strokes: 800,
      shape: function (t) { return 0.3 + 1.1 * Math.pow(Math.max(0, 0.55 - t), 1.1); } });
    G.mist(ctx, W, H * 0.655, H * 0.07, P.mist, 0.6);
    /* the dark wooded shoulder the sun climbs over */
    var pts = G.ridge(ctx, W, H, { seed: 37, base: H * 0.71, amp: H * 1.05, freq: 0.0014, top: P.r3[0], bottom: P.r3[1], foot: H * 0.72, strokes: 1300, sk: 0.8,
      shape: function (t) { return Math.pow(Math.max(0, t - 0.6) / 0.4, 0.95); } });
    pts.forEach(function (p, k) {
      if (p[0] < W * 0.6 || k % 3) return;
      var hh = R(40, 110) * (0.4 + (p[0] / W - 0.6) * 2.6);
      G.conifer(ctx, p[0], p[1] + 8, hh, hh * 0.42, P.con, 1);
    });
    for (i = 0; i < 420; i++) {
      var q = pts[((0.6 + G.r() * 0.4) * pts.length) | 0];
      if (!q) continue;
      var hh2 = R(50, 130) * (0.5 + (q[0] / W - 0.6) * 2), yy = q[1] + Math.pow(G.r(), 0.7) * (H * 0.72 - q[1]);
      if (yy < H * 0.71) G.conifer(ctx, q[0] + R(-20, 20), yy, hh2, hh2 * 0.4, P.con, 1);
    }
    /* rays breaking over the ridge */
    for (i = 0; i < 12; i++) G.shaft(ctx, sunX + R(-20, 20), sunY + R(-10, 10), H * R(0.8, 1.3), 14, R(160, 420), -0.5 + i * 0.19 + R(-0.04, 0.04), P.shaft, P.shaftA * R(0.5, 1.3), 16);
    G.mist(ctx, W, H * 0.7, H * 0.06, P.mist, 0.5, 18);
    /* fields */
    G.wash(ctx, 0, H * 0.69, W, H * 0.31, P.field, { n: 380, dl: 0.03 });
    for (i = 0; i < 900; i++) { var ft = Math.pow(G.r(), 1.4), fy = H * (0.695 + ft * 0.3); G.dab(ctx, G.r() * W, fy, R(60, 260) * (0.3 + ft), R(4, 14) * (0.3 + ft), R(-0.04, 0.04), G.jit(ft < 0.12 && G.r() < 0.6 ? P.flower[0] : P.leaf[1 + ((G.r() * 2.6) | 0)], 0.02, 0.07, 0.04), R(0.2, 0.55), 1); }
    G.glow(ctx, sunX - W * 0.1, H * 0.74, W * 0.3, P.sun, P.sunA * 0.22);
    /* flowers: sparse specks far away, heads the size of a palm up close */
    for (i = 0; i < 5200; i++) {
      var t = Math.pow(G.r(), 1.55), y = H * (0.705 + t * 0.34), sc = 0.1 + t * t * 1.5, x = G.r() * W;
      if (G.r() < 0.5) G.dab(ctx, x, y + 6 * sc, R(22, 60) * sc, R(5, 10) * sc, R(-1.5, -0.3) * (G.r() < 0.5 ? 1 : -1.6), G.jit(P.leaf[(G.r() * 3) | 0], 0.02, 0.08, 0.04), 1, 0);
      else {
        var r = R(10, 19) * sc, c = G.pick(P.flower);
        G.blob(ctx, x, y + r * 0.25, r, r * 0.8, 0, G.jit(P.flowerSh, 0.015, 0.06, 0.03), 1, 0.24);
        G.blob(ctx, x - r * 0.08, y - r * 0.12, r * 0.86, r * 0.66, 0, G.jit(c, 0.015, 0.06, 0.03), 1, 0.24);
        if (sc > 0.7) for (var pe = 0; pe < 9; pe++) { var pa = R(0, 6.283); G.blob(ctx, x + Math.cos(pa) * r * 0.6, y - r * 0.1 + Math.sin(pa) * r * 0.45, r * 0.34, r * 0.2, pa, G.jit(pe % 3 ? c : P.flowerSh, 0.02, 0.07, 0.04), 1, 0.3); }
        G.blob(ctx, x + r * 0.16, y - r * 0.32, r * 0.46, r * 0.3, 0, G.jit(P.flowerHi, 0.01, 0.05, 0.02), 0.95, 0.3);
      }
    }
    if (night) for (i = 0; i < 40; i++) { var gx = G.r() * W, gy = H * R(0.66, 0.97); G.glow(ctx, gx, gy, R(14, 30), "#e9f59a", 0.8); G.blob(ctx, gx, gy, 2.5, 2.5, 0, "#fbffd0", 1, 0.2); }
    G.finish(ctx, W, H, { bloom: night ? 0.16 : 0.24, vigCol: P.vig, vig: night ? 0.4 : 0.22 });
  };

  /* ───────────── Читальный зал: лес и столбы света ───────────── */
  S.room = function (ctx, W, H, night) {
    G.seed(night ? 5202 : 5201);
    var P = night ? {
      bg: [[0, "#050d22"], [0.45, "#0c2444"], [0.75, "#12395a"], [1, "#0a2238"]], far: "#1f3f6a", shaft: "#9db8ff", shaftA: 0.2,
      pool: "#bcd0ff", water: [[0, "#2b5c8c"], [0.3, "#143a5e"], [1, "#07182c"]], glint: "#dbe6ff",
      tr: { dark: "#040b18", bark: "#0a1a2c", bark2: "#10263a", mossDark: "#0e2c3a", moss: "#1d4e5a", mossHi: "#3f8286", spark: "#a6dccd" },
      leaf: ["#030a14", "#0a1e2c", "#16404a", "#4c8f90"], mote: "#e6f59a", vig: "#01040e"
    } : {
      bg: [[0, "#06202c"], [0.4, "#0f4450"], [0.72, "#2c8a78"], [1, "#11463f"]], far: "#2a6f7c", shaft: "#d9f2ff", shaftA: 0.3,
      pool: "#f2ffe2", water: [[0, "#6fd0a8"], [0.25, "#2c8f78"], [1, "#0a2c2c"]], glint: "#f4ffe9",
      tr: { dark: "#06181a", bark: "#0f2a26", bark2: "#173a30", mossDark: "#1c4a30", moss: "#33783c", mossHi: "#74b84e", spark: "#d6f08a" },
      leaf: ["#051714", "#0d3026", "#1f6a44", "#8fd070"], mote: "#fbffd6", vig: "#020c10"
    };
    var px = W * 0.64, py = H * 0.7, i;
    G.wash(ctx, 0, 0, W, H, P.bg, { n: 300, dl: 0.03 });
    /* far trunks dissolving into haze */
    ctx.save(); ctx.filter = "blur(7px)";
    for (i = 0; i < 26; i++) { var fx = R(0.02, 0.98) * W, fw = R(26, 120); G.box(ctx, fx, -10, fw, H * R(0.66, 0.76), G.jit(P.far, 0.02, 0.06, 0.05), R(0.25, 0.6), 7); }
    ctx.restore();
    G.glow(ctx, px, H * 0.3, W * 0.36, P.shaft, 0.28);
    /* middle-distance trunks */
    [[0.46, 60], [0.56, 44], [0.75, 70], [0.27, 54]].forEach(function (t) { trunk(ctx, W * t[0], -10, H * 0.72, t[1], P.tr, t[0] < 0.64 ? 1 : -1); });
    ctx.save(); ctx.globalAlpha = 0.34; ctx.fillStyle = G.css(G.ramp(P.bg, 0.6)); ctx.fillRect(0, 0, W, H * 0.72); ctx.restore();
    for (i = 0; i < 9; i++) G.shaft(ctx, W * (0.56 + i * 0.045) + R(-30, 30), -40, H * R(0.85, 1.05), R(30, 90), R(120, 300), 0.3 + R(-0.05, 0.05), P.shaft, P.shaftA * R(0.5, 1.2), 16);
    /* still water, a lit clearing in the middle of it */
    var wy = H * 0.66;
    G.water(ctx, 0, wy, W, H - wy, P.water, { n: 1100 });
    G.glow(ctx, px, py, W * 0.3, P.pool, 0.85);
    ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.2); G.glow(ctx, 0, 0, W * 0.34, P.pool, 0.95); ctx.restore();
    for (i = 0; i < 240; i++) { var t2 = G.gauss(); G.dab(ctx, px + t2 * W * 0.2, py + G.gauss() * H * 0.07, R(20, 150), R(2, 7), 0, P.glint, R(0.3, 0.9), 0); }
    /* the old trees */
    trunk(ctx, W * 0.9, -10, H * 1.02, 250, P.tr, -1);
    trunk(ctx, W * 0.115, -10, H * 1.02, 300, P.tr, 1);
    trunk(ctx, W * 0.36, -10, H * 0.9, 120, P.tr, 1);
    /* reflections drawn as soft vertical drags */
    ctx.save(); ctx.globalAlpha = 0.3; ctx.filter = "blur(9px)";
    for (i = 0; i < 110; i++) { var rx = G.pick([0.115, 0.36, 0.9, 0.46, 0.75]) * W + R(-90, 90); G.dab(ctx, rx, R(wy + 20, H), R(14, 44), R(60, 220), 0, G.jit(P.tr.dark, 0.02, 0.05, 0.03), R(0.2, 0.6), 0); }
    ctx.restore();
    /* canopy overhead */
    for (i = 0; i < 22; i++) { var cx = (i / 21) * W + R(-60, 60), lit = cx > W * 0.5 ? -0.4 : 0.5; G.foliage(ctx, cx, R(-30, 70), R(170, 300), R(70, 130), P.leaf, { lx: lit, ly: 0.75, leaf: R(9, 14), den: 1 }); }
    G.foliage(ctx, W * 0.02, H * 0.9, 260, 190, P.leaf, { lx: 0.6, ly: -0.6, leaf: 20 });
    G.foliage(ctx, W * 0.99, H * 0.86, 250, 170, P.leaf, { lx: -0.6, ly: -0.6, leaf: 20 });
    /* second pass of light in front of the big trunks, then motes */
    for (i = 0; i < 4; i++) G.shaft(ctx, W * (0.6 + i * 0.07), -40, H * 0.95, 60, R(200, 360), 0.3, P.shaft, P.shaftA * 0.45, 26);
    for (i = 0; i < 90; i++) { var mx = px + G.gauss() * W * 0.22, my = R(0.15, 0.8) * H, mr = R(1.5, 4); G.blob(ctx, mx, my, mr, mr, 0, P.mote, R(0.5, 1), 0.3); if (G.r() < 0.3) G.glow(ctx, mx, my, mr * 8, P.mote, 0.5); }
    G.finish(ctx, W, H, { bloom: 0.32, bloomBlur: 34, vigCol: P.vig, vig: 0.5 });
  };

  /* ───────────── Медиатека: вечерний город и вывески ───────────── */
  S.media = function (ctx, W, H, night) {
    G.seed(night ? 6302 : 6301);
    var P = night ? {
      sky: [[0, "#04061a"], [0.4, "#0d1440"], [0.75, "#2a2468"], [1, "#5a2f78"]], star: ["#ffffff", "#bcd0ff", "#ffd6f0"], moon: "#f6efcf",
      far: ["#1a1f58", "#222668", "#2b2470"], mid: ["#10143c", "#161a48", "#1e1850"], near: ["#070a22", "#0b0e2c", "#120f30"],
      win: ["#ffd98a", "#ffb86a", "#8fe9ff", "#ff8fc8", "#fff3c8"], dim: "#232a66", rim: "#4a55b0",
      neon: ["#5ef0ff", "#ff5fb0", "#ffc56a", "#8dff9a", "#b08cff"], haze: "#7a3f9a", bokeh: ["#ff8fc8", "#8fe9ff", "#ffe29a"], vig: "#01020c"
    } : {
      sky: [[0, "#34b3ad"], [0.35, "#5fcdbb"], [0.62, "#a9e0c0"], [0.82, "#f6e6a8"], [1, "#f9b9c6"]], star: ["#ffffff", "#fffbe0"], moon: "#fff1b8",
      far: ["#79c3c8", "#86cdc6", "#8fc4d6"], mid: ["#4f9fb6", "#5aa9b0", "#4a8fb8"], near: ["#2f6f9a", "#3a78a0", "#2a5f8f"],
      win: ["#fff6b8", "#ffe58a", "#ffd0dc", "#f7fff0", "#ffb8d0"], dim: "#3f86a6", rim: "#bff0e0",
      neon: ["#ff8fc0", "#fff2a0", "#ffffff", "#ffb0d8", "#b8fff0"], haze: "#ffd9c0", bokeh: ["#ffb8dc", "#ffffff", "#fff0a0", "#ffd0a0"], vig: "#0f3a55"
    };
    var i;
    G.wash(ctx, 0, 0, W, H, P.sky, { n: 420 });
    G.stars(ctx, W, H * 0.6, night ? 620 : 150, P.star);
    /* crescent */
    var mx = W * 0.8, my = H * 0.2;
    G.glow(ctx, mx, my, 280, P.moon, night ? 0.4 : 0.5);
    G.blob(ctx, mx, my, 62, 62, 0, P.moon, 1, 0.03); G.blob(ctx, mx + 30, my - 12, 58, 58, 0, G.ramp(P.sky, 0.19), 1, 0.03);
    if (!night) { G.streak(ctx, W * 0.3, H * 0.5, W * 0.6, H * 0.05, ["#c9f0d8", "#fdf0c0", "#ffd3d8"], 40); G.streak(ctx, W * 0.75, H * 0.62, W * 0.5, H * 0.04, ["#fff0c0", "#ffc9d6"], 30); }
    else { G.streak(ctx, W * 0.4, H * 0.55, W * 0.7, H * 0.06, ["#3a2f80", "#5a3a8a", "#2a2a70"], 44); }
    G.glow(ctx, W * 0.6, H * 1.02, W * 0.6, P.haze, night ? 0.5 : 0.55);
    var env = function (t) { return 0.55 + 0.75 * Math.pow(Math.max(0, t - 0.3) / 0.7, 1.1) + 0.25 * Math.sin(t * 9) * 0.4; };
    city(ctx, W, { base: H * 0.86, w: [50, 130], h: [150, 420], cols: P.far, env: env, win: P.win, cell: [15, 20], lit: [0.15, 0.5], dim: null, roof: 0.3, sc: 0.6, wob: 1.6, beacon: night ? "#ff4a5a" : null });
    ctx.save(); ctx.globalAlpha = night ? 0.3 : 0.38; ctx.fillStyle = G.css(G.ramp(P.sky, 0.8)); ctx.fillRect(0, 0, W, H); ctx.restore();
    city(ctx, W, { base: H * 0.93, w: [90, 230], h: [160, 520], cols: P.mid, env: env, win: P.win, cell: [24, 30], lit: [0.2, 0.62], dim: P.dim, rim: P.rim, rimW: 2.5, winGlow: true, beacon: night ? "#ff4a5a" : "#ff8fb0", gap: 0.08, signs: P.neon, signGlow: night ? 0.65 : 0.4, signFrame: night ? "#0a0c26" : null, signInk: night ? "#0a0c26" : "#ffffff" });
    city(ctx, W, { base: H * 1.02, w: [150, 380], h: [120, 430], cols: P.near, env: function (t) { return 0.45 + 0.9 * Math.pow(Math.max(0, t - 0.42) / 0.58, 1.3) + (t < 0.12 ? 0.35 : 0); }, win: P.win, cell: [40, 48], lit: [0.12, 0.5], dim: P.dim, rim: P.rim, rimW: 3.5, winGlow: true, gap: 0.05, roof: 0.75, sc: 1.3, signs: P.neon, signGlow: night ? 0.7 : 0.4, signFrame: night ? "#0a0c26" : null, signInk: night ? "#0a0c26" : "#ffffff" });
    /* wires, then loose bokeh */
    for (i = 0; i < 5; i++) { var y0 = H * R(0.4, 0.7); ctx.beginPath(); ctx.moveTo(W * 0.3, y0); ctx.quadraticCurveTo(W * 0.65, y0 + R(40, 110), W * 1.02, y0 + R(-60, 40)); ctx.strokeStyle = G.css(P.near[0], 0.8); ctx.lineWidth = R(1.6, 2.6); ctx.stroke(); }
    for (i = 0; i < (night ? 70 : 110); i++) { var bx = W * R(0.2, 1), by = H * R(0.5, 1), br = R(8, 34), bc = G.pick(P.bokeh); ctx.save(); ctx.globalCompositeOperation = "screen"; G.blob(ctx, bx, by, br, br, 0, bc, R(0.14, 0.5), 0.06); ctx.restore(); G.glow(ctx, bx, by, br * 1.9, bc, 0.2); }
    G.finish(ctx, W, H, { bloom: night ? 0.42 : 0.26, bloomBlur: 30, vigCol: P.vig, vig: night ? 0.5 : 0.2 });
  };

  /* ───────────── Новости: закат над крышами ───────────── */
  S.news = function (ctx, W, H, night) {
    G.seed(night ? 7402 : 7401);
    var P = night ? {
      sky: [[0, "#0d0b2a"], [0.35, "#2a1a52"], [0.6, "#6a2a66"], [0.8, "#c2506a"], [0.93, "#f29a5a"], [1, "#f7c77a"]],
      cl: ["#1a1440", "#3a1e5a", "#7a2f66"], clHi: ["#f08a6a", "#ffb07a", "#d85a78"], sun: "#ffb38a", sunA: 0.5,
      far: ["#8a3a66", "#7a3468"], mid: ["#3a1c4c", "#2e1846"], near: ["#0c0a20", "#120c28", "#0a0818"],
      win: ["#ffd98a", "#ffb06a", "#fff0c0"], rim: "#f08a6a", vig: "#04020e"
    } : {
      sky: [[0, "#4c4420"], [0.22, "#8a6a1c"], [0.45, "#d18a18"], [0.7, "#f6ae1c"], [0.88, "#ffd24a"], [1, "#f99a2a"]],
      cl: ["#6a4a18", "#96581a", "#c06a18"], clHi: ["#ffe27a", "#ffc640", "#fff2b0"], sun: "#fffbe0", sunA: 1,
      far: ["#e79a2c", "#de8f28"], mid: ["#a8521c", "#964818"], near: ["#2e1612", "#3a1c14", "#24100e"],
      win: ["#ffe9a0", "#fff6d0", "#ffc24a"], rim: "#ffd24a", vig: "#2a1404"
    };
    var sx = W * 0.705, sy = H * 0.6, i;
    G.wash(ctx, 0, 0, W, H, P.sky, { n: 520, dl: 0.03 });
    if (night) G.stars(ctx, W, H * 0.45, 340, ["#ffffff", "#ffd6e0", "#cfd0ff"]);
    G.glow(ctx, sx, sy, W * 0.5, P.sun, P.sunA * 0.6);
    G.glow(ctx, sx, sy, W * 0.2, P.sun, P.sunA * 0.9);
    if (!night) { G.blob(ctx, sx, sy, 92, 92, 0, "#fffdf0", 1, 0.02); G.glow(ctx, sx, sy, 300, "#fff6c0", 1); }
    /* torn bars of cloud, dark bodies with burning edges */
    for (i = 0; i < 12; i++) {
      var cy = H * (0.06 + Math.pow(i / 12, 1.25) * 0.58), cx = W * R(0.05, 0.95), cw = W * R(0.24, 0.62), ch = H * R(0.025, 0.07) * (1.25 - i / 16);
      G.streak(ctx, cx, cy, cw, ch, P.cl, 42);
      G.streak(ctx, cx + (sx - cx) * 0.1, cy + ch * 0.55, cw * 0.82, ch * 0.3, P.clHi, 26);
    }
    var skyline = function (t) { return 0.5 + 0.55 * Math.exp(-Math.pow((t - 0.6) / 0.16, 2)) + 0.35 * Math.exp(-Math.pow((t - 0.88) / 0.07, 2)) + (t < 0.1 ? 0.2 : 0); };
    city(ctx, W, { base: H * 0.9, w: [34, 100], h: [90, 560], cols: P.far, env: skyline, win: null, roof: 0.3, sc: 0.6, wob: 1.4 });
    G.glow(ctx, sx, sy + 30, W * 0.26, P.sun, P.sunA * 0.55);
    city(ctx, W, { base: H * 0.95, w: [60, 150], h: [110, 470], cols: P.mid, env: skyline, win: night ? P.win : null, cell: [20, 26], lit: [0.05, 0.3], roof: 0.5, sc: 0.9, rim: P.rim, rimW: 2 });
    G.mist(ctx, W, H * 0.9, H * 0.12, G.ramp(P.sky, 0.93), 0.5, 20);
    city(ctx, W, { base: H * 1.02, w: [130, 330], h: [110, 400], cols: P.near, env: function (t) { return 0.5 + 0.8 * Math.pow(Math.max(0, t - 0.5) / 0.5, 1.4) + (t < 0.14 ? 0.5 : 0); }, win: P.win, cell: [38, 46], lit: night ? [0.12, 0.42] : [0.02, 0.1], roof: 0.8, sc: 1.4, rim: P.rim, rimW: 3, winGlow: night, gap: 0.04 });
    /* a single lens ghost, the way the camera caught it */
    G.glow(ctx, sx - W * 0.16, sy + H * 0.14, 70, P.sun, 0.35); G.glow(ctx, sx - W * 0.26, sy + H * 0.22, 36, "#ff8a5a", 0.3);
    G.finish(ctx, W, H, { bloom: night ? 0.3 : 0.36, bloomBlur: 36, vigCol: P.vig, vig: 0.42 });
  };

  /* ───────────── Словарь: бухта и облачные острова ───────────── */
  S.dict = function (ctx, W, H, night) {
    G.seed(night ? 8502 : 8501);
    var P = night ? {
      sky: [[0, "#070c2e"], [0.35, "#16246a"], [0.62, "#2f3f98"], [0.8, "#6a58a8"], [1, "#c98aa8"]],
      cloud: { shadow: "#2c2a6a", deep: "#1c1c52", mid: "#5a4a94", light: "#a8749c", hi: "#ffc19a", base: "#3a3a80" },
      cloudFar: { shadow: "#39408c", deep: "#2c3278", mid: "#5d5aa4", light: "#9a7aa8", hi: "#e8a89a", base: "#414a94" },
      sea: [[0, "#8a6aa0"], [0.12, "#3a4690"], [0.5, "#14235e"], [1, "#070f30"]], glint: "#ffc7a8",
      rock: ["#1c2452", "#2a2f66", "#4a4a86"], rockHi: "#8a78a8", leaf: ["#040a20", "#0a1838", "#16345a", "#3a6a86"],
      red: "#ff7a5a", sail: "#f6e9d8", vig: "#02030f", swirl: ["#2a3f9a", "#3f58b8", "#1a2a78"]
    } : {
      sky: [[0, "#3aa4d6"], [0.4, "#74c8e6"], [0.7, "#b4e6ee"], [1, "#e6f8ee"]],
      cloud: { shadow: "#9cc3de", deep: "#7fa9cf", mid: "#d4e6ee", light: "#fbfbf2", hi: "#ffffff", base: "#a8cde2" },
      cloudFar: { shadow: "#a9d3e8", deep: "#98c4e0", mid: "#d6ecf2", light: "#f4fbf6", hi: "#ffffff", base: "#b4dcec" },
      sea: [[0, "#bfeee0"], [0.1, "#52c7c4"], [0.5, "#1f8fb0"], [1, "#0d5a8c"]], glint: "#ffffff",
      rock: ["#a89f8a", "#d2c7ad", "#ece3c8"], rockHi: "#fbf6e2", leaf: ["#0f3d2a", "#1f6a3a", "#4ea04a", "#b4dc6a"],
      red: "#e23a2a", sail: "#fffaf0", vig: "#0d3a66", swirl: null
    };
    var hz = H * 0.6, i;
    G.wash(ctx, 0, 0, W, hz + 20, P.sky, { n: 460 });
    if (night) {
      /* the sky is laid in long curved drags, with stars dropped into the wet paint */
      for (i = 0; i < 260; i++) { var a = R(-0.5, -0.15); G.dab(ctx, R(0, W), R(0, hz * 0.8), R(160, 620), R(4, 16), a, G.jit(G.pick(P.swirl), 0.015, 0.06, 0.04), R(0.15, 0.45), 1); }
      G.stars(ctx, W, hz * 0.85, 760, ["#ffffff", "#cfdcff", "#ffe6c8", "#ffc8e6"]);
    }
    var L = night ? { lx: 0.45, ly: -0.6 } : { lx: -0.45, ly: -0.75 };
    /* far isles of cloud standing on the horizon */
    [[0.1, 0.2, 0.1], [0.3, 0.16, 0.08], [0.52, 0.2, 0.11], [0.72, 0.15, 0.08]].forEach(function (c) { G.cloud(ctx, W * c[0], hz - H * 0.015, W * c[1], H * c[2], P.cloudFar, L); });
    G.mist(ctx, W, hz - H * 0.02, H * 0.06, G.ramp(P.sky, 0.95), 0.6, 20);
    /* the towering ones */
    G.cloud(ctx, W * 0.56, H * 0.4, W * 0.36, H * 0.3, P.cloud, L);
    G.cloud(ctx, W * 0.22, H * 0.3, W * 0.3, H * 0.2, P.cloud, L);
    G.cloud(ctx, W * 0.83, H * 0.24, W * 0.3, H * 0.17, P.cloud, L);
    G.cloud(ctx, W * 0.02, H * 0.47, W * 0.2, H * 0.1, P.cloudFar, L);
    /* sea */
    G.water(ctx, 0, hz, W, H - hz, P.sea, { n: 1500, glint: P.glint, glints: night ? 220 : 380, gx: night ? 0.56 : 0.5, gw: night ? 0.07 : 0.3 });
    /* cloud shadows drifting on the water */
    if (!night) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.filter = "blur(10px)"; [[0.56, 0.7, 0.2], [0.22, 0.77, 0.16], [0.4, 0.9, 0.24]].forEach(function (s) { G.blob(ctx, W * s[0], H * s[1], W * s[2], H * 0.03, 0, "#5aa0c8", 0.5, 0.2); }); ctx.restore(); }
    /* a small red boat: the one saturated note */
    var bx = W * 0.6, by = H * 0.735;
    for (i = 0; i < 16; i++) G.dab(ctx, bx - 30 - i * 15, by + 10 + R(-2, 3), R(20, 48), R(2, 5), 0, P.glint, R(0.4, 0.9), 0);
    G.dab(ctx, bx, by + 4, 78, 18, 0.02, P.red, 1, 1); G.dab(ctx, bx, by + 12, 70, 8, 0.02, G.shade(P.red, -0.16), 1, 0);
    ctx.beginPath(); ctx.moveTo(bx - 4, by - 74); ctx.lineTo(bx + 34, by - 6); ctx.lineTo(bx - 8, by - 4); ctx.closePath(); ctx.fillStyle = G.css(P.sail); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - 10, by - 60); ctx.lineTo(bx - 14, by - 6); ctx.lineTo(bx - 40, by - 5); ctx.closePath(); ctx.fillStyle = G.css(G.shade(P.sail, -0.1)); ctx.fill();
    if (night) G.glow(ctx, bx, by - 20, 90, "#ffd28a", 0.7);
    /* headland at the far side: pale stone, crowned with trees */
    var pts = [];
    for (var x = W * 0.7; x <= W + 20; x += 12) { var t = (x - W * 0.7) / (W * 0.3); pts.push([x, H * 0.99 - Math.pow(t, 0.62) * H * 0.62 * (0.82 + 0.3 * G.fbm(x * 0.004, 2, 5, 3))]); }
    var path = function () { ctx.beginPath(); ctx.moveTo(W * 0.7, H + 5); pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.lineTo(W + 20, H + 5); ctx.closePath(); };
    G.clip(ctx, path, function () {
      ctx.fillStyle = G.css(P.rock[1]); ctx.fillRect(W * 0.6, 0, W * 0.5, H + 5);
      for (i = 0; i < 1700; i++) {
        var p = G.pick(pts), d = G.r() * (H - p[1]), c = G.r() < 0.3 ? P.rock[0] : G.r() < 0.6 ? P.rock[1] : P.rock[2];
        G.dab(ctx, p[0] + R(-30, 30), p[1] + d, R(16, 70), R(8, 26), R(-0.5, 0.25), G.jit(c, 0.015, 0.05, 0.04), R(0.5, 1), 1);
      }
      for (i = 0; i < 260; i++) { p = G.pick(pts); G.dab(ctx, p[0] + R(-10, 20), p[1] + R(4, 70), R(14, 60), R(4, 12), R(-0.6, 0), G.jit(P.rockHi, 0.01, 0.04, 0.02), R(0.5, 1), 0); }
      for (i = 0; i < 60; i++) { p = G.pick(pts); G.line(ctx, p[0] + R(-20, 20), p[1] + R(30, 300), p[0] + R(-40, 40), p[1] + R(120, 500), R(1.5, 4), G.shade(P.rock[0], -0.1), R(0.3, 0.7), 5); }
    });
    for (i = 0; i < pts.length; i += 2) { var q = pts[i], k = (q[0] - W * 0.7) / (W * 0.3); if (k < 0.12) continue; G.foliage(ctx, q[0] + R(-20, 20), q[1] - R(10, 50) * k, R(70, 150) * (0.5 + k), R(50, 100) * (0.5 + k), P.leaf, { lx: L.lx, ly: -0.8, leaf: R(10, 17) }); }
    for (i = 0; i < 9; i++) G.foliage(ctx, W * R(0.86, 1.02), H * R(0.02, 0.5), R(150, 260), R(110, 190), P.leaf, { lx: L.lx, ly: -0.8, leaf: R(15, 22) });
    for (i = 0; i < 5; i++) G.foliage(ctx, W * R(0.74, 0.9), H * R(0.9, 1.04), R(120, 220), R(70, 120), P.leaf, { lx: L.lx, ly: -0.8, leaf: R(14, 20) });
    if (night) { G.glow(ctx, W * 0.845, H * 0.56, 150, "#ffcf8a", 0.9); G.blob(ctx, W * 0.845, H * 0.56, 7, 9, 0, "#fff3c8", 1, 0.1); }
    G.finish(ctx, W, H, { bloom: night ? 0.3 : 0.2, vigCol: P.vig, vig: night ? 0.45 : 0.16 });
  };
})();
