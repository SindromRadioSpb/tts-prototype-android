'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { requireGroupMemberFrom } = require('../middleware/requireGroupMember');
const {
  assertTextInGroup,
  assertAssignmentInGroup,
  upsertProgress,
  getProgress
} = require('../services/progress.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }

function progressRouter() {
  const router = express.Router();

  // POST /api/progress/upsert
  router.post(
    '/upsert',
    requireAuth,
    requireGroupMemberFrom((req) => req.body && req.body.groupId),
    async (req, res) => {
      try {
        const body = req.body || {};

        const groupId = body.groupId;
        const textId = body.textId;
        const assignmentId = body.assignmentId;

        if (!isUuid(groupId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId must be uuid' });
        if (!isUuid(textId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'textId must be uuid' });
        if (assignmentId !== undefined && assignmentId !== null && assignmentId !== '' && !isUuid(assignmentId)) {
          return res.status(400).json({ error: 'BAD_REQUEST', message: 'assignmentId must be uuid' });
        }

        const t = await assertTextInGroup(textId, groupId);
        if (!t) return res.status(404).json({ error: 'NOT_FOUND', message: 'text not found' });
        if (t === 'CROSS_GROUP') return res.status(403).json({ error: 'FORBIDDEN' });

        if (assignmentId) {
          const a = await assertAssignmentInGroup(assignmentId, groupId, textId);
          if (!a) return res.status(404).json({ error: 'NOT_FOUND', message: 'assignment not found' });
          if (a === 'CROSS_GROUP') return res.status(403).json({ error: 'FORBIDDEN' });
          if (a === 'TEXT_MISMATCH') return res.status(400).json({ error: 'BAD_REQUEST', message: 'assignmentId does not match textId' });
        }

        const lastSelectedRow =
          body.lastSelectedRow === undefined ? null : (Number.isFinite(Number(body.lastSelectedRow)) ? Number(body.lastSelectedRow) : null);

        const lastPlayedRow =
          body.lastPlayedRow === undefined ? null : (Number.isFinite(Number(body.lastPlayedRow)) ? Number(body.lastPlayedRow) : null);

        let completion = null;
        if (body.completion !== undefined) {
          const c = Number(body.completion);
          if (!Number.isFinite(c) || c < 0 || c > 100) {
            return res.status(400).json({ error: 'BAD_REQUEST', message: 'completion must be 0..100' });
          }
          completion = Math.round(c);
        }

        const statsProvided = Object.prototype.hasOwnProperty.call(body, 'stats');
        const statsJson = (statsProvided && body.stats && typeof body.stats === 'object') ? body.stats : {};

        const row = await upsertProgress({
          groupId,
          userId: req.user.id,
          textId,
          assignmentId: assignmentId || null,
          lastSelectedRow,
          lastPlayedRow,
          completion,
          statsJson,
          statsProvided
        });

        return res.status(200).json({ ok: true, progress: row });
      } catch (e) {
        console.error('[progress] upsert fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  // GET /api/progress?groupId=...&textId=...&assignmentId=...
  router.get(
    '/',
    requireAuth,
    requireGroupMemberFrom((req) => req.query && req.query.groupId),
    async (req, res) => {
      try {
        const { groupId, textId, assignmentId } = req.query || {};
        if (!isUuid(groupId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId must be uuid' });
        if (!isUuid(textId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'textId must be uuid' });
        if (assignmentId !== undefined && assignmentId !== null && assignmentId !== '' && !isUuid(assignmentId)) {
          return res.status(400).json({ error: 'BAD_REQUEST', message: 'assignmentId must be uuid' });
        }

        const t = await assertTextInGroup(textId, groupId);
        if (!t) return res.status(404).json({ error: 'NOT_FOUND', message: 'text not found' });
        if (t === 'CROSS_GROUP') return res.status(403).json({ error: 'FORBIDDEN' });

        if (assignmentId) {
          const a = await assertAssignmentInGroup(assignmentId, groupId, textId);
          if (!a) return res.status(404).json({ error: 'NOT_FOUND', message: 'assignment not found' });
          if (a === 'CROSS_GROUP') return res.status(403).json({ error: 'FORBIDDEN' });
          if (a === 'TEXT_MISMATCH') return res.status(400).json({ error: 'BAD_REQUEST', message: 'assignmentId does not match textId' });
        }

        const row = await getProgress({
          groupId,
          userId: req.user.id,
          textId,
          assignmentId: assignmentId || null
        });

        return res.status(200).json({ ok: true, progress: row || null });
      } catch (e) {
        console.error('[progress] get fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  return router;
}

module.exports = { progressRouter };
