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

  // B+C hardening: portable row/source identity lives in edit_meta_json, not in a new DB
  // column. This keeps the slice additive while separating three historically-confused facts:
  // the ASR source segment, the original source-line index, and the premium segmenter's own
  // sentence ordinal. Provider indices remain cross-checks; the stable id is derived from the
  // physical media hash when the provider did not supply one.
  function finiteIndex(value) {
    var n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function parseObject(raw) {
    if (!raw) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return Object.assign({}, raw);
    try {
      var parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  function mediaSourceSha(holder) {
    var h = holder && holder.source ? holder.source : holder;
    var audio = h && h.audio ? h.audio : (h && h.captions ? h.captions : h);
    var sha = audio && audio.media && audio.media.sha256;
    return typeof sha === "string" && /^[a-f0-9]{64}$/i.test(sha.trim()) ? sha.trim().toLowerCase() : null;
  }

  function rowEditMetaForSave(row, audio, rowIndex) {
    var r = row || {};
    var meta = parseObject(r.edit_meta_json != null ? r.edit_meta_json : r.edit_meta);
    var timingEntries = audio && audio.timing && Array.isArray(audio.timing.entries)
      ? audio.timing.entries : [];
    var entry = timingEntries.find(function (e) {
      return e && finiteIndex(e.row) === finiteIndex(rowIndex);
    }) || timingEntries[rowIndex] || null;
    var provenIndexes = audio && audio.timingMap && Array.isArray(audio.timingMap.row_seg_idx)
      ? audio.timingMap.row_seg_idx : [];
    var segIndex = finiteIndex(provenIndexes[rowIndex]);
    if (segIndex == null) segIndex = finiteIndex(entry && entry.seg);
    var segments = audio && Array.isArray(audio.segments) ? audio.segments : [];
    var segment = segIndex != null ? segments[segIndex] : null;
    var sourceLine = finiteIndex(r.source_line_index);
    if (sourceLine == null) sourceLine = segIndex;
    var sourceSegmentIds = segment && Array.isArray(segment.source_segment_ids)
      ? segment.source_segment_ids.map(String).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; })
      : [];
    var captionSegmentId = r.caption_segment_id || r.captionSegmentId ||
      (segment && segment.caption_segment_id) || null;
    var sourceSegmentId = r.source_segment_id || r.sourceSegmentId ||
      sourceSegmentIds[0] || (segment && (segment.source_segment_id || segment.id)) || null;
    var sha = mediaSourceSha(audio);
    if (!sourceSegmentId && sha && segIndex != null) sourceSegmentId = "asrseg:" + sha + ":" + segIndex;

    var mapSource = String((audio && audio.timingMap && audio.timingMap.source) || "");
    var sentenceIndex = finiteIndex(r.sentence_index);
    // In seg-mode `segment_index` is the source segment; in premium mode it is the
    // segmenter's sentence ordinal. Persist it as sentence_index only in the latter case.
    if (sentenceIndex == null && mapSource.indexOf("segment_index") !== 0) {
      sentenceIndex = finiteIndex(r.segment_index);
    }
    if (!sourceSegmentId && sourceLine == null && sentenceIndex == null) {
      return r.edit_meta_json != null ? r.edit_meta_json : (r.edit_meta != null ? r.edit_meta : null);
    }
    meta._studio_source = captionSegmentId || sourceSegmentIds.length ? {
      schema: "studio-row-source-v2",
      source_segment_id: sourceSegmentId ? String(sourceSegmentId) : null,
      source_segment_ids: sourceSegmentIds.length ? sourceSegmentIds : (sourceSegmentId ? [String(sourceSegmentId)] : []),
      caption_segment_id: captionSegmentId ? String(captionSegmentId) : null,
      source_line_index: sourceLine,
      sentence_index: sentenceIndex,
    } : {
      schema: "studio-row-source-v1",
      source_segment_id: sourceSegmentId ? String(sourceSegmentId) : null,
      source_line_index: sourceLine,
      sentence_index: sentenceIndex,
    };
    return JSON.stringify(meta);
  }

  function restorePortableRowIdentity(row, rawMeta) {
    var out = Object.assign({}, row || {});
    var src = parseObject(rawMeta)._studio_source;
    if (!src || (src.schema !== "studio-row-source-v1" && src.schema !== "studio-row-source-v2")) return out;
    if (src.source_segment_id) out.source_segment_id = String(src.source_segment_id);
    if (src.schema === "studio-row-source-v2") {
      if (Array.isArray(src.source_segment_ids)) out.source_segment_ids = src.source_segment_ids.map(String).filter(Boolean);
      if (src.caption_segment_id) out.caption_segment_id = String(src.caption_segment_id);
    }
    var line = finiteIndex(src.source_line_index);
    var sentence = finiteIndex(src.sentence_index);
    if (line != null) out.source_line_index = line;
    if (sentence != null) out.sentence_index = sentence;
    return out;
  }

  function importSessionResetPatch() {
    return { mode: "draft", textId: null, baseTextId: null, resumeSentenceId: null,
             title: null, openMode: null };
  }

  // A validated ASR preview deliberately nulls a non-monotonic mark instead of pretending that
  // it is playable. The immutable raw track, however, must retain the provider's actual mark:
  // replacing it with a guessed neighbour/interpolation would turn a local verdict into canon,
  // while persisting null violates the caption-track contract and used to abort the whole Media
  // Package. Keep the asserted mark, label that one segment blind, and let karaoke omit it.
  function mediaSegmentsForPromotion(sourceSegments, validatedSegments) {
    var source = Array.isArray(sourceSegments) ? sourceSegments : [];
    var validated = Array.isArray(validatedSegments) ? validatedSegments : [];
    return source.map(function (segment, index) {
      var raw = segment || {}, checked = validated[index] || null;
      var start = typeof raw.start === "number" && isFinite(raw.start) ? raw.start : null;
      var end = typeof raw.end === "number" && isFinite(raw.end) && start !== null && raw.end > start
        ? raw.end : null;
      var flags = Array.isArray(raw.quality_flags) ? raw.quality_flags.map(String).filter(Boolean) : [];
      var blind = !!raw.blind || !checked || checked.start === null;
      if (blind && flags.indexOf("blind") < 0) flags.push("blind");
      return {
        i: index, id: raw.id || raw.source_segment_id || undefined,
        start: start, end: end, text: String(raw.text == null ? "" : raw.text),
        speaker: raw.speaker == null ? null : String(raw.speaker),
        quality_flags: flags, blind: blind,
      };
    });
  }

  // ── S12.5 T4: STALE-TAB GUARD (чистое сравнение версий) ──────────────────────────────────────
  // Диагностическая сессия 2026-07-29 потратила целую гипотезу (H1) на вопрос «а каким кодом
  // вообще сделан этот прогон?» — вкладка владельца жила 35 минут, за это время прод успел уехать
  // на две версии вперёд, и доказать свежесть удалось только feature-детекцией в консоли.
  //
  // ЧТО С ЧЕМ СРАВНИВАЕТСЯ (разведка §5 дизайн-пакета — наивный вариант НЕ работает):
  //   pageVersion   = window.APP_VERSION — ЛИТЕРАЛ, зашитый в сам документ index.html. Это
  //                   единственное, что стареет ВМЕСТЕ со вкладкой.
  //   serverVersion = j.version из /api/client-config — сервер читает CACHE_VERSION из sw.js.
  // Использовать window.__v3AppVersion (index.html) для guard-а НЕЛЬЗЯ: он заполняется ОТВЕТОМ
  // СЕРВЕРА, т.е. это версия сервера в маске версии страницы — старая вкладка спросит сервер,
  // получит новую версию, запишет её себе и «докажет» собственную свежесть.
  //
  // FAIL-OPEN (R11): устаревание — это ФАКТ, который нужно доказать. Нет одной из версий (старый
  // прод без штампа, сетевая ошибка, урезанный ответ) — доказательства нет, прогон идёт. Выдумать
  // «страница устарела» на пустом месте значит заблокировать владельцу единственную рабочую
  // кнопку по подозрению.
  function isStaleTab(pageVersion, serverVersion) {
    var p = typeof pageVersion === "string" ? pageVersion.trim().replace(/^v/i, "") : "";
    var s = typeof serverVersion === "string" ? serverVersion.trim().replace(/^v/i, "") : "";
    if (!p || !s) return false;
    return p !== s;
  }

  // S12.3 (владелец 2026-07-28, живая 117-мин/8-окон приёмка): транскрипт содержал КРУПНЫЕ
  // ДУБЛИ-БЛОКИ. Диагноз по паре источник/результат: (1) модель «заезжает» за запрошенный
  // диапазон range-промта (ASR_RANGE_PROMPT «ONLY a..b» нарушается) → следующий вызов честно
  // транскрибирует ТОТ ЖЕ звук заново — дубль. (2) каскад: у заехавших сегментов немонотонные
  // метки относительно предыдущего сегмента ЭТОГО ЖЕ вызова → mergeWindowSegments честно обнуляет
  // их start (R11) → findCoverageGaps видит ЛОЖНУЮ «дыру» там, где материал уже покрыт → добор
  // транскрибирует тот же участок ЕЩЁ раз → ещё одна копия; бисекция (S12.2) добавляет свои
  // границы с тем же перехлёстом. Фикс: клиппинг результата КАЖДОГО ranged-вызова (окно/половина
  // бисекции/добор — НЕ single null-диапазон, там нет запрошенного числового диапазона) к его
  // СОБСТВЕННОМУ диапазону сразу после parse, ДО merge/findCoverageGaps:
  //   - числовой start вне [startSec-TOL, endSec+TOL] → модель нарушила SCOPE, этот текст не наш —
  //     его уже честно даёт (или даст) СВОЙ вызов; отбрасываем. (R11-оговорка: «текст всегда
  //     сохраняется» — про ненадёжный тайминг НАШЕГО материала; чужой диапазон — не наш текст.)
  //   - null-start (модель не проставила метку) сохраняется, если БЛИЖАЙШИЙ (по позиции, с любой
  //     стороны) числовой сосед — in-range: он структурно привязан к нашему материалу. Голова/хвост
  //     из сплошных null, чей единственный числовой сосед отброшен, — тоже отбрасывается (это,
  //     скорее всего, продолжение чужого заехавшего блока, а не наш текст).
  // S12.4: у ranged-ОКНА (и половины бисекции) допуск ОСЛАБЛЕН до tolSec = ASR_STITCH_CLIP_TOL_SEC
  // (перекрытие+30). Причина: после S12.4 промт требует ЧЕСТНЫХ меток, и честная метка реплики,
  // начавшейся чуть раньше a или кончившейся чуть позже b, ЛЕГИТИМНО выпадает за диапазон — её
  // нельзя выбрасывать, она нужна шву (stitchWindowSegments ищет по ней якорь). Отбрасывается
  // только «далеко вне» — заезд на минуты, как в живой 117-мин приёмке. Добор (heal) остаётся на
  // СТРОГОМ допуске 2с: у доборной зоны нет соседа, шва там нет, и лишний текст оттуда никто не
  // дедуплицирует.
  var ASR_CLIP_TOLERANCE_SEC = 2; // граница реплики может чуть плавать; большой перехлёст = чужой диапазон

  function clipSegmentsToRange(segments, startSec, endSec, tolSec) {
    var list = Array.isArray(segments) ? segments : [];
    var tol = (typeof tolSec === "number" && isFinite(tolSec)) ? tolSec : ASR_CLIP_TOLERANCE_SEC;
    var lo = startSec - tol, hi = endSec + tol;
    // Pass 1: числовые start классифицируются in-range(true)/out-of-range(false); null (модель не
    // дала метку) остаётся неопределённым (null в этом массиве) до pass 2.
    var inRange = list.map(function (s) {
      if (typeof s.start !== "number" || !isFinite(s.start)) return null;
      return s.start >= lo && s.start <= hi;
    });
    // Pass 2: null-start наследует статус от БЛИЖАЙШЕГО числового соседа с любой стороны (OR —
    // хватает одной подтверждающей стороны, см. комментарий выше); если оба отсутствуют/отброшены
    // (голова/хвост подряд идущих null у отброшенного края) — отбрасываем.
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (inRange[i] !== null) { if (inRange[i]) out.push(list[i]); continue; }
      var leftOk = false;
      for (var l = i - 1; l >= 0; l--) { if (inRange[l] !== null) { leftOk = inRange[l]; break; } }
      var rightOk = false;
      for (var r = i + 1; r < list.length; r++) { if (inRange[r] !== null) { rightOk = inRange[r]; break; } }
      if (leftOk || rightOk) out.push(list[i]);
    }
    return out;
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
    // Провенанс готовых окон переезжает в резюм ВМЕСТЕ с сегментами (whole-branch ревью S12.5).
    // Пересборка «с нуля» ({startSec,endSec,retries:0}) стирала всё, что прошлый заход выяснил об
    // этих окнах: rejectedReplay/skippedRanges/bisected/clippedCount. На стыке задач это давало
    // ложь ровно там, где слайс обещал честность: сводка T4 считает windowsOk по
    // w.rejectedReplay/w.skippedRanges и после резюма рапортовала «Чанков 8/8» о прогоне с
    // подделанным окном, rejectedRanges был пуст («окон забраковано: 0»), а забытый диапазон
    // снова считался годным для добора — платили за заведомо тот же реплей (R16). Длинный файл
    // почти всегда доходит до конца с одним-двумя резюмами, так что это не экзотика.
    // Длина обязана совпасть с числом готовых окон — иначе провенанс не про эти окна, и честнее
    // пересобрать минимальный (потеря деталей заметна, подмена — нет).
    var windowsMeta = (Array.isArray(deps.priorWindowsMeta) && deps.priorWindowsMeta.length === windowSegments.length)
      ? deps.priorWindowsMeta.slice()
      : windowSegments.map(function (_, i) {
          return { startSec: wins[i].startSec, endSec: wins[i].endSec, retries: 0 };
        });
    var warnings = [], language = null;
    var startAt = deps.startWindow || windowSegments.length;

    // S12.5 T3 — АНТИ-РЕПЛЕЙ ГЕЙТ (обоснование порога/шинглов/null — в asr-transcript.js).
    // seenShingles = накопитель 6-словных шинглов ПРИНЯТОГО материала прогона; каждое следующее
    // окно/добор проверяется против него. Резюм (priorWindows) заряжает накопитель готовыми
    // окнами — иначе после возобновления гейт «забывал» всё, что уже в транскрипте, и реплей
    // ранних минут проходил бы как новый материал.
    // R11-ИНВАРИАНТ: брак окна = ЧЕСТНАЯ ДЫРА, а не тихая потеря и не маскировка. Забракованное
    // окно уходит в windowSegments ПУСТЫМ массивом (позиция сохраняется — резюм/швы считают окна
    // по индексу), его диапазон немедленно всплывает в findCoverageGaps → coverageGaps +
    // ASR_COVERAGE_GAP, плюс отдельный warning ASR_WINDOW_REPLAY и rejectedRanges в паспорт.
    // Противоположный выбор (оставить реплей в транскрипте) и есть тот дефект, который убил
    // живой прогон владельца: чужой текст с in-range метками ЗАКРЫВАЛ дыры и делал потерю 47%
    // таймлайна похожей на успех.
    var seenShingles = new Set();
    for (var pw = 0; pw < windowSegments.length; pw++) A2.collectShingles(windowSegments[pw], seenShingles);
    var rejectedRanges = [];
    // Брак, случившийся ДО резюма, восстанавливается из провенанса готовых окон: без этого он
    // исчезал из паспорта и из сводки, а его диапазон снова уходил в добор (см. windowsMeta выше).
    for (var pm = 0; pm < windowsMeta.length; pm++) {
      var pmeta = windowsMeta[pm];
      if (pmeta && pmeta.rejectedReplay != null) {
        rejectedRanges.push({ startSec: pmeta.startSec, endSec: pmeta.endSec,
                              rejectedReplay: pmeta.rejectedReplay });
        if (warnings.indexOf("ASR_WINDOW_REPLAY") < 0) warnings.push("ASR_WINDOW_REPLAY");
      }
    }

    // Диапазон уже забракован как реплей ⇒ повторный запрос ТОГО ЖЕ диапазона тем же промтом
    // вернёт тот же реплей (доказано диагнозом: подделка воспроизводима, w6–w8 прогона-образца
    // не дали своего контента НИ РАЗУ). Поэтому дыра, ПЕРЕСЕКАЮЩАЯСЯ с забракованным диапазоном,
    // в добор не идёт вовсе — она остаётся честной дырой, а мы не платим за заведомый мусор (R16).
    // Пересечение — строгое (открытые интервалы): стык встык (дыра начинается ровно там, где
    // кончается забракованное окно) пересечением НЕ считается, такая дыра добирается нормально.
    function overlapsRejected(fromSec, toSec) {
      for (var i = 0; i < rejectedRanges.length; i++) {
        if (fromSec < rejectedRanges[i].endSec && toSec > rejectedRanges[i].startSec) return true;
      }
      return false;
    }

    // S12.5: контракт deps.transcribe расширен — СТРОКА (legacy ranged-file: метки уже
    // абсолютные, как раньше) ЛИБО {raw, offsetSec} (sliced-mp3: модель получила ОТДЕЛЬНО
    // вырезанный кусок звука и plain ASR_PROMPT, её метки чанк-относительные 0..chunkDur).
    // Сдвиг на offsetSec — ЗДЕСЬ и только здесь: oneCall — единственная точка, через которую
    // проходит КАЖДЫЙ ответ транскрипции (окно, обе половины бисекции, heal-добор), поэтому всё
    // ниже по оркестратору (клип по абсолютным диапазонам, stitch, findCoverageGaps, heal-цикл)
    // получает уже абсолютные метки без единой правки. У половин бисекции offsetSec СВОЙ у
    // каждого вызова — их склейка (stitchWindowSegments по mid) уже работает в абсолютном
    // времени, наследуя сдвиг автоматически. offsetSec неподделываем: это НАШ детерминированный
    // офсет (время первого байта чанка из фрейм-карты Mp3Slice), модель на него повлиять не
    // может — в отличие от меток range-промта, подделку которых закрыл диагноз S12.5.
    // null-start (модель не дала метку) не сдвигается — остаётся честным null (R11).
    function parseTranscribed(resp) {
      var isObj = !!resp && typeof resp === "object" && typeof resp.raw === "string";
      var parsed = deps.parse(isObj ? resp.raw : resp);
      var off = isObj ? resp.offsetSec : null;
      if (typeof off === "number" && isFinite(off)) {
        parsed.segments = parsed.segments.map(function (s) {
          return (typeof s.start === "number" && isFinite(s.start))
            ? { start: s.start + off, text: s.text } : s;
        });
      }
      return parsed;
    }

    async function oneCall(startSec, endSec) { // parse c retry ×1 на ASR_BAD_JSON
      var resp = await deps.transcribe(startSec, endSec);
      try { return { parsed: parseTranscribed(resp), retries: 0 }; }
      catch (e1) {
        if (e1.code !== "ASR_BAD_JSON") throw e1;
        resp = await deps.transcribe(startSec, endSec); // ретрай — свой ответ, свой offsetSec
        return { parsed: parseTranscribed(resp), retries: 1 };
      }
    }

    // S12.2 (владелец 2026-07-28, per-item best-effort): окно, дважды подряд давшее ASR_BAD_JSON
    // (oneCall уже исчерпал свой ретрай), больше НЕ валит весь прогон — полуторачасовой
    // транскрипт блокировался целиком из-за одного битого окна 2/8. Вместо throw — БИСЕКЦИЯ
    // окна [a,b] на две половины, каждая — свой oneCall (свой ретрай ×1, до 4 вызовов сверх
    // исходных двух). Половины конкатенируются по времени. Половина, снова давшая BAD_JSON,
    // ЧЕСТНО пропускается (skippedRanges в meta) — образовавшуюся дыру дальше ловит УЖЕ
    // РЕАЛИЗОВАННЫЙ findCoverageGaps→heal-добор ниже по функции; здесь никакой специальной
    // логики под дыру не добавляется. Любая ДРУГАЯ ошибка половины (429/квота/сеть/HTTP) —
    // прежняя семантика: throw наверх, не маскируется.
    // S12.4: у бисекции свой внутренний шов — mid. Половины тоже получают ПЕРЕКРЫТИЕ (±15с вокруг
    // mid: первая доезжает до mid+15, вторая стартует с mid-15) и склеиваются ТЕМ ЖЕ stitch по
    // тексту, а не встык по меткам — иначе внутренний шов воспроизводил бы ровно ту же болезнь
    // дублей/обрывов, что и шов окон. Перекрытие ограничено четвертью окна, чтобы у короткого
    // окна половины не выродились.
    var BISECT_OVERLAP_SEC = 15;
    async function bisectWindow(a, b) {
      var mid = (a + b) / 2;
      var ov = Math.min(BISECT_OVERLAP_SEC, Math.max(0, (b - a) / 4));
      var halves = [[a, Math.min(b, mid + ov)], [Math.max(a, mid - ov), b]];
      var perHalf = [[], []], warnings2 = [], language2 = null, skippedRanges = [];
      var calls = 2; // исходные 2 вызова [a,b] (оба ASR_BAD_JSON) — привели к бисекции
      var clippedCount = 0; // S12.3 провенанс: сколько сегментов отброшено клиппингом обеих половин
      for (var h = 0; h < halves.length; h++) {
        var hs = halves[h][0], he = halves[h][1];
        try {
          var half = await oneCall(hs, he);
          calls += half.retries + 1;
          // S12.3/S12.4: своя половина — свой диапазон; клипь ДО склейки (ослабленный допуск —
          // половины перекрываются, ближняя к шву зона нужна якорю).
          var halfClipped = clipSegmentsToRange(half.parsed.segments, hs, he, A2.ASR_STITCH_CLIP_TOL_SEC);
          clippedCount += half.parsed.segments.length - halfClipped.length;
          perHalf[h] = halfClipped;
          if (!language2 && half.parsed.language) language2 = half.parsed.language;
          (half.parsed.warnings || []).forEach(function (w) { if (warnings2.indexOf(w) < 0) warnings2.push(w); });
        } catch (e2) {
          if (e2.code !== "ASR_BAD_JSON") throw e2; // не BAD_JSON — не маскируем, throw наверх
          calls += 2; // oneCall половины довалил ретрай — оба BAD_JSON
          skippedRanges.push({ startSec: hs, endSec: he });
        }
      }
      // fix1 M4: ширина перекрытия шва бисекции — ov (±15с), а не 30с окон: зона-предохранитель
      // и доказательство покрытия должны считаться по ФАКТИЧЕСКОЙ зоне этого шва.
      var stitchedHalves = A2.stitchWindowSegments(perHalf, [mid], { overlapSec: ov });
      return { parsed: { segments: stitchedHalves.segments, language: language2, warnings: warnings2 },
               retries: calls - 1, bisected: true, skippedRanges: skippedRanges, clippedCount: clippedCount,
               seamsMeta: stitchedHalves.seamsMeta };
    }

    // ── S12.7: инструменты починки сжатых часов (вердикт выносит AsrTranscript) ──────────────
    // Длина под-среза раунда 2. Замер FINDINGS.md §5: срезы 310с дали покрытие 0.90–0.97 и
    // медиану ошибки 0.46–0.71с (3 из 3), при том что 937-секундные ломались в 2 случаях из 3.
    // Ниже 300с уходить нельзя: DENSITY_BASELINE_MIN_WINDOW_SEC исключил бы срезы из базы
    // плотности, и судить их стало бы нечем.
    var CLOCK_SPLIT_SEC = 310;
    var CLOCK_SPLIT_OVERLAP_SEC = 15;
    // Потолок трат (R16): дробление — самый дорогой раунд (3 вызова на чанк). Больше четырёх
    // чанков за прогон не дробим; недолеченные диапазоны НЕ прячутся, а честно уезжают в
    // clockCompressed и в предупреждение (никаких молчаливых потолков).
    var CLOCK_SPLIT_MAX_WINDOWS = 4;

    // Шинглы ВСЕГО принятого материала, КРОМЕ одного окна. Повторный запрос того же чанка обязан
    // повторить сам себя — это не улика; уликой остаётся совпадение с ЧУЖИМИ окнами (ровно то,
    // что ловит анти-реплей гейт S12.5).
    function shinglesExcept(skipIdx) {
      var s = new Set();
      for (var i = 0; i < windowSegments.length; i++) {
        if (i !== skipIdx) A2.collectShingles(windowSegments[i], s);
      }
      return s;
    }
    function windowWords(segs) {
      var n = 0;
      for (var i = 0; i < (segs || []).length; i++) n += A2.stitchNormalizeWords(segs[i] && segs[i].text).length;
      return n;
    }
    function markCoverage(segs, winSec) {
      var marks = [];
      for (var i = 0; i < (segs || []).length; i++) {
        var t = segs[i] && segs[i].start;
        if (typeof t === "number" && isFinite(t)) marks.push(t);
      }
      if (marks.length < 2 || !(winSec > 0)) return 0;
      return (marks[marks.length - 1] - marks[0]) / winSec;
    }
    async function callRange(a, b) {
      var r;
      try { r = await oneCall(a, b); }
      catch (e) { if (e.code !== "ASR_BAD_JSON") throw e; r = await bisectWindow(a, b); }
      return clipSegmentsToRange(r.parsed.segments, a, b, A2.ASR_STITCH_CLIP_TOL_SEC);
    }
    // Раунд 2: чанк переспрашивается КУСКАМИ по CLOCK_SPLIT_SEC с перекрытием, куски склеиваются
    // ТЕМ ЖЕ швом по тексту, что и окна (stitchWindowSegments) — второго правила склейки в
    // проекте не заводим.
    async function callSplit(a, b) {
      var parts = [], seams = [], n = Math.max(2, Math.ceil((b - a) / CLOCK_SPLIT_SEC));
      var step = (b - a) / n;
      for (var i = 0; i < n; i++) {
        var from = i === 0 ? a : a + i * step - CLOCK_SPLIT_OVERLAP_SEC;
        var to = i === n - 1 ? b : a + (i + 1) * step + CLOCK_SPLIT_OVERLAP_SEC;
        parts.push(await callRange(from, to));
        if (i > 0) seams.push(a + i * step);
      }
      return A2.stitchWindowSegments(parts, seams, { overlapSec: CLOCK_SPLIT_OVERLAP_SEC }).segments;
    }

    // Возврат: диапазоны, оставшиеся сжатыми ПОСЛЕ починки (каждый — {fromSec,toSec,…} вердикта).
    async function repairCompressedClocks() {
      var splitsSpent = 0;
      for (var round = 0; round < 2; round++) {
        var judged = wins.slice(0, windowSegments.length);
        var bad = A2.classifyClockCompression(A2.runSpeechDensity(windowSegments, judged));
        if (!bad.length) return [];
        for (var bi = 0; bi < bad.length; bi++) {
          var idx = bad[bi].windowIdx, w = judged[idx];
          if (!w) continue;
          var meta = windowsMeta[idx] || (windowsMeta[idx] = { startSec: w.startSec, endSec: w.endSec, retries: 0 });
          var prev = windowSegments[idx], winSec = w.endSec - w.startSec;
          if (round === 1 && splitsSpent >= CLOCK_SPLIT_MAX_WINDOWS) {
            meta.clockSplitSkipped = true; // R9: потолок трат виден, а не молчит
            continue;
          }
          var fresh;
          try { fresh = round === 0 ? await callRange(w.startSec, w.endSec) : await callSplit(w.startSec, w.endSec); }
          catch (e) {
            // Починка — best-effort поверх УЖЕ полученного транскрипта: сеть/квота не имеют права
            // отнять то, что прогон уже добыл. Диапазон останется честно недостоверным.
            meta.clockRepairError = String((e && e.message) || e).slice(0, 120);
            continue;
          }
          if (round === 1) splitsSpent++;
          // Принимаем ТОЛЬКО доказанное улучшение (R11 «не ухудшать»): метки обязаны накрыть
          // больше, и при этом текста не должно стать заметно меньше — тайминг не покупается
          // ценой потерянной речи. Плюс тот же анти-реплей гейт против ЧУЖИХ окон.
          var covBefore = markCoverage(prev, winSec), covAfter = markCoverage(fresh, winSec);
          var wordsBefore = windowWords(prev), wordsAfter = windowWords(fresh);
          var replay = A2.replayRatio(fresh, shinglesExcept(idx));
          var accept = covAfter > covBefore &&
                       wordsAfter >= wordsBefore * A2.DENSITY_TEXT_PRESENT_RATIO &&
                       !(replay !== null && replay >= A2.REPLAY_REJECT_RATIO);
          var log = { round: round + 1, covBefore: +covBefore.toFixed(3), covAfter: +covAfter.toFixed(3),
                      wordsBefore: wordsBefore, wordsAfter: wordsAfter, accepted: accept };
          if (replay !== null) log.replay = +replay.toFixed(2);
          meta.clockRepair = (meta.clockRepair || []).concat([log]); // R9: каждая попытка видна
          if (accept) {
            windowSegments[idx] = fresh;
            seenShingles = shinglesExcept(-1); // накопитель прогона пересобирается под новый состав
          }
        }
      }
      return A2.classifyClockCompression(A2.runSpeechDensity(windowSegments, wins.slice(0, windowSegments.length)));
    }

    for (var k = startAt; k < wins.length; k++) {
      deps.onProgress(k + 1, wins.length);
      var r, clippedCount = 0;
      try {
        r = single ? await oneCall(null, null) : await oneCall(wins[k].startSec, wins[k].endSec);
        // S12.3: single отправляет null-диапазон (нет запрошенных числовых границ) — не клипим.
        // Ranged-окно — клипь к СВОЕМУ [startSec,endSec] сразу после parse, до merge/findCoverageGaps.
        if (!single) {
          var clippedSegs = clipSegmentsToRange(r.parsed.segments, wins[k].startSec, wins[k].endSec,
                                                A2.ASR_STITCH_CLIP_TOL_SEC); // S12.4: ближняя зона — шву
          clippedCount = r.parsed.segments.length - clippedSegs.length;
          r.parsed.segments = clippedSegs;
        }
      } catch (e) {
        // windowsMeta уезжает в резюм рядом с сегментами — см. блок про priorWindowsMeta выше.
        if (e.code !== "ASR_BAD_JSON") { e.windowIndex = k; e.windowSegments = windowSegments; e.windowsMeta = windowsMeta; throw e; }
        try {
          // single: явный диапазон [0, durationSec] — первый случай range-промта для короткого
          // файла (иначе он никогда бы не использовался); честно, не молчаливая деградация.
          r = single ? await bisectWindow(0, deps.durationSec)
                     : await bisectWindow(wins[k].startSec, wins[k].endSec);
          clippedCount = r.clippedCount || 0; // bisectWindow клипит обе половины сам, к своим под-диапазонам
        } catch (e2) { e2.windowIndex = k; e2.windowSegments = windowSegments; e2.windowsMeta = windowsMeta; throw e2; }
      }
      var meta = { startSec: wins[k].startSec, endSec: wins[k].endSec, retries: r.retries };
      if (r.bisected) meta.bisected = true; // R9 провенанс: окно потребовало бисекции
      if (r.skippedRanges && r.skippedRanges.length) meta.skippedRanges = r.skippedRanges; // R9: честный пропуск
      if (r.seamsMeta && r.seamsMeta.length) meta.bisectSeams = r.seamsMeta; // S12.4 R9: как склеен внутренний шов бисекции
      // R9 провенанс (S12.3): пишем ТОЛЬКО когда >0 — единообразно с bisected/skippedRanges выше
      // (те тоже присутствуют в meta только когда true/непусто, отсутствие поля = «ничего особого»).
      if (clippedCount > 0) meta.clippedCount = clippedCount;
      // Анти-реплей гейт окна — ПОСЛЕ клипа (судим ровно тот материал, который попал бы в
      // транскрипт) и ДО push в windowSegments. Забракованное окно не отдаёт НИЧЕГО: ни текста,
      // ни языка, ни warnings — его warnings описывают ЧУЖОЙ звук, который модель подставила.
      // Шовное исключение: голова окна, ДОКАЗАННО совпадающая с хвостом предыдущего (якорь
      // S12.4), — это перекрытие, созданное НАМИ (asrWindows), и уликой против модели быть не
      // может; см. replaySeamSkipWords. Предыдущее окно — последнее уже принятое (у брака там
      // пустой массив, якоря не будет, исключать нечего — что и правильно).
      var seamSkip = A2.replaySeamSkipWords(windowSegments[windowSegments.length - 1], r.parsed.segments);
      var replay = A2.replayRatio(r.parsed.segments, seenShingles, seamSkip);
      var rejectedReplay = replay !== null && replay >= A2.REPLAY_REJECT_RATIO;
      if (rejectedReplay) {
        meta.rejectedReplay = +replay.toFixed(2); // R9: почему окно пусто
        rejectedRanges.push({ startSec: wins[k].startSec, endSec: wins[k].endSec,
                              rejectedReplay: meta.rejectedReplay });
        if (warnings.indexOf("ASR_WINDOW_REPLAY") < 0) warnings.push("ASR_WINDOW_REPLAY");
      } else {
        A2.collectShingles(r.parsed.segments, seenShingles);
      }
      windowsMeta.push(meta);
      windowSegments.push(rejectedReplay ? [] : r.parsed.segments);
      if (rejectedReplay) continue;
      if (!language && r.parsed.language) language = r.parsed.language;
      (r.parsed.warnings || []).forEach(function (w) {
        if (w !== "NO_SPEECH" && warnings.indexOf(w) < 0) warnings.push(w);
      });
    }

    // ── S12.7: ПОЧИНКА СЖАТЫХ ЧАСОВ ЧАНКА ───────────────────────────────────────────────────
    // Живая приёмка владельца 2026-07-30 (docs/research/studio-karaoke-clock-drift/2026-07-30):
    // чанк выдал ПОЛНЫЙ текст своих 15 минут, но разметил их 660с меток — модель перестала
    // читать позицию в звуке и начала штамповать почти постоянный шаг. Караоке уехало до 4 мин
    // 17 с на 57% таблицы. Дефект СТОХАСТИЧЕСКИЙ: тот же звук, тот же промт, повтор вызова —
    // и медиана ошибки 55с превращается в 0.58с (замер FINDINGS.md §5, 5 живых прогонов).
    // Поэтому лечение — переспросить, а не выдумывать метки: восстановить их из текста нельзя
    // (все офлайн-стратегии проиграли, FINDINGS.md §6).
    //
    // Раунд 1 — повтор ТОГО ЖЕ чанка (+1 вызов на сжатый чанк). Раунд 2 — тот же чанк, нарезанный
    // на CLOCK_SPLIT_SEC (замер: 3 из 3 коротких срезов здоровы, медиана 0.46–0.71с). Не помогло
    // ⇒ диапазон честно объявляется недостоверным по таймингу, и караоке на нём выключается
    // (R11: отсутствие подсветки лучше уверенно неверной) — текст при этом НЕ страдает.
    var clockCompressed = [];
    if (!single && windowSegments.length > 1) {
      clockCompressed = await repairCompressedClocks();
      if (clockCompressed.length && warnings.indexOf("ASR_CLOCK_COMPRESSED") < 0) {
        warnings.push("ASR_CLOCK_COMPRESSED");
      }
    }

    // S12.4: мульти-оконный путь склеивается ПО ТЕКСТУ (якорь в зоне перекрытия), а не встык по
    // меткам; mergeWindowSegments после stitch остаётся — он честно нулит немонотонные метки
    // (шов может дать метку соседа на пару секунд раньше), но склейкой больше не занимается.
    var merged, seamsMeta = [];
    if (!single && windowSegments.length > 1) {
      var stitched = A2.stitchWindowSegments(windowSegments, A2.asrSeams(wins.slice(0, windowSegments.length)));
      seamsMeta = stitched.seamsMeta;
      merged = A2.mergeWindowSegments([stitched.segments]);
    } else {
      merged = A2.mergeWindowSegments(windowSegments);
    }
    // S12.6: разрывы меток раскладываются на ДВА факта ещё ДО добора (classifyCoverageGaps).
    // Разрыв внутри окна, выдавшего ожидаемый по своей длительности ОБЪЁМ ТЕКСТА, — это не
    // потеря речи, а сжатые метки: добирать нечего (R16 — живой прогон владельца оплатил такой
    // добор впустую, и вернувшийся текст забраковал анти-реплей гейт как уже имеющийся), и в
    // coverageGaps он попасть не имеет права, иначе сводка снова потребует подтвердить
    // несуществующую потерю. Он уходит в unreliableMarkRanges — караоке там уедет, и это
    // показывается ОТДЕЛЬНОЙ формулировкой. Окна и их сегменты берутся СЫРЫМИ (до stitch) — это
    // и есть «что выдало окно»; heal-сегменты в них не попадают, поэтому плотность прогона
    // остаётся суждением о МОДЕЛИ, а не о нашем доборе.
    var densityWins = wins.slice(0, windowSegments.length);
    var gaps = A2.classifyCoverageGaps(merged, deps.durationSec, windowSegments, densityWins).gaps;
    var healedGaps = [], maxHeals = deps.maxHeals == null ? 3 : deps.maxHeals;
    for (var g = 0; g < gaps.length && healedGaps.length < maxHeals; g++) {
      var gap = gaps[g];
      // (а) дыра внутри уже забракованного диапазона — в добор не идёт (см. overlapsRejected).
      if (overlapsRejected(gap.fromSec, gap.toSec)) continue;
      var heal;
      try { heal = await oneCall(gap.fromSec, gap.toSec); }
      catch (_) { continue; } // добор best-effort: неудача = дыра остаётся честной
      // S12.3: добор — тоже ranged-вызов со своим диапазоном [gap.fromSec, gap.toSec]; клипь ДО
      // проверки .length — добор, целиком заехавший за дыру, эквивалентен «ничего не нашёл»
      // (дыра честно остаётся открытой, а не молча зарастает чужим материалом).
      // S12.4: допуск здесь остаётся СТРОГИМ (2с) — у доборной зоны нет соседнего окна, шва нет,
      // якорю не с чем работать, и лишний заехавший текст никто не дедуплицирует.
      heal.parsed.segments = clipSegmentsToRange(heal.parsed.segments, gap.fromSec, gap.toSec);
      // (б) тот же анти-реплей гейт для ДОБОРА — против ВСЕГО уже принятого материала прогона.
      // Именно этим путём пришёл живой брак владельца: добор дыры 55:53–59:30 вернул речь
      // 35:39–39:37 со штампами ВНУТРИ дыры, строгий клип ±2с её пропустил (штампы-то в
      // диапазоне), и дыра «заросла» чужим текстом. Теперь добор-реплей отбрасывается целиком,
      // дыра остаётся честной (healedGaps её не получает → coverageGaps + ASR_COVERAGE_GAP).
      var healReplay = A2.replayRatio(heal.parsed.segments, seenShingles);
      if (healReplay !== null && healReplay >= A2.REPLAY_REJECT_RATIO) {
        rejectedRanges.push({ startSec: gap.fromSec, endSec: gap.toSec,
                              healRejectedReplay: +healReplay.toFixed(2) }); // R9: почему дыра не закрыта
        if (warnings.indexOf("ASR_WINDOW_REPLAY") < 0) warnings.push("ASR_WINDOW_REPLAY");
        continue;
      }
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
        // принятый добор — часть транскрипта, значит и часть базы для следующих проверок:
        // второй добор, дословно повторяющий первый, обязан браковаться.
        A2.collectShingles(heal.parsed.segments, seenShingles);
      }
    }
    var finalGaps = A2.classifyCoverageGaps(merged, deps.durationSec, windowSegments, densityWins);
    var remaining = finalGaps.gaps;
    if (remaining.length && warnings.indexOf("ASR_COVERAGE_GAP") < 0) warnings.push("ASR_COVERAGE_GAP");
    // Свой код предупреждения: «тайминг части записи недостоверен» — НЕ то же самое, что
    // ASR_COVERAGE_GAP («текста нет»), и схлопывать их в один код значило бы вернуть ровно ту
    // неразличимость двух фактов, которую чинит S12.6.
    if (finalGaps.unreliableMarkRanges.length && warnings.indexOf("ASR_MARKS_UNRELIABLE") < 0) {
      warnings.push("ASR_MARKS_UNRELIABLE");
    }
    if (!merged.length && warnings.indexOf("NO_SPEECH") < 0) warnings.push("NO_SPEECH");
    return { segments: merged, language: language, warnings: warnings, windows: windowsMeta,
             seams: seamsMeta, // S12.4 R9: как склеен каждый шов (якорь/фолбэк, сколько сегментов срезано)
             coverageGaps: remaining, healedGaps: healedGaps,
             // S12.6 R9: где текст на месте, а метки сжаты (+ плотность прогона, по которой это решено)
             unreliableMarkRanges: finalGaps.unreliableMarkRanges, speechDensity: finalGaps.density,
             // S12.7: чанки, чьи часы остались сжатыми ПОСЛЕ починки. Текст там на месте, а
             // тайминг недостоверен — караоке на этих диапазонах обязано быть выключено (R11).
             clockCompressedRanges: clockCompressed,
             rejectedRanges: rejectedRanges, // S12.5 R9: что забраковано анти-реплей гейтом (окно/добор)
             windowSegments: windowSegments };
  }

  if (typeof window === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { chooseTrackHint: chooseTrackHint, pluralCategory: pluralCategory, uniqueLangCount: uniqueLangCount,
                          runWindowedAsr: runWindowedAsr, clipSegmentsToRange: clipSegmentsToRange,
                          ASR_CLIP_TOLERANCE_SEC: ASR_CLIP_TOLERANCE_SEC, isStaleTab: isStaleTab,
                          mediaSourceSha: mediaSourceSha, rowEditMetaForSave: rowEditMetaForSave,
                          restorePortableRowIdentity: restorePortableRowIdentity,
                          importSessionResetPatch: importSessionResetPatch,
                          mediaSegmentsForPromotion: mediaSegmentsForPromotion };
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
  var localAsrClient = null;
  var localAsrRunController = null;
  var localAsrConnected = false;
  var mediaJobController = null;

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

  function renderLocalAsrConnectionState() {
    var button = $("v3ImportLocalAsrPair");
    if (!button) return;
    button.textContent = tr(localAsrConnected
      ? "studio.import.localAsrConnected"
      : "studio.import.localAsrPair");
    button.dataset.connected = localAsrConnected ? "true" : "false";
    button.setAttribute("aria-pressed", localAsrConnected ? "true" : "false");
  }

  function setLocalAsrConnectionState(value) {
    localAsrConnected = value === true;
    renderLocalAsrConnectionState();
  }

  function setLocalAsrPairStatus(msgKey, extra, kind) {
    var node = $("v3ImportLocalAsrPairStatus");
    if (!node) return;
    node.textContent = msgKey ? (tr(msgKey) + (extra ? " " + extra : "")) : "";
    node.hidden = !msgKey;
    node.dataset.kind = kind || "ok";
  }

  function onLocalAsrTokenChanged() {
    setLocalAsrConnectionState(false);
    setLocalAsrPairStatus(null);
  }

  function localAsrExperimental() {
    return !!(window.LocalAsrClient && window.LocalAsrClient.isExperimentalEnabled());
  }

  function selectedAudioProvider() {
    var select = $("v3ImportAudioProvider");
    return localAsrExperimental() && select && select.value === "local" ? "local" : "gemini";
  }

  function refreshLocalAsrControls() {
    var enabled = localAsrExperimental();
    var needsMedia = !!(pendingAudio && pendingAudio.isVideo);
    var providerWrap = $("v3ImportAudioProviderWrap");
    if (providerWrap) providerWrap.hidden = !enabled;
    var local = enabled && selectedAudioProvider() === "local";
    var setup = $("v3ImportLocalAsrSetup");
    if (setup) setup.hidden = !(local || needsMedia);
    if ((enabled && local) || needsMedia) {
      var input = $("v3ImportLocalAsrToken");
      if (input && !input.value) input.value = window.LocalAsrClient.getPairingToken();
    }
    if (!enabled && !needsMedia) localAsrConnected = false;
    renderLocalAsrConnectionState();
    if (pendingAudio) updateAudioActionLabel();
  }
  window.addEventListener("local-asr-beta-change", refreshLocalAsrControls);

  function localAsrFailure(error) {
    var job = error && error.job;
    var detail = String((job && (job.error_code || job.error_detail)) || (error && error.message) || "");
    if (/WORKER_OOM|CUDA.*OOM|OUT OF MEMORY/i.test(detail)) {
      return { reason: "WORKER_OOM", key: "studio.import.localAsrOom" };
    }
    if (/MODEL_DISK_LOW|DISK.*LOW|NO SPACE/i.test(detail)) {
      return { reason: "MODEL_DISK_LOW", key: "studio.import.localAsrDiskLow" };
    }
    if (/INTEGRITY|HASH|CHECKSUM|PIN_MISMATCH/i.test(detail)) {
      return { reason: "MODEL_INTEGRITY_FAILED", key: "studio.import.localAsrModelIntegrity" };
    }
    if (/PORT_CONFLICT/i.test(detail)) {
      return { reason: "PORT_CONFLICT", key: "studio.import.localAsrPortConflict" };
    }
    return { reason: (job && job.error_code) || (error && error.code) || "LOCAL_ASR_FAILED", key: "studio.import.localAsrUnavailable" };
  }

  function onAudioProviderChanged() {
    var select = $("v3ImportAudioProvider");
    if (select && select.value === "local" && pendingAudio) delete pendingAudio.cloudFallbackConsent;
    if (select && select.value === "gemini" && pendingAudio && pendingAudio.localAttempted) {
      var est = window.AsrTranscript.estimateLongJob(pendingAudio.durationSec, {
        video: pendingAudio.isVideo, chunkSize: window.TableChunks.CHUNK_SIZE });
      var consent = window.confirm(tr("studio.import.localAsrCloudConsent", {
        size: (pendingAudio.file.size / (1024 * 1024)).toFixed(1),
        model: window.AsrTranscript.ASR_MODEL,
        cost: Math.max(0.01, est.totalUsd).toFixed(2),
        reason: pendingAudio.localFallbackReason || "LOCAL_NOT_ACCEPTED",
      }));
      if (!consent) select.value = "local";
      else pendingAudio.cloudFallbackConsent = {
        version: 1, at: new Date().toISOString(),
        reason: pendingAudio.localFallbackReason || "LOCAL_NOT_ACCEPTED",
        bytes: pendingAudio.file.size, provider: "gemini", model: window.AsrTranscript.ASR_MODEL,
      };
    }
    refreshLocalAsrControls();
    setStatus(null);
  }

  function updateAudioActionLabel() {
    var button = $("v3ImportAudioGo");
    if (!button || !pendingAudio) return;
    button.disabled = !!pendingAudio.isVideo && !window.MediaReadiness.canStartAsr(pendingAudio.mediaReadiness);
    if (selectedAudioProvider() === "local") {
      button.textContent = tr("studio.import.localAsrGo");
      return;
    }
    var est = window.AsrTranscript.estimateLongJob(pendingAudio.durationSec, {
      video: pendingAudio.isVideo, chunkSize: window.TableChunks.CHUNK_SIZE });
    button.textContent = tr("studio.import.audioGo") +
      " (≈$" + Math.max(0.01, est.totalUsd).toFixed(2) + " · ~" + est.minutes + " " + tr("studio.import.minShort") + ")";
  }

  async function pairLocalAsr() {
    setLocalAsrConnectionState(false);
    setLocalAsrPairStatus(null);
    try {
      window.LocalAsrClient.setPairingToken($("v3ImportLocalAsrToken").value);
      localAsrClient = new window.LocalAsrClient.Client();
      var capabilities = await localAsrClient.capabilities();
      if (pendingAudio && pendingAudio.isVideo) {
        if (!capabilities || !capabilities.media_readiness || !capabilities.media_readiness.enabled) {
          throw new Error("MEDIA_READINESS_UNAVAILABLE");
        }
        setLocalAsrConnectionState(true);
        setLocalAsrPairStatus("studio.import.mediaCompanionReady", "", "ok");
        if (!pendingAudio.mediaJobId) await startMediaPreflight();
        return;
      }
      var model = await localAsrClient.modelStatus();
      setLocalAsrConnectionState(true);
      var key = model && model.verified ? "studio.import.localAsrReady" : "studio.import.localAsrModelMissing";
      var capModel = capabilities && capabilities.local_asr && capabilities.local_asr.model;
      setLocalAsrPairStatus(key, capModel && capModel.revision ? capModel.revision.slice(0, 12) : "", model && model.verified ? "ok" : "warn");
    } catch (error) {
      setLocalAsrConnectionState(false);
      setLocalAsrPairStatus(error && error.code === "LOCAL_ASR_PAIRING_REQUIRED"
        ? "studio.import.localAsrPairingRequired" : "studio.import.localAsrUnavailable", "", "error");
    }
  }

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
    var ap = $("v3ImportAudioProvider");
    if (ap) ap.disabled = b;
    var at = $("v3ImportLocalAsrToken");
    if (at) at.disabled = b;
    var pair = $("v3ImportLocalAsrPair");
    if (pair) pair.disabled = b;
    var cancel = $("v3ImportLocalAsrCancel");
    if (cancel) cancel.hidden = !b || selectedAudioProvider() !== "local";
    var mediaCancel = $("v3ImportMediaCancel");
    if (mediaCancel) mediaCancel.hidden = !b || !(pendingAudio && pendingAudio.mediaJobId);
  }

  function renderMediaReadiness() {
    var panel = $("v3ImportMediaReadiness");
    if (!panel) return;
    var isVideo = !!(pendingAudio && pendingAudio.isVideo), state = isVideo && pendingAudio.mediaReadiness;
    panel.hidden = !isVideo;
    if (!isVideo || !state) return;
    var badge = $("v3ImportMediaBadge"), detail = $("v3ImportMediaDetail"), progress = $("v3ImportMediaProgress");
    var outcomeKey = {
      PROBING: "studio.import.mediaProbing", READY: "studio.import.mediaReady",
      LOSSLESS_REPAIR: "studio.import.mediaLosslessRepair", TRANSCODE_REQUIRED: "studio.import.mediaTranscodeRequired",
      BLOCKED: "studio.import.mediaBlocked", TRANSCRIPT_ONLY: "studio.import.mediaTranscriptOnly",
    }[state.outcome] || "studio.import.mediaBlocked";
    if (badge) { badge.textContent = tr(outcomeKey); badge.dataset.outcome = state.outcome || "BLOCKED"; }
    var codec = state.codec_summary || {};
    var parts = [codec.video_codec, codec.profile, codec.declared_level ? "L" + (codec.declared_level / 10).toFixed(1) : null,
                 codec.width && codec.height ? codec.width + "×" + codec.height : null,
                 codec.fps ? codec.fps + " fps" : null].filter(Boolean);
    if (detail) detail.textContent = parts.join(" · ") + (state.next_action ? " — " + tr("studio.import.mediaNextAction") + ": " + state.next_action : "");
    if (progress) {
      progress.hidden = !(state.state && !["COMPLETE", "WAITING_FOR_DECISION", "BLOCKED"].includes(state.state));
      progress.value = Math.round((state.progress || 0) * 100);
    }
    var prepare = $("v3ImportMediaPrepare");
    if (prepare) {
      prepare.hidden = !["LOSSLESS_REPAIR", "TRANSCODE_REQUIRED"].includes(state.outcome);
      prepare.disabled = !state.disk_sufficient;
      prepare.textContent = state.outcome === "LOSSLESS_REPAIR" ? tr("studio.import.mediaRepairBtn") : tr("studio.import.mediaConvertBtn");
    }
    var estimate = $("v3ImportMediaEstimate");
    if (estimate) {
      estimate.hidden = !state.estimated_output_bytes;
      estimate.textContent = state.estimated_output_bytes
        ? tr("studio.import.mediaDiskEstimate") + ": " + window.MediaReadiness.humanBytes(state.estimated_output_bytes)
          + (state.disk_free_bytes ? " · " + tr("studio.import.mediaDiskFree") + ": " + window.MediaReadiness.humanBytes(state.disk_free_bytes) : "")
          + (state.estimated_time_seconds ? " · ~" + Math.ceil(state.estimated_time_seconds / 60) + " " + tr("studio.import.minShort") : "") : "";
      estimate.dataset.sufficient = state.disk_sufficient ? "true" : "false";
    }
    var technical = $("v3ImportMediaTechnical");
    if (technical) {
      var plan = state.plan || {}, operations = plan.operations || [];
      technical.textContent = parts.join(" · ")
        + (plan.quality_impact ? "\n" + tr("studio.import.mediaQualityImpact") + ": " + plan.quality_impact : "")
        + (operations.length ? "\n" + operations.join(" → ") : "");
    }
    var device = $("v3ImportMediaDeviceGate");
    if (device) device.hidden = state.outcome !== "READY";
    var cancelMedia = $("v3ImportMediaCancel");
    if (cancelMedia) cancelMedia.hidden = !(pendingAudio.mediaJobId && state.state && !["COMPLETE", "BLOCKED", "FAILED", "CANCELED"].includes(state.state));
    var transcriptOnly = $("v3ImportMediaTranscriptOnly");
    if (transcriptOnly) transcriptOnly.hidden = !["LOSSLESS_REPAIR", "TRANSCODE_REQUIRED", "BLOCKED"].includes(state.outcome);
    updateAudioActionLabel();
  }

  function mediaJobStatus(job) {
    if (!pendingAudio) return;
    var previous = pendingAudio.mediaReadiness || {};
    pendingAudio.mediaJobId = job.job_id || pendingAudio.mediaJobId;
    pendingAudio.mediaReadiness = Object.assign({}, previous, window.MediaReadiness.acceptReport(job));
    renderMediaReadiness();
  }

  async function cleanupCompletedMediaJob(state, jobId) {
    try {
      state.cleanup_receipt = await localAsrClient.deleteMediaJob(jobId);
      if (pendingAudio && pendingAudio.mediaJobId === jobId) pendingAudio.mediaJobId = null;
      return true;
    } catch (_) {
      state.cleanup_pending = true;
      setStatus("studio.import.mediaCleanupFailed");
      return false;
    }
  }

  async function startMediaPreflight() {
    if (!pendingAudio || !pendingAudio.isVideo) return;
    if (!window.LocalAsrClient.getPairingToken()) {
      pendingAudio.mediaReadiness = { outcome: "BLOCKED", reason: "pairing_required", next_action: "pair-local-companion" };
      renderMediaReadiness();
      setStatus("studio.import.localAsrPairingRequired");
      return;
    }
    setBusy(true);
    mediaJobController = new AbortController();
    try {
      localAsrClient = localAsrClient || new window.LocalAsrClient.Client();
      var created = await localAsrClient.createMediaJob(pendingAudio.file);
      pendingAudio.mediaJobId = created.job_id;
      var job = await localAsrClient.waitForMediaJob(created.job_id, { signal: mediaJobController.signal, onStatus: mediaJobStatus }, created);
      mediaJobStatus(job);
      var report = job.report || {};
      if (report.duration_seconds) pendingAudio.durationSec = report.duration_seconds;
      if (job.state === "COMPLETE") {
        pendingAudio.mediaReadiness = window.MediaReadiness.acceptPrepared(job);
        pendingAudio.sha256 = job.output_sha256;
        await cleanupCompletedMediaJob(pendingAudio.mediaReadiness, created.job_id);
      }
      renderAudioMeta();
      renderMediaReadiness();
    } catch (error) {
      if (pendingAudio) {
        if (error && error.code === "MEDIA_JOB_CANCELED" && pendingAudio.mediaJobId) {
          await cleanupCompletedMediaJob(pendingAudio.mediaReadiness || {}, pendingAudio.mediaJobId);
        }
        pendingAudio.mediaReadiness = { outcome: "BLOCKED", reason: error && error.code || "preflight_failed", next_action: "check-local-companion" };
        renderMediaReadiness();
      }
      setStatus(error && error.code === "MEDIA_JOB_CANCELED" ? "studio.import.mediaCancelled" : "studio.import.mediaPreflightFailed");
    } finally {
      mediaJobController = null;
      setBusy(false);
      renderMediaReadiness();
    }
  }

  async function prepareMedia() {
    if (!pendingAudio || !pendingAudio.mediaJobId) return;
    var state = pendingAudio.mediaReadiness || {}, mode = state.plan && state.plan.mode;
    if (!mode || !state.plan_sha256) return;
    mediaJobController = new AbortController();
    setBusy(true);
    try {
      var queued = await localAsrClient.prepareMediaJob(pendingAudio.mediaJobId, mode, state.plan_sha256);
      var job = await localAsrClient.waitForMediaJob(pendingAudio.mediaJobId, { signal: mediaJobController.signal, onStatus: mediaJobStatus }, queued);
      var blob = await localAsrClient.mediaFile(pendingAudio.mediaJobId);
      var ready = window.MediaReadiness.acceptPrepared(job);
      var preparedFile = new File([blob], ready.canonical_name || "mobile-ready.mp4", { type: "video/mp4", lastModified: Date.now() });
      pendingAudio.originalFile = pendingAudio.originalFile || pendingAudio.file;
      pendingAudio.file = preparedFile;
      pendingAudio.name = preparedFile.name;
      pendingAudio.mime = "video/mp4";
      pendingAudio.buf = null;
      pendingAudio.sha256 = ready.canonical_sha256;
      pendingAudio.mediaReadiness = ready;
      pendingAudio.durationSec = job.report && job.report.duration_seconds || pendingAudio.durationSec;
      await cleanupCompletedMediaJob(pendingAudio.mediaReadiness, pendingAudio.mediaJobId);
      renderAudioMeta();
      renderMediaReadiness();
      setStatus("studio.import.mediaPrepared");
    } catch (error) {
      if (error && error.code === "MEDIA_JOB_CANCELED" && pendingAudio && pendingAudio.mediaJobId) {
        await cleanupCompletedMediaJob(pendingAudio.mediaReadiness || {}, pendingAudio.mediaJobId);
        pendingAudio.mediaReadiness = { outcome: "BLOCKED", reason: "MEDIA_JOB_CANCELED", next_action: "repeat-media-preflight" };
      }
      setStatus(error && error.code === "MEDIA_JOB_CANCELED" ? "studio.import.mediaCancelled" : "studio.import.mediaPrepareFailed");
    } finally {
      mediaJobController = null;
      setBusy(false);
      renderMediaReadiness();
    }
  }

  async function cancelMediaJob() {
    if (mediaJobController) mediaJobController.abort();
    else if (pendingAudio && pendingAudio.mediaJobId && localAsrClient) {
      var jobId = pendingAudio.mediaJobId;
      var canceled = await localAsrClient.cancelMediaJob(jobId);
      mediaJobStatus(canceled);
      if (canceled.state === "CANCELED") {
        await cleanupCompletedMediaJob(pendingAudio.mediaReadiness, jobId);
        pendingAudio.mediaReadiness = { outcome: "BLOCKED", state: "CANCELED", reason: "MEDIA_JOB_CANCELED", next_action: "choose-or-probe-media", cleanup_receipt: pendingAudio.mediaReadiness.cleanup_receipt || null };
        renderMediaReadiness();
        setStatus("studio.import.mediaCancelled");
      }
    }
  }

  async function runMediaDeviceGate() {
    if (!pendingAudio || !window.MediaReadiness.canStartAsr(pendingAudio.mediaReadiness)) return;
    var result = $("v3ImportMediaDeviceResult");
    try {
      if (!await lockCanonicalMediaIdentity()) return;
      var receipt = await window.MediaReadiness.actualFilePlaySeek(pendingAudio.file);
      if (result) { result.hidden = false; result.textContent = tr("studio.import.mediaDevicePass") + " · " + receipt.device_family + " · " + receipt.browser_family + " / " + receipt.os_family + " · 25%/75% · " + receipt.tested_at; result.dataset.pass = "true"; }
      pendingAudio.mediaReadiness.device_session_receipt = receipt;
    } catch (error) {
      if (result) { result.hidden = false; result.textContent = tr("studio.import.mediaDeviceFail") + " — " + (error && error.message || ""); result.dataset.pass = "false"; }
    }
  }

  async function chooseTranscriptOnly() {
    if (!pendingAudio || !pendingAudio.isVideo) return;
    if (!pendingAudio.durationSec) {
      try { pendingAudio.durationSec = await probeAudioDuration(pendingAudio.file); }
      catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
    }
    pendingAudio.mediaReadiness = window.MediaReadiness.transcriptOnly();
    renderAudioMeta();
    renderMediaReadiness();
    setStatus("studio.import.mediaTranscriptOnlySelected");
  }

  function renderAudioMeta() {
    if (!pendingAudio) return;
    var dur = Number(pendingAudio.durationSec || 0), rounded = Math.round(dur);
    var mm = Math.floor(rounded / 60), ss = String(rounded % 60).padStart(2, "0");
    var metaText = (dur ? mm + ":" + ss : tr("studio.import.mediaProbing")) + " · " + (pendingAudio.file.size / (1024 * 1024)).toFixed(1) + "MB";
    if (pendingAudio.isVideo) metaText += " · " + tr("studio.import.videoNote");
    $("v3ImportAudioMeta").textContent = metaText;
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
    var isVideo = window.MediaReadiness.isVideo(file);
    if (file.size > MAX_AUDIO_BYTES) { setStatus(isVideo ? "studio.import.errVideoTooLarge" : "studio.import.errAudioTooLarge"); return; }
    if (!isVideo && selectedAudioProvider() === "gemini") {
      var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
      if (!key) { setStatus("studio.import.errNoKey"); return; }
    } else if (!isVideo && !window.LocalAsrClient.getPairingToken()) {
      setStatus("studio.import.localAsrPairingRequired"); return;
    }
    var dur = null;
    if (!isVideo) {
      try { dur = await probeAudioDuration(file); }
      catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
      if (dur > MAX_AUDIO_SEC + 1) { setStatus("studio.import.errAudioTooLong"); return; }
    }
    var mime = file.type || (isVideo ? "video/mp4" : "audio/mpeg");
    pendingAudio = { file: file, originalFile: file, buf: null, sha256: null, mime: mime, durationSec: dur, name: file.name, parsed: null, validation: null, isVideo: isVideo,
                     mediaReadiness: window.MediaReadiness.initialForFile(file), mediaJobId: null, windowResults: null,
                     windowMetaResults: null, // провенанс готовых окон для резюма (ревью S12.5)
                     asrTransport: null, sliceLog: null }; // S12.5: транспорт + чанк-лог заполняет transcribeAudio
    renderAudioMeta();
    updateAudioActionLabel();
    $("v3ImportAudioInfo").hidden = false;
    refreshLocalAsrControls();
    renderMediaReadiness();
    setStatus(null);
    if (isVideo) await startMediaPreflight();
  }

  // S12.5 T4: спрашиваем сервер о его версии ПЕРЕД дорогой операцией. Сеть/формат подвели —
  // молчим и работаем (fail-open, обоснование у isStaleTab).
  async function pageIsStale() {
    try {
      var res = await fetch("/api/client-config", { cache: "no-store" });
      if (!res.ok) return false;
      var j = await res.json();
      return isStaleTab(window.APP_VERSION, j && j.version);
    } catch (_) { return false; }
  }

  function localJobStatus(job) {
    var state = job && job.state;
    var progress = job && job.chunks_total
      ? (job.chunks_completed || 0) + "/" + job.chunks_total : "";
    var key = {
      QUEUED: "studio.import.localAsrQueued",
      PREFLIGHT: "studio.import.localAsrPreflight",
      WAITING_FOR_GPU: "studio.import.localAsrWaitingGpu",
      SLICING: "studio.import.localAsrSlicing",
      TRANSCRIBING: "studio.import.localAsrTranscribing",
      VALIDATING: "studio.import.localAsrValidating",
      COOLING: "studio.import.localAsrCooling",
      CANCEL_REQUESTED: "studio.import.localAsrCanceling",
    }[state];
    if (key) setStatus(key, progress);
  }

  function chooseLocalAudioStream(choices) {
    var rows = (choices || []).map(function (item) {
      return item.index + " — " + (item.codec_name || "audio") + (item.default ? " *" : "");
    });
    var raw = window.prompt(tr("studio.import.localAsrChooseStream") + "\n" + rows.join("\n"),
                            choices && choices[0] ? String(choices[0].index) : "");
    if (raw === null || !/^\d+$/.test(raw.trim())) return null;
    return Number(raw);
  }

  function localRetryPlan(normalized) {
    var gates = normalized && normalized.gates;
    if (!gates || gates.s12_5.verdict !== "PASS") return null;
    var reason = gates.s12_6.verdict === "FAIL" ? "s12_6"
               : (gates.s12_7.verdict === "FAIL" ? "s12_7" : null);
    if (!reason) return null;
    var indexes = new Set(), evidence = gates[reason].evidence || {};
    if (reason === "s12_6") {
      (evidence.replay || []).forEach(function (item) { if (item.rejected) indexes.add(item.windowIdx); });
      (evidence.significant_zero_text_chunks || []).forEach(function (idx) { indexes.add(idx); });
      (evidence.coverage_gaps || []).forEach(function (gap) {
        (pendingAudio.asrWindows || []).forEach(function (win, idx) {
          if (gap.fromSec < win.endSec && gap.toSec > win.startSec) indexes.add(idx);
        });
      });
    } else {
      (evidence.clock_compressed_ranges || []).forEach(function (item) { indexes.add(item.windowIdx); });
    }
    if (!indexes.size) (pendingAudio.asrWindows || []).forEach(function (_, idx) { indexes.add(idx); });
    return { reason: reason, chunkIndexes: Array.from(indexes).slice(0, 12) };
  }

  function localGateScore(normalized, reason) {
    var gate = normalized.gates[reason], rank = { FAIL: 0, NOT_APPLICABLE: 1, PASS: 2 }[gate.verdict] || 0;
    var evidence = gate.evidence || {}, penalty = 0;
    if (reason === "s12_6") {
      penalty += (evidence.coverage_gaps || []).length;
      penalty += (evidence.significant_zero_text_chunks || []).length;
      penalty += (evidence.replay || []).filter(function (item) { return item.rejected; }).length;
    } else {
      penalty += (evidence.clock_compressed_ranges || []).length;
      penalty += (gate.reasons || []).length;
    }
    return rank * 1000 - penalty;
  }

  function localWordCount(normalized) {
    return (normalized.segments || []).reduce(function (total, segment) {
      return total + window.AsrTranscript.stitchNormalizeWords(segment.text).length;
    }, 0);
  }

  function acceptLocalCompletion(completed) {
    var normalized = completed.transcript;
    pendingAudio.localJobId = completed.job.job_id;
    pendingAudio.localResult = normalized;
    pendingAudio.asrWindows = completed.raw.chunks.map(function (chunk) {
      return { startSec: chunk.manifest.start_sec, endSec: chunk.manifest.end_sec };
    });
    var del = $("v3ImportLocalAsrDelete");
    if (del) del.hidden = false;
    var retry = $("v3ImportLocalAsrRetry");
    if (retry) retry.hidden = !localRetryPlan(normalized);
    if (normalized.gates.s12_5.verdict !== "PASS") {
      pendingAudio.localFallbackReason = "S12_5_FAIL";
      setStatus("studio.import.localAsrIntegrityFail");
      return false;
    }
    var parsed = { language: "he", segments: normalized.segments, warnings: normalized.warnings.slice() };
    if (normalized.gates.s12_6.verdict === "FAIL") parsed.warnings.push("ASR_COVERAGE_GAP");
    if (normalized.gates.s12_6.verdict === "NOT_APPLICABLE") parsed.warnings.push("ASR_COMPLETENESS_UNKNOWN");
    if (normalized.gates.s12_7.verdict === "FAIL") parsed.warnings.push("ASR_CLOCK_COMPRESSED");
    pendingAudio.asrMethod = "local-faster-whisper";
    pendingAudio.asrModel = window.LocalAsrNormalizer.MODEL_ID;
    pendingAudio.asrTransport = "physical-pcm-windows";
    pendingAudio.asrSeams = normalized.seams || [];
    pendingAudio.coverageGaps = normalized.gates.s12_6.evidence.coverage_gaps || [];
    pendingAudio.healedGaps = [];
    pendingAudio.rejectedRanges = normalized.gates.s12_6.evidence.replay
      .filter(function (item) { return item.rejected; })
      .map(function (item) { return pendingAudio.asrWindows[item.windowIdx]; });
    pendingAudio.unreliableMarkRanges = normalized.gates.s12_6.evidence.unreliable_mark_ranges || [];
    pendingAudio.speechDensity = normalized.gates.s12_6.evidence.density || null;
    pendingAudio.clockCompressedRanges = normalized.blindRanges || [];
    pendingAudio.asrSummary = normalized.summary;
    pendingAudio.parsed = parsed;
    pendingAudio.validation = window.AsrTranscript.validateSegments(parsed.segments, pendingAudio.durationSec);
    if (normalized.gates.s12_7.verdict !== "PASS") {
      pendingAudio.validation.timingOk = false;
      pendingAudio.validation.dropReason = "LOCAL_S12_7_FAIL";
    }
    if (!parsed.segments.length) { setStatus("studio.import.errNoSpeech"); return false; }
    showPreview({
      kind: "audio", source: pendingAudio.name, method: "local-faster-whisper",
      model: window.LocalAsrNormalizer.MODEL_ID,
      warnings: parsed.warnings.concat(pendingAudio.validation.timingOk ? [] : ["ASR_TIMING_INVALID"]),
      summary: pendingAudio.asrSummary,
      text: pendingAudio.validation.segments.map(function (segment) { return segment.text; }).join("\n"),
    });
    return true;
  }

  async function lockCanonicalMediaIdentity() {
    if (!pendingAudio) return false;
    if (pendingAudio.isVideo && !window.MediaReadiness.canStartAsr(pendingAudio.mediaReadiness)) {
      setStatus("studio.import.mediaBlocksAsr");
      return false;
    }
    // RMA-2: these bytes were hashed incrementally while streaming into this exact
    // content-addressed OPFS file and matched the worker SHA before promotion. Reading a
    // 100–300 MiB file into one ArrayBuffer here would undo the mobile-safe handoff.
    if (pendingAudio.acquiredOpfsPath && pendingAudio.remoteAcquisition && pendingAudio.sha256) {
      var exists = await window.MediaStore.mediaExists(pendingAudio.acquiredOpfsPath);
      var expectedRemoteSha = pendingAudio.mediaReadiness && pendingAudio.mediaReadiness.canonical_sha256;
      if (exists && pendingAudio.sha256 === expectedRemoteSha) { pendingAudio.buf = null; return true; }
      pendingAudio.mediaReadiness = { outcome: "BLOCKED", reason: "acquired_opfs_identity_mismatch", next_action: "repeat-remote-acquisition" };
      renderMediaReadiness(); setStatus("studio.import.mediaShaMismatch"); return false;
    }
    var buf = await pendingAudio.file.arrayBuffer();
    var actualSha = await window.MediaStore.sha256Hex(buf);
    var expectedSha = pendingAudio.mediaReadiness && pendingAudio.mediaReadiness.canonical_sha256;
    if (pendingAudio.isVideo && expectedSha && actualSha !== expectedSha) {
      pendingAudio.mediaReadiness = { outcome: "BLOCKED", reason: "canonical_sha_mismatch", next_action: "repeat-media-preflight" };
      pendingAudio.buf = null;
      pendingAudio.sha256 = null;
      renderMediaReadiness();
      setStatus("studio.import.mediaShaMismatch");
      return false;
    }
    pendingAudio.buf = buf;
    pendingAudio.sha256 = actualSha;
    return true;
  }

  async function transcribeAudioLocal() {
    if (!pendingAudio) return;
    if (pendingAudio.isVideo && !window.MediaReadiness.canStartAsr(pendingAudio.mediaReadiness)) { setStatus("studio.import.mediaBlocksAsr"); return; }
    if (!window.LocalAsrClient.getPairingToken()) { setStatus("studio.import.localAsrPairingRequired"); return; }
    if (await pageIsStale()) { setStatus("studio.import.errStaleTab"); return; }
    setBusy(true);
    pendingAudio.localAttempted = true;
    localAsrRunController = new AbortController();
    try {
      if (!await lockCanonicalMediaIdentity()) return;
      localAsrClient = localAsrClient || new window.LocalAsrClient.Client();
      var completed = await localAsrClient.run(pendingAudio.file, {
        codeVersion: window.APP_VERSION || null,
        signal: localAsrRunController.signal,
        onStatus: localJobStatus,
        chooseAudioStream: chooseLocalAudioStream,
      });
      acceptLocalCompletion(completed);
    } catch (error) {
      var failure = localAsrFailure(error);
      pendingAudio.localFallbackReason = failure.reason;
      if (error && error.code === "LOCAL_ASR_CANCELED") setStatus("studio.import.localAsrCanceled");
      else if (error && error.code === "LOCAL_ASR_AUDIO_STREAM_REQUIRED") setStatus("studio.import.localAsrStreamRequired");
      else setStatus(failure.key);
    } finally {
      localAsrRunController = null;
      setBusy(false);
    }
  }

  function cancelLocalAsr() {
    if (localAsrRunController) localAsrRunController.abort();
  }

  async function retryLocalAsr() {
    if (!pendingAudio || !pendingAudio.localJobId || !pendingAudio.localResult || !localAsrClient) return;
    var plan = localRetryPlan(pendingAudio.localResult);
    if (!plan || !plan.chunkIndexes.length) return;
    var previous = pendingAudio.localResult;
    setBusy(true);
    localAsrRunController = new AbortController();
    try {
      var queued = await localAsrClient.retryChunks(
        pendingAudio.localJobId, plan.chunkIndexes, plan.reason
      );
      var completed = await localAsrClient.waitForJob(pendingAudio.localJobId, {
        codeVersion: window.APP_VERSION || null,
        signal: localAsrRunController.signal,
        onStatus: localJobStatus,
        chooseAudioStream: chooseLocalAudioStream,
      }, queued);
      var textRatio = localWordCount(previous) > 0
        ? localWordCount(completed.transcript) / localWordCount(previous) : 1;
      var improved = localGateScore(completed.transcript, plan.reason) > localGateScore(previous, plan.reason);
      if (!improved || textRatio < 0.85) {
        var retryButton = $("v3ImportLocalAsrRetry");
        if (retryButton) retryButton.hidden = true;
        setStatus("studio.import.localAsrRetryNotImproved");
        return;
      }
      acceptLocalCompletion(completed);
      setStatus("studio.import.localAsrRetryAccepted");
    } catch (error) {
      setStatus(error && error.code === "LOCAL_ASR_CANCELED"
        ? "studio.import.localAsrCanceled" : "studio.import.localAsrRetryFailed");
    } finally {
      localAsrRunController = null;
      setBusy(false);
    }
  }

  async function deleteLocalAsrJob() {
    if (!pendingAudio || !pendingAudio.localJobId || !localAsrClient) return;
    try {
      await localAsrClient.deleteJob(pendingAudio.localJobId);
      pendingAudio.localJobId = null;
      var button = $("v3ImportLocalAsrDelete");
      if (button) button.hidden = true;
      var retryButton = $("v3ImportLocalAsrRetry");
      if (retryButton) retryButton.hidden = true;
      setStatus("studio.import.localAsrDeleted");
    } catch (_) { setStatus("studio.import.localAsrDeleteFailed"); }
  }

  async function transcribeAudio() {
    if (!pendingAudio) return;
    if (pendingAudio.isVideo && !window.MediaReadiness.canStartAsr(pendingAudio.mediaReadiness)) { setStatus("studio.import.mediaBlocksAsr"); return; }
    if (selectedAudioProvider() === "local") return transcribeAudioLocal();
    pendingAudio.asrMethod = "gemini-asr";
    pendingAudio.asrModel = window.AsrTranscript.ASR_MODEL;
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    // Транскрипция длинного файла — десятки минут и реальные деньги владельца (R16); прогон
    // СТАРЫМ кодом стоит ровно столько же, а результат приходится выбрасывать. Проверка стоит
    // один дешёвый GET и делается ДО загрузки байтов.
    if (await pageIsStale()) { setStatus("studio.import.errStaleTab"); return; }
    setBusy(true);
    try {
      setStatus("studio.import.audioUploading");
      if (!await lockCanonicalMediaIdentity()) return;
      var A2 = window.AsrTranscript;
      var wins = A2.asrWindows(pendingAudio.durationSec);
      // S12.5 транспорт-развилка (диагноз DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29: модель на глубоких
      // офсетах одного длинного fileUri возвращает чужой контент с подделанными in-range метками —
      // все метко-ключёванные гейты слепы). Лечение by construction: mp3 с >1 окном режется по
      // фрейм-границам (Mp3Slice), КАЖДЫЙ вызов транскрипции получает ОТДЕЛЬНО вырезанный кусок
      // звука + plain ASR_PROMPT (без range) — модель физически не видит чужой звук, абсолютное
      // время = чанк-относительная метка + наш офсет из фрейм-карты (см. oneCall в runWindowedAsr).
      // Фолбэк ranged-file (видео, не-mp3, не-sliceable mp3, single-window) поведенчески НЕ
      // меняется — его пинуют существующие тесты.
      var sliceCtx = null;
      if (!pendingAudio.isVideo && wins.length > 1 && window.Mp3Slice &&
          (/^audio\/(mpeg|mp3)$/i.test(pendingAudio.mime) || /\.mp3$/i.test(pendingAudio.name || ""))) {
        var u8 = new Uint8Array(pendingAudio.buf);
        var map = window.Mp3Slice.buildFrameMap(u8);
        // не-sliceable (битый/экзотический mp3: мало фреймов или карта расходится с пробой
        // длительности >5%) → честный фолбэк на ranged-file, а не тихо кривые офсеты чанков (R11)
        if (window.Mp3Slice.isSliceable(map, pendingAudio.durationSec)) sliceCtx = { u8: u8, map: map };
      }
      var transcribeFn;
      if (sliceCtx) {
        pendingAudio.asrTransport = "sliced-mp3";
        // Резюм докладывает в ТОТ ЖЕ лог: готовые окна не перевызываются, их записи уже есть;
        // свежий выбор файла пересоздаёт pendingAudio → лог начинается заново.
        pendingAudio.sliceLog = pendingAudio.sliceLog || [];
        // a===null здесь не бывает: slice-транспорт включается ТОЛЬКО при >1 окна, а null-диапазон
        // шлёт лишь single-window путь. Полный ASR_PROMPT прилетает дефолтом GF.transcribeAudio
        // (promptText не передаём) — range-промта в этом транспорте нет вообще.
        transcribeFn = async function (a, b) {
          var from = window.Mp3Slice.byteForTime(sliceCtx.map, a);
          // Хвостовой чанк — до КОНЦА буфера: probe-длительность и фрейм-карта расходятся до
          // секунды, байты за последним offset-марком не должны потеряться.
          var to = (b >= sliceCtx.map.totalSec - 1)
            ? { byte: sliceCtx.u8.length, t: sliceCtx.map.totalSec }
            : window.Mp3Slice.byteForTime(sliceCtx.map, b);
          var blob = new Blob([sliceCtx.u8.subarray(from.byte, to.byte)], { type: "audio/mpeg" });
          var t0 = Date.now();
          var upc = await window.GeminiFiles.uploadFile(key, blob, "audio/mpeg");
          if (upc.state !== "ACTIVE") {
            await window.GeminiFiles.waitActive(key, upc.name,
              { timeoutMs: 60000 + Math.ceil(blob.size / 1048576) * 1000 });
          }
          var t1 = Date.now();
          var raw = await window.GeminiFiles.transcribeAudio(key, upc.fileUri, "audio/mpeg");
          pendingAudio.sliceLog.push({ a: a, b: b, byteFrom: from.byte, byteTo: to.byte,
            offsetSec: from.t, upMs: t1 - t0, asrMs: Date.now() - t1 }); // R9 провенанс чанка
          return { raw: raw, offsetSec: from.t }; // offsetSec — наш, из фрейм-карты; oneCall сдвинет
        };
      } else {
        pendingAudio.asrTransport = "ranged-file";
        pendingAudio.sliceLog = null;
        var up = await window.GeminiFiles.uploadFile(key, pendingAudio.file, pendingAudio.mime);
        setStatus("studio.import.audioProcessing");
        if (up.state !== "ACTIVE") {
          await window.GeminiFiles.waitActive(key, up.name, { timeoutMs: 60000 + Math.ceil(pendingAudio.file.size / 1048576) * 1000 });
        }
        transcribeFn = function (a, b) {
          return window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime,
            a === null ? undefined : { promptText: A2.ASR_RANGE_PROMPT(a, b) });
        };
      }
      setStatus("studio.import.audioTranscribing");
      var resumeFrom = (pendingAudio.windowResults && pendingAudio.windowResults.length) || 0;
      var result;
      try {
        result = await window.StudioImport.runWindowedAsr({
          durationSec: pendingAudio.durationSec,
          startWindow: resumeFrom,
          priorWindows: pendingAudio.windowResults || [],
          priorWindowsMeta: pendingAudio.windowMetaResults || null, // R9: брак/пропуски прошлого захода
          transcribe: transcribeFn,
          parse: A2.parseAsrResponse,
          onProgress: function (k, m) {
            if (m > 1) setStatus("studio.import.audioWindowProgress", k + "/" + m);
          },
        });
      } catch (e2) {
        if (e2.windowSegments) { // резюм со след. клика — сегменты И их провенанс (ревью S12.5)
          pendingAudio.windowResults = e2.windowSegments;
          pendingAudio.windowMetaResults = e2.windowsMeta || null;
        }
        throw e2;
      }
      pendingAudio.windowResults = null; // успех — резюм-состояние отработано
      pendingAudio.windowMetaResults = null;
      var parsed = { language: result.language, segments: result.segments, warnings: result.warnings };
      pendingAudio.asrWindows = result.windows;
      pendingAudio.asrSeams = result.seams || []; // S12.4 R9: провенанс швов (якорь/фолбэк)
      pendingAudio.coverageGaps = result.coverageGaps;
      pendingAudio.healedGaps = result.healedGaps;
      pendingAudio.rejectedRanges = result.rejectedRanges || []; // S12.5 R9: брак анти-реплей гейта
      // S12.6 R9: диапазоны со сжатыми метками (текст на месте, тайминг недостоверен) + замер
      // плотности, по которому это решено — чтобы следующая живая приёмка судила по числам.
      pendingAudio.unreliableMarkRanges = result.unreliableMarkRanges || [];
      pendingAudio.speechDensity = result.speechDensity || null;
      // S12.7: чанки, чьи часы остались сжатыми после починки — караоке там будет выключено.
      pendingAudio.clockCompressedRanges = result.clockCompressedRanges || [];
      // S12.5 T4 (R11): сводка считается ЗДЕСЬ, из структурных записей прогона, и дальше живёт
      // одним объектом на три роли — показ в превью, гейт подтверждения в useText, паспорт.
      // Одна цифра во всех трёх местах по построению: разойтись им нечем.
      pendingAudio.asrSummary = A2.summarizeAsrRun({
        durationSec: pendingAudio.durationSec, windows: result.windows,
        coverageGaps: result.coverageGaps, healedGaps: result.healedGaps,
        rejectedRanges: result.rejectedRanges, warnings: result.warnings,
        unreliableMarkRanges: result.unreliableMarkRanges, // S12.6: отдельный факт, не потеря
        clockCompressedRanges: result.clockCompressedRanges, // S12.7: караоке там выключено
      });
      if (!parsed.segments.length || parsed.warnings.includes("NO_SPEECH")) { setStatus("studio.import.errNoSpeech"); return; }
      pendingAudio.parsed = parsed;
      pendingAudio.validation = window.AsrTranscript.validateSegments(parsed.segments, pendingAudio.durationSec);
      showPreview({
        kind: "audio", source: pendingAudio.name, method: "gemini-asr",
        model: window.AsrTranscript.ASR_MODEL,
        warnings: parsed.warnings.concat(pendingAudio.validation.timingOk ? [] : ["ASR_TIMING_INVALID"]),
        summary: pendingAudio.asrSummary, // T4: превью рисует ЕЁ, useText гейтит по НЕЙ
        text: pendingAudio.validation.segments.map(function (s) { return s.text; }).join("\n"),
      });
    } catch (e) {
      var code = e && e.code;
      if (!code && e && (e.status != null)) code = window.GeminiError.classifyGeminiError(e).error_code;
      setStatus(errKey(code || "UPLOAD_FAILED"));
    } finally { setBusy(false); }
  }

  // ── S12.5 T4: ЧЕСТНАЯ СВОДКА ПРОГОНА В ПРЕВЬЮ ────────────────────────────────────────────────
  // Владелец видит, СКОЛЬКО записи попало в транскрипт, ДО того как нажмёт «→ В поле ввода».
  // Вся арифметика — в AsrTranscript.summarizeAsrRun (pure, юниты); здесь только форматирование:
  // второй источник чисел означал бы, что превью и паспорт могут разойтись.
  var SUMMARY_GAPS_SHOWN = 6; // на 380px длинный список диапазонов превращает блок в стену текста

  // Диапазон времени в RTL-абзаце БЕЗ bidi-изоляции показывается ивритскому читателю задом
  // наперёд: «33:00–1:00:00» рисуется как «1:00:00–33:00» (алгоритм bidi переставляет два
  // LTR-числа по направлению абзаца, тире между ними нейтрально). Проверено скриншотом he-локали
  // на 380px. Сводка, которая врёт о том, ГДЕ дыра, — тот же класс дефекта, что она чинит.
  // U+2066/U+2069 (LRI/PDI) держат диапазон LTR в любом контексте и невидимы в ru/en.
  function ltrRange(a, b) { return "\u2066" + a + "–" + b + "\u2069"; } // U+2066 LRI / U+2069 PDI

  function asrGapList(gaps) {
    var F = window.AsrTranscript.fmtClock;
    var shown = gaps.slice(0, SUMMARY_GAPS_SHOWN).map(function (g) { return ltrRange(F(g.fromSec), F(g.toSec)); });
    var rest = gaps.length - shown.length;
    return shown.join(", ") + (rest > 0 ? ", " + tr("studio.import.asrSummaryGapsMore", { n: rest }) : "");
  }

  function asrSummaryText(sum) {
    var F = window.AsrTranscript.fmtClock;
    var parts = [tr("studio.import.asrSummaryChunks", { ok: sum.windowsOk, total: sum.windowsTotal })];
    if (sum.level === "ok") {
      parts.push(tr("studio.import.asrSummaryCovered", { covered: F(sum.coveredSec) }));
      parts.push(tr("studio.import.asrSummaryNoGaps"));
    } else {
      if (sum.lostSec > 0) parts.push(tr("studio.import.asrSummaryLost", { pct: sum.lostPct }));
      if (sum.gaps.length) parts.push(tr("studio.import.asrSummaryGaps", { list: asrGapList(sum.gaps) }));
      if (sum.rejected) parts.push(tr("studio.import.asrSummaryRejected", { n: sum.rejected }));
      // S12.6: «тайминг ненадёжен» — ОТДЕЛЬНАЯ формулировка рядом с потерей, а не вместо неё.
      // Текст этих минут в транскрипте есть (объём окна это доказал), уехать может только
      // подсветка караоке — и сказать про это надо ровно так, иначе владелец снова прочитает
      // ненадёжный тайминг как потерю записи.
      if (sum.unreliable) {
        parts.push(tr("studio.import.asrSummaryUnreliable", { list: asrGapList(sum.unreliableRanges) }));
      }
      // S12.7: часы чанка сжаты, переспрос и дробление не помогли ⇒ караоке там ВЫКЛЮЧЕНО.
      // Своя строка, а не «может уезжать»: владелец должен знать, что подсветки не будет вовсе,
      // а текст при этом полный (см. summarizeAsrRun — почему это третий факт, а не оттенок).
      if (sum.clockCompressed) {
        parts.push(tr("studio.import.asrSummaryClockCompressed", { list: asrGapList(sum.clockCompressedRanges) }));
      }
      // Блок янтарный, а числовой потери нет — обязаны сказать, ПОЧЕМУ он янтарный (целостность
      // окон/предупреждения конвейера), иначе владелец видит тревогу без причины. Ненадёжный
      // тайминг сам себя объясняет строкой выше — второй раз пугать «распознавание неполное»
      // (текст-то полный) значит врать.
      if (!sum.lostSec && !sum.rejected && !sum.unreliable && !sum.clockCompressed) parts.push(tr("studio.import.asrSummaryFlagged"));
    }
    if (sum.healed) parts.push(tr("studio.import.asrSummaryHealed", { n: sum.healed }));
    return parts.join(" · ");
  }

  function renderAsrSummary(sum) {
    var host = $("v3ImportProv");
    if (!host || !sum) return;
    var box = document.createElement("div");
    box.id = "v3ImportAsrSummary";
    // overflow-wrap:anywhere — список диапазонов на 380px обязан переноситься, а не растягивать
    // модал горизонтально (общая ловушка мобильной вёрстки этого проекта).
    var base = "font-size:12px; margin-top:6px; line-height:1.45; overflow-wrap:anywhere;";
    box.style.cssText = sum.level === "ok"
      ? base + "color:#6c757d;"
      : base + "padding:8px; border-radius:6px; " + (sum.level === "bad"
          ? "background:#fdecea; border:1px solid #f0b3ae; color:#a4231d;"
          : "background:#fff8e6; border:1px solid #f0d69a; color:#7a5a00;");
    box.textContent = (sum.level === "ok" ? "" : "⚠ ") + asrSummaryText(sum);
    host.appendChild(box);
  }

  // R11-гейт: потеря >5% (или подделка-реплей) НЕ проходит одним кликом. Паттерн подтверждения —
  // тот же, что у сметы мультичанка (index.html v3TranslateTableChunked): премиум-модал
  // v3ConfirmModal, с фолбэком на window.confirm (сам v3ConfirmModal падает в него же, если
  // разметки модала нет).
  async function confirmLossy(sum) {
    var title = tr("studio.import.asrSummaryConfirmTitle");
    var body = tr("studio.import.asrSummaryConfirmBody",
                  { pct: sum.lostPct, lost: window.AsrTranscript.fmtClock(sum.lostSec) }) +
               "\n\n" + asrSummaryText(sum);
    if (typeof window.v3ConfirmModal === "function") {
      return await window.v3ConfirmModal({ title: title, body: body, danger: true,
        okText: tr("studio.import.asrSummaryConfirmOk"),
        cancelText: tr("studio.import.asrSummaryConfirmCancel") });
    }
    return window.confirm(title + "\n\n" + body);
  }

  function showPreview(p) {
    pending = p;
    $("v3ImportPreview").value = p.text;
    var provKey = p.kind === "audio" && p.method === "local-faster-whisper"
      ? "studio.import.provAudioLocal"
      : { url: "studio.import.provUrl", image: "studio.import.provOcr", pdf: "studio.import.provPdf", docx: "studio.import.provDocx", audio: "studio.import.provAudio", captions: "studio.import.provCaptions" }[p.kind];
    var prov = tr(provKey) + " · " + p.source + (p.model ? " · " + p.model : "");
    if (p.warnings && p.warnings.length) prov += " · ⚠ " + tr("studio.import.warnCheck");
    $("v3ImportProv").textContent = prov; // сбрасывает и ранее добавленные дочерние блоки (сводка/хинт)
    if (p.summary) renderAsrSummary(p.summary); // S12.5 T4 — только аудио-путь

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
    // S12.2: errExtractBadJson is worded for photo-OCR ("try a clearer photo") — misinforms on the
    // audio path. By construction (see bisectWindow) runWindowedAsr never lets an ASR_BAD_JSON
    // error escape any more — it always resolves into either a retry, a bisection, or an honest
    // skippedRanges — so this mapping now only guards hypothetical future/other ASR_BAD_JSON
    // callers, but must stay honest regardless.
    ASR_TIMEOUT: "studio.import.errOverloaded", ASR_BAD_JSON: "studio.import.errAsrUnreliable",
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
    var provider = $("v3ImportAudioProvider");
    if (provider) provider.value = "gemini"; // experimental Local never changes the product default
    setLocalAsrConnectionState(false);
    setLocalAsrPairStatus(null);
    var deleteButton = $("v3ImportLocalAsrDelete");
    if (deleteButton) deleteButton.hidden = true;
    var retryButton = $("v3ImportLocalAsrRetry");
    if (retryButton) retryButton.hidden = true;
    refreshLocalAsrControls();
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
    if (window.RemoteMediaAcquisition && window.RemoteMediaAcquisition.reset) window.RemoteMediaAcquisition.reset();
    if (window.StudioMediaPackage && window.StudioMediaPackage.refreshWorkspaceUi) window.StudioMediaPackage.refreshWorkspaceUi();
  }
  function close() {
    var m = $("v3ImportModal");
    if (m) m.classList.add("hidden");
    cancelLocalAsr();
    if (mediaJobController) mediaJobController.abort();
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

  // Возвращает true, ТОЛЬКО если текст реально приземлён в поле ввода. Отказ владельца в
  // R11-подтверждении (потеря >5%) — это НЕ приземление, и вызывающий (useTextAndRetell) обязан
  // это различать, иначе после отмены открылся бы модал пересказа поверх ничего.
  async function useText(openCorrector) {
    if (!pending) return false;
    var text = ($("v3ImportPreview").value || "").trim(); // пользователь мог поправить в превью — это ок
    if (!text) { setStatus("studio.import.errEmpty"); return false; }
    // S12.5 T4: гейт судит по ТОЙ ЖЕ сводке, которую владелец видел в превью (pending.summary) —
    // не по пересчитанной здесь заново.
    if (pending.kind === "audio" && pending.summary && pending.summary.level === "bad") {
      var proceed = await confirmLossy(pending.summary);
      if (!proceed) return false;
    }
    var audioMetaForImport = null;
    if (pending.kind === "audio" && pendingAudio && pendingAudio.validation) {
      var lines = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var v = pendingAudio.validation;
      var editedAway = lines.length !== v.segments.length;
      // The raw track is provider evidence, not the edited preview. In particular, validated
      // seam marks may be null even though the provider supplied a finite (overlapping) mark;
      // mediaSegmentsForPromotion retains that assertion and marks only that segment blind.
      // Preview edits are applied later as an explicit corrected-track revision.
      var segs = mediaSegmentsForPromotion(pendingAudio.parsed.segments, v.segments);
      var dropReason = editedAway ? "PREVIEW_EDITED" : (v.timingOk ? null : v.dropReason);
      var transcriptOnly = pendingAudio.mediaReadiness && pendingAudio.mediaReadiness.outcome === "TRANSCRIPT_ONLY";
      var fileName = transcriptOnly ? null : (pendingAudio.acquiredOpfsPath || window.MediaStore.mediaFileName(pendingAudio.sha256, pendingAudio.mime, pendingAudio.name));
      // OPFS-запись; недоступна (старый Safari) → session-only blob + честный warning
      window.v3SessionMediaBlob = null;
      var acquiredAlreadyStored = !transcriptOnly && pendingAudio.acquiredOpfsPath && await window.MediaStore.mediaExists(pendingAudio.acquiredOpfsPath);
      var saved = acquiredAlreadyStored ? { ok: true, alreadyStored: true }
        : (!transcriptOnly && window.MediaStore.canWrite()
          ? await window.MediaStore.saveMedia(pendingAudio.buf, fileName)
          : { ok: false, reason: transcriptOnly ? "TRANSCRIPT_ONLY" : "NO_CREATE_WRITABLE" });
      audioMetaForImport = {
        v: 1,
        media: { opfsPath: saved.ok ? fileName : null, sessionOnly: !saved.ok && !transcriptOnly, sha256: transcriptOnly ? null : pendingAudio.sha256,
                 mime: transcriptOnly ? null : pendingAudio.mime, sizeBytes: transcriptOnly ? null : pendingAudio.file.size,
                 durationSec: pendingAudio.durationSec, originalName: pendingAudio.name,
                 acquisition: pendingAudio.remoteAcquisition || undefined,
                 compatibility: transcriptOnly
                   ? { outcome: "TRANSCRIPT_ONLY", bind_outcome: "not_bound", playback: "not_prepared" }
                   : window.MediaReadiness.compatibilityEvidence(pendingAudio.mediaReadiness) || undefined },
        asr: { method: pendingAudio.asrMethod || "gemini-asr",
               model: pendingAudio.asrModel || window.AsrTranscript.ASR_MODEL, at: new Date().toISOString(),
               language: pendingAudio.parsed.language, filesApi: pendingAudio.asrMethod !== "local-faster-whisper",
               warnings: pendingAudio.parsed.warnings,
               transport: pendingAudio.asrTransport || "ranged-file", // S12.5 R9: sliced-mp3 | ranged-file
               chunks: pendingAudio.sliceLog || [], // S12.5 R9: {a,b,byteFrom,byteTo,offsetSec,upMs,asrMs} на чанк
               windows: pendingAudio.asrWindows || null,
               seams: pendingAudio.asrSeams || [],
               coverageGaps: pendingAudio.coverageGaps || [],
               healedGaps: pendingAudio.healedGaps || [],
               // S12.6 R9: где текст на месте, а метки сжаты (караоке в этих диапазонах уедет) +
               // замер плотности прогона, которым это доказано.
               unreliableMarkRanges: pendingAudio.unreliableMarkRanges || [],
               speechDensity: pendingAudio.speechDensity || null,
               // S12.7 R9: чанки, чьи часы остались сжатыми ПОСЛЕ переспроса и дробления. Это
               // не «предупреждение на будущее», а вход гейта караоке: v3AttachAudioTiming
               // отказывается строить тайминг, когда такой диапазон есть (R11).
               clockCompressedRanges: pendingAudio.clockCompressedRanges || [],
               // S12.5 R9: диапазоны, забракованные анти-реплей гейтом (окно/добор) — почему
               // соответствующие дыры остались открытыми; сводка прогона (T4) читает отсюда.
               rejectedRanges: pendingAudio.rejectedRanges || [],
               // S12.5 T4 R9: сводка — ровно та, что была показана владельцу перед подтверждением
               // (одно вычисление, три потребителя), и штамп КОДА, которым сделан прогон. Отсутствие
               // штампа стоило диагностической сессии 2026-07-29 целой гипотезы (H1 stale-tab):
               // «каким кодом это сделано» восстанавливали feature-детекцией в живой вкладке.
               summary: pendingAudio.asrSummary || null,
               codeVersion: window.APP_VERSION || null,
               selectedProvider: pendingAudio.cloudFallbackConsent ? "local"
                                : (pendingAudio.asrMethod === "local-faster-whisper" ? "local" : "gemini"),
               actualProvider: pendingAudio.asrMethod === "local-faster-whisper" ? "local-faster-whisper" : "gemini",
               fallbackReason: pendingAudio.cloudFallbackConsent && pendingAudio.cloudFallbackConsent.reason,
               fallbackConsent: pendingAudio.cloudFallbackConsent || undefined,
               localJobId: pendingAudio.localJobId || undefined,
               normalizationSha256: pendingAudio.asrMethod === "local-faster-whisper" && pendingAudio.localResult && pendingAudio.localResult.normalization_sha256,
               gates: pendingAudio.asrMethod === "local-faster-whisper" && pendingAudio.localResult && pendingAudio.localResult.gates,
               runtime: pendingAudio.asrMethod === "local-faster-whisper" && pendingAudio.localResult && pendingAudio.localResult.provenance && pendingAudio.localResult.provenance.runtime },
        segments: segs, timing: null, timingDropReason: dropReason,
      };
      if (!saved.ok && !transcriptOnly) window.v3SessionMediaBlob = pendingAudio.file;
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
                    warnings: pending.warnings || [], acquisition: pendingCaptions.acquisition || undefined },
        video: pendingCaptions.video || undefined,
        segments: cEdited ? cl.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
                          : ps.map(function (s, k) { return { i: k, start: s.start, text: cl[k] }; }),
        timing: null,
        timingDropReason: cEdited ? "PREVIEW_EDITED" : null,
      };
      // L3a: retained only long enough to create the browser-local immutable raw track.
      // It is removed from the compatibility passport before that passport can enter sync/export.
      if (pendingCaptions.rawSource) captionsMetaForImport.rawSource = pendingCaptions.rawSource;
      if (cEdited) toast("studio.import.audioTimingDropped", "warning");
    }
    var importMeta = {
      kind: pending.kind, source: pending.source, method: pending.method, model: pending.model,
      warnings: pending.warnings, at: new Date().toISOString(), textSnapshot: text,
      audio: audioMetaForImport || undefined,
      captions: captionsMetaForImport || undefined,
    };
    var mediaPackage = null;
    if ((audioMetaForImport || captionsMetaForImport) && window.StudioMediaPackage) {
      try {
        mediaPackage = await window.StudioMediaPackage.createFromImportMeta(importMeta);
        var projection = window.StudioMediaPackage.buildCompatibilityProjection(mediaPackage.revision, {
          kind: mediaPackage.input.kind, media: mediaPackage.input.media,
        });
        importMeta.media_package_ref = projection.media_package_ref;
        if (audioMetaForImport) importMeta.audio = Object.assign({}, audioMetaForImport, projection.audio);
        if (captionsMetaForImport) importMeta.captions = Object.assign({}, captionsMetaForImport, projection.captions);
        if (importMeta.captions) delete importMeta.captions.rawSource;
        if (window.StudioMediaPackage.setActiveWorkspace) await window.StudioMediaPackage.setActiveWorkspace(projection.media_package_ref);
        else window.v3LastMediaPackageRef = projection.media_package_ref;
        // The exact corrected revision, not the old merged preview, becomes table input.
        text = mediaPackage.revision.segments.map(function (s) { return s.text; }).join("\n");
        importMeta.textSnapshot = text;
      } catch (e) {
        importMeta.media_package_error = { code: (e && e.code) || "MEDIA_PACKAGE_CREATE_FAILED" };
        if (importMeta.captions) delete importMeta.captions.rawSource;
        // Fail closed while the paid/local ASR result and file are still retained by this modal.
        // Landing a flat transcript here merely defers the failure to the >250 guard and silently
        // severs the only path back to the media. The owner can retry without rerunning ASR.
        setStatus("studio.mediaPackage.createBlocked", "(" + importMeta.media_package_error.code + ")");
        toast("studio.mediaPackage.createFailed", "error");
        return false;
      }
    }
    var input = $("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true })); // пусть существующие слушатели Студии отработают
    // B+C: import is a NEW source, never an edit of whichever saved card happened to be
    // active before the modal opened. The input event marks a draft while preserving the old
    // baseTextId; clear that pointer immediately so Save cannot UPDATE an unrelated card.
    try { if (window.v3SessionSet) window.v3SessionSet(importSessionResetPatch()); } catch (_) {}
    window.v3LastImportMeta = importMeta;
    close();
    toast(pending.warnings && pending.warnings.length ? "studio.import.warnCheck" : "studio.import.done",
          pending.warnings && pending.warnings.length ? "warning" : "success");
    if (openCorrector && mediaPackage && window.StudioMediaEditor) {
      await window.StudioMediaEditor.open(mediaPackage.package.corrected_track_id);
    }
    return true;
  }

  async function useTextAndCorrect() { return useText(true); }

  // W2-S11: «→ В поле ввода» + сразу открыть модал пересказа (шорткат превью импорта).
  async function useTextAndRetell() {
    var t2 = ($("v3ImportPreview").value || "").trim();
    if (!t2) { setStatus("studio.import.errEmpty"); return; }
    var landed = await useText(); // штатное приземление С паспортом импорта (derivedFrom возьмёт его)
    // S12.5 T4: владелец мог отменить R11-подтверждение потерь — тогда в поле ввода ничего не
    // легло, и открывать модал пересказа не над чем.
    if (landed && window.StudioRetell) window.StudioRetell.openFromComposer();
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

  function acceptCaptions(parsed, origin, fileName, rawSource) {
    if (!parsed.ok) { setStatus(errKey(parsed.error_code)); return; }
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.parsed = parsed;
    pendingCaptions.origin = origin;
    pendingCaptions.fileName = fileName || null;
    pendingCaptions.rawSource = rawSource == null ? null : String(rawSource);
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

  function remoteAcquisitionPassport(acquired) {
    var source = acquired.source || {}, option = acquired.option || {}, receipt = acquired.receipt || {};
    return {
      v: 1,
      provider: "youtube",
      source: { video_id: source.video_id || null, canonical_url: source.canonical_url || null,
                title: source.title || null, duration_seconds: source.duration_seconds || null },
      selection: { id: option.id || null, kind: option.kind || null, quality: option.quality || null,
                   container: option.container || null, has_audio: option.has_audio === true,
                   format_ids: (option.format_ids || []).slice() },
      rights_basis: { kind: "rights_holder_permission" },
      output_sha256: receipt.output_sha256 || (acquired.stored && acquired.stored.sha256) || null,
      output_size_bytes: receipt.output_size_bytes || (acquired.stored && acquired.stored.sizeBytes) || null,
      worker_runtime: receipt.worker_runtime || null,
      device_receipt: { stored_in_studio_opfs: receipt.stored_in_studio_opfs === true,
                        owner_saved_copy: receipt.owner_saved_copy === true,
                        deletion_receipt: receipt.deletion_receipt || null },
    };
  }

  async function acceptRemoteAcquisition(acquired) {
    if (!acquired || !acquired.stored || !acquired.receipt || !acquired.option) throw new Error("REMOTE_ACQUISITION_INVALID");
    var path = acquired.stored.opfsPath, file = await window.MediaStore.readMedia(path);
    if (!file) throw new Error("REMOTE_ACQUISITION_FILE_MISSING");
    var sha = String(acquired.receipt.output_sha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha) || sha !== String(acquired.stored.sha256 || "").toLowerCase()) throw new Error("REMOTE_ACQUISITION_SHA_MISMATCH");
    if (Number(file.size) !== Number(acquired.receipt.output_size_bytes)) throw new Error("REMOTE_ACQUISITION_SIZE_MISMATCH");
    var option = acquired.option, isVideo = option.kind === "video", mime = acquired.stored.mimeType || (isVideo ? "video/mp4" : "audio/mp4");
    var readiness = isVideo ? {
      outcome: "READY", state: "COMPLETE", canonical_sha256: sha, canonical_name: acquired.downloadName,
      bind_outcome: "bound_pending_import", target_contract: "linguistpro-mobile-v1",
      codec_summary: { container: "mp4", faststart: true, video_codec: "h264", audio_codec: "aac",
                       height: option.quality || null, sdr: true },
      disk_sufficient: true, cleanup_receipt: acquired.receipt.deletion_receipt || null,
    } : { outcome: "AUDIO_READY", state: "COMPLETE", canonical_sha256: sha,
          canonical_name: acquired.downloadName, bind_outcome: "bound_pending_import" };
    pendingAudio = { file: file, originalFile: file, buf: null, sha256: sha, mime: mime,
      durationSec: acquired.source && acquired.source.duration_seconds || null,
      name: acquired.downloadName || file.name, parsed: null, validation: null, isVideo: isVideo,
      mediaReadiness: readiness, mediaJobId: null, windowResults: null, windowMetaResults: null,
      asrTransport: null, sliceLog: null, acquiredOpfsPath: path,
      remoteAcquisition: remoteAcquisitionPassport(acquired) };
    renderAudioMeta(); updateAudioActionLabel();
    var info = $("v3ImportAudioInfo"); if (info) info.hidden = false;
    refreshLocalAsrControls(); renderMediaReadiness();
    return { ok: true, opfsPath: path, sha256: sha };
  }

  async function acceptRemoteCaptions(acquired) {
    var file = await window.MediaStore.readMedia(acquired && acquired.stored && acquired.stored.opfsPath);
    if (!file || file.size > MAX_FILE_BYTES) throw new Error("REMOTE_CAPTIONS_INVALID");
    var raw = await file.text(), parsed = window.CaptionsParse.parse(raw);
    if (acquired.option && acquired.option.source_kind === "auto" && parsed.ok) parsed.kindHint = "auto";
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.video = { platform: "youtube", videoId: acquired.source.video_id, url: acquired.source.canonical_url };
    pendingCaptions.acquisition = remoteAcquisitionPassport(acquired);
    acceptCaptions(parsed, "remote-worker", acquired.downloadName || file.name, raw);
    return { ok: !!parsed.ok };
  }

  function recordRemoteSavedCopy(receipt) {
    if (!pendingAudio || !pendingAudio.remoteAcquisition) return false;
    pendingAudio.remoteAcquisition.device_receipt.owner_saved_copy = true;
    pendingAudio.remoteAcquisition.device_receipt.owner_saved_copy_receipt = receipt || null;
    return true;
  }

  function onCaptionsFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var reader = new FileReader();
    reader.onerror = function () { setStatus("studio.import.errGeneric"); };
    reader.onload = function () {
      var raw = String(reader.result || "");
      acceptCaptions(window.CaptionsParse.parse(raw), "file", file.name, raw);
    };
    reader.readAsText(file, "utf-8");
  }

  function useCaptionsPaste() {
    var raw = ($("v3ImportCaptionsPaste").value || "");
    if (!raw.trim()) { setStatus("studio.import.errCaptionsEmpty"); return; }
    acceptCaptions(window.CaptionsParse.parse(raw), "paste", null, raw);
  }

  window.StudioImport = { open: open, close: close, switchTab: switchTab,
                           fetchUrl: fetchUrl, fetchUrlOrVideo: fetchUrlOrVideo, mountVideoFromField: mountVideoFromField,
                           onFileChosen: onFileChosen, onAudioChosen: onAudioChosen, transcribeAudio: transcribeAudio,
                           onAudioProviderChanged: onAudioProviderChanged, pairLocalAsr: pairLocalAsr,
                           onLocalAsrTokenChanged: onLocalAsrTokenChanged,
                           cancelLocalAsr: cancelLocalAsr, retryLocalAsr: retryLocalAsr,
                           deleteLocalAsrJob: deleteLocalAsrJob,
                           startMediaPreflight: startMediaPreflight, prepareMedia: prepareMedia,
                           cancelMediaJob: cancelMediaJob, runMediaDeviceGate: runMediaDeviceGate,
                           chooseTranscriptOnly: chooseTranscriptOnly,
                           refreshLocalAsrControls: refreshLocalAsrControls,
                           onCaptionsFileChosen: onCaptionsFileChosen, useCaptionsPaste: useCaptionsPaste,
                           acceptRemoteAcquisition: acceptRemoteAcquisition, acceptRemoteCaptions: acceptRemoteCaptions,
                           recordRemoteSavedCopy: recordRemoteSavedCopy,
                           useText: useText, useTextAndCorrect: useTextAndCorrect,
                           useTextAndRetell: useTextAndRetell,
                           chooseTrackHint: chooseTrackHint, runWindowedAsr: runWindowedAsr,
                           clipSegmentsToRange: clipSegmentsToRange, ASR_CLIP_TOLERANCE_SEC: ASR_CLIP_TOLERANCE_SEC,
                           mediaSourceSha: mediaSourceSha, rowEditMetaForSave: rowEditMetaForSave,
                           restorePortableRowIdentity: restorePortableRowIdentity,
                           importSessionResetPatch: importSessionResetPatch,
                           mediaSegmentsForPromotion: mediaSegmentsForPromotion,
                           // Рендер сводки прогона — тем же путём, что рисует превью. Экспортируется,
                           // чтобы обязательная 380px-проверка вёрстки (правило проекта) снимала
                           // скриншот НАСТОЯЩЕГО блока, а не его копии в тестовом скрипте: копия
                           // разошлась бы с оригиналом ровно тогда, когда это перестанут замечать.
                           renderAsrSummary: renderAsrSummary };
})();
