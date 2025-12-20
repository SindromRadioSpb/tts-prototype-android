'use strict';

const express = require('express');
const crypto = require('crypto');

const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { query } = require('../db/pool');

function safeError(res, status, error, message) {
  return res.status(status).json({ error, message });
}

function genInviteCode() {
  // 10–12 символов, безопасно для URL
  return crypto.randomBytes(9).toString('base64url');
}

function groupsRouter() {
  const router = express.Router();

  // Любые группы — только для авторизованных
  router.use(requireAuth);

  // List groups for current user
  router.get('/', async (req, res) => {
    try {
      const user = req.session.user;

      if (user.role === 'teacher') {
        const r = await query(
          `SELECT
             g.id, g.name, g.created_by, g.created_at,
             (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS members_count
           FROM groups g
           WHERE g.created_by = $1
           ORDER BY g.created_at DESC`,
          [user.id]
        );
        return res.status(200).json({ ok: true, groups: r.rows });
      }

      // student
      const r = await query(
        `SELECT
           g.id, g.name, g.created_by, g.created_at,
           gm.joined_at
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
         WHERE gm.user_id = $1
         ORDER BY gm.joined_at DESC`,
        [user.id]
      );
      return res.status(200).json({ ok: true, groups: r.rows });
    } catch (e) {
      console.error('[groups/list] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    }
  });

  // Teacher-only: create group
  router.post('/', requireRole('teacher'), async (req, res) => {
    try {
      const user = req.session.user;
      const name = String((req.body && req.body.name) || '').trim();

      if (!name || name.length < 2) {
        return safeError(res, 400, 'INVALID_NAME', 'Group name is required');
      }

      const r = await query(
        `INSERT INTO groups(name, created_by)
         VALUES($1, $2)
         RETURNING id, name, created_by, created_at`,
        [name, user.id]
      );

      return res.status(201).json({ ok: true, group: r.rows[0] });
    } catch (e) {
      console.error('[groups/create] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    }
  });

  // Teacher-only: create invite for group
  router.post('/:groupId/invites', requireRole('teacher'), async (req, res) => {
    try {
      const user = req.session.user;
      const groupId = String(req.params.groupId || '').trim();

      // Check group belongs to this teacher
      const g = await query(
        `SELECT id FROM groups WHERE id = $1 AND created_by = $2 LIMIT 1`,
        [groupId, user.id]
      );
      if (!g.rows.length) {
        return safeError(res, 404, 'GROUP_NOT_FOUND', 'Group not found');
      }

      const expiresInDaysRaw = (req.body && req.body.expiresInDays);
      const maxUsesRaw = (req.body && req.body.maxUses);

      const expiresInDays = (expiresInDaysRaw === undefined || expiresInDaysRaw === null || expiresInDaysRaw === '')
        ? null
        : Number.parseInt(String(expiresInDaysRaw), 10);

      const maxUses = (maxUsesRaw === undefined || maxUsesRaw === null || maxUsesRaw === '')
        ? null
        : Number.parseInt(String(maxUsesRaw), 10);

      if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
        return safeError(res, 400, 'INVALID_EXPIRES', 'expiresInDays must be 1..365 or omitted');
      }
      if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 10000)) {
        return safeError(res, 400, 'INVALID_MAX_USES', 'maxUses must be 1..10000 or omitted');
      }

      const code = genInviteCode();
      const expiresAt = expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      const r = await query(
        `INSERT INTO invites(code, group_id, created_by, expires_at, max_uses)
         VALUES($1, $2, $3, $4, $5)
         RETURNING id, code, group_id, created_by, created_at, expires_at, max_uses, uses_count`,
        [code, groupId, user.id, expiresAt, maxUses]
      );

      return res.status(201).json({ ok: true, invite: r.rows[0] });
    } catch (e) {
      // unique violation on code (rare) — можно просто повторить, но пока вернём 500
      console.error('[invites/create] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    }
  });

  return router;
}

module.exports = { groupsRouter };
