'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { requireGroupMemberFrom, isGroupMember } = require('../middleware/requireGroupMember');
const { assertTextInGroup, createAssignment, listAssignments, getAssignment } = require('../services/assignments.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }

function assignmentsRouter() {
  const router = express.Router();

  // POST /api/assignments (teacher)
  router.post(
    '/',
    requireAuth,
    requireRole('teacher'),
    requireGroupMemberFrom((req) => req.body && req.body.groupId),
    async (req, res) => {
      try {
        const { groupId, textId, title, mode, settings, dueAt } = req.body || {};

        if (!isUuid(groupId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId must be uuid' });
        if (!isUuid(textId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'textId must be uuid' });
        if (typeof title !== 'string' || !title.trim()) {
          return res.status(400).json({ error: 'BAD_REQUEST', message: 'title is required' });
        }
        if (mode !== 'training' && mode !== 'history') {
          return res.status(400).json({ error: 'BAD_REQUEST', message: 'mode must be training|history' });
        }

        const t = await assertTextInGroup(textId, groupId);
        if (!t) return res.status(404).json({ error: 'NOT_FOUND', message: 'text not found' });
        if (t === 'CROSS_GROUP') return res.status(403).json({ error: 'FORBIDDEN' });

        // dueAt: допускаем null или ISO-строку
        let due = null;
        if (typeof dueAt === 'string' && dueAt.trim()) {
          const d = new Date(dueAt);
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ error: 'BAD_REQUEST', message: 'dueAt must be ISO date string' });
          }
          due = d.toISOString();
        }

        const settingsJson = (settings && typeof settings === 'object') ? settings : {};

        const row = await createAssignment({
          groupId,
          createdBy: req.user.id,
          textId,
          title: title.trim(),
          mode,
          settingsJson,
          dueAt: due
        });

        return res.status(201).json({ ok: true, assignment: row });
      } catch (e) {
        console.error('[assignments] create fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  // GET /api/assignments?groupId=...
  router.get(
    '/',
    requireAuth,
    requireGroupMemberFrom((req) => req.query && req.query.groupId),
    async (req, res) => {
      try {
        const { groupId } = req.query || {};
        if (!isUuid(groupId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId must be uuid' });

        const limitRaw = req.query && req.query.limit;
        const offsetRaw = req.query && req.query.offset;

        const limit = Number.isFinite(Number(limitRaw)) ? Math.max(1, Math.min(100, Number(limitRaw))) : 50;
        const offset = Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0;

        const rows = await listAssignments({ groupId, limit, offset });
        return res.status(200).json({ ok: true, assignments: rows, limit, offset });
      } catch (e) {
        console.error('[assignments] list fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  // GET /api/assignments/:id
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const id = req.params && req.params.id;
      if (!isUuid(id)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'id must be uuid' });

      const row = await getAssignment({ id });
      if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

      const member = await isGroupMember(req.user.id, row.group_id);
      if (!member) return res.status(403).json({ error: 'FORBIDDEN' });

      return res.status(200).json({ ok: true, assignment: row });
    } catch (e) {
      console.error('[assignments] get fail:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

module.exports = { assignmentsRouter };
