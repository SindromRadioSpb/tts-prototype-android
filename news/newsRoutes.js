'use strict';
// News section HTTP routes (plan Task 5). Public reads: outlets, feed, and each news work in the
// public-corpus work shape so the Reading Room opens it on its existing path. Editor routes accept
// the owner session or a news-editor key/session — and nothing else in the app accepts the latter.
const crypto = require('node:crypto');
const express = require('express');
const Outlets = require('../public/js/news-outlets');
const { NewsError, LIMITS } = require('../db/newsRepo');
const C = require('./newsPackCore');
const { validTag, validKey } = require('../db/newsMarks');
const { createDotTask, TASK_URL } = require('./newsDotTask');

const WORK_PAYLOAD_VERSION = 'news-work-v2';
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function mountNewsRoutes(app, { repo, editorAuth, resolveUser, audit = () => {}, readLimiter, writeLimiter, packLimitPerHour = 20, harvester = null, offload = null, list = null, marks = null, orders = null, dotTask = null }) {
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

  // The instruction for dot (2026-11-22): public — it holds addresses and rules, no secrets.
  const task = dotTask || createDotTask();
  app.get(TASK_URL, read, (req, res) => {
    try {
      const t = task.get(), etag = '"' + t.version + '"';
      res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' });
      if (req.get('if-none-match') === etag) return res.status(304).end();
      res.send(t.text);
    } catch (e) { send(res, e); }
  });
  app.get('/api/news/dot-task', read, (req, res) => {
    try { res.set('Cache-Control', 'no-cache'); res.json({ ok: true, task: task.meta(), text: task.get().text }); } catch (e) { send(res, e); }
  });

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
        const workId = String(req.query.work);
        // A raw original (findability W3): the card the Room needs to open it — outlet, snapshot, title.
        if (/\.rw$/.test(workId) && harvester && harvester.rawWork) {
          const w = await harvester.rawWork(null, workId).catch(() => null);
          return w ? res.json({ ok: true, card: { work_id: workId, readable: true, raw: true, tier: 'fresh', outlet_id: w.corpus.slug.slice(5), snapshot_sha256: w.item.snapshot_sha256,
            title_he: w.item.title, levels: ['OR'] } }) : res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
        }
        const card = await repo.getCard(workId);
        return card ? res.json({ ok: true, card }) : res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
      }
      const q = req.query;
      res.json({ ok: true, ...(await repo.listFeed({ outlet_id: String(q.outlet || ''), section: q.section ? String(q.section) : undefined, tier: q.tier ? String(q.tier) : 'fresh',
        q: q.q ? String(q.q) : undefined, from: q.from ? String(q.from) : undefined, to: q.to ? String(q.to) : undefined, cursor: q.cursor ? String(q.cursor) : undefined,
        limit: q.limit, no_heavy: q.no_heavy === '1' })) });
    } catch (e) { send(res, e); }
  });
  // The owner's orders for dot (findability W5): the owner (or an editor) orders, dot takes and answers.
  if (orders && harvester) {
    const ORDER_STATUS = { ORDER_TOO_BIG: 400, NOTE_REQUIRED: 400, NEWS_PARAM_INVALID: 400, ORDER_UNKNOWN: 404, ORDER_CLOSED: 409, SOURCES_EXPIRED: 410, ALREADY_TAKEN: 409,
      PAYWALL: 409, NO_BODY: 409, UNKNOWN_ITEM: 404, ARCHIVE_SOURCE_CHANGED: 409, ARCHIVE_PHOTOS_UNAVAILABLE: 409, ARCHIVE_ORDER_ACTOR: 403 };
    const orderFail = (res, e) => { const st = e && ORDER_STATUS[e.code]; if (st) return res.status(st).json({ ok: false, error: e.code }); send(res, e); };
    app.post('/api/news/orders', write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const b = req.body || {};
        const r = b.tag ? await orders.orderTag(actor, { tag: validTag(String(b.tag)), from: b.from || null, to: b.to || null, note_ru: b.note_ru })
          : await orders.orderArticle(actor, { item_key: b.item_key, note_ru: b.note_ru });
        audit('news_owner_order', actor.id, { created: r.created.length, skipped: r.skipped.length, tag: b.tag || null }, req.ip);
        res.json({ ok: true, ...r });
      } catch (e) { orderFail(res, e); }
    });
    app.get('/api/news/orders', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res); if (!actor) return;
      try { res.json({ ok: true, orders: await orders.list({}) }); } catch (e) { send(res, e); }
    });
    app.get('/api/news/editor/orders', read, noStore, async (req, res) => {
      const actor = await actorFor(req, res); if (!actor) return;
      try { res.json({ ok: true, orders: await orders.list({ status: ['open', 'taken', 'done', 'failed', 'expired'].includes(String(req.query.status)) ? String(req.query.status) : 'open' }), task: task.meta() }); } catch (e) { send(res, e); }
    });
    app.post('/api/news/editor/orders/:id/take', write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
      let o = null;
      try {
        o = await orders.take(actor, req.params.id);
        const r = await harvester.orderForOwner(o, actor);
        await orders.setArchiveOrder(o.order_id, r.order_id);
        audit('news_owner_order_take', actor.id, { order_id: o.order_id, archive_order_id: r.order_id }, req.ip);
        res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + r.name + '"', 'X-Content-Type-Options': 'nosniff' });
        res.send(r.buffer);
      } catch (e) {
        if (o && e && e.code) await orders.noteError(o.order_id, e.code).catch(() => {});
        orderFail(res, e);
      }
    });
    app.post('/api/news/editor/orders/:id/fail', write, json, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
      try { res.json({ ok: true, order: await orders.fail(actor, req.params.id, (req.body || {}).reason) }); } catch (e) { orderFail(res, e); }
    });
  }
  // Any signed-in reader (W4: tags, ★, reads) → { id, kind:'owner'|'user', csrf } or null.
  async function userOf(req) {
    const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
    if (!auth || !auth.user || auth.user.id == null) return null;
    return { id: String(auth.user.id), kind: String(auth.user.role || '').toLowerCase() === 'owner' ? 'owner' : 'user', csrf: auth.session && auth.session.csrf || '' };
  }
  if (marks) {
    const markRoute = method => app[method]('/api/news/marks', write, json, noStore, async (req, res) => {
      try {
        const user = await userOf(req);
        if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
        if (!safeEqual(req.get('x-lp-csrf') || '', user.csrf)) return res.status(403).json({ ok: false, error: 'BAD_CSRF' });
        const key = String((req.body || {}).item_key || ''), tag = validTag(String((req.body || {}).tag || ''));
        if (!validKey(key) || !tag) return res.status(400).json({ ok: false, error: 'NEWS_PARAM_INVALID' });
        await (method === 'put' ? marks.mark(user, key, tag) : marks.unmark(user, key, tag));
        res.json({ ok: true, item_key: key, marks: (await marks.marksFor(user.id, [key])).get(key) || [] });
      } catch (e) { if (e && e.code === 'NEWS_MARKS_LIMIT') return res.status(409).json({ ok: false, error: e.code }); send(res, e); }
    });
    markRoute('put'); markRoute('delete');
    // Without the harvester (tests, a reduced mount) «прочитано» still has its route; with it the shared one below handles both.
    if (!harvester) app.post('/api/news/read', write, json, noStore, async (req, res) => {
      const user = await userOf(req).catch(() => null);
      if (user && req.body && req.body.item_key) await marks.read(user.id, String(req.body.item_key)).catch(() => false);
      res.status(204).end();
    });
    app.get('/api/news/tags', read, noStore, async (req, res) => {
      try {
        const user = await userOf(req);
        if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
        res.json({ ok: true, tags: await marks.tags(user.id) });
      } catch (e) { send(res, e); }
    });
  }
  // One feed for the day overview and every outlet (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.2).
  const LIST_DAY = /^\d{4}-\d{2}-\d{2}$/, LIST_ENUMS = { kind: ['learn', 'slice', 'all'], sort: ['fresh', 'time', 'match'],
    group: ['politics', 'security', 'society', 'economy', 'world', 'culture', 'opinion'], edition: ['morning', 'midday', 'evening', 'late', 'extra'] };
  function listParams(q) {
    const p = {}, bad = detail => { throw new NewsError('NEWS_PARAM_INVALID', 400, detail); };
    for (const k of ['day', 'from', 'to']) if (q[k] != null && q[k] !== '') { if (!LIST_DAY.test(String(q[k]))) bad(k); p[k] = String(q[k]); }
    if (p.from && p.to && p.from > p.to) bad('range');
    if (q.outlet) { if (!Outlets.byId(String(q.outlet))) bad('outlet'); p.outlet = String(q.outlet); }
    if (q.section) { if (!C.SECTIONS.includes(String(q.section))) bad('section'); p.section = String(q.section); }
    for (const k of Object.keys(LIST_ENUMS)) if (q[k]) { if (!LIST_ENUMS[k].includes(String(q[k]))) bad(k); p[k] = String(q[k]); }
    if (q.story) { if (String(q.story).length > 120) bad('story'); p.story = String(q.story); }
    if (q.q) { if (String(q.q).length > 200) bad('q'); p.q = String(q.q); }
    if (q.cursor) { if (String(q.cursor).length > 200) bad('cursor'); p.cursor = String(q.cursor); }
    // W4: a visitor without an account filters by the keys kept in the browser (≤150).
    // An empty keys= is a filter too: a visitor with no matching marks sees nothing, not everything (review W4 I1).
    if (q.keys !== undefined) { const raw = String(q.keys).split(',').filter(Boolean); if (raw.length > 150) bad('keys'); p.keys = raw.filter(k => /^na_[0-9a-f]{24}$/.test(k)); }
    if (q.star === '1') p.star = true;
    if (q.tag) { const tag = validTag(String(q.tag)); if (!tag) bad('tag'); p.tag = tag; }
    return p;
  }
  if (list) app.get('/api/news/list', read, async (req, res) => {
    try {
      const p = listParams(req.query);
      // W4: a signed-in reader gets their tags, ★ and reads on the rows and can filter by them.
      const user = marks && (p.tag || p.star || req.headers.cookie) ? await userOf(req) : null;
      if ((p.tag || p.star) && !user) throw new NewsError('NEWS_PARAM_INVALID', 400, 'tag');
      if (user && (p.tag || p.star)) {
        const own = await marks.keysWith(user.id, p.star ? '★' : p.tag);
        const tagged = p.star && p.tag ? new Set(await marks.keysWith(user.id, p.tag)) : null;
        p.keys = (p.keys ? p.keys.filter(k => own.includes(k)) : own).filter(k => !tagged || tagged.has(k));
      }
      delete p.tag; delete p.star;
      const out = await list.list(p);
      if (user) {
        const keys = out.items.map(i => i.item_key), m = await marks.marksFor(user.id, keys), r = await marks.readSet(user.id, keys);
        const ord = orders && user.kind === 'owner' ? await orders.forItems(keys) : null;
        for (const i of out.items) { i.marks = m.get(i.item_key) || []; if (r.has(i.item_key)) i.read = true; if (ord && ord.get(i.item_key)) i.order = ord.get(i.item_key); }
      }
      res.set('Cache-Control', out.building || user ? 'private, no-store' : 'public, max-age=30');
      res.json({ ok: true, ...out });
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
      // A study article's stored photo, or the cached photo of a raw original (findability W3).
      const img = (await repo.getImage(req.params.articleId, req.params.name)) || (harvester && harvester.rawImage ? await harvester.rawImage(req.params.articleId, req.params.name) : null)
        // The owner's mark keeps a study article's photos after news_images is cleared (review W4 I2).
        || (marks && marks.pinImage ? await marks.pinImage(req.params.articleId, req.params.name) : null);
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
      const work = /\.rw$/.test(req.params.workId) && harvester && harvester.rawWork ? await harvester.rawWork(req.params.outlet, req.params.workId) : await repo.getWork(req.params.outlet, req.params.workId);
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
    // A POST with CSRF: building the archive records its hash (a cross-site GET must not change that).
    app.post('/api/news/editor/offload/:day(\\d{4}-\\d{2}-\\d{2})', write, noStore, async (req, res) => {
      const actor = await actorFor(req, res, { mutating: true, ownerOnly: true }); if (!actor) return;
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
        // The owner's open orders come first for dot (findability W5, dotTask «Часть 0»).
        // `task`: the current instruction's version — dot re-reads it when the version changes.
        try { res.json({ ok: true, edition: await harvester.nextEdition(), ...(orders ? { orders: await orders.list({ status: 'open' }) } : {}), task: task.meta() }); } catch (e) { send(res, e); }
      });
      app.get('/api/news/editor/editions/:id/download', read, noStore, async (req, res) => {
        const actor = await actorFor(req, res); if (!actor) return;
        try {
          // Only dot's download (an editor key) leases the edition; the owner's is a look.
          const file = await harvester.downloadEdition(req.params.id, { lease: actor.kind !== 'owner' || req.query.take === '1' }); // ?take=1: the owner passes it to dot
          if (!file) return res.status(404).json({ ok: false, error: 'NEWS_NOT_FOUND' });
          res.set({ 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
          res.download(file.path, file.name);
        } catch (e) { send(res, e); }
      });
      // dot's own choice (spec §5.6): drafts of up to `extras` articles per edition, made by the server.
      const EXTRAS_STATUS = { EXTRAS_LIMIT: 409, ALREADY_TAKEN: 409, PAYWALL: 409, NO_BODY: 409, EDITION_NOT_OPEN: 409, UNKNOWN_ITEM: 404, NOTE_REQUIRED: 400, DUPLICATE_ITEM: 400, NOT_A_CANDIDATE: 409, ORDER_TOO_LARGE: 400 };
      app.post('/api/news/editor/editions/:id/extras', write, json, noStore, async (req, res) => {
        const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
        try {
          const r = await harvester.orderExtras(req.params.id, req.body && req.body.items);
          audit('news_extras', actor.id, { edition_id: req.params.id, items: (r.items || []).map(i => i.item_key) }, req.ip);
          res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + r.name + '"', 'X-Content-Type-Options': 'nosniff' });
          res.send(r.buffer);
        } catch (e) { if (e && EXTRAS_STATUS[e.code]) return res.status(EXTRAS_STATUS[e.code]).json({ ok: false, error: e.code }); send(res, e); }
      });
      app.post('/api/news/editor/editions/:id/archive-order', write, json, noStore, async (req, res) => {
        const actor = await actorFor(req, res, { mutating: true }); if (!actor) return;
        try {
          const r = await harvester.orderArchivedCandidate(req.params.id, req.body, actor);
          audit('news_archive_order', actor.id, { edition_id: req.params.id, order_id: r.order_id, item_key: req.body.item_key }, req.ip);
          res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + r.name + '"', 'X-Content-Type-Options': 'nosniff' });
          res.send(r.buffer);
        } catch (e) {
          const status = e && ({ ...EXTRAS_STATUS, EDITION_NOT_CLOSED: 409, SOURCES_EXPIRED: 410, ARCHIVE_SOURCE_CHANGED: 409, ARCHIVE_PHOTOS_UNAVAILABLE: 409, ARCHIVE_ORDER_ACTOR: 403 })[e.code];
          if (status) return res.status(status).json({ ok: false, error: e.code });
          send(res, e);
        }
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
          if (owner && req.body && req.body.work_id) await harvester.recordRead(String(req.body.work_id || ''), String(req.body.event || '')).catch(() => false);
          // W4: «прочитано» for every signed-in reader, by article key.
          if (marks && auth && auth.user && req.body && req.body.item_key) await marks.read(String(auth.user.id), String(req.body.item_key)).catch(() => false);
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
