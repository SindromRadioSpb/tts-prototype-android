'use strict';

const { performance } = require('node:perf_hooks');
const initSqlJs = require('sql.js');
const Core = require('../../public/js/media-package-core.js');
const Repository = require('../../public/js/media-package-repository.js');

const SEGMENT_COUNT = 2800;
// Frozen before the first optimization run. These are local-core/persistence ceilings,
// not network or media-decoding targets.
const CEILINGS_MS = Object.freeze({ normalize_raw: 750, create_package: 2500, edit_p95: 40, save_draft: 1200, commit_revision: 1800 });

function elapsed(start) { return Number((performance.now() - start).toFixed(2)); }
function percentile(values, p) { return values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]; }

async function main() {
  const source = Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
    start_ms: i * 4000, end_ms: i * 4000 + 3000,
    text: `קטע בדיקה ${i + 1}`, source_line_index: i,
  }));
  let started = performance.now();
  const raw = await Core.createRawRevision({ media_sha256: 'e'.repeat(64), format: 'asr', provider: 'fixture', segments: source });
  const metrics = { normalize_raw: elapsed(started) };

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys=ON; CREATE TABLE texts(id TEXT PRIMARY KEY, source_meta_json TEXT);');
  const migrations = await import('../../public/db/migrations.js');
  if (migrations.MIGRATIONS.length !== 46) throw new Error(`MIGRATION_COUNT:${migrations.MIGRATIONS.length}`);
  db.run(migrations.MIGRATIONS[44]);
  const query = (sql, params = []) => { const stmt = db.prepare(sql); stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows; };
  const repo = Repository.createRepository({
    dbQuery: async (sql, params) => query(sql, params),
    dbRun: async (sql, params) => { const stmt = db.prepare(sql); stmt.run(params || []); stmt.free(); return { changes: db.getRowsModified() }; },
    execRaw: async (sql) => db.run(sql),
  }, Core);

  started = performance.now();
  const pkg = await repo.createPackage({ media: { sha256: 'e'.repeat(64), mime: 'audio/mpeg', duration_ms: SEGMENT_COUNT * 4000 }, raw_revision: raw });
  metrics.create_package = elapsed(started);
  let revision = await repo.getCurrentRevision(pkg.corrected_track_id);
  let segments = revision.segments;
  const editSamples = [];
  const operations = [];
  for (let i = 0; i < 100; i++) {
    const index = i * 27;
    started = performance.now();
    const result = Core.applyOperation('user_corrected', segments, { type: 'edit_text', caption_segment_id: segments[index].caption_segment_id, text: `תיקון ${i + 1}` });
    editSamples.push(elapsed(started)); segments = result.segments; operations.push(result.operation);
  }
  metrics.edit_p95 = Number(percentile(editSamples, 0.95).toFixed(2));
  started = performance.now();
  await repo.saveDraft(pkg.corrected_track_id, revision.revision_id, segments, operations);
  metrics.save_draft = elapsed(started);
  started = performance.now();
  revision = await repo.commitDraft(pkg.corrected_track_id, { author_kind: 'user', provenance: { gate: '2800-segment' } });
  metrics.commit_revision = elapsed(started);

  const failures = Object.entries(CEILINGS_MS).filter(([key, ceiling]) => metrics[key] > ceiling).map(([key, ceiling]) => `${key}:${metrics[key]}>${ceiling}`);
  const output = { gate: 'L3A_2800_SEGMENT', segment_count: SEGMENT_COUNT, duration_ms: SEGMENT_COUNT * 4000, ceilings_ms: CEILINGS_MS, measured_ms: metrics, revision_no: revision.revision_no, failures };
  console.log(JSON.stringify(output, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
