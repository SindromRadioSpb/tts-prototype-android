"use strict";

// O-033, owner decision 2026-09-29 (variant A): the Gemini table path asks Dicta about the words
// Gemini pointed impossibly, through the same channel as the existing Dicta fallback for rows
// Gemini could not vocalize (owner, 2026-09-24). Same rules and merge as the subtitle path: only
// suspect words change, only to Dicta's word with the source's letters that passes the rules.
// Optional by construction: Dicta down or a line-count mismatch leaves the rows as they were.
const Plausibility = require("../public/js/niqqud-plausibility.js");
const SecondOpinion = require("../public/js/subtitle-material-vocalization.js");

const CHUNK_LINES = 40;

async function secondOpinionForTableRows(rows, { vocalize } = {}) {
  const suspects = Plausibility.scanRows(rows);
  const words = suspects.reduce((sum, s) => sum + s.words.length, 0);
  if (!words) return { rows, stats: null };
  if (typeof vocalize !== "function") return { rows, stats: { suspects: words, error: "NAKDAN_UNAVAILABLE" } };
  const lines = SecondOpinion.secondOpinionLines(rows, suspects);
  const answers = [];
  try {
    for (let start = 0; start < lines.length; start += CHUNK_LINES) {
      const chunk = lines.slice(start, start + CHUNK_LINES);
      const out = await vocalize(chunk.join("\n"));
      const answer = String(out && out.niqqud || "").split("\n");
      if (answer.length !== chunk.length) throw Object.assign(new Error("NAKDAN_LINE_MISMATCH"), { code: "NAKDAN_LINE_MISMATCH" });
      answers.push(...answer);
    }
  } catch (error) {
    return { rows, stats: { suspects: words, error: String(error && (error.code || error.message) || "NAKDAN_UNAVAILABLE") } };
  }
  const merged = SecondOpinion.applySecondOpinion(rows, suspects, answers, { wordFaults: Plausibility.wordFaults });
  return {
    rows: merged.rows,
    stats: {
      suspects: words,
      replaced: merged.replaced.length,
      confirmed: merged.confirmed.length,
      kept: merged.kept.length,
      // Exact agreement is an independent confirmation; the Studio stops marking these words.
      confirmedWords: merged.confirmed.map((e) => e.word),
    },
  };
}

module.exports = { secondOpinionForTableRows };
