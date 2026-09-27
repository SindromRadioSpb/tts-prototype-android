// Лестница этапов «Материала из субтитров»: одна честная картина того, где сейчас ждёт человек.
// Модель — чистые данные со временем, переданным снаружи (тестируется без часов и DOM); отрисовка —
// строка HTML поверх тех же данных. Счётчики обновляются каждый тик, объявление для экранных
// читалок — только при смене этапа, чтобы не зачитывать каждое число.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.MaterialProgressLadder = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = [
    { key: "upload", phase: "check", label: "studio.import.ladderStepUpload" },
    { key: "probe", phase: "check", label: "studio.import.ladderStepProbe" },
    { key: "tracks", phase: "check", label: "studio.import.ladderStepTracks" },
    { key: "video", phase: "build", label: "studio.import.ladderStepVideo" },
    // Order follows the real run: the full copy is stored before the light copy is made.
    { key: "store", phase: "build", label: "studio.import.ladderStepStore" },
    { key: "lite", phase: "build", label: "studio.import.ladderStepLite" },
    { key: "table", phase: "build", label: "studio.import.ladderStepTable" },
    { key: "niqqud", phase: "build", label: "studio.import.ladderStepNiqqud" },
    { key: "open", phase: "build", label: "studio.import.ladderStepOpen" },
  ];
  var ETA_MIN_SAMPLE_MS = 10000;

  function create() {
    var steps = {};
    STEPS.forEach(function (step) {
      steps[step.key] = { state: "todo", startedAt: null, endedAt: null, done: null, total: null, unit: null,
        sampleAt: null, sampleDone: null, error: null };
    });
    return { steps: steps };
  }

  function stepOf(m, key) {
    var step = m && m.steps && m.steps[key];
    if (!step) throw new Error("LADDER_UNKNOWN_STEP:" + key);
    return step;
  }

  function begin(m, key, now) {
    var step = stepOf(m, key);
    if (step.state === "done") return step;
    if (step.state !== "active") {
      step.state = "active";
      step.startedAt = now;
      step.endedAt = null;
      step.done = null; step.total = null; step.unit = null;
      step.sampleAt = null; step.sampleDone = null;
    }
    step.error = null;
    return step;
  }

  function update(m, key, progress, now) {
    var step = stepOf(m, key);
    if (step.state === "done") return step;
    if (step.state !== "active") begin(m, key, now);
    var p = progress || {};
    var done = Number(p.done), total = Number(p.total);
    // A step may change what it counts (the light copy: encode percent, then stored bytes).
    if (p.unit && step.unit && p.unit !== step.unit) {
      step.done = null; step.total = null; step.sampleAt = null; step.sampleDone = null;
    }
    if (Number.isFinite(done)) step.done = done;
    if (Number.isFinite(total) && total > 0) step.total = total;
    if (p.unit) step.unit = p.unit;
    // Rate starts at the first non-zero sample, not at step start: an upload's connection setup, an
    // encoder warming up or a model load (a visible "0 of N") would otherwise drag the estimate.
    if (step.sampleAt == null && done > 0) { step.sampleAt = now; step.sampleDone = done; }
    step.lastAt = now;
    return step;
  }

  function finish(m, key, now) {
    var step = stepOf(m, key);
    if (step.state === "done") return step;
    if (step.startedAt == null) step.startedAt = now;
    step.state = "done";
    step.endedAt = now;
    step.error = null;
    return step;
  }

  function skip(m, key) {
    var step = stepOf(m, key);
    step.state = "skipped";
    step.error = null;
    return step;
  }

  function fail(m, key, error, now) {
    var step = stepOf(m, key);
    if (step.startedAt == null) step.startedAt = now;
    step.state = "failed";
    step.endedAt = now;
    step.error = { code: (error && error.code) || null, message: (error && error.message) || "",
      action: (error && error.action) === "restart" ? "restart" : "retry" };
    return step;
  }

  function findKey(m, state) {
    for (var i = 0; i < STEPS.length; i++) if (m.steps[STEPS[i].key].state === state) return STEPS[i].key;
    return null;
  }
  function activeKey(m) { return findKey(m, "active"); }
  function failedKey(m) { return findKey(m, "failed"); }

  function durationMs(step) {
    if (!step || step.startedAt == null || step.endedAt == null) return null;
    return Math.max(0, step.endedAt - step.startedAt);
  }

  function remainingMs(step, now) {
    if (!step || step.state !== "active" || step.sampleAt == null || !step.total) return null;
    var at = step.lastAt == null ? now : step.lastAt;
    var span = at - step.sampleAt, gained = step.done - step.sampleDone;
    if (span < ETA_MIN_SAMPLE_MS || !(gained > 0)) return null;
    var rate = gained / span;
    return Math.max(0, Math.round((step.total - step.done) / rate));
  }

  function failureKey(stepKey, error) {
    var code = String((error && error.code) || ""), name = String((error && error.name) || "");
    if (name === "QuotaExceededError" || code === "OPFS_QUOTA_LOW") return "studio.import.ladderErrStorage";
    if (code === "LOCAL_ASR_PAIRING_REQUIRED") return "studio.import.ladderErrPairing";
    if (code === "LOCAL_ASR_UNAVAILABLE") return "studio.import.ladderErrCompanionDown";
    if (stepKey === "niqqud" && (code === "LOCAL_ASR_HTTP_503" || code === "LOCAL_VOCALIZATION_UNAVAILABLE")) {
      return "studio.import.ladderErrNiqqudModel";
    }
    if (code === "LOCAL_ASR_HTTP_429") return "studio.import.ladderErrCompanionBusy";
    // An older companion enforces a lower intake ceiling than this Studio; the remedy is an update.
    if (code === "LOCAL_ASR_HTTP_413") return "studio.import.ladderErrTooLargeForCompanion";
    if (/^MEDIA_JOB_(FAILED|CANCELED)$/.test(code)) return "studio.import.ladderErrMediaJob";
    return "studio.import.ladderErrGeneric";
  }

  // Text-node escaping only: every dynamic value lands between tags, never inside an attribute.
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(mm).padStart(2, "0") + ":" + ss : mm + ":" + ss;
  }

  function duration(tr, ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return tr("studio.import.ladderDurSec", { sec: Math.max(1, s) });
    return tr("studio.import.ladderDurMinSec", { min: Math.floor(s / 60), sec: s % 60 });
  }

  function eta(tr, ms) {
    if (ms == null) return tr("studio.import.ladderEtaCounting");
    if (ms < 60000) return tr("studio.import.ladderEtaUnderMin");
    return tr("studio.import.ladderEtaMin", { min: Math.round(ms / 60000) });
  }

  function fraction(step) {
    if (!step || step.done == null) return null;
    if (step.unit === "fraction") return Math.max(0, Math.min(1, step.done));
    if (!step.total) return null;
    return Math.max(0, Math.min(1, step.done / step.total));
  }

  function counter(step, opts) {
    var tr = opts.tr, human = opts.humanBytes || String;
    if (step.done == null) return "";
    if (step.unit === "fraction") return tr("studio.import.ladderPercent", { pct: Math.round(fraction(step) * 100) });
    if (step.unit === "bytes") {
      return step.total ? tr("studio.import.ladderBytes", { done: human(step.done), total: human(step.total) })
        : human(step.done);
    }
    return step.total ? tr("studio.import.ladderCount", { done: step.done, total: step.total }) : String(step.done);
  }

  function stepsFor(view) {
    return STEPS.filter(function (s) { return view === "build" || s.phase === "check"; });
  }

  function rowHtml(m, def, opts) {
    var tr = opts.tr, step = m.steps[def.key], state = step.state, now = opts.now;
    var meta = "", extra = "";
    if (state === "done") meta = durationMs(step) ? duration(tr, durationMs(step)) : "✓";
    else if (state === "skipped") meta = tr("studio.import.ladderSkipped");
    else if (state === "failed") meta = tr("studio.import.ladderStopped");
    else if (state === "active") {
      meta = counter(step, opts);
      var f = fraction(step), pct = f == null ? null : Math.round(f * 100);
      extra = '<div class="lp-ladder-detail">' +
        (pct == null
          ? '<div class="lp-ladder-bar is-indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>'
          : '<div class="lp-ladder-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct +
            '"><i style="width:' + pct + '%"></i></div>') +
        '<div class="lp-ladder-sub"><span>' + esc(tr("studio.import.ladderElapsed", { time: clock(now - step.startedAt) })) +
        "</span>" + (step.total || step.unit === "fraction" ? "<span>" + esc(eta(tr, remainingMs(step, now))) + "</span>" : "") +
        "</div></div>";
    }
    if (state === "failed") {
      var keptVideo = m.steps.store.state === "done";
      extra = '<div class="lp-ladder-error" role="alert"><p>' + esc(step.error && step.error.message) + "</p>" +
        (keptVideo ? "<p>" + esc(tr("studio.import.ladderKeptVideo")) + "</p>" : "") +
        '<button type="button" class="btn-primary" data-ladder-action="retry">' +
        esc(step.error && step.error.action === "restart" ? tr("studio.import.ladderRestart")
          : tr("studio.import.ladderRetry", { step: tr(def.label) })) + "</button></div>";
    }
    var mark = state === "done" ? "✓" : state === "failed" ? "!" : "";
    return '<li class="lp-ladder-step" data-step="' + def.key + '" data-state="' + state + '">' +
      '<span class="lp-ladder-mark" aria-hidden="true">' + mark + "</span>" +
      '<span class="lp-ladder-label">' + esc(tr(def.label)) + "</span>" +
      '<span class="lp-ladder-meta">' + esc(meta) + "</span>" + extra + "</li>";
  }

  function renderHtml(m, options) {
    var opts = options || {}, view = opts.view === "build" ? "build" : "check", tr = opts.tr || function (k) { return k; };
    opts = Object.assign({}, opts, { tr: tr, now: opts.now == null ? Date.now() : opts.now });
    var defs = stepsFor(view), html = "", phase = null;
    var doneDefs = defs.filter(function (d) { return m.steps[d.key].state === "done"; });
    var moving = defs.some(function (d) { return ["active", "failed"].indexOf(m.steps[d.key].state) >= 0; });
    if (doneDefs.length >= 2 && moving) {
      var total = doneDefs.reduce(function (sum, d) { return sum + (durationMs(m.steps[d.key]) || 0); }, 0);
      html += '<li class="lp-ladder-summary"><span class="lp-ladder-mark" aria-hidden="true">✓</span><span>' +
        esc(tr("studio.import.ladderSummary", { count: doneDefs.length, time: duration(tr, total) })) + "</span></li>";
    }
    defs.forEach(function (def) {
      if (view === "build" && def.phase !== phase) {
        phase = def.phase;
        html += '<li class="lp-ladder-phase">' + esc(tr(phase === "check" ? "studio.import.ladderPhaseCheck"
          : "studio.import.ladderPhaseBuild")) + "</li>";
      }
      html += rowHtml(m, def, opts);
    });
    var cancel = typeof opts.onCancel === "function" && !failedKey(m) && activeKey(m)
      ? '<div class="lp-ladder-actions"><button type="button" class="btn-secondary" data-ladder-action="cancel">' +
        esc(tr("studio.import.ladderCancel")) + "</button></div>"
      : "";
    return '<ol class="lp-ladder-list">' + html + "</ol>" + cancel;
  }

  function announcement(m, options) {
    var tr = (options && options.tr) || function (k) { return k; };
    var failed = failedKey(m);
    var def = function (key) { return STEPS.filter(function (s) { return s.key === key; })[0]; };
    if (failed) return tr("studio.import.ladderAnnounceFailed", { step: tr(def(failed).label) });
    var active = activeKey(m);
    if (active) return tr("studio.import.ladderAnnounceActive", { step: tr(def(active).label) });
    return "";
  }

  function renderInto(host, m, options) {
    if (!host) return;
    var opts = options || {};
    if (!host.__lpLadder) {
      host.innerHTML = '<div class="lp-ladder-body"></div><p class="lp-ladder-live" aria-live="polite"></p>';
      host.__lpLadder = { onRetry: null, onCancel: null, announced: null };
      if (typeof host.addEventListener === "function") {
        host.addEventListener("click", function (event) {
          var target = event && event.target;
          if (!target || typeof target.closest !== "function") return;
          if (target.closest('[data-ladder-action="retry"]') && typeof host.__lpLadder.onRetry === "function") {
            host.__lpLadder.onRetry();
          } else if (target.closest('[data-ladder-action="cancel"]') && typeof host.__lpLadder.onCancel === "function") {
            host.__lpLadder.onCancel();
          }
        });
      }
    }
    host.__lpLadder.onRetry = opts.onRetry || null;
    host.__lpLadder.onCancel = opts.onCancel || null;
    var body = host.querySelector && host.querySelector(".lp-ladder-body");
    if (body) body.innerHTML = renderHtml(m, opts);
    var live = host.querySelector && host.querySelector(".lp-ladder-live");
    var text = announcement(m, opts);
    if (live && text !== host.__lpLadder.announced) { live.textContent = text; host.__lpLadder.announced = text; }
    host.hidden = false;
  }

  return {
    STEPS: STEPS, create: create, begin: begin, update: update, finish: finish, skip: skip, fail: fail,
    activeKey: activeKey, failedKey: failedKey, durationMs: durationMs, remainingMs: remainingMs,
    failureKey: failureKey, renderHtml: renderHtml, announcement: announcement, renderInto: renderInto,
  };
});
