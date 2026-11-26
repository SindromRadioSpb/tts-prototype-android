'use strict';
// The outlet probe (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §5.2): before an outlet may be
// switched into the slice, the harvester reads up to 20 free articles from its feeds, across rubrics, and counts
// what a reader would get. Paywalled articles are skipped one by one and counted apart; a challenge stops the route.
const SAMPLE = 20, CANDIDATES = 60, PASS_FULL = 16, SMALL_MIN = 10, SMALL_SHARE = 0.8;

// Feeds' links taken in turn (rubric a, rubric b, a, b …) so the sample spans the outlet, not one rubric.
function interleave(lists, limit = CANDIDATES) {
  const out = [], seen = new Set();
  for (let i = 0; out.length < limit && lists.some(l => i < l.length); i++)
    for (const l of lists) if (i < l.length && !seen.has(l[i]) && out.length < limit) { seen.add(l[i]); out.push(l[i]); }
  return out;
}
// One read article → what it gives: a full text (≥ 400 characters, ≥ 2 paragraphs, a date), a date, an author, a photo.
function judge(r, { minChars = 400, minParagraphs = 2 } = {}) {
  if (!r || !r.ok) return { kind: r && r.reason === 'PROMOTED' ? 'promoted' : r && r.reason === 'PAYWALL' ? 'paywalled' : 'failed', reason: r ? r.reason : 'NO_PAGE' };
  const a = r.article;
  if (a.paywalled) return { kind: 'paywalled' };
  const chars = a.paragraphs.join(' ').length;
  return { kind: 'free', full: chars >= minChars && a.paragraphs.length >= minParagraphs && !!a.published_at, date: !!a.published_at, author: !!a.author, photo: a.images.length > 0 };
}
function emptyScore(at) { return { at, sampled: 0, full: 0, date: 0, author: 0, photo: 0, paywalled: 0, promoted: 0, failed: 0, challenged: 0, errors: [], pass: false }; }
function add(score, j) {
  if (j.kind === 'paywalled') score.paywalled++;
  else if (j.kind === 'promoted') score.promoted++;
  else if (j.kind === 'failed') { score.failed++; score.sampled++; if (score.errors.length < 5) score.errors.push(j.reason); }
  else { score.sampled++; if (j.full) score.full++; if (j.date) score.date++; if (j.author) score.author++; if (j.photo) score.photo++; }
}
// 16 of 20 free articles with a full text, nothing closed to us; a small outlet (fewer than 20 to read): 80 % of at least 10.
function decide(score) {
  if (score.challenged) return false;
  if (score.sampled >= SAMPLE) return score.full >= PASS_FULL;
  return score.sampled >= SMALL_MIN && score.full >= Math.ceil(score.sampled * SMALL_SHARE);
}
module.exports = { SAMPLE, interleave, judge, emptyScore, add, decide };
