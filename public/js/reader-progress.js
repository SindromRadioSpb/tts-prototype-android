// reader-progress.js — BRR-P2-002 «Продолжить чтение» (Continue Reading).
//
// PURE, side-effect-free helpers for the Reading-Room resume feature. No DOM, no
// DB — so they are loaded BOTH as a classic <script> (window.ReaderProgress, used
// by library-ui.js) AND require()'d by the Node gate scripts/premium/reader-resume-smoke.js
// (UMD dual-export, same pattern as reader-morph.js / corpus-vocab.js).
//
// The honesty invariant (R4 reliability — beat Apple Books' wrong "last page"):
//   • resume ONLY to a real, in-range position (0 / start / out-of-range → no resume),
//   • the caller offers a NON-jumping affordance for normal opens; a direct jump only
//     when the user explicitly taps a «Продолжить» card.
(function () {
  'use strict';

  // resumeTarget(progress, rowCount) → 0-based row index to resume to, or null.
  //   progress: { last_row_idx } (from text_progress) or null.
  //   rowCount: number of rendered rows in the freshly-opened text.
  // Degrades to null (no resume) for: no progress, start-of-text (idx<=0), invalid
  // counts, and — critically — an out-of-range index (a re-imported/edited text whose
  // row count shrank). Never scroll to a row that does not exist.
  function resumeTarget(progress, rowCount) {
    if (!progress) return null;
    var idx = Number(progress.last_row_idx);
    if (!isFinite(idx) || Math.floor(idx) !== idx || idx <= 0) return null;
    var n = Number(rowCount);
    if (!isFinite(n) || n <= 0) return null;
    if (idx >= n) return null;            // out of range → honest no-resume
    return idx;
  }

  // continuePercent(lastIdx, nRows) → integer 0..100 for the "% прочитано" chip.
  // Rows seen ≈ lastIdx+1 (lastIdx is the 0-based current/topmost row), so a 1-row
  // text on row 0 reads 100%. Clamped; defensive on bad input.
  function continuePercent(lastIdx, nRows) {
    var i = Number(lastIdx), n = Number(nRows);
    if (!isFinite(i) || i < 0 || !isFinite(n) || n <= 0) return 0;
    var p = Math.round(((i + 1) / n) * 100);
    return p < 0 ? 0 : (p > 100 ? 100 : p);
  }

  // topVisibleRowIdx(rows, topOffset) → idx of the topmost row still at/under the
  // sticky reader-bar (the row the user is reading), or null when there are no rows.
  //   rows: [{ idx, top, bottom }] in DOM order, in viewport coordinates.
  //   topOffset: y (px) of the sticky bar's bottom edge.
  // Returns the first row whose bottom edge is below the bar; if every row has been
  // scrolled above the bar, returns the last row's idx (you're at the end).
  function topVisibleRowIdx(rows, topOffset) {
    if (!rows || !rows.length) return null;
    var off = Number(topOffset) || 0;
    for (var k = 0; k < rows.length; k++) {
      if (Number(rows[k].bottom) > off) return rows[k].idx;
    }
    return rows[rows.length - 1].idx;
  }

  var API = { resumeTarget: resumeTarget, continuePercent: continuePercent, topVisibleRowIdx: topVisibleRowIdx };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.ReaderProgress = API;
})();
