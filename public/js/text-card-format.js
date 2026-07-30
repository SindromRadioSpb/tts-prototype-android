// public/js/text-card-format.js
// E1 · Ядро формата «карточка текста» (share/import), dual-export по образцу
// asr-transcript.js / table-chunks.js — чистые функции, тестируемые в Node.
//
// Зачем модуль: v1-экспорт (`v3TcsBuildCardPayload`, inline в index.html) выгружал
// ТОЛЬКО текстовые колонки. Терялись:
//   • паспорт источника (source_meta_json / table_model_meta_json → .source.audio с
//     media/asr/segments/timing) — то есть провенанс и вся основа караоке;
//   • построчный провенанс (translation_provider / niqqud_authority);
//   • edit_meta и заметка строки (в v1 они были ЗАХАРДКОЖЕНЫ в null).
// v2 несёт всё это. Медиа-байты в JSON НЕ вкладываются (аудио бывает 100+ МБ) —
// в паспорте остаётся только ссылка media.opfsPath + sha256; это честно
// отражается в UI (см. cardMediaSummary + локали tcs.media*/tci.media*).
//
// R9 (derived ≠ asserted):
//   • `source_meta` / `table_model_meta` — ПРОИЗВОДНЫЙ кэш (вывод ASR/переводчика),
//     а не утверждение пользователя. Переносим как есть, помечая card_import.
//   • `he_norm` / `row_hash` НЕ переносим — производные от he_plain, пересчитываются
//     владельцем колонки (в OPFS-схеме они вообще не заполняются).
//   • Строка с niqqud_authority="DERIVED" (машинный никуд Nakdan) при импорте НЕ
//     становится ASSERTED: значение кладётся обратно в meta.niqqud_derived, а
//     he_niqqud остаётся пустым — проекция получателя пересчитает авторитет сама.
(function () {
  "use strict";

  var FORMAT_PREFIX = "linguistpro-text-card-v";
  var FORMAT_V1 = FORMAT_PREFIX + "1";
  var FORMAT_V2 = FORMAT_PREFIX + "2";
  // Экспорт пишет V2; импорт принимает ОБА (старые файлы владельца — v1).
  var SUPPORTED_FORMATS = [FORMAT_V1, FORMAT_V2];

  function parseJson(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    if (typeof raw === "object") return raw;
    try {
      var parsed = JSON.parse(String(raw));
      return parsed == null ? fallback : parsed;
    } catch (_) { return fallback; }
  }

  function str(v) { return v == null ? "" : String(v); }

  // Паспорт медиа внутри `meta.source` — литеральный близнец v3MediaPassport()
  // из index.html (аудио-импорт кладёт .audio, импорт субтитров — .captions).
  function mediaPassport(sourceHolder) {
    if (!sourceHolder || typeof sourceHolder !== "object") return null;
    return sourceHolder.audio || sourceHolder.captions || null;
  }

  // Паспорт живёт в ДВУХ колонках: «Сохранить как новый» пишет tableModelMeta в
  // `source_meta_json`, «Обновить карточку» — в `table_model_meta_json`. Правило
  // выбора — то же, что у v3AdoptSavedTableMeta (index.html): предпочитаем ту
  // колонку, в которой РЕАЛЬНО есть медиа-паспорт; иначе отдаём обе как есть.
  function pickCardMeta(textRow) {
    var t = textRow || {};
    var sourceMeta = parseJson(t.source_meta_json != null ? t.source_meta_json : t.sourceMetaJson, null);
    var tableModelMeta = parseJson(t.table_model_meta_json != null ? t.table_model_meta_json : t.tableModelMetaJson, null);
    var passportIn = null;
    if (mediaPassport(tableModelMeta && tableModelMeta.source)) passportIn = "table_model_meta";
    else if (mediaPassport(sourceMeta && sourceMeta.source)) passportIn = "source_meta";
    return { sourceMeta: sourceMeta, tableModelMeta: tableModelMeta, passportIn: passportIn };
  }

  // Честная сводка «что из медиа реально уедет в JSON» (R11: не делать вид, что
  // аудио едет вместе с карточкой). Возвращает null, когда паспорта нет вовсе.
  function cardMediaSummary(card) {
    var c = card || {};
    var holders = [c.source_meta, c.table_model_meta];
    var audio = null;
    for (var i = 0; i < holders.length; i++) {
      var h = holders[i];
      audio = mediaPassport(h && h.source);
      if (audio) break;
    }
    if (!audio) return null;
    var media = audio.media || null;
    var segments = Array.isArray(audio.segments) ? audio.segments.length : 0;
    var timingEntries = (audio.timing && Array.isArray(audio.timing.entries)) ? audio.timing.entries.length : 0;
    return {
      // Байты медиа НИКОГДА не лежат в JSON — только ссылка. Поле-константа,
      // чтобы UI не изобретал это утверждение заново.
      fileEmbedded: false,
      opfsPath: media && media.opfsPath ? String(media.opfsPath) : null,
      sha256: media && media.sha256 ? String(media.sha256) : null,
      sessionOnly: !!(media && media.sessionOnly),
      mediaName: media && media.name ? String(media.name) : null,
      sizeBytes: media && Number.isFinite(Number(media.sizeBytes)) ? Number(media.sizeBytes) : null,
      videoId: audio.video && audio.video.videoId ? String(audio.video.videoId) : null,
      segments: segments,
      timingEntries: timingEntries,
      hasTiming: timingEntries > 0,
      timingDropReason: audio.timingDropReason || null,
      asrModel: (audio.asr && audio.asr.model) ? String(audio.asr.model) : null,
    };
  }

  // ── Экспорт ────────────────────────────────────────────────────────────────
  // ЧИСТАЯ: на входе — уже прочитанные строка texts + ПРОЕЦИРОВАННЫЕ предложения
  // (getSentences → applyProjection, т.е. с niqqud_authority) + карта заметок.
  function buildCardPayload(input) {
    var inp = input || {};
    var text = inp.text || {};
    var sentences = Array.isArray(inp.sentences) ? inp.sentences : [];
    var notesBySentenceId = inp.notesBySentenceId || {};
    var meta = pickCardMeta(text);

    var rows = sentences.map(function (s, i) {
      s = s || {};
      var rowMeta = parseJson(s.meta_json, null);
      var noteRaw = notesBySentenceId[String(s.id || "")];
      var note = (noteRaw != null && String(noteRaw).trim()) ? String(noteRaw) : null;
      return {
        row_id: str(s.id),
        order_index: Number.isFinite(Number(s.order_index)) ? Number(s.order_index) : i,
        hebrew_plain: str(s.he_plain),
        hebrew_niqqud: str(s.he_niqqud),
        translit: str(s.translit),
        translit_ru: str(s.translit_ru),
        russian: str(s.ru),
        audio_asset_key: str(s.audio_asset_key) || null,
        // v1 хардкодил эти два поля в null — реальная потеря, а не «не поддерживается».
        edit_meta: parseJson(s.edit_meta_json, null),
        note: note,
        // ── v2: построчный провенанс ────────────────────────────────────────
        translation_provider: s.translation_provider != null ? String(s.translation_provider) : null,
        translation_meta: parseJson(s.translation_meta_json, null),
        // Производная проекция чтения (ASSERTED | DERIVED | undefined) — держим,
        // чтобы получатель не выдал машинный никуд за пользовательский.
        niqqud_authority: s.niqqud_authority != null ? String(s.niqqud_authority) : null,
        niqqud_provenance: s.niqqud_provenance != null ? String(s.niqqud_provenance) : null,
        // Сырой meta_json строки: несёт niqqud_derived (значение + source_hash +
        // провенанс), без него авторитет никуда восстановить нечем.
        meta: rowMeta,
        // he_norm / row_hash НЕ переносим — производные.
      };
    });

    return {
      format: FORMAT_V2,
      exported_at: inp.exportedAt || new Date().toISOString(),
      exported_by_app: inp.appTag || null,
      card: {
        title: text.title || null,
        level: text.level || null,
        tags: (function () { var tg = parseJson(text.tags_json, []); return Array.isArray(tg) ? tg : []; })(),
        source_label: text.source || null,
        topic: text.topic || null,
        source_text: str(text.source_text),
        rows: rows,
        tts_profile: parseJson(text.tts_profile_json, null),
        text_audio_asset_key: text.audio_asset_key || null,
        // ── v2: паспорт источника (ПРОИЗВОДНЫЕ данные, R9) ──────────────────
        // Медиа-байты сюда не кладутся: в media остаётся только opfsPath+sha256.
        source_meta: meta.sourceMeta,
        table_model_meta: meta.tableModelMeta,
        // Из какой колонки пришёл медиа-паспорт (чтобы импорт положил обратно туда же).
        passport_in: meta.passportIn,
      },
    };
  }

  // ── Детект/валидация ───────────────────────────────────────────────────────
  // Отличает «это вообще карточка» от «карточка неизвестной версии»: без этого
  // v2-файл на старой сборке молча проваливался в generic-импорт бандла и давал
  // ложный «добавлено 0, пропущено 0» вместо честной ошибки.
  function detectCard(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { isCard: false, format: null, version: null, supported: false, reason: "NOT_A_CARD" };
    }
    var fmt = typeof parsed.format === "string" ? parsed.format : "";
    if (fmt.indexOf(FORMAT_PREFIX) !== 0) {
      return { isCard: false, format: fmt || null, version: null, supported: false, reason: "NOT_A_CARD" };
    }
    var verRaw = fmt.slice(FORMAT_PREFIX.length);
    var version = /^\d+$/.test(verRaw) ? Number(verRaw) : null;
    if (SUPPORTED_FORMATS.indexOf(fmt) === -1) {
      return { isCard: true, format: fmt, version: version, supported: false, reason: "CARD_FORMAT_UNSUPPORTED" };
    }
    if (!parsed.card || !Array.isArray(parsed.card.rows)) {
      return { isCard: true, format: fmt, version: version, supported: false, reason: "CARD_NO_ROWS" };
    }
    return { isCard: true, format: fmt, version: version, supported: true, reason: null };
  }

  // ── Импорт ─────────────────────────────────────────────────────────────────
  // ЧИСТАЯ: v1/v2 payload → форма library-bundle (Shape A), которую понимает
  // importBundle(). Имена полей строк — КАНОНИЧЕСКИЕ имена экспорта бандла
  // (hebrew_plain/hebrew_niqqud/russian): importBundle читает `r.hebrew_plain ||
  // r.he_plain`, а старый адаптер отдавал `he` — иврит терялся ЦЕЛИКОМ.
  function cardToBundle(payload, options) {
    var opts = options || {};
    var det = detectCard(payload);
    if (!det.supported) {
      var err = new Error(det.reason || "CARD_FORMAT_UNSUPPORTED");
      err.code = det.reason || "CARD_FORMAT_UNSUPPORTED";
      err.format = det.format;
      throw err;
    }
    var nowIso = opts.now || new Date().toISOString();
    var textKey = opts.textKey ||
      ("text-card-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
    var newRowId = typeof opts.newRowId === "function" ? opts.newRowId : function () {
      return (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("row-" + Math.random().toString(36).slice(2, 10));
    };

    var c = payload.card || {};
    var rowsIn = Array.isArray(c.rows) ? c.rows : [];
    var audioKeys = [];
    var seenKeys = Object.create(null);

    var rows = rowsIn.map(function (r, i) {
      r = r || {};
      var key = str(r.audio_asset_key).trim();
      if (key && !seenKeys[key]) { seenKeys[key] = 1; audioKeys.push(key); }
      var rowMeta = parseJson(r.meta, null);
      var derived = rowMeta && rowMeta.niqqud_derived;
      // R9: машинный никуд не выдаём за утверждённый. he_niqqud пустой ⇒ проекция
      // получателя (nakdan-derived-core) сама пересчитает source_hash по he_plain
      // и вернёт статус DERIVED. Значение при этом НЕ теряется — оно и в meta, и
      // в поле hebrew_niqqud самого файла (для сторонних читателей).
      var isDerivedNiqqud = String(r.niqqud_authority || "") === "DERIVED" &&
        !!(derived && str(derived.value).trim());
      return {
        row_id: r.row_id || newRowId(),
        order_index: Number.isFinite(Number(r.order_index)) ? Number(r.order_index) : i,
        hebrew_plain: str(r.hebrew_plain || r.he_plain || r.he),
        hebrew_niqqud: isDerivedNiqqud ? "" : str(r.hebrew_niqqud || r.he_niqqud),
        translit: str(r.translit),
        translit_ru: str(r.translit_ru),
        russian: str(r.russian || r.ru),
        audio_asset_key: key || null,
        edit_meta: parseJson(r.edit_meta, null) || parseJson(r.edit_meta_json, null),
        note: (r.note != null && String(r.note).trim()) ? String(r.note) : null,
        // v2-провенанс (в v1-файлах этих полей нет → null, честная деградация).
        translation_provider: r.translation_provider != null ? String(r.translation_provider) : null,
        translation_meta_json: rowJson(r.translation_meta),
        meta_json: rowJson(rowMeta),
      };
    });

    // Паспорт возвращаем в ТУ ЖЕ колонку, откуда он приехал (иначе «Обновить
    // карточку»-карточка приехала бы в source_meta и наоборот).
    var sourceMeta = parseJson(c.source_meta, null);
    var tableModelMeta = parseJson(c.table_model_meta, null);
    var smOut = (sourceMeta && typeof sourceMeta === "object" && !Array.isArray(sourceMeta))
      ? shallowClone(sourceMeta) : {};
    // Провенанс самого импорта (R9): откуда взялась карточка и что медиа-файл
    // ЛОКАЛЬНО не приехал — по нему UI честно объясняет отсутствие караоке.
    smOut.card_import = {
      origin: "text-card-share",
      imported_at: nowIso,
      format: det.format,
      exported_at: payload.exported_at || null,
      exported_by_app: payload.exported_by_app || null,
      media_file_included: false,
    };

    var text = {
      text_key: textKey,
      title: c.title || null,
      level: c.level || null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      source_label: c.source_label || null,
      topic: c.topic || null,
      source_text: str(c.source_text),
      tts_profile_json: JSON.stringify(c.tts_profile || null),
      source_meta: smOut,
      table_model_meta: tableModelMeta,
      rows: rows,
      audio_asset_key: c.text_audio_asset_key || null,
    };

    var audio_assets = audioKeys.map(function (k) {
      return { asset_key: k, voice: null, rate: null, pitch: null, language: null, size_bytes: null };
    });

    return { library: { texts: [text], audio_assets: audio_assets } };
  }

  function rowJson(value) {
    if (value == null) return null;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch (_) { return null; }
  }

  function shallowClone(obj) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  var API = {
    FORMAT_PREFIX: FORMAT_PREFIX,
    FORMAT_V1: FORMAT_V1,
    FORMAT_V2: FORMAT_V2,
    SUPPORTED_FORMATS: SUPPORTED_FORMATS,
    parseJson: parseJson,
    mediaPassport: mediaPassport,
    pickCardMeta: pickCardMeta,
    cardMediaSummary: cardMediaSummary,
    buildCardPayload: buildCardPayload,
    detectCard: detectCard,
    cardToBundle: cardToBundle,
  };
  if (typeof window !== "undefined") window.TextCardFormat = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
