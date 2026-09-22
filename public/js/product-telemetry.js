(function (root) {
  "use strict";

  var ENDPOINT = "/api/product-pulse/v1/events";
  var SESSION_KEY = "lp_product_pulse_session_v1";
  var APP_VERSION = "unknown";
  var opened = false;
  var started = false;
  var engaged = false;
  var foregroundMs = 0;
  var activeSince = document.visibilityState === "visible" ? Date.now() : 0;

  function randomId() {
    try { return crypto.randomUUID(); } catch (_) {}
    return "pp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }
  function sessionId() {
    try {
      var existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var created = randomId();
      sessionStorage.setItem(SESSION_KEY, created);
      return created;
    } catch (_) { return randomId(); }
  }
  var sid = sessionId();

  function surface() {
    var path = location.pathname.toLowerCase();
    if (path.indexOf("library") >= 0) return "reading_room";
    if (path.indexOf("mediatheque") >= 0) return "mediatheque";
    if (path.indexOf("study-video") >= 0) return "study_video";
    if (path === "/" || path.indexOf("studio") >= 0 || path.indexOf("index.html") >= 0) return "studio";
    return "unknown";
  }
  function durationBucket(ms) {
    if (ms < 30000) return "lt_30_sec";
    if (ms < 120000) return "30_sec_2_min";
    if (ms < 300000) return "2_5_min";
    if (ms < 900000) return "5_15_min";
    if (ms < 1800000) return "15_30_min";
    return "30_min_plus";
  }
  function payload(name, properties) {
    return {
      schema_version: 1,
      event_id: randomId(),
      event_name: name,
      occurred_at: new Date().toISOString(),
      session_id: sid,
      app_version: APP_VERSION,
      properties: Object.assign({ surface: surface() }, properties || {}),
    };
  }
  function emit(name, properties) {
    var body;
    try { body = JSON.stringify(payload(name, properties)); } catch (_) { return Promise.resolve(false); }
    try {
      return fetch(ENDPOINT, {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: body,
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }
  function markInteraction() {
    if (!started) {
      started = true;
      emit("study_started");
    }
    if (engaged) return;
    var total = foregroundMs + (activeSince ? Date.now() - activeSince : 0);
    if (total < 30000) return;
    engaged = true;
    emit("study_engaged", { duration_bucket: durationBucket(total) });
  }
  function onVisibility() {
    if (document.visibilityState === "visible") activeSince = Date.now();
    else if (activeSince) { foregroundMs += Date.now() - activeSince; activeSince = 0; }
  }
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  ["pointerdown", "keydown"].forEach(function (type) {
    document.addEventListener(type, markInteraction, { passive: true });
  });
  document.addEventListener("play", function (event) {
    var media = event.target;
    if (!media || !/^(AUDIO|VIDEO)$/.test(media.tagName || "") || media.dataset.productPulseAudio === "1") return;
    media.dataset.productPulseAudio = "pending";
    setTimeout(function () {
      if (!media.paused && Number(media.currentTime || 0) >= 8) {
        media.dataset.productPulseAudio = "1";
        emit("audio_engaged", { media_kind: media.tagName.toLowerCase() });
      } else if (media.dataset.productPulseAudio === "pending") {
        delete media.dataset.productPulseAudio;
      }
    }, 10000);
  }, true);
  setInterval(markInteraction, 15000);

  function boot() {
    if (opened) return;
    opened = true;
    fetch("/api/client-config", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { APP_VERSION = cfg && cfg.version ? String(cfg.version) : "unknown"; })
      .catch(function () {})
      .then(function () { return emit("app_open"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  root.ProductTelemetry = Object.freeze({ emit: emit, surface: surface });
})(window);
