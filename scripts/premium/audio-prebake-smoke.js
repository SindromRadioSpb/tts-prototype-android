#!/usr/bin/env node
// scripts/premium/audio-prebake-smoke.js  (npm run smoke:audio-prebake)
// BRR-P0-007 · Gate for the canon audio pre-bake stamping contract. Pure/offline
// (no GCP, no browser). Proves: key parity, the row text rule, stamped-row →
// audio_assets[] integrity + dedup, R1 honesty (audio_status is 'tts' only when
// every row is voiced, NEVER 'human'), the P0-008 shelf/version stamping, and the
// negative controls (an unbaked row lands in `missing`, not silently shipped).

const assert = require("assert");
const ttsKey = require("../../db/premium/ttsAssetKey");
const tb = require("./lib/ttsBake");
const { stampCanonAudio, CANON_ORIGIN } = require("./lib/stampCanon");

let pass = 0;
const fail = (m) => { console.error("✗ " + m); process.exitCode = 1; };
const ok = (cond, m) => { if (cond) { pass++; } else fail(m); };

const PROFILE = { language: "he-IL", voiceName: "he-IL-Wavenet-A", speakingRate: 1.0, pitch: 0.0 };

// ── 1. key parity (== server's computeAssetKey, frozen) ──────────────────────
ok(ttsKey.computeAssetKey({ text: "שָׁלוֹם עוֹלָם", ttsProfile: { language: "he-IL", voiceName: "he-IL-Wavenet-D", speakingRate: 1.0, pitch: 0.0 }, assetType: "row" })
   === "8b370a98f1e5a3371ad24457ba6f344769e4773c1171f3b0df720d0b9f27bf26", "frozen assetKey vector holds");
ok(tb.keyForText("מִלָּה", PROFILE) === ttsKey.computeAssetKey({ text: "מִלָּה", ttsProfile: PROFILE, assetType: "row" }), "ttsBake.keyForText == computeAssetKey (assetType row)");

// ── 2. row text rule (== reader-core.getRowTtsTextForRow): niqqud > plain > empty
ok(tb.rowText({ hebrew_niqqud: "שָׁלוֹם", hebrew_plain: "שלום" }) === "שָׁלוֹם", "rowText: vocalised wins");
ok(tb.rowText({ hebrew_niqqud: "", hebrew_plain: "בית" }) === "בית", "rowText: falls back to consonantal");
ok(tb.rowText({ hebrew_niqqud: "", hebrew_plain: "" }) === "", "rowText: empty when nothing");
ok(tb.rowText({ he_niqqud: "אַ", he_plain: "א" }) === "אַ", "rowText: snake he_niqqud tolerated");

// ── 3. build a synthetic canon + complete bake manifest ──────────────────────
function makeLib() {
  return {
    schema_version: 1,
    shelves: [{ schema: 1, slug: "s1", title: "T", track: "literary", items: [{ text_key: "tk1", order: 0 }], order: 0 }],
    texts: [
      { text_key: "tk1", title: "A", corpus: { byehuda_id: 1, era: "haskalah", audio_status: "none" }, rows: [
        { row_id: "r0", order_index: 0, hebrew_niqqud: "שָׁלוֹם", hebrew_plain: "שלום", audio_asset_key: null },
        { row_id: "r1", order_index: 1, hebrew_niqqud: "", hebrew_plain: "בית", audio_asset_key: null },
        { row_id: "r2", order_index: 2, hebrew_niqqud: "שָׁלוֹם", hebrew_plain: "שלום", audio_asset_key: null }, // dup of r0
        { row_id: "r3", order_index: 3, hebrew_niqqud: "", hebrew_plain: "", audio_asset_key: null },            // empty
      ] },
      { text_key: "tk2", title: "B", corpus: { byehuda_id: 2, era: "mandate", audio_status: "none" }, rows: [
        { row_id: "r0", order_index: 0, hebrew_niqqud: "אַהֲבָה", hebrew_plain: "אהבה", audio_asset_key: null },
        { row_id: "r1", order_index: 1, hebrew_niqqud: "כֶּלֶב", hebrew_plain: "כלב", audio_asset_key: null },
      ] },
    ],
  };
}
function makeManifest(lib, dropKeys = []) {
  const assets = {};
  for (const t of lib.texts) for (const r of (t.rows || [])) {
    const txt = tb.rowText(r); if (!txt) continue;
    const key = tb.keyForText(txt, PROFILE);
    if (dropKeys.includes(key)) continue;
    assets[key] = assets[key] || { chars: txt.length, bytes: 1234, eras: [t.corpus.era] };
  }
  return { profile: PROFILE, voiceName: PROFILE.voiceName, assets };
}

{
  const lib = makeLib();
  const top = { audio_count: 0, missing_audio_count: 1 };
  const res = stampCanonAudio(lib, makeManifest(lib), { topManifest: top, canonVersion: 3 });

  ok(res.missing.length === 0, "complete bake → no missing rows");
  ok(res.stats.stampedRows === 5, "5 non-empty rows stamped (got " + res.stats.stampedRows + ")");
  ok(res.stats.emptyRows === 1, "1 empty row skipped");
  ok(res.stats.uniqueAudioAssets === 4, "4 unique audio_assets after dedup (got " + res.stats.uniqueAudioAssets + ")");

  const t1 = lib.texts[0], t2 = lib.texts[1];
  ok(t1.rows[0].audio_asset_key && t1.rows[0].audio_asset_key === t1.rows[2].audio_asset_key, "dedup: identical rows share one key");
  ok(t1.rows[3].audio_asset_key === null, "empty row → audio_asset_key null");
  ok(t1.corpus.audio_status === "tts", "fully-voiced text → audio_status tts");
  ok(t2.corpus.audio_status === "tts", "fully-voiced text2 → audio_status tts");

  // every stamped key ∈ audio_assets
  const aaKeys = new Set(lib.audio_assets.map((a) => a.asset_key));
  let allIn = true;
  for (const t of lib.texts) for (const r of t.rows) if (r.audio_asset_key && !aaKeys.has(r.audio_asset_key)) allIn = false;
  ok(allIn, "every stamped row key has an audio_assets[] entry");

  // P0-008 stamping
  ok(lib.canon_version === 3, "library.canon_version = 3");
  ok(lib.shelves.every((s) => s.origin === CANON_ORIGIN && s.canon_version === 3), "shelves stamped origin + canon_version");
  ok(top.audio_count === 4 && top.missing_audio_count === 0, "top manifest counts refreshed");

  // audio_assets[] shape (Android-v2 strict fields)
  const a0 = lib.audio_assets[0];
  ok(/^[a-f0-9]{64}$/.test(a0.asset_key), "audio_asset.asset_key is 64-hex");
  ok(a0.relative_export_path === "audio/" + a0.asset_key + ".mp3", "audio_asset.relative_export_path well-formed");
  ok(a0.mime_type === "audio/mpeg" && a0.language === "he-IL", "audio_asset mime + language present");
  ok(a0.provenance && a0.provenance.ttsProfile && a0.provenance.ttsProfile.voiceName === "he-IL-Wavenet-A", "audio_asset provenance carries ttsProfile");

  // R1 honesty: never 'human'
  ok(lib.texts.every((t) => t.corpus.audio_status !== "human"), "audio_status is NEVER 'human' (machine TTS)");
}

// ── 4. negative control: an UNBAKED row → missing, text NOT claimed tts ───────
{
  const lib = makeLib();
  const dropKey = tb.keyForText("כֶּלֶב", PROFILE); // drop text2 r1
  const res = stampCanonAudio(lib, makeManifest(lib, [dropKey]), { canonVersion: 3 });
  ok(res.missing.length === 1 && res.missing[0].key === dropKey, "unbaked row surfaces in `missing` (R1 abort signal)");
  ok(lib.texts[1].corpus.audio_status !== "tts", "partially-voiced text is NOT mislabelled 'tts'");
  ok(lib.texts[0].corpus.audio_status === "tts", "the other (complete) text is still 'tts'");
}

if (process.exitCode) { console.error("\nsmoke:audio-prebake FAILED"); }
else { console.log("✓ smoke:audio-prebake — " + pass + "/" + pass + " checks passed"); }
