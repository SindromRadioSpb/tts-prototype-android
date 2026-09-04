const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/media-package-core.js');
const Repository = require('../public/js/media-package-repository.js');

let SQL;
test.before(async () => { SQL = await initSqlJs(); });

async function migration45() {
  const migrations = await import('../public/db/migrations.js');
  assert.ok(migrations.MIGRATIONS.length >= 49);
  return migrations.MIGRATIONS[44];
}

async function harness() {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys=ON; CREATE TABLE texts(id TEXT PRIMARY KEY, source_meta_json TEXT);');
  db.run(await migration45());
  const rows = (sql, params = []) => {
    const stmt = db.prepare(sql); stmt.bind(params); const out = [];
    while (stmt.step()) out.push(stmt.getAsObject()); stmt.free(); return out;
  };
  const adapter = {
    dbQuery: async (sql, params) => rows(sql, params),
    dbRun: async (sql, params) => { const stmt = db.prepare(sql); stmt.run(params || []); stmt.free(); return { changes: db.getRowsModified() }; },
    execRaw: async (sql) => { db.run(sql); },
  };
  return { db, rows, repo: Repository.createRepository(adapter, Core) };
}

async function rawRevision(sha = 'a'.repeat(64), suffix = '') {
  return Core.createRawRevision({
    media_sha256: sha, format: 'asr', provider: 'local-faster-whisper',
    segments: [{ start_ms: 0, end_ms: 1000, text: 'שלום' }, { start_ms: 1100, end_ms: 2200, text: 'מיה' + suffix }],
  });
}

test('workspace catalog makes persisted corrected tracks reopenable without another ASR run', async () => {
  const h = await harness();
  h.db.run("INSERT INTO texts(id,source_meta_json) VALUES ('text-1','{}')");
  const first = await h.repo.createPackage({
    media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg', duration_ms: 122000, original_name: 'mia.mp3', opfs_path: 'media/a.mp3' },
    raw_revision: await rawRevision('a'.repeat(64)),
  });
  const revision = await h.repo.getCurrentRevision(first.corrected_track_id);
  await h.repo.bindText({ text_id: 'text-1', package_id: first.package_id, track_id: first.corrected_track_id, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256 });
  const correctedSegments = revision.segments.map((segment, index) => index === 0 ? { ...segment, text: 'שלום מתוקן' } : segment);
  await h.repo.saveDraft(first.corrected_track_id, revision.revision_id, correctedSegments, [{ op: 'edit', source_segment_id: revision.segments[0].source_segment_id }]);

  const second = await h.repo.createPackage({
    media: { sha256: 'b'.repeat(64), mime: 'video/mp4', duration_ms: 65000, original_name: 'interview.mp4' },
    raw_revision: await rawRevision('b'.repeat(64), ' אחרת'),
  });
  await h.repo.deletePackage(second.package_id, { confirm: true });

  const workspaces = await h.repo.listWorkspaces({ limit: 8 });
  assert.equal(workspaces.length, 1, 'deleted packages stay out of the reopen catalog');
  assert.deepEqual({
    package_id: workspaces[0].package_id,
    corrected_track_id: workspaces[0].corrected_track_id,
    original_name: workspaces[0].original_name,
    revision_no: workspaces[0].revision_no,
    has_draft: workspaces[0].has_draft,
    media_available: workspaces[0].media_available,
    binding_count: workspaces[0].binding_count,
  }, {
    package_id: first.package_id,
    corrected_track_id: first.corrected_track_id,
    original_name: 'mia.mp3',
    revision_no: 1,
    has_draft: true,
    media_available: true,
    binding_count: 1,
  });
  assert.equal((await h.repo.getWorkspace(first.package_id)).current_revision_id, revision.revision_id);

  await h.repo.commitDraft(first.corrected_track_id, { author_kind: 'user' });
  const stale = await h.repo.isTextBindingStale('text-1');
  const reopened = await h.repo.getWorkspace(first.package_id);
  assert.equal(stale.stale, true, 'a table bound to the older revision is marked stale');
  assert.equal(reopened.revision_no, 2, 'reopen targets the current corrected revision, not the frozen table revision');
});

test('workspace lookup selects the exact corrected track when one media SHA is reused by a portable import', async () => {
  const h = await harness();
  const created = await h.repo.createPackage({
    media: { sha256: 'a'.repeat(64), mime: 'video/mp4', duration_ms: 65000, original_name: 'shared.mp4', opfs_path: 'media/shared.mp4' },
    raw_revision: await rawRevision('a'.repeat(64)),
  });
  const portableTrackId = 'track:portable:corrected';
  const portableRevisionId = 'rev:portable:corrected';
  h.db.run(`INSERT INTO studio_caption_tracks(track_id,package_id,role,language,parent_track_id,current_revision_id,draft_base_revision_id,draft_json,draft_updated_at,created_at,updated_at)
    VALUES('${portableTrackId}','${created.package_id}','user_corrected','he',NULL,NULL,NULL,NULL,NULL,'t','t')`);
  h.db.run(`INSERT INTO studio_caption_revisions(revision_id,track_id,parent_revision_id,revision_no,segments_json,operations_json,canonical_sha256,author_kind,provenance_json,created_at)
    VALUES('${portableRevisionId}','${portableTrackId}',NULL,7,'[]','[]','${'c'.repeat(64)}','import','{}','t')`);
  h.db.run(`UPDATE studio_caption_tracks SET current_revision_id='${portableRevisionId}' WHERE track_id='${portableTrackId}'`);

  const workspaces = await h.repo.listWorkspaces({ limit: 8 });
  assert.equal(workspaces.length, 2, 'both immutable corrected tracks remain independently reopenable');
  const reopened = await h.repo.getWorkspace(created.package_id, portableTrackId);
  assert.equal(reopened.corrected_track_id, portableTrackId);
  assert.equal(reopened.current_revision_id, portableRevisionId);
  assert.equal(reopened.revision_no, 7);
});

test('migration v45 is additive and creates the four canonical tables/indexes', async () => {
  const h = await harness();
  const names = h.rows("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%' ORDER BY name").map((r) => r.name);
  assert.deepEqual(names, ['studio_caption_revisions', 'studio_caption_tracks', 'studio_media_packages', 'studio_text_media_bindings']);
  const indexes = h.rows("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_studio_%' ORDER BY name").map((r) => r.name);
  assert.ok(indexes.includes('ix_studio_revisions_track_no'));
  assert.ok(indexes.includes('ix_studio_tracks_package_role'));
});

test('package creation is idempotent and raw revision has no mutation API', async () => {
  const h = await harness(); const raw = await rawRevision();
  const first = await h.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg', duration_ms: 2200, original_name: 'mia.mp3', opfs_path: 'media/' + 'a'.repeat(64) + '.mp3' }, raw_revision: raw });
  const second = await h.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg' }, raw_revision: raw });
  assert.equal(second.package_id, first.package_id);
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_media_packages')[0].n, 1);
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_caption_tracks')[0].n, 2);
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_caption_revisions')[0].n, 2);
  assert.equal(typeof h.repo.updateRawRevision, 'undefined');
});

test('fault injection rolls back every create phase', async () => {
  for (const phase of ['after_package', 'after_raw_revision', 'after_corrected_revision', 'before_commit']) {
    const h = await harness(); const raw = await rawRevision();
    await assert.rejects(() => h.repo.createPackage({
      media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg' }, raw_revision: raw,
      fault_inject: phase,
    }), new RegExp('FAULT_INJECT:' + phase));
    assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_media_packages')[0].n, 0, phase);
    assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_caption_revisions')[0].n, 0, phase);
  }
});

test('draft is recoverable; commit is immutable and stale base fails without advancing canon', async () => {
  const h = await harness(); const raw = await rawRevision();
  const pkg = await h.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg' }, raw_revision: raw });
  const current = await h.repo.getCurrentRevision(pkg.corrected_track_id);
  const edited = Core.applyOperation('user_corrected', current.segments, { type: 'edit_text', caption_segment_id: current.segments[0].caption_segment_id, text: 'שלום, מיה' });
  await h.repo.saveDraft(pkg.corrected_track_id, current.revision_id, edited.segments, [edited.operation]);
  assert.equal((await h.repo.getTrack(pkg.corrected_track_id)).draft.segments[0].text, 'שלום, מיה');
  const committed = await h.repo.commitDraft(pkg.corrected_track_id, { author_kind: 'user', provenance: { surface: 'editor' } });
  assert.equal(committed.revision_no, 2);
  assert.equal((await h.repo.getTrack(pkg.corrected_track_id)).draft, null);
  await h.repo.saveDraft(pkg.corrected_track_id, committed.revision_id, committed.segments, []);
  await h.repo.commitDraft(pkg.corrected_track_id, { author_kind: 'user', provenance: {} });
  await h.repo.saveDraft(pkg.corrected_track_id, committed.revision_id, committed.segments, []);
  await assert.rejects(() => h.repo.commitDraft(pkg.corrected_track_id, { author_kind: 'user', provenance: {} }), /DRAFT_BASE_STALE/);
});

test('fault injection during revision commit leaves previous revision canonical and draft recoverable', async () => {
  for (const phase of ['after_revision_insert', 'after_pointer_update', 'before_commit']) {
    const h = await harness(), raw = await rawRevision();
    const pkg = await h.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg' }, raw_revision: raw });
    const before = await h.repo.getCurrentRevision(pkg.corrected_track_id);
    const edited = Core.applyOperation('user_corrected', before.segments, { type: 'edit_text', caption_segment_id: before.segments[0].caption_segment_id, text: 'תיקון' });
    await h.repo.saveDraft(pkg.corrected_track_id, before.revision_id, edited.segments, [edited.operation]);
    await assert.rejects(() => h.repo.commitDraft(pkg.corrected_track_id, { author_kind: 'user', provenance: {}, fault_inject: phase }), new RegExp('FAULT_INJECT:' + phase));
    assert.equal((await h.repo.getCurrentRevision(pkg.corrected_track_id)).revision_id, before.revision_id, phase);
    assert.equal((await h.repo.getTrack(pkg.corrected_track_id)).draft.segments[0].text, 'תיקון', phase);
    assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_caption_revisions WHERE track_id=?', [pkg.corrected_track_id])[0].n, 1, phase);
  }
});

test('text binding freezes exact revision and deletion receipt preserves referenced media fact', async () => {
  const h = await harness(); const raw = await rawRevision();
  h.db.run("INSERT INTO texts(id,source_meta_json) VALUES ('text-1','{}')");
  const pkg = await h.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg', opfs_path: 'media/a.mp3' }, raw_revision: raw });
  const revision = await h.repo.getCurrentRevision(pkg.corrected_track_id);
  await h.repo.bindText({ text_id: 'text-1', package_id: pkg.package_id, track_id: pkg.corrected_track_id, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256, mapping: { schema: 'studio-row-source-v2' } });
  const binding = await h.repo.getTextBinding('text-1');
  assert.equal(binding.revision_id, revision.revision_id);
  const receipt = await h.repo.deletePackage(pkg.package_id, { confirm: true });
  assert.equal(receipt.bindings_removed, 1);
  assert.equal(receipt.media_blob_action, 'eligible_for_gc');
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_media_packages')[0].n, 0);
});

test('delete preview names orphaned materials, sole timing copy and SHA identity recovery before any write', async () => {
  const h = await harness();
  h.db.run(`CREATE TABLE studio_learning_materials(
    material_id TEXT PRIMARY KEY, package_id TEXT, text_id TEXT NOT NULL,
    portable_text_key TEXT, current_table_revision_id TEXT, created_at TEXT, updated_at TEXT
  )`);
  const pkg = await h.repo.createPackage({
    media: { sha256: 'd'.repeat(64), mime: 'video/mp4', original_name: 'owner-interview.mp4' },
    raw_revision: await rawRevision('d'.repeat(64)),
  });
  h.db.run(`INSERT INTO studio_learning_materials VALUES
    ('material:one',?,'text-one','owner-interview',NULL,'t','t'),
    ('material:two',?,'text-two',NULL,NULL,'t','t')`, [pkg.package_id, pkg.package_id]);

  const before = h.rows('SELECT COUNT(*) AS n FROM studio_media_packages')[0].n;
  const preview = await h.repo.previewDeletePackage(pkg.package_id);
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_media_packages')[0].n, before, 'preview is read-only');
  assert.deepEqual(preview.materials_losing_source, [
    { material_id: 'material:one', text_id: 'text-one', name: 'owner-interview' },
    { material_id: 'material:two', text_id: 'text-two', name: 'text-two' },
  ]);
  assert.equal(preview.materials_losing_source_count, 2);
  assert.equal(preview.caption_revisions_are_only_timing_copy, true);
  assert.equal(preview.caption_revisions_destroyed, 2);
  assert.equal(preview.reimport_same_sha_restores_identity, true);
  assert.equal(preview.media_sha256, 'd'.repeat(64));
  assert.equal(preview.package_name, 'owner-interview.mp4');
});

test('verified slim snapshot imports transactionally and duplicate import is idempotent', async () => {
  const source = await harness(), target = await harness(), raw = await rawRevision();
  const created = await source.repo.createPackage({ media: { sha256: 'a'.repeat(64), mime: 'audio/mpeg', duration_ms: 2200, original_name: 'mia.mp3' }, raw_revision: raw });
  const tracks = await source.repo.listTracks(created.package_id);
  const rawTrack = tracks.find((track) => track.role === 'raw_original');
  const correctedTrack = tracks.find((track) => track.role === 'user_corrected');
  const snapshot = {
    package: await source.repo.getPackage(created.package_id),
    raw_track: rawTrack,
    raw_revision: await source.repo.getCurrentRevision(rawTrack.track_id),
    corrected_track: correctedTrack,
    corrected_revision: await source.repo.getCurrentRevision(correctedTrack.track_id),
  };
  const imported = await target.repo.importSnapshot(snapshot);
  assert.deepEqual(imported, { imported: true, duplicate: false, package_id: created.package_id, corrected_track_id: correctedTrack.track_id });
  assert.equal((await target.repo.getCurrentRevision(correctedTrack.track_id)).canonical_sha256, snapshot.corrected_revision.canonical_sha256);
  assert.equal((await target.repo.getPackage(created.package_id)).opfs_path, null);
  const duplicate = await target.repo.importSnapshot(snapshot);
  assert.equal(duplicate.duplicate, true);
  assert.equal(target.rows('SELECT COUNT(*) AS n FROM studio_caption_revisions')[0].n, 2);
});

// ── F1 (packet 2026-08-06): провенанс строк — источник истины о том, какому медиа принадлежит
// карточка. Живой инцидент: 561 строка с провенансом медиа B была привязана к пакету медиа A,
// потому что package_id брался из ambient window.v3LastMediaPackageRef и ни с чем не сверялся.
const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const rowsFor = (sha, n = 2) => ({
  schema: 'studio-row-source-v2',
  rows: Array.from({ length: n }, (_, i) => ({ row_index: i, source_segment_id: 'asrseg:' + sha + ':' + i })),
});

test('mediaShaSetFromMapping reads media identity out of both known row-source id shapes', () => {
  const set = (mapping) => Core.mediaShaSetFromMapping(mapping);
  assert.deepEqual(set(rowsFor(SHA_A)), [SHA_A], 'asrseg:<sha>:<n>');
  assert.deepEqual(set({ rows: [{ source_segment_id: 'srcseg:' + SHA_B + ':' + 'f'.repeat(16) + ':0' }] }), [SHA_B], 'srcseg:<sha>:<fp>:<n>');
  assert.deepEqual(set({ rows: [{ source_segment_ids: ['asrseg:' + SHA_A + ':0'], raw_source_segment_ids: ['srcseg:' + SHA_B + ':' + 'f'.repeat(16) + ':1'] }] }).sort(), [SHA_A, SHA_B], 'every id-bearing field is read');
  assert.deepEqual(set({ rows: [{ source_segment_id: 'cseg:abc:0' }] }), [], 'caption ids carry no media identity');
  assert.deepEqual(set({ rows: [{ source_segment_id: 'srcseg:unbound:' + 'c'.repeat(64) + ':0' }] }), [], 'unbound tracks are not a media identity');
  assert.deepEqual(set({ rows: [{ source_segment_id: 'asrseg:NOTAHASH:0' }, { source_segment_id: '' }, {}] }), [], 'malformed ids are ignored, never guessed');
  assert.deepEqual(set(null), [], 'no mapping is not a claim');
  assert.deepEqual(set({ rows: [] }), [], 'empty mapping is not a claim');
});

test('bindText refuses a mapping whose row provenance names another media, and writes nothing', async () => {
  const h = await harness();
  h.db.run("INSERT INTO texts(id,source_meta_json) VALUES ('text-1','{}')");
  const pkg = await h.repo.createPackage({ media: { sha256: SHA_A, mime: 'audio/mpeg', opfs_path: 'media/a.mp3' }, raw_revision: await rawRevision(SHA_A) });
  const revision = await h.repo.getCurrentRevision(pkg.corrected_track_id);
  const binding = { text_id: 'text-1', package_id: pkg.package_id, track_id: pkg.corrected_track_id, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256 };

  await assert.rejects(() => h.repo.bindText({ ...binding, mapping: rowsFor(SHA_B) }), /BINDING_PROVENANCE_MISMATCH/);
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM studio_text_media_bindings')[0].n, 0, 'nothing is written on a refused bind');

  await h.repo.bindText({ ...binding, mapping: rowsFor(SHA_A) });
  assert.equal((await h.repo.getTextBinding('text-1')).package_id, pkg.package_id, 'agreeing provenance binds');
  await assert.rejects(() => h.repo.bindText({ ...binding, mapping: rowsFor(SHA_B) }), /BINDING_PROVENANCE_MISMATCH/);
  assert.equal((await h.repo.getTextBinding('text-1')).package_id, pkg.package_id, 'an existing good binding survives a refused overwrite');
});

test('bindText does not judge rows it cannot read, and records that it did not', async () => {
  const h = await harness();
  h.db.run("INSERT INTO texts(id,source_meta_json) VALUES ('text-1','{}')");
  const pkg = await h.repo.createPackage({ media: { sha256: SHA_A, mime: 'audio/mpeg', opfs_path: 'media/a.mp3' }, raw_revision: await rawRevision(SHA_A) });
  const revision = await h.repo.getCurrentRevision(pkg.corrected_track_id);
  const bind = (mapping) => h.repo.bindText({ text_id: 'text-1', package_id: pkg.package_id, track_id: pkg.corrected_track_id, revision_id: revision.revision_id, revision_sha256: revision.canonical_sha256, mapping });

  await bind({ schema: 'studio-row-source-v2', rows: [{ row_index: 0, caption_segment_id: 'cseg:x:0' }] });
  assert.equal((await h.repo.getTextBinding('text-1')).mapping.provenance_checked, false, 'legacy rows pass but are marked unchecked');
  await bind(rowsFor(SHA_A));
  assert.equal((await h.repo.getTextBinding('text-1')).mapping.provenance_checked, true, 'verified rows are marked checked');
  await bind(null);
  assert.equal((await h.repo.getTextBinding('text-1')).mapping, null, 'a bind with no mapping stays exactly as before');
});
