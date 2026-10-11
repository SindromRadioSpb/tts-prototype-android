"use strict";
// Word layer Ф3 (docs/planning/word-layer/F3_SPEC_2026_10_11.md): contextual Russian gloss of every
// word of a study-table row by Gemini. Pure core — prompt, response schema, strict validation — shared
// by the /api/word-gloss-ctx route and the measurement script, so what is measured is what ships.
//
// The offline reading (resolver + Pealim + Russian forms) is sent as a HINT and a constraint, never as
// truth: the model must translate the form that is actually written, in this sentence, and say when the
// hint is wrong. A response that does not answer every token of every row is rejected (no silent mixing).

const WG_CTX_PROMPT_ID = "word-gloss-ctx-v1";
const WG_CTX_SCHEMA_ID = "word-gloss-ctx-schema-v1";
// 20 rows ≈ 50 s on 3.8-flash (thinking) — too close to proxy timeouts; the client sends ≤12 rows
// per request and runs a few requests in parallel.
const MAX_ROWS = 12;
const MAX_WORDS_PER_ROW = 80;
const MAX_GLOSS_CHARS = 60;

// rows: [{ i:int, he:string (vocalized row), ru:string (row translation), words:[{ w:string, hint:string }] }]
function validateInput(rows) {
  if (!Array.isArray(rows) || !rows.length) return { ok: false, status: 400, error_code: "WG_ROWS_REQUIRED" };
  if (rows.length > MAX_ROWS) return { ok: false, status: 413, error_code: "WG_TOO_MANY_ROWS" };
  for (const r of rows) {
    if (!r || !Number.isInteger(r.i) || typeof r.he !== "string" || !Array.isArray(r.words) || !r.words.length ||
      r.words.length > MAX_WORDS_PER_ROW || r.words.some((x) => !x || typeof x.w !== "string" || !x.w.trim())) {
      return { ok: false, status: 400, error_code: "WG_BAD_ROW" };
    }
  }
  return { ok: true };
}

// Cache identity: the row text, its translation and its tokens — NOT the offline hints. Hints improve
// with every resolver release; keying on them would make a learner pay again for the same sentence.
function cacheKeyInput(rows) {
  return JSON.stringify(rows.map((r) => [r.he, r.ru || "", r.words.map((x) => x.w)]));
}
// One row's own cache identity (the route caches per row, so overlapping batches never re-pay).
function rowCacheKeyInput(r) { return cacheKeyInput([r]); }

function buildPrompt(rows) {
  const lines = [
    "You are a Hebrew→Russian lexicographer writing an interlinear gloss for a beginner who reads and listens.",
    "For EVERY numbered token of every row give the Russian translation of THAT written form in THAT sentence:",
    "- translate the form, not the dictionary word: person, number, gender, tense, possessive suffix (שֶׁשָּׁמַעְתִּי → «что я слышал»,",
    "  מֵאִשְׁתִּי → «от моей жены», כָּתְבָה → «написала»); choose the Russian aspect the sentence needs;",
    "- include the proclitic meaning (ו «и», ש «что/который», כש «когда», ב «в», ל «к/для», מ «из/от», ה the article — no word);",
    "- 1–5 Russian words, no explanations, no Hebrew, no transliteration;",
    "- a personal or place name: «имя: <Russian transcription>»; a number: the number in words or digits;",
    "- a token that is part of a fixed multi-word expression (מוֹצָאֵי שַׁבָּת, בְּנֵי אָדָם, אִי אֶפְשָׁר, בְּדֶרֶךְ כְּלָל) still gets its",
    "  own gloss, and the expression is listed once in mwe with its natural Russian translation;",
    "- the 'hint' is an automatic dictionary reading; use it when it fits the sentence; if it is wrong here",
    "  (wrong homograph or sense), ignore it and set wrong_hint=true for that token;",
    "- if the Hebrew row itself looks garbled (speech-recognition error) and a token cannot be read, gloss \"?\".",
    "The Russian row translation is context only — do not copy its word order into token glosses.",
    "",
    "Rows (JSON):",
    JSON.stringify(rows.map((r) => ({
      i: r.i, he: r.he, ru: r.ru || "",
      tokens: r.words.map((x, k) => ({ k, w: x.w, hint: x.hint || "" })),
    }))),
  ];
  return lines.join("\n");
}

function buildResponseSchema(T) {
  if (!T) throw new Error("SchemaType required");
  return {
    type: T.OBJECT,
    properties: {
      rows: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: {
            i: { type: T.INTEGER },
            tokens: {
              type: T.ARRAY,
              items: {
                type: T.OBJECT,
                properties: {
                  k: { type: T.INTEGER },
                  gloss: { type: T.STRING },
                  wrong_hint: { type: T.BOOLEAN },
                },
                required: ["k", "gloss"],
              },
            },
            mwe: {
              type: T.ARRAY,
              items: {
                type: T.OBJECT,
                properties: { from: { type: T.INTEGER }, to: { type: T.INTEGER }, gloss: { type: T.STRING } },
                required: ["from", "to", "gloss"],
              },
            },
          },
          required: ["i", "tokens"],
        },
      },
    },
    required: ["rows"],
  };
}

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, MAX_GLOSS_CHARS);
const HEBREW_RE = /[֐-׿]/;

// → { ok, rows:[{ i, glosses:[{ gloss, wrong_hint }], mwe:[{from,to,gloss}] }], rejected:[{i, reason}] }
// A row is accepted only when every token index 0..n-1 has a non-empty, Hebrew-free gloss.
function validateOutput(inputRows, out) {
  const byI = new Map(((out && out.rows) || []).filter((r) => r && Number.isInteger(r.i)).map((r) => [r.i, r]));
  const rows = [], rejected = [];
  for (const r of inputRows) {
    const o = byI.get(r.i);
    if (!o || !Array.isArray(o.tokens)) { rejected.push({ i: r.i, reason: "row-missing" }); continue; }
    const glosses = new Array(r.words.length).fill(null);
    let bad = "";
    for (const t of o.tokens) {
      if (!t || !Number.isInteger(t.k) || t.k < 0 || t.k >= r.words.length) { bad = "token-index"; break; }
      const g = clean(t.gloss);
      if (!g || HEBREW_RE.test(g)) { bad = "token-gloss"; break; }
      glosses[t.k] = { gloss: g, wrong_hint: !!t.wrong_hint };
    }
    if (!bad && glosses.some((x) => !x)) bad = "token-missing";
    if (bad) { rejected.push({ i: r.i, reason: bad }); continue; }
    const mwe = (Array.isArray(o.mwe) ? o.mwe : []).filter((m) => m && Number.isInteger(m.from) && Number.isInteger(m.to) &&
      m.from >= 0 && m.to > m.from && m.to < r.words.length && clean(m.gloss) && !HEBREW_RE.test(m.gloss))
      .map((m) => ({ from: m.from, to: m.to, gloss: clean(m.gloss) }));
    rows.push({ i: r.i, glosses, mwe });
  }
  return { ok: rejected.length === 0, rows, rejected };
}

function parseModelJson(text) {
  const s = String(text || "").replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(s);
}

module.exports = {
  WG_CTX_PROMPT_ID, WG_CTX_SCHEMA_ID, MAX_ROWS, MAX_WORDS_PER_ROW,
  validateInput, cacheKeyInput, rowCacheKeyInput, buildPrompt, buildResponseSchema, validateOutput, parseModelJson,
};
