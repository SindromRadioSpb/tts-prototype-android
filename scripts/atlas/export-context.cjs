#!/usr/bin/env node
"use strict";
// Atlas P4 W2 fallback (owner decisions E5, E6): the atlas as an archive for the owner's AI agent, which prepares
// «В контексте (ИИ)» — a Russian gloss for every Hebrew word of every block, in the existing word-gloss-ai-layer-v1.
// The row keys are computed by the reader's own code (WordGlossAI.rowPayloadFromData over AtlasWords.glossRows), so a
// key the agent echoes back is the key the reader checks.
//   node scripts/atlas/export-context.cjs [--data=data/atlas/a97002] [--out=.tmp/atlas-context-export] [--drive=<dir>]
// Answer import: scripts/atlas/import-context.cjs.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");
const { parseHTML } = require("linkedom");

const REPO = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const opt = (f, d) => { const a = argv.find((x) => x.startsWith("--" + f + "=")); return a ? a.slice(f.length + 3) : d; };
const DATA = path.resolve(REPO, opt("data", "data/atlas/a97002"));
const OUT = path.resolve(REPO, opt("out", ".tmp/atlas-context-export"));

function reader() {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  global.window = window; global.document = document; window.indexedDB = undefined;
  window.ReaderMorph = require(path.join(REPO, "public/js/reader-morph.js"));
  require(path.join(REPO, "public/js/word-gloss-ai.js"));
  return { RM: window.ReaderMorph, AI: window.WordGlossAI, AW: require(path.join(REPO, "public/js/atlas-words.js")) };
}

const FORMAT = `# Атлас 97002 — слой «В контексте (ИИ)»: задание и формат ответа

## Что нужно
Для каждой строки (блока) каждого раздела — русский перевод КАЖДОГО слова иврита **в значении этого места книги**
(инженерный текст: «מְתִיחָה» здесь — растяжение, «יְחִידָה» — единица, «תַּבְרִיג» — резьба).
Слова идут ровно в том порядке и количестве, что в поле \`words\` строки. Устойчивые сочетания — отдельно в \`mwe\`.

## Входные данные (этот архив)
- \`manifest.json\` — атлас, дата, разделы (sha256 содержимого раздела, число строк).
- \`rows/<раздел>.jsonl\` — по строке JSON на блок:
  \`{ "order_index", "block_id", "page", "he", "he_niqqud", "ru", "words": [...], "key" }\`.
  \`words\` — слова огласованной строки (как их видит читатель), \`ru\` — перевод блока, \`key\` — ключ строки.

## Ответ: один файл на раздел — \`<раздел>.json\`
\`\`\`json
{ "schema": "word-gloss-ai-layer-v1",
  "rows": [
    { "order_index": 0, "key": "<key из входной строки, без изменений>", "model": "<модель агента>",
      "glosses": [ { "gloss": "диаметр" }, { "gloss": "заклёпки" }, { "gloss": "требуемый" } ],
      "mwe": [ { "from": 0, "to": 1, "gloss": "диаметр заклёпки" } ] } ] }
\`\`\`
Правила (проверяются при приёме; строка с нарушением отбрасывается целиком, остальные принимаются):
1. \`key\` и \`order_index\` — ровно как во входной строке. Изменённый текст книги = другой ключ = строка не примется.
2. \`glosses.length\` = \`words.length\`; у каждого слова непустой \`gloss\` ≤ 200 знаков, без иврита и транслита.
3. \`mwe\`: \`0 ≤ from ≤ to < words.length\`; можно пустой массив.
4. Необязательно: \`"wrong_hint": true\` у слова, если обычное словарное значение здесь вводит в заблуждение.
5. Служебные слова и предлоги тоже переводятся (\`את\` → «(вин. падеж)», \`של\` → «(род. падеж)»).

## Куда положить
Папка \`answers/\` рядом с этим архивом (или zip с файлами \`<раздел>.json\`). Приём: \`scripts/atlas/import-context.cjs\`.
`;

async function main() {
  const { RM, AI, AW } = reader();
  const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
  const zip = new JSZip(), manifest = { schema: "atlas-context-export-v1", atlas: index.atlas_id || "a97002",
    built_at: new Date().toISOString(), layer_schema: AI.LAYER_SCHEMA, sections: [] };
  let rowsAll = 0, wordsAll = 0;
  for (const s of index.sections) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, "sections", s.id + ".json"), "utf8"));
    const ctx = AW.sectionContext(manifest.atlas, data, RM);
    const pageOf = new Map();
    (data.pages || []).forEach((p) => (p.items || []).forEach((it) => pageOf.set(String(it.id), p.page)));
    const lines = [];
    let words = 0;
    for (const row of AW.glossRows(ctx)) {
      const p = AI.rowPayloadFromData(row);
      if (!p) continue;
      lines.push(JSON.stringify({ order_index: row.order_index, block_id: row.id, page: pageOf.get(row.id), he: row.he, he_niqqud: row.he_niqqud,
        ru: row.ru, words: p.words.map((w) => w.w), key: p.key }));
      words += p.words.length;
    }
    const body = lines.join("\n") + "\n";
    zip.file("rows/" + s.id + ".jsonl", body);
    manifest.sections.push({ id: s.id, content_pack_sha256: data.content_pack_sha256 || "", rows: lines.length, words,
      rows_sha256: crypto.createHash("sha256").update(body).digest("hex") });
    rowsAll += lines.length; wordsAll += words;
  }
  manifest.rows = rowsAll; manifest.words = wordsAll;
  zip.file("manifest.json", JSON.stringify(manifest, null, 1) + "\n");
  zip.file("FORMAT.ru.md", FORMAT);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "atlas-" + manifest.atlas + "-context-export.zip");
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
  const drive = opt("drive", "");
  if (drive) { fs.mkdirSync(drive, { recursive: true }); fs.copyFileSync(file, path.join(drive, path.basename(file))); fs.writeFileSync(path.join(drive, "FORMAT.ru.md"), FORMAT); }
  console.log(JSON.stringify({ file: path.relative(REPO, file), bytes: fs.statSync(file).size, sections: manifest.sections.length, rows: rowsAll, words: wordsAll, drive: drive || null }));
}
main().catch((e) => { console.error(e); process.exit(1); });
