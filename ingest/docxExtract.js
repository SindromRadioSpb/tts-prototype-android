"use strict";

const AdmZip = require("adm-zip");
const { ingestErr } = require("./ssrfGuard.js");

function decodeXmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function extractDocxText(buf) {
  let zip;
  try { zip = new AdmZip(buf); } catch { throw ingestErr("BAD_DOCX", "Файл не является корректным .docx"); }
  let entry;
  try { entry = zip.getEntry("word/document.xml"); } catch { entry = null; }
  if (!entry) throw ingestErr("BAD_DOCX", "В файле нет word/document.xml");
  const xml = entry.getData().toString("utf8");
  const paras = [];
  for (const m of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const parts = [];
    for (const match of m.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab[^>]*\/>|<w:br[^>]*\/>/g)) {
      if (match[1] !== undefined) {
        // <w:t> element with text
        parts.push(decodeXmlEntities(match[1]));
      } else if (match[0].startsWith("<w:tab")) {
        // <w:tab/> element
        parts.push("\t");
      } else {
        // <w:br/> element
        parts.push("\n");
      }
    }
    paras.push(parts.join(""));
  }
  const text = paras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw ingestErr("DOCX_EMPTY", "Документ не содержит текста");
  return { text, method: "docx-xml" };
}

module.exports = { extractDocxText };
