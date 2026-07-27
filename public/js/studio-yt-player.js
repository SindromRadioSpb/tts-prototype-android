// public/js/studio-yt-player.js
// W2-S5a · Адаптер YouTube-плеера для Студии. index.html отдаётся с COEP: require-corp
// (cross-origin isolation нужна wa-sqlite/OPFS), поэтому ОБЫЧНЫЙ iframe YouTube не стартует —
// проверено разведкой 2026-07-27. Работает <iframe credentialless> (Chromium): плеер готов,
// часы идут, crossOriginIsolated остаётся true. Safari/Firefox — честная деградация.
// Канон: docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md §5.2.
(function () {
  "use strict";

  var ID_RE = /^[A-Za-z0-9_-]{11}$/;

  function parseVideoId(input) {
    if (typeof input !== "string" || !input.trim()) return null;
    var u;
    try { u = new URL(input.trim()); } catch (_) { return null; }
    var host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      var short = u.pathname.split("/")[1] || "";
      return ID_RE.test(short) ? short : null;
    }
    if (host !== "youtube.com" && host !== "music.youtube.com") return null;
    var v = u.searchParams.get("v");
    if (v && ID_RE.test(v)) return v;
    var parts = u.pathname.split("/").filter(Boolean);
    if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && ID_RE.test(parts[1] || "")) {
      return parts[1];
    }
    return null;
  }

  function capability() {
    if (typeof window === "undefined" || typeof HTMLIFrameElement === "undefined" ||
        !("credentialless" in HTMLIFrameElement.prototype)) {
      return { supported: false, reason: "no-credentialless" };
    }
    return { supported: true, reason: "ok" };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { parseVideoId: parseVideoId, capability: capability };
    }
    return;
  }

  var apiPromise = null;
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      // A rejection here (timeout or script error) MUST clear apiPromise — otherwise a single
      // transient failure permanently disables YouTube playback for the rest of the page
      // session, since every later create() would re-reject from this same stale promise.
      var to = setTimeout(function () { apiPromise = null; reject(new Error("YT_API_TIMEOUT")); }, 15000);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        clearTimeout(to);
        if (typeof prev === "function") { try { prev(); } catch (_) {} }
        resolve();
      };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = function () { clearTimeout(to); apiPromise = null; reject(new Error("YT_API_FAILED")); };
      document.head.appendChild(s);
    });
    return apiPromise;
  }

  // Адаптер выставляет ровно тот минимум, который потребляет studio-media-karaoke.js.
  function makeAdapter(player, iframe) {
    var listeners = { play: [], pause: [], ended: [], error: [] };
    function emit(ev) { (listeners[ev] || []).forEach(function (fn) { try { fn(); } catch (_) {} }); }
    // W2-S5a Task 10 live-smoke finding (2026-07-27, reproduced 9/9): playVideo()/pauseVideo() are
    // fire-and-forget postMessage calls — getPlayerState() does NOT reflect the new state until the
    // async onStateChange postMessage round-trips back (~100ms, measured). A native <audio>
    // element's `paused` flips synchronously the instant play()/pause() is called; callers that
    // check `paused`/isActive() right after (tap-to-seek gating at index.html:38006, the live
    // smoke's isActiveAfterStart/pausedAfterStop) were reading the OPPOSITE of what they just
    // asked for. `intent` holds the caller's synchronous request until a genuine state signal from
    // YouTube supersedes it, so an externally-driven change (video ends, user drives YouTube's own
    // controls, playback fails) always wins over a stale intent. No polling/timer: intent is
    // retired by the next real event, never by a clock.
    var intent = null; // null = no pending intent, trust getPlayerState(); true/false = pending play/pause
    function clearIntent() { intent = null; }
    var adapter = {
      isYouTube: true,
      get currentTime() { try { return player.getCurrentTime() || 0; } catch (_) { return 0; } },
      set currentTime(t) { try { player.seekTo(Number(t) || 0, true); } catch (_) {} },
      get paused() {
        if (intent !== null) return !intent;
        try {
          var st = player.getPlayerState();
          // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
          // A native <audio> element stays paused===false through a mid-playback stall, and
          // studio-media-karaoke.js isActive() reads exactly this getter — so BUFFERING must
          // report "not paused", not "stopped".
          return st !== 1 && st !== 3;
        } catch (_) { return true; }
      },
      play: function () { intent = true; try { player.playVideo(); } catch (_) {} return Promise.resolve(); },
      pause: function () { intent = false; try { player.pauseVideo(); } catch (_) {} },
      addEventListener: function (ev, fn) { if (listeners[ev]) listeners[ev].push(fn); },
      removeEventListener: function (ev, fn) {
        if (!listeners[ev]) return;
        var i = listeners[ev].indexOf(fn);
        if (i >= 0) listeners[ev].splice(i, 1);
      },
      tracklist: function () {
        try {
          var list = player.getOption("captions", "tracklist");
          return Array.isArray(list) ? list.map(function (t) {
            return { languageCode: t.languageCode, languageName: t.languageName,
                     kind: t.kind === "asr" ? "asr" : "manual", isDefault: !!t.is_default };
          }) : [];
        } catch (_) { return []; }
      },
      destroy: function () {
        try { player.destroy(); } catch (_) {}
        if (iframe && iframe.parentNode) { try { iframe.parentNode.removeChild(iframe); } catch (_) {} }
        Object.keys(listeners).forEach(function (k) { listeners[k] = []; });
      },
      _emit: emit,
      // Internal — called only from create()'s onStateChange/onError below, on EVERY real signal
      // from YouTube (any state value, or an error), not part of the surface studio-media-karaoke.js
      // consumes. Retiring `intent` here (rather than on a timer) is what keeps trap 1 (embedding
      // denied / autoplay blocked → adapter must not claim "playing" forever) satisfied: the next
      // genuine state YouTube reports — even a failed/blocked one — always overrides a stale intent.
      _clearIntent: clearIntent,
    };
    return adapter;
  }

  // Shared cleanup for a player that never reached onReady (ready-timeout OR onError before
  // ready) — the caller gets a rejection and no adapter, so nothing else will ever call
  // adapter.destroy() for this attempt. Must destroy the YT.Player AND detach the iframe, or
  // both leak: an embed-disabled/region-blocked/deleted video (onError, the common case) used
  // to leave the <iframe credentialless> attached forever; a hung ready callback (timeout) used
  // to detach the iframe but never destroy() the already-constructed YT.Player.
  function destroyFailedPlayer(player, iframe) {
    try { player.destroy(); } catch (_) {}
    try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (_) {}
  }

  function create(mountEl, videoId) {
    var cap = capability();
    if (!cap.supported) return Promise.reject(Object.assign(new Error(cap.reason), { code: "YT_UNSUPPORTED" }));
    if (!ID_RE.test(String(videoId || ""))) return Promise.reject(Object.assign(new Error("bad id"), { code: "YT_BAD_ID" }));
    return loadApi().then(function () {
      return new Promise(function (resolve, reject) {
        var iframe = document.createElement("iframe");
        iframe.setAttribute("credentialless", "");
        iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
        iframe.setAttribute("title", "YouTube");
        iframe.width = "100%"; iframe.height = "200"; iframe.style.border = "0";
        iframe.src = "https://www.youtube.com/embed/" + videoId +
                     "?enablejsapi=1&playsinline=1&rel=0&origin=" + encodeURIComponent(location.origin);
        mountEl.appendChild(iframe);
        var settled = false;
        var to = setTimeout(function () {
          if (settled) return;
          settled = true;
          destroyFailedPlayer(player, iframe);
          reject(Object.assign(new Error("ready timeout"), { code: "YT_NOT_READY" }));
        }, 20000);
        var adapter = null;
        var player = new window.YT.Player(iframe, {
          events: {
            onReady: function () {
              if (settled) return;
              settled = true; clearTimeout(to);
              resolve(adapter);
            },
            onStateChange: function (e) {
              if (!adapter) return;
              adapter._clearIntent(); // any real state YouTube reports supersedes a pending play()/pause() intent
              if (e.data === 1) adapter._emit("play");
              else if (e.data === 2) adapter._emit("pause");
              else if (e.data === 0) adapter._emit("ended");
            },
            onError: function (e) {
              if (adapter) { adapter._clearIntent(); adapter._emit("error"); } // a failure is a real signal too
              if (settled) return;
              settled = true; clearTimeout(to);
              destroyFailedPlayer(player, iframe);
              reject(Object.assign(new Error("yt error " + e.data), { code: "YT_EMBED_DENIED" }));
            },
          },
        });
        adapter = makeAdapter(player, iframe);
      });
    });
  }

  function destroy(adapter) { if (adapter && typeof adapter.destroy === "function") adapter.destroy(); }

  window.StudioYtPlayer = { parseVideoId: parseVideoId, capability: capability, create: create, destroy: destroy };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = window.StudioYtPlayer;
  }
})();
