"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SLUG = "materials-science-year1-problem-book-2";
const BIDI_AND_ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

const LATIN_LETTERS = Object.freeze({
  A: "אֵיי", B: "בִּי", C: "סִי", D: "דִּי", E: "אִי", F: "אֶף", G: "גִּ'י", H: "אֵייץ'",
  I: "אַיי", J: "גֵּ'יי", K: "קֵיי", L: "אֶל", M: "אֶם", N: "אֶן", O: "אוֹ", P: "פִּי",
  Q: "קְיוּ", R: "אָר", S: "אֶס", T: "טִי", U: "יוּ", V: "וִי", W: "דַּבְּלְיוּ",
  X: "אֶקְס", Y: "וַאי", Z: "זֶד",
});

const GREEK = Object.freeze({
  "Δ": "דֶּלְטָה", "Σ": "סִיגְמָה", "α": "אַלְפָא", "β": "בֵּיתָא", "γ": "גַּמָּה",
  "δ": "דֶּלְטָה", "ε": "אֶפְּסִילוֹן", "μ": "מְיוּ", "ν": "נוּ", "π": "פַּאי",
  "ρ": "רוֹ", "σ": "סִיגְמָה",
});

const UNITS = Object.freeze({
  MPa: "מֶגָה־פַּסְקָל", GPa: "גִּיגָה־פַּסְקָל", Pa: "פַּסְקָל", kN: "קִילוֹ־נְיוּטוֹן",
  daN: "דֶּקָה־נְיוּטוֹן", mm: "מִילִימֶטֶר", cm: "סֶנְטִימֶטֶר", MJ: "מֶגָה־ג'וּל",
  Joul: "ג'וּל", Volt: "ווֹלְט", Å: "אַנְגְּסְטְרֶם", K: "קֶלְוִין",
});

const ACRONYMS = Object.freeze({
  BCC: "בִּי־סִי־סִי", FCC: "אֶף־סִי־סִי", BCT: "בִּי־סִי־טִי", SAE: "אֶס־אֵיי־אִי",
  ASTM: "אֵיי־אֶס־טִי־אֶם", UTS: "יוּ־טִי־אֶס", HRC: "אֵייץ'־אָר־סִי", HRc: "אֵייץ'־אָר־סִי",
  HRB: "אֵייץ'־אָר־בִּי", HRb: "אֵייץ'־אָר־בִּי", HB: "אֵייץ'־בִּי", HBN: "אֵייץ'־בִּי־אֶן",
  BHN: "בִּי־אֵייץ'־אֶן", HV: "אֵייץ'־וִי", TTT: "טִי־טִי־טִי", CCT: "סִי־סִי־טִי",
  HAZ: "אֵייץ'־אֵיי־זֶד", DBTT: "דִּי־בִּי־טִי־טִי", SCC: "אֶס־סִי־סִי",
  CVD: "סִי־וִי־דִּי", PVD: "פִּי־וִי־דִּי", EBM: "אִי־בִּי־אֶם", ICCP: "אַיי־סִי־סִי־פִּי",
  CIP: "סִי־אַיי־פִּי", HIP: "אֵייץ'־אַיי־פִּי", HDPE: "אֵייץ'־דִּי־פִּי־אִי",
  PET: "פִּי־אִי־טִי", PVC: "פִּי־וִי־סִי", POM: "פִּי־אוֹ־אֶם", PE: "פִּי־אִי",
});

const ELEMENTS = Object.freeze({
  Al: "אַלְמִינְיוּם", Fe: "בַּרְזֶל", O: "חַמְצָן", Mg: "מַגְנֶזְיוּם", Cu: "נְחֹשֶׁת",
  Cr: "כְּרוֹם", Mn: "מַנְגָּן", Mo: "מוֹלִיבְּדֶן", Ni: "נִיקֶל", Si: "צוֹרָן", Zn: "אָבָץ",
  Be: "בֶּרִילְיוּם", Li: "לִיתְיוּם", Cl: "כְּלוֹר", Co: "קוֹבַּלְט", Se: "סֶלֶנְיוּם",
  Ti: "טִיטַנְיוּם", Ta: "טַנְטָלוּם", C: "פַּחְמָן",
});

const TECHNICAL_WORDS = Object.freeze({
  max: "מַקְסִימוּם", min: "מִינִימוּם", mid: "אֶמְצָעִי", low: "נָמוּךְ", high: "גָּבוֹהַּ",
  local: "מְקוֹמִי", nom: "נוֹמִינָלִי", req: "נִדְרָשׁ", work: "עֲבוֹדָה", allow: "מֻתָּר",
  fiber: "סִיב", comp: "קוֹמְפּוֹזִיט", matrix: "מַטְרִיצָה", cell: "תָּא", brake: "בְּלִימָה",
  peak: "שִׂיא", to: "עַד", aust: "אוֹסְטֶנִיטִיזַצְיָה", temp: "הַרְפָּיָה",
  sigma: "סִיגְמָה", varepsilon: "אֶפְּסִילוֹן", approx: "בְּקֵרוּב", Delta: "דֶּלְטָה",
  alpha: "אַלְפָא", beta: "בֵּיתָא", gamma: "גַּמָּה", pi: "פַּאי",
  Young: "יַאנְג", Goodman: "גוּדְמַן", Jominy: "ג'וֹמִינִי", Luders: "לוּדֶרְס",
  Charpy: "שַׁרְפִּי", Brale: "בְּרֵייל", Petch: "פֶּץ'", Hall: "הוֹל",
  Duplex: "דּוּפְּלֶקְס", Brass: "פְּלִיז", BRASS: "פְּלִיז", Red: "רֶד", RED: "רֶד",
  Quenching: "קְוֶונְצִ'ינְג", Temper: "טֶמְפֶּר", Annealing: "אַנִילִינְג", Aging: "אֵייגִ'ינְג",
  Extrusion: "אֶקְסְטְרוּזְיָה", Injection: "אִינְגֶ'קְשֶׁן", Molding: "מוֹלְדִינְג",
  molding: "מוֹלְדִינְג", Thermoforming: "תֶרְמוֹפוֹרְמִינְג", Stretch: "סְטְרֶץ'",
  Blow: "בְּלוֹאוּ", Insert: "אִינְסֶרְט", Shelf: "שֶׁלְף", Cellulosics: "צֶלוּלוֹזִיקְס",
  Modulus: "מוֹדוּלוּס", Stress: "סְטְרֶס", Strain: "סְטְרֵיין", Fracture: "פְרַקְצֶ'ר",
  Working: "ווֹרְקִינְג", Hardening: "הַרְדֶנִינְג", Lower: "לוֹוֶר", Upper: "אַפֶּר",
  Over: "אוֹבֶר", Good: "גוּד", failure: "פֵיילְיוּר", fatigue: "פָטִיג",
});

const OPERATORS = Object.freeze({
  "=": "שָׁוֶה", "≈": "בְּקֵרוּב שָׁוֶה", "≠": "אֵינוֹ שָׁוֶה", ">": "גָּדוֹל מִן",
  "<": "קָטָן מִן", "≥": "גָּדוֹל אוֹ שָׁוֶה לְ־", "≤": "קָטָן אוֹ שָׁוֶה לְ־",
  "≫": "גָּדוֹל בְּהַרְבֵּה מִן", "+": "וְעוֹד", "−": "פָּחוֹת", "·": "כָּפוּל",
  "×": "כָּפוּל", "*": "כָּפוּל", "/": "חֶלְקֵי", "→": "נוֹתֵן", "←": "מִתְקַבֵּל מִן",
  "⇒": "מִכָּאן", "↑": "עוֹלֶה", "↓": "יוֹרֵד", "%": "אָחוּז", "∫": "אִינְטֶגְרָל שֶׁל",
  "√": "שֹׁרֶשׁ רִבּוּעִי שֶׁל", "∥": "מַקְבִּיל לְ־", "⊥": "מְאוּנָךְ לְ־",
});

const SUBSCRIPT = Object.freeze({ "₀": "0", "₂": "2", "₃": "3", "₆": "6", "ₐ": "a", "ₑ": "e" });

function invariant(value, message) { if (!value) throw new Error(message); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function normalizeSpeech(value) { return String(value == null ? "" : value).normalize("NFC").replace(/\s+/g, " ").trim(); }
function unvocalized(value) { return normalizeSpeech(value).replace(/[\u0591-\u05C7]/g, ""); }

function normalizeNotation(value) {
  let text = normalizeSpeech(value).replace(BIDI_AND_ZERO_WIDTH, "");
  text = text.replace(/_{2,}/g, " ");
  text = text.replace(/וְ\s*\/\s*אוֹ/g, "וְאוֹ");
  const texGroup = "((?:[^{}]|\\{[^{}]*\\})+)";
  text = text.replace(new RegExp("\\\\(?:dfrac|frac)\\s*\\{" + texGroup + "\\}\\s*\\{" + texGroup + "\\}", "g"), "($1)/($2)");
  text = text.replace(new RegExp("\\\\tfrac\\s*\\{" + texGroup + "\\}\\s*\\{" + texGroup + "\\}", "g"), "($1)/($2)");
  text = text.replace(/\\tfrac\s*([0-9])\s*([0-9])/g, "($1)/($2)");
  text = text.replace(/\\text\s*\{([^{}]*)\}/g, "$1").replace(/\{,\}/g, ",");
  const latex = { "\\pi": "π", "\\sigma": "σ", "\\varepsilon": "ε", "\\epsilon": "ε",
    "\\Delta": "Δ", "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\rho": "ρ",
    "\\mu": "μ", "\\nu": "ν", "\\approx": "≈", "\\ge": "≥", "\\le": "≤",
    "\\times": "×", "\\cdot": "·", "\\int": "∫" };
  for (const [source, replacement] of Object.entries(latex)) text = text.replaceAll(source, replacement);
  const leftoverCommand = text.match(/\\[A-Za-z]+/);
  invariant(!leftoverCommand, `FORMULA_SPEECH_UNKNOWN_TOKEN:${leftoverCommand && leftoverCommand[0]}`);
  text = text.replace(/[{}]/g, "").replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁻/g, "^-");
  text = text.replace(/₍/g, "(").replace(/₎/g, ")");
  text = text.replace(/[₀₂₃₆ₐₑ]+/g, run => `_${[...run].map(char => SUBSCRIPT[char]).join("")}`);
  text = text.replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, " ");
  text = text.replace(/(?<=[א-ת\u0591-\u05C7])-(?=\d)/gu, " ");
  return text;
}

function spellLatin(token) {
  if (UNITS[token]) return UNITS[token];
  if (ACRONYMS[token]) return ACRONYMS[token];
  if (ELEMENTS[token]) return ELEMENTS[token];
  if (TECHNICAL_WORDS[token]) return TECHNICAL_WORDS[token];
  const suffix = token.match(/^([A-Z])(?:_)?(max|min|mid|low|high|local|nom|req|work|allow|fiber|comp|matrix|cell|brake|peak|aust|temp|uts)$/);
  if (suffix && TECHNICAL_WORDS[suffix[2]]) return `${LATIN_LETTERS[suffix[1]]} ${TECHNICAL_WORDS[suffix[2]]}`;
  const letters = [...token].filter(char => /[A-Za-z]/.test(char)).map(char => LATIN_LETTERS[char.toUpperCase()]);
  invariant(letters.length === token.length && letters.every(Boolean), `FORMULA_SPEECH_UNKNOWN_TOKEN:${token}`);
  return letters.join(" ");
}

function compileSpeech(displayText) {
  const source = normalizeSpeech(displayText);
  invariant(source, "FORMULA_SPEECH_EMPTY");
  const normalized = normalizeNotation(source);
  const tokenPattern = /°C|[A-Za-z]+|[ΔΣαβγδεμνπρσ]|[א-ת\u0591-\u05C7]+|\d+(?:[.,]\d+)*|[=≈≠<>≥≤≫+−\-–—·×*\/%∫√↑↓←→⇒∥⊥|^_()[\],.:;!?׳״'“”]|Å|Ø|\S/gu;
  const coordinate = normalized.match(/^\(\s*(\d+(?:[.,]\d+)*)\s*,\s*(\d+(?:[.,]\d+)*)\s*\)$/);
  if (coordinate) return Object.freeze({ spoken_he_niqqud: `נְקֻדָּה ${coordinate[1]}, ${coordinate[2]}`,
    status: "SYSTEM_COMPILED_PASS", compiler_id: "materials-formula-speech-he-v1",
    source_sha256: sha256(Buffer.from(source, "utf8")) });
  const tokens = normalized.match(tokenPattern) || [];
  const spoken = [];
  let transformed = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (/^[א-ת\u0591-\u05C7]+$/u.test(token) || /^\d/.test(token)) { spoken.push(token); continue; }
    if (token === "°C") { spoken.push("מַעֲלוֹת צֶלְזִיּוּס"); transformed = true; continue; }
    if (token === "°") { spoken.push("מַעֲלוֹת"); transformed = true; continue; }
    if (UNITS[token] || ACRONYMS[token] || ELEMENTS[token] || TECHNICAL_WORDS[token] || /^[A-Za-z]+$/.test(token)) {
      const element = ELEMENTS[token];
      if (element && spoken.length && unvocalized(spoken[spoken.length - 1]) === unvocalized(element)) { transformed = true; continue; }
      if (token === "N" && (/^\d/.test(previous || "") || previous === "(" && next === ")")) spoken.push("נְיוּטוֹן");
      else if (token === "g" && /^\d/.test(previous || "")) spoken.push("גְּרָם");
      else spoken.push(spellLatin(token));
      transformed = true; continue;
    }
    if (GREEK[token]) { spoken.push(GREEK[token]); transformed = true; continue; }
    if (OPERATORS[token]) { spoken.push(OPERATORS[token]); transformed = true; continue; }
    if (token === "^") {
      if (next === "2") { spoken.push("בָּרִבּוּעַ"); index += 1; }
      else if (next === "3") { spoken.push("בַּחֲזָקָה 3"); index += 1; }
      else if (next === "-") { spoken.push("בַּחֲזָקָה מִינוּס"); index += 1; }
      else spoken.push("בַּחֲזָקָה");
      transformed = true; continue;
    }
    if (token === "_") { spoken.push("תַּת"); transformed = true; continue; }
    if (token === "–" || token === "—") {
      spoken.push(/^\d/.test(previous || "") && /^\d/.test(next || "") ? "עַד" : "פָּחוֹת");
      transformed = true; continue;
    }
    if (token === "-") {
      if (/^[א-ת\u0591-\u05C7]+$/u.test(next || "") || /^\d/.test(previous || "") && /^[A-Za-z]+$/.test(next || "")
        || /^[A-Za-z]+$/.test(previous || "") && /^[A-Za-z]+$/.test(next || "")) continue;
      spoken.push(/^\d/.test(previous || "") && /^\d/.test(next || "") ? "עַד" : "מִינוּס");
      transformed = true; continue;
    }
    if (["(", ")", "[", "]"].includes(token)) { transformed = true; continue; }
    if (token === "|") { transformed = true; continue; }
    if ([".", ",", ":", ";", "!", "?", "׳", "״", "'", "\"", "“", "”"].includes(token)) { spoken.push(token); continue; }
    if (token === "Å") { spoken.push(UNITS.Å); transformed = true; continue; }
    if (token === "Ø") { spoken.push("קוֹטֶר"); transformed = true; continue; }
    invariant(false, `FORMULA_SPEECH_UNKNOWN_TOKEN:${token}`);
  }
  const output = normalizeSpeech(spoken.join(" ")
    .replace(/\s+([.,:;!?׳״'])/g, "$1")
    .replace(/([“])\s+/g, "$1")
    .replace(/\s+([”])/g, "$1"));
  invariant(output && /[א-ת]/.test(output), "FORMULA_SPEECH_NO_HEBREW_OUTPUT");
  return Object.freeze({
    spoken_he_niqqud: output,
    status: transformed ? "SYSTEM_COMPILED_PASS" : "DISPLAY_TEXT_PASS",
    compiler_id: "materials-formula-speech-he-v1",
    source_sha256: sha256(Buffer.from(source, "utf8")),
  });
}

function reviewedOverrides(ledger) {
  const overrides = new Map();
  if (!ledger) return overrides;
  invariant(ledger.schema_version === "materials_pb2_formula_speech_review.1.0.0" && ledger.corpus_slug === SLUG
    && Array.isArray(ledger.entries), "FORMULA_LEDGER_INVALID");
  for (const entry of ledger.entries) {
    if (entry.status !== "REVIEWED_PASS") continue;
    const speech = normalizeSpeech(entry.spoken_he_niqqud);
    invariant(entry.row_id && speech && String(entry.reviewed_by || "").trim() && String(entry.reviewed_at || "").trim(),
      `FORMULA_REVIEW_DECISION_INCOMPLETE:${entry.row_id || "missing"}`);
    invariant(!overrides.has(entry.row_id), `FORMULA_LEDGER_DUPLICATE:${entry.row_id}`);
    overrides.set(entry.row_id, speech);
  }
  return overrides;
}

function compileRowSpeech({ rowId, displayText, reviewed } = {}) {
  const override = reviewed && reviewed.get(rowId);
  if (override) return Object.freeze({ spoken_he_niqqud: override, status: "OWNER_REVIEWED_OVERRIDE",
    compiler_id: "owner-reviewed-exact-row-v1", source_sha256: sha256(Buffer.from(normalizeSpeech(displayText), "utf8")) });
  return compileSpeech(displayText);
}

function auditCorpus({ tableRoot, formulaLedger } = {}) {
  invariant(tableRoot, "FORMULA_AUDIT_TABLE_ROOT_REQUIRED");
  const manifestBytes = fs.readFileSync(path.join(tableRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  invariant(manifest.schema_version === "materials_pb2_student_solution_manifest.1.0.0" && manifest.corpus_slug === SLUG,
    "TABLE_MANIFEST_INVALID");
  const manifestSha = sha256(manifestBytes);
  invariant(!formulaLedger || formulaLedger.source_manifest_sha256 === manifestSha, "FORMULA_LEDGER_SOURCE_DRIFT");
  const reviewed = reviewedOverrides(formulaLedger);
  const rows = [];
  const unresolved = [];
  for (const entry of manifest.tasks) {
    const table = JSON.parse(fs.readFileSync(path.join(tableRoot, entry.file), "utf8"));
    const sources = [
      ...table.condition.rows.map(row => ({ row_id: row.row_id, source_kind: "condition", display: row.hebrew_niqqud || row.hebrew_plain })),
      ...table.rows.map(row => ({ row_id: row.row_id, source_kind: "solution", display: row.text.he_niqqud || row.text.he })),
    ];
    for (const source of sources) {
      try {
        const result = compileRowSpeech({ rowId: source.row_id, displayText: source.display, reviewed });
        rows.push({ task_id: table.task_id, row_id: source.row_id, source_kind: source.source_kind,
          display_he_niqqud: normalizeSpeech(source.display), ...result });
      } catch (error) {
        unresolved.push({ task_id: table.task_id, row_id: source.row_id, error: error.message });
      }
    }
  }
  return Object.freeze({
    schema_version: "materials_pb2_formula_speech_audit.1.0.0", corpus_slug: SLUG,
    compiler_id: "materials-formula-speech-he-v1", source_manifest_sha256: manifestSha,
    row_count: rows.length + unresolved.length, compiled_row_count: rows.filter(row => row.status === "SYSTEM_COMPILED_PASS").length,
    display_text_pass_count: rows.filter(row => row.status === "DISPLAY_TEXT_PASS").length,
    owner_override_count: rows.filter(row => row.status === "OWNER_REVIEWED_OVERRIDE").length,
    unresolved_count: unresolved.length, ready: unresolved.length === 0, unresolved, rows,
  });
}

module.exports = { normalizeSpeech, normalizeNotation, compileSpeech, reviewedOverrides, compileRowSpeech, auditCorpus };
