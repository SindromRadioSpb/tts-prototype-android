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
    var MR = deps && deps.MR;
    if (!MR && typeof window !== "undefined") MR = window.MaterialRevisionCore;
    if (!MR && typeof require === "function") { try { MR = require('./material-revision-core.js'); } catch (_) {} }
    var appVersion = deps && deps.appVersion;
    if (appVersion == null && typeof window !== "undefined") appVersion = window.APP_VERSION || null;
    return { AT: AT || null, MR: MR || null, appVersion: appVersion || null };
  }

  // ── КОМПОЗИТНЫЕ ПАСПОРТА (Import Center / portable-learning-package, живой кейс
  // «В сокрытии - 1» 2026-08-05): сегменты несут start_ms/end_ms (+caption_segment_id),
  // а timing — БУЛЕВУ сводку «у реплик есть метки», не играбельный {entries}. Классический
  // пайплайн (align/buildRowTiming) работает в секундах — даём единый секундный вид.
  function isCompositeSegments(segs) {
    return Array.isArray(segs) && segs.length > 0 && !!segs[0] &&
           segs[0].start == null && segs[0].start_ms != null;
  }
  function segmentsForTiming(audio) {
    var segs = audio && Array.isArray(audio.segments) ? audio.segments : [];
    if (!isCompositeSegments(segs)) return segs;
    return segs.map(function (s, k) {
      return { i: k, start: (Number(s && s.start_ms) || 0) / 1000,
               end: (Number(s && s.end_ms) || 0) / 1000, text: String((s && s.text) || "") };
    });
  }

  // Позиционная идентичность композитного превью: Import Center строит таблицу «одна строка =
  // одна реплика», т.е. соответствие УТВЕРЖДЕНО построением материала (R9 asserted), а не
  // выведено. Строгий K3-align отклоняет ВСЁ караоке из-за одного правленого слова (живой
  // замер: 431/432 строк пословно равны, строка 398 — междометие с лишней буквой). Правило
  // align НЕ ослабляется; позиционный маппинг применяется ТОЛЬКО когда:
  //   (а) сегменты композитные (иначе 1:1 — как раз запрещённая догадка K1),
  //   (б) строк РОВНО столько же, сколько реплик, и их ≥ 8,
  //   (в) почти все строки ПОСЛОВНО равны своей реплике (несовпадений ≤ max(2, 5%)).
  // ДОПУСК 5% (был 1%, поднят 2026-08-05 по живому замеру владельца): карточка «9 сезон | Яир
  // Голан | Кан 11» — 554 реплики = 554 строки, расходятся 11 строк (2%), и все расхождения —
  // варианты РАСПОЗНАВАНИЯ одного слова (ניגשו/היגשו, מרצ/מרץ, עונה/קונה). Порог 1% (=5,5 строк)
  // отказывал на волосок и гасил караоке целиком. Текстовая сверка здесь — предохранитель от
  // ЧУЖОГО материала (перемешанный/другой файл дал бы околонулевое совпадение), а не от
  // вариантов ASR; при 95% пословного совпадения и точном равенстве количеств подмена
  // невозможна. Условия (а) и (б) НЕ ослаблены — именно они держат K1-инвариант.
  // Провенанс R9: timingSource='composite-positional' + счётчики matched/mismatched; вердикт
  // отказавшего align остаётся рядом в timingAlign.
  function compositePositionalTiming(audio, rows, deps) {
    var d = resolveDeps(deps), AT = d.AT;
    if (!AT || typeof AT.stitchNormalizeWords !== "function" || typeof AT.buildRowTiming !== "function") return false;
    var raw = Array.isArray(audio.segments) ? audio.segments : [];
    if (!isCompositeSegments(raw)) return false;
    var list = Array.isArray(rows) ? rows : [];
    if (list.length < 8 || list.length !== raw.length) return false;
    var segs = segmentsForTiming(audio);
    var matched = 0, mismatched = 0;
    for (var i = 0; i < list.length; i++) {
      var rw = AT.stitchNormalizeWords(String((list[i] && (list[i].he || list[i].he_plain || list[i].hebrew)) || "")).join(" ");
      var sw = AT.stitchNormalizeWords(segs[i].text).join(" ");
      if (rw && rw === sw) matched++; else mismatched++;
    }
    if (mismatched > Math.max(2, Math.ceil(list.length * 0.05))) return false;
    var rowSegIdx = list.map(function (_, k) { return k; });
    var timing = AT.buildRowTiming(segs, rowSegIdx, clockBlindRanges(audio));
    if (!timing) return false;
    audio.timing = timing;
    audio.timingSource = "composite-positional";
    audio.timingMap = Object.assign({}, audio.timingMap || {}, {
      source: "composite-positional", rows: list.length, segments: segs.length,
      row_seg_idx: rowSegIdx, matched: matched, mismatched: mismatched,
    });
    audio.timingDropReason = null;
    audio.timingDropDetail = null;
    return true;
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
    var segs = segmentsForTiming(audio);   // композитные ms-сегменты → секундный вид
    var list = Array.isArray(rows) ? rows : [];
    if (segs.length < 2 || list.length < 2) return;
    var d = resolveDeps(deps);
    var AT = d.AT;
    if (!AT || typeof AT.alignRowsToSegments !== "function" || typeof AT.buildRowTiming !== "function") return;
    // Идемпотентность: та же таблица второй раз не пересчитывается — важно не столько ради 20 мс,
    // сколько ради КОНТРАКТА ССЫЛОЧНОГО РАВЕНСТВА entries (StudioMediaKaraoke.start/bind решают
    // resume-vs-restart строгим ===): новый массив на каждом вызове превращал бы resume в перезапуск.
    if (audio.timingAlign && audio.timingAlign.rows === list.length &&
        audio.timingAlign.segments === segs.length &&
        (audio.timingAlign.v === AT.ALIGN_VERSION || audio.timingAlign.v === AT.ALIGN_PARTIAL_VERSION) &&
        audio.timingMap && Array.isArray(audio.timingMap.row_seg_idx) &&
        audio.timingMap.row_seg_idx.length === list.length) return;
    var texts = list.map(function (r) { return String((r && (r.he || r.he_plain || r.hebrew)) || ""); });
    var al = AT.alignRowsToSegments(texts, segs);
    var prov = { v: AT.ALIGN_VERSION, at: new Date().toISOString(), rows: list.length,
                 segments: segs.length, ok: !!al.ok, reason: al.reason || null,
                 alignedSegments: al.alignedSegments, alignedRows: al.alignedRows,
                 codeVersion: d.appVersion };
    if (!al.ok) {
      // W3: the strict verdict remains recorded, then an explicitly named per-row proof gets
      // its own chance. Sparse timing uses canonical segment ends as blind gap boundaries;
      // a row without proof is never painted as part of its neighbour's range.
      if (!isCompositeSegments(audio.segments) &&
          typeof AT.alignRowsToSegmentsPartialProven === "function" &&
          typeof AT.buildPartialProvenTiming === "function") {
        var partial = AT.alignRowsToSegmentsPartialProven(texts, segs);
        var built = AT.buildPartialProvenTiming(segs, partial.rowSegIdx, clockBlindRanges(audio));
        var coverage = d.MR && typeof d.MR.summarizeProvenAlignment === "function"
          ? d.MR.summarizeProvenAlignment(built.rowSegIdx, list.length)
          : { mapped_rows: built.mappedRows, total_rows: list.length,
              unmapped_rows: list.length - built.mappedRows,
              ratio: list.length ? built.mappedRows / list.length : 0,
              label: built.mappedRows + "/" + list.length,
              complete: list.length > 0 && built.mappedRows === list.length };
        if (built.timing) {
          prov = { v: AT.ALIGN_PARTIAL_VERSION, at: prov.at, rows: list.length,
            segments: segs.length, ok: true, mode: "partial-proven",
            strictReason: al.reason || null, reason: null,
            alignedSegments: null, alignedRows: coverage.mapped_rows,
            coverage: coverage, codeVersion: d.appVersion,
            entries: built.timing.entries.length, replaced: !!audio.timing };
          audio.timing = built.timing;
          audio.timingSource = "aligned-partial-proven";
          audio.timingAlign = prov;
          audio.timingMap = Object.assign({}, audio.timingMap || {}, {
            source: "aligned-partial-proven", rows: list.length, segments: segs.length,
            row_seg_idx: built.rowSegIdx.slice(), align_version: AT.ALIGN_PARTIAL_VERSION,
            coverage: coverage,
          });
          audio.timingDropReason = null; audio.timingDropDetail = null;
          return;
        }
        prov.partial = { mode: "partial-proven", version: AT.ALIGN_PARTIAL_VERSION,
          mappedRows: coverage.mapped_rows, totalRows: coverage.total_rows,
          coverage: coverage, reason: "NOT_ENOUGH_SAFE_TIMING_ENTRIES" };
      }
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
    // Портативный/композитный паспорт хранит timing БУЛЕВОЙ сводкой («у реплик есть метки»),
    // а не {entries} — играть по нему нечем: честно считаем «тайминга нет» и строим заново.
    if (audio.timing && !Array.isArray(audio.timing.entries)) audio.timing = null;
    if (audio.timing && AT && typeof AT.timingLooksDegenerate === "function") {
      if (AT.timingLooksDegenerate(audio.timing, segmentsForTiming(audio), list.length)) {
        audio.timing = null;
        audio.timingDropReason = "SEG_MAPPING_LOST";
        audio.timingDropDetail = "DEGENERATE_1_TO_1";
      }
    }
    try { alignSavedTimingOffline(audio, list, deps); } catch (_) {}
    // Композитное превью «одна строка = одна реплика»: позиционная идентичность утверждена
    // построением — включается ТОЛЬКО когда align не сошёлся (доказательство сильнее).
    if (!audio.timing) { try { compositePositionalTiming(audio, list, deps); } catch (_) {} }
  }

  // ── L3a: ТОЧНАЯ ПРИВЯЗКА против ВЫВЕДЕННОГО ТАЙМИНГА ─────────────────────────────────────────
  // Живой дефект владельца 2026-08-05 («g_transl ynet»): привязка покрывает 8 строк из 236 и,
  // замещая ПОЛНЫЙ офлайн-тайминг (кнопка на каждой строке), оставляет 8 кнопок из 236.
  // Точная привязка сильнее ПО ПРИРОДЕ (утверждённые caption-id против выведенного выравнивания)
  // — но только ТАМ, ГДЕ ОНА ЕСТЬ. Неполная привязка не «точнее», она беднее, и менять на неё
  // полный тайминг — ровно то ухудшение, которое запрещает R11 (do-no-harm).
  //
  // Мера сравнения — ИГРАБЕЛЬНЫЕ СТРОКИ, т.е. сколько строк реально получит кнопку ▶︎:
  // у точной привязки это строки с caption-id (renderRowReplay режет остальные), у выведенного
  // тайминга — все строки таблицы. Ничья решается в пользу привязки (утверждение > вывод).
  function playableRows(p, rowCount) {
    if (!p || !p.timing || !Array.isArray(p.timing.entries) || !p.timing.entries.length) return 0;
    var map = p.timingMap;
    if (map && map.authority === "studio-exact-binding" && Array.isArray(map.row_caption_segment_ids)) {
      return map.row_caption_segment_ids.filter(Boolean).length;
    }
    if (map && map.source === "aligned-partial-proven" && Array.isArray(map.row_seg_idx)) {
      return map.row_seg_idx.filter(Number.isInteger).length;
    }
    var n = Number(rowCount);
    return n > 0 ? n : p.timing.entries.length;
  }
  function pickExactBindingPassport(prev, exact, rowCount) {
    if (!exact) return prev || null;
    var e = playableRows(exact, rowCount);
    var p = playableRows(prev, rowCount);
    if (e >= p) return exact;
    // R9: отказ виден в провенансе — бар/мета честно объясняют, что привязка неполная.
    try {
      prev.exactBindingSkipped = {
        playableRows: e, insteadOf: p,
        revisionId: (exact.timingMap && exact.timingMap.revision_id) || null,
        at: new Date().toISOString(),
      };
    } catch (_) {}
    return prev;
  }

  // ── ЧЕСТНАЯ ПРИЧИНА ОТСУТСТВИЯ КАРАОКЕ (одна реализация на обе поверхности) ──────────────────
  // До 2026-08-05 и Студия, и Зал показывали одну общую строку «Караоке недоступно для этого
  // импорта», пряча настоящий диагноз (владелец не мог понять, что именно сломалось, и решил,
  // что карточки надо пересобирать). Код причины у нас есть всегда — показываем его словами,
  // с числами выравнивания: по ним видно, разошёлся текст (пересобрать/переимпортировать) или
  // метки не проверяемы. Ключи общие для обеих поверхностей.
  var TIMING_WHY_KEY = "studio.media.timingWhy.";   // рядом с studio.media.noTiming/fileMissing
  function timingDropExplain(audio, t) {
    if (!audio) return "";
    if (audio.timing && Array.isArray(audio.timing.entries) && audio.timing.entries.length) return "";
    var tr = typeof t === "function" ? t : function (k) { return k; };
    var reason = String(audio.timingDropReason || "");
    var detail = String(audio.timingDropDetail || "");
    var key;
    if (detail === "DEGENERATE_1_TO_1") key = "degenerate";
    else if (detail.indexOf("ALIGN_") === 0) key = "diverged";
    else if (reason === "NO_EXACT_SEGMENT_MAPPING") key = "noExactMapping";
    else if (reason === "ASR_TIMING_INVALID") key = "asrInvalid";
    else if (reason === "PREVIEW_EDITED") key = "previewEdited";
    else if (reason === "NO_SEGMENT_MAPPING" || reason === "SEG_MAPPING_LOST") key = "noMapping";
    else if (reason) key = "unknown";
    else return "";
    var out = String(tr(TIMING_WHY_KEY + key) || "");
    // Числа приписываются ОТДЕЛЬНО от перевода: они обязаны дойти до владельца при любой локали
    // (и при неподгруженном i18n), а не зависеть от того, есть ли в строке {плейсхолдер}.
    var al = audio.timingAlign;
    if (al && Number(al.rows) > 0 && al.alignedRows != null) out += " · " + Number(al.alignedRows) + "/" + Number(al.rows);
    return out;
  }

  function timingCoverageExplain(audio, t) {
    var coverage = audio && audio.timingMap && audio.timingMap.coverage;
    if (!coverage || coverage.complete || !(Number(coverage.mapped_rows) > 0) || !(Number(coverage.total_rows) > 0)) return "";
    var tr = typeof t === "function" ? t : function (key) { return key; };
    return String(tr("studio.media.partialCoverage", {
      mapped: Number(coverage.mapped_rows), total: Number(coverage.total_rows),
    }) || "");
  }

  // D5 (2026-08-06): паспорт сегментов существует ТОЛЬКО в памяти вкладки. Переоткрыл сохранённый
  // транскрипт или перезагрузил страницу — v3LastImportMeta исчез, хотя ревизия с сегментами лежит
  // на устройстве. Текст в поле при этом построчно тождественен ей, но приложение считает его
  // «плоским»: чанк-путь не включается, и длинный транскрипт упирается в guard >250 строк без
  // выхода. Здесь — гейт честности для восстановления identity: тождество ПОЛНОЕ и построчное.
  // Одна расходящаяся строка означает, что текст переразбивали, и номер строки больше НЕ равен
  // номеру сегмента — тот же инвариант, что держит v3MediaLineIdentity.
  function revisionMatchesLines(segments, lines, deps) {
    var AT = resolveDeps(deps).AT;
    if (!AT || typeof AT.stitchNormalizeWords !== "function") return false;
    if (!Array.isArray(segments) || !Array.isArray(lines)) return false;
    if (!segments.length || segments.length !== lines.length) return false;
    for (var i = 0; i < segments.length; i++) {
      var a = AT.stitchNormalizeWords(String(lines[i] == null ? "" : lines[i])).join(" ");
      var b = AT.stitchNormalizeWords(String((segments[i] && segments[i].text) || "")).join(" ");
      if (!a || a !== b) return false;
    }
    return true;
  }

  // W1 (honest import -> card, 2026-08-06): pure authority gate for the browser
  // resolver. Ambient refs and the workspace catalog may both lead to the same
  // revision, so dedupe by revision identity first. Two DIFFERENT exact revisions
  // are an ambiguity, never a licence to pick the newest/first one.
  function resolveUniqueRevisionContext(candidates, lines, deps) {
    var input = Array.isArray(candidates) ? candidates : [];
    var unique = new Map();
    for (var i = 0; i < input.length; i++) {
      var candidate = input[i];
      var revision = candidate && candidate.revision;
      var pkg = candidate && candidate.package;
      var track = candidate && candidate.track;
      if (!revision || !pkg || !track) continue;
      if (!revisionMatchesLines(revision.segments, lines, deps)) continue;
      var key = String(revision.revision_id || "") || [
        String(pkg.package_id || ""), String(track.track_id || ""),
        String(revision.canonical_sha256 || ""),
      ].join("|");
      if (!key || unique.has(key)) continue;
      unique.set(key, candidate);
    }
    var matches = Array.from(unique.values());
    if (!matches.length) return { context: null, reason: "NO_EXACT_REVISION", match_count: 0 };
    if (matches.length > 1) {
      return { context: null, reason: "AMBIGUOUS_EXACT_REVISIONS", match_count: matches.length };
    }
    return { context: matches[0], reason: null, match_count: 1 };
  }

  var PURE = {
    passport: passport,
    DERIVED_TIMING_DROPS: DERIVED_TIMING_DROPS,
    isDerivedTimingDrop: isDerivedTimingDrop,
    clockBlindRanges: clockBlindRanges,
    passportFromTextRow: passportFromTextRow,
    revisionMatchesLines: revisionMatchesLines,
    resolveUniqueRevisionContext: resolveUniqueRevisionContext,
    alignSavedTimingOffline: alignSavedTimingOffline,
    restoreForRows: restoreForRows,
    playableRows: playableRows,
    pickExactBindingPassport: pickExactBindingPassport,
    timingDropExplain: timingDropExplain,
    timingCoverageExplain: timingCoverageExplain,
  };

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = PURE;
    return;
  }

  // ── БРАУЗЕРНАЯ ЧАСТЬ: DOM-хелперы плеера, общие для Студии и Зала ──────────────────────────

  function mediaCompat(media, camel, snake) {
    if (!media) return null;
    return media[camel] == null ? media[snake] : media[camel];
  }
  function mediaIdentity(media) {
    return String(mediaCompat(media, "sha256", "media_sha256") || mediaCompat(media, "opfsPath", "opfs_path") || "session-media");
  }

  // Резолвер блоба: OPFS (MediaStore) или session-блоб поверхности; кэш по identity —
  // состояние ИНСТАНСА (у каждой поверхности свой), а не модуля.
  function createBlobResolver(opts) {
    var getSessionBlob = (opts && opts.getSessionBlob) || function () { return null; };
    var cache = null; // {identity, blob}
    return {
      resolve: async function (audio) {
        if (!audio || !audio.media) return null;
        var identity = mediaIdentity(audio.media);
        if (cache && cache.identity === identity) return cache.blob;
        var blob = null;
        var sessionOnly = !!mediaCompat(audio.media, "sessionOnly", "session_only");
        var opfsPath = mediaCompat(audio.media, "opfsPath", "opfs_path");
        var MS = typeof window.MediaStore !== "undefined" ? window.MediaStore : null;
        if (sessionOnly) blob = getSessionBlob() || null;
        else if (MS) {
          if (opfsPath) blob = await MS.readMedia(opfsPath);
          // Content-addressed фолбэк (2026-08-05, «В сокрытии - 1»): portable/text-card
          // паспорта несут ТОЛЬКО sha256 — opfsPath отсутствует ПО КОНТРАКТУ media-ref
          // (media_included:false, релинк по SHA). Файл в OPFS ИМЕНУЕТСЯ своим SHA-256
          // (MediaStore.mediaFileName), поэтому производный путь корректен by construction.
          if (!blob && typeof MS.mediaFileName === "function") {
            var sha = mediaCompat(audio.media, "sha256", "media_sha256");
            if (sha) blob = await MS.readMedia(MS.mediaFileName(sha,
              mediaCompat(audio.media, "mime", "mime"),
              mediaCompat(audio.media, "originalName", "original_name")));
          }
        }
        if (blob) cache = { identity: identity, blob: blob };
        return blob;
      },
      clear: function () { cache = null; },
    };
  }

  // Стейдж локального плеера: audio↔video своп по MIME (id сохраняется), objectURL-менеджмент,
  // bind караоке. Контейнеры — параметры инстанса, никакой жёсткой привязки к поверхности.
  function createStage(opts) {
    var stageId = opts.stageId, playerId = opts.playerId;
    var t = opts.t || function (k) { return k; };
    var ariaKey = opts.ariaKey || "studio.media.sourcePlayer";
    var getRowCount = opts.getRowCount || function () { return 0; };
    var onRangeChange = opts.onRangeChange || null;
    var stopOtherAudio = opts.stopOtherAudio || null;
    var url = null, identity = null;
    function playerEl() { return document.getElementById(playerId); }
    function destroy() {
      var stage = document.getElementById(stageId);
      var player = playerEl();
      try {
        if (player && window.StudioMediaKaraoke && window.StudioMediaKaraoke.getAudioEl() === player) window.StudioMediaKaraoke.stop();
      } catch (_) {}
      if (player) { try { player.pause(); player.removeAttribute("src"); player.load(); } catch (_) {} }
      if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
      url = null; identity = null;
      if (stage) stage.hidden = true;
    }
    function ensure(audio, blob) {
      var stage = document.getElementById(stageId);
      var player = playerEl();
      if (!stage || !player || !audio || !audio.media || !blob) return null;
      var mime = String(mediaCompat(audio.media, "mime", "mime") || blob.type || "");
      var desiredTag = mime.startsWith("video/") ? "video" : "audio";
      if (player.tagName.toLowerCase() !== desiredTag) {
        try { if (window.StudioMediaKaraoke && window.StudioMediaKaraoke.getAudioEl() === player) window.StudioMediaKaraoke.stop(); } catch (_) {}
        var replacement = document.createElement(desiredTag);
        replacement.id = playerId; replacement.controls = true; replacement.preload = "metadata";
        replacement.setAttribute("data-i18n-aria-label", ariaKey);
        if (desiredTag === "video") {
          // iOS: без playsinline тап по ▶ разворачивает видео в полный экран — текст перестаёт
          // быть виден (живой баг владельца, iPhone 2026-08-05). Десктоп атрибут игнорирует.
          replacement.playsInline = true;
          replacement.setAttribute("playsinline", "");
          replacement.setAttribute("webkit-playsinline", "");
        }
        player.replaceWith(replacement); player = replacement;
      }
      player.setAttribute("aria-label", t(ariaKey));
      var id = mediaIdentity(audio.media) + ":" + desiredTag;
      if (identity !== id || !player.getAttribute("src")) {
        if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
        url = URL.createObjectURL(blob); identity = id;
        player.src = url;
      }
      stage.hidden = false;
      // REFERENCE EQUALITY CONTRACT: entries — ссылка на audio.timing.entries, не копия.
      var entries = audio.timing ? audio.timing.entries : null;
      window.StudioMediaKaraoke.bind({ media: player, entries: entries, rowCount: getRowCount(), onRangeChange: onRangeChange, stopOtherAudio: stopOtherAudio });
      player.onseeked = function () { try { window.StudioMediaKaraoke.syncCurrent(); } catch (_) {} };
      return player;
    }
    return { ensure: ensure, destroy: destroy, getPlayer: playerEl };
  }

  // Per-row «▶︎ повторить сегмент», POST-render (parity-locked билдер не тронут).
  // Гейт честности: паспорт + тайминг + .media (captions-only паспорт кнопок не получает —
  // IMPORTANT 2) И реально доступный блоб (E1, R11: text-card-получатель без байтов видит
  // объяснение в баре, а не тупиковую кнопку).
  function augmentRows(opts) {
    try {
      var table = opts.table, audio = opts.audio;
      var resolveBlob = opts.resolveBlob, t = opts.t || function (k) { return k; };
      var onReplay = opts.onReplay, stillActive = opts.stillActive || function () { return true; };
      if (!table) return;
      table.querySelectorAll(".smk-row-replay").forEach(function (b) { b.remove(); });
      if (!audio || !audio.timing || !audio.media) return;
      Promise.resolve(resolveBlob(audio)).then(function (blob) {
        if (!blob) return;
        if (!stillActive(audio)) return; // текст сменился, пока резолвили
        renderRowReplay(table, audio, resolveBlob, t, onReplay);
      }).catch(function () {});
    } catch (_) {}
  }

  function renderRowReplay(table, audio, resolveBlob, t, onReplay) {
    try {
      table.querySelectorAll("tbody tr[data-row-idx]").forEach(function (tr) {
        var cell = tr.querySelector("td:last-child") || tr.lastElementChild;
        if (!cell) return;
        if (tr.querySelector(".smk-row-replay")) return; // повторный async-проход не дублирует
        var idx = Number(tr.getAttribute("data-row-idx"));
        var exactMap = audio.timingMap && audio.timingMap.authority === "studio-exact-binding"
          ? audio.timingMap.row_caption_segment_ids : null;
        // Exact Studio bindings never guess a positional fallback for an unmapped row.
        if (Array.isArray(exactMap) && !exactMap[idx]) return;
        var partialMap = audio.timingMap && audio.timingMap.source === "aligned-partial-proven"
          ? audio.timingMap.row_seg_idx : null;
        if (Array.isArray(partialMap) && !Number.isInteger(partialMap[idx])) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "smk-row-replay";
        btn.textContent = "▶︎";
        btn.title = t("studio.media.replaySegment");
        btn.addEventListener("click", async function (e) {
          e.stopPropagation();
          try {
            var b = await resolveBlob(audio); // повторный резолв: файл мог исчезнуть между рендером и кликом
            if (!b) return;
            if (onReplay) await onReplay(idx, audio, b);
          } catch (_) {}
        });
        cell.appendChild(btn);
      });
    } catch (_) {}
  }

  var API = Object.assign({}, PURE, {
    mediaIdentity: mediaIdentity,
    createBlobResolver: createBlobResolver,
    createStage: createStage,
    augmentRows: augmentRows,
  });
  window.MediaHost = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
