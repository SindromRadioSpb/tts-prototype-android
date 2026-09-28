// Local-only derived columns for subtitle materials. The source and translation stay authoritative.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SubtitleMaterialVocalization = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function plain(text) {
    return String(text || "").normalize("NFD").replace(/[\u05b0-\u05c7\u0300-\u036f]/g, "")
      .normalize("NFC").replace(/\s+/g, " ").trim();
  }

  // Asked with this marker, the model keeps each mater lectionis and marks it; subtitles are
  // written in full spelling, so only then do its consonants match the source (O-032).
  // A rare sign, because a subtitle may carry its own asterisks.
  var MATRES_MARK = "¤";

  // Turn the marked full-spelling answer into ordinary pointed text: a qubbuts before a marked
  // vav becomes shuruk, a holam before a marked vav moves onto the vav, a holam doubled on the
  // letter and on its vav keeps only the vav's, and the markers go.
  function normalizeMatres(text) {
    var nfd = String(text || "").normalize("NFD");
    var letterWithMarks = /([א-ת])([֑-ׇ]*)ו([֑-ׇ]*)(¤?)/g;
    nfd = nfd.replace(letterWithMarks, function (whole, letter, marks, vavMarks, marker) {
      if (letter === "ו" && !marks) return whole;
      if (marker && marks.indexOf("ֻ") >= 0 && !vavMarks) {
        return letter + marks.replace("ֻ", "") + "וּ";
      }
      if (marker && marks.indexOf("ֹ") >= 0 && !vavMarks) {
        return letter + marks.replace("ֹ", "") + "וֹ";
      }
      if (!marker && marks.indexOf("ֹ") >= 0 && vavMarks === "ֹ") {
        return letter + marks.replace("ֹ", "") + "וֹ";
      }
      return whole;
    });
    return nfd.split(MATRES_MARK).join("").normalize("NFC");
  }

  function tokenKey(token) {
    return plain(token).replace(/[^\u05d0-\u05ea]/g, "");
  }

  function projectToken(source, result) {
    var sourceNfd = String(source).normalize("NFD"), resultNfd = String(result).normalize("NFD");
    var modelLetters = Array.from(resultNfd.matchAll(/[\u05d0-\u05ea][\u05b0-\u05c7]*/g));
    var position = 0, letter = 0, output = "";
    while (position < sourceNfd.length) {
      var character = sourceNfd[position++];
      if (/[\u05d0-\u05ea]/.test(character)) {
        var originalMarks = "";
        while (position < sourceNfd.length && /[\u05b0-\u05c7]/.test(sourceNfd[position])) originalMarks += sourceNfd[position++];
        var modelMatch = modelLetters[letter++];
        output += character + (modelMatch ? modelMatch[0].slice(1) || originalMarks : originalMarks);
      } else output += character;
    }
    return output.normalize("NFC");
  }

  // The model occasionally changes a consonant. Keep the subtitle's exact text and take marks
  // only from words whose unpointed Hebrew letters still match, in their original order.
  function projectVocalization(source, result) {
    var sourceParts = String(source).split(/(\s+)/), resultParts = String(result).split(/(\s+)/);
    var sourceWords = sourceParts.filter(function (part) { return part && !/^\s+$/.test(part); });
    var resultWords = resultParts.filter(function (part) { return part && !/^\s+$/.test(part); });
    var matches = [], i, j;
    if (sourceWords.length === resultWords.length) {
      for (i = 0; i < sourceWords.length; i++) matches[i] = i;
    } else {
      var dp = Array.from({ length: sourceWords.length + 1 }, function () { return Array(resultWords.length + 1).fill(0); });
      for (i = sourceWords.length - 1; i >= 0; i--) for (j = resultWords.length - 1; j >= 0; j--) {
        dp[i][j] = tokenKey(sourceWords[i]) && tokenKey(sourceWords[i]) === tokenKey(resultWords[j])
          ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
      i = 0; j = 0;
      while (i < sourceWords.length && j < resultWords.length) {
        if (tokenKey(sourceWords[i]) && tokenKey(sourceWords[i]) === tokenKey(resultWords[j])) {
          matches[i++] = j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
      }
    }
    var wordIndex = 0, matched = 0, total = 0;
    var text = sourceParts.map(function (part) {
      if (!part || /^\s+$/.test(part)) return part;
      var key = tokenKey(part), target = resultWords[matches[wordIndex++]];
      if (!key) return part;
      total++;
      if (!target || key !== tokenKey(target)) return part;
      matched++;
      return projectToken(part, target);
    }).join("");
    return { text: text, matched: matched, total: total };
  }

  async function enrich(rows, options) {
    var opts = options || {};
    if (!opts.client || typeof opts.client.vocalizeTexts !== "function" ||
        typeof opts.transliterate !== "function") throw new Error("LOCAL_VOCALIZATION_UNAVAILABLE");
    // The one visible column follows the Studio's profile, as on the Gemini path (O-033).
    var profile = ["learner-latin", "sbl", "ru-phonetic"].indexOf(opts.translitProfile) >= 0 ? opts.translitProfile : "learner-latin";
    var output = (Array.isArray(rows) ? rows : []).map(function (row) { return Object.assign({}, row); });
    var targetIndexes = [];
    output.forEach(function (row, index) {
      if (/[\u05d0-\u05ea]/.test(String(row.he || ""))) targetIndexes.push(index);
      else row.niqqud_status = "not_vocalized";
    });
    var warnings = [];
    for (var start = 0; start < targetIndexes.length; start += 16) {
      if (opts.signal && opts.signal.aborted) {
        var cancelled = new Error("MATERIAL_CANCELED");
        cancelled.code = "MATERIAL_CANCELED";
        throw cancelled;
      }
      var indexes = targetIndexes.slice(start, start + 16);
      var source = indexes.map(function (index) { return String(output[index].he || ""); });
      var result = await opts.client.vocalizeTexts(source, { markMatres: MATRES_MARK });
      if (!result || !Array.isArray(result.results) || result.results.length !== source.length) {
        throw new Error("LOCAL_VOCALIZATION_COUNT_MISMATCH");
      }
      indexes.forEach(function (index, offset) {
        var row = output[index], vocalized = normalizeMatres(String(result.results[offset] || "")).trim();
        var projected = vocalized && projectVocalization(row.he, vocalized);
        if (!projected || !projected.matched || plain(projected.text) !== plain(row.he)) {
          row.niqqud_status = "not_vocalized";
          // Transliteration remains deterministic even when the local model cannot safely
          // supply vowel points. It is less precise without them, but preserves the column.
          row.translit = String(opts.transliterate(row.he, profile) || "");
          row.translit_sbl = String(opts.transliterate(row.he, "sbl") || "");
          row.translit_ru = String(opts.transliterate(row.he, "ru-phonetic") || "");
          warnings.push({ segment_index: row.segment_index, reason: "VOCALIZATION_SOURCE_MISMATCH" });
          return;
        }
        row.niqqud = projected.text;
        row.he_niqqud = projected.text;
        row.niqqud_status = projected.matched === projected.total ? "local_model" : "partial_local_model";
        if (projected.matched !== projected.total) {
          warnings.push({ segment_index: row.segment_index, reason: "PARTIAL_VOCALIZATION", matched_words: projected.matched, total_words: projected.total });
        }
        row.niqqud_model_version = String(result.model_version || "");
        row.translit = String(opts.transliterate(projected.text, profile) || "");
        row.translit_sbl = String(opts.transliterate(projected.text, "sbl") || "");
        row.translit_ru = String(opts.transliterate(projected.text, "ru-phonetic") || "");
        if (!row.translit || !row.translit_ru) {
          warnings.push({ segment_index: row.segment_index, reason: "LOCAL_TRANSLITERATION_EMPTY" });
        }
      });
      if (typeof opts.onProgress === "function") opts.onProgress(Math.min(start + indexes.length, targetIndexes.length), targetIndexes.length);
    }
    return { rows: output, warnings: warnings, vocalized: targetIndexes.length - warnings.filter(function (w) { return w.reason === "VOCALIZATION_SOURCE_MISMATCH"; }).length };
  }

  // Dicta answers full spelling in defective spelling (לקראטה → לְקָרָטֶה, לסיבוב → לְסִבּוּב). Put its
  // points back on the subtitle's own letters: a mater lectionis (א ו י) the answer left out stays
  // unpointed, except a vav after holam or qubuts, which becomes holam male or shuruq. Any other
  // difference in letters means a different word, and nothing is taken.
  function fillMatres(source, answer) {
    var src = Array.from(String(source).normalize("NFD").matchAll(/([א-ת])([ְ-ׇ]*)|([^א-ת])/g));
    var dst = Array.from(String(answer).normalize("NFD").matchAll(/([א-ת])([ְ-ׇ]*)/g));
    var out = [], j = 0, lastLetter = -1;
    for (var i = 0; i < src.length; i++) {
      var m = src[i];
      if (!m[1]) { out.push(m[3]); continue; }
      if (j < dst.length && dst[j][1] === m[1]) {
        out.push(m[1] + dst[j][2]); lastLetter = out.length - 1; j++; continue;
      }
      if ("אוי".indexOf(m[1]) < 0 || lastLetter < 0) return null;
      var prev = out[lastLetter];
      if (m[1] === "ו" && prev.indexOf("ֹ") >= 0) { out[lastLetter] = prev.replace("ֹ", ""); out.push("וֹ"); }
      else if (m[1] === "ו" && prev.indexOf("ֻ") >= 0) { out[lastLetter] = prev.replace("ֻ", ""); out.push("וּ"); }
      else out.push(m[1]);
      lastLetter = out.length - 1;
    }
    return j === dst.length ? out.join("").normalize("NFC") : null;
  }

  // A second opinion for words the local model pointed impossibly (O-033). `suspects` come from
  // NiqqudPlausibility.scanRows, `answers[k]` is Dicta's pointing of suspects[k]'s source line.
  // Only the suspect words can change, and only to Dicta's word when it keeps the subtitle's
  // letters and passes the same plausibility rules. Dicta pointing the word exactly as the model
  // did is an independent confirmation (a loanword like סְטְפָן); anything else stays as it was.
  function applySecondOpinion(rows, suspects, answers, deps) {
    var d = deps || {};
    var profile = ["learner-latin", "sbl", "ru-phonetic"].indexOf(d.translitProfile) >= 0 ? d.translitProfile : "learner-latin";
    var output = (Array.isArray(rows) ? rows : []).map(function (row) { return Object.assign({}, row); });
    var result = { rows: output, replaced: [], confirmed: [], kept: [] };
    (Array.isArray(suspects) ? suspects : []).forEach(function (suspect, k) {
      var row = output[suspect.rowIndex];
      var answer = Array.isArray(answers) ? String(answers[k] || "") : "";
      var projected = row && answer ? projectVocalization(row.he, answer) : null;
      var theirs = projected && projected.matched ? projected.text.split(/(\s+)/) : null;
      var ours = String(row && row.he_niqqud || "").split(/(\s+)/);
      var isWord = function (part) { return part && !/^\s+$/.test(part); };
      var sourceWords = String(row && row.he || "").split(/(\s+)/).filter(isWord);
      var answerWords = answer.split(/(\s+)/).filter(isWord);
      // Map the k-th word to its part index; both splits come from the same source whitespace.
      function partIndex(parts, wordIndex) {
        for (var p = 0, w = -1; p < parts.length; p++) {
          if (parts[p] && !/^\s+$/.test(parts[p]) && ++w === wordIndex) return p;
        }
        return -1;
      }
      var changed = false;
      suspect.words.forEach(function (word) {
        var entry = { rowIndex: suspect.rowIndex, index: word.index, word: word.word, reasons: word.reasons };
        var ourAt = partIndex(ours, word.index);
        var theirAt = theirs ? partIndex(theirs, word.index) : -1;
        var candidate = theirAt >= 0 ? theirs[theirAt].normalize("NFC") : "";
        var mine = ourAt >= 0 ? ours[ourAt].normalize("NFC") : "";
        if (!/[ְ-ׇ]/.test(candidate) && sourceWords.length === answerWords.length && sourceWords[word.index]) {
          candidate = fillMatres(sourceWords[word.index], answerWords[word.index]) || "";
        }
        if (!candidate || !mine || tokenKey(candidate) !== tokenKey(mine) || !/[ְ-ׇ]/.test(candidate)) {
          result.kept.push(entry);
        } else if (candidate === mine) {
          result.confirmed.push(entry);
        } else if (typeof d.wordFaults === "function" && d.wordFaults(candidate).length === 0) {
          ours[ourAt] = candidate;
          changed = true;
          result.replaced.push(Object.assign(entry, { replacement: candidate }));
        } else {
          result.kept.push(entry);
        }
      });
      if (!changed) return;
      row.he_niqqud = ours.join("").normalize("NFC");
      row.niqqud = row.he_niqqud;
      row.niqqud_second_opinion = "dicta";
      if (typeof d.transliterate === "function") {
        row.translit = String(d.transliterate(row.he_niqqud, profile) || "");
        row.translit_sbl = String(d.transliterate(row.he_niqqud, "sbl") || "");
        row.translit_ru = String(d.transliterate(row.he_niqqud, "ru-phonetic") || "");
      }
    });
    return result;
  }

  // Lines sent to the second opinion: the subtitle's own text, one line per suspect row.
  function secondOpinionLines(rows, suspects) {
    return (Array.isArray(suspects) ? suspects : []).map(function (suspect) {
      return String((rows[suspect.rowIndex] || {}).he || "").replace(/\s+/g, " ").trim();
    });
  }

  return { enrich: enrich, plain: plain, projectVocalization: projectVocalization, normalizeMatres: normalizeMatres, fillMatres: fillMatres,
    applySecondOpinion: applySecondOpinion, secondOpinionLines: secondOpinionLines, MATRES_MARK: MATRES_MARK };
});
