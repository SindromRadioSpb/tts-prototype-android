'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { requireGroupMemberFrom, isGroupMember } = require('../middleware/requireGroupMember');
const { createText, listTexts, getText } = require('../services/library.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimOrNull(v) {
  return (typeof v === 'string') ? v.trim() : null;
}

function trimOrEmpty(v) {
  return (typeof v === 'string') ? v.trim() : '';
}

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

function badRequest(res, code, message) {
  return res.status(400).json({ error: code, message });
}

function normalizeQuery(keys) {
  return (req, _res, next) => {
    if (req && req.query) {
      for (const k of keys) {
        if (typeof req.query[k] === 'string') req.query[k] = req.query[k].trim();
      }
    }
    next();
  };
}

function normalizeBody(keys) {
  return (req, _res, next) => {
    if (req && req.body) {
      for (const k of keys) {
        if (typeof req.body[k] === 'string') req.body[k] = req.body[k].trim();
      }
    }
    next();
  };
}

function parseLimitOffset(q) {
  const limitRaw = q && q.limit;
  const offsetRaw = q && q.offset;

  const limitNum = Number(limitRaw);
  const offsetNum = Number(offsetRaw);

  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, Math.trunc(limitNum))) : 50;
  const offset = Number.isFinite(offsetNum) ? Math.max(0, Math.trunc(offsetNum)) : 0;

  return { limit, offset };
}

function libraryRouter() {
  const router = express.Router();

  // POST /api/library/texts (teacher)
  router.post(
    '/texts',
    requireAuth,
    requireRole('teacher'),
    normalizeBody(['groupId', 'title', 'source']),
    requireGroupMemberFrom((req) => req.body && req.body.groupId),
    async (req, res) => {
      try {
        const { groupId, title, source, payload } = req.body || {};

        if (!isUuid(groupId)) return badRequest(res, 'INVALID_GROUP_ID', 'groupId must be uuid');
        if (typeof title !== 'string' || !title.trim()) {
          return badRequest(res, 'INVALID_TITLE', 'title is required');
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

  // GET /api/library/texts?groupId=...&limit=&offset=
  router.get(
    '/texts',
    requireAuth,
    normalizeQuery(['groupId', 'limit', 'offset']),
    requireGroupMemberFrom((req) => req.query && req.query.groupId),
    async (req, res) => {
      try {
        const { groupId } = req.query || {};
        if (!isUuid(groupId)) return badRequest(res, 'INVALID_GROUP_ID', 'groupId must be uuid');

        const { limit, offset } = parseLimitOffset(req.query);

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
      const id = trimOrEmpty(req.params && req.params.id);
      if (!isUuid(id)) return badRequest(res, 'INVALID_TEXT_ID', 'id must be uuid');

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
