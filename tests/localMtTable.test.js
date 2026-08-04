const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../public/js/local-mt-table.js");

test("segmentation preserves line identity, empty rows, duplicates, RTL and punctuation order", () => {
  const rows = T.segmentText("שלום! שלום!\n\nПривет?\r\nנִקּוּד׃");
  assert.deepEqual(rows.map((row) => row.text), ["שלום!", "שלום!", "", "Привет?", "נִקּוּד׃"]);
  assert.deepEqual(rows.map((row) => row.source_line_index), [0, 0, 1, 2, 3]);
  assert.deepEqual(rows.map((row) => row.index), [0, 1, 2, 3, 4]);
});

test("he-ru mapping emits the existing provider authority and exact local model provenance", () => {
  const segments = T.segmentText("שלום\nשלום");
  const result = {
    request_id: "r", input_checksum: "c",
    model: { identity: "madlad@v1", id: "google/madlad", revision: "pin" },
    results: [{ index: 0, text: "привет" }, { index: 1, text: "привет" }],
  };
  const rows = T.buildRows(segments, result, "he", "ru", "2026-08-04T00:00:00.000Z");
  assert.equal(rows[0].translation_provider, "madlad");
  assert.equal(rows[0].he, "שלום");
  assert.equal(rows[0].ru, "привет");
  const meta = JSON.parse(rows[0].translation_meta_json);
  assert.equal(meta.model_revision, "pin");
  assert.equal(meta.local_execution, true);
  assert.match(meta.quality_positioning, /NO BILINGUAL HUMAN VALIDATION/);
});

test("ru-he reverse mapping and cardinality violations are explicit", () => {
  const segments = T.segmentText("привет");
  const rows = T.buildRows(segments, { model: {}, results: [{ index: 0, text: "שלום" }] }, "ru", "he", "now");
  assert.equal(rows[0].he, "שלום");
  assert.equal(rows[0].ru, "привет");
  assert.throws(() => T.buildRows(segments, { results: [] }, "ru", "he", "now"), /CARDINALITY/);
  assert.throws(() => T.buildRows(segments, { results: [{ index: 1, text: "שלום" }] }, "ru", "he", "now"), /MAPPING/);
});

test("shared mapper batches without losing global order, duplicates or empty rows", async () => {
  const segments = T.segmentText("א\n\nא");
  const calls = [];
  const client = { translate: async (texts) => {
    calls.push(texts.slice());
    return { model: { identity: "madlad@v1" }, results: texts.map((text, index) => ({ index, text: text ? "x" : "" })) };
  }};
  const mapped = await T.translateSegments({ client, segments, sourceLang: "he", targetLang: "ru", batchSize: 2 });
  assert.deepEqual(calls, [["א", ""], ["א"]]);
  assert.deepEqual(mapped.rows.map((row) => row.segment_index), [0, 1, 2]);
  assert.deepEqual(mapped.rows.map((row) => row.source_line_index), [0, 1, 2]);
  assert.deepEqual(mapped.rows.map((row) => row.ru), ["x", "", "x"]);
});
