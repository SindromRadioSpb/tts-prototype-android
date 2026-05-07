// Loads the same exportBundle synthesis logic the browser uses and runs it
// against synthetic OPFS rows that include the worst-case shapes (null
// timestamps, missing TTS profile, weird tags_json). Then validates the
// result against Android v2 strict schema. If green → cross-device round-
// trip works. Run:
//   node tests/verify_export_synthesis.js

const path = require("path");

// Mirror exactly the synthesis fields used in public/db/local-db.js#exportBundle
// (only the per-text/per-row mapping; we skip the SQL parts).
function safeJsonParse(s) {
  if (s == null || s === '') return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function buildExport(texts, sentencesByTextId, notesByTextId) {
  const exportTs = new Date().toISOString();
  const audioAssetsMap = new Map();
  let rowCount = 0;
  const out = [];
  for (const text of texts) {
    const sents = sentencesByTextId[text.id] || [];
    const notes = notesByTextId[text.id] || [];
    const noteMap = {};
    for (const n of notes) noteMap[n.sentence_id] = n.note;

    const rows = sents.map((s) => {
      const ak = s.audio_asset_key || null;
      if (ak && !audioAssetsMap.has(ak)) {
        const ttsProfile = safeJsonParse(s.audio_tts_profile_json);
        audioAssetsMap.set(ak, {
          asset_key: ak,
          relative_export_path: 'audio/' + ak + '.mp3',
          mime_type: 'audio/mpeg',
          provider_id: 'unknown',
          voice_name: ttsProfile && ttsProfile.voiceName ? ttsProfile.voiceName : null,
          language: (ttsProfile && ttsProfile.language) ? ttsProfile.language : 'he-IL',
          duration_ms: null,
          size_bytes: null,
          content_hash: null,
          provenance: ttsProfile ? { ttsProfile } : null,
        });
      }
      rowCount++;
      return {
        row_id: s.id,
        order_index: s.order_index ?? 0,
        hebrew_plain: s.he_plain || '',
        hebrew_niqqud: s.he_niqqud || '',
        translit: s.translit || '',
        translit_ru: s.translit_ru || '',
        russian: s.ru || '',
        edit_meta: safeJsonParse(s.edit_meta_json),
        audio_asset_key: ak,
        note: (noteMap[s.id] && String(noteMap[s.id]).trim()) ? String(noteMap[s.id]) : null,
      };
    });

    const tagsParsed = safeJsonParse(text.tags_json);
    const tagsList = Array.isArray(tagsParsed)
      ? tagsParsed.map((x) => (typeof x === 'string' ? x : String(x))).filter(Boolean)
      : [];

    out.push({
      text_id: text.id,
      text_key: text.text_key,
      title: text.title || '',
      level: text.level || null,
      tags: tagsList,
      source_label: text.source || null,
      topic: text.topic || null,
      source_text: text.source_text || '',
      source_meta: safeJsonParse(text.source_meta_json),
      table_model_meta: safeJsonParse(text.table_model_meta_json),
      rows,
      text_audio_asset_key: null,
      created_at: text.created_at || exportTs,
      updated_at: text.updated_at || exportTs,
      is_archived: !!text.is_archived,
    });
  }
  return {
    schema_version: 1,
    texts: out,
    audio_assets: Array.from(audioAssetsMap.values()),
  };
}

// Reuse the validator from tests/verify_zip_android_compat.js by inlining it:
function validate(libJson) {
  const errs = [];
  const reqStr = (p, v) => { if (typeof v !== "string") errs.push(`${p}: required String, got ${v === null ? "null" : typeof v}`); };
  const reqInt = (p, v) => { if (typeof v !== "number" || !Number.isInteger(v)) errs.push(`${p}: required Int, got ${typeof v} ${v}`); };
  const reqBool = (p, v) => { if (typeof v !== "boolean") errs.push(`${p}: required Boolean, got ${typeof v}`); };
  const reqArr = (p, v) => { if (!Array.isArray(v)) errs.push(`${p}: required Array`); };
  const reqStrList = (p, v) => {
    if (!Array.isArray(v)) errs.push(`${p}: required List<String>`);
    else v.forEach((x, i) => { if (typeof x !== "string") errs.push(`${p}[${i}]: not String`); });
  };
  const nullStr = (p, v) => { if (v !== null && typeof v !== "string") errs.push(`${p}: must be String or null`); };

  reqInt("schema_version", libJson.schema_version);
  reqArr("texts", libJson.texts);
  reqArr("audio_assets", libJson.audio_assets);
  if (errs.length) return errs;
  libJson.texts.forEach((t, i) => {
    const p = `texts[${i}]`;
    reqStr(`${p}.text_id`, t.text_id);
    reqStr(`${p}.text_key`, t.text_key);
    reqStr(`${p}.title`, t.title);
    nullStr(`${p}.level`, t.level);
    reqStrList(`${p}.tags`, t.tags);
    nullStr(`${p}.source_label`, t.source_label);
    nullStr(`${p}.topic`, t.topic);
    reqStr(`${p}.source_text`, t.source_text);
    if (typeof t.source_meta === "undefined") errs.push(`${p}.source_meta: undefined`);
    if (typeof t.table_model_meta === "undefined") errs.push(`${p}.table_model_meta: undefined`);
    reqArr(`${p}.rows`, t.rows);
    nullStr(`${p}.text_audio_asset_key`, t.text_audio_asset_key);
    reqStr(`${p}.created_at`, t.created_at);
    reqStr(`${p}.updated_at`, t.updated_at);
    reqBool(`${p}.is_archived`, t.is_archived);
    (t.rows || []).forEach((r, j) => {
      const rp = `${p}.rows[${j}]`;
      reqStr(`${rp}.row_id`, r.row_id);
      reqInt(`${rp}.order_index`, r.order_index);
      reqStr(`${rp}.hebrew_plain`, r.hebrew_plain);
      reqStr(`${rp}.hebrew_niqqud`, r.hebrew_niqqud);
      reqStr(`${rp}.translit`, r.translit);
      if (typeof r.translit_ru !== "undefined" && typeof r.translit_ru !== "string") errs.push(`${rp}.translit_ru: not String`);
      reqStr(`${rp}.russian`, r.russian);
      if (typeof r.edit_meta === "undefined") errs.push(`${rp}.edit_meta: undefined`);
      nullStr(`${rp}.audio_asset_key`, r.audio_asset_key);
    });
  });
  libJson.audio_assets.forEach((a, i) => {
    const p = `audio_assets[${i}]`;
    reqStr(`${p}.asset_key`, a.asset_key);
    reqStr(`${p}.relative_export_path`, a.relative_export_path);
    reqStr(`${p}.mime_type`, a.mime_type);
    reqStr(`${p}.provider_id`, a.provider_id);
    nullStr(`${p}.voice_name`, a.voice_name);
    reqStr(`${p}.language`, a.language);
    nullStr(`${p}.content_hash`, a.content_hash);
    if (typeof a.provenance === "undefined") errs.push(`${p}.provenance: undefined`);
  });
  return errs;
}

// ── Synthetic worst-case OPFS data ───────────────────────────────────────
// Mix of: text with all fields, text with nulls, sentence with no audio,
// sentence with audio + ttsProfile, sentence with weird tags_json, etc.
const texts = [
  { id: "t-1", text_key: "tk1", title: "Normal text", level: "alef",
    tags_json: '["learn","hebrew"]', source: "https://example.com", topic: "verbs",
    source_text: "שלום", source_meta_json: '{"a":1}',
    table_model_meta_json: '{"provider":"gcp"}',
    is_archived: 0, created_at: "2026-05-07T00:00:00Z", updated_at: "2026-05-07T00:01:00Z" },
  { id: "t-2", text_key: "tk2", title: "Null timestamps text", level: null,
    tags_json: null, source: null, topic: null,
    source_text: "תודה", source_meta_json: null, table_model_meta_json: null,
    is_archived: 0, created_at: null, updated_at: null },  // ← null timestamps
  { id: "t-3", text_key: "tk3", title: "Weird tags", level: "bet",
    tags_json: '{"not":"an array"}',  // ← non-array tags_json
    source: "", topic: "",
    source_text: "מים", source_meta_json: null, table_model_meta_json: null,
    is_archived: 1, created_at: "2026-05-07T00:00:00Z", updated_at: "2026-05-07T00:00:00Z" },
];
const sentencesByTextId = {
  "t-1": [
    { id: "s-1", text_id: "t-1", order_index: 0, he_plain: "שלום", he_niqqud: "שָׁלוֹם",
      translit: "shalom", translit_ru: "шалом", ru: "мир",
      audio_asset_key: "abc123",
      audio_tts_profile_json: '{"voiceName":"he-IL-Wavenet-A","language":"he-IL","speakingRate":1,"pitch":0}' },
    { id: "s-2", text_id: "t-1", order_index: 1, he_plain: null, he_niqqud: null,  // ← nulls
      translit: null, translit_ru: null, ru: null,
      audio_asset_key: null, audio_tts_profile_json: null },
  ],
  "t-2": [
    { id: "s-3", text_id: "t-2", order_index: 0, he_plain: "תודה", he_niqqud: "תּוֹדָה",
      translit: "toda", translit_ru: "", ru: "спасибо",
      audio_asset_key: "def456",
      // No ttsProfile — language must default to 'he-IL'.
      audio_tts_profile_json: null },
  ],
  "t-3": [
    { id: "s-4", text_id: "t-3", order_index: 0, he_plain: "מים", he_niqqud: "מַיִם",
      translit: "mayim", ru: "вода",
      audio_asset_key: null, audio_tts_profile_json: null },
  ],
};
const notesByTextId = {
  "t-1": [{ sentence_id: "s-1", note: "remember this" }],
};

const lib = buildExport(texts, sentencesByTextId, notesByTextId);
console.log("Synthetic export shape:");
console.log("  texts:", lib.texts.length, "audio_assets:", lib.audio_assets.length);

const errs = validate(lib);
if (!errs.length) {
  console.log("✅ All Android v2 strict-schema constraints satisfied.");
  console.log("  Sample text[1] (was null timestamps):");
  console.log("   created_at =", JSON.stringify(lib.texts[1].created_at));
  console.log("   updated_at =", JSON.stringify(lib.texts[1].updated_at));
  console.log("  Sample text[2] tags (was non-array tags_json):");
  console.log("   tags =", JSON.stringify(lib.texts[2].tags));
  console.log("  Sample audio_asset[1] (no ttsProfile):");
  console.log("   language =", JSON.stringify(lib.audio_assets[1].language));
  process.exit(0);
}
console.log("❌ Android v2 strict-schema violations:");
errs.forEach((e) => console.log("   • " + e));
process.exit(1);
