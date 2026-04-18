"use strict";

// Manual user corrections for a Hebrew segment. Applied on top of model output
// before we write the doc cache. Provider-scope '*' wins when no specific
// provider override exists; a provider-specific override (e.g. scope='gcp')
// shadows '*' when the current provider matches.

const crypto = require("crypto");
const { getDb } = require("./sqlite");

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

// Returns a Map<heHash, { he_niqqud, translit, ru, provider_scope }>, with
// provider-specific entries shadowing wildcard ones.
async function lookupByHashes({ heHashes, targetLang, provider }) {
  const db = getDb();
  if (!db || !heHashes.length) return new Map();
  const placeholders = heHashes.map(() => "?").join(",");
  const rows = await dbAll(
    db,
    `SELECT he_hash, he_niqqud, translit, ru, provider_scope
       FROM translation_overrides
      WHERE target_lang = ?
        AND he_hash IN (${placeholders})
        AND (provider_scope = '*' OR provider_scope = ?)`,
    [targetLang, ...heHashes, provider]
  );
  const byHash = new Map();
  for (const r of rows) {
    const prev = byHash.get(r.he_hash);
    // Provider-specific (non-'*') wins over wildcard.
    if (!prev || (prev.provider_scope === "*" && r.provider_scope !== "*")) {
      byHash.set(r.he_hash, r);
    }
  }
  return byHash;
}

async function upsert({
  heHash,
  he,
  heNiqqud,
  translit,
  ru,
  targetLang,
  providerScope = "*",
  note,
}) {
  const db = getDb();
  if (!db) return null;
  const existing = await dbGet(
    db,
    `SELECT id FROM translation_overrides
      WHERE he_hash = ? AND target_lang = ? AND provider_scope = ?`,
    [heHash, targetLang, providerScope]
  );
  if (existing) {
    await dbRun(
      db,
      `UPDATE translation_overrides
          SET he = ?, he_niqqud = ?, translit = ?, ru = ?, note = ?, updated_at = ?
        WHERE id = ?`,
      [he, heNiqqud || null, translit || null, ru || null, note || null, nowIso(), existing.id]
    );
    return { id: existing.id, updated: true };
  }
  const id = newId();
  await dbRun(
    db,
    `INSERT INTO translation_overrides
       (id, he_hash, he, he_niqqud, translit, ru,
        target_lang, provider_scope, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, heHash, he, heNiqqud || null, translit || null, ru || null,
      targetLang, providerScope, note || null, nowIso(), nowIso(),
    ]
  );
  return { id, updated: false };
}

async function removeById(id) {
  const db = getDb();
  if (!db) return false;
  const res = await dbRun(db, `DELETE FROM translation_overrides WHERE id = ?`, [id]);
  return res.changes > 0;
}

module.exports = {
  lookupByHashes,
  upsert,
  removeById,
};
