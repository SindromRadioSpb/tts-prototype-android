'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const Core = require('../../public/js/media-package-core.js');
const StudioMediaPackage = require('../../public/js/studio-media-package.js');

function arg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}
function fileSha(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(path).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  const cardPath = arg('card');
  const mediaPath = arg('media');
  if (!cardPath) throw new Error('USAGE: --card=<text-card.json> [--media=<original-media>]');
  const bytes = fs.readFileSync(cardPath);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const holder = parsed && parsed.card && parsed.card.source_meta && parsed.card.source_meta.source;
  const before = crypto.createHash('sha256').update(bytes).digest('hex');
  const input = StudioMediaPackage.passportToPromotionInput(holder);
  const raw = await Core.createRawRevision({
    media_sha256: input.media.sha256, format: input.format, language: input.language,
    provider: input.provider, model: input.model, model_revision: input.model_revision,
    segments: input.segments, provenance: input.provenance,
  });
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: (() => { let i = 0; return () => `cseg:mia-dry-run:${i++}`; })() });
  const correctedHash = await Core.revisionHash('user_corrected', corrected, []);
  const sourceIds = new Set(raw.segments.map((segment) => segment.source_segment_id));
  if (sourceIds.size !== raw.segments.length) throw new Error('SOURCE_SEGMENT_ID_COLLISION');
  if (!corrected.every((segment) => segment.source_segment_ids.length === 1 && sourceIds.has(segment.source_segment_ids[0]))) throw new Error('LINEAGE_MISMATCH');
  const rows = Array.isArray(parsed.card.rows) ? parsed.card.rows.length : null;
  if (rows != null && rows !== raw.segments.length) throw new Error(`ROW_SEGMENT_COUNT_MISMATCH:${rows}:${raw.segments.length}`);
  const after = crypto.createHash('sha256').update(fs.readFileSync(cardPath)).digest('hex');
  if (before !== after) throw new Error('INPUT_MUTATED');
  let media = null;
  if (mediaPath) {
    const actual = await fileSha(mediaPath);
    if (input.media.sha256 && actual !== String(input.media.sha256).toLowerCase()) throw new Error('MEDIA_SHA_MISMATCH');
    media = { sha256: actual, size_bytes: fs.statSync(mediaPath).size, matches_passport: actual === String(input.media.sha256 || '').toLowerCase() };
  }
  console.log(JSON.stringify({
    gate: 'L3A_MIA_DRY_PROMOTION', card_sha256: before, row_count: rows,
    raw_segment_count: raw.segments.length, source_id_count: sourceIds.size,
    raw_revision_sha256: raw.canonical_sha256, corrected_revision_sha256: correctedHash,
    media, input_mutated: false, transcript_emitted: false,
  }, null, 2));
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
