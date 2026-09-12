(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./mediatheque-core') : root.MediathequeCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MediathequeLocalRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  function conflict() { const e = new Error('MEDIATHEQUE_CONFLICT'); e.code = e.message; throw e; }
  function createRepository(adapter) {
    const unpack = row => ({ revision: row ? Number(row.revision) : 0,
      structure: row ? Core.validate(JSON.parse(row.structure_json)) : Core.empty(), canUndo: !!(row && row.undo_json) });
    const validVersion = revision => { if (!Number.isSafeInteger(revision) || revision < 0) conflict(); };
    async function load() { return unpack((await adapter.query('SELECT revision,structure_json,undo_json FROM mediatheque_personal WHERE singleton=1'))[0]); }
    async function save(document, expectedVersion) {
      validVersion(expectedVersion); const json = JSON.stringify(Core.validate(document)), now = new Date().toISOString();
      // One SQLite statement is the compare-and-swap boundary, including across proxy tabs.
      // An UPDATE-only statement avoids a SELECT+write race or an interleavable transaction.
      const rows = expectedVersion === 0 ? await adapter.query(`INSERT INTO mediatheque_personal(singleton,revision,structure_json,undo_json,updated_at)
        VALUES(1,1,?,?,?) ON CONFLICT(singleton) DO NOTHING RETURNING revision,structure_json,undo_json`, [json, JSON.stringify(Core.empty()), now])
        : await adapter.query(`UPDATE mediatheque_personal SET revision=revision+1,undo_json=structure_json,structure_json=?,updated_at=?
          WHERE singleton=1 AND revision=? RETURNING revision,structure_json,undo_json`, [json, now, expectedVersion]);
      if (!rows.length) conflict(); return unpack(rows[0]);
    }
    async function undo(expectedVersion) {
      validVersion(expectedVersion);
      const rows = await adapter.query(`UPDATE mediatheque_personal SET revision=revision+1,structure_json=undo_json,undo_json=NULL,updated_at=?
        WHERE singleton=1 AND revision=? AND undo_json IS NOT NULL RETURNING revision,structure_json,undo_json`, [new Date().toISOString(), expectedVersion]);
      if (!rows.length) conflict(); return unpack(rows[0]);
    }
    return Object.freeze({ load, save, undo });
  }
  return Object.freeze({ createRepository });
});
