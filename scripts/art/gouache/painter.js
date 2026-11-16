/* Gouache painter — browser-side primitives (runs inside headless Chromium, see run.js).
   Everything is built from opaque, slightly ragged brush dabs with pigment jitter, painted back to
   front, then finished with halation and paper grain. Deterministic: one seed -> one painting. */
(function () {
  "use strict";
  var G = (window.G = {});

  G.seed = function (s) {
    var a = s >>> 0;
    G.r = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  G.seed(1);
  var R = function (a, b) { return a + (b - a) * G.r(); };
  G.R = R;
  G.pick = function (arr) { return arr[Math.floor(G.r() * arr.length) % arr.length]; };
  G.gauss = function () { return (G.r() + G.r() + G.r() + G.r() - 2) / 2; };

  /* ---------- colour ---------- */
  function hex(c) {
    if (Array.isArray(c)) return c;
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  G.hex = hex;
  G.mix = function (a, b, t) {
    a = hex(a); b = hex(b);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 1) + 1) % 1; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
    function f(p, q, t) {
      t = ((t % 1) + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  /* pigment jitter: small hue / saturation / value drift, the way a loaded brush never repeats */
  G.jit = function (c, dh, ds, dl) {
    var k = toHsl(hex(c));
    return fromHsl(k[0] + (G.r() - 0.5) * 2 * (dh || 0), k[1] + (G.r() - 0.5) * 2 * (ds || 0), k[2] + (G.r() - 0.5) * 2 * (dl || 0));
  };
  G.shade = function (c, dl, ds) { var k = toHsl(hex(c)); return fromHsl(k[0], k[1] + (ds || 0), k[2] + dl); };
  G.css = function (c, a) {
    c = hex(c);
    return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + (a == null ? 1 : a) + ")";
  };
  G.ramp = function (stops, t) {
    t = Math.min(1, Math.max(0, t));
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        return G.mix(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return hex(stops[stops.length - 1][1]);
  };

  /* ---------- noise ---------- */
  function h2(x, y, s) {
    var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function vn(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  G.fbm = function (x, y, s, oct) {
    var t = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < (oct || 4); i++) { t += a * vn(x * f, y * f, s + i * 13); n += a; a *= 0.5; f *= 2; }
    return t / n;
  };

  /* ---------- brush ---------- */
  /* one ragged opaque dab */
  G.blob = function (ctx, x, y, rx, ry, rot, col, a, rag) {
    var n = 9 + ((G.r() * 5) | 0), pts = [], i;
    rag = rag == null ? 0.2 : rag;
    var cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2, k = 1 + (G.r() - 0.5) * 2 * rag;
      var px = Math.cos(t) * rx * k, py = Math.sin(t) * ry * k;
      pts.push([x + px * cs - py * sn, y + px * sn + py * cs]);
    }
    ctx.beginPath();
    var l = pts[n - 1], f = pts[0];
    ctx.moveTo((l[0] + f[0]) / 2, (l[1] + f[1]) / 2);
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.fillStyle = G.css(col, a == null ? 1 : a);
    ctx.fill();
  };
  /* a flat brush stroke: elongated dab plus a few bristle tracks */
  G.dab = function (ctx, x, y, len, wid, ang, col, a, bristle) {
    G.blob(ctx, x, y, len / 2, wid / 2, ang, col, a, 0.16);
    var n = bristle == null ? 2 : bristle;
    if (!n) return;
    var cs = Math.cos(ang), sn = Math.sin(ang);
    ctx.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var o = R(-0.34, 0.34) * wid, l = len * R(0.3, 0.8), s = R(-0.2, 0.2) * len;
      ctx.strokeStyle = G.css(G.shade(col, R(-0.05, 0.05)), (a == null ? 1 : a) * 0.55);
      ctx.lineWidth = Math.max(0.7, wid * R(0.05, 0.14));
      ctx.beginPath();
      ctx.moveTo(x + cs * (s - l / 2) - sn * o, y + sn * (s - l / 2) + cs * o);
      ctx.lineTo(x + cs * (s + l / 2) - sn * o, y + sn * (s + l / 2) + cs * o);
      ctx.stroke();
    }
  };
  /* a hand-drawn line: wobbling, with pressure */
  G.line = function (ctx, x0, y0, x1, y1, w, col, a, wob) {
    var d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, (d / 14) | 0);
    var nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1);
    wob = wob == null ? 1.2 : wob;
    ctx.strokeStyle = G.css(col, a == null ? 1 : a);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    var px = x0, py = y0;
    for (var i = 1; i <= n; i++) {
      var t = i / n, o = (G.r() - 0.5) * 2 * wob;
      var x = x0 + (x1 - x0) * t + nx * o, y = y0 + (y1 - y0) * t + ny * o;
      ctx.lineWidth = Math.max(0.5, w * R(0.75, 1.2));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      px = x; py = y;
    }
  };
  /* slightly-off rectangle, as cut by a hand-held flat brush */
  G.box = function (ctx, x, y, w, h, col, a, wob) {
    wob = wob == null ? 2 : wob;
    var j = function () { return (G.r() - 0.5) * 2 * wob; };
    ctx.beginPath();
    ctx.moveTo(x + j(), y + j());
    ctx.lineTo(x + w / 2 + j(), y + j() * 0.6);
    ctx.lineTo(x + w + j(), y + j());
    ctx.lineTo(x + w + j() * 0.6, y + h / 2 + j());
    ctx.lineTo(x + w + j(), y + h + j());
    ctx.lineTo(x + j(), y + h + j());
    ctx.lineTo(x + j() * 0.6, y + h / 2 + j());
    ctx.closePath();
    ctx.fillStyle = G.css(col, a == null ? 1 : a);
    ctx.fill();
  };

  /* graded wash laid with broad horizontal strokes */
  G.wash = function (ctx, x, y, w, h, stops, o) {
    o = o || {};
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    stops.forEach(function (s) { g.addColorStop(s[0], G.css(s[1])); });
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    var n = o.n == null ? 520 : o.n;
    for (var i = 0; i < n; i++) {
      var t = G.r(), yy = y + t * h, c = G.jit(G.ramp(stops, t), o.dh == null ? 0.012 : o.dh, 0.05, o.dl == null ? 0.022 : o.dl);
      G.dab(ctx, x + G.r() * w, yy, R(120, 520) * (o.len || 1), R(14, 54), R(-0.05, 0.05) + (o.ang || 0), c, R(0.1, 0.3), 1);
    }
  };

  G.clip = function (ctx, path, fn) { ctx.save(); path(); ctx.clip(); fn(); ctx.restore(); };

  /* soft radial light */
  G.glow = function (ctx, x, y, r, col, a, mode) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, G.css(col, a)); g.addColorStop(0.45, G.css(col, a * 0.42)); g.addColorStop(1, G.css(col, 0));
    ctx.save(); ctx.globalCompositeOperation = mode || "screen";
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  };

  /* cumulus: one crisp silhouette; inside it the tones are worked wet into each other, the way
     poster colour is blended on the board, then the crowns get dry, sharp light. */
  G.cloud = function (ctx, cx, base, w, h, pal, o) {
    o = o || {};
    var lx = o.lx == null ? -0.5 : o.lx, ly = o.ly == null ? -0.75 : o.ly;
    var pad = h * 0.5, cw = Math.ceil(w + pad * 2), chh = Math.ceil(h * 1.7 + pad);
    var c = document.createElement("canvas"); c.width = cw; c.height = chh;
    var x = c.getContext("2d"), ox = cw / 2, by = chh - pad * 0.4, s = G.r() * 99, lobes = [], i;
    var env = function (t) { return Math.pow(Math.sin(Math.PI * t), 0.5) * (0.3 + 1.05 * G.fbm(t * 2.4, 0.3, s, 3)); };
    var n = 13 + ((w / h) * 6 | 0);
    for (i = 0; i < n; i++) {
      var t = G.r(), up = i < n * 0.3 ? R(0.75, 1) : Math.pow(G.r(), 1.2), e = env(t);
      var r = h * (0.2 + 0.24 * G.r()) * (1 - 0.42 * up) * (0.5 + 0.7 * Math.sin(Math.PI * t)) * (0.6 + e * 0.6);
      lobes.push([ox + (t - 0.5) * w, by - up * e * h - r * 0.45, r]);
    }
    lobes.forEach(function (p) { G.blob(x, p[0], p[1], p[2] * R(0.95, 1.1), p[2] * R(0.85, 1), R(-0.5, 0.5), pal.shadow, 1, 0.09); });
    for (i = 0; i < w / 30; i++) G.blob(x, ox + R(-0.46, 0.46) * w, by - h * 0.05, R(40, 110), h * 0.08, 0, pal.shadow, 1, 0.1);
    x.clearRect(0, by, cw, chh);
    x.globalCompositeOperation = "source-atop";
    var pass = function (col, scale, off, a, blur, dl) {
      x.filter = blur ? "blur(" + Math.max(1, blur) + "px)" : "none";
      lobes.forEach(function (p) {
        G.blob(x, p[0] + lx * p[2] * off, p[1] + ly * p[2] * off, p[2] * scale * R(0.9, 1.12), p[2] * scale * R(0.8, 1), R(-0.4, 0.4), G.jit(col, 0.012, 0.05, dl), a, 0.16);
      });
    };
    if (pal.deep) { x.filter = "blur(" + Math.round(h * 0.03) + "px)"; lobes.forEach(function (p) { if (G.r() < 0.6) G.blob(x, p[0] - lx * p[2] * 0.4, p[1] - ly * p[2] * 0.5, p[2] * 0.7, p[2] * 0.42, R(-0.3, 0.3), G.jit(pal.deep, 0.01, 0.04, 0.02), 0.8, 0.2); }); }
    pass(pal.mid, 0.86, 0.22, 0.95, h * 0.05, 0.025);
    pass(pal.light, 0.62, 0.44, 0.96, h * 0.03, 0.02);
    pass(pal.hi, 0.36, 0.62, 0.8, h * 0.02, 0.01);
    x.filter = "none";
    lobes.forEach(function (p) {
      for (var k = 0; k < 5; k++) {
        var a = Math.atan2(ly, lx) + R(-0.9, 0.9);
        G.blob(x, p[0] + Math.cos(a) * p[2] * R(0.7, 0.97), p[1] + Math.sin(a) * p[2] * R(0.7, 0.97), p[2] * R(0.1, 0.24), p[2] * R(0.035, 0.08), a + 1.57, G.jit(pal.hi, 0.01, 0.03, 0.01), R(0.5, 0.95), 0.3);
      }
    });
    /* hazy underside */
    var g = x.createLinearGradient(0, by - h * 0.22, 0, by);
    g.addColorStop(0, G.css(pal.base || pal.shadow, 0)); g.addColorStop(1, G.css(pal.base || pal.shadow, 0.9));
    x.fillStyle = g; x.fillRect(0, by - h * 0.22, cw, h * 0.22);
    ctx.drawImage(c, cx - ox, base - by);
    for (i = 0; i < w / 40; i++) G.dab(ctx, cx + R(-0.5, 0.5) * w, base + R(0, 0.03) * h, R(60, 200), R(5, 14), R(-0.03, 0.03), G.jit(pal.base || pal.shadow, 0.01, 0.04, 0.02), R(0.25, 0.6), 1);
  };

  /* long streaky cloud band (cirrus / sunset bars) */
  G.streak = function (ctx, cx, cy, w, h, cols, n) {
    for (var i = 0; i < (n || 60); i++) {
      var t = G.gauss();
      G.dab(ctx, cx + t * w * 0.5, cy + G.gauss() * h * 0.5, R(0.12, 0.5) * w, R(0.12, 0.42) * h, R(-0.06, 0.03), G.jit(G.pick(cols), 0.012, 0.06, 0.03), R(0.45, 0.95), 2);
    }
  };

  /* mountain / hill silhouette with slope strokes and mist at the foot */
  G.ridge = function (ctx, W, H, o) {
    var pts = [], x, step = 8, s = o.seed || 1;
    for (x = -step; x <= W + step; x += step) {
      var n = G.fbm(x * o.freq, 0.5, s, o.oct || 4);
      if (o.shape) n = n * o.shape(x / W);
      pts.push([x, o.base - n * o.amp]);
    }
    var path = function () {
      ctx.beginPath(); ctx.moveTo(-step, H + 4);
      pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      ctx.lineTo(W + step, H + 4); ctx.closePath();
    };
    G.clip(ctx, path, function () {
      var top = o.base - o.amp, bot = o.foot || o.base + o.amp * 0.6;
      var g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, G.css(o.top)); g.addColorStop(1, G.css(o.bottom));
      ctx.fillStyle = g; ctx.fillRect(0, top - 10, W, H);
      var m = o.strokes == null ? 700 : o.strokes;
      for (var i = 0; i < m; i++) {
        var pi = (G.r() * (pts.length - 3)) | 0, p = pts[pi], d = G.r() * (bot - p[1]), t = d / (bot - top + 1);
        var sl = Math.atan2(pts[pi + 3][1] - p[1], pts[pi + 3][0] - p[0]);
        var c = G.jit(G.mix(o.top, o.bottom, Math.min(1, t * 1.2)), 0.015, 0.06, o.dl == null ? 0.035 : o.dl);
        G.dab(ctx, p[0] + R(-30, 30), p[1] + d, R(40, 150) * (o.sk || 1), R(8, 26) * (o.sk || 1), sl * 0.6 + (sl >= 0 ? 0.55 : -0.55) + R(-0.2, 0.2), c, R(0.16, 0.5), 1);
      }
      if (o.lit) {
        for (i = 0; i < m * 0.35; i++) {
          p = pts[(G.r() * pts.length) | 0];
          G.dab(ctx, p[0] + R(-10, 22), p[1] + R(2, o.amp * 0.3), R(14, 60), R(4, 12), R(0.4, 1.0) * (o.litDir || 1), G.jit(o.lit, 0.01, 0.05, 0.03), R(0.3, 0.75), 1);
        }
      }
    });
    return pts;
  };

  /* fog / mist band */
  G.mist = function (ctx, W, y, h, col, a, n) {
    ctx.save(); ctx.filter = "blur(" + Math.round(h * 0.22) + "px)";
    for (var i = 0; i < (n || 26); i++) G.blob(ctx, R(-0.1, 1.1) * W, y + G.gauss() * h * 0.35, R(160, 520), h * R(0.18, 0.5), R(-0.05, 0.05), G.jit(col, 0.005, 0.02, 0.015), a * R(0.4, 1), 0.2);
    ctx.restore();
  };

  /* leaf mass: dark understory, mid, sun-struck clusters, sparks of highlight */
  G.foliage = function (ctx, cx, cy, rx, ry, pal, o) {
    o = o || {};
    var lx = o.lx == null ? -0.5 : o.lx, ly = o.ly == null ? -0.8 : o.ly, k = o.leaf || Math.max(7, Math.min(rx, ry) * 0.14);
    var den = (o.den || 1) * (rx * ry) / (k * k * 2.2), i, a, d, x, y;
    var tones = [[pal[0], 1.0, 0, 1], [pal[1], 0.86, 0.14, 0.8], [pal[2], 0.7, 0.34, 0.55], [pal[3], 0.52, 0.52, 0.2]];
    tones.forEach(function (tn, ti) {
      var clusters = [];
      if (ti >= 2) for (i = 0; i < 4 + rx * ry / (k * k * 28); i++) { a = R(0, 6.283); d = Math.sqrt(G.r()) * 0.8; clusters.push([Math.cos(a) * d, Math.sin(a) * d, R(0.16, 0.36)]); }
      for (i = 0; i < den * tn[3]; i++) {
        if (clusters.length) { var c = G.pick(clusters); a = R(0, 6.283); d = Math.sqrt(G.r()) * c[2]; x = c[0] + Math.cos(a) * d; y = c[1] + Math.sin(a) * d; }
        else { a = R(0, 6.283); d = Math.sqrt(G.r()); x = Math.cos(a) * d; y = Math.sin(a) * d; }
        x = x * tn[1] + lx * tn[2]; y = y * tn[1] + ly * tn[2];
        if (x * x + y * y > 1.12) continue;
        G.blob(ctx, cx + x * rx, cy + y * ry, k * R(0.6, 1.5), k * R(0.4, 0.9), R(-0.9, 0.9), G.jit(tn[0], 0.018, 0.07, 0.035), ti === 0 ? 1 : R(0.82, 1), 0.3);
      }
    });
  };

  /* conifer: tiers of drooping strokes */
  G.conifer = function (ctx, x, base, h, w, pal, lit) {
    var tiers = Math.max(6, (h / 16) | 0);
    G.line(ctx, x, base, x + R(-2, 2), base - h, Math.max(1.5, w * 0.07), pal[0], 1, 1);
    for (var i = 0; i < tiers; i++) {
      var t = i / tiers, y = base - h * (1 - t) + h * 0.04, ww = w * (0.12 + t * 0.9) * R(0.8, 1.15);
      for (var s = -1; s <= 1; s += 2) {
        var n = 2 + ((t * 3) | 0);
        for (var j = 0; j < n; j++) {
          var f = (j + 1) / n, c = s * lit < 0 && G.r() < 0.6 ? pal[2] : G.r() < 0.5 ? pal[0] : pal[1];
          G.dab(ctx, x + s * ww * f * 0.5, y + f * h * 0.035 + R(-2, 2), ww * 0.55, Math.max(3, h * 0.035), s * R(0.2, 0.5), G.jit(c, 0.015, 0.06, 0.03), 1, 0);
        }
      }
    }
  };

  /* shafts of light through haze */
  G.shaft = function (ctx, x, y, len, w0, w1, ang, col, a, blur) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.filter = "blur(" + (blur == null ? 14 : blur) + "px)";
    ctx.translate(x, y); ctx.rotate(ang);
    var g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, G.css(col, a)); g.addColorStop(0.6, G.css(col, a * 0.55)); g.addColorStop(1, G.css(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-w0 / 2, 0); ctx.lineTo(w0 / 2, 0); ctx.lineTo(w1 / 2, len); ctx.lineTo(-w1 / 2, len); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  /* water: horizontal strokes, colour by depth, broken glints */
  G.water = function (ctx, x, y, w, h, stops, o) {
    o = o || {};
    G.wash(ctx, x, y, w, h, stops, { n: 0 });
    var n = o.n || 900;
    for (var i = 0; i < n; i++) {
      var t = Math.pow(G.r(), 0.8), sc = 0.35 + t * 1.3;
      G.dab(ctx, x + G.r() * w, y + t * h, R(40, 190) * sc, R(3, 11) * sc, R(-0.025, 0.025), G.jit(G.ramp(stops, t), 0.012, 0.07, 0.04), R(0.25, 0.7), 1);
    }
    if (o.glint) for (i = 0; i < (o.glints || 160); i++) {
      t = Math.pow(G.r(), 1.4);
      G.dab(ctx, x + (o.gx == null ? G.r() : o.gx + G.gauss() * (o.gw || 0.12)) * w, y + t * h, R(8, 46) * (0.4 + t), R(1.5, 4) * (0.5 + t), 0, o.glint, R(0.35, 0.95), 0);
    }
  };

  G.stars = function (ctx, W, H, n, cols) {
    for (var i = 0; i < n; i++) {
      var x = G.r() * W, y = Math.pow(G.r(), 1.5) * H, r = Math.pow(G.r(), 5) * 3.4 + 0.7, c = G.pick(cols);
      G.blob(ctx, x, y, r, r, 0, c, R(0.5, 1), 0.3);
      if (r > 3.2) G.glow(ctx, x, y, r * 5, c, 0.4);
    }
  };

  /* ---------- finish ---------- */
  /* halation: the soft bloom of light a cel camera gave to bright areas */
  G.bloom = function (ctx, W, H, a, blur) {
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.filter = "blur(" + (blur || 26) + "px) brightness(1.06) saturate(1.2)";
    x.drawImage(ctx.canvas, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = a == null ? 0.22 : a; ctx.drawImage(c, 0, 0); ctx.restore();
  };
  G.vignette = function (ctx, W, H, col, a) {
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, G.css(col, 0)); g.addColorStop(1, G.css(col, a));
    ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  };
  /* paper tooth + pigment granulation */
  G.grain = function (ctx, W, H, amt, blot) {
    var im = ctx.getImageData(0, 0, W, H), d = im.data, s = G.r() * 50, i = 0;
    amt = amt == null ? 9 : amt; blot = blot == null ? 7 : blot;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++, i += 4) {
        var n = (G.r() + G.r() - 1) * amt + (G.fbm(x * 0.011, y * 0.011, s, 3) - 0.5) * blot * 2 + (vn(x * 0.33, y * 0.33, s + 7) - 0.5) * amt * 0.9 + (vn(x * 0.012, y * 0.3, s + 3) - 0.5) * amt * 0.4;
        d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.92;
      }
    }
    ctx.putImageData(im, 0, 0);
  };
  G.finish = function (ctx, W, H, o) {
    o = o || {};
    G.bloom(ctx, W, H, o.bloom == null ? 0.2 : o.bloom, o.bloomBlur);
    if (o.vig !== 0) G.vignette(ctx, W, H, o.vigCol || "#1a2440", o.vig == null ? 0.28 : o.vig);
    G.grain(ctx, W, H, o.grain, o.blot);
  };
})();
