/* voice-draft.js — Wave 2 C3a: browser-owned speech -> editable role-play draft.
 *
 * This module deliberately has no role-play callback, fetch of learner content,
 * persistence, analytics, grading, or review write. Its entire authority is to
 * append a final browser recognition result to an existing text input. Sending
 * remains owned by the existing Room/Studio controls.
 */
(function (root, factory) {
  var api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LinguistProVoiceDraft = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  var DEFAULT_TIMEOUT_MS = 15000;

  function boolFlag(value) {
    return value !== false;
  }

  function appendDraft(prior, spoken, maxLength) {
    var left = String(prior || "").trimEnd();
    var right = String(spoken || "").replace(/\s+/g, " ").trim();
    var joined = left && right ? left + " " + right : (left || right);
    var cap = Number(maxLength);
    return Number.isFinite(cap) && cap > 0 ? joined.slice(0, cap) : joined;
  }

  function browserCtor(env) {
    var w = env || root;
    return w && (w.SpeechRecognition || w.webkitSpeechRecognition) || null;
  }

  async function loadRuntimeFlag(fetchImpl) {
    var fn = fetchImpl || (root && root.fetch);
    if (typeof fn !== "function") return false;
    try {
      var response = await fn("/api/client-config", { cache: "no-store", credentials: "same-origin" });
      if (!response || response.ok === false || typeof response.json !== "function") return false;
      var body = await response.json();
      return !!(body && body.flags && body.flags.c3aVoiceEnabled === true);
    } catch (_) {
      return false;
    }
  }

  function create(options) {
    var o = options || {};
    var input = o.input;
    var button = o.button;
    var status = o.status;
    if (!input || !button || !status) throw new Error("voice-draft: input, button and status are required");

    var messages = o.messages || {};
    var Ctor = o.Recognition || browserCtor(o.env);
    var timeoutMs = Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : DEFAULT_TIMEOUT_MS;
    var timer = null;
    var recognition = null;
    var state = "idle";
    var resultSeen = false;
    var endReason = "";
    var destroyed = false;

    function text(key, fallback) { return messages[key] || fallback; }
    function setStatus(value) {
      status.textContent = value || "";
      if (status.setAttribute) status.setAttribute("data-voice-state", state);
    }
    function paint() {
      var listening = state === "listening";
      button.textContent = listening ? "■" : "🎙";
      button.setAttribute("aria-pressed", listening ? "true" : "false");
      button.setAttribute("aria-label", listening
        ? text("stopLabel", "Stop listening")
        : text("micLabel", "Speak a Hebrew reply"));
      button.title = listening
        ? text("stopLabel", "Stop listening")
        : text("privacy", "Your browser handles speech recognition; this app does not receive or store audio.");
    }
    function clearTimer() {
      if (timer != null) { (o.clearTimeout || clearTimeout)(timer); timer = null; }
    }
    function finish(nextState, message) {
      clearTimer();
      state = nextState;
      recognition = null;
      paint();
      setStatus(message);
    }
    function abortActive(reason, silent) {
      if (state !== "listening" || !recognition) return false;
      endReason = reason || "cancel";
      var active = recognition;
      clearTimer();
      try {
        if (typeof active.abort === "function") active.abort();
        else if (typeof active.stop === "function") active.stop();
      } catch (_) {}
      finish("idle", silent ? "" : text("cancelled", "Listening cancelled. You can keep typing."));
      return true;
    }
    function collectFinal(event) {
      var out = [];
      var results = event && event.results;
      if (!results) return "";
      for (var i = Number(event.resultIndex) || 0; i < results.length; i++) {
        var item = results[i];
        if (!item || item.isFinal === false || !item[0]) continue;
        out.push(String(item[0].transcript || ""));
      }
      return out.join(" ").replace(/\s+/g, " ").trim();
    }
    function start() {
      if (destroyed || button.hidden || !Ctor || input.disabled) return false;
      if (state === "listening") return abortActive("cancel", false);
      var rec;
      try { rec = new Ctor(); } catch (_) {
        finish("error", text("error", "Speech recognition failed. You can keep typing."));
        return false;
      }
      recognition = rec;
      resultSeen = false;
      endReason = "";
      rec.lang = o.language || "he-IL";
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = function (event) {
        if (recognition !== rec) return;
        var spoken = collectFinal(event);
        if (!spoken) return;
        resultSeen = true;
        input.value = appendDraft(input.value, spoken, input.maxLength);
        try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
        try { input.focus(); } catch (_) {}
        endReason = "result";
        try { if (typeof rec.stop === "function") rec.stop(); } catch (_) {}
        finish("ready", text("ready", "Speech added as an editable draft. Review it, then send explicitly."));
      };
      rec.onerror = function (event) {
        if (recognition !== rec) return;
        var code = String(event && event.error || "");
        endReason = "error";
        var msg = code === "not-allowed" || code === "service-not-allowed"
          ? text("denied", "Microphone permission is unavailable. You can keep typing.")
          : text("error", "Speech recognition failed. You can keep typing.");
        finish("error", msg);
      };
      rec.onend = function () {
        if (recognition !== rec || state !== "listening") return;
        if (!resultSeen && !endReason) finish("idle", text("error", "No speech was recognized. You can keep typing."));
      };
      state = "listening";
      paint();
      setStatus(text("listening", "Listening for Hebrew… Press stop to cancel."));
      timer = (o.setTimeout || setTimeout)(function () {
        if (state !== "listening" || recognition !== rec) return;
        endReason = "timeout";
        try {
          if (typeof rec.abort === "function") rec.abort();
          else if (typeof rec.stop === "function") rec.stop();
        } catch (_) {}
        finish("idle", text("timeout", "Listening timed out. You can keep typing."));
      }, timeoutMs);
      try { rec.start(); } catch (_) {
        finish("error", text("error", "Speech recognition failed. You can keep typing."));
        return false;
      }
      return true;
    }
    function onButton() { start(); }
    button.addEventListener("click", onButton);
    button.hidden = true;
    paint();

    var ready = Promise.resolve(o.enabled == null ? loadRuntimeFlag(o.fetch) : boolFlag(o.enabled))
      .then(function (enabled) {
        var available = !!enabled && !!Ctor && !destroyed;
        button.hidden = !available;
        if (!available) { state = "unavailable"; setStatus(""); }
        else {
          state = "idle";
          paint();
          setStatus(text("privacy", "Your browser handles speech recognition; this app does not receive or store audio."));
        }
        return available;
      });

    return {
      ready: ready,
      start: start,
      cancel: function (silent) { return abortActive("cancel", silent === true); },
      state: function () { return state; },
      destroy: function () {
        abortActive("destroy", true);
        destroyed = true;
        button.hidden = true;
        button.removeEventListener("click", onButton);
      },
    };
  }

  return {
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    appendDraft: appendDraft,
    loadRuntimeFlag: loadRuntimeFlag,
    create: create,
  };
});
