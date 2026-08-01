const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/media-package-core.js');
const Repository = require('../public/js/media-package-repository.js');

let SQL;
test.before(async () => { SQL = await initSqlJs(); });

async function migration45() {
  const migrations = await import('../public/db/migrations.js');
  assert.equal(migrations.MIGRATIONS.length, 46);
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
