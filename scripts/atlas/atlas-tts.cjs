#!/usr/bin/env node
// Engineering atlas listening (plan P3 §4.6): what is read, what it costs, and the recordings.
//
//   node scripts/atlas/atlas-tts.cjs inventory   [--atlas a97002|a97001rc32] [--data data/atlas/a97002] [--sections s09-belt,…] [--out report.json]
//   node scripts/atlas/atlas-tts.cjs review-pack [--data …] --out speech-review-pack.md      (40 formulas, D4)
//   node scripts/atlas/atlas-tts.cjs bake        --sections s09-belt[,…|all] [--out .tmp/atlas-tts] [--concurrency 2]
//   node scripts/atlas/atlas-tts.cjs verify      [--out .tmp/atlas-tts]
//   node scripts/atlas/atlas-tts.cjs index       [--out .tmp/atlas-tts] --index data/atlas/a97002/index.json --write <file>
//
// Hebrew only (owner, 2026-11-02). The text comes from public/js/atlas-speech.js — the module the reader uses to check
// the recordings — so the bake and the reader agree by construction. inventory makes no network call. bake needs the
// owner's rights record (D1), the cost ceiling (D5) and Google credentials in the operator's environment.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { computeAssetKey } = require("../../db/premium/ttsAssetKey");
const Speech = require("../../public/js/atlas-speech.js");
const Reader = require("../../public/js/atlas-reader.js");

const ROOT = path.resolve(__dirname, "..", "..");
// One tool for both books. a97002 is the default and its output is unchanged; a97001rc32 reads its own block kinds
// and is projected to the corpus IDs the reader uses (atlas-edition.js), so recordings key to the shown rows.
const BOOKS = {
  a97002: { dir: path.join(ROOT, "atlas", "a97002"), data: path.join(ROOT, "data", "atlas", "a97002"), readKinds: null, project: false },
  a97001rc32: { dir: path.join(ROOT, "atlas", "a97001rc32"), data: path.join(ROOT, ".tmp", "rc33", "candidate"), project: true,
    readKinds: ["heading", "subheading", "subtitle", "prose", "paragraph", "intro", "list_item", "definition", "definition_heading",
      "symbol_definition", "legend", "footnote", "note", "warning", "rule", "purpose", "properties", "result", "equilibrium_condition",
      "question", "problem", "problem_instruction", "exercise", "solution", "solution_heading", "solution_conclusion",
      "example", "examples", "example_heading", "example_statement", "example_text", "caption", "figure_caption",
      "table_label", "table_heading", "formula_label", "continuation", "source_note"] },
};
let ATLAS_ID = "a97002", ATLAS = BOOKS.a97002.dir, DEFAULT_DATA = BOOKS.a97002.data;
function selectAtlas(id) {
  invariant(BOOKS[id], `UNKNOWN_ATLAS:${id}`);
  ATLAS_ID = id; ATLAS = BOOKS[id].dir; DEFAULT_DATA = BOOKS[id].data;
}
const DEFAULT_OUT = path.join(ROOT, ".tmp", "atlas-tts");
// The Room's Hebrew voice, the same as Materials Science (owner D3, 2026-11-02).
const PROFILE = Object.freeze({ language: "he-IL", voiceName: "he-IL-Standard-A", speakingRate: 0.8, pitch: 2.5 });
const PROFILE_ID = "atlas-he-standard-a-0.8-pitch-2.5-v1";
// D5: about 0.4–0.5 million characters for the whole book in Hebrew; the bake stops above this ceiling.
const CHARACTER_CEILING = 600000;
const MAX_INPUT_BYTES = 4800;
const SCHEMA = "linguistpro.atlas-audio.1";

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stable(value) { return JSON.stringify(value, null, 2) + "\n"; }
function invariant(ok, message) { if (!ok) throw new Error(message); }

function loadLexicon() { return readJson(path.join(ATLAS, "speech-lexicon.json")); }
function loadOverrides() {
  const file = path.join(ATLAS, "speech-overrides.json");
  return fs.existsSync(file) ? readJson(file) : { items: {} };
}
function fileSha(file) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null; }

function sectionIds(data, wanted) {
  const all = fs.readdirSync(path.join(data, "sections")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  if (!wanted || wanted === "all") return all;
  const ids = String(wanted).split(",").map((x) => x.trim()).filter(Boolean);
  ids.forEach((id) => invariant(all.includes(id), `SECTION_NOT_FOUND:${id}`));
  return ids;
}

// Every readable item of a section, in book order, with the text the voice will read — or why there is none.
// Items the reader does not show (table pieces, lone symbols, stray marks: layoutPage().duplicate) are not baked.
function sectionPlan(data, sid, lexicon, overrides) {
  const file = path.join(data, "sections", sid + ".json");
  const bytes = fs.readFileSync(file);
  const book = BOOKS[ATLAS_ID];
  let section = JSON.parse(bytes.toString("utf8"));
  if (book.project) section = require("../../public/js/atlas-edition.js").projectCorpus(section, "");
  const kinds = book.readKinds || Speech.READ_KINDS;
  const R = Reader.factory(null);
  const items = [];
  for (const page of section.pages || []) {
    const lay = R.layoutPage(page);
    (page.items || []).forEach((item, i) => {
      const candidate = item.type === "formula" || kinds.includes(item.kind);
      if (!candidate) return;
      const kind = item.type === "formula" ? "formula" : "block";
      // a line the reader shows as its table (layoutPage().tableFor) is a table: tables are not read (plan §4.2)
      if (lay.duplicate[i] || lay.tableFor[i]) { items.push({ id: item.id, page: page.page, kind, ok: false, skip: true, reason: "HIDDEN_IN_READER" }); return; }
      const said = Speech.speak(item, lexicon, overrides, { readKinds: kinds });
      items.push({ id: item.id, page: page.page, kind, ok: said.ok, skip: !!said.skip, reason: said.reason || null,
        override: !!said.override, text: said.text || null, src: sha256(Buffer.from(Speech.sourceOf(item), "utf8")),
        latex: item.type === "formula" ? item.latex : undefined, he: item.type === "formula" ? undefined : item.he_niqqud });
    });
  }
  return { sid, section, section_sha256: sha256(bytes), items };
}

function assetKeyFor(kind, text) {
  return computeAssetKey({ assetType: kind === "formula" ? "atlas_formula" : "atlas_block", ttsProfile: PROFILE, text });
}

function inventory({ data = DEFAULT_DATA, sections } = {}) {
  const lexicon = loadLexicon(), overrides = loadOverrides();
  const keys = new Map(), perSection = [], reasons = {};
  let blocks = [0, 0], formulas = [0, 0], skipped = 0, longest = 0;
  for (const sid of sectionIds(data, sections)) {
    const plan = sectionPlan(data, sid, lexicon, overrides);
    let chars = 0;
    for (const it of plan.items) {
      if (it.skip) { skipped++; continue; }
      const count = it.kind === "formula" ? formulas : blocks;
      count[1]++;
      if (!it.ok) { reasons[it.reason] = (reasons[it.reason] || 0) + 1; continue; }
      count[0]++;
      const key = assetKeyFor(it.kind, it.text);
      longest = Math.max(longest, Buffer.byteLength(it.text, "utf8"));
      if (!keys.has(key)) { keys.set(key, it.text.length); chars += it.text.length; }
    }
    perSection.push({ section: sid, items: plan.items.filter((x) => !x.skip).length, voiced: plan.items.filter((x) => x.ok).length, billed_characters: chars });
  }
  const total = [...keys.values()].reduce((a, b) => a + b, 0);
  // PB2 measured ≈ 0.7 KB of MP3 per billed character at 0.8 speed (270k characters → 180–210 MB)
  return {
    schema: "linguistpro.atlas-tts-inventory.1", atlas_id: ATLAS_ID, profile_id: PROFILE_ID, profile: PROFILE,
    speech_contract: Speech.CONTRACT, lexicon_sha256: fileSha(path.join(ATLAS, "speech-lexicon.json")),
    lexicon_review: loadLexicon().review.status,
    blocks: { voiced: blocks[0], total: blocks[1] }, formulas: { voiced: formulas[0], total: formulas[1] },
    not_shown_or_nothing_to_read: skipped, not_voiced_reasons: reasons,
    unique_recordings: keys.size, billed_characters: total, character_ceiling: CHARACTER_CEILING,
    estimated_usd_standard: Math.round(total / 1e6 * 4 * 100) / 100,
    estimated_megabytes: Math.round(total * 0.72 / 1024),
    longest_input_bytes: longest, max_input_bytes: MAX_INPUT_BYTES,
    gate_cost: total <= CHARACTER_CEILING ? "PASS" : "BLOCKED",
    sections: perSection,
  };
}

// D4 review pack: 40 formulas of different shapes, one or two per section, and the dictionary in readable form.
function reviewPack({ data = DEFAULT_DATA } = {}) {
  const lexicon = loadLexicon(), overrides = loadOverrides();
  const picked = [];
  const shapes = [
    ["frac in frac / complex fraction", (l) => /\\frac\{[^}]*\\frac/.test(l) || /\\frac\{[^{}]*[+\-][^{}]*\}/.test(l)],
    ["root", (l) => /\\sqrt/.test(l)], ["cube root", (l) => /\\sqrt\[3\]/.test(l)], ["power", (l) => /\^\{?[2-9]/.test(l)],
    ["Hebrew index", (l) => /\\text\{[א-ת]/.test(l)], ["trigonometry", (l) => /\\(sin|cos|tan)/.test(l)],
    ["inverse function", (l) => /\^\{-1\}|Shift/.test(l)], ["inequality", (l) => /\\le|\\ge|</.test(l)],
    ["plus-minus", (l) => /\\pm/.test(l)], ["allowed value [x]", (l) => /\[\\[a-z]+_/.test(l)],
    ["units", (l) => /\\mathrm\{(mm|MPa|N|rpm|kW)/.test(l)], ["tolerance", (l) => /\d_\{-?\d|\^\{\+/.test(l)],
    ["sum", (l) => /\\Sigma|\\sum/.test(l)], ["degrees", (l) => /\\circ/.test(l)], ["any", () => true],
  ];
  const seenSections = {};
  for (const sid of sectionIds(data)) {
    const plan = sectionPlan(data, sid, lexicon, overrides);
    for (const it of plan.items) {
      if (it.kind !== "formula" || !it.ok) continue;
      if ((seenSections[sid] || 0) >= 2 || picked.length >= 40) break;
      const shape = shapes.find(([, test]) => test(it.latex || ""));
      if (!shape) continue;
      if (shape[0] === "any" && (seenSections[sid] || 0) >= 1) continue;
      if (picked.some((p) => p.shape === shape[0]) && shape[0] !== "any" && picked.filter((p) => p.shape === shape[0]).length >= 4) continue;
      picked.push({ id: it.id, section: sid, page: it.page, shape: shape[0], latex: it.latex, text: it.text });
      seenSections[sid] = (seenSections[sid] || 0) + 1;
    }
  }
  const lines = [
    "# Атлас 97002: проверка чтения формул на иврите (D4)", "",
    "Что проверить: 1) словарь — как голос называет буквы, греческие символы, знаки, функции, индексы и единицы;",
    "2) 40 формул разной сложности — так ли их прочитает преподаватель. Пометка «отклонено» по формуле попадает в",
    "`atlas/" + ATLAS_ID + "/speech-overrides.json` (исключить или задать точный текст); ошибка словаря исправляется в",
    "`atlas/" + ATLAS_ID + "/speech-lexicon.json` и сразу действует на всю книгу. Перевыпекаются только изменившиеся записи.", "",
    `Голос: ${PROFILE.voiceName}, скорость ${PROFILE.speakingRate}, высота +${PROFILE.pitch} (как Материаловедение).`, "",
    "## Словарь", "",
  ];
  const groups = [["latin", "Латинские буквы"], ["greek", "Греческие буквы"], ["words", "Знаки и служебные слова"],
    ["functions", "Функции"], ["subscripts", "Индексы-слова"], ["units", "Единицы"], ["acronyms", "Аббревиатуры"],
    ["english", "Английские слова"], ["hebrew", "Ивритские слова в формулах"]];
  for (const [key, title] of groups) {
    lines.push(`### ${title}`, "", "| запись | чтение |", "|---|---|");
    for (const [k, v] of Object.entries(lexicon[key] || {})) lines.push(`| \`${k}\` | ${v} |`);
    lines.push("");
  }
  lines.push("## 40 формул", "");
  picked.forEach((p, n) => {
    lines.push(`### ${n + 1}. стр. ${p.page} · ${p.section} · ${p.shape}`, "", "```tex", p.latex, "```", "", `> ${p.text}`, "",
      "Решение: ☐ верно ☐ исправить словарь ☐ отклонить формулу — замечание:", "");
  });
  return { markdown: lines.join("\n") + "\n", picked };
}

function validateRights() {
  const file = path.join(ATLAS, "rights", "tts-attestation.json");
  invariant(fs.existsSync(file), "TTS_RIGHTS_ATTESTATION_MISSING (D1)");
  const rights = readJson(file);
  invariant(rights.schema === "linguistpro.atlas-tts-rights.1" && rights.atlas_id === ATLAS_ID && rights.owner_attested === true
    && rights.public_audio === true && String(rights.asserted_at || "").trim() && String(rights.owner_words || "").trim(), "TTS_RIGHTS_ATTESTATION_INVALID");
  return { rights, sha: fileSha(file) };
}

function ttsClient() {
  try { require("dotenv").config({ path: path.join(ROOT, ".env") }); } catch (_) {}
  const pb2 = require("../premium/materials-pb2-tts.js");
  pb2.validateSecretGate({ apiKey: process.env.GCP_TTS_API_KEY, credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS });
  if (process.env.GCP_TTS_API_KEY) {
    const { synthesizeMp3 } = require("../premium/lib/ttsBake");
    return (text) => synthesizeMp3(process.env.GCP_TTS_API_KEY, text, PROFILE);
  }
  const { v1 } = require("@google-cloud/text-to-speech");
  const client = new v1.TextToSpeechClient();
  return async (text) => {
    const [response] = await client.synthesizeSpeech({
      input: { text }, voice: { languageCode: PROFILE.language, name: PROFILE.voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: PROFILE.speakingRate, pitch: PROFILE.pitch },
    });
    const mp3 = Buffer.from((response && response.audioContent) || []);
    invariant(mp3.length, "TTS_AUDIO_EMPTY");
    return mp3;
  };
}

function durationMs(file) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "--", file], { encoding: "utf8" });
  const seconds = Number(String(probe.stdout || "").trim());
  return probe.status === 0 && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
}

async function bake({ data = DEFAULT_DATA, sections, out = DEFAULT_OUT, concurrency = 2, synth } = {}) {
  invariant(sections, "BAKE_REQUIRES_SECTIONS");
  const { sha: rightsSha } = validateRights();
  const whole = inventory({ data });
  invariant(whole.gate_cost === "PASS", `CHARACTER_CEILING_EXCEEDED:${whole.billed_characters}`);
  invariant(whole.longest_input_bytes <= MAX_INPUT_BYTES, `INPUT_TOO_LONG:${whole.longest_input_bytes}`);
  const say = synth || ttsClient();
  const lexicon = loadLexicon(), overrides = loadOverrides();
  const audioDir = path.join(out, "audio-cache"), manifestDir = path.join(out, "audio");
  fs.mkdirSync(audioDir, { recursive: true }); fs.mkdirSync(manifestDir, { recursive: true });
  let calls = 0, reused = 0, characters = 0;
  const report = [];
  for (const sid of sectionIds(data, sections)) {
    const plan = sectionPlan(data, sid, lexicon, overrides);
    const jobs = plan.items.filter((x) => x.ok).map((x) => ({ ...x, key: assetKeyFor(x.kind, x.text) }));
    let cursor = 0, failure = null;
    const unique = [...new Map(jobs.map((j) => [j.key, j])).values()];
    async function worker() {
      while (!failure && cursor < unique.length) {
        const job = unique[cursor++];
        const file = path.join(audioDir, job.key + ".mp3");
        if (fs.existsSync(file) && fs.statSync(file).size > 0) { reused++; continue; }
        for (let attempt = 0; ; attempt++) {
          try {
            const mp3 = await say(job.text);
            invariant(mp3 && mp3.length, "TTS_AUDIO_EMPTY");
            fs.writeFileSync(file + ".part", mp3); fs.renameSync(file + ".part", file);
            calls++; characters += job.text.length;
            break;
          } catch (error) {
            const retry = [8, 14, 429, 503].includes(Number(error.code || error.status)) || /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|ECONNRESET|ETIMEDOUT/i.test(String(error.message));
            if (!retry || attempt >= 5) { failure = error; return; }
            await new Promise((r) => setTimeout(r, [2000, 5000, 10000, 20000, 30000][attempt]));
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(2, Number(concurrency) || 1)) }, worker));
    if (failure) throw failure;
    const items = {}, skipped = {};
    let blocks = [0, 0], formulas = [0, 0];
    for (const it of plan.items) {
      if (it.skip) continue;
      const count = it.kind === "formula" ? formulas : blocks;
      count[1]++;
      if (!it.ok) { skipped[it.id] = it.reason; continue; }
      count[0]++;
      const key = assetKeyFor(it.kind, it.text), file = path.join(audioDir, key + ".mp3");
      const bytes = fs.readFileSync(file);
      items[it.id] = { key, src: it.src, bytes: bytes.length, audio_sha256: sha256(bytes), ms: durationMs(file), text_sha256: sha256(Buffer.from(it.text, "utf8")) };
    }
    const manifest = {
      schema: SCHEMA, atlas_id: ATLAS_ID, section: sid, section_sha256: plan.section_sha256,
      speech_contract: Speech.CONTRACT, lexicon_sha256: fileSha(path.join(ATLAS, "speech-lexicon.json")),
      overrides_sha256: fileSha(path.join(ATLAS, "speech-overrides.json")), rights_sha256: rightsSha,
      language: "he", profile: { id: PROFILE_ID, ...PROFILE },
      coverage: { blocks, formulas }, items, not_voiced: skipped,
    };
    fs.writeFileSync(path.join(manifestDir, sid + ".json"), stable(manifest));
    report.push({ section: sid, blocks, formulas, recordings: Object.keys(items).length });
  }
  return { out, provider_calls: calls, reused, billed_characters: characters, sections: report };
}

function verify({ out = DEFAULT_OUT, data = DEFAULT_DATA } = {}) {
  const manifestDir = path.join(out, "audio"), audioDir = path.join(out, "audio-cache");
  invariant(fs.existsSync(manifestDir), "BAKE_OUTPUT_MISSING");
  const result = { sections: 0, recordings: 0, audio_bytes: 0, missing: [], mismatched: [], stale_source: [], undecodable: [] };
  const counted = new Set();
  for (const name of fs.readdirSync(manifestDir).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    const m = readJson(path.join(manifestDir, name));
    invariant(m.schema === SCHEMA && m.atlas_id === ATLAS_ID, `MANIFEST_INVALID:${name}`);
    const sectionFile = path.join(data, "sections", m.section + ".json");
    if (fileSha(sectionFile) !== m.section_sha256) result.stale_source.push(m.section);
    result.sections++;
    for (const [id, entry] of Object.entries(m.items)) {
      result.recordings++;
      const file = path.join(audioDir, entry.key + ".mp3");
      if (!fs.existsSync(file)) { result.missing.push(id); continue; }
      const bytes = fs.readFileSync(file);
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.audio_sha256) { result.mismatched.push(id); continue; }
      if (!counted.has(entry.key)) { counted.add(entry.key); result.audio_bytes += bytes.length; if (!entry.ms) result.undecodable.push(id); }
    }
  }
  result.unique_files = counted.size;
  result.ok = !result.missing.length && !result.mismatched.length && !result.stale_source.length && !result.undecodable.length;
  return result;
}

// index.json gets { audio: { <sid>: <manifest sha256> } } so the reader asks only for sections that have recordings
function indexWithAudio({ out = DEFAULT_OUT, index }) {
  const book = readJson(index), audio = {};
  const manifestDir = path.join(out, "audio");
  for (const name of fs.readdirSync(manifestDir).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
    audio[name.slice(0, -5)] = sha256(fs.readFileSync(path.join(manifestDir, name)));
  }
  return { ...book, audio };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) { out._.push(argv[i]); continue; }
    out[argv[i].slice(2)] = argv[i + 1]; i++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2)), command = args._[0] || "inventory";
  if (args.atlas) selectAtlas(args.atlas);
  const data = args.data ? path.resolve(args.data) : DEFAULT_DATA, out = args.out ? path.resolve(args.out) : DEFAULT_OUT;
  const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  if (command === "inventory") {
    const report = inventory({ data, sections: args.sections });
    if (args.report) write(path.resolve(args.report), stable(report));
    const { sections, ...head } = report;
    process.stdout.write(stable(args.report ? head : report));
    if (report.gate_cost !== "PASS") process.exitCode = 2;
    return;
  }
  if (command === "review-pack") {
    invariant(args.out, "REVIEW_PACK_REQUIRES_OUT");
    const pack = reviewPack({ data });
    write(path.resolve(args.out), pack.markdown);
    process.stdout.write(stable({ ok: true, out: path.resolve(args.out), formulas: pack.picked.length }));
    return;
  }
  if (command === "bake") {
    const result = await bake({ data, sections: args.sections, out, concurrency: args.concurrency });
    process.stdout.write(stable({ ok: true, ...result }));
    return;
  }
  if (command === "verify") {
    const result = verify({ out, data });
    process.stdout.write(stable(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "index") {
    invariant(args.index && args.write, "INDEX_REQUIRES_INDEX_AND_WRITE");
    write(path.resolve(args.write), JSON.stringify(indexWithAudio({ out, index: path.resolve(args.index) })));
    process.stdout.write(stable({ ok: true, write: path.resolve(args.write) }));
    return;
  }
  throw new Error(`COMMAND_INVALID:${command}`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`atlas-tts: ${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = { selectAtlas, PROFILE, PROFILE_ID, CHARACTER_CEILING, SCHEMA, sectionPlan, inventory, reviewPack, bake, verify, indexWithAudio, assetKeyFor, validateRights };
