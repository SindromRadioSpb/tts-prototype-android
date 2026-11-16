// «Гуашь»: the painting breathes once when a section opens — a few seconds of drifting light over
// the masthead, then it is a still picture again. One short moment, not a loop: nothing keeps
// moving while a person reads (WCAG 2.2.2), nothing runs under reduced motion, nothing is drawn
// in an open text. Loaded lazily by app-nav.js; the look itself is pure CSS (css/lp-gouache.css).
(function () {
  "use strict";
  var root = document.documentElement;
  if (root.getAttribute("data-look") !== "gouache" || root.hasAttribute("data-world")) return;
  if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.requestAnimationFrame || !document.body) return;
  if (document.body.classList.contains("room-reading") || document.body.classList.contains("room-study")) return;

  var section = root.getAttribute("data-lp-section") || "studio";
  var dark = /\b(theme-dark|nw-dark|ml-dark)\b/.test(document.body.className) ||
    (section !== "news" && section !== "mediatheque" && !document.body.classList.contains("theme-light") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  // where the light lives in each picture (fractions of the masthead), and what it is made of
  var KINDS = {
    studio: { day: ["#fff6c4", "#ffe58a"], night: ["#e9f59a", "#fbffd0"], x: [0.25, 1], y: [0.45, 0.98], n: 20, r: [1.2, 3.2], vx: 6, vy: -9 },
    room: { day: ["#fbffd6", "#e6ffd0"], night: ["#dfe8ff", "#e6f59a"], x: [0.42, 0.86], y: [0.05, 0.9], n: 24, r: [1, 2.8], vx: -3, vy: 7 },
    mediatheque: { day: ["#ffffff", "#ffd0e4", "#fff2a8"], night: ["#ff9fd0", "#9feaff", "#ffe29a"], x: [0.3, 1], y: [0.3, 0.95], n: 18, r: [2, 6], vx: 0, vy: -2 },
    news: { day: ["#fff3b8", "#ffd97a"], night: ["#ffd98a", "#ffc0a0"], x: [0.3, 1], y: [0.2, 0.9], n: 18, r: [1, 2.6], vx: 10, vy: -3 },
    dictionary: { day: ["#ffffff", "#f2fffb"], night: ["#ffd0b8", "#ffffff"], x: [0.2, 0.85], y: [0.6, 0.95], n: 22, r: [1, 2.4], vx: 4, vy: 0, flat: true }
  };
  var K = KINDS[section];
  if (!K) return;

  var host = section === "room" ? document.querySelector(".room-header") : document.body;
  if (!host) return;
  var canvas = document.createElement("canvas");
  canvas.className = "lp-gouache-air";
  canvas.setAttribute("aria-hidden", "true");
  var mastHeight = function () {
    if (section === "room") return host.offsetHeight + 56;
    return parseFloat(getComputedStyle(root).getPropertyValue("--lp-mast")) || 0;
  };
  var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  var place = function () {
    W = root.clientWidth; H = mastHeight();
    if (!W || H < 40) return false;
    var s = canvas.style;
    s.position = "absolute"; s.zIndex = "-1"; s.pointerEvents = "none"; s.width = W + "px"; s.height = H + "px";
    if (section === "room") { s.left = "0"; s.top = "auto"; s.bottom = "0"; }
    else { var b = document.body.getBoundingClientRect(); s.left = (-b.left - window.scrollX) + "px"; s.top = (-b.top - window.scrollY) + "px"; }
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    return true;
  };
  if (getComputedStyle(document.body).position === "static" && section !== "room") document.body.style.position = "relative";
  host.appendChild(canvas);
  if (!place()) { canvas.remove(); return; }

  var ctx = canvas.getContext("2d");
  var rtl = root.getAttribute("dir") === "rtl";
  var colors = dark ? K.night : K.day;
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var motes = [];
  for (var i = 0; i < K.n; i++) {
    var fx = rnd(K.x[0], K.x[1]);
    motes.push({
      x: (rtl ? 1 - fx : fx) * W, y: rnd(K.y[0], K.y[1]) * H, r: rnd(K.r[0], K.r[1]),
      c: colors[i % colors.length], ph: rnd(0, 6.283), sp: rnd(0.6, 1.5), k: rnd(0.5, 1)
    });
  }

  var LIFE = 4800, t0 = 0, last = 0, raf = 0;
  function frame(now) {
    if (!t0) { t0 = now; last = now; }
    var t = now - t0, dt = Math.min(50, now - last) / 1000; last = now;
    // one breath: in over 0.9s, out over the last 1.6s
    var env = Math.min(1, t / 900) * Math.min(1, Math.max(0, (LIFE - t) / 1600));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (var j = 0; j < motes.length; j++) {
      var m = motes[j];
      m.x += (rtl ? -K.vx : K.vx) * m.k * dt + Math.sin(t / 900 + m.ph) * 4 * dt;
      m.y += K.vy * m.k * dt + Math.cos(t / 1100 + m.ph) * 3 * dt;
      var a = env * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 420 * m.sp + m.ph)));
      var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
      g.addColorStop(0, m.c); g.addColorStop(0.3, m.c); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = a * (K.flat ? 0.9 : 0.75);
      ctx.fillStyle = g;
      if (K.flat) { ctx.save(); ctx.translate(m.x, m.y); ctx.scale(3, 0.5); ctx.beginPath(); ctx.arc(0, 0, m.r * 4, 0, 6.2832); ctx.restore(); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 4, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (t < LIFE && !document.hidden) raf = requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); canvas.remove(); }
  }
  raf = requestAnimationFrame(frame);
})();
