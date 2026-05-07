// Validates that an exported library.json is parseable by Android v2's
// strict kotlinx.serialization data classes (ExportManifest.kt). Run on a
// real ZIP produced by the web app to catch field-shape regressions before
// the user has to drive Android v2 SAF import manually.
//
// Usage: node tests/verify_zip_android_compat.js <path-to-zip>

const fs = require("fs");
const JSZip = require("jszip");

// Mirrors public/db/local-db.js#exportBundle synthesis logic for the row +
// text + asset shapes that get serialised into library.json. Any field
// rejected here MUST also fail Android v2 import.
function validate(libJson) {
  const errs = [];
  const requireString = (path, v) => {
    if (typeof v !== "string") errs.push(`${path}: required String, got ${v === null ? "null" : typeof v}`);
  };
  const requireInt = (path, v) => {
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      errs.push(`${path}: required Int, got ${typeof v} ${v}`);
    }
  };
  const requireBool = (path, v) => {
    if (typeof v !== "boolean") errs.push(`${path}: required Boolean, got ${typeof v} ${v}`);
  };
  const requireArray = (path, v) => {
    if (!Array.isArray(v)) errs.push(`${path}: required Array, got ${typeof v}`);
  };
  const requireStringList = (path, v) => {
    if (!Array.isArray(v)) errs.push(`${path}: required List<String>, got ${typeof v}`);
    else v.forEach((x, i) => {
      if (typeof x !== "string") errs.push(`${path}[${i}]: required String, got ${typeof x}`);
    });
  };
  const allowNullableString = (path, v) => {
    if (v !== null && typeof v !== "string") errs.push(`${path}: must be String or null, got ${typeof v}`);
  };

  // LibraryJsonExport
  if (!libJson || typeof libJson !== "object") return ["library.json: not an object"];
  requireInt("schema_version", libJson.schema_version);
  requireArray("texts", libJson.texts);
  requireArray("audio_assets", libJson.audio_assets);
  if (errs.length) return errs;

  libJson.texts.forEach((t, i) => {
    const p = `texts[${i}]`;
    requireString(`${p}.text_id`, t.text_id);
    requireString(`${p}.text_key`, t.text_key);
    requireString(`${p}.title`, t.title);
    allowNullableString(`${p}.level`, t.level);
    requireStringList(`${p}.tags`, t.tags);
    allowNullableString(`${p}.source_label`, t.source_label);
    allowNullableString(`${p}.topic`, t.topic);
    requireString(`${p}.source_text`, t.source_text);
    // source_meta + table_model_meta + edit_meta: kotlinx accepts JsonElement?
    // (any value or null) — no validation needed beyond "not undefined".
    if (typeof t.source_meta === "undefined") errs.push(`${p}.source_meta: undefined (must be present, even if null)`);
    if (typeof t.table_model_meta === "undefined") errs.push(`${p}.table_model_meta: undefined`);
    requireArray(`${p}.rows`, t.rows);
    allowNullableString(`${p}.text_audio_asset_key`, t.text_audio_asset_key);
    requireString(`${p}.created_at`, t.created_at);
    requireString(`${p}.updated_at`, t.updated_at);
    requireBool(`${p}.is_archived`, t.is_archived);

    (t.rows || []).forEach((r, j) => {
      const rp = `${p}.rows[${j}]`;
      requireString(`${rp}.row_id`, r.row_id);
      requireInt(`${rp}.order_index`, r.order_index);
      requireString(`${rp}.hebrew_plain`, r.hebrew_plain);
      requireString(`${rp}.hebrew_niqqud`, r.hebrew_niqqud);
      requireString(`${rp}.translit`, r.translit);
      // translit_ru has default "" so missing is OK; string if present.
      if (typeof r.translit_ru !== "undefined" && typeof r.translit_ru !== "string") {
        errs.push(`${rp}.translit_ru: must be String, got ${typeof r.translit_ru}`);
      }
      requireString(`${rp}.russian`, r.russian);
      if (typeof r.edit_meta === "undefined") errs.push(`${rp}.edit_meta: undefined`);
      allowNullableString(`${rp}.audio_asset_key`, r.audio_asset_key);
    });
  });

  libJson.audio_assets.forEach((a, i) => {
    const p = `audio_assets[${i}]`;
    requireString(`${p}.asset_key`, a.asset_key);
    requireString(`${p}.relative_export_path`, a.relative_export_path);
    requireString(`${p}.mime_type`, a.mime_type);
    requireString(`${p}.provider_id`, a.provider_id);
    allowNullableString(`${p}.voice_name`, a.voice_name);
    requireString(`${p}.language`, a.language);  // ← non-nullable
    if (a.duration_ms !== null && typeof a.duration_ms !== "number") errs.push(`${p}.duration_ms: must be Long? null|number`);
    if (a.size_bytes !== null && typeof a.size_bytes !== "number") errs.push(`${p}.size_bytes: must be Long? null|number`);
    allowNullableString(`${p}.content_hash`, a.content_hash);
    if (typeof a.provenance === "undefined") errs.push(`${p}.provenance: undefined`);
  });

  return errs;
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: node tests/verify_zip_android_compat.js <path-to-zip>");
    process.exit(2);
  }
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const libFile = zip.file("library/library.json");
  if (!libFile) { console.error("ZIP missing library/library.json"); process.exit(1); }
  const libJson = JSON.parse(await libFile.async("string"));
  console.log("Validating library.json from:", zipPath);
  console.log("  texts:", (libJson.texts || []).length, "audio_assets:", (libJson.audio_assets || []).length);

  const errs = validate(libJson);
  if (!errs.length) {
    console.log("✅ library.json schema is Android-v2-compatible (kotlinx.serialization will parse).");
    process.exit(0);
  }
  console.log("❌ Android-v2 strict-schema violations:");
  errs.slice(0, 30).forEach((e) => console.log("   • " + e));
  if (errs.length > 30) console.log(`   …and ${errs.length - 30} more`);
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
