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
const Contract = require('../../public/js/atlas-context-contract.js');
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
2. \`glosses.length\` = \`words.length\`; у каждого слова непустой \`gloss\` ≤ 120 знаков (WordGlossAI MAX_GLOSS), без иврита и транслита.
3. \`mwe\`: \`0 ≤ from ≤ to < words.length\`; можно пустой массив.
4. Необязательно: \`"wrong_hint": true\` у слова, если обычное словарное значение здесь вводит в заблуждение.
5. Служебные слова и предлоги тоже переводятся (\`את\` → «(вин. падеж)», \`של\` → «(род. падеж)»).

## Куда положить
Папка \`answers/\` рядом с этим архивом (или zip с файлами \`<раздел>.json\`). Приём: \`scripts/atlas/import-context.cjs\`.
`;

async function main() {
  const { RM, AI, AW } = reader();
  const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
  const zip = new JSZip(), manifest = { schema: index.atlas_id==='a97001' ? 'atlas-context-export-v2' : "atlas-context-export-v1", atlas: index.atlas_id || "a97002",
    built_at: new Date().toISOString(), layer_schema: AI.LAYER_SCHEMA, sections: [] };
  let rowsAll = 0, wordsAll = 0;
  for (const s of index.sections) {
    const sectionBytes = fs.readFileSync(path.join(DATA, "sections", s.id + ".json"));
    const data = JSON.parse(sectionBytes);
    const ctx = AW.sectionContext(manifest.atlas, data, RM);
    const pageOf = new Map();
    (data.pages || []).forEach((p) => (p.items || []).forEach((it) => pageOf.set(String(it.id), p.page)));
    const lines = [];
    let words = 0;
    const sourceRows = AW.glossRows(ctx), expected = manifest.atlas==='a97001' ? Contract.describe(sourceRows, AI) : [];
    for (const row of sourceRows) {
      const p = AI.rowPayloadFromData(row);
      if (!p) continue;
      lines.push(JSON.stringify({ order_index: row.order_index, block_id: row.id, page: row.source_context?.page || pageOf.get(row.id), he: row.he, he_niqqud: row.he_niqqud,
        ru: row.ru, words: p.words.map((w) => w.w), key: p.key,
        ...(manifest.atlas==='a97001'?{row_id:row.id,row_type:row.row_type,source_context:row.source_context}: {}) }));
      words += p.words.length;
    }
    const body = lines.join("\n") + "\n";
    zip.file("rows/" + s.id + ".jsonl", body);
    let contractFields = {};
    if (manifest.atlas==='a97001') {
      // The export must not certify fields the reader cannot expose in a word card.
      const R = require('../../public/js/atlas-reader.js').factory(document);
      const view = R.renderSection((_k, fallback)=>fallback, data, {});
      const visible = new Set(Array.from(view.querySelectorAll('.atlas-row[data-ref],.atlas-learning-row[data-ref]')).map(el=>el.getAttribute('data-ref')));
      const hidden = expected.filter(row=>!visible.has(row.id)).map(row=>row.id);
      if(hidden.length)throw Error('Export rows have no reader card: '+hidden.join(', '));
      const unsupported = data.pages.flatMap(p=>(p.figures||[]).flatMap(f=>(f.regions||[]).filter(r=>/[\u05d0-\u05ea]/.test(r.label_he||'')).map(r=>r.id)));
      if(unsupported.length)throw Error('Region Hebrew needs an explicit context adapter: '+unsupported.join(', '));
      contractFields={ contract:Contract.CONTRACT, source_revision:await Contract.revision(expected),
        section_sha256:crypto.createHash('sha256').update(sectionBytes).digest('hex'),
        coverage:Object.fromEntries([...new Set(expected.map(r=>r.row_type))].map(kind=>[kind,{rows:expected.filter(r=>r.row_type===kind).length,words:expected.filter(r=>r.row_type===kind).reduce((n,r)=>n+r.words.length,0)}])),
        exclusions:(data.context_exclusions||[]).concat([{ref:data.id,field:'title_he',reason:'Editorial navigation heading; source headings remain in their page blocks. Not a separate source sentence.'}]),
        non_token_rows:sourceRows.filter(row=>!AI.rowPayloadFromData(row)).map(row=>({id:row.id,reason:'No Hebrew word tokens; notation/punctuation is not a vocabulary sentence.'})) };
    }
    manifest.sections.push({ id: s.id, content_pack_sha256: data.content_pack_sha256 || "", rows: lines.length, words,...contractFields,
      rows_sha256: crypto.createHash("sha256").update(body).digest("hex") });
    rowsAll += lines.length; wordsAll += words;
  }
  manifest.rows = rowsAll; manifest.words = wordsAll;
  zip.file("manifest.json", JSON.stringify(manifest, null, 1) + "\n");
  zip.file("FORMAT.ru.md", manifest.atlas==='a97001' ? fs.readFileSync(path.join(__dirname,'CONTEXT_CONTRACT_97001.md'),'utf8') : FORMAT);
  if(manifest.atlas==='a97001') {
    manifest.producer_commit=require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:REPO,encoding:'utf8'}).trim();
    manifest.producer_worktree_clean=!require('child_process').execFileSync('git',['diff','--name-only'],{cwd:REPO,encoding:'utf8'}).trim();
    zip.file('manifest.json',JSON.stringify(manifest,null,1)+'\n');
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "atlas-" + manifest.atlas + "-context-export.zip");
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
  const drive = opt("drive", "");
  if (drive) { fs.mkdirSync(drive, { recursive: true }); fs.copyFileSync(file, path.join(drive, path.basename(file))); fs.writeFileSync(path.join(drive, "FORMAT.ru.md"), manifest.atlas==='a97001' ? fs.readFileSync(path.join(__dirname,'CONTEXT_CONTRACT_97001.md'),'utf8') : FORMAT); }
  console.log(JSON.stringify({ file: path.relative(REPO, file), bytes: fs.statSync(file).size, sections: manifest.sections.length, rows: rowsAll, words: wordsAll, drive: drive || null }));
}
main().catch((e) => { console.error(e); process.exit(1); });
