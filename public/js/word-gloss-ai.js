// public/js/word-gloss-ai.js — Ф3 слоя слов: перевод слов в контексте (Gemini), Студия + Зал.
//
// Спека: docs/planning/word-layer/F3_SPEC_2026_10_11.md. Решения владельца: опция, по умолчанию ВЫКЛ
// (D2); кнопка «весь текст» + ленивый режим (звучащая строка и следующие, видимые строки);
// модель gemini-3.8-flash (≈2% вводящих в заблуждение на «Шура», ≈$0.15 за 1000 слов).
//
// Строка таблицы → { he, ru, words:[{ w, hint }] } (hint = офлайн-подпись того же слова) → сервер
// /api/word-gloss-ctx (BYOK, кэш по строке) → { glosses:[{gloss, wrong_hint}], mwe:[{from,to,gloss}] }.
// Ответ хранится локально (IndexedDB) по ключу содержимого строки; потеря локального кэша не стоит
// денег — сервер отдаёт уже оплаченную строку из своего кэша. Офлайн-слой остаётся видимым в карточке
// и показывается, если ИИ недоступен или строка отклонена (никакого тихого смешения).
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function t(key, fb) {
    try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {}
    return fb;
  }
  var USD_PER_1K_WORDS = 0.15;          // measured, gemini-3.8-flash on the Shura card (F3 spec §4)
  var BATCH = 8, CONCURRENCY = 3;       // ≤12 rows/request server-side; 8 keeps a request ≈20 s

  // ── row identity: content hash of the row DATA (vocalized words + translation) ──
  // v2 (Ф3б): the translation is the cell VALUE only. v1 hashed the cell's textContent, which on media
  // rows also carried the replay glyph «\u25B6\uFE0E» appended later by media-host — the same sentence got a
  // different key per surface/moment/device (paid again) and the glyph leaked into the prompt.
  // v1 entries already paid on this device are found by their legacy keys and copied to v2.
  var REPLAY_GLYPH = "\u25B6\uFE0E";
  function fnv(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
    return h1.toString(16) + h2.toString(16);
  }
  function normText(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function keyOf(he, ru, n) { return "r2" + fnv(he + "\u0001" + ru) + ":" + n; }
  function legacyKeys(he, ru, n) {
    var v1 = function (x) { return "r" + fnv(he + "\u0001" + x) + ":" + n; };
    return [v1(ru), v1((ru ? ru + " " : "") + REPLAY_GLYPH)];
  }
  function payloadOf(words, ru, row) {
    if (!words.length) return null;
    var he = words.map(function (x) { return x.w; }).join(" ");
    var key = keyOf(he, ru, words.length);
    var edit = parseObj(row && (row.edit_meta_json || row.edit_meta));
    var origin = row && row._lpGlossOccurrenceId || edit && edit._word_gloss_origin_id;
    var identity = row && (row._v3_sentenceId || row.id || row.stable_row_id || row.row_id || row.portable_row_id);
    identity = identity || origin;
    var storageKey = identity ? "o1:" + encodeURIComponent(String(identity)) + ":" + key : key;
    return { storageKey: storageKey, aliases: origin && origin !== identity ? ["o1:" + encodeURIComponent(String(origin)) + ":" + key] : [],
      key: key, legacy: legacyKeys(he, ru, words.length), he: he, ru: ru, words: words };
  }
  function rowSpans(tr) {
    var niq = tr.querySelectorAll('td[data-col="niqqud"] .rm-w');
    return Array.prototype.slice.call(niq.length ? niq : tr.querySelectorAll('td[data-col="he"] .rm-w'));
  }
  // the cell's value text: controls (replay \u25B6\uFE0E, TTS) and badges are not part of the translation
  function cellValue(tr, col) {
    var td = tr.querySelector('td[data-col="' + col + '"]');
    if (!td) return "";
    var c = td.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll("button, [role=button], .niqqud-derived-badge"), function (x) { x.remove(); });
    return normText(c.textContent);
  }
  function rowPayload(tr) {
    var spans = rowSpans(tr);
    // A hidden translation column does not change the saved occurrence's key.
    // Hosts bind the current canonical row before applying the word layer.
    var row = tr.__lpLearningRow;
    var ru = tr.querySelector('td[data-col="ru"]') ? cellValue(tr, 'ru') : normText(row && (row.ru != null ? row.ru : row.russian));
    var paintedWords = spans.map(function (sp) {
      return { w: sp.getAttribute("data-niqqud") || sp.textContent || "", surface: sp.getAttribute("data-surface") || "", hint: "" };
    });
    var p = payloadOf(paintedWords, ru, row);
    // A source-only view can paint unpointed spans while the bound row carries
    // the publication's derived pointing. Use that same canonical key as import
    // only when every rendered token is unpointed and matches the row's tokens.
    // A changed translation, spelling or explicitly painted reading stays distinct.
    var unpointed = paintedWords.length && paintedWords.every(function (word) { return !/[\u0591-\u05c7]/.test(word.w); });
    var canonical = unpointed && row && rowPayloadFromData(row), RM = window.ReaderMorph;
    if (canonical && RM && ru === canonical.ru && canonical.words.length === paintedWords.length
      && paintedWords.every(function (word, i) {
        return RM.stripNiqqud(word.w) === RM.stripNiqqud(canonical.words[i].w);
      })) p = canonical;
    if (!p) return null;
    if (tr.getAttribute('data-wg-ai-key') !== p.key) tr.setAttribute('data-wg-ai-key', p.key);
    if (tr.getAttribute('data-wg-occurrence-key') !== p.storageKey) tr.setAttribute('data-wg-occurrence-key', p.storageKey);
    p.spans = spans;
    return p;
  }
  function parseObj(v) { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(String(v)); } catch (_) { return null; } }
  // Same identity from a stored row (sentences / bundle / text-card / task table row). A machine-vocalized
  // row may travel with an empty he_niqqud and its value in meta.niqqud_derived (text-card R9 rule).
  function rowPayloadFromData(row) {
    var RM = window.ReaderMorph;
    if (!row || !RM || typeof RM.words !== "function") return null;
    var niq = String(row.he_niqqud || row.hebrew_niqqud || "").trim();
    if (!niq) { var m = parseObj(row.meta_json) || parseObj(row.meta); niq = String(m && m.niqqud_derived && m.niqqud_derived.value || "").trim(); }
    var words = niq
      ? RM.words(niq).map(function (w) { return { w: w, surface: RM.stripNiqqud(w), hint: "" }; })
      : RM.words(String(row.he || row.he_plain || row.hebrew_plain || "")).map(function (w) { return { w: w, surface: w, hint: "" }; });
    return payloadOf(words, normText(row.ru != null ? row.ru : row.russian), row);
  }

  // Hosts pass their current row model, never a row index from a previous material.
  // Unsaved rows receive a session-only ID; stored/portable rows retain their durable identity.
  var draftSets = new WeakMap(), temporaryNo = 0;
  var sessionId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  function bindRows(mount, rows) {
    if (!mount || !Array.isArray(rows)) return;
    var draftIds = [];
    if (rows.some(function (row) { return row && !(row._v3_sentenceId || row.id || row.stable_row_id || row.row_id || row.portable_row_id); })) {
      var signature = rows.map(function (row) { var p = rowPayloadFromData(row); return p ? p.key : ""; }).join("|");
      var sets = draftSets.get(mount); if (!sets) { sets = new Map(); draftSets.set(mount, sets); }
      if (!sets.has(signature)) { if (sets.size >= 16) sets.delete(sets.keys().next().value); sets.set(signature, []); }
      draftIds = sets.get(signature);
    }
    Array.prototype.forEach.call(mount.querySelectorAll("#proTable tbody tr"), function (tr) {
      var i = Number(tr.getAttribute("data-row-idx")), row = rows[i];
      if (!row) { delete tr.__lpLearningRow; return; }
      if (!(row._v3_sentenceId || row.id || row.stable_row_id || row.row_id || row.portable_row_id)) {
        var edit = parseObj(row.edit_meta_json || row.edit_meta);
        var id = row._lpGlossOccurrenceId || edit && edit._word_gloss_origin_id || draftIds[i] || "draft:" + sessionId + ":" + (++temporaryNo);
        row._lpGlossOccurrenceId = id; draftIds[i] = id;
      }
      tr.__lpLearningRow = row;
      tr.removeAttribute("data-wg-ai-key"); tr.removeAttribute("data-wg-occurrence-key");
    });
  }

  // ── storage: memory + IndexedDB (per device; the server cache is the paid source of truth) ──
  var mem = new Map(), _db = null;
  function idb() {
    if (_db) return _db;
    _db = new Promise(function (resolve) {
      try {
        var rq = indexedDB.open("lp-word-gloss-ai", 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore("rows"); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
    return _db;
  }
  async function idbGet(keys) {
    var db = await idb(); if (!db) return {};
    return new Promise(function (resolve) {
      var out = {}, tx; try { tx = db.transaction("rows", "readonly"); } catch (_) { resolve(out); return; }
      var st = tx.objectStore("rows");
      keys.forEach(function (k) { var r = st.get(k); r.onsuccess = function () { if (r.result) out[k] = r.result; }; });
      tx.oncomplete = function () { resolve(out); }; tx.onerror = function () { resolve(out); };
    });
  }
  async function idbPut(entries) {
    var db = await idb(); if (!db || !entries.length) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction("rows", "readwrite"), st = tx.objectStore("rows");
        entries.forEach(function (e) { st.put(e[1], e[0]); });
        tx.oncomplete = function () { resolve(); }; tx.onerror = function () { resolve(); }; tx.onabort = function () { resolve(); };
      } catch (_) { resolve(); }
    });
  }
  async function hydratePayloads(ps) {
    var need = [];
    ps.forEach(function (p) { if (p && !mem.has(p.storageKey)) { need.push(p.storageKey, p.key); p.aliases.concat(p.legacy).forEach(function (k) { need.push(k); }); } });
    if (!need.length) return;
    var got = await idbGet(need), migrate = [];
    ps.forEach(function (p) {
      if (!p || mem.has(p.storageKey)) return;
      if (got[p.storageKey] && validEntry(got[p.storageKey], p.words.length)) { mem.set(p.storageKey, got[p.storageKey]); return; }
      for (var a = 0; a < p.aliases.length; a++) {
        var own = mem.get(p.aliases[a]) || got[p.aliases[a]];
        if (own && validEntry(own, p.words.length)) { mem.set(p.storageKey, own); migrate.push([p.storageKey, own]); return; }
      }
      var common = mem.get(p.key) || got[p.key];
      if (common && validEntry(common, p.words.length)) {
        var carried = Object.assign({}, common, { shared: p.storageKey !== p.key });
        mem.set(p.storageKey, carried); migrate.push([p.storageKey, carried]); return;
      }
      for (var i = 0; i < p.legacy.length; i++) {
        var v = got[p.legacy[i]];
        if (v && validEntry(v, p.words.length)) { var carried = Object.assign({}, v, { shared: p.storageKey !== p.key }); mem.set(p.storageKey, carried); migrate.push([p.storageKey, carried]); return; }
      }
    });
    await idbPut(migrate);
  }
  async function hydrate(trs) {
    await hydratePayloads(trs.map(function (tr) { return rowPayload(tr) || (tr.__lpLearningRow ? rowPayloadFromData(tr.__lpLearningRow) : null); }));
  }

  function lookup(tr) {
    var k = tr && tr.getAttribute("data-wg-occurrence-key");
    if (!k) { var p = tr ? rowPayload(tr) : null; k = p && p.storageKey; }
    return k ? mem.get(k) || null : null;
  }
  // { gloss, mwe } for the k-th word of a row, or null
  function wordAt(tr, k) {
    var r = lookup(tr);
    if (!r || !r.glosses || !r.glosses[k]) return null;
    var m = (r.mwe || []).filter(function (x) { return k >= x.from && k <= x.to; })[0] || null;
    var g = r.glosses[k];
    return { gloss: g.gloss, wrongHint: !!g.wrong_hint && !g.manual, mwe: m ? m.gloss : "", manual: !!g.manual, aiGloss: g.manual ? String(g.ai_gloss || "") : g.gloss, model: r.model || "", shared: !!r.shared, imported: !!r.imported };
  }
  // Ф4 «Словарь» — the same occurrence gloss read from a stored row (no table on screen).
  async function wordAtData(row, k) {
    var p = rowPayloadFromData(row);
    if (!p) return null;
    await hydratePayloads([p]);
    var r = mem.get(p.storageKey);
    if (!r || !r.glosses || !r.glosses[k]) return null;
    var m = (r.mwe || []).filter(function (x) { return k >= x.from && k <= x.to; })[0] || null;
    var g = r.glosses[k];
    return { gloss: g.gloss, manual: !!g.manual, mwe: m ? m.gloss : "", aiGloss: g.manual ? String(g.ai_gloss || "") : g.gloss };
  }
  // Ф3в — a learner/owner correction of ONE occurrence (row + word). It is locked: no later request,
  // import or publication overwrites it; the original AI gloss is kept so the correction can be undone.
  // text = "" / null reverts to the AI gloss.
  async function setOccurrenceGloss(tr, k, text) {
    var p = tr ? rowPayload(tr) : null;
    if (!p) return false;
    await hydratePayloads([p]);
    var v = mem.get(p.storageKey);
    if (!v || !v.glosses || !v.glosses[k]) return false;
    var g = v.glosses[k], val = String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, MAX_GLOSS);
    var next = Object.assign({}, v, { glosses: v.glosses.slice() });
    if (val) next.glosses[k] = { gloss: val, wrong_hint: false, manual: true, ai_gloss: g.manual ? String(g.ai_gloss || "") : g.gloss, ai_wrong_hint: g.manual ? !!g.ai_wrong_hint : !!g.wrong_hint, at: Date.now() };
    else if (g.manual) next.glosses[k] = { gloss: String(g.ai_gloss || ""), wrong_hint: !!g.ai_wrong_hint };
    else return true;
    mem.set(p.storageKey, next);
    await idbPut([[p.storageKey, next]]);
    paintRow(tr);
    return true;
  }

  // ── network: batches of rows, a few in parallel; honest per-row outcome ──
  function geminiKey() {
    try { if (typeof window.geminiKeyGet === "function") return String(window.geminiKeyGet() || "").trim(); } catch (_) {}
    try { return String(localStorage.getItem("v3.geminiApiKey") || "").trim(); } catch (_) { return ""; }
  }
  async function hintsFor(p) {
    if (!window.WordGloss || !window.WordGloss.glossFor) return;
    for (var i = 0; i < p.words.length; i++) {
      var x = p.words[i];
      try { var g = await window.WordGloss.glossFor(x.surface || "", x.w || ""); x.hint = g && g.text ? g.text : ""; } catch (_) {}
    }
  }
  var inflight = new Map();
  async function requestBatch(batch, key) {
    var body = { geminiApiKey: key, rows: batch.map(function (p, i) { return { i: i, he: p.he, ru: p.ru, words: p.words.map(function (x) { return { w: x.w, hint: x.hint }; }) }; }) };
    var res = await fetch("/api/word-gloss-ctx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok && !(data && data.rows && data.rows.length)) {
      var err = new Error((data && data.error) || ("HTTP " + res.status)); err.code = (data && data.error_code) || ("HTTP_" + res.status); throw err;
    }
    var put = [], okKeys = [];
    (data.rows || []).forEach(function (r) {
      var p = batch[r.i]; if (!p) return;
      var val = { glosses: r.glosses, mwe: r.mwe || [], model: data.model || "", at: Date.now() };
      mem.set(p.key, val); put.push([p.key, val]); okKeys.push(p.key);
    });
    await idbPut(put);
    await hydratePayloads(batch);
    return { ok: okKeys.length, rejected: (data.rejected || []).length, usage: data.usage || null };
  }
  // payloads → ensures AI glosses; returns { done, rejected, failed, skipped, error }.
  // Rows already known (memory, this device, or another surface) are neither sent nor counted.
  async function ensurePayloads(ps, opts) {
    opts = opts || {};
    ps = ps.filter(Boolean);
    var key = geminiKey();
    if (!key) return { done: 0, rejected: 0, failed: ps.length, skipped: 0, error: "GEMINI_KEY_REQUIRED" };
    await hydratePayloads(ps);
    var todo = [], seen = new Set();
    ps.forEach(function (p) { if (!mem.has(p.storageKey) && !mem.has(p.key) && !inflight.has(p.key) && !seen.has(p.key)) { seen.add(p.key); todo.push(p); } });
    var stats = { done: 0, rejected: 0, failed: 0, skipped: 0, error: "" }, total = todo.length, batches = [];
    for (var b = 0; b < todo.length; b += BATCH) batches.push(todo.slice(b, b + BATCH));
    // the stage is visible from its first second: the denominator is known before any request
    if (typeof opts.onProgress === "function" && total) { try { opts.onProgress({ done: 0, total: total }); } catch (_) {} }
    var next = 0;
    async function worker() {
      while (next < batches.length) {
        if (opts.signal && opts.signal.aborted) return;
        if (typeof opts.shouldStop === "function") { try { if (await opts.shouldStop()) { next = batches.length; return; } } catch (_) {} }
        var batch = batches[next++];
        var pr = (async function () {
          for (var j = 0; j < batch.length; j++) await hintsFor(batch[j]);
          return requestBatch(batch, key);
        })();
        batch.forEach(function (p) { inflight.set(p.key, pr); });
        try { var r = await pr; stats.done += r.ok; stats.rejected += r.rejected; }
        catch (e) { stats.failed += batch.length; stats.error = (e && e.code) || "ERROR"; if (/KEY|QUOTA|RATE|4\d\d/.test(stats.error)) { next = batches.length; } }
        finally { batch.forEach(function (p) { inflight.delete(p.key); }); }
        if (typeof opts.onProgress === "function") { try { opts.onProgress({ done: stats.done + stats.rejected + stats.failed, total: total }); } catch (_) {} }
        if (typeof opts.onRows === "function") { try { opts.onRows(batch); } catch (_) {} }
      }
    }
    var workers = []; for (var w = 0; w < Math.min(CONCURRENCY, batches.length); w++) workers.push(worker());
    await Promise.all(workers);
    await hydratePayloads(ps);
    stats.skipped = Math.max(0, total - stats.done - stats.rejected - stats.failed);
    return stats;
  }
  // table rows on screen
  async function ensureRows(trs, opts) {
    return ensurePayloads(trs.map(function (tr) { return rowPayload(tr); }), opts);
  }
  // stored rows (a saved card) — the material build stage; no DOM involved
  async function ensureDataRows(rows, opts) {
    return ensurePayloads((rows || []).map(rowPayloadFromData), opts);
  }
  // the material build stage (Ф3б): ensure, then report the honest coverage of the card's rows
  async function glossCard(rows, opts) {
    var res = await ensureDataRows(rows, opts);
    var cov = await estimateDataRows(rows);
    return { rows: cov.rows, covered: cov.coveredRows, done: res.done, rejected: res.rejected, failed: res.failed, skipped: res.skipped, error: res.error || "" };
  }
  // how many words of these stored rows still lack an AI gloss, and what that would cost
  async function estimateDataRows(rows) {
    var ps = (rows || []).map(rowPayloadFromData).filter(Boolean);
    await hydratePayloads(ps);
    var words = 0, missing = 0, covered = 0, seen = new Set();
    ps.forEach(function (p) {
      words += p.words.length;
      if (mem.has(p.storageKey)) covered++;
      else if (!seen.has(p.key)) { seen.add(p.key); missing += p.words.length; }
    });
    return { rows: ps.length, coveredRows: covered, words: words, missingWords: missing, usd: missing / 1000 * USD_PER_1K_WORDS };
  }

  // ── presentation: repaint a row's spans with the AI gloss (provenance «ИИ») ──
  function setPaintAttribute(sp, name, value) { if (sp.getAttribute(name) !== value) sp.setAttribute(name, value); }
  function paintWord(sp, tr, k) {
    var x = wordAt(tr, k); if (!x) return false;
    var oldSource = sp.getAttribute('data-gloss-source'), oldMwe = sp.getAttribute('data-gloss-mwe');
    setPaintAttribute(sp, 'data-gloss', x.gloss);
    if (sp.hasAttribute('data-gloss-hint')) sp.removeAttribute('data-gloss-hint');
    setPaintAttribute(sp, 'data-gloss-label', x.manual ? 'user' : 'ai');
    setPaintAttribute(sp, 'data-gloss-ai', '1');
    setPaintAttribute(sp, 'data-gloss-source', x.manual ? 'user' : 'ai');
    if (x.mwe) {
      var title = t('wordGlossAi.mwe', 'сочетание') + ': ' + x.mwe;
      setPaintAttribute(sp, 'title', title); setPaintAttribute(sp, 'data-gloss-mwe', title);
    } else {
      if ((oldMwe && sp.getAttribute('title') === oldMwe) || oldSource === 'dictionary' || oldSource === 'missing') sp.removeAttribute('title');
      if (oldMwe) sp.removeAttribute('data-gloss-mwe');
    }
    return true;
  }
  function paintRow(tr) {
    var r = lookup(tr); if (!r) return false;
    var spans = rowSpans(tr);
    spans.forEach(function (sp, k) {
      paintWord(sp, tr, k);
    });
    return true;
  }
  function paintMount(mount) {
    if (!mount) return 0;
    var n = 0;
    Array.prototype.forEach.call(mount.querySelectorAll("#proTable tbody tr"), function (tr) { if (lookup(tr) && paintRow(tr)) n++; });
    if (window.WordGloss && window.WordGloss.updateCoverage) window.WordGloss.updateCoverage(mount);
    return n;
  }

  // ── lazy mode: the playing row and the next ones, plus rows scrolled into view ──
  // thinking tokens are a per-request overhead: a 3-row request cost ≈6× more per word than 8–12 rows,
  // so the lazy mode always asks for the playing row plus the next 7 (≈$0.13 / 1000 words measured).
  var LAZY_AHEAD = 7, _lazy = new WeakMap();
  function startLazy(mount, enabledFn) {
    if (!mount || _lazy.has(mount) || typeof IntersectionObserver !== "function") return;
    var pending = new Set(), timer = 0;
    var flush = function () {
      timer = 0;
      if (!enabledFn()) { pending.clear(); return; }
      var trs = Array.from(pending).filter(function (tr) { return tr.isConnected && !lookup(tr); }).slice(0, BATCH * CONCURRENCY);
      pending.clear();
      if (!trs.length) return;
      ensureRows(trs, { onRows: function (batch) { if (!enabledFn()) return; batch.forEach(function (p) { var tr = mount.querySelector('tr[data-wg-ai-key="' + p.key + '"]'); if (tr) paintRow(tr); }); try { window.WordGloss && window.WordGloss.refreshRibbon && window.WordGloss.refreshRibbon(mount); } catch (_) {} } });
    };
    var queue = function (tr) { if (!tr || lookup(tr)) return; pending.add(tr); if (!timer) timer = setTimeout(flush, 600); };
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) queue(e.target); }); }, { rootMargin: "200px 0px" });
    var observeAll = function () { Array.prototype.forEach.call(mount.querySelectorAll("#proTable tbody tr"), function (tr) { io.observe(tr); }); };
    var rerender = 0;
    var onRerender = function () {   // one pass per burst of row changes, after it settles
      if (rerender) return;
      rerender = setTimeout(function () { rerender = 0; if (!enabledFn()) return; observeAll(); hydrate(Array.prototype.slice.call(mount.querySelectorAll("#proTable tbody tr"))).then(function () { if (enabledFn()) paintMount(mount); }); }, 250);
    };
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (!enabledFn()) return;
        // O-080: decoration and replay buttons mutate INSIDE rows thousands of times; only rows count here.
        if (m.type === "childList") { if (rowLevel(m)) onRerender(); continue; }
        var tr = m.target;
        if (tr && tr.tagName === "TR" && /(?:^|\s)(?:row-playing|smk-row-active)(?:\s|$)/.test(tr.className)) {
          var cur = tr; for (var a = 0; a <= LAZY_AHEAD && cur; a++) { queue(cur); cur = cur.nextElementSibling; }
        }
      }
    });
    mo.observe(mount, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    observeAll();
    _lazy.set(mount, { io: io, mo: mo });
  }
  function rowLevel(m) {
    var lists = [m.addedNodes, m.removedNodes];
    for (var a = 0; a < 2; a++) for (var b = 0; b < lists[a].length; b++) { var n = lists[a][b]; if (n.nodeType === 1 && /^(TR|TBODY|TABLE)$/.test(n.nodeName)) return true; if (n.nodeType === 1 && n.querySelector && n.querySelector("#proTable")) return true; }
    return false;
  }
  function stopLazy(mount) {
    var s = mount && _lazy.get(mount); if (!s) return;
    try { s.io.disconnect(); s.mo.disconnect(); } catch (_) {}
    _lazy.delete(mount);
  }

  // ── whole text: estimate, consent dialog, progress ──
  function textRows(mount) { return Array.prototype.slice.call(mount.querySelectorAll("#proTable tbody tr")).filter(function (tr) { return rowSpans(tr).length; }); }
  function estimate(mount) {
    var trs = textRows(mount), words = 0, missing = 0;
    trs.forEach(function (tr) { var n = rowSpans(tr).length; words += n; if (!lookup(tr)) missing += n; });
    return { rows: trs.length, words: words, missingWords: missing, usd: missing / 1000 * USD_PER_1K_WORDS };
  }
  function confirmDialog(est) {
    return new Promise(function (resolve) {
      var ov = document.createElement("div"); ov.className = "room-consent-overlay wg-ai-consent"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      var box = document.createElement("div"); box.className = "room-consent";
      var h = document.createElement("div"); h.className = "room-consent-title"; h.textContent = t("wordGlossAi.consentTitle", "Перевод слов в контексте (ИИ)");
      var p = document.createElement("div"); p.className = "room-consent-body";
      p.textContent = t("wordGlossAi.consentBody", "Строки этого текста будут отправлены в Google Gemini с вашим ключом. Слов без перевода: {n}. Оценка: ≈${usd}. Готовые строки повторно не оплачиваются.")
        .replace("{n}", String(est.missingWords)).replace("{usd}", est.usd < 0.01 ? "0.01" : est.usd.toFixed(2));
      var act = document.createElement("div"); act.className = "room-consent-actions";
      var no = document.createElement("button"); no.type = "button"; no.textContent = t("wordGlossAi.cancel", "Отмена");
      var yes = document.createElement("button"); yes.type = "button"; yes.className = "room-consent-ok"; yes.textContent = t("wordGlossAi.go", "Перевести");
      var done = function (v) { try { ov.remove(); } catch (_) {} resolve(v); };
      no.addEventListener("click", function () { done(false); }); yes.addEventListener("click", function () { done(true); });
      ov.addEventListener("keydown", function (e) { if (e.key === "Escape") done(false); });
      act.appendChild(no); act.appendChild(yes); box.appendChild(h); box.appendChild(p); box.appendChild(act); ov.appendChild(box);
      document.body.appendChild(ov); try { yes.focus(); } catch (_) {}
    });
  }
  // returns a status line for the host to show (toast)
  async function runWholeText(mount, onStatus) {
    if (!mount) return "";
    if (!geminiKey()) return t("wordGlossAi.noKey", "Нужен ключ Gemini: Студия → настройки → ключ Gemini.");
    await hydrate(textRows(mount)); paintMount(mount);
    var est = estimate(mount);
    if (!est.missingWords) return t("wordGlossAi.allDone", "Все слова уже переведены в контексте.");
    if (!(await confirmDialog(est))) return "";
    var say = function (s) { try { onStatus && onStatus(s); } catch (_) {} };
    var res = await ensureRows(textRows(mount), {
      onProgress: function (x) { say(t("wordGlossAi.progress", "Перевод слов (ИИ): {d} из {n} строк").replace("{d}", String(x.done)).replace("{n}", String(x.total))); },
      onRows: function () { paintMount(mount); try { window.WordGloss && window.WordGloss.refreshRibbon && window.WordGloss.refreshRibbon(mount); } catch (_) {} },
    });
    paintMount(mount);
    if (res.error === "GEMINI_KEY_REQUIRED") return t("wordGlossAi.noKey", "Нужен ключ Gemini: Студия → настройки → ключ Gemini.");
    if (res.failed && !res.done) return t("wordGlossAi.failed", "Не удалось получить перевод слов: {e}. Показан словарный перевод.").replace("{e}", res.error || "?");
    if (!(res.rejected + res.failed)) return t("wordGlossAi.resultAll", "Переведено в контексте строк: {d}.").replace("{d}", String(res.done));
    return t("wordGlossAi.result", "Переведено в контексте строк: {d}. Не удалось: {f} — для них показан словарный перевод.")
      .replace("{d}", String(res.done)).replace("{f}", String(res.rejected + res.failed));
  }

  // ── portable layer (Ф3б): the paid AI glosses travel with the material ─────────────────────────
  // Export carries only rows of THIS card, each with its content key. Import recomputes the key from
  // the imported row itself: an entry that does not belong to its row (edited text, other card, forged
  // file) is rejected and counted, never painted. A broken layer never breaks the card import.
  var LAYER_SCHEMA = "word-gloss-ai-layer-v1", MAX_GLOSS = 120;
  function orderOf(row, i) { var n = Number(row && row.order_index); return Number.isFinite(n) ? n : i; }
  function validEntry(e, n) {
    if (!e || !Array.isArray(e.glosses) || e.glosses.length !== n) return false;
    for (var i = 0; i < n; i++) { var g = e.glosses[i]; if (!g || typeof g.gloss !== "string" || !g.gloss.trim() || g.gloss.length > MAX_GLOSS || (g.ai_gloss != null && (typeof g.ai_gloss !== "string" || g.ai_gloss.length > MAX_GLOSS))) return false; }
    var mwe = e.mwe == null ? [] : e.mwe;
    if (!Array.isArray(mwe)) return false;
    return mwe.every(function (m) { return m && Number.isInteger(m.from) && Number.isInteger(m.to) && m.from >= 0 && m.from <= m.to && m.to < n && typeof m.gloss === "string" && m.gloss.length <= MAX_GLOSS; });
  }
  function portableGloss(g) {
    var out = { gloss: g.gloss, wrong_hint: !!g.wrong_hint };
    if (g.manual) { out.manual = true; out.ai_gloss = String(g.ai_gloss || "").slice(0, MAX_GLOSS); out.ai_wrong_hint = !!g.ai_wrong_hint; }
    return out;
  }
  async function portable(rows) {
    var list = (rows || []).map(function (r, i) { return { order: orderOf(r, i), p: rowPayloadFromData(r) }; }).filter(function (x) { return x.p; });
    await hydratePayloads(list.map(function (x) { return x.p; }));
    var out = [];
    list.forEach(function (x) {
      var v = mem.get(x.p.storageKey);
      if (!v || !validEntry(v, x.p.words.length)) return;
      out.push({ order_index: x.order, key: x.p.key,
        ...(v.shared ? {shared:true} : {}),
        glosses: v.glosses.map(portableGloss),
        mwe: (v.mwe || []).map(function (m) { return { from: m.from, to: m.to, gloss: m.gloss }; }), model: String(v.model || "") });
    });
    return out.length ? { schema: LAYER_SCHEMA, rows: out } : null;
  }
  async function remember(layer, rows) {
    var res = { stored: 0, rejected: 0 };
    if (!layer || layer.schema !== LAYER_SCHEMA || !Array.isArray(layer.rows)) { res.rejected = layer && Array.isArray(layer.rows) ? layer.rows.length : 0; return res; }
    var byOrder = new Map();
    (rows || []).forEach(function (r, i) { byOrder.set(orderOf(r, i), r); });
    var put = [], todo = [];
    layer.rows.forEach(function (e) {
      var p = e && byOrder.has(Number(e.order_index)) ? rowPayloadFromData(byOrder.get(Number(e.order_index))) : null;
      if (!p || e.key !== p.key || !validEntry(e, p.words.length)) { res.rejected++; return; }
      var val = { glosses: e.glosses.map(portableGloss),
        ...(e.shared === true ? {shared:true} : {}),
        mwe: (e.mwe || []).map(function (m) { return { from: m.from, to: m.to, gloss: m.gloss }; }), model: String(e.model || ""), at: Date.now(), imported: true };
      todo.push({ p: p, val: val }); res.stored++;
    });
    await hydratePayloads(todo.map(function (x) { return x.p; }));
    todo.forEach(function (x) {
      var mine = mem.get(x.p.storageKey);
      if (mine && mine.glosses) mine.glosses.forEach(function (g, i) { if (g && g.manual && x.val.glosses[i]) x.val.glosses[i] = g; });
      mem.set(x.p.storageKey, x.val); put.push([x.p.storageKey, x.val]);
    });
    await idbPut(put);
    return res;
  }

  window.WordGlossAI = {
    bindRows: bindRows,
    rowPayload: rowPayload, rowPayloadFromData: rowPayloadFromData, lookup: lookup, ensureDataRows: ensureDataRows, estimateDataRows: estimateDataRows, glossCard: glossCard,
    portable: portable, remember: remember, LAYER_SCHEMA: LAYER_SCHEMA, wordAt: wordAt, wordAtData: wordAtData, setOccurrenceGloss: setOccurrenceGloss, hydrate: hydrate, ensureRows: ensureRows,
    paintRow: paintRow, paintWord: paintWord, paintMount: paintMount, startLazy: startLazy, stopLazy: stopLazy,
    estimate: estimate, runWholeText: runWholeText, USD_PER_1K_WORDS: USD_PER_1K_WORDS, _mem: mem,
  };
})();
