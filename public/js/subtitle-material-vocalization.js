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
    var output = (Array.isArray(rows) ? rows : []).map(function (row) { return Object.assign({}, row); });
    var targetIndexes = [];
    output.forEach(function (row, index) {
      if (/[\u05d0-\u05ea]/.test(String(row.he || ""))) targetIndexes.push(index);
      else row.niqqud_status = "not_vocalized";
    });
    var warnings = [];
    for (var start = 0; start < targetIndexes.length; start += 16) {
      var indexes = targetIndexes.slice(start, start + 16);
      var source = indexes.map(function (index) { return String(output[index].he || ""); });
      var result = await opts.client.vocalizeTexts(source);
      if (!result || !Array.isArray(result.results) || result.results.length !== source.length) {
        throw new Error("LOCAL_VOCALIZATION_COUNT_MISMATCH");
      }
      indexes.forEach(function (index, offset) {
        var row = output[index], vocalized = String(result.results[offset] || "").trim();
        var projected = vocalized && projectVocalization(row.he, vocalized);
        if (!projected || !projected.matched || plain(projected.text) !== plain(row.he)) {
          row.niqqud_status = "not_vocalized";
          // Transliteration remains deterministic even when the local model cannot safely
          // supply vowel points. It is less precise without them, but preserves the column.
          row.translit = String(opts.transliterate(row.he, "learner-latin") || "");
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
        row.translit = String(opts.transliterate(projected.text, "learner-latin") || "");
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

  return { enrich: enrich, plain: plain, projectVocalization: projectVocalization };
});
