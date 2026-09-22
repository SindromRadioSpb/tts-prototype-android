(function (root) {
  "use strict";

  var ENDPOINT = "/api/product-pulse/v1/events";
  var SESSION_KEY = "lp_product_pulse_session_v2";
  var APP_VERSION = "unknown";
  var opened = false;
  var started = false;
  var engaged = false;
  var foregroundMs = 0;
  var activeSince = 0;
  var materialContext = null;
  var materialStarted = false;
  var materialEngaged = false;
  var materialForegroundMs = 0;
  var materialActiveSince = 0;
  var lastAction = 0;
  var ready = false;
  var disabled = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || navigator.webdriver;
  var mediaStates = new WeakMap();

  function randomId() {
    try { return crypto.randomUUID(); } catch (_) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) { var n = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === "x" ? n : (n & 3) | 8).toString(16); });
  }
  function sessionId() {
    try {
      // Fresh per document: copied/duplicated tabs cannot share this identifier.
      // Navigation deliberately begins a new measurement session.
      var created = randomId();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: created, at: Date.now() }));
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
  function materialEntryPoint() {
    if (surface() === "studio") return "studio_library";
    if (surface() !== "reading_room") return null;
    try { return new URLSearchParams(location.search || "").get("from") === "mediatheque" ? "mediatheque" : "reading_room"; }
    catch (_) { return "reading_room"; }
  }
  function sourceMeta(text) {
    if (!text || typeof text !== "object") return {};
    var raw = text.source_meta_json || text.sourceMetaJson || text.source_meta || {};
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { return {}; } }
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }
  function materialCollection(text) {
    var meta = sourceMeta(text), slug = meta.public_corpus && String(meta.public_corpus.slug || ""), group = meta.group_corpus && String(meta.group_corpus.corpus_id || "");
    if (slug === "materials-science-year1-problem-book-2") return "materials_science_pb2";
    if (slug === "study-songs") return "public_study_songs";
    if (slug === "physics-year1-problems") return "physics_year1";
    if (slug) return "other_public_corpus";
    if (group === "study-songs-pilot" || (meta.group_corpus && String(meta.group_corpus.slug || "") === "study-songs")) return "group_study_songs";
    if (group) return "other_group_corpus";
    if (meta.corpus && typeof meta.corpus === "object") return "ben_yehuda";
    return "my_texts";
  }
  function materialMedia(facts) {
    var audio = !!(facts && facts.hasAudio), video = !!(facts && facts.hasVideo);
    return audio && video ? "audio_video" : video ? "video" : audio ? "audio" : facts && facts.known === false ? "unknown" : "none";
  }
  function eventProperties(name, properties) {
    var contextual = ["material_open", "material_started", "material_engaged", "study_completed", "audio_engaged"].indexOf(name) >= 0;
    return Object.assign({}, contextual && materialContext ? materialContext : {}, properties || {});
  }
  function payload(name, properties) {
    return {
      schema_version: 2,
      event_id: randomId(),
      event_name: name,
      occurred_at: new Date().toISOString(),
      session_id: sid,
      app_version: APP_VERSION,
      properties: Object.assign({ surface: surface() }, eventProperties(name, properties)),
    };
  }
  function emit(name, properties) {
    if (disabled || !ready || navigator.onLine === false) return Promise.resolve(false);
    var body;
    try { body = JSON.stringify(payload(name, properties)); } catch (_) { return Promise.resolve(false); }
    try {
      return fetch(ENDPOINT, {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: body,
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }
  function foreground() { return document.visibilityState === "visible" && document.hasFocus(); }
  function confirmMaterialOpen(descriptor) {
    var actualSurface = surface(), entry = materialEntryPoint();
    if (!["studio", "reading_room"].includes(actualSurface) || !entry) return Promise.resolve(false);
    materialContext = {
      surface: actualSurface,
      entry_point: entry,
      material_collection: materialCollection(descriptor && descriptor.text),
      material_media: materialMedia(descriptor && descriptor.media),
    };
    materialStarted = false; materialEngaged = false; materialForegroundMs = 0; materialActiveSince = 0;
    return emit("material_open", { media_kind: "text" });
  }
  function markInteraction(event) {
    if (!ready || disabled || !foreground() || !event || !event.isTrusted) return;
    var target = event.target;
    if (!target || !target.closest || !target.closest("#roomReaderTable, #inputText, #proTable, #roomTrainOverlay, audio, video, [data-product-study]")) return;
    tick();
    lastAction = Date.now(); activeSince = lastAction;
    if (!started) {
      started = true;
      emit("study_started");
    }
    if (materialContext && !materialStarted) {
      materialStarted = true; materialActiveSince = lastAction;
      emit("material_started");
    }
    checkEngagement();
  }
  function tick() {
    var now = Date.now();
    if (started && activeSince && foreground()) foregroundMs += Math.max(0, Math.min(now, lastAction + 15000) - activeSince);
    if (materialStarted && materialActiveSince && foreground()) materialForegroundMs += Math.max(0, Math.min(now, lastAction + 15000) - materialActiveSince);
    activeSince = foreground() && started ? now : 0;
    materialActiveSince = foreground() && materialStarted ? now : 0;
  }
  function checkEngagement() {
    tick();
    if (started && !engaged && foregroundMs >= 30000) {
      engaged = true;
      emit("study_engaged", { duration_bucket: durationBucket(foregroundMs) });
    }
    checkMaterialEngagement();
  }
  function checkMaterialEngagement() {
    if (!materialStarted || materialEngaged || materialForegroundMs < 30000) return;
    materialEngaged = true;
    emit("material_engaged", { duration_bucket: durationBucket(materialForegroundMs) });
  }
  function onVisibility() {
    // Discard the fractional interval on blur/hide; never credit hidden time.
    activeSince = foreground() && started ? Date.now() : 0;
    materialActiveSince = foreground() && materialStarted ? Date.now() : 0;
  }
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  root.addEventListener("blur", onVisibility, { passive: true });
  root.addEventListener("focus", onVisibility, { passive: true });
  ["pointerdown", "keydown"].forEach(function (type) {
    document.addEventListener(type, markInteraction, { passive: true });
  });
  document.addEventListener("timeupdate", function (event) {
    var media = event.target;
    if (!media || !/^(AUDIO|VIDEO)$/.test(media.tagName || "")) return;
    var now = Date.now(), time = Number(media.currentTime || 0), source = media.currentSrc || media.src;
    var state = mediaStates.get(media);
    if (!state || state.source !== source) state = { source: source, time: time, at: now, played: 0, sent: false, eligible: false };
    var delta = time - state.time, elapsed = (now - state.at) / 1000;
    var eligible = foreground() && !media.paused && !media.seeking && media.readyState >= 2;
    if (eligible && state.eligible && elapsed > 0 && elapsed <= 2 && delta > 0 && delta <= elapsed * Math.max(1, media.playbackRate || 1) + 0.25) {
      state.played += Math.min(elapsed, delta / Math.max(0.1, media.playbackRate || 1));
      if (state.played >= 8 && !state.sent && ready) {
        state.sent = true;
        emit("audio_engaged", { media_kind: media.tagName.toLowerCase() });
      }
    }
    state.time = time; state.at = now; state.eligible = eligible; mediaStates.set(media, state);
  }, true);
  ["seeking", "pause", "waiting"].forEach(function(type) { document.addEventListener(type, function(e) { var s = mediaStates.get(e.target); if(s) s.eligible = false; }, true); });
  setInterval(checkEngagement, 1000);

  function boot() {
    if (opened) return;
    opened = true;
    fetch("/api/client-config", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { APP_VERSION = cfg && cfg.version ? String(cfg.version) : "unknown"; return fetch("/api/product-pulse/v1/config", { credentials: "same-origin", cache: "no-store" }); })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(cfg) { disabled = disabled || !cfg || !cfg.collect; ready = true; })
      .catch(function () {})
      .then(function () { return emit("app_open"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  root.ProductTelemetry = Object.freeze({ emit: emit, surface: surface, confirmMaterialOpen: confirmMaterialOpen });
})(window);
