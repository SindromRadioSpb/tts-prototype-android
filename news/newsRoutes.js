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

function mountNewsRoutes(app, { repo, editorAuth, resolveUser, audit = () => {}, readLimiter, writeLimiter, packLimitPerHour = 20, harvester = null, offload = null }) {
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
  // «Обзор дня» (§17): all of a day's articles by story — titles, first paragraphs, links to originals.
  app.get('/api/news/overview', read, async (req, res) => {
    try {
      const o = await repo.getOverview(req.query.day ? String(req.query.day) : null);
      res.set('Cache-Control', 'public, max-age=60');
      return o ? res.json({ ok: true, overview: o }) : res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
    } catch (e) { send(res, e); }
  });
  // Photos from the article (owner decision 2026-11-14): same-origin, so the Reading Room shows them
  // under COEP require-corp. ?v= is the content hash prefix, so a matching address is immutable.
  app.get('/api/news/images/:articleId/:name', read, async (req, res) => {
    try {
      const img = await repo.getImage(req.params.articleId, req.params.name);
      if (!img) { res.set('Cache-Control', 'no-store'); return res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' }); }
      const pinned = String(req.query.v || '') === img.sha256.slice(0, 12);
      res.set({ 'Content-Type': img.mime, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', ETag: '"' + img.sha256 + '"',
        'Cache-Control': pinned ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' });
      if (req.get('if-none-match') === '"' + img.sha256 + '"') return res.status(304).end();
      res.send(Buffer.from(img.bytes));
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
    // ?soft=1: the News tab asks "may this viewer manage articles?" — a plain reader gets 200 {kind:null}.
    if (req.query.soft === '1') {
      const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
      if (auth && auth.user && String(auth.user.role || '').toLowerCase() === 'owner') return res.json({ ok: true, kind: 'owner', label: null, csrf: auth.session && auth.session.csrf || null });
      const editor = await editorAuth.resolve(req).catch(() => null);
      if (editor) return res.json({ ok: true, kind: 'editor', label: editor.label, csrf: editor.via === 'cookie' ? editor.csrf : null });
      return res.json({ ok: true, kind: null });
    }
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
  // «В архив» / «Вернуть в ленту» / «Удалить» (30-day trash) / «Восстановить» — owner or editor.
  for (const [action, method, auditName] of [['archive', 'archiveArticle', 'news_article_archived'], ['unarchive', 'unarchiveArticle', 'news_article_unarchived'],
    ['delete', 'deleteArticle', 'news_article_deleted'], ['restore', 'restoreArticle', 'news_article_restored']]) {
    app.post('/api/news/editor/articles/:id/' + action, write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const r = await repo[method](actor, req.params.id, req.body && req.body.reason);
        audit(auditName, actor.id, { article_id: r.article_id }, req.ip);
        res.json({ ok: true, ...r });
      } catch (e) { send(res, e); }
    });
  }
  app.get('/api/news/editor/articles', read, noStore, async (req, res) => {
    const actor = await actorFor(req, res); if (!actor) return;
    const q = req.query;
    try {
      res.json({ ok: true, ...(await repo.listForEditor({ view: String(q.view || 'feed'), outlet_id: q.outlet ? String(q.outlet) : undefined,
        q: q.q ? String(q.q) : undefined, cursor: q.cursor ? String(q.cursor) : undefined, limit: q.limit })) });
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
  // Offloading archived days to the owner's PC and back (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11). Owner only.
  if (offload) {
    const sendOff = (res, e) => e && e.code && e.status ? res.status(e.status).json({ ok: false, error: e.code }) : send(res, e);
    app.get('/api/news/editor/storage', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { ownerOnly: true }); if (!actor) return;
      try { res.json({ ok: true, ...(await offload.storage()) }); } catch (e) { sendOff(res, e); }
    });
    app.get('/api/news/editor/offload/:day(\\d{4}-\\d{2}-\\d{2})', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { ownerOnly: true }); if (!actor) return;
      try {
        const x = await offload.exportDay(req.params.day);
        res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + x.name + '"', 'X-Pack-Sha256': x.sha256,
          'Access-Control-Expose-Headers': 'X-Pack-Sha256', 'X-Content-Type-Options': 'nosniff' });
        res.send(x.buf);
      } catch (e) { sendOff(res, e); }
    });
    app.post('/api/news/editor/offload/:day(\\d{4}-\\d{2}-\\d{2})/release', write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
      try { const r = await offload.release(req.params.day, req.body && req.body.sha256); audit('news_offload_release', actor.id, r, req.ip); res.json({ ok: true, ...r }); } catch (e) { sendOff(res, e); }
    });
    // The owner is checked before the body is read: nobody else can make the server hold a large upload.
    const ownerFirst = async (req, res, next) => { const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return; req.newsActor = actor; next(); };
    app.post('/api/news/editor/offload/restore', write, ownerFirst, express.raw({ type: 'application/zip', limit: '120mb' }), noStore, async (req, res) => {
      const actor = req.newsActor;
      try { const r = await offload.restore(actor, req.body); audit('news_offload_restore', actor.id, r, req.ip); res.json({ ok: true, ...r }); } catch (e) { sendOff(res, e); }
    });
  }
  // The daily harvester (§16): archives of fresh articles one-to-one for dot. Owner or editor.
  if (harvester) {
    app.get('/api/news/editor/harvests', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res); if (!actor) return;
      try { res.json({ ok: true, running: harvester.isRunning(), runs: await harvester.listRuns(req.query.limit), pending: harvester.pending ? await harvester.pending() : null }); } catch (e) { send(res, e); }
    });
    app.post('/api/news/editor/harvests/run', write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
      if (harvester.isRunning()) return res.status(409).json({ ok: false, error: 'HARVEST_RUNNING' });
      const done = harvester.runOnce({ trigger: 'manual' });
      done.then(r => audit('news_harvest_run', actor.id, { run_id: r.run_id, articles: r.articles }, req.ip)).catch(e => { try { console.warn('[news-harvest]', e && e.message); } catch (_) {} });
      res.status(202).json({ ok: true, started: true });
    });
    // Editions (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.9): dot asks for the next one.
    {
      app.get('/api/news/editor/editions', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try { res.json({ ok: true, editions: await harvester.listEditions(req.query.limit) }); } catch (e) { send(res, e); }
      });
      app.get('/api/news/editor/editions/next', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try { res.json({ ok: true, edition: await harvester.nextEdition() }); } catch (e) { send(res, e); }
      });
      app.get('/api/news/editor/editions/:id/download', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try {
          // Only dot's download (an editor key) leases the edition; the owner's is a look.
          const file = await harvester.downloadEdition(req.params.id, { lease: actor.kind !== 'owner' });
          if (!file) return res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
          res.set({ 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
          res.download(file.path, file.name);
        } catch (e) { send(res, e); }
      });
      // dot's own choice (spec §5.6): drafts of up to `extras` articles per edition, made by the server.
      const EXTRAS_STATUS = { EXTRAS_LIMIT: 409, ALREADY_TAKEN: 409, PAYWALL: 409, NO_BODY: 409, EDITION_NOT_OPEN: 409, UNKNOWN_ITEM: 404, NOTE_REQUIRED: 400, DUPLICATE_ITEM: 400 };
      app.post('/api/news/editor/editions/:id/extras', write, json, noStore, async (req, res) => {
        const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
        try {
          const r = await harvester.orderExtras(req.params.id, req.body && req.body.items);
          audit('news_extras', actor.id, { edition_id: req.params.id, items: (r.items || []).map(i => i.item_key) }, req.ip);
          res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + r.name + '"', 'X-Content-Type-Options': 'nosniff' });
          res.send(r.buffer);
        } catch (e) { if (e && EXTRAS_STATUS[e.code]) return res.status(EXTRAS_STATUS[e.code]).json({ ok: false, error: e.code }); send(res, e); }
      });
      // The owner's interests for dot (spec §5.7): the owner writes, an editor (dot) reads.
      app.get('/api/news/editor/interests', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try { res.json({ ok: true, ...(await harvester.interestsRow()) }); } catch (e) { send(res, e); }
      });
      app.put('/api/news/editor/interests', write, json, noStore, async (req, res) => {
        const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
        try { res.json({ ok: true, ...(await harvester.saveInterests(req.body && req.body.text)) }); }
        catch (e) { if (e && e.code === 'INTERESTS_TOO_LONG') return res.status(400).json({ ok: false, error: e.code }); send(res, e); }
      });
      // The reading signal: recorded only for the owner; anyone else gets the same 204 and nothing is stored.
      app.post('/api/news/read', write, json, noStore, async (req, res) => {
        try {
          const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
          const owner = auth && auth.user && String(auth.user.role || '').toLowerCase() === 'owner';
          if (owner && req.body) await harvester.recordRead(String(req.body.work_id || ''), String(req.body.event || '')).catch(() => false);
        } catch (_) {}
        res.status(204).end();
      });
      app.get('/api/news/editor/schedule', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try { res.json({ ok: true, schedule: await harvester.loadSchedule() }); } catch (e) { send(res, e); }
      });
      app.put('/api/news/editor/schedule', write, json, noStore, async (req, res) => {
        const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
        try {
          const schedule = await harvester.saveSchedule(req.body && req.body.schedule ? req.body.schedule : req.body);
          audit('news_schedule', actor.id, { schedule }, req.ip);
          res.json({ ok: true, schedule });
        } catch (e) { if (e && e.code === 'SCHEDULE_INVALID') return res.status(400).json({ ok: false, error: 'SCHEDULE_INVALID' }); send(res, e); }
      });
      app.get('/api/news/status', read, noStore, async (req, res) => {
        try { res.json({ ok: true, ...(await harvester.status()) }); } catch (e) { send(res, e); }
      });
    }
    app.get('/api/news/editor/harvests/:id/download', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res); if (!actor) return;
      try {
        const file = await harvester.runFile(req.params.id, { lease: actor.kind !== 'owner' });
        if (!file) return res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
        res.set({ 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
        res.download(file.path, file.name);
      } catch (e) { send(res, e); }
    });
  }
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
