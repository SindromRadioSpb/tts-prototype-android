"use strict";

function buildExportRowsWithNotes(sentences, notes, audioKeySet) {
  const noteBySentenceId = new Map();
  for (const n of Array.isArray(notes) ? notes : []) {
    const sid = String(n && (n.sentence_id || n.sentenceId) ? (n.sentence_id || n.sentenceId) : "");
    if (!sid) continue;
    noteBySentenceId.set(sid, n);
  }

  return (Array.isArray(sentences) ? sentences : []).map((s) => {
    const ak = s && s.audio_asset_key && String(s.audio_asset_key).length === 64
      ? String(s.audio_asset_key)
      : null;
    if (ak && audioKeySet && typeof audioKeySet.add === "function") audioKeySet.add(ak);

    const noteRow = noteBySentenceId.get(String(s && s.id ? s.id : ""));

    return {
      row_id: s.id,
      order_index: s.order_index,
      hebrew_plain: s.he_plain || "",
      hebrew_niqqud: s.he_niqqud || "",
      translit: s.translit || "",
      translit_ru: s.translit_ru || "",
      russian: s.ru || "",
      edit_meta: s.edit_meta_json ? safeJsonParse(s.edit_meta_json, null) : null,
      note: noteRow && noteRow.note ? String(noteRow.note) : "",
      note_updated_at: noteRow && noteRow.updated_at ? String(noteRow.updated_at) : null,
      audio_asset_key: ak,
    };
  });
}

function countBundleNotes(exportedTexts) {
  return (Array.isArray(exportedTexts) ? exportedTexts : []).reduce((sum, text) => {
    const rows = Array.isArray(text && text.rows) ? text.rows : [];
    return sum + rows.filter((r) => String(r && r.note ? r.note : "").trim()).length;
  }, 0);
}

function isValidBundleAudioEntryName(name) {
  return /^audio\/[0-9a-f]{64}\.mp3$/i.test(String(name || ""));
}

function safeJsonParse(input, fallback) {
  try {
    if (input == null) return fallback;
    const str = String(input).trim();
    if (!str) return fallback;
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

module.exports = {
  buildExportRowsWithNotes,
  countBundleNotes,
  isValidBundleAudioEntryName,
};
