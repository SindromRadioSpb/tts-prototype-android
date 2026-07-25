"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { extractDocxText } = require("../ingest/docxExtract.js");

const FIXTURE = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "premium", "fixtures", "ingest", "sample-he.docx"));

test("extracts paragraphs from Hebrew docx in order", () => {
  const r = extractDocxText(FIXTURE);
  assert.equal(r.method, "docx-xml");
  const lines = r.text.split("\n");
  assert.match(lines[0], /שלום עולם — פסקה ראשונה/);
  assert.match(lines[1], /זהו מסמך בדיקה של LinguistPro\./);
  assert.match(lines[2], /Абзац на русском/);
});

test("BAD_DOCX on non-zip garbage", () => {
  assert.throws(() => extractDocxText(Buffer.from("not a zip at all")), /BAD_DOCX/);
});

test("DOCX_EMPTY on zip without text", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("word/document.xml", Buffer.from("<w:document><w:body></w:body></w:document>", "utf8"));
  assert.throws(() => extractDocxText(z.toBuffer()), /DOCX_EMPTY/);
});
