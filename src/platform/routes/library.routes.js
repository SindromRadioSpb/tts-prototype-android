'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { requireGroupMemberFrom, isGroupMember } = require('../middleware/requireGroupMember');
const { createText, listTexts, getText } = require('../services/library.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

function libraryRouter() {
  const router = express.Router();

  // POST /api/library/texts (teacher)
  router.post(
    '/texts',
    requireAuth,
    requireRole('teacher'),
    requireGroupMemberFrom((req) => req.body && req.body.groupId),
    async (req, res) => {
      try {
        const { groupId, title, source, payload } = req.body || {};

        if (!isUuid(groupId)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId must be uuid' });
        if (typeof title !== 'string' || !title.trim()) {
          return res.status(400).json({ error: 'BAD_REQUEST', message: 'title is required' });
        }

        const payloadJson =
          typeof payload === 'string'
            ? { raw: payload }
            : (payload && typeof payload === 'object' ? payload : {});

        const row = await createText({
          groupId,
          createdBy: req.user.id,
          title: title.trim(),
          source: typeof source === 'string' && source.trim() ? source.trim() : null,
          payloadJson
        });

        return res.status(201).json({ ok: true, text: row });
      } catch (e) {
        console.error('[library] create fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  // GET /api/library/texts?groupId=...
  router.get(
    '/texts',
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

        const rows = await listTexts({ groupId, limit, offset });
        return res.status(200).json({ ok: true, texts: rows, limit, offset });
      } catch (e) {
        console.error('[library] list fail:', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    }
  );

  // GET /api/library/texts/:id
  router.get('/texts/:id', requireAuth, async (req, res) => {
    try {
      const id = req.params && req.params.id;
      if (!isUuid(id)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'id must be uuid' });

      const row = await getText({ id });
      if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

      const member = await isGroupMember(req.user.id, row.group_id);
      if (!member) return res.status(403).json({ error: 'FORBIDDEN' });

      return res.status(200).json({ ok: true, text: row });
    } catch (e) {
      console.error('[library] get fail:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

module.exports = { libraryRouter };
