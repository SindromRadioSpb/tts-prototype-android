'use strict';
// The owner's orders for dot (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.7, §7.2, §7.4):
// «make this article a study material». One row per article; a tag order over a day range expands into its
// articles (≤ 50, all or nothing). dot takes an order with its own key (the server builds the draft from the
// kept full text, harvester.orderForOwner), fails it with a reason, or the order closes itself when the
// article is published. Nothing is dropped silently: skipped articles come back with their reasons.
const crypto = require('node:crypto');
const { hasBody } = require('./harvest/newsBody');

const dbGet = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

const MAX_TAG_ORDER = 50;
const ARTICLE = /^na_[0-9a-f]{24}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
class OrderError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }

function createOwnerOrders({ db, now = () => Date.now(), marks = null } = {}) {
  const iso = () => new Date(now()).toISOString();
  const noteOf = n => { const s = String(n || '').trim(); if (!s || s.length > 200) throw new OrderError('NOTE_REQUIRED'); return s; };

  // Why an article cannot be ordered, or null.
  async function blocker(itemKey) {
    if (!ARTICLE.test(itemKey)) return 'UNKNOWN_ITEM';
    const ix = await dbGet(db, 'SELECT kind FROM news_index WHERE item_key=?', [itemKey]);
    if (ix && ix.kind === 'learn') return 'ALREADY_LEARNING';
    if (await dbGet(db, "SELECT 1 FROM news_owner_orders WHERE item_key=? AND status IN ('open','taken')", [itemKey])) return 'ALREADY_ORDERED';
    const row = await dbGet(db, "SELECT * FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' ORDER BY first_seen_at LIMIT 1", [itemKey, itemKey]);
    if (!row) return ix ? 'NO_FULL_TEXT' : 'UNKNOWN_ITEM';
    if (!hasBody(row)) return 'SOURCES_EXPIRED';
    if (!row.full_ok || row.paywalled) return 'NO_FULL_TEXT';
    // An edition holds it (drafted, leased): it will come through the edition (review W5 I2). Dropped ones can be ordered.
    if (row.main_state === 'drafted' || row.main_state === 'published' || (row.lease_until && row.lease_until > iso())) return 'IN_EDITION';
    return null;
  }
  async function insert(actor, itemKey, note, extra = {}) {
    const row = await dbGet(db, "SELECT edition_id FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' ORDER BY first_seen_at LIMIT 1", [itemKey, itemKey]);
    const o = { order_id: 'noo_' + crypto.randomBytes(12).toString('hex'), item_key: itemKey, tag: extra.tag || null, day_from: extra.from || null, day_to: extra.to || null,
      note_ru: note, status: 'open', edition_id: row && row.edition_id || null, created_by: String(actor.id), created_at: iso(), updated_at: iso() };
    await dbRun(db, `INSERT INTO news_owner_orders(order_id, item_key, tag, day_from, day_to, note_ru, status, edition_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [o.order_id, o.item_key, o.tag, o.day_from, o.day_to, o.note_ru, o.status, o.edition_id, o.created_by, o.created_at, o.updated_at]);
    return o;
  }

  async function orderArticle(actor, { item_key, note_ru } = {}) {
    const note = noteOf(note_ru), key = String(item_key || '');
    const why = await blocker(key);
    if (why) return { created: [], skipped: [{ item_key: key, reason: why }] };
    return { created: [await insert(actor, key, note)], skipped: [] };
  }
  async function orderTag(actor, { tag, from, to, note_ru } = {}) {
    const note = noteOf(note_ru);
    if (!marks || !tag || (from && !DAY.test(from)) || (to && !DAY.test(to))) throw new OrderError('NEWS_PARAM_INVALID');
    const tagged = (await marks.keysWith(String(actor.id), String(tag))).filter(k => ARTICLE.test(k));
    const keys = [];
    for (let i = 0; i < tagged.length; i += 400) {
      const part = tagged.slice(i, i + 400);
      const rows = await dbAll(db, `SELECT item_key FROM news_index WHERE item_key IN (${part.map(() => '?').join(',')})${from ? ' AND day >= ?' : ''}${to ? ' AND day <= ?' : ''} ORDER BY day, item_key`,
        [...part, ...(from ? [from] : []), ...(to ? [to] : [])]);
      keys.push(...rows.map(r => r.item_key));
    }
    if (keys.length > MAX_TAG_ORDER) throw new OrderError('ORDER_TOO_BIG');
    const created = [], skipped = [];
    for (const k of keys) {
      const why = await blocker(k);
      if (why) skipped.push({ item_key: k, reason: why }); else created.push(await insert(actor, k, note, { tag: String(tag), from, to }));
    }
    return { created, skipped };
  }

  const get = id => dbGet(db, 'SELECT * FROM news_owner_orders WHERE order_id=?', [String(id || '')]);
  const list = ({ status } = {}) => status
    ? dbAll(db, 'SELECT * FROM news_owner_orders WHERE status=? ORDER BY created_at, order_id LIMIT 500', [status])
    : dbAll(db, 'SELECT * FROM news_owner_orders ORDER BY created_at DESC, order_id LIMIT 500');
  async function take(editor, orderId) {
    const o = await get(orderId);
    if (!o) throw new OrderError('ORDER_UNKNOWN', 404);
    if (o.status !== 'open' && o.status !== 'taken') throw new OrderError('ORDER_CLOSED', 409);
    await dbRun(db, "UPDATE news_owner_orders SET status='taken', attempts=attempts+1, reason=NULL, updated_at=? WHERE order_id=?", [iso(), o.order_id]);
    return get(o.order_id);
  }
  async function fail(editor, orderId, reason) {
    const o = await get(orderId);
    if (!o) throw new OrderError('ORDER_UNKNOWN', 404);
    if (o.status !== 'open' && o.status !== 'taken') throw new OrderError('ORDER_CLOSED', 409);
    const why = String(reason || '').trim().slice(0, 200) || 'NO_REASON';
    await dbRun(db, "UPDATE news_owner_orders SET status='failed', reason=?, updated_at=? WHERE order_id=?", [why, iso(), o.order_id]);
    return get(o.order_id);
  }
  // A take that could not be built keeps the order live and says why (dot or the owner sees it).
  // …and back in dot's queue as open (review W5 I1).
  const noteError = (orderId, reason) => dbRun(db, "UPDATE news_owner_orders SET status='open', reason=?, updated_at=? WHERE order_id=? AND status IN ('open','taken')", [String(reason || '').slice(0, 200), iso(), orderId]);
  const setArchiveOrder = (orderId, archiveOrderId) => dbRun(db, 'UPDATE news_owner_orders SET archive_order_id=?, updated_at=? WHERE order_id=?', [archiveOrderId, iso(), orderId]);
  // A published article closes its live order (called after every accepted pack).
  async function onPublished(articleIds) {
    let n = 0;
    for (const id of new Set((articleIds || []).filter(k => ARTICLE.test(String(k))))) {
      const w = await dbGet(db, 'SELECT work_id FROM news_works WHERE article_id=? AND position_no=1', [id]).catch(() => null);
      const r = await dbRun(db, "UPDATE news_owner_orders SET status='done', reason=NULL, work_id=?, updated_at=? WHERE item_key=? AND status IN ('open','taken')", [w ? w.work_id : null, iso(), id]);
      n += r.changes;
    }
    return n;
  }
  // Hourly: a live order whose article is already a study material closes; a take whose archive order ran out
  // without a pack goes back to the queue (review W5 I1, M6); one whose full text is gone expires. → number expired.
  async function expire() {
    let n = 0;
    for (const o of await dbAll(db, "SELECT order_id, item_key FROM news_owner_orders WHERE status IN ('open','taken')")) {
      const learn = await dbGet(db, "SELECT 1 FROM news_index WHERE item_key=? AND kind='learn'", [o.item_key]).catch(() => null);
      if (learn) await onPublished([o.item_key]);
    }
    await dbRun(db, `UPDATE news_owner_orders SET status='open', reason='TAKE_TIMED_OUT', updated_at=? WHERE status='taken' AND archive_order_id IN
      (SELECT order_id FROM news_archive_orders WHERE expires_at <= ? AND emitted_pack_id IS NULL)`, [iso(), iso()]).catch(() => {});
    for (const o of await dbAll(db, "SELECT order_id, item_key FROM news_owner_orders WHERE status IN ('open','taken')")) {
      const row = await dbGet(db, "SELECT data_json, data_gz FROM news_harvest_items WHERE (url_key=? OR canonical_key=?) AND status='ready' LIMIT 1", [o.item_key, o.item_key]);
      if (hasBody(row)) continue;
      n += (await dbRun(db, "UPDATE news_owner_orders SET status='expired', reason='SOURCES_EXPIRED', updated_at=? WHERE order_id=? AND status IN ('open','taken')", [iso(), o.order_id])).changes;
    }
    return n;
  }
  // The latest order of each article → Map item_key → { order_id, status, reason, updated_at }.
  async function forItems(keys) {
    const out = new Map(), list2 = [...new Set((keys || []).filter(k => ARTICLE.test(String(k))))];
    for (let i = 0; i < list2.length; i += 400) {
      const part = list2.slice(i, i + 400);
      for (const r of await dbAll(db, `SELECT order_id, item_key, status, reason, updated_at FROM news_owner_orders WHERE item_key IN (${part.map(() => '?').join(',')}) ORDER BY created_at, order_id`, part))
        out.set(r.item_key, { order_id: r.order_id, status: r.status, reason: r.reason, updated_at: r.updated_at });
    }
    return out;
  }
  return { orderArticle, orderTag, get, list, take, fail, noteError, setArchiveOrder, onPublished, expire, forItems };
}

module.exports = { createOwnerOrders, OrderError, MAX_TAG_ORDER };
