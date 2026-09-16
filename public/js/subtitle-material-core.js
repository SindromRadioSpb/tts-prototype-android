// Pure core for learning materials built from the subtitle tracks of a local video.
// No DOM, network, storage or provider access: the browser passes parsed cues in, gets rows out.
// Companion evidence (language, title, dispositions) comes from media-track-inventory-v1.
(function () {
  "use strict";

  // Subtitle files wrap RTL lines in bidi controls and carry ASS/HTML styling. None of it is
  // learning text: it breaks lookups, cloze keys and comparison, so it is stripped once, here.
  var CONTROL_CHARS_RE = /[‎‏‪-‮⁦-⁩﻿؜]/g;
  var ASS_TAG_RE = /\{[^}]*\}/g;
  var HTML_TAG_RE = /<[^>]*>/g;
  var MARK_RE = /\[([^\]]*)\]/g;
  var DIALOGUE_DASH_RE = /^\s*[-–—]\s*/;
  var SENTENCE_END_RE = /[.!?…׃:]["'”»)\]]*\s*$/;
  var DEFAULT_MIN_OVERLAP = 0.3;
  var DEFAULT_MAX_GAP_SEC = 1.0;
  var DEFAULT_MAX_ROW_CUES = 3;
  var DEFAULT_MAX_ROW_CHARS = 200;
  var TRANSLATION_MIN_COVERAGE = 0.85;
  var BRACKET_CALIBRATION_MIN = 0.8;
  var FORCED_SUBSET_MAX_SHARE = 0.7;
  var FORCED_SUBSET_MIN_OVERLAP = 0.9;
  var SDH_MIN_DESCRIPTION_SHARE = 0.15;
  var SDH_CONTENT_MIN_ALIGNMENT = 0.5;
  // Companion outcome that means the container has no single obvious learning-language audio track.
  var AUDIO_CHOICE_OUTCOME = "AUDIO_STREAM_CHOICE_REQUIRED";

  var FORCED_TITLE_RE = /forced|форс|מאולצ/i;
  var SDH_TITLE_RE = /\bsdh\b|\bcc\b|hearing|слабослыш|לקויי שמיעה/i;
  // Spoken-language marks subtitlers write inside brackets, in the three interface languages.
  var LANGUAGE_MARKS = [
    { code: "ar", re: /בערבית|по-?арабски|на арабском|in arabic|arabic/i },
    { code: "en", re: /באנגלית|по-?английски|на английском|in english|english/i },
    { code: "ru", re: /ברוסית|по-?русски|на русском|in russian|russian/i },
    { code: "fr", re: /בצרפתית|по-?французски|in french|french/i },
    { code: "de", re: /בגרמנית|по-?немецки|in german|german/i },
    { code: "es", re: /בספרדית|по-?испански|in spanish|spanish/i },
    { code: "am", re: /באמהרית|амхарск|amharic/i },
    { code: "yi", re: /ביידיש|идиш|yiddish/i },
    { code: "he", re: /בעברית|на иврите|in hebrew|hebrew/i },
  ];
  var SCRIPTS = [
    { code: "he", re: /[֐-׿]/g },
    { code: "ar", re: /[؀-ۿݐ-ݿ]/g },
    { code: "cyrillic", re: /[Ѐ-ӿ]/g },
    { code: "latin", re: /[A-Za-z]/g },
  ];

  function text(value) { return value == null ? "" : String(value); }
  function seconds(value) { var number = Number(value); return Number.isFinite(number) ? number : 0; }

  function normalizeCueText(raw, options) {
    var opts = options || {};
    var source = text(raw).replace(CONTROL_CHARS_RE, "").replace(ASS_TAG_RE, "").replace(HTML_TAG_RE, "");
    var marks = [];
    source.replace(MARK_RE, function (_whole, inner) { marks.push(inner.trim()); return ""; });
    var turns = 0;
    // Marks are removed after the lines are joined: a bracket often opens on one line of a cue
    // and closes on the next, so a per-line pass would leave both brackets in the learning text.
    var joined = source.split(/\r?\n/).map(function (line) {
      if (DIALOGUE_DASH_RE.test(line)) turns += 1;
      return line.replace(DIALOGUE_DASH_RE, "");
    }).join(" ");
    var cleaned = joined.replace(MARK_RE, " ").replace(/\s+/g, " ").trim();
    // In a translation track a whole cue is often bracketed to mark foreign speech; the words
    // inside are the translation itself, so the caller can ask to keep them.
    if (!cleaned && marks.length && opts.keepWholeMarkText) cleaned = marks.join(" ").replace(/\s+/g, " ").trim();
    if (!turns && cleaned) turns = 1;
    return { text: cleaned, marks: marks.filter(Boolean), turns: turns };
  }

  function detectScriptLanguage(value) {
    var source = text(value).replace(CONTROL_CHARS_RE, "");
    var best = null, bestCount = 0;
    SCRIPTS.forEach(function (script) {
      var matches = source.match(script.re);
      var count = matches ? matches.length : 0;
      if (count > bestCount) { best = script.code; bestCount = count; }
    });
    return bestCount > 0 ? best : null;
  }

  function namedLanguage(values) {
    for (var i = 0; i < values.length; i++) {
      var candidate = text(values[i]);
      for (var k = 0; k < LANGUAGE_MARKS.length; k++) {
        if (LANGUAGE_MARKS[k].re.test(candidate)) return LANGUAGE_MARKS[k].code;
      }
    }
    return null;
  }

  function overlapShare(a, b) {
    var intersection = Math.min(seconds(a.end), seconds(b.end)) - Math.max(seconds(a.start), seconds(b.start));
    if (intersection <= 0) return 0;
    var shortest = Math.min(seconds(a.end) - seconds(a.start), seconds(b.end) - seconds(b.start));
    return shortest > 0 ? intersection / shortest : 0;
  }
  function overlaps(a, b, minimum) { return overlapShare(a, b) >= (minimum == null ? DEFAULT_MIN_OVERLAP : minimum); }

  function isBracketOnly(cue) {
    var normalized = normalizeCueText(cue && cue.text);
    return normalized.marks.length > 0 && !normalized.text;
  }

  // A bracket-only cue is a sound description only where nobody is speaking. The same shape over
  // dialogue is a spoken-line marker ("[in Arabic]"), which a translation track uses heavily.
  function isSoundDescription(cue, referenceCues) {
    if (!isBracketOnly(cue)) return false;
    var reference = Array.isArray(referenceCues) ? referenceCues : [];
    return !reference.some(function (candidate) { return overlaps(cue, candidate); });
  }

  function trackCues(track) { return Array.isArray(track && track.cues) ? track.cues : []; }

  function classifyTracks(tracks) {
    var all = Array.isArray(tracks) ? tracks : [];
    // The fullest track of the material is the dialogue timeline every other track is read against.
    var dialogueReference = all.slice().sort(function (a, b) { return trackCues(b).length - trackCues(a).length; })[0] || null;
    var list = all.map(function (track) {
      var disposition = track.disposition || {};
      var cues = trackCues(track);
      var language = track.language || null;
      var languageEvidence = language ? "tag" : null;
      if (!language) {
        var script = detectScriptLanguage(cues.map(function (cue) { return cue.text; }).join(" "));
        if (script === "he" || script === "ar") { language = script; languageEvidence = "script"; }
        else if (script) languageEvidence = "script_ambiguous";
      }
      var forcedEvidence = disposition.forced ? "disposition"
        : (FORCED_TITLE_RE.test(text(track.title)) ? "title" : null);
      var referenceCues = trackCues(dialogueReference === track ? null : dialogueReference);
      var alignedCues = cues.filter(function (cue) {
        return referenceCues.some(function (candidate) { return overlaps(cue, candidate); });
      }).length;
      // A track that barely meets the dialogue timeline (a desynced or unrelated file) gives no
      // interpretable content signal at all, so no content verdict is invented for it.
      var contentReadable = cues.length > 0 && referenceCues.length > 0
        && alignedCues / cues.length >= SDH_CONTENT_MIN_ALIGNMENT;
      var descriptions = cues.filter(function (cue) { return isSoundDescription(cue, referenceCues); }).length;
      var sdhEvidence = disposition.hearing_impaired ? "disposition"
        : SDH_TITLE_RE.test(text(track.title)) ? "title"
        : (contentReadable && descriptions / cues.length >= SDH_MIN_DESCRIPTION_SHARE ? "sound_description_share" : null);
      return {
        index: track.index,
        title: track.title == null ? null : track.title,
        disposition: disposition,
        cues: cues,
        language: language,
        language_evidence: languageEvidence,
        forced: !!forcedEvidence,
        forced_evidence: forcedEvidence,
        sdh: !!sdhEvidence,
        sdh_evidence: sdhEvidence,
      };
    });
    // A forced track can be nameless and unflagged; then it is recognisable only by being a small
    // time-subset of a fuller track in the same language.
    list.forEach(function (track) {
      if (track.forced || track.sdh || !track.cues.length) return;
      var host = list.find(function (other) {
        if (other === track || other.language !== track.language) return false;
        if (!other.cues.length || track.cues.length > other.cues.length * FORCED_SUBSET_MAX_SHARE) return false;
        var covered = track.cues.filter(function (cue) {
          return other.cues.some(function (candidate) { return overlaps(cue, candidate); });
        }).length;
        return covered / track.cues.length >= FORCED_SUBSET_MIN_OVERLAP;
      });
      if (host) { track.forced = true; track.forced_evidence = "subset_of_track_" + host.index; }
    });
    return list;
  }

  function alignTranslation(textCues, translationCues, options) {
    var opts = options || {};
    var minimum = opts.minOverlap == null ? DEFAULT_MIN_OVERLAP : opts.minOverlap;
    var source = Array.isArray(textCues) ? textCues : [];
    var target = Array.isArray(translationCues) ? translationCues : [];
    var pairs = source.map(function (cue, index) {
      var matched = [];
      target.forEach(function (candidate, candidateIndex) {
        if (overlaps(cue, candidate, minimum)) matched.push(candidateIndex);
      });
      return { text_index: index, translation_indexes: matched, group_id: null };
    });
    var groups = [];
    target.forEach(function (_candidate, candidateIndex) {
      var owners = pairs.filter(function (pair) { return pair.translation_indexes.indexOf(candidateIndex) >= 0; });
      if (owners.length < 2) return;
      var groupId = "tgroup:" + candidateIndex;
      owners.forEach(function (pair) { pair.group_id = groupId; });
      groups.push({ group_id: groupId, translation_index: candidateIndex, text_indexes: owners.map(function (pair) { return pair.text_index; }) });
    });
    var covered = pairs.filter(function (pair) { return pair.translation_indexes.length > 0; }).length;
    return { pairs: pairs, groups: groups, coverage: source.length ? covered / source.length : 0 };
  }

  function selectTracks(input) {
    var opts = input || {};
    var targetLanguage = opts.targetLanguage || "he";
    var translationLanguage = opts.translationLanguage || null;
    var classified = classifyTracks(opts.tracks);
    var reasons = { text: null, translation: null };
    var textCandidates = classified.filter(function (track) {
      return track.language === targetLanguage && !track.forced && !track.sdh;
    });
    var signalTracks = classified.filter(function (track) { return track.language === targetLanguage && track.forced; });
    if (textCandidates.length !== 1) {
      reasons.text = textCandidates.length ? "target_language_ambiguous" : "target_language_missing";
      reasons.translation = "text_track_unresolved";
      return {
        status: "needs_choice", text_track: null, translation_track: null,
        signal_tracks: signalTracks, reasons: reasons,
        choices: textCandidates.sort(function (a, b) { return a.index - b.index; }),
      };
    }
    var textTrack = textCandidates[0];
    reasons.text = "target_language_full_track";
    var translationTrack = null;
    var candidates = translationLanguage
      ? classified.filter(function (track) { return track.language === translationLanguage && !track.forced && !track.sdh; })
      : [];
    if (!candidates.length) {
      reasons.translation = "translation_language_missing";
    } else {
      var best = null;
      candidates.forEach(function (candidate) {
        var coverage = alignTranslation(textTrack.cues, candidate.cues).coverage;
        if (!best || coverage > best.coverage) best = { track: candidate, coverage: coverage };
      });
      if (best && best.coverage >= TRANSLATION_MIN_COVERAGE) {
        translationTrack = best.track;
        reasons.translation = "translation_language_aligned";
      } else {
        reasons.translation = "translation_coverage_too_low";
      }
    }
    return {
      status: "ok", text_track: textTrack, translation_track: translationTrack,
      signal_tracks: signalTracks, reasons: reasons,
    };
  }

  function speechLanguage(textCues, options) {
    var opts = options || {};
    var cues = Array.isArray(textCues) ? textCues : [];
    var forcedCues = Array.isArray(opts.forcedCues) ? opts.forcedCues : [];
    var translationCues = Array.isArray(opts.translationCues) ? opts.translationCues : [];
    var bracketed = translationCues.filter(function (cue) {
      var normalized = normalizeCueText(cue.text);
      return normalized.marks.length > 0 && !normalized.text;
    });
    // The whole-cue bracket convention means different things in different releases. It counts
    // only when it agrees with this file's own forced track.
    var agreeing = bracketed.filter(function (cue) {
      return forcedCues.some(function (forced) { return overlaps(cue, forced); });
    }).length;
    var bracketsTrusted = !!(forcedCues.length && bracketed.length && agreeing / bracketed.length >= BRACKET_CALIBRATION_MIN);
    var verdicts = cues.map(function (cue) {
      var evidence = [];
      var overlappingForced = forcedCues.filter(function (forced) { return overlaps(cue, forced); });
      if (overlappingForced.length) evidence.push("forced_track");
      var markSources = [cue.text].concat(overlappingForced.map(function (forced) { return forced.text; }));
      var named = namedLanguage(markSources.map(function (value) { return normalizeCueText(value).marks.join(" "); }));
      if (named && named !== (opts.targetLanguage || "he")) evidence.push("language_mark");
      else if (named) named = null;
      if (bracketsTrusted && bracketed.some(function (candidate) { return overlaps(cue, candidate); })) {
        evidence.push("translation_brackets");
      }
      return {
        value: evidence.length ? "other" : "target_assumed",
        named: named || null,
        evidence: evidence,
      };
    });
    verdicts.calibration = {
      translation_brackets_trusted: bracketsTrusted,
      bracketed_translation_cues: bracketed.length,
      bracketed_agreeing_with_forced: agreeing,
    };
    return verdicts;
  }

  function buildRows(input) {
    var opts = input || {};
    var cues = Array.isArray(opts.textCues) ? opts.textCues : [];
    var verdicts = Array.isArray(opts.speechLanguage) ? opts.speechLanguage : [];
    var alignment = opts.translation || null;
    var translationCues = Array.isArray(opts.translationCues) ? opts.translationCues : [];
    var maxGap = opts.maxGapSec == null ? DEFAULT_MAX_GAP_SEC : opts.maxGapSec;
    var maxCues = opts.maxRowCues == null ? DEFAULT_MAX_ROW_CUES : opts.maxRowCues;
    var maxChars = opts.maxRowChars == null ? DEFAULT_MAX_ROW_CHARS : opts.maxRowChars;

    var groups = [];
    var current = null;
    cues.forEach(function (cue, index) {
      var normalized = normalizeCueText(cue.text);
      var verdict = verdicts[index] || { value: "target_assumed", named: null };
      var entry = { index: index, cue: cue, normalized: normalized, verdict: verdict };
      if (!current) { current = [entry]; groups.push(current); return; }
      var previous = current[current.length - 1];
      var gap = seconds(cue.start) - seconds(previous.cue.end);
      var continues = !SENTENCE_END_RE.test(previous.normalized.text)
        && gap <= maxGap
        && previous.verdict.value === verdict.value
        && current.length < maxCues
        && current.reduce(function (total, item) { return total + item.normalized.text.length; }, 0) + normalized.text.length <= maxChars;
      if (continues) current.push(entry);
      else { current = [entry]; groups.push(current); }
    });

    return groups.map(function (group, rowIndex) {
      var indexes = group.map(function (entry) { return entry.index; });
      var named = null;
      group.forEach(function (entry) { if (!named && entry.verdict.named) named = entry.verdict.named; });
      var translation = null, translationGroup = null;
      if (alignment && Array.isArray(alignment.pairs)) {
        var used = [];
        indexes.forEach(function (index) {
          var pair = alignment.pairs[index];
          if (!pair) return;
          if (pair.group_id && !translationGroup) translationGroup = pair.group_id;
          pair.translation_indexes.forEach(function (translationIndex) {
            if (used.indexOf(translationIndex) < 0) used.push(translationIndex);
          });
        });
        var parts = used.map(function (translationIndex) {
          var cue = translationCues[translationIndex];
          return cue ? normalizeCueText(cue.text, { keepWholeMarkText: true }).text : "";
        }).filter(Boolean);
        translation = parts.length ? parts.join(" ") : null;
      }
      return {
        index: rowIndex,
        start: seconds(group[0].cue.start),
        end: seconds(group[group.length - 1].cue.end),
        text: group.map(function (entry) { return entry.normalized.text; }).filter(Boolean).join(" "),
        source_cue_indexes: indexes,
        speech_language: group[0].verdict.value,
        speech_language_named: named,
        translation: translation,
        translation_group: translationGroup,
      };
    });
  }

  // One action per stream for the import screen: what happens to the picture, which audio track
  // is kept, which subtitle track becomes the text, where the translation comes from, and what a
  // phone-sized copy would be. A question appears only for a real ambiguity.
  function buildMaterialPlan(input) {
    var opts = input || {};
    var state = opts.readiness || {};
    var targetLanguage = opts.targetLanguage || "he";
    var translationLanguage = opts.translationLanguage || null;
    var selection = selectTracks({
      tracks: opts.tracks, targetLanguage: targetLanguage, translationLanguage: translationLanguage,
    });
    var questions = [];
    var audioSelection = state.audio_selection || null;
    var audioUnresolved = state.outcome === AUDIO_CHOICE_OUTCOME || !audioSelection;
    if (audioUnresolved) {
      questions.push({ kind: "audio", choices: (state.audio_choices || []).slice() });
    }
    var textTrack = selection.text_track;
    var status = "ready";
    var reason = null;
    if (!textTrack) {
      if (selection.reasons.text === "target_language_ambiguous") {
        status = "needs_choice";
        questions.push({
          kind: "text",
          choices: (selection.choices || []).map(function (track) {
            return { index: track.index, language: track.language, title: track.title, cue_count: trackCues(track).length };
          }),
        });
      } else {
        status = "blocked";
        reason = selection.reasons.text;
      }
    }
    if (audioUnresolved && status === "ready") status = "needs_choice";

    var mode = (state.plan && state.plan.mode) || null;
    var litePlan = state.lite_plan || null;
    var translationTrack = selection.translation_track;
    return {
      status: status,
      reason: reason,
      video: { action: mode ? (mode === "transcode" ? "transcode" : "copy") : "ready", mode: mode },
      audio: audioSelection ? Object.assign({}, audioSelection) : null,
      text: textTrack ? {
        index: textTrack.index, language: textTrack.language, title: textTrack.title,
        cue_count: trackCues(textTrack).length, reason: selection.reasons.text,
      } : null,
      translation: translationTrack ? {
        index: translationTrack.index, language: translationTrack.language, title: translationTrack.title,
        coverage: textTrack ? alignTranslation(trackCues(textTrack), trackCues(translationTrack)).coverage : 0,
        reason: selection.reasons.translation,
      } : null,
      translation_reason: selection.reasons.translation,
      signal_track_indexes: (selection.signal_tracks || []).map(function (track) { return track.index; }),
      lite: {
        available: !!litePlan,
        height: litePlan ? litePlan.height : null,
        max_output_bytes: litePlan ? litePlan.max_output_bytes : null,
        reason: litePlan ? null : (state.lite_reason || null),
      },
      size: {
        estimated_output_bytes: state.estimated_output_bytes == null ? null : state.estimated_output_bytes,
        estimated_time_seconds: state.estimated_time_seconds == null ? null : state.estimated_time_seconds,
      },
      plan_sha256: state.plan_sha256 || null,
      lite_plan_sha256: state.lite_plan_sha256 || null,
      questions: questions,
    };
  }

  var API = {
    CONTROL_CHARS_RE: CONTROL_CHARS_RE,
    buildMaterialPlan: buildMaterialPlan,
    normalizeCueText: normalizeCueText,
    detectScriptLanguage: detectScriptLanguage,
    classifyTracks: classifyTracks,
    selectTracks: selectTracks,
    alignTranslation: alignTranslation,
    speechLanguage: speechLanguage,
    buildRows: buildRows,
  };
  if (typeof window !== "undefined") window.SubtitleMaterialCore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
