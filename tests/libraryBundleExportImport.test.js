const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildExportRowsWithNotes,
  countBundleNotes,
  isValidBundleAudioEntryName,
} = require("../db/libraryBundle");

test("bundle export rows include sentence notes and collect audio asset keys", () => {
  const audioKey = "a".repeat(64);
  const audioKeySet = new Set();

  const rows = buildExportRowsWithNotes(
    [
      {
        id: "sentence-1",
        order_index: 0,
        he_plain: "שלום",
        he_niqqud: "שָׁלוֹם",
        translit: "shalom",
        translit_ru: "шалом",
        ru: "мир",
        edit_meta_json: JSON.stringify({ edited: { ru: true } }),
        audio_asset_key: audioKey,
      },
      {
        id: "sentence-2",
        order_index: 1,
        he_plain: "עולם",
        he_niqqud: "",
        translit: "",
        translit_ru: "",
        ru: "мир",
        edit_meta_json: null,
        audio_asset_key: "",
      },
    ],
    [
      {
        sentence_id: "sentence-1",
        note: "Important local note",
        updated_at: "2026-05-05T00:00:00.000Z",
      },
    ],
    audioKeySet
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].note, "Important local note");
  assert.equal(rows[0].note_updated_at, "2026-05-05T00:00:00.000Z");
  assert.equal(rows[0].audio_asset_key, audioKey);
  assert.deepEqual(rows[0].edit_meta, { edited: { ru: true } });
  assert.equal(rows[1].note, "");
  assert.equal(audioKeySet.has(audioKey), true);
});

test("bundle manifest note count is derived from exported rows", () => {
  const noteCount = countBundleNotes([
    { rows: [{ note: "one" }, { note: "" }] },
    { rows: [{ note: "two" }, { note: "   " }] },
  ]);

  assert.equal(noteCount, 2);
});

test("bundle audio import accepts only flat content-addressed mp3 entries", () => {
  const key = "b".repeat(64);

  assert.equal(isValidBundleAudioEntryName(`audio/${key}.mp3`), true);
  assert.equal(isValidBundleAudioEntryName(`audio/${key.toUpperCase()}.mp3`), true);
  assert.equal(isValidBundleAudioEntryName(`audio/nested/${key}.mp3`), false);
  assert.equal(isValidBundleAudioEntryName(`audio/../${key}.mp3`), false);
  assert.equal(isValidBundleAudioEntryName(`audio/${key}.wav`), false);
  assert.equal(isValidBundleAudioEntryName(`metadata/${key}.mp3`), false);
});
