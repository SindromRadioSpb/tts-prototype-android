'use strict';

const { query } = require('../db/pool');

async function isGroupMember(userId, groupId) {
  const r = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1;',
    [groupId, userId]
  );
  return r.rowCount > 0;
}

function requireGroupMemberFrom(paramSource) {
  // paramSource: (req) => groupId
  return async (req, res, next) => {
    try {
      const groupId = paramSource(req);
      if (!groupId) return res.status(400).json({ error: 'BAD_REQUEST', message: 'groupId is required' });

      const ok = await isGroupMember(req.user.id, groupId);
      if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });

      return next();
    } catch (e) {
      console.error('[requireGroupMember] fail:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  };
}

module.exports = { requireGroupMemberFrom, isGroupMember };
