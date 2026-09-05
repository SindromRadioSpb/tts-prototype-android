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

test("compressed DOCX cannot expand its document beyond the extraction budget", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("word/document.xml", Buffer.from("<w:p><w:t>" + "a".repeat(1025) + "</w:t></w:p>"));
  assert.throws(() => extractDocxText(z.toBuffer(), { maxXmlBytes: 1024 }), { code: "TOO_LARGE" });
});

test("corrupt compressed XML reports BAD_DOCX without leaking a ZIP implementation error", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("word/document.xml", Buffer.from("<w:p><w:t>hello</w:t></w:p>"));
  const bytes = z.toBuffer();
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  bytes.fill(0xff, start, start + 5);
  assert.throws(() => extractDocxText(bytes), { code: "BAD_DOCX" });
});

test("DOCX_EMPTY on zip without text", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("word/document.xml", Buffer.from("<w:document><w:body></w:body></w:document>", "utf8"));
  assert.throws(() => extractDocxText(z.toBuffer()), /DOCX_EMPTY/);
});

test("tab/br in document order (CRITICAL: must not be dropped)", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  const docXml = `<w:document><w:body>
<w:p>
<w:r><w:t>Cell1</w:t></w:r>
<w:r><w:tab/></w:r>
<w:r><w:t>Cell2</w:t></w:r>
</w:p>
<w:p>
<w:r><w:t>Line1</w:t></w:r>
<w:r><w:br/></w:r>
<w:r><w:t>Line2</w:t></w:r>
</w:p>
</w:body></w:document>`;
  z.addFile("word/document.xml", Buffer.from(docXml, "utf8"));
  const r = extractDocxText(z.toBuffer());
  assert.match(r.text, /Cell1\tCell2/, "tab must be preserved in first paragraph");
  assert.match(r.text, /Line1\nLine2/, "br must be preserved in second paragraph");
});

test("BAD_DOCX on zip without word/document.xml (missing entry branch)", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  z.addFile("unrelated.txt", Buffer.from("some content", "utf8"));
  assert.throws(() => extractDocxText(z.toBuffer()), /BAD_DOCX/);
});

test("self-closing empty paragraph (robustness)", () => {
  const AdmZip = require("adm-zip");
  const z = new AdmZip();
  const docXml = `<w:document><w:body>
<w:p><w:r><w:t>First</w:t></w:r></w:p>
<w:p/>
<w:p><w:r><w:t>Third</w:t></w:r></w:p>
</w:body></w:document>`;
  z.addFile("word/document.xml", Buffer.from(docXml, "utf8"));
  const r = extractDocxText(z.toBuffer());
  const lines = r.text.split("\n");
  assert.equal(lines[0], "First");
  assert.equal(lines[1], "Third");
});
