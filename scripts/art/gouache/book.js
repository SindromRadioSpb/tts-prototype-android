/* The book: what turns the study table into a page of a bound volume. Browser-side; needs painter.js
   and scenes.js (window.SCENES). Outputs go to public/art/gouache/ through run.js.
     vellum      neutral alpha tooth (mottling, fibres); the page colour comes from CSS, so one file
                 serves the day page and the night page; periodic, tiles without a seam
     gilt-frame  a 9-slice for border-image: tooled corner scrolls and a double rule, gold laid in three
                 passes (shadow, body, highlight) like leaf pressed into the page
     flourish    a calligraphic swash with a lozenge (mask), for section heads and the end of a text
     tailpiece   a small closing ornament (mask) for the end of a text */
(function () {
  "use strict";
  var G = window.G, R = G.R, S = window.SCENES, WHITE = "#ffffff";
  function meta(fn, size, out) { fn.meta = { single: true, size: size, out: out }; return fn; }

  /* day: brown mottling, dark and pale fibres. night: the same sheet by moonlight — a faint pale haze,
     barely-there fibres and a dust of gilt, so nothing glares on the dark page. */
  function vellum(night) { return function (ctx, W, H) {
    G.seed(921);
    var MOT = night ? [196, 204, 255] : [52, 36, 14], MOTA = night ? 16 : 34;
    var FD = night ? ["#c8ceff", 0.015, 0.04] : ["#3a2810", 0.03, 0.08];
    var FL = night ? ["#e8d9a6", 0.02, 0.05] : ["#ffffff", 0.12, 0.28];
    var P = 16, lat = [], i, j;
    for (i = 0; i < P * P; i++) lat.push(G.r());
    function vn(x, y, p) {
      var fx = x * p, fy = y * p, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      function L(a, b) { return lat[(((a % p) + p) % p) * P + (((b % p) + p) % p)]; }
      var a = L(x0, y0), b = L(x0 + 1, y0), c = L(x0, y0 + 1), d = L(x0 + 1, y0 + 1);
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
    var im = ctx.createImageData(W, H), px = im.data;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      var u = i / W, v = j / H;
      var n = vn(u, v, 3) * 0.5 + vn(u, v, 6) * 0.3 + vn(u, v, 12) * 0.2;
      var k = (j * W + i) * 4, g = G.r() + G.r() - 1;
      var dark = Math.max(0, n - 0.46) * MOTA + (g < -0.72 ? (night ? 3 : 7) : 0);
      px[k] = MOT[0]; px[k + 1] = MOT[1]; px[k + 2] = MOT[2]; px[k + 3] = Math.min(255, dark);
    }
    ctx.putImageData(im, 0, 0);
    function fibre(x, y, len, ang, col, a, w) {
      var c1 = R(-6, 6), c2 = R(-6, 6), e = R(-3, 3);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        ctx.save(); ctx.translate(x + dx * W, y + dy * H); ctx.rotate(ang);
        ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.3, c1, len * 0.7, c2, len, e); ctx.stroke(); ctx.restore();
      }
    }
    for (i = 0; i < 240; i++) fibre(G.r() * W, G.r() * H, R(10, 46), R(-0.5, 0.5) + (G.r() < 0.3 ? 1.57 : 0), FD[0], R(FD[1], FD[2]), R(0.4, 0.9));
    for (i = 0; i < 180; i++) fibre(G.r() * W, G.r() * H, R(14, 60), R(-0.4, 0.4), FL[0], R(FL[1], FL[2]), R(0.6, 1.3));
    for (i = 0; i < (night ? 46 : 24); i++) {
      var sx = G.r() * W, sy = G.r() * H;
      ctx.globalAlpha = night ? R(0.25, 0.6) : R(0.12, 0.28); ctx.fillStyle = night ? "#e9c877" : "#4a3214";
      ctx.beginPath(); ctx.arc(sx, sy, night ? R(0.4, 1) : R(0.5, 1.4), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }; }
  S["vellum"] = meta(vellum(false), [512, 512], [{ width: 512, quality: 58 }]);
  S["vellum-night"] = meta(vellum(true), [512, 512], [{ width: 512, quality: 58 }]);

  var GOLD = ["#5e4212", "#b48529", "#f4dc92"];
  function goldLine(ctx, pts, w) {
    for (var pass = 0; pass < 3; pass++) {
      var off = [1.3, 0, -0.6][pass], ww = w * [1.2, 1, 0.4][pass], a = [0.5, 1, 0.85][pass];
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = GOLD[pass]; ctx.lineWidth = ww; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(pts[0][0] + off, pts[0][1] + off);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + off + R(-0.15, 0.15), pts[i][1] + off + R(-0.15, 0.15));
      ctx.stroke(); ctx.restore();
    }
  }
  function goldDot(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = GOLD[0]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x + 1.1, y + 1.1, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = GOLD[1]; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = GOLD[2]; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.42, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function leaf(ctx, x, y, len, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    var L = [[GOLD[0], 0.5, 1.1, 1], [GOLD[1], 1, 0, 1], [GOLD[2], 0.75, -0.5, 0.4]];
    for (var c = 0; c < 3; c++) {
      var o = L[c][2], s = L[c][3];
      ctx.fillStyle = L[c][0]; ctx.globalAlpha = L[c][1];
      ctx.beginPath(); ctx.moveTo(o, o);
      ctx.quadraticCurveTo(len * 0.5 + o, -len * 0.34 * s + o, len + o, o);
      ctx.quadraticCurveTo(len * 0.5 + o, len * 0.2 * s + o, o, o); ctx.fill();
    }
    ctx.restore();
  }
  function spiral(cx, cy, r0, turns, dir, start) {
    var p = [];
    for (var i = 0; i <= 64; i++) { var t = i / 64, a = start + dir * t * turns * 6.283, r = r0 * (1 - t * 0.8); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return p;
  }

  S["gilt-frame"] = meta(function (ctx, W, H) {
    G.seed(922);
    var S9 = 120, o1 = 22, o2 = 31;
    function corner() {
      goldLine(ctx, [[o1 + 40, o1], [S9 + 2, o1]], 3); goldLine(ctx, [[o1, o1 + 40], [o1, S9 + 2]], 3);
      goldLine(ctx, [[o2 + 34, o2], [S9 + 2, o2]], 1.4); goldLine(ctx, [[o2, o2 + 34], [o2, S9 + 2]], 1.4);
      goldLine(ctx, spiral(o1 + 26, o1 + 8, 17, 1.1, 1, 3.3), 2.4);
      goldLine(ctx, spiral(o1 + 8, o1 + 26, 17, 1.1, -1, -1.73), 2.4);
      leaf(ctx, o1 + 4, o1 + 4, 36, 0.785); leaf(ctx, o1 + 9, o1 + 9, 17, 0.25); leaf(ctx, o1 + 9, o1 + 9, 17, 1.32);
      goldDot(ctx, o1 + 1, o1 + 1, 4);
      for (var k = 0; k < 2; k++) {
        ctx.save(); if (k) ctx.transform(0, 1, 1, 0, 0, 0);
        var pts = []; for (var i = 0; i <= 28; i++) { var t = i / 28; pts.push([o2 + 30 + t * 52, o2 + 11 + Math.sin(t * 6.283) * 4.5]); }
        goldLine(ctx, pts, 1.4);
        leaf(ctx, o2 + 40, o2 + 9, 12, -0.95); leaf(ctx, o2 + 57, o2 + 14, 12, 0.75); leaf(ctx, o2 + 71, o2 + 8, 11, -0.85);
        goldDot(ctx, o2 + 85, o2 + 11, 2.1); goldDot(ctx, o2 + 92, o2 + 11, 1.4); goldDot(ctx, o2 + 97, o2 + 11, 0.9);
        ctx.restore();
      }
    }
    function edge() { goldLine(ctx, [[S9 - 4, o1], [W - S9 + 4, o1]], 3); goldLine(ctx, [[S9 - 4, o2], [W - S9 + 4, o2]], 1.4); }
    var T = [[1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, W, 0], [1, 0, 0, -1, 0, H], [-1, 0, 0, -1, W, H]];
    for (var c = 0; c < 4; c++) { ctx.save(); ctx.setTransform.apply(ctx, T[c]); corner(); edge(); ctx.restore(); }
    ctx.save(); ctx.setTransform(0, 1, 1, 0, 0, 0); edge(); ctx.restore();
    ctx.save(); ctx.setTransform(0, 1, -1, 0, W, 0); edge(); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = "destination-out";
    for (var f = 0; f < 160; f++) { ctx.globalAlpha = R(0.3, 0.9); ctx.beginPath(); ctx.arc(G.r() * W, G.r() * H, R(0.4, 1.1), 0, 6.283); ctx.fill(); }
    ctx.restore();
  }, [360, 360], [{ width: 360, quality: 90 }]);

  S["flourish"] = meta(function (ctx, W, H) {
    G.seed(923);
    var cx = W / 2, cy = H / 2;
    ctx.fillStyle = WHITE;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < 160; i++) {
        var t = i / 159, x = cx + side * (14 + t * (W / 2 - 30)), y = cy + Math.sin(t * 7.4) * (H * 0.24) * (1 - t * 0.6) * side;
        var r = Math.max(0.7, 4.6 * Math.pow(1 - t, 1.5));
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx + side * (W / 2 - 14), cy, 2.4, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + side * 34, cy + side * 10, 1.8, 0, 6.283); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill();
  }, [480, 48], [{ width: 480, quality: 90 }]);

  S["tailpiece"] = meta(function (ctx, W, H) {
    G.seed(924);
    var cx = W / 2, cy = H / 2;
    ctx.fillStyle = WHITE; ctx.strokeStyle = WHITE; ctx.lineCap = "round";
    /* a small vine: a central bud, two leaves, two curls, three dots beneath */
    function lf(x, y, len, a) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.36, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.22, 0, 0); ctx.fill(); ctx.restore(); }
    lf(cx, cy + 6, 30, -1.57); lf(cx, cy + 4, 34, -0.42); lf(cx, cy + 4, 34, -2.72);
    for (var s = -1; s <= 1; s += 2) {
      var p = spiral(cx + s * 42, cy + 2, 12, 1.05, s, s > 0 ? 3.4 : -0.26);
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx, cy + 8);
      ctx.quadraticCurveTo(cx + s * 26, cy + 18, p[0][0], p[0][1]);
      for (var i = 1; i < p.length; i++) { ctx.lineWidth = 2.4 * (1 - i / p.length * 0.6); ctx.lineTo(p[i][0], p[i][1]); }
      ctx.stroke();
    }
    [[cx, cy + 22, 2.4], [cx - 7, cy + 28, 1.6], [cx + 7, cy + 28, 1.6]].forEach(function (d) { ctx.beginPath(); ctx.arc(d[0], d[1], d[2], 0, 6.283); ctx.fill(); });
  }, [140, 64], [{ width: 140, quality: 90 }]);
})();
