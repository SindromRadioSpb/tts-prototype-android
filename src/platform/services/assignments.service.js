'use strict';

const { query } = require('../db/pool');

async function assertTextInGroup(textId, groupId) {
  const r = await query('SELECT id, group_id FROM library_texts WHERE id = $1 LIMIT 1;', [textId]);
  if (r.rowCount === 0) return null;
  if (r.rows[0].group_id !== groupId) return 'CROSS_GROUP';
  return r.rows[0];
}

async function createAssignment({ groupId, createdBy, textId, title, mode, settingsJson, dueAt }) {
  const r = await query(
    `INSERT INTO assignments (group_id, created_by, text_id, title, mode, settings_json, due_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, group_id, created_by, text_id, title, mode, settings_json, due_at, created_at;`,
    [groupId, createdBy, textId, title, mode, JSON.stringify(settingsJson || {}), dueAt || null]
  );
  return r.rows[0];
}

async function listAssignments({ groupId, limit = 50, offset = 0 }) {
  const r = await query(
    `SELECT id, group_id, created_by, text_id, title, mode, due_at, created_at
     FROM assignments
     WHERE group_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3;`,
    [groupId, limit, offset]
  );
  return r.rows;
}

async function getAssignment({ id }) {
  const r = await query(
    `SELECT id, group_id, created_by, text_id, title, mode, settings_json, due_at, created_at
     FROM assignments
     WHERE id = $1
     LIMIT 1;`,
    [id]
  );
  return r.rowCount ? r.rows[0] : null;
}

module.exports = {
  assertTextInGroup,
  createAssignment,
  listAssignments,
  getAssignment
};
