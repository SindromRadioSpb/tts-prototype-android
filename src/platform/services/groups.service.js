'use strict';

const { pool } = require('../db/pool');

/**
 * Create group AND auto-add creator as a member (transaction).
 *
 * @param {Object} args
 * @param {string} args.name - Group name (already trimmed in router is fine; we also trim here defensively).
 * @param {string} args.creatorUserId - UUID of the user creating the group.
 * @returns {Promise<Object>} created group row {id,name,created_by,created_at}
 */
async function createGroupAndAddCreatorMember({ name, creatorUserId }) {
  const groupName = (typeof name === 'string') ? name.trim() : '';
  if (!groupName) {
    const err = new Error('name is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (!creatorUserId) {
    const err = new Error('creatorUserId is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gRes = await client.query(
      `
      INSERT INTO groups (name, created_by)
      VALUES ($1, $2)
      RETURNING id, name, created_by, created_at
      `,
      [groupName, creatorUserId]
    );

    const group = gRes.rows[0];

    await client.query(
      `
      INSERT INTO group_members (group_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [group.id, creatorUserId]
    );

    await client.query('COMMIT');
    return group;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * List groups visible to a user (i.e., groups where user is a member),
 * plus members_count for each group.
 *
 * @param {Object} args
 * @param {string} args.userId - UUID
 * @param {number} [args.limit=50]
 * @param {number} [args.offset=0]
 * @returns {Promise<{groups: Object[], limit: number, offset: number}>}
 */
async function listGroupsForUser({ userId, limit = 50, offset = 0 }) {
  if (!userId) {
    const err = new Error('userId is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 50;
  const off = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;

  const res = await pool.query(
    `
    SELECT
      g.id,
      g.name,
      g.created_by,
      g.created_at,
      COALESCE(mc.members_count, 0)::int AS members_count
    FROM groups g
    INNER JOIN group_members gm
      ON gm.group_id = g.id
     AND gm.user_id = $1
    LEFT JOIN (
      SELECT group_id, COUNT(*)::int AS members_count
      FROM group_members
      GROUP BY group_id
    ) mc
      ON mc.group_id = g.id
    ORDER BY g.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, lim, off]
  );

  return { groups: res.rows, limit: lim, offset: off };
}

/**
 * Get group by id if user is a member, including members_count.
 *
 * @param {Object} args
 * @param {string} args.groupId - UUID
 * @param {string} args.userId - UUID
 * @returns {Promise<Object|null>} group row with members_count or null if not found/forbidden
 */
async function getGroupForMember({ groupId, userId }) {
  if (!groupId || !userId) {
    const err = new Error('groupId and userId are required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const res = await pool.query(
    `
    SELECT
      g.id,
      g.name,
      g.created_by,
      g.created_at,
      COALESCE(mc.members_count, 0)::int AS members_count
    FROM groups g
    INNER JOIN group_members gm
      ON gm.group_id = g.id
     AND gm.user_id = $2
    LEFT JOIN (
      SELECT group_id, COUNT(*)::int AS members_count
      FROM group_members
      GROUP BY group_id
    ) mc
      ON mc.group_id = g.id
    WHERE g.id = $1
    LIMIT 1
    `,
    [groupId, userId]
  );

  return res.rows[0] || null;
}

module.exports = {
  createGroupAndAddCreatorMember,
  listGroupsForUser,
  getGroupForMember,
};
