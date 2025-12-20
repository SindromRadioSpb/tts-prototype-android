'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/requireAuth');
const { pool } = require('../db/pool');

function safeError(res, status, error, message) {
  return res.status(status).json({ error, message });
}

function invitesRouter() {
  const router = express.Router();

  router.use(requireAuth);

  // POST /api/invites/join { code }
  router.post('/join', async (req, res) => {
    const user = req.session.user;
    const code = String((req.body && req.body.code) || '').trim();

    if (!code) {
      return safeError(res, 400, 'INVALID_CODE', 'Invite code is required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inv = await client.query(
        `SELECT id, code, group_id, expires_at, max_uses, uses_count
         FROM invites
         WHERE code = $1
         FOR UPDATE`,
        [code]
      );

      if (!inv.rows.length) {
        await client.query('ROLLBACK');
        return safeError(res, 404, 'INVITE_NOT_FOUND', 'Invite not found');
      }

      const invite = inv.rows[0];

      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        return safeError(res, 410, 'INVITE_EXPIRED', 'Invite expired');
      }

      if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
        await client.query('ROLLBACK');
        return safeError(res, 410, 'INVITE_MAX_USES', 'Invite reached max uses');
      }

      // Add membership (idempotent)
      const ins = await client.query(
        `INSERT INTO group_members(group_id, user_id)
         VALUES($1, $2)
         ON CONFLICT DO NOTHING`,
        [invite.group_id, user.id]
      );

      const joined = ins.rowCount === 1;

      // Consume invite only if user actually joined now
      if (joined) {
        await client.query(
          `UPDATE invites
           SET uses_count = uses_count + 1
           WHERE id = $1`,
          [invite.id]
        );
      }

      await client.query('COMMIT');
      return res.status(200).json({ ok: true, joined, groupId: invite.group_id });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[invites/join] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { invitesRouter };
