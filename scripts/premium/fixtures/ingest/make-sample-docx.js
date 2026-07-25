"use strict";
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ children: [new TextRun("שלום עולם — פסקה ראשונה")] }),
      new Paragraph({ children: [new TextRun("זהו מסמך בדיקה של LinguistPro.")] }),
      new Paragraph({ children: [new TextRun("Абзац на русском для смешанного документа.")] }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "sample-he.docx");
  fs.writeFileSync(out, buf);
  console.log("written", out, buf.length, "bytes");
});
