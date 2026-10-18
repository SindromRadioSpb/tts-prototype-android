// tests/subtitleTextDecode.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../public/js/subtitle-text-decode.js");

const HE = "1\r\n00:00:17,700 --> 00:00:22,800\r\nטוב, מי יכול להגיד לי מה\r\n?ההבדל בין חרדון לבין שממית\r\n\r\n";
const RU = "1\r\n00:00:01,000 --> 00:00:02,000\r\nПривет, как дела? Это субтитры на русском языке.\r\n\r\n";

// Node's TextEncoder only writes UTF-8: legacy bytes are built from the decoder's own table.
function legacyBytes(text, encoding) {
  const dec = new TextDecoder(encoding);
  const table = new Map();
  for (let b = 0; b < 256; b++) table.set(dec.decode(Uint8Array.of(b)), b);
  return Uint8Array.from(Array.from(text), (ch) => {
    if (!table.has(ch)) throw new Error("not encodable: " + ch);
    return table.get(ch);
  });
}

test("windows-1255 Hebrew (old DVD rips) is read as Hebrew, not as replacement marks", () => {
  const r = D.decodeSubtitleBytes(legacyBytes(HE, "windows-1255"));
  assert.equal(r.encoding, "windows-1255");
  assert.equal(r.detected_by, "legacy-score");
  assert.equal(r.text, HE);
  assert.ok(!r.text.includes("�"));
});

test("UTF-8 without BOM stays UTF-8", () => {
  const r = D.decodeSubtitleBytes(new TextEncoder().encode(HE));
  assert.equal(r.encoding, "utf-8");
  assert.equal(r.detected_by, "utf8-valid");
  assert.equal(r.text, HE);
});

test("UTF-8 BOM is honoured and stripped", () => {
  const body = new TextEncoder().encode(HE);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]); bytes.set(body, 3);
  const r = D.decodeSubtitleBytes(bytes);
  assert.equal(r.encoding, "utf-8");
  assert.equal(r.detected_by, "bom");
  assert.equal(r.text, HE);
});

test("UTF-16 LE and BE, with and without BOM", () => {
  const le = new Uint8Array(HE.length * 2), be = new Uint8Array(HE.length * 2);
  for (let i = 0; i < HE.length; i++) {
    const c = HE.charCodeAt(i);
    le[2 * i] = c & 0xff; le[2 * i + 1] = c >> 8;
    be[2 * i] = c >> 8; be[2 * i + 1] = c & 0xff;
  }
  assert.equal(D.decodeSubtitleBytes(le).encoding, "utf-16le");
  assert.equal(D.decodeSubtitleBytes(le).text, HE);
  assert.equal(D.decodeSubtitleBytes(be).encoding, "utf-16be");
  const withBom = new Uint8Array(le.length + 2);
  withBom.set([0xff, 0xfe]); withBom.set(le, 2);
  const r = D.decodeSubtitleBytes(withBom);
  assert.equal(r.encoding, "utf-16le");
  assert.equal(r.detected_by, "bom");
  assert.equal(r.text, HE);
});

test("windows-1251 Russian subtitles are not mistaken for Hebrew", () => {
  const r = D.decodeSubtitleBytes(legacyBytes(RU, "windows-1251"));
  assert.equal(r.encoding, "windows-1251");
  assert.equal(r.text, RU);
});

test("windows-1252 French with accents is not read as Hebrew", () => {
  const FR = "1\r\n00:00:01,000 --> 00:00:02,000\r\nÇa va très bien, merci. Où est le café? À bientôt, Hélène.\r\n\r\n";
  const r = D.decodeSubtitleBytes(legacyBytes(FR, "windows-1252"));
  assert.equal(r.encoding, "windows-1252");
  assert.equal(r.text, FR);
});

test("an explicit encoding chosen by the person wins over detection", () => {
  const bytes = legacyBytes(HE, "windows-1255");
  const r = D.decodeSubtitleBytes(bytes, { encoding: "windows-1251" });
  assert.equal(r.encoding, "windows-1251");
  assert.equal(r.detected_by, "chosen");
});

test("plain ASCII is UTF-8", () => {
  const r = D.decodeSubtitleBytes(new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\nhello\n"));
  assert.equal(r.encoding, "utf-8");
});

test("candidate list is offered for the manual override", () => {
  assert.ok(D.ENCODINGS.includes("windows-1255"));
  assert.ok(D.ENCODINGS.includes("utf-8"));
  assert.ok(D.ENCODINGS.includes("windows-1251"));
});

test("readSubtitleFile reads a Blob-like file", async () => {
  const bytes = legacyBytes(HE, "windows-1255");
  const file = { arrayBuffer: async () => bytes.buffer.slice(0) };
  const r = await D.readSubtitleFile(file);
  assert.equal(r.encoding, "windows-1255");
  assert.equal(r.text, HE);
  assert.equal(r.bytes.length, bytes.length);
});
