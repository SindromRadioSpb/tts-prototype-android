"use strict";
// O-033 variant A (owner, 2026-09-29): the Gemini table path asks Dicta only about impossible
// pointings, through the existing fallback channel, and never fails the table over it.
const test = require("node:test");
const assert = require("node:assert/strict");
const { secondOpinionForTableRows } = require("../ingest/niqqudSecondOpinion");

const rows = () => [
  { he: "שלום", he_niqqud: "שָׁלוֹם", ru: "мир" },
  { he: "הוא תנגב את הכלים", he_niqqud: "הוּא תְּנְגֵּב אֶת הַכֵּלִים", ru: "x" },
  { he: "וסמארטפון חדש", he_niqqud: "וְסְמַארְטְפוֹן חָדָשׁ", ru: "y" },
];

test("no suspects: Dicta is not called", async () => {
  let calls = 0;
  const out = await secondOpinionForTableRows([{ he: "שלום", he_niqqud: "שָׁלוֹם" }], { vocalize: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(out.stats, null);
});

test("only suspect lines are sent; replacements and confirmations are reported", async () => {
  const sent = [];
  const out = await secondOpinionForTableRows(rows(), {
    vocalize: async (text) => { sent.push(text); return { niqqud: ["הוּא תְּנַגֵּב אֵת הַכֵּלִים", "וְסְמַארְטְפוֹן חָדָשׁ"].join("\n") }; },
  });
  assert.deepEqual(sent, [["הוא תנגב את הכלים", "וסמארטפון חדש"].join("\n")]);
  assert.equal(out.rows[1].he_niqqud, "הוּא תְּנַגֵּב אֶת הַכֵּלִים");
  assert.equal(out.rows[1].niqqud_second_opinion, "dicta");
  assert.equal(out.rows[2].he_niqqud, "וְסְמַארְטְפוֹן חָדָשׁ");
  const { confirmedWords, ...counts } = out.stats;
  assert.deepEqual(counts, { suspects: 2, replaced: 1, confirmed: 1, kept: 0 });
  assert.deepEqual(confirmedWords, ["וְסְמַארְטְפוֹן"]);
  assert.equal(Object.prototype.hasOwnProperty.call(out.rows[1], "niqqud"), false, "no stray field on Gemini rows");
});

test("Dicta down or a line mismatch leaves the rows untouched and says why", async () => {
  const down = await secondOpinionForTableRows(rows(), { vocalize: async () => { throw Object.assign(new Error("x"), { code: "NAKDAN_UNAVAILABLE" }); } });
  assert.equal(down.stats.error, "NAKDAN_UNAVAILABLE");
  assert.equal(down.rows[1].he_niqqud, "הוּא תְּנְגֵּב אֶת הַכֵּלִים");
  const short = await secondOpinionForTableRows(rows(), { vocalize: async () => ({ niqqud: "one line" }) });
  assert.equal(short.stats.error, "NAKDAN_LINE_MISMATCH");
});

test("the route runs the check before transliteration and reports it", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "../server.js"), "utf8");
  const route = src.slice(src.indexOf('app.post("/api/translate-table"'));
  const check = route.indexOf("await secondOpinionForTableRows(preparedRows");
  assert.ok(check > 0 && check < route.indexOf("canonicalizeGeminiTableRowsLocally(preparedRows"));
  assert.match(route, /NIQQUD_SECOND_OPINION_DICTA/);
  assert.match(route, /niqqudSecondOpinion,\n    \}\);/);
});
