// public/js/media-host.js
// Room media player (spec docs/superpowers/specs/2026-08-04-room-media-player-design.md).
// ОБЩИЙ паспорт-пайплайн медиа для ОБЕИХ поверхностей (Студия index.html + Зал library.html) —
// извлечён из inline-кода index.html (24103-24736) БЕЗ изменения логики, чтобы honesty-правила
// (K1-карантин, K3-выравнивание, blind-диапазоны S12.7, R9-провенанс) не разъезжались между
// поверхностями. Dual-export по образцу studio-media-karaoke.js: pure-часть тестируется в Node
// (tests/mediaHost.test.js), DOM-хелперы живут только в браузере.
(function () {
  "use strict";

  // W2-S5a: паспорт медиа лежит в слоте `audio` (импорт аудио/видео-файла, S4) или `captions`
  // (импорт субтитров, S5a). Внутренняя форма одна и та же — {v, segments, timing,
  // timingDropReason, media?}. ЕДИНСТВЕННАЯ точка доступа: любой новый консьюмер обязан
  // ходить сюда, иначе одна из поверхностей молча потеряет тайминг (урок gate-consumers-sweep).
  function passport(holder) {
    if (!holder || typeof holder !== "object") return null;
    return holder.audio || holder.captions || null;
  }

  // timingDropReason: ДВА РАЗНЫХ КЛАССА ПРИЧИН на одном поле (ревью K1 2026-07-30).
  // «Утверждённые» причины (PREVIEW_EDITED / ASR_TIMING_INVALID) — факты САМОГО импорта:
  // сегменты уже непригодны, никакой ответ переводчика этого не изменит. «Производные» (ниже) —
  // вывод ОДНОГО ответа translate-table; жить дольше своего ответа они не имеют права.
  var DERIVED_TIMING_DROPS = ["NO_SEGMENT_MAPPING", "SEG_MAPPING_LOST"];
  function isDerivedTimingDrop(reason) { return DERIVED_TIMING_DROPS.indexOf(reason) !== -1; }

  // S12.7: диапазоны, чьи часы прогон признал сжатыми и НЕ смог вылечить. Единственный
  // источник — паспорт прогона (`asr.clockCompressedRanges`): вердикт выносился по СЫРЫМ окнам,
  // которых здесь уже нет. Отсутствие поля = «не судили» — молчим, а не объявляем всё сжатым (R11).
  function clockBlindRanges(audio) {
    var raw = audio && audio.asr && audio.asr.clockCompressedRanges;
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (r) { return r && typeof r.fromSec === "number" && typeof r.toSec === "number" && r.toSec > r.fromSec; })
              .map(function (r) { return { fromSec: r.fromSec, toSec: r.toSec }; });
  }

  // K3: паспорт медиа мог быть сохранён в ДРУГУЮ колонку. «Сохранить как новый» пишет
  // tableModelMeta в `source_meta_json`, «Обновить карточку» — в `table_model_meta_json`
  // (замер на живой карточке владельца 2026-07-30: table_model_meta_json = NULL,
  // source_meta_json = 130 КБ с полным паспортом). Фолбэк намеренно узкий: колонка принимается
  // ТОЛЬКО если в ней есть медиа-паспорт — у корпусных текстов в source_meta_json лежит {corpus:…}.
  function passportFromTextRow(textRow) {
    if (!textRow || typeof textRow !== "object") return null;
    var keys = ["table_model_meta_json", "tableModelMetaJson", "source_meta_json", "sourceMetaJson"];
    for (var k = 0; k < keys.length; k++) {
      var raw = textRow[keys[k]];
      if (!raw) continue;
      try {
        var p = passport(JSON.parse(String(raw)).source);
        if (p) return p;
      } catch (_) {}
    }
    return null;
  }

  function resolveDeps(deps) {
    var AT = deps && deps.AT;
    if (!AT && typeof window !== "undefined") AT = window.AsrTranscript;
    var appVersion = deps && deps.appVersion;
    if (appVersion == null && typeof window !== "undefined") appVersion = window.APP_VERSION || null;
    return { AT: AT || null, appVersion: appVersion || null };
  }

  // ── K3 (2026-07-30): ОЖИВЛЕНИЕ КАРАОКЕ У УЖЕ СОХРАНЁННОЙ КАРТОЧКИ ────────────────────────────
  // Связь «строка → сегмент» ВОССТАНАВЛИВАЕТСЯ ОФЛАЙН по тексту (AsrTranscript.alignRowsToSegments —
  // правило и оракул описаны там): ни одного сетевого запроса, ни цента.
  //
  // ПОЧЕМУ ПРОВЕРЕННЫЙ МАППИНГ ЗАМЕЩАЕТ СОХРАНЁННЫЙ ТАЙМИНГ (R11 «источник-истины > самоотчёт»).
  // Тайминг в паспорте — УТВЕРЖДЕНИЕ, сделанное когда-то другим кодом; живой замер показал, что
  // он бывает уверенно неверным и при этом НЕ ловится карантином K1. Результат выравнивания —
  // ДОКАЗАТЕЛЬСТВО с собственным оракулом. Если выравнивание НЕ сошлось — сохранённый тайминг
  // остаётся ровно таким, каким был (мы не узнали ничего нового, R11: не ухудшать).
  //
  // R9 (derived ≠ asserted): восстановленный тайминг помечается timingSource="aligned-offline" +
  // timingAlign{версия ядра, счётчики, что было до него}. В БД он НЕ пишется: детерминированно
  // пересчитывается при каждом открытии за миллисекунды.
  function alignSavedTimingOffline(audio, rows, deps) {
    if (!audio) return;
    // Утверждённые причины импорта (PREVIEW_EDITED / ASR_TIMING_INVALID) — факты о САМИХ метках:
    // выравнивание строк их не опровергает, поэтому молчим.
    if (audio.timingDropReason && !isDerivedTimingDrop(audio.timingDropReason)) return;
    var segs = Array.isArray(audio.segments) ? audio.segments : [];
    var list = Array.isArray(rows) ? rows : [];
    if (segs.length < 2 || list.length < 2) return;
    var d = resolveDeps(deps);
    var AT = d.AT;
    if (!AT || typeof AT.alignRowsToSegments !== "function" || typeof AT.buildRowTiming !== "function") return;
    // Идемпотентность: та же таблица второй раз не пересчитывается — важно не столько ради 20 мс,
    // сколько ради КОНТРАКТА ССЫЛОЧНОГО РАВЕНСТВА entries (StudioMediaKaraoke.start/bind решают
    // resume-vs-restart строгим ===): новый массив на каждом вызове превращал бы resume в перезапуск.
    if (audio.timingAlign && audio.timingAlign.rows === list.length &&
        audio.timingAlign.segments === segs.length && audio.timingAlign.v === AT.ALIGN_VERSION &&
        audio.timingMap && Array.isArray(audio.timingMap.row_seg_idx) &&
        audio.timingMap.row_seg_idx.length === list.length) return;
    var texts = list.map(function (r) { return String((r && (r.he || r.he_plain || r.hebrew)) || ""); });
    var al = AT.alignRowsToSegments(texts, segs);
    var prov = { v: AT.ALIGN_VERSION, at: new Date().toISOString(), rows: list.length,
                 segments: segs.length, ok: !!al.ok, reason: al.reason || null,
                 alignedSegments: al.alignedSegments, alignedRows: al.alignedRows,
                 codeVersion: d.appVersion };
    if (!al.ok) {
      audio.timingAlign = prov;                  // R9: вердикт выравнивания виден ВСЕГДА, отдельным полем
      if (!audio.timing) {                       // тайминга нет — честно объясняем, почему его нет
        if (!audio.timingDropReason) audio.timingDropReason = "SEG_MAPPING_LOST";
        // Диагноз, поставленный РАНЬШЕ (карантин K1 → DEGENERATE_1_TO_1), точнее и первичнее.
        if (!audio.timingDropDetail) audio.timingDropDetail = "ALIGN_" + (al.reason || "FAILED");
      }
      return;
    }
    // S12.7: тот же гейт сжатых часов, что и на свежем ответе. Выравнивание доказывает «строка
    // принадлежит своему сегменту», но НЕ доказывает, что метка сегмента верна.
    var timing = AT.buildRowTiming(segs, al.rowSegIdx, clockBlindRanges(audio));
    if (!timing) {                                // маппинг доказан, но меток <2 — записывать нечего
      prov.entries = 0;
      audio.timingAlign = prov;
      if (!audio.timing && !audio.timingDropReason) {
        audio.timingDropReason = "SEG_MAPPING_LOST";
        audio.timingDropDetail = "ALIGN_NO_ENTRIES";
      }
      return;
    }
    prov.entries = timing.entries.length;
    prov.replaced = !!audio.timing;               // R9: заменили непроверяемое утверждение
    audio.timing = timing;
    audio.timingSource = "aligned-offline";
    audio.timingAlign = prov;
    audio.timingMap = Object.assign({}, audio.timingMap || {}, {
      source: "aligned-offline", rows: list.length, segments: segs.length,
      row_seg_idx: al.rowSegIdx.slice(), align_version: AT.ALIGN_VERSION,
    });
    audio.timingDropReason = null;
    audio.timingDropDetail = null;
  }

  // Восстановление паспорта при открытии сохранённой карточки: K1-карантин вырожденного тайминга,
  // сохранённого ДО фикса (AsrTranscript.timingLooksDegenerate — точный отпечаток, не порог),
  // затем K3-довыравнивание. Обе поверхности (Студия reload-путь, Зал openReader) обязаны звать
  // ЭТУ функцию — вторая реализация правил и есть тот дрейф, ради которого модуль извлечён.
  function restoreForRows(audio, rows, deps) {
    if (!audio) return;
    var list = Array.isArray(rows) ? rows : [];
    var AT = resolveDeps(deps).AT;
    if (audio.timing && AT && typeof AT.timingLooksDegenerate === "function") {
      if (AT.timingLooksDegenerate(audio.timing, audio.segments, list.length)) {
        audio.timing = null;
        audio.timingDropReason = "SEG_MAPPING_LOST";
        audio.timingDropDetail = "DEGENERATE_1_TO_1";
      }
    }
    try { alignSavedTimingOffline(audio, list, deps); } catch (_) {}
  }

  var PURE = {
    passport: passport,
    DERIVED_TIMING_DROPS: DERIVED_TIMING_DROPS,
    isDerivedTimingDrop: isDerivedTimingDrop,
    clockBlindRanges: clockBlindRanges,
    passportFromTextRow: passportFromTextRow,
    alignSavedTimingOffline: alignSavedTimingOffline,
    restoreForRows: restoreForRows,
  };

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = PURE;
    return;
  }

  window.MediaHost = PURE;
  if (typeof module !== "undefined" && module.exports) module.exports = PURE;
})();
