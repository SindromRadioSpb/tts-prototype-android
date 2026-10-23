// Works made of parts (Modern release F4): one catalog card, a sealed table of contents, parts that are
// ordinary learning editions. Pure logic only — no DOM, no storage writes — shared by the Room and tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkParts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HASH = /^[a-f0-9]{64}$/;
  const TOC = /^toc\/\d{1,8}-[a-f0-9]{16}\.json$/;
  const READ_DONE = 0.95;   // same «прочитано» bar as the Room's continuePercent/finished badge

  function isMultipart(card) { return !!(card && Number(card.parts) > 1 && TOC.test(String(card.toc_file || '')) && HASH.test(String(card.toc_sha256 || ''))); }

  // The table of contents is immutable and sealed by the catalog card; a mismatch is never shown.
  function parseToc(card, text) {
    const toc = JSON.parse(text);
    if (!toc || toc.schema !== 'benyehuda-work-toc-v1' || String(toc.work_id) !== String(card.id) || !Array.isArray(toc.parts) || toc.parts.length !== Number(card.parts)) throw new Error('Table of contents identity mismatch');
    const ids = new Set();
    toc.parts.forEach((p, i) => {
      if (!p || ids.has(p.part_id) || p.order !== i + 1 || !HASH.test(String(p.text_key || '')) || !HASH.test(String(p.bundle_sha256 || ''))) throw new Error('Malformed table of contents');
      ids.add(p.part_id);
    });
    return toc;
  }

  // A part opens through the same verified path as any learning edition: a card-shaped view of it.
  function partCard(card, part) {
    return { id: card.id, title: part.title, author: card.author, era: card.era, text_key: part.text_key, file: part.file,
      bundle_sha256: part.bundle_sha256, learning_edition_id: part.learning_edition_id, segments: part.rows,
      previous_text_keys: part.previous_text_keys || [], parts: 1, work_title: card.title, part_id: part.part_id };
  }

  const mainParts = (toc) => toc.parts.filter((p) => p.track === 'text' || !p.parent);
  function children(toc, partId) { return toc.parts.filter((p) => p.parent === partId); }
  function findPart(toc, partId) { return toc.parts.find((p) => p.part_id === partId) || null; }

  // Reading order for «Предыдущая / Следующая»: the main sequence; a notes/structure part steps back to its chapter's neighbours.
  function navigation(toc, partId) {
    const seq = mainParts(toc);
    const part = findPart(toc, partId);
    if (!part) return null;
    const anchor = part.parent ? findPart(toc, part.parent) : part;
    const i = seq.findIndex((p) => p.part_id === anchor.part_id);
    return { part, index: i, number: i + 1, total: seq.length, prev: i > 0 ? seq[i - 1] : null, next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : null,
      parent: part.parent ? anchor : null };
  }

  // progressByKey: text_key → { last_row_idx, finished_at, updated_at } for parts on this device. Nothing is guessed for the rest.
  function partState(part, progress) {
    if (!progress) return { state: 'not-opened', percent: 0, rowsRead: 0 };
    const rows = Math.max(1, Number(part.rows) || 1);
    const at = progress.last_row_idx == null ? 0 : Math.min(rows, Number(progress.last_row_idx) + 1);
    const done = !!progress.finished_at || at / rows >= READ_DONE;
    return { state: done ? 'done' : at > 0 ? 'reading' : 'opened', percent: done ? 100 : Math.round((at / rows) * 100), rowsRead: done ? rows : at };
  }
  function workProgress(toc, progressByKey) {
    const seq = toc.parts.filter((p) => p.track === 'text');
    let rows = 0, read = 0, done = 0, last = null;
    for (const p of seq) {
      const pr = progressByKey && progressByKey.get(p.text_key);
      const st = partState(p, pr);
      rows += Number(p.rows) || 0; read += st.rowsRead; if (st.state === 'done') done++;
      if (pr && pr.updated_at && (!last || String(pr.updated_at) > String(last.updated_at))) last = { part: p, updated_at: pr.updated_at, row: pr.last_row_idx };
    }
    for (const p of toc.parts.filter((x) => x.track !== 'text')) {   // a lone notes part read last still resumes
      const pr = progressByKey && progressByKey.get(p.text_key);
      if (pr && pr.updated_at && (!last || String(pr.updated_at) > String(last.updated_at))) last = { part: p, updated_at: pr.updated_at, row: pr.last_row_idx };
    }
    return { partsDone: done, partsTotal: seq.length, rowsRead: read, rowsTotal: rows, percent: rows ? Math.round((read / rows) * 100) : 0, last,
      complete: seq.length > 0 && done === seq.length };
  }

  // «Продолжить чтение»: one card per work. items are newest first; a part carries its work in source_meta.public_learning.part.
  function groupContinue(items) {
    const seen = new Set(), out = [];
    for (const it of items || []) {
      const w = it && it.part_work_id ? String(it.part_work_id) : null;
      if (w) { if (seen.has(w)) continue; seen.add(w); }
      out.push(it);
    }
    return out;
  }

  // A part's label inside its own work: the archive title without the work name. Some archives name parts in
  // Russian only («Продолжение романа»); in a Hebrew/English interface such a label becomes «Part N» (or the
  // track name for a chapter's notes/structure), keeping any date it carried. Nothing is translated or guessed.
  const CYRILLIC = /[Ѐ-ӿ]/;
  function partLabel(part, o) {
    o = o || {};
    const segs = String((part && part.title) || '').split(' · ');
    const own = segs.length > 1 ? segs.slice(1) : segs;
    if (o.lang === 'ru' || !own.some((s) => CYRILLIC.test(s))) return own.join(' · ');
    if (part.parent && o.trackLabel) return o.trackLabel;
    const dates = own.filter((s) => CYRILLIC.test(s)).join(' ').match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g) || [];
    return [o.partWord || o.trackLabel || ''].concat(dates).filter(Boolean).join(' · ');
  }

  return { isMultipart, parseToc, partCard, navigation, children, findPart, mainParts, partState, workProgress, groupContinue, partLabel, TOC };
});
