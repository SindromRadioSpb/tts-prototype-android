'use strict';
// News section HTTP routes (plan Task 5). Public reads: outlets, feed, and each news work in the
// public-corpus work shape so the Reading Room opens it on its existing path. Editor routes accept
// the owner session or a news-editor key/session — and nothing else in the app accepts the latter.
const crypto = require('node:crypto');
const express = require('express');
const Outlets = require('../public/js/news-outlets');
const { NewsError, LIMITS } = require('../db/newsRepo');

const WORK_PAYLOAD_VERSION = 'news-work-v2';
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function mountNewsRoutes(app, { repo, editorAuth, resolveUser, audit = () => {}, readLimiter, writeLimiter, packLimitPerHour = 20 }) {
  const pass = (req, res, next) => next();
  const read = readLimiter || pass, write = writeLimiter || pass;
  const json = express.json({ limit: '64kb' });
  const send = (res, error) => {
    if (error instanceof NewsError) return res.status(error.status).json({ ok: false, error: error.code, detail: error.detail || null });
    try { console.warn('[news]', error); } catch (_) {}
    return res.status(500).json({ ok: false, error: 'NEWS_INTERNAL' });
  };
  const packTimes = new Map();
  function overPackLimit(actorId) {
    const now = Date.now(), list = (packTimes.get(actorId) || []).filter(t => now - t < 3600 * 1000);
    if (list.length >= packLimitPerHour) { packTimes.set(actorId, list); return true; }
    list.push(now); packTimes.set(actorId, list); return false;
  }

  // → actor {id, kind:'owner'|'editor', ...} or null after writing 401/403.
  async function actorFor(req, res, { mutating = false, ownerOnly = false } = {}) {
    const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
    if (auth && auth.user && String(auth.user.role || '').toLowerCase() === 'owner') {
      if (mutating && !safeEqual(req.get('x-lp-csrf') || '', auth.session && auth.session.csrf || '')) { res.status(403).json({ ok: false, error: 'BAD_CSRF' }); return null; }
      return { id: String(auth.user.id), kind: 'owner', via: 'owner', csrf: auth.session && auth.session.csrf || null };
    }
    const editor = await editorAuth.resolve(req).catch(() => null);
    if (!editor) { res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return null; }
    if (ownerOnly) { res.status(403).json({ ok: false, error: 'OWNER_ONLY' }); return null; }
    if (mutating && editor.via === 'cookie' && !safeEqual(req.get('x-lp-csrf') || '', editor.csrf || '')) { res.status(403).json({ ok: false, error: 'BAD_CSRF' }); return null; }
    return editor;
  }
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

  app.get('/api/news/outlets', read, async (req, res) => {
    try {
      const counts = new Map((await repo.listOutlets()).map(o => [o.outlet_id, o]));
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ ok: true, outlets: Outlets.OUTLETS.map(o => ({ outlet_id: o.id, name_he: o.name_he, name_latin: o.name_latin, color: o.color, ...counts.get(o.id) })) });
    } catch (e) { send(res, e); }
  });
  app.get('/api/news/feed', read, async (req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=30');
      if (req.query.work) {
        const card = await repo.getCard(String(req.query.work));
        return card ? res.json({ ok: true, card }) : res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
      }
      const q = req.query;
      res.json({ ok: true, ...(await repo.listFeed({ outlet_id: String(q.outlet || ''), section: q.section ? String(q.section) : undefined, tier: q.tier ? String(q.tier) : 'fresh',
        q: q.q ? String(q.q) : undefined, from: q.from ? String(q.from) : undefined, to: q.to ? String(q.to) : undefined, cursor: q.cursor ? String(q.cursor) : undefined,
        limit: q.limit, no_heavy: q.no_heavy === '1' })) });
    } catch (e) { send(res, e); }
  });
  // Must be mounted before the generic /api/public-corpora/:slug/works/:workId route.
  app.get('/api/public-corpora/news-:outlet/works/:workId', read, async (req, res) => {
    try {
      const work = await repo.getWork(req.params.outlet, req.params.workId);
      const wanted = String(req.query.snapshot || '').toLowerCase();
      if (wanted && wanted !== work.item.snapshot_sha256) { res.set('Cache-Control', 'no-store'); return res.status(409).json({ ok: false, error: 'PUBLIC_WORK_CHANGED' }); }
      // The validator carries the payload shape version: a changed response shape must never revalidate as 304.
      res.set('ETag', '"' + WORK_PAYLOAD_VERSION + '-' + work.item.snapshot_sha256 + '"');
      res.set('Cache-Control', wanted ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
      res.json({ ok: true, schema_version: 'public_corpus_work.1.0.0', ...work });
    } catch (e) {
      if (e instanceof NewsError && e.status === 404) return res.status(404).json({ ok: false, error: 'CORPUS_NOT_FOUND' });
      send(res, e);
    }
  });

  app.post('/api/news/editor/login', write, json, noStore, async (req, res) => {
    try {
      const s = await editorAuth.login(req.body && req.body.key);
      if (!s) { audit('news_editor_login_failed', null, {}, req.ip); return res.status(401).json({ ok: false, error: 'BAD_KEY' }); }
      const secure = req.secure || req.get('x-forwarded-proto') === 'https';
      res.append('Set-Cookie', `${editorAuth.COOKIE}=${encodeURIComponent(s.cookie)}; Path=/api/news/editor; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${s.max_age_sec}`);
      audit('news_editor_login', 'editor:' + s.editor_id, {}, req.ip);
      res.json({ ok: true, csrf: s.csrf, expires_at: s.expires_at, label: s.label });
    } catch (e) { send(res, e); }
  });
  app.post('/api/news/editor/logout', write, json, noStore, async (req, res) => {
    try {
      await editorAuth.logout(req);
      res.append('Set-Cookie', `${editorAuth.COOKIE}=; Path=/api/news/editor; HttpOnly; SameSite=Strict; Max-Age=0`);
      res.json({ ok: true });
    } catch (e) { send(res, e); }
  });
  app.get('/api/news/editor/me', read, noStore, async (req, res) => {
    const actor = await actorFor(req, res); if (!actor) return;
    res.json({ ok: true, kind: actor.kind, label: actor.label || null, csrf: actor.via === 'cookie' || actor.via === 'owner' ? actor.csrf : null });
  });
  // Identify the caller (and its rate budget) BEFORE buffering up to 50 MB of body.
  const packGate = async (req, res, next) => {
    const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
    if (overPackLimit(actor.id)) return res.status(429).json({ ok: false, error: 'NEWS_PACK_RATE_LIMIT' });
    req.newsActor = actor; next();
  };
  const packBody = express.raw({ type: ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'], limit: LIMITS.packBytes });
  // /api/news/packs is the path named in the format spec §9; the editor page uses /api/news/editor/packs.
  app.post(['/api/news/editor/packs', '/api/news/packs'], write, noStore, packGate, packBody, async (req, res) => {
    const actor = req.newsActor;
    try {
      const receipt = await repo.ingestPack(actor, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
      audit('news_pack_ingested', actor.id, { pack_id: receipt.pack_id, totals: receipt.totals }, req.ip);
      res.json({ ok: true, receipt });
    } catch (e) { send(res, e); }
  });
  app.get('/api/news/editor/journal', read, noStore, async (req, res) => {
    const actor = await actorFor(req, res); if (!actor) return;
    try { res.json({ ok: true, ...(await repo.journal({ limit: req.query.limit })) }); } catch (e) { send(res, e); }
  });
  app.post('/api/news/editor/articles/:id/withdraw', write, json, noStore, async (req, res) => {
    const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
    try {
      const r = await repo.withdrawArticle(actor, req.params.id, req.body && req.body.reason);
      audit('news_article_withdrawn', actor.id, { article_id: r.article_id }, req.ip);
      res.json({ ok: true, ...r });
    } catch (e) { send(res, e); }
  });
  app.post('/api/news/editor/packs/:id/withdraw', write, json, noStore, async (req, res) => {
    const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
    try {
      const r = await repo.withdrawPack(actor, req.params.id, req.body && req.body.reason);
      audit('news_pack_withdrawn', actor.id, { pack_id: req.params.id, count: r.count }, req.ip);
      res.json({ ok: true, ...r });
    } catch (e) { send(res, e); }
  });
  app.get('/api/news/editor/editors', read, noStore, async (req, res) => {
    const actor = await actorFor(req, res, { ownerOnly: true }); if (!actor) return;
    try { res.json({ ok: true, editors: await editorAuth.listEditors() }); } catch (e) { send(res, e); }
  });
  app.post('/api/news/editor/editors', write, json, noStore, async (req, res) => {
    const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
    try {
      const r = await editorAuth.createEditor(actor.id, req.body && req.body.label);
      audit('news_editor_created', actor.id, { editor_id: r.editor_id }, req.ip);
      res.json({ ok: true, ...r });
    } catch (e) { send(res, e); }
  });
  app.post('/api/news/editor/editors/:id/revoke', write, json, noStore, async (req, res) => {
    const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
    try {
      const r = await editorAuth.revokeEditor(actor.id, req.params.id);
      audit('news_editor_revoked', actor.id, { editor_id: r.editor_id }, req.ip);
      res.json({ ok: true, ...r });
    } catch (e) { send(res, e); }
  });
}
module.exports = { mountNewsRoutes };
