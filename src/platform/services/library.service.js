'use strict';

const { query } = require('../db/pool');

async function assertTextBelongsToGroup(textId, groupId) {
  const r = await query(
    'SELECT id, group_id, created_by, title, source, payload_json, created_at, updated_at FROM library_texts WHERE id = $1 LIMIT 1;',
    [textId]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  if (row.group_id !== groupId) return 'CROSS_GROUP';
  return row;
}

async function createText({ groupId, createdBy, title, source, payloadJson }) {
  const r = await query(
    `INSERT INTO library_texts (group_id, created_by, title, source, payload_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, group_id, created_by, title, source, payload_json, created_at, updated_at;`,
    [groupId, createdBy, title, source || null, JSON.stringify(payloadJson || {})]
  );
  return r.rows[0];
}

async function listTexts({ groupId, limit = 50, offset = 0 }) {
  const r = await query(
    `SELECT id, group_id, created_by, title, source, created_at, updated_at
     FROM library_texts
     WHERE group_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3;`,
    [groupId, limit, offset]
  );
  return r.rows;
}

async function getText({ id }) {
  const r = await query(
    `SELECT id, group_id, created_by, title, source, payload_json, created_at, updated_at
     FROM library_texts
     WHERE id = $1
     LIMIT 1;`,
    [id]
  );
  return r.rowCount ? r.rows[0] : null;
}

module.exports = {
  createText,
  listTexts,
  getText,
  assertTextBelongsToGroup
};
