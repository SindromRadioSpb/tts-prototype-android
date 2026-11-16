/* Brush-made interface parts: alpha masks (edge, stroke, dab, vignette), paper tooth and the six
   navigation glyphs. All are painted white on transparent and used through CSS mask-image, so the
   pigment comes from design tokens. Browser-side; needs painter.js. */
(function () {
  "use strict";
  var G = window.G, R = G.R, S = window.SCENES, WHITE = "#ffffff";

  function dry(ctx, W, H, n, len, horizontal) {
    ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var x = G.r() * W, y = G.r() * H, l = R(0.3, 1) * len;
      ctx.strokeStyle = "rgba(0,0,0," + R(0.25, 0.9) + ")"; ctx.lineWidth = R(0.6, 2.2);
      ctx.beginPath(); ctx.moveTo(x, y);
      if (horizontal) ctx.lineTo(x + l, y + R(-1, 1)); else ctx.lineTo(x + R(-1, 1), y + l);
      ctx.stroke();
    }
    ctx.restore();
  }
  function meta(fn, size, out) { fn.meta = { single: true, size: size, out: out }; return fn; }

  /* bottom edge of a painted area: where the brush ran out on the paper */
  S["edge"] = meta(function (ctx, W, H) {
    G.seed(901);
    ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H * 0.42);
    for (var i = 0; i < 520; i++) {
      var x = G.r() * W, d = Math.pow(G.r(), 1.8);
      G.dab(ctx, x, H * (0.36 + d * 0.5), R(60, 260), R(6, 22) * (1 - d * 0.6), R(-0.05, 0.05), WHITE, 1, 0);
    }
    for (i = 0; i < 160; i++) G.dab(ctx, G.r() * W, H * R(0.7, 0.97), R(30, 150), R(1.5, 5), R(-0.03, 0.03), WHITE, R(0.5, 1), 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.4, W, H); ctx.clip(); dry(ctx, W, H, 700, 120, true); ctx.restore();
  }, [1600, 72], [{ width: 1600, quality: 86 }]);

  /* one loaded stroke, pressed at the start and lifting at the end */
  S["stroke"] = meta(function (ctx, W, H) {
    G.seed(902);
    for (var i = 0; i < 90; i++) {
      var t = i / 89, w = H * (0.72 - 0.42 * Math.pow(t, 2.2)) * R(0.9, 1.08);
      G.dab(ctx, 30 + t * (W - 70), H * (0.5 + 0.08 * Math.sin(t * 3.4)), R(40, 90), w, R(-0.06, 0.06), WHITE, 1, 0);
    }
    for (i = 0; i < 40; i++) G.dab(ctx, W * R(0.6, 0.98), H * R(0.3, 0.75), R(30, 100), R(1.5, 4), R(-0.04, 0.04), WHITE, R(0.5, 1), 0);
    ctx.save(); ctx.beginPath(); ctx.rect(W * 0.62, 0, W, H); ctx.clip(); dry(ctx, W, H, 90, 160, true); ctx.restore();
    dry(ctx, W, H, 50, 120, true);
  }, [640, 64], [{ width: 640, quality: 86 }]);

  /* a round pat of colour */
  S["dab"] = meta(function (ctx, W, H) {
    G.seed(903);
    for (var i = 0; i < 46; i++) { var a = R(0, 6.283), d = Math.sqrt(G.r()) * 0.3; G.dab(ctx, W / 2 + Math.cos(a) * d * W, H / 2 + Math.sin(a) * d * H * 0.9, R(0.25, 0.44) * W, R(0.12, 0.24) * H, R(-0.5, -0.1), WHITE, 1, 0); }
    dry(ctx, W, H, 60, 90, true);
  }, [240, 240], [{ width: 240, quality: 86 }]);

  /* a loose painted patch: the window through which an empty state shows its scene */
  S["vignette"] = meta(function (ctx, W, H) {
    G.seed(904);
    for (var i = 0; i < 420; i++) {
      var a = R(0, 6.283), d = Math.pow(G.r(), 0.6) * 0.44;
      G.dab(ctx, W / 2 + Math.cos(a) * d * W, H / 2 + Math.sin(a) * d * H, R(60, 200), R(14, 44), R(-0.2, 0.1), WHITE, 1, 0);
    }
    for (i = 0; i < 70; i++) { a = R(0, 6.283); G.dab(ctx, W / 2 + Math.cos(a) * 0.47 * W, H / 2 + Math.sin(a) * 0.46 * H, R(40, 140), R(3, 9), R(-0.2, 0.1), WHITE, R(0.5, 1), 0); }
    dry(ctx, W, H, 90, 140, true);
  }, [720, 480], [{ width: 720, quality: 84 }]);

  /* paper tooth: dark and light specks; tiles without a seam because nothing in it has a scale */
  S["paper"] = meta(function (ctx, W, H) {
    G.seed(905);
    var im = ctx.createImageData(W, H), d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = G.r() + G.r() - 1, dark = n < 0;
      d[i] = d[i + 1] = d[i + 2] = dark ? 20 : 255; d[i + 3] = Math.abs(n) * (dark ? 15 : 30);
    }
    ctx.putImageData(im, 0, 0);
  }, [128, 128], [{ width: 128, lossless: true }]);

  /* ---- navigation glyphs: drawn with a small round brush ---- */
  function path(ctx, pts, w, closed) {
    var n = pts.length, i;
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < n - (closed ? 0 : 1); i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        G.line(ctx, a[0], a[1], b[0], b[1], w * (pass ? 0.7 : 1), WHITE, 1, 1.4);
      }
    }
  }
  function arc(cx, cy, r, a0, a1, n) { var p = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * (i / n); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
  function glyph(name, seed, draw) {
    S["nav-" + name] = meta(function (ctx, W, H) { G.seed(seed); draw(ctx); dry(ctx, W, H, 9, 40, true); }, [160, 160], [{ width: 96, quality: 90 }]);
  }
  var w = 12;
  glyph("room", 911, function (c) { /* an open book */
    path(c, [[80, 46], [80, 128]], w);
    path(c, [[80, 46], [56, 34], [22, 38], [22, 118], [56, 116], [80, 128]], w);
    path(c, [[80, 46], [104, 34], [138, 38], [138, 118], [104, 116], [80, 128]], w);
    path(c, [[38, 62], [62, 60]], 7); path(c, [[38, 82], [62, 80]], 7); path(c, [[98, 60], [122, 62]], 7); path(c, [[98, 80], [122, 82]], 7);
  });
  glyph("mediatheque", 912, function (c) { /* a screen with a play mark */
    path(c, [[24, 36], [136, 34], [138, 112], [22, 114]], w, true);
    path(c, [[66, 54], [102, 74], [66, 96]], w, true);
    G.blob(c, 76, 75, 14, 16, 0, WHITE, 1, 0.2);
    path(c, [[54, 136], [106, 136]], w);
  });
  glyph("news", 913, function (c) { /* a folded sheet */
    path(c, [[28, 28], [118, 26], [120, 132], [30, 134]], w, true);
    path(c, [[120, 58], [140, 60], [140, 120], [120, 132]], 9);
    path(c, [[46, 52], [102, 51]], 14);
    path(c, [[46, 78], [102, 78]], 7); path(c, [[46, 96], [102, 97]], 7); path(c, [[46, 114], [84, 114]], 7);
  });
  glyph("studio", 914, function (c) { /* a brush laying a line */
    path(c, [[112, 22], [136, 46], [70, 112], [44, 116], [48, 90]], w, true);
    path(c, [[96, 40], [120, 62]], 8);
    path(c, [[22, 140], [58, 132], [96, 140], [138, 132]], w);
  });
  glyph("review", 915, function (c) { /* come back around */
    path(c, arc(80, 82, 50, -0.6, 4.3, 26), w);
    path(c, [[96, 26], [124, 52], [128, 16]], w, true);
    G.blob(c, 80, 82, 13, 13, 0, WHITE, 1, 0.18);
  });
  glyph("dictionary", 916, function (c) { /* alef on a card */
    path(c, [[26, 24], [134, 26], [136, 136], [24, 134]], w, true);
    path(c, [[52, 50], [108, 110]], 15);
    path(c, [[110, 42], [104, 62], [90, 70]], 12);
    path(c, [[50, 118], [56, 98], [70, 90]], 12);
  });
})();
