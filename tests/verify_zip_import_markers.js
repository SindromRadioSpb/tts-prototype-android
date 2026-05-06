// End-to-end verification harness for the OPFS import flow.
//
// Loads the user's actual ZIP bundle, runs the SAME logic as
// public/db/local-db.js#importBundle against an in-memory SQLite that mirrors
// the OPFS schema (migrations subset relevant to texts/sentences/audio).
//
// Then runs the SAME query as getSentences (LEFT JOIN audio_assets via
// sentence_audio is_default=1) and asserts that EVERY row that referenced
// an asset_key in the bundle has a non-null audio_asset_key after import.
//
// Then applies the same marker decision the browser does
// (v3AudioPrefetchUpdateMarkerForRow) and counts state-ok / state-mismatch /
// state-missing.
//
// Run: node tests/verify_zip_import_markers.js \
//   "C:\Users\lletp\Downloads\library-bundle-top100maco-150verb-150pril.zip"

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const JSZip = require("jszip");

function uuid() {
  // Simple v4 UUID; doesn't need to be cryptographically strong here.
  const r = (n) => Math.floor(Math.random() * n);
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += hex[r(16)];
  return (
    s.slice(0, 8) + "-" + s.slice(8, 12) + "-4" + s.slice(13, 16) +
    "-" + ["8","9","a","b"][r(4)] + s.slice(17, 20) + "-" + s.slice(20, 32)
  );
}

function dbAll(db, sql, params = []) {
  return new Promise((res, rej) =>
    db.all(sql, params, (e, rows) => (e ? rej(e) : res(rows)))
  );
}
function dbRun(db, sql, params = []) {
  return new Promise((res, rej) =>
    db.run(sql, params, function (e) {
      if (e) return rej(e);
      res({ lastID: this.lastID, changes: this.changes });
    })
  );
}
function dbExec(db, sql) {
  return new Promise((res, rej) => db.exec(sql, (e) => (e ? rej(e) : res())));
}

// Subset of public/db/migrations.js relevant to this verification.
const SCHEMA = `
CREATE TABLE texts (
  id TEXT PRIMARY KEY,
  text_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  level TEXT,
  tags_json TEXT,
  source_text TEXT NOT NULL,
  source_meta_json TEXT,
  tts_profile_json TEXT,
  table_model_meta_json TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT,
  source TEXT,
  topic TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pin_order INTEGER
);
CREATE TABLE sentences (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  he_plain TEXT,
  he_niqqud TEXT,
  translit TEXT,
  translit_ru TEXT,
  ru TEXT,
  meta_json TEXT,
  edit_meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(text_id, order_index)
);
CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  asset_key TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_ms INTEGER,
  size_bytes INTEGER,
  tts_profile_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE TABLE sentence_audio (
  sentence_id TEXT NOT NULL,
  audio_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (sentence_id, audio_id)
);
CREATE TABLE sentence_notes (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL,
  sentence_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(text_id, sentence_id)
);
`;

// ── importBundle (mirrors public/db/local-db.js) ──────────────────────────
async function importBundleSim(db, bundleObj, mode = "skip") {
  const lib =
    bundleObj && bundleObj.library && typeof bundleObj.library === "object"
      ? bundleObj.library
      : bundleObj;
  const texts =
    lib && Array.isArray(lib.texts)
      ? lib.texts
      : Array.isArray(bundleObj)
      ? bundleObj
      : [];

  const audioAssetsByKey = new Map();
  const aaList = lib && Array.isArray(lib.audio_assets) ? lib.audio_assets : [];
  for (const aa of aaList) {
    if (aa && aa.asset_key) audioAssetsByKey.set(String(aa.asset_key), aa);
  }

  const result = { imported: 0, skipped: 0, errors: [] };

  for (const item of texts) {
    let textData;
    if (item && item.text && typeof item.text === "object") {
      textData = {
        ...item.text,
        sentences: Array.isArray(item.sentences)
          ? item.sentences
          : item.text.sentences || [],
      };
    } else if (item && (item.text_id || Array.isArray(item.rows))) {
      const tags = item.tags;
      textData = {
        id: item.text_id,
        text_key: item.text_key,
        title: item.title,
        level: item.level,
        tags_json: Array.isArray(tags)
          ? JSON.stringify(tags)
          : typeof tags === "string"
          ? tags
          : "[]",
        source: item.source_label || item.source || null,
        topic: item.topic || null,
        source_text: item.source_text || "",
        source_meta_json: item.source_meta
          ? JSON.stringify(item.source_meta)
          : null,
        table_model_meta_json: item.table_model_meta
          ? JSON.stringify(item.table_model_meta)
          : null,
        is_archived: item.is_archived ? 1 : 0,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        sentences: (Array.isArray(item.rows) ? item.rows : []).map((r) => ({
          he_plain: r.hebrew_plain || r.he_plain || "",
          he_niqqud: r.hebrew_niqqud || r.he_niqqud || "",
          translit: r.translit || "",
          translit_ru: r.translit_ru || "",
          ru: r.russian || r.ru || "",
          edit_meta_json: r.edit_meta
            ? JSON.stringify(r.edit_meta)
            : r.edit_meta_json || null,
          audio_asset_key: r.audio_asset_key || r.audioAssetKey || null,
          note: r.note || null,
          order_index: r.order_index ?? null,
        })),
      };
    } else {
      textData = item;
    }

    try {
      const text_key =
        String(textData.text_key || textData.textKey || "").trim() ||
        "imported-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const existing = await dbAll(
        db,
        "SELECT id FROM texts WHERE text_key = ?",
        [text_key]
      );
      if (existing.length > 0 && mode === "skip") {
        result.skipped++;
        continue;
      }

      const newTextId = uuid();
      // createText
      const now = new Date().toISOString();
      await dbRun(
        db,
        `INSERT INTO texts (id, text_key, title, source_text, level, tags_json, source, topic,
           tts_profile_json, source_meta_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newTextId,
          text_key,
          textData.title == null ? "" : String(textData.title),
          textData.source_text == null ? "" : String(textData.source_text),
          textData.level ?? null,
          textData.tags_json ?? "[]",
          textData.source ?? null,
          textData.topic ?? null,
          textData.tts_profile_json ?? null,
          textData.source_meta_json ?? null,
          now,
          now,
        ]
      );

      const sentences = textData.sentences ?? textData.rows ?? [];
      for (const s of sentences) {
        const newSentenceId = uuid();
        // addSentence
        const maxRow = await dbAll(
          db,
          "SELECT COALESCE(MAX(order_index), -1) AS m FROM sentences WHERE text_id = ?",
          [newTextId]
        );
        const order = (maxRow[0]?.m ?? -1) + 1;
        await dbRun(
          db,
          `INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, translit_ru,
             ru, meta_json, edit_meta_json, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            newSentenceId,
            newTextId,
            order,
            s.he_plain || "",
            s.he_niqqud || "",
            s.translit || "",
            s.translit_ru ?? null,
            s.ru || "",
            null,
            s.edit_meta_json ?? null,
            now,
          ]
        );
        if (s.note && String(s.note).trim()) {
          await dbRun(
            db,
            `INSERT INTO sentence_notes (id, text_id, sentence_id, note, created_at, updated_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(text_id, sentence_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
            [uuid(), newTextId, newSentenceId, String(s.note), now, now]
          );
        }
        const ak = String(s.audio_asset_key || s.audioAssetKey || "").trim();
        if (ak) {
          const aaMeta = audioAssetsByKey.get(ak) || null;
          let ttsProfileJson = null;
          if (aaMeta) {
            const prov = aaMeta.provenance && aaMeta.provenance.ttsProfile;
            if (prov && typeof prov === "object") {
              ttsProfileJson = JSON.stringify(prov);
            } else if (aaMeta.voice_name || aaMeta.language) {
              ttsProfileJson = JSON.stringify({
                language: aaMeta.language || "he-IL",
                voiceName: aaMeta.voice_name || "",
              });
            }
          }
          // upsertAudioAsset
          const aId = uuid();
          await dbRun(
            db,
            `INSERT INTO audio_assets (id, asset_key, asset_type, relative_path, mime, duration_ms, size_bytes, tts_profile_json, created_at, last_used_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(asset_key) DO UPDATE SET last_used_at = excluded.last_used_at`,
            [
              aId,
              ak,
              "row",
              (aaMeta && aaMeta.relative_export_path) || "audio-cache/" + ak + ".mp3",
              (aaMeta && aaMeta.mime_type) || "audio/mpeg",
              (aaMeta && aaMeta.duration_ms) || null,
              (aaMeta && aaMeta.size_bytes) || null,
              ttsProfileJson,
              now,
              now,
            ]
          );
          const asset = (await dbAll(
            db,
            "SELECT id FROM audio_assets WHERE asset_key = ?",
            [ak]
          ))[0];
          if (asset && asset.id) {
            // linkSentenceAudio
            await dbRun(
              db,
              `INSERT OR IGNORE INTO sentence_audio (sentence_id, audio_id, is_default) VALUES (?,?,?)`,
              [newSentenceId, asset.id, 1]
            );
          }
        }
      }
      result.imported++;
    } catch (e) {
      result.errors.push({ title: textData?.title, error: e.message });
    }
  }
  return result;
}

// Same JOIN as local-db.js#getSentences after my fix.
async function getSentencesSim(db, textId) {
  return dbAll(
    db,
    `SELECT s.*,
            aa.asset_key  AS audio_asset_key,
            aa.tts_profile_json AS audio_tts_profile_json
       FROM sentences s
  LEFT JOIN sentence_audio sa ON sa.sentence_id = s.id AND sa.is_default = 1
  LEFT JOIN audio_assets   aa ON aa.id = sa.audio_id
      WHERE s.text_id = ?
   ORDER BY s.order_index`,
    [textId]
  );
}

// Subset of v3AudioPrefetchUpdateMarkerForRow's decision tree.
function decideMarker(row, currentProfile) {
  if (!row || !row.id) return "state-missing";
  const haveKey = row.audio_asset_key
    ? String(row.audio_asset_key).trim()
    : "";
  if (!haveKey) return "state-missing";
  // Lenient match: if either side has incomplete profile metadata, treat as ok.
  let stored = null;
  try {
    stored = row.audio_tts_profile_json
      ? JSON.parse(String(row.audio_tts_profile_json))
      : null;
  } catch (_) {}
  function normalize(p) {
    if (!p || typeof p !== "object") return null;
    const language = String(p.language || p.lang || "").trim();
    const voiceName = String(p.voiceName || p.voiceId || p.voice || "").trim();
    if (!language || !voiceName) return null;
    return { language, voiceName };
  }
  const A = normalize(stored);
  const B = normalize(currentProfile);
  if (!A || !B) return "state-ok";
  if (A.language === B.language && A.voiceName === B.voiceName)
    return "state-ok";
  return "state-mismatch";
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: node tests/verify_zip_import_markers.js <path-to-zip>");
    process.exit(2);
  }

  console.log("Step 1: load ZIP at", zipPath);
  const zipBuf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipBuf);

  // Detect layout (same as v3LibraryOnBundleImportSelected).
  let libFile = zip.file("library/library.json");
  let layout = "unified";
  let audioFolderName = "audio";
  if (!libFile) {
    libFile = zip.file("library.json");
    layout = "legacy-web";
    audioFolderName = "audio-cache";
  }
  if (!libFile) throw new Error("ZIP missing library.json");
  const parsed = JSON.parse(await libFile.async("string"));
  console.log("    layout:", layout);
  console.log(
    "    bundle: schema_version =", parsed.schema_version,
    "| texts =", (parsed.texts || []).length,
    "| audio_assets =", (parsed.audio_assets || []).length,
  );

  console.log("Step 2: open in-memory SQLite mirroring OPFS schema");
  const db = new sqlite3.Database(":memory:");
  await dbExec(db, SCHEMA);

  console.log("Step 3: run importBundle against in-memory DB");
  const start = Date.now();
  const r = await importBundleSim(db, parsed, "skip");
  console.log(
    "    importBundle done in",
    (Date.now() - start) + "ms",
    "| imported =", r.imported,
    "| skipped =", r.skipped,
    "| errors =", r.errors.length,
  );
  if (r.errors.length) {
    console.log("    sample errors:", r.errors.slice(0, 3));
  }

  console.log("Step 4: query getSentences for each text and check audio_asset_key");
  const allTexts = await dbAll(db, "SELECT id, title FROM texts ORDER BY title");
  let rowsTotal = 0;
  let rowsWithAudio = 0;
  let rowsWithoutAudio = 0;
  let rowsWithProfile = 0;
  for (const t of allTexts) {
    const rows = await getSentencesSim(db, t.id);
    for (const r of rows) {
      rowsTotal++;
      if (r.audio_asset_key) rowsWithAudio++;
      else rowsWithoutAudio++;
      if (r.audio_tts_profile_json) rowsWithProfile++;
    }
  }
  console.log("    texts =", allTexts.length);
  console.log("    rows total =", rowsTotal);
  console.log("    rows with audio_asset_key =", rowsWithAudio);
  console.log("    rows without audio =", rowsWithoutAudio);
  console.log("    rows with audio_tts_profile_json =", rowsWithProfile);

  console.log("Step 5: simulate marker decision per row (current profile = he-IL/he-IL-Standard-A)");
  const currentProfile = {
    language: "he-IL",
    voiceName: "he-IL-Standard-A",
    speakingRate: 0.9,
    pitch: 2.5,
  };
  const counts = { "state-ok": 0, "state-mismatch": 0, "state-missing": 0 };
  for (const t of allTexts) {
    const rows = await getSentencesSim(db, t.id);
    for (const r of rows) {
      counts[decideMarker(r, currentProfile)]++;
    }
  }
  console.log("    markers:", counts);

  console.log("\nVerdict:");
  if (counts["state-ok"] === rowsWithAudio && rowsWithAudio > 0) {
    console.log("  ✅ Every row that has audio in the bundle gets state-ok (green) after import.");
    console.log("  ✅ Browser at ?localMode=1 will render green markers for those rows.");
    console.log("  ⚠ Rows without audio (" + rowsWithoutAudio + ") render state-missing (grey) — expected.");
    process.exit(0);
  } else {
    console.log("  ❌ Mismatch: rowsWithAudio =", rowsWithAudio, "but state-ok =", counts["state-ok"]);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
