// public/js/studio-import.js
// W1 «Импорт»: единая точка входа внешнего контента (URL/файл/фото) в Студию.
// Канон: docs/planning/STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25.md.
// Извлечение делает сервер (/api/ingest/*); модуль приземляет ЧИСТЫЙ ТЕКСТ в
// #inputText и публикует провенанс-паспорт window.v3LastImportMeta (R9: derived).
// Зависимости-глобалы Студии: geminiKeyGet(), showToast(), t(), #inputText.
(function () {
  "use strict";

  var HE_RE = /^(iw|he)\b/i;

  // Целевой язык продукта — иврит (seg-режим работает только he-ru). Алфавитный список дорожек
  // бесполезен: у одного ролика их бывает 64, и нужная тонет. Поэтому иврит проверяется первым.
  // Pure — no DOM — exported below for Node (tests/importTrackHint.test.js) and for the browser
  // via window.StudioImport.chooseTrackHint, following the split used in studio-media-karaoke.js.
  // `more` means the SAME thing in every branch below: how many additional DISTINCT languages
  // (never raw track count — one language routinely has both a manual and an auto-generated
  // track, e.g. English) exist beyond the one(s) already named in the primary message. Whole-
  // branch review 2026-07-28 found the HeManual/HeAuto branches counting tracks while NoHe counted
  // unique names — same word, two different promises. Dedup key: languageCode when present
  // (stable identifier), falling back to languageName only for tracks missing a code.
  function uniqueLangCount(tracks) {
    var ids = tracks.map(function (t) { return String((t && (t.languageCode || t.languageName)) || "").toLowerCase(); })
                     .filter(Boolean);
    return ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length;
  }

  function chooseTrackHint(list, confirmed) {
    var tracks = Array.isArray(list) ? list : [];
    if (!tracks.length) {
      return { key: confirmed ? "studio.import.captionsTracksNone" : "studio.import.captionsTracksPending" };
    }
    var he = tracks.filter(function (t) { return t && HE_RE.test(String(t.languageCode || "")); });
    var heManual = he.filter(function (t) { return t.kind !== "asr"; });
    if (heManual.length) {
      // -1: Hebrew itself is already named by the HeManual key, don't recount it as "more".
      return { key: "studio.import.captionsTracksHeManual", more: Math.max(0, uniqueLangCount(tracks) - 1) };
    }
    if (he.length) {
      return { key: "studio.import.captionsTracksHeAuto", more: Math.max(0, uniqueLangCount(tracks) - 1) };
    }
    var manual = tracks.filter(function (t) { return t.kind !== "asr"; });
    var pool = manual.length ? manual : tracks;
    var names = pool.map(function (t) { return t.languageName || t.languageCode; }).filter(Boolean);
    var uniq = names.filter(function (v, i) { return names.indexOf(v) === i; });
    return { key: "studio.import.captionsTracksNoHe", langs: uniq.slice(0, 3).join(", "),
             more: Math.max(0, uniq.length - 3) };
  }

  // Russian needs three plural forms (1 язык / 2-4 языка / 0,5+,11-14 языков — standard CLDR "one/
  // few/many" split); English and Hebrew only distinguish singular (n===1) from everything else.
  // No ICU/plural machinery exists in this codebase's i18n core (public/i18n/index.js — plain
  // {param} substitution only), so the category is resolved here and mapped to one of three
  // locale keys rather than teaching the whole i18n engine CLDR rules for one string.
  function pluralCategory(n, locale) {
    if (locale === "ru") {
      var mod10 = n % 10, mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return "one";
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
      return "many";
    }
    return n === 1 ? "one" : "many"; // en, he: binary singular/plural
  }

  // W2-S12: оркестратор окон ASR. Pure-логика с инъекцией transcribe/parse — тестируется в Node
  // фейками (tests/runWindowedAsr.test.js); сетевые вызовы даёт Task 4. Дизайн §4.3.
  // ВАЖНО (R11): добор дыры — ×1 на дыру, максимум maxHeals доборов на прогон; остаток дыр
  // никогда не маскируется — уходит в coverageGaps + warning ASR_COVERAGE_GAP.
  async function runWindowedAsr(deps) {
    var A2 = (typeof window !== "undefined") ? window.AsrTranscript : require("./asr-transcript.js");
    var wins = A2.asrWindows(deps.durationSec);
    var single = wins.length === 1;
    var windowSegments = (deps.priorWindows || []).slice();
    var windowsMeta = windowSegments.map(function (_, i) {
      return { startSec: wins[i].startSec, endSec: wins[i].endSec, retries: 0 };
    });
    var warnings = [], language = null;
    var startAt = deps.startWindow || windowSegments.length;

    async function oneCall(startSec, endSec) { // parse c retry ×1 на ASR_BAD_JSON
      var raw = await deps.transcribe(startSec, endSec);
      try { return { parsed: deps.parse(raw), retries: 0 }; }
      catch (e1) {
        if (e1.code !== "ASR_BAD_JSON") throw e1;
        raw = await deps.transcribe(startSec, endSec);
        return { parsed: deps.parse(raw), retries: 1 };
      }
    }

    for (var k = startAt; k < wins.length; k++) {
      deps.onProgress(k + 1, wins.length);
      var r;
      try {
        r = single ? await oneCall(null, null) : await oneCall(wins[k].startSec, wins[k].endSec);
      } catch (e) {
        e.windowIndex = k;
        e.windowSegments = windowSegments;
        throw e;
      }
      windowsMeta.push({ startSec: wins[k].startSec, endSec: wins[k].endSec, retries: r.retries });
      windowSegments.push(r.parsed.segments);
      if (!language && r.parsed.language) language = r.parsed.language;
      (r.parsed.warnings || []).forEach(function (w) {
        if (w !== "NO_SPEECH" && warnings.indexOf(w) < 0) warnings.push(w);
      });
    }

    var merged = A2.mergeWindowSegments(windowSegments);
    var gaps = A2.findCoverageGaps(merged, deps.durationSec);
    var healedGaps = [], maxHeals = deps.maxHeals == null ? 3 : deps.maxHeals;
    for (var g = 0; g < gaps.length && healedGaps.length < maxHeals; g++) {
      var gap = gaps[g];
      var heal;
      try { heal = await oneCall(gap.fromSec, gap.toSec); }
      catch (_) { continue; } // добор best-effort: неудача = дыра остаётся честной
      if (heal.parsed.segments.length) {
        // Позиционная (не по значению start) вставка (fix R11-порядка, ревью после T3): граница
        // дыры — это КОНКРЕТНЫЙ сегмент в merged с start===gap.fromSec (findCoverageGaps берёт
        // fromSec из реального prev-сегмента). Вставляем добор сразу ПОСЛЕ него по ИНДЕКСУ, а не
        // фильтром по значению start — фильтр `start === null || start <= gap.fromSec` относил
        // ВСЕ null-start сегменты (немонотонный стык окон) в «до дыры» независимо от их реальной
        // структурной позиции, из-за чего null-сегмент, стоящий ПОСЛЕ дыры, молча переезжал перед
        // heal-вставкой и портил порядок текста.
        var insertAt = -1;
        for (var mi = 0; mi < merged.length; mi++) { if (merged[mi].start === gap.fromSec) insertAt = mi; }
        // Whole-branch review 2026-07-28 (I1, R11): the gap boundary can vanish from merged
        // between the search above and now — an EARLIER heal in this same loop may have
        // overshot past this gap's fromSec, and the re-merge (mergeWindowSegments below) then
        // nulls out the now-non-monotonic boundary segment's start (see comment above). With
        // insertAt===-1, `merged.slice(0, 0)` silently prepended the heal as a PREFIX of the
        // whole transcript — the exact silent reordering this fix closes. The gap stays
        // honest (best-effort add-on, §4.3); it will surface via coverageGaps/ASR_COVERAGE_GAP
        // instead of being masked by a misplaced insertion.
        if (insertAt < 0) continue;
        var flat = merged.slice(0, insertAt + 1).concat(heal.parsed.segments, merged.slice(insertAt + 1));
        merged = A2.mergeWindowSegments([flat]);
        healedGaps.push(gap);
      }
    }
    var remaining = A2.findCoverageGaps(merged, deps.durationSec);
    if (remaining.length && warnings.indexOf("ASR_COVERAGE_GAP") < 0) warnings.push("ASR_COVERAGE_GAP");
    if (!merged.length && warnings.indexOf("NO_SPEECH") < 0) warnings.push("NO_SPEECH");
    return { segments: merged, language: language, warnings: warnings, windows: windowsMeta,
             coverageGaps: remaining, healedGaps: healedGaps, windowSegments: windowSegments };
  }

  if (typeof window === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { chooseTrackHint: chooseTrackHint, pluralCategory: pluralCategory, uniqueLangCount: uniqueLangCount,
                          runWindowedAsr: runWindowedAsr };
    }
    return;
  }

  var MAX_FILE_BYTES = 6 * 1024 * 1024;
  var pending = null; // {kind, source, method, model, warnings, text}

  // W2-S4 — Import → Audio (BYOK Gemini ASR). Канон:
  // docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md.
  var MAX_AUDIO_SEC = 3 * 3600;          // решение S12 2026-07-28: 3 часа; байт-кап 300МБ остаётся предохранителем
  var MAX_AUDIO_BYTES = 300 * 1024 * 1024; // sanity
  var pendingAudio = null; // {file, buf, sha256, mime, durationSec, name, parsed, validation}

  // W2-S5a — Import → Captions (.vtt/.srt file or pasted YouTube transcript panel) + optional
  // embedded YouTube player for capability preview. Канон:
  // docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md.
  var pendingCaptions = null; // {parsed, origin, fileName, video}
  var ytAdapter = null;       // адаптер плеера, если ролик встроен
  var mountGen = 0;           // W2-S5a.1 T3: bumped by close() (and by a fresh mountVideo()) to
                               // invalidate an in-flight mountVideo() still awaiting create() —
                               // guards against a stale async write into #v3ImportYtHint landing
                               // after the dialog has already closed. Pre-existing race, flagged
                               // (not introduced) by task-2-report.md; fixed here.
  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/; // mirrors StudioYtPlayer's own ID_RE — defense in depth
                               // so #v3ImportOpenYt's href can only ever be built from something
                               // that already looks like a validated YouTube video id.
  var captionsPollTimers = []; // active setTimeout ids for the CURRENT mount's bounded tracklist
                               // poll (CAPTIONS_POLL_DELAYS_MS, near mountVideo()) — cleared by
                               // clearCaptionsPoll() on teardown/re-mount so a superseded schedule
                               // never outlives the mount it belongs to.
  function clearCaptionsPoll() {
    captionsPollTimers.forEach(function (id) { clearTimeout(id); });
    captionsPollTimers = [];
  }

  // W2-S5a.1 T2 — три явные вкладки вместо плоского стека. open() всегда переключает на "url",
  // чтобы поведение диалога было предсказуемым при каждом открытии (канон: task-2-brief.md). Нет
  // отдельного module-level флага активной вкладки (whole-branch review 2026-07-28 — был записан,
  // нигде не читался): реальное состояние — DOM (pane.hidden / aria-selected на кнопках),
  // switchTab() читает именно его, а не дублирующую переменную.
  var TAB_PANE_ID = { url: "v3ImportPaneUrl", video: "v3ImportPaneVideo", file: "v3ImportPaneFile" };
  var TAB_BTN_ID = { url: "v3ImportTabUrl", video: "v3ImportTabVideo", file: "v3ImportTabFile" };

  function $(id) { return document.getElementById(id); }
  function tr(key, params) { return (typeof window.t === "function") ? window.t(key, params) : key; }
  function toast(key, type) { if (typeof window.showToast === "function") window.showToast(tr(key), type || "info"); }

  // W2-S5a.1 T2-fix (whole-branch review 2026-07-28, IMPORTANT): leaving the Video tab must tear
  // the player down, or two things break. (1) A provenance lie: mountVideo() sets
  // pendingCaptions.video, and acceptCaptions() (`pendingCaptions = pendingCaptions || {}`) never
  // clears it — so mounting video A, switching to Файл, and picking an UNRELATED .vtt stamps that
  // file's provenance with video A. That is exactly the derived-vs-asserted line R9 exists to hold.
  // (2) An audio leak: the iframe is only [hidden]'d (display:none), which does not stop iframe
  // playback in Chrome — audio keeps coming from an invisible player with no reachable control
  // until the whole dialog is closed. Shared by switchTab() (leaving Video for another tab) and
  // close() (the pre-existing single teardown point) so there is exactly one place this logic
  // lives. Safe to call redundantly / when nothing is mounted — every step is null-guarded.
  function teardownVideo() {
    mountGen++; // abandon any in-flight mountVideo() still awaiting create()
    clearCaptionsPoll(); // W2-S5a.1 T2-fix2: stop the bounded tracklist poll (see mountVideo())
    if (ytAdapter) {
      if (window.StudioYtPlayer) window.StudioYtPlayer.destroy(ytAdapter);
      ytAdapter = null;
    }
    var ytm = $("v3ImportYtMount");
    if (ytm) { ytm.hidden = true; ytm.innerHTML = ""; }
    var yth = $("v3ImportYtHint");
    if (yth) yth.textContent = "";
    showCaptionsHow(false);
    if (pendingCaptions) delete pendingCaptions.video;
  }

  function switchTab(name) {
    if (!TAB_PANE_ID[name]) name = "url";
    var videoPane = $(TAB_PANE_ID.video);
    var leavingVideo = !!videoPane && !videoPane.hidden && name !== "video";
    for (var k in TAB_PANE_ID) {
      if (!TAB_PANE_ID.hasOwnProperty(k)) continue;
      var pane = $(TAB_PANE_ID[k]);
      if (pane) pane.hidden = (k !== name);
      var btn = $(TAB_BTN_ID[k]);
      if (btn) btn.setAttribute("aria-selected", k === name ? "true" : "false");
    }
    if (leavingVideo) teardownVideo();
    setStatus(null);
  }

  function setStatus(msgKey, extra) {
    var el = $("v3ImportStatus");
    if (el) el.textContent = msgKey ? (tr(msgKey) + (extra ? " " + extra : "")) : "";
  }

  function setBusy(b) {
    var btn = $("v3ImportUrlBtn");
    if (btn) btn.disabled = b;
    var vb = $("v3ImportVideoBtn");
    if (vb) vb.disabled = b;
    var f = $("v3ImportFile");
    if (f) f.disabled = b;
    var ab = $("v3ImportAudioGo");
    if (ab) ab.disabled = b;
  }

  function probeAudioDuration(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var a = new Audio();
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } }, 10000);
      a.onloadedmetadata = function () {
        if (done) return; done = true; clearTimeout(to); URL.revokeObjectURL(url);
        (isFinite(a.duration) && a.duration > 0) ? resolve(a.duration) : reject(new Error("AUDIO_BAD_FILE"));
      };
      a.onerror = function () { if (!done) { done = true; clearTimeout(to); URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } };
      a.src = url;
    });
  }

  async function onAudioChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    $("v3ImportAudioInfo").hidden = true;
    pendingAudio = null;
    var isVideo = String(file.type || "").toLowerCase().startsWith("video/");
    if (file.size > MAX_AUDIO_BYTES) { setStatus(isVideo ? "studio.import.errVideoTooLarge" : "studio.import.errAudioTooLarge"); return; }
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    var dur;
    try { dur = await probeAudioDuration(file); }
    catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
    if (dur > MAX_AUDIO_SEC + 1) { setStatus("studio.import.errAudioTooLong"); return; }
    var mime = file.type || "audio/mpeg";
    pendingAudio = { file: file, buf: null, sha256: null, mime: mime, durationSec: dur, name: file.name, parsed: null, validation: null, isVideo: isVideo, windowResults: null };
    var est = window.AsrTranscript.estimateLongJob(dur, {
      video: isVideo, chunkSize: window.TableChunks.CHUNK_SIZE });
    var durRounded = Math.round(dur);
    var mm = Math.floor(durRounded / 60), ss = String(durRounded % 60).padStart(2, "0");
    var metaText = mm + ":" + ss + " · " + (file.size / (1024 * 1024)).toFixed(1) + "MB";
    if (isVideo) metaText += " · " + tr("studio.import.videoNote");
    $("v3ImportAudioMeta").textContent = metaText;
    $("v3ImportAudioGo").textContent = tr("studio.import.audioGo") +
      " (≈$" + Math.max(0.01, est.totalUsd).toFixed(2) + " · ~" + est.minutes + " " + tr("studio.import.minShort") + ")";
    $("v3ImportAudioInfo").hidden = false;
    setStatus(null);
  }

  async function transcribeAudio() {
    if (!pendingAudio) return;
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true);
    try {
      setStatus("studio.import.audioUploading");
      pendingAudio.buf = await pendingAudio.file.arrayBuffer();
      pendingAudio.sha256 = await window.MediaStore.sha256Hex(pendingAudio.buf);
      var up = await window.GeminiFiles.uploadFile(key, pendingAudio.file, pendingAudio.mime);
      setStatus("studio.import.audioProcessing");
      if (up.state !== "ACTIVE") {
        await window.GeminiFiles.waitActive(key, up.name, { timeoutMs: 60000 + Math.ceil(pendingAudio.file.size / 1048576) * 1000 });
      }
      setStatus("studio.import.audioTranscribing");
      var A2 = window.AsrTranscript;
      var resumeFrom = (pendingAudio.windowResults && pendingAudio.windowResults.length) || 0;
      var result;
      try {
        result = await window.StudioImport.runWindowedAsr({
          durationSec: pendingAudio.durationSec,
          startWindow: resumeFrom,
          priorWindows: pendingAudio.windowResults || [],
          transcribe: function (a, b) {
            return window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime,
              a === null ? undefined : { promptText: A2.ASR_RANGE_PROMPT(a, b) });
          },
          parse: A2.parseAsrResponse,
          onProgress: function (k, m) {
            if (m > 1) setStatus("studio.import.audioWindowProgress", k + "/" + m);
          },
        });
      } catch (e2) {
        if (e2.windowSegments) pendingAudio.windowResults = e2.windowSegments; // резюм со след. клика
        throw e2;
      }
      pendingAudio.windowResults = null; // успех — резюм-состояние отработано
      var parsed = { language: result.language, segments: result.segments, warnings: result.warnings };
      pendingAudio.asrWindows = result.windows;
      pendingAudio.coverageGaps = result.coverageGaps;
      pendingAudio.healedGaps = result.healedGaps;
      if (!parsed.segments.length || parsed.warnings.includes("NO_SPEECH")) { setStatus("studio.import.errNoSpeech"); return; }
      pendingAudio.parsed = parsed;
      pendingAudio.validation = window.AsrTranscript.validateSegments(parsed.segments, pendingAudio.durationSec);
      showPreview({
        kind: "audio", source: pendingAudio.name, method: "gemini-asr",
        model: window.AsrTranscript.ASR_MODEL,
        warnings: parsed.warnings.concat(pendingAudio.validation.timingOk ? [] : ["ASR_TIMING_INVALID"]),
        text: pendingAudio.validation.segments.map(function (s) { return s.text; }).join("\n"),
      });
    } catch (e) {
      var code = e && e.code;
      if (!code && e && (e.status != null)) code = window.GeminiError.classifyGeminiError(e).error_code;
      setStatus(errKey(code || "UPLOAD_FAILED"));
    } finally { setBusy(false); }
  }

  function showPreview(p) {
    pending = p;
    $("v3ImportPreview").value = p.text;
    var provKey = { url: "studio.import.provUrl", image: "studio.import.provOcr", pdf: "studio.import.provPdf", docx: "studio.import.provDocx", audio: "studio.import.provAudio", captions: "studio.import.provCaptions" }[p.kind];
    var prov = tr(provKey) + " · " + p.source + (p.model ? " · " + p.model : "");
    if (p.warnings && p.warnings.length) prov += " · ⚠ " + tr("studio.import.warnCheck");
    $("v3ImportProv").textContent = prov;
    // W2-S11 (решение 7): дефолт-провайдер google-free не задействует seg-путь —
    // мягкая подсказка, БЕЗ автопереключения (дизайн §1.7).
    // NB: this file's tr(key, params) forwards params straight to window.t() for {placeholder}
    // interpolation — it is NOT a (key, fallback) helper, unlike studio-retell.js's own tr(k, f).
    // window.t() returns the KEY ITSELF on a miss (public/i18n/index.js), so tr(key, "русский
    // текст") would have rendered the literal untranslated key until Task 7 adds this string to
    // the locales. Miss-checked here instead, matching the T(key, fb) idiom used elsewhere in
    // this codebase (reader-morph.js tt(), knowledge-map-quiz-loader.js T(), …).
    try {
      var provSel = document.getElementById("providerSelect");
      if ((p.kind === "audio" || p.kind === "captions") && provSel && provSel.value !== "gemini") {
        var hint = document.createElement("div");
        hint.style.cssText = "font-size:12px;color:#b8860b;margin-top:4px;";
        var hintKey = "studio.retell.providerHint", hintVal = tr(hintKey);
        hint.textContent = (hintVal && hintVal !== hintKey) ? hintVal : "Для караоке и длинных таблиц включите провайдер Gemini";
        $("v3ImportProv").appendChild(hint);
      }
    } catch (_) {}
    $("v3ImportPreviewWrap").hidden = false;
    setStatus(null);
  }

  async function postJson(url, body) {
    var res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok !== true) {
      var code = (data && data.error_code) || ("HTTP_" + res.status);
      var err = new Error(code);
      err.code = code;
      throw err;
    }
    return data;
  }

  var ERROR_KEY = {
    BAD_URL: "studio.import.errBadUrl", BAD_SCHEME: "studio.import.errBadUrl", BAD_PORT: "studio.import.errBadUrl",
    PRIVATE_ADDR: "studio.import.errPrivateUrl", NOT_HTML: "studio.import.errNotHtml",
    TOO_LARGE: "studio.import.errTooLarge", FILE_TOO_LARGE: "studio.import.errTooLarge",
    EXTRACT_EMPTY: "studio.import.errEmpty", DOCX_EMPTY: "studio.import.errEmpty", BAD_DOCX: "studio.import.errBadFile",
    BAD_MIME: "studio.import.errBadFile", BAD_KIND: "studio.import.errBadFile",
    GEMINI_KEY_REQUIRED: "studio.import.errNoKey", GEMINI_KEY_INVALID: "studio.import.errNoKey",
    GEMINI_KEY_REJECTED: "studio.import.errKeyRejected",
    GEMINI_QUOTA: "studio.import.errQuota", GEMINI_OVERLOADED: "studio.import.errOverloaded",
    EXTRACT_BAD_JSON: "studio.import.errExtractBadJson",
    // W2-S4 — audio ASR path
    AUDIO_BAD_FILE: "studio.import.errAudioBadFile", AUDIO_TOO_LONG: "studio.import.errAudioTooLong",
    UPLOAD_FAILED: "studio.import.errUpload", FILE_FAILED: "studio.import.errUpload", FILE_TIMEOUT: "studio.import.errUpload",
    ASR_TIMEOUT: "studio.import.errOverloaded", ASR_BAD_JSON: "studio.import.errExtractBadJson",
    NO_SPEECH: "studio.import.errNoSpeech",
    // W2-S5a — captions parsing path
    CAPTIONS_EMPTY: "studio.import.errCaptionsEmpty",
    CAPTIONS_NO_TIMESTAMPS: "studio.import.errCaptionsNoTimestamps",
    CAPTIONS_UNPARSEABLE: "studio.import.errCaptionsUnparseable",
    CAPTIONS_TOO_MANY: "studio.import.errCaptionsTooMany",
  };
  function errKey(code) { return ERROR_KEY[code] || "studio.import.errGeneric"; }

  function open() {
    var m = $("v3ImportModal");
    if (m) m.classList.remove("hidden");
    var pw = $("v3ImportPreviewWrap");
    if (pw) pw.hidden = true;
    var ai = $("v3ImportAudioInfo");
    if (ai) ai.hidden = true;
    pendingAudio = null;
    // MINOR (whole-branch review 2026-07-28): reopening the dialog after a captions-paste
    // import showed the PREVIOUS paste sitting in the textarea — clear it, matching the
    // pendingAudio reset just above.
    var cp = $("v3ImportCaptionsPaste");
    if (cp) cp.value = "";
    // W2-S5a.1 T2: same staleness trap for the video-tab URL field — a value left over from a
    // previous auto-switch (fetchUrlOrVideo()) must not greet the user on the next open().
    var vu = $("v3ImportVideoUrl");
    if (vu) vu.value = "";
    // Tab always resets to "url" on open() — not persisted anywhere (not localStorage, not a
    // module var), so the dialog is predictable on every open, per task-2-brief.md.
    switchTab("url");
  }
  function close() {
    var m = $("v3ImportModal");
    if (m) m.classList.add("hidden");
    // W2-S5a: this modal owns ytAdapter's lifetime (it created it in mountVideo()) — every path
    // that hides the modal (Cancel, backdrop click, post-commit close() at the end of useText())
    // funnels through here. teardownVideo() is the single teardown point, shared with switchTab()
    // leaving the Video tab (T2-fix) — leaving the player live would keep a YouTube iframe (and
    // possibly playing audio) mounted indefinitely.
    teardownVideo();
    pendingCaptions = null;
  }

  async function fetchUrl() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    setBusy(true); setStatus("studio.import.working");
    try {
      var r = await postJson("/api/ingest/fetch-url", { url: url });
      showPreview({ kind: "url", source: r.sourceUrl, method: r.method, model: null, warnings: r.warnings || [], text: r.text });
    } catch (e) { setStatus(errKey(e.code)); }
    finally { setBusy(false); }
  }

  function kindForFile(file) {
    var name = (file.name || "").toLowerCase();
    if (name.endsWith(".docx")) return { kind: "docx", mimeType: file.type || "application/octet-stream" };
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return { kind: "pdf", mimeType: "application/pdf" };
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { kind: "image", mimeType: file.type };
    return null;
  }

  function onFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = ""; // тот же файл можно выбрать повторно
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var k = kindForFile(file);
    if (!k) { setStatus("studio.import.errBadFile"); return; }
    var needsKey = k.kind !== "docx";
    var key = needsKey && (typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "");
    if (needsKey && !key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true); setStatus("studio.import.working");
    var reader = new FileReader();
    reader.onerror = function () { setBusy(false); setStatus("studio.import.errGeneric"); };
    reader.onload = async function () {
      try {
        var b64 = String(reader.result).split(",")[1] || "";
        var body = { kind: k.kind, mimeType: k.mimeType, dataBase64: b64, filename: file.name };
        if (needsKey) body.geminiApiKey = key;
        var r = await postJson("/api/ingest/extract-file", body);
        showPreview({ kind: k.kind, source: file.name, method: r.method, model: r.model, warnings: r.warnings || [], text: r.text });
      } catch (e) { setStatus(errKey(e.code)); }
      finally { setBusy(false); }
    };
    reader.readAsDataURL(file);
  }

  async function useText() {
    if (!pending) return;
    var text = ($("v3ImportPreview").value || "").trim(); // пользователь мог поправить в превью — это ок
    if (!text) { setStatus("studio.import.errEmpty"); return; }
    var audioMetaForImport = null;
    if (pending.kind === "audio" && pendingAudio && pendingAudio.validation) {
      var lines = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var v = pendingAudio.validation;
      var editedAway = lines.length !== v.segments.length;
      var segs = editedAway
        ? lines.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
        : v.segments.map(function (s, k) { return { i: k, start: s.start, text: lines[k] }; });
      var dropReason = editedAway ? "PREVIEW_EDITED" : (v.timingOk ? null : v.dropReason);
      var fileName = window.MediaStore.mediaFileName(pendingAudio.sha256, pendingAudio.mime, pendingAudio.name);
      // OPFS-запись; недоступна (старый Safari) → session-only blob + честный warning
      window.v3SessionMediaBlob = null;
      var saved = window.MediaStore.canWrite()
        ? await window.MediaStore.saveMedia(pendingAudio.buf, fileName)
        : { ok: false, reason: "NO_CREATE_WRITABLE" };
      audioMetaForImport = {
        v: 1,
        media: { opfsPath: saved.ok ? fileName : null, sessionOnly: !saved.ok, sha256: pendingAudio.sha256,
                 mime: pendingAudio.mime, sizeBytes: pendingAudio.file.size,
                 durationSec: pendingAudio.durationSec, originalName: pendingAudio.name },
        asr: { method: "gemini-asr", model: window.AsrTranscript.ASR_MODEL, at: new Date().toISOString(),
               language: pendingAudio.parsed.language, filesApi: true, warnings: pendingAudio.parsed.warnings,
               windows: pendingAudio.asrWindows || null,
               coverageGaps: pendingAudio.coverageGaps || [],
               healedGaps: pendingAudio.healedGaps || [] },
        segments: segs, timing: null, timingDropReason: dropReason,
      };
      if (!saved.ok) window.v3SessionMediaBlob = pendingAudio.file;
      if (editedAway) toast("studio.import.audioTimingDropped", "warning");
    }
    var captionsMetaForImport = null;
    if (pending.kind === "captions" && pendingCaptions && pendingCaptions.parsed) {
      var cl = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var ps = pendingCaptions.parsed.segments;
      var cEdited = cl.length !== ps.length;
      captionsMetaForImport = {
        v: 1,
        captions: { origin: pendingCaptions.origin, format: pendingCaptions.parsed.format,
                    kindHint: pendingCaptions.parsed.kindHint,
                    kindEvidence: pendingCaptions.parsed.rolling ? "vtt-rolling"
                                : (pendingCaptions.parsed.format === "vtt" || pendingCaptions.parsed.format === "srt" ? "vtt-plain" : "none"),
                    language: pendingCaptions.parsed.language, fileName: pendingCaptions.fileName,
                    at: new Date().toISOString(), droppedHeadings: pendingCaptions.parsed.droppedHeadings,
                    warnings: pending.warnings || [] },
        video: pendingCaptions.video || undefined,
        segments: cEdited ? cl.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
                          : ps.map(function (s, k) { return { i: k, start: s.start, text: cl[k] }; }),
        timing: null,
        timingDropReason: cEdited ? "PREVIEW_EDITED" : null,
      };
      if (cEdited) toast("studio.import.audioTimingDropped", "warning");
    }
    var input = $("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true })); // пусть существующие слушатели Студии отработают
    window.v3LastImportMeta = {
      kind: pending.kind, source: pending.source, method: pending.method, model: pending.model,
      warnings: pending.warnings, at: new Date().toISOString(), textSnapshot: text,
      audio: audioMetaForImport || undefined,
      captions: captionsMetaForImport || undefined,
    };
    close();
    toast(pending.warnings && pending.warnings.length ? "studio.import.warnCheck" : "studio.import.done",
          pending.warnings && pending.warnings.length ? "warning" : "success");
  }

  // W2-S11: «→ В поле ввода» + сразу открыть модал пересказа (шорткат превью импорта).
  async function useTextAndRetell() {
    var t2 = ($("v3ImportPreview").value || "").trim();
    if (!t2) { setStatus("studio.import.errEmpty"); return; }
    await useText(); // штатное приземление С паспортом импорта (derivedFrom возьмёт его)
    if (window.StudioRetell) window.StudioRetell.openFromComposer();
  }

  // W2-S5a — Классификация URL: ссылка на YouTube уходит в ветку S5a, а НЕ в
  // /api/ingest/fetch-url — тот вернул бы либо EXTRACT_EMPTY, либо мусор из SPA-шелла (разведка
  // 2026-07-27).
  // W2-S5a.1 T2: explicit tabs cost a click (owner-accepted trade-off) — this compensates. A
  // YouTube link pasted into the ARTICLE field is rescued instead of sent to fetch-url: carry
  // the value into the Video tab's own field, switch there, explain why in the status line, then
  // mount exactly as the Video tab's own button (mountVideoFromField()) would.
  async function fetchUrlOrVideo() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    var vid = window.StudioYtPlayer && window.StudioYtPlayer.parseVideoId(url);
    if (!vid) return fetchUrl();
    var vf = $("v3ImportVideoUrl");
    if (vf) vf.value = url;
    switchTab("video");
    setStatus("studio.import.switchedToVideo");
    // IMPORTANT 3 (review 2026-07-27): fetchUrl() already disables #v3ImportUrlBtn for the
    // duration of its request (setBusy(true)/finally(false)) — mountVideo()'s create() is just
    // as async (real network + YouTube IFrame API boot) and was missing the same guard. Without
    // it, a second submit while the first create() is in flight races in: ytAdapter is still
    // null (mountVideo()'s own `if (ytAdapter)` destroy-guard hasn't been assigned yet), so BOTH
    // create() calls land in the same #v3ImportYtMount and whichever resolves first is silently
    // orphaned when the second overwrites `ytAdapter`. Disabling the button prevents the second
    // click from ever firing in the first place — same mechanism fetchUrl() already relies on.
    setBusy(true);
    try { await mountVideo(vid, url); }
    finally { setBusy(false); }
  }

  // W2-S5a.1 T2 — the Video tab's own button: mounts directly from #v3ImportVideoUrl, and
  // refuses a non-YouTube string with an honest error (studio.import.errNotVideoUrl) rather than
  // silently doing nothing.
  async function mountVideoFromField() {
    var url = ($("v3ImportVideoUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    var vid = window.StudioYtPlayer && window.StudioYtPlayer.parseVideoId(url);
    if (!vid) { setStatus("studio.import.errNotVideoUrl"); return; }
    setBusy(true); setStatus(null);
    try { await mountVideo(vid, url); }
    finally { setBusy(false); }
  }

  // IMPORTANT 1 (whole-branch review 2026-07-28, FOUR rounds — see history below): YouTube's
  // captions module — the thing getOption("captions","tracklist") reads — can finish loading
  // around ANY player state transition, not on a fixed schedule and not only around PLAYING, and
  // can populate SILENTLY after a transition with no further event marking the moment it happens.
  // Only a genuine PLAYING observation (+ grace window, still empty) licenses concluding absence.
  // Four measurements shaped this function:
  //   1. task-8-report.md: a video with 64 real tracks read tracklist().length === 0 at onReady
  //      AND right after calling play(), populating ~300-500ms into REAL playback. v1 gated the
  //      one-shot upgrade on 'play' + a grace delay — reasonable, but ONLY handled the positive
  //      case fast; a video that BUFFERS (state 3, never reaching PLAYING) never fires 'play', so
  //      the upgrade never ran even though the tracklist was already populated. v2 added a bounded
  //      poll to catch that.
  //   2. Prod v3.11.251, immediately after v2 shipped: mounting iG9CE55wbtY and leaving it CUED
  //      (state 5, never pressed play) — the poll's OWN schedule exhausted, found nothing, and
  //      v2 treated that exhaustion as confirmation of absence. That video has 64 tracks including
  //      manual Hebrew. An empty tracklist means NOTHING until playback has actually had the
  //      chance to populate it — exhausting a timer is not that chance. v2 reintroduced the exact
  //      "тихий 0 ≠ реальный 0" trap this function exists to prevent, through a different door. v3
  //      fixed it by giving the poll and a play-gated check asymmetric authority (poll: upgrade
  //      only; play+grace: the only path allowed to conclude absence) — this part is unchanged.
  //   3. Prod v3.11.251 again, immediately after v3 shipped: pressed play, the player went to
  //      BUFFERING and STAYED there (currentTime stuck at 0) — 'play' fires only for state 1
  //      (PLAYING), never for state 3, so v3's ONLY upgrade-triggering event besides the bounded
  //      poll never fired. tracklist() had all 64 tracks while BUFFERING; the poll's four ticks
  //      had already run out (empty) in the window BEFORE play was pressed. The answer was sitting
  //      there, unread, because nothing re-checked after the state changed. v4 added "statechange"
  //      (studio-yt-player.js forwards EVERY YT.PlayerState transition, not only the three that
  //      already had named events) and one immediate re-check per transition.
  //   4. Prod v3.11.251 again, immediately after v4 shipped: mount at t=0 (ladder's four ticks all
  //      land empty — nothing has played yet), play pressed at t≈12s produces exactly ONE
  //      statechange (the transition INTO BUFFERING) — tracklist still empty at THAT instant.
  //      YouTube populated it a couple of seconds later, SILENTLY, no further transition (the
  //      player just sits in BUFFERING) — so v4's single immediate check at the moment of the
  //      event had nothing to find yet, and nothing checked again afterwards. tracklist() reached
  //      64 tracks and stayed unread.
  // v5 (this version) re-arms the SAME bounded ladder on every "statechange", not just one
  // immediate look — see armCaptionsPoll() below. The authority split from v3 is otherwise
  // UNCHANGED:
  //   - The bounded poll AND every "statechange" may ONLY ever UPGRADE the hint (write the moment
  //     tracklist() is non-empty) — neither can conclude absence. If the video is never played,
  //     the hint rests on "not reported yet" for as long as the dialog stays open — indefinitely.
  //   - Only a real 'play' event (PLAYING specifically), plus RE_CONFIRM_DELAY_MS grace, may
  //     conclude absence — because "playback genuinely started AND the captions module still
  //     reports nothing" is an actual observation, not a timeout. This is the ONLY place
  //     describeTracks(list, true) may be called with an EMPTY list.
  //   - Once upgraded, `upgraded` latches true — no later empty read, from any trigger, may
  //     downgrade a real tracklist back to pending or absence.
  //   - Still bounded, never an unconditional background loop: each arm is the same four capped
  //     ticks (CAPTIONS_POLL_DELAYS_MS), and a fresh arm always cancels any ladder already in
  //     flight first — two rapid state changes can never leave two ladders running at once.
  var CAPTIONS_POLL_DELAYS_MS = [1000, 3000, 6000, 10000]; // upgrade-only — see above
  var RE_CONFIRM_DELAY_MS = 800; // extra nudge after a real 'play' — YouTube's own captions module
                                  // measured populating ~300-500ms into real playback; this leaves
                                  // headroom before the ONLY check allowed to conclude absence.

  // W2-S5a.1 T3 — guided "how to fetch captions" instructions (id="v3ImportCaptionsHow" in the
  // markup, hidden by default). Shown once the embedded player has actually mounted (independent
  // of whether it has reported tracks yet — task-3-brief.md Step 2), hidden on close()/re-mount.
  // href is built ONLY from an id that passes VIDEO_ID_RE (the same shape StudioYtPlayer.
  // parseVideoId already validated) — never from a raw user-typed string.
  function showCaptionsHow(show, videoId) {
    var box = $("v3ImportCaptionsHow");
    var link = $("v3ImportOpenYt");
    var valid = !!show && typeof videoId === "string" && VIDEO_ID_RE.test(videoId);
    if (box) box.hidden = !valid;
    if (link) {
      if (valid) link.href = "https://www.youtube.com/watch?v=" + videoId;
      else link.removeAttribute("href");
    }
  }

  async function mountVideo(videoId, url) {
    var mount = $("v3ImportYtMount"), hint = $("v3ImportYtHint");
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.video = { platform: "youtube", videoId: videoId, url: url };
    if (ytAdapter) { window.StudioYtPlayer.destroy(ytAdapter); ytAdapter = null; }
    clearCaptionsPoll(); // a fresh mount invalidates any previous video's still-running schedule
    mount.innerHTML = "";
    showCaptionsHow(false); // reset — a fresh mount attempt invalidates any previous video's link
    var cap = window.StudioYtPlayer.capability();
    if (!cap.supported) { mount.hidden = true; hint.textContent = tr("studio.import.captionsNoPlayer"); return; }
    mount.hidden = false;
    hint.textContent = tr("studio.import.captionsPlayerLoading");
    // W2-S5a.1 T3 (pre-existing race, flagged by task-2-report.md, fixed here): close() can run
    // while create()'s network + IFrame-API boot is still in flight. Without a guard, that stale
    // continuation would reassign the module-level ytAdapter and repaint #v3ImportYtHint after the
    // dialog is already gone. Same mechanism as the tryUpgrade() guard below (`ytAdapter !==
    // thisAdapter`) — captured BEFORE the await so it survives suspension across close()'s
    // mountGen++.
    var myGen = ++mountGen;
    try {
      var created = await window.StudioYtPlayer.create(mount, videoId);
      if (myGen !== mountGen) { window.StudioYtPlayer.destroy(created); return; } // superseded meanwhile
      ytAdapter = created;
      var thisAdapter = ytAdapter;
      var initialList = thisAdapter.tracklist();
      hint.textContent = describeTracks(initialList, /* confirmed */ false);
      showCaptionsHow(true, videoId);

      // T2-fix3 (whole-branch review — prod v3.11.251, gap found AFTER the T2-fix2 poll shipped):
      // `confirmAbsence` is the ONLY thing that may let this write an EMPTY, confirmed result.
      // The poll (below) always calls with confirmAbsence=false — it can only ever upgrade to a
      // POSITIVE result, never conclude absence. Only the 'play'-triggered check (further below)
      // calls with confirmAbsence=true, and only after real playback + a grace window. `upgraded`
      // makes this write AT MOST ONCE per mount either way.
      var upgraded = initialList.length > 0; // already informative — nothing left to poll for
      var tryUpgrade = function (confirmAbsence) {
        if (upgraded || ytAdapter !== thisAdapter) return; // done, or superseded meanwhile
        var list = thisAdapter.tracklist();
        if (list.length) {
          upgraded = true;
          clearCaptionsPoll();
          hint.textContent = describeTracks(list, /* confirmed */ true);
        } else if (confirmAbsence) {
          // Real playback started, grace window passed, tracklist is STILL empty — a genuine
          // observation, not a timeout. This is the only branch allowed to conclude "no captions".
          upgraded = true;
          clearCaptionsPoll();
          hint.textContent = describeTracks(list, /* confirmed */ true); // → captionsTracksNone
        }
        // else: empty AND not allowed to conclude absence — do nothing. The hint rests on "not
        // reported yet" for as long as it takes, even if that's forever (video never played).
      };
      // T2-fix5 (whole-branch review — fourth prod round): a single check per state change (fix4)
      // still missed the case measured live: mount at t=0 (ladder's four ticks all land empty —
      // nothing has played yet), play pressed at t≈12s → exactly ONE statechange (the transition
      // INTO BUFFERING), tracklist still empty at that instant, then YouTube populates it a couple
      // of seconds later SILENTLY — the player just sits in BUFFERING, no further transition, no
      // further event, nothing left to trigger a re-check. Fix: re-arm the SAME bounded ladder on
      // every statechange, not just take one immediate look. armCaptionsPoll() always cancels any
      // ladder already in flight (clearCaptionsPoll()) before scheduling a fresh one, so two rapid
      // triggers can never leave two ladders running — the second call's clear always wins before
      // either ladder's first tick (1s) could fire. Bounded, not unbounded: each arm is still
      // exactly the same four capped ticks: it costs nothing when nothing happens, and re-arms
      // only in response to a real event, never as an unconditional background loop.
      var armCaptionsPoll = function () {
        if (upgraded || ytAdapter !== thisAdapter) return; // nothing left to check for
        clearCaptionsPoll(); // cancel any ladder already in flight — never stack two
        CAPTIONS_POLL_DELAYS_MS.forEach(function (ms) {
          captionsPollTimers.push(setTimeout(function () { tryUpgrade(false); }, ms)); // upgrade-only, never
        });
      };
      armCaptionsPoll(); // the initial ladder, right after mount
      var onStateChange = function () {
        tryUpgrade(false); // an immediate look — the state change itself might already carry the answer
        armCaptionsPoll(); // AND re-arm — the answer may also arrive silently a few ticks later,
                            // with no further event of its own (the exact case above)
      };
      thisAdapter.addEventListener("statechange", onStateChange);
      var onPlay = function () {
        thisAdapter.removeEventListener("play", onPlay); // one real confirmation is enough as a trigger
        setTimeout(function () { tryUpgrade(true); }, RE_CONFIRM_DELAY_MS); // the ONLY confirmAbsence=true call
      };
      thisAdapter.addEventListener("play", onPlay);
    } catch (e) {
      if (myGen !== mountGen) return; // dialog closed / a newer mount started while we awaited
      mount.hidden = true;
      hint.textContent = tr(e && e.code === "YT_EMBED_DENIED"
        ? "studio.import.captionsEmbedDenied" : "studio.import.captionsNoPlayer");
    }
  }

  // R9: сообщаем, ЧТО есть у ролика — это свидетельство о дорожках, а не о принесённом файле.
  // `confirmed` is moot when `list` is non-empty (a real track IS its own confirmation, regardless
  // of how it was found — poll or play). `confirmed=true` with an EMPTY list is a claim of genuine
  // absence — mountVideo() must only ever make that specific call from its play-triggered check
  // (real playback + grace window), NEVER from the bounded poll (which may only upgrade, never
  // conclude absence — see IMPORTANT 1 above mountVideo()). An empty list with confirmed=false
  // means "not reported yet", and may rest that way indefinitely if the video is never played.
  function describeTracks(list, confirmed) {
    var r = chooseTrackHint(list, confirmed);
    // Bug (whole-branch review 2026-07-28, MINOR): `r.langs ? {...} : null` treated an EMPTY
    // string the same as "no langs field at all" — t()'s {param} replace() is skipped entirely
    // when params is null, so an all-nameless track list leaked the literal "{langs}" into the
    // UI. `.langs` is only ever present (possibly "") on the NoHe branch, so testing `!== undefined`
    // distinguishes "this key has no {langs} placeholder" from "it does, and it's empty".
    var msg = tr(r.key, r.langs !== undefined ? { langs: r.langs } : null);
    if (r.more) {
      var locale = (typeof window.appGetLocale === "function") ? window.appGetLocale() : "ru";
      var cat = pluralCategory(r.more, locale); // "one" | "few" | "many" — see pluralCategory()
      var moreKey = "studio.import.captionsTracksMore" + cat[0].toUpperCase() + cat.slice(1);
      msg += "\n" + tr(moreKey, { n: r.more });
    }
    return msg;
  }

  function acceptCaptions(parsed, origin, fileName) {
    if (!parsed.ok) { setStatus(errKey(parsed.error_code)); return; }
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.parsed = parsed;
    pendingCaptions.origin = origin;
    pendingCaptions.fileName = fileName || null;
    var warn = [];
    if (parsed.kindHint === "auto") warn.push("AUTO_CAPTIONS");
    if (parsed.droppedHeadings > 0) warn.push("HEADINGS_DROPPED");
    showPreview({
      kind: "captions", source: fileName || tr("studio.import.captionsSourcePaste"),
      method: origin === "file" ? "captions-file" : "captions-panel", model: null,
      warnings: warn,
      text: parsed.segments.map(function (s) { return s.text; }).join("\n"),
    });
  }

  function onCaptionsFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var reader = new FileReader();
    reader.onerror = function () { setStatus("studio.import.errGeneric"); };
    reader.onload = function () {
      acceptCaptions(window.CaptionsParse.parse(String(reader.result || "")), "file", file.name);
    };
    reader.readAsText(file, "utf-8");
  }

  function useCaptionsPaste() {
    var raw = ($("v3ImportCaptionsPaste").value || "");
    if (!raw.trim()) { setStatus("studio.import.errCaptionsEmpty"); return; }
    acceptCaptions(window.CaptionsParse.parse(raw), "paste", null);
  }

  window.StudioImport = { open: open, close: close, switchTab: switchTab,
                           fetchUrl: fetchUrl, fetchUrlOrVideo: fetchUrlOrVideo, mountVideoFromField: mountVideoFromField,
                           onFileChosen: onFileChosen, onAudioChosen: onAudioChosen, transcribeAudio: transcribeAudio,
                           onCaptionsFileChosen: onCaptionsFileChosen, useCaptionsPaste: useCaptionsPaste,
                           useText: useText, useTextAndRetell: useTextAndRetell,
                           chooseTrackHint: chooseTrackHint, runWindowedAsr: runWindowedAsr };
})();
