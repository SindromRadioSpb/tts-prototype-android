'use strict';

const { query } = require('../db/pool');

async function assertTextInGroup(textId, groupId) {
  const r = await query('SELECT id, group_id FROM library_texts WHERE id = $1 LIMIT 1;', [textId]);
  if (r.rowCount === 0) return null;
  if (r.rows[0].group_id !== groupId) return 'CROSS_GROUP';
  return r.rows[0];
}

async function assertAssignmentInGroup(assignmentId, groupId, textId) {
  const r = await query(
    'SELECT id, group_id, text_id FROM assignments WHERE id = $1 LIMIT 1;',
    [assignmentId]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  if (row.group_id !== groupId) return 'CROSS_GROUP';
  if (textId && row.text_id !== textId) return 'TEXT_MISMATCH';
  return row;
}

async function upsertProgress({
  groupId,
  userId,
  textId,
  assignmentId,
  lastSelectedRow,
  lastPlayedRow,
  completion,
  statsJson,
  statsProvided
}) {
  const r = await query(
    `INSERT INTO progress (
      group_id, user_id, text_id, assignment_id,
      last_selected_row, last_played_row, completion, stats_json
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8::jsonb
    )
    ON CONFLICT ON CONSTRAINT progress_unique_key
    DO UPDATE SET
      last_selected_row = COALESCE(EXCLUDED.last_selected_row, progress.last_selected_row),
      last_played_row   = COALESCE(EXCLUDED.last_played_row,   progress.last_played_row),
      completion        = COALESCE(EXCLUDED.completion,        progress.completion),
      stats_json        = CASE WHEN $9::boolean THEN EXCLUDED.stats_json ELSE progress.stats_json END,
      updated_at        = now()
    RETURNING
      id, group_id, user_id, text_id, assignment_id,
      last_selected_row, last_played_row, completion, stats_json, updated_at;`,
    [
      groupId,
      userId,
      textId,
      assignmentId || null,
      lastSelectedRow,
      lastPlayedRow,
      completion,
      JSON.stringify(statsJson || {}),
      Boolean(statsProvided)
    ]
  );
  return r.rows[0];
}

async function getProgress({ groupId, userId, textId, assignmentId }) {
  const r = await query(
    `SELECT
      id, group_id, user_id, text_id, assignment_id,
      last_selected_row, last_played_row, completion, stats_json, updated_at
     FROM progress
     WHERE group_id = $1 AND user_id = $2 AND text_id = $3
       AND assignment_key = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
     LIMIT 1;`,
    [groupId, userId, textId, assignmentId || null]
  );
  return r.rowCount ? r.rows[0] : null;
}

module.exports = {
  assertTextInGroup,
  assertAssignmentInGroup,
  upsertProgress,
  getProgress
};
