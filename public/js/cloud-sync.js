/* cloud-sync.js — CLG-P3 Browser Sync Bridge engine (AI_MENTOR_RECON_2026_07_04.md §4.3).
 *
 * Two-way review_log sync between the OPFS canon and the Cloud Learner Graph:
 *   UP:   outbox = rowid-watermark over the append-only review_log itself (cursor-over-log —
 *         no separate queue, so every existing writer is in-scope by construction);
 *         batches are idempotent (deterministic key from the page's row ids) and CONTENT
 *         meta keys are stripped CLIENT-side before upload (§5 B5 — the local copy stays full;
 *         the server enforces the same allowlist independently).
 *   DOWN: server rows after the ingested_at high-water mark are merged into the local log via
 *         appendReviewLog (INSERT OR IGNORE by PK); projections for the NEW item_keys are
 *         recomputed from the merged log BEFORE the caller repaints (§4.3 down-sync rule).
 *   CUTOVER (§4.3): the up-cursor is trusted only after a full-scan VERIFY pass reports
 *         0 new rows server-side (verify uses fresh idempotency keys so the batch-replay
 *         cache cannot mask a hole).
 *
 * DORMANT BY DEFAULT: nothing calls this engine without an explicit user action (login +
 * sync) — local-first Tier 1 behavior is untouched (recon §5 tiers). Owner-only bootstrap.
 *
 * UMD + injected deps (ldb module, fetch) — Node gates drive it headless.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CloudSync = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // DOWN cursor v2 = server ROWID (hole-free; the v1 ingested_at cursor could skip rows whose
  // batch committed after the read — found live on the owner's iPhone). The old "down_cursor"
  // key is simply abandoned: an empty rid cursor restarts from 0, INSERT OR IGNORE dedupes.
  var UP_CURSOR = "up_cursor", DOWN_CURSOR = "down_cursor_rid", CUTOVER_OK = "cutover_ok", LAST_SYNC = "last_sync_at";
  var BATCH_UP = 400, BATCH_DOWN = 500;

  // Lock-step with db/learnerLogRepo.js META_STRIP (server enforces independently).
  var CONTENT_META_KEYS = ["surface", "answer", "expected", "word", "lemma", "usage", "translation", "gloss", "niqqud"];

  var _csrf = null;
  function csrf() {
    if (_csrf) return _csrf;
    try { _csrf = localStorage.getItem("cloud.csrf") || null; } catch (_) {}
    return _csrf;
  }
  function setCsrf(v) {
    _csrf = v || null;
    try { if (v) localStorage.setItem("cloud.csrf", v); else localStorage.removeItem("cloud.csrf"); } catch (_) {}
  }

  async function jfetch(method, path, body, opts) {
    var h = { "Content-Type": "application/json" };
    if (method !== "GET" && csrf()) h["X-LP-CSRF"] = csrf();
    var res = await fetch(path, {
      method: method, headers: h, credentials: "same-origin",
      body: body != null ? JSON.stringify(body) : undefined,
    });
    var json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json: json };
  }

  // ── session ──────────────────────────────────────────────────────────────
  async function me() {
    var r = await jfetch("GET", "/api/auth/me");
    if (r.status !== 200 || !r.json || !r.json.ok) return null;
    setCsrf(r.json.csrf);
    return r.json;
  }
  async function login(secret, deviceLabel) {
    var r = await jfetch("POST", "/api/auth/bootstrap-login", { secret: secret, deviceLabel: deviceLabel || "" });
    if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, status: r.status, error: (r.json && r.json.error) || "LOGIN_FAILED" };
    setCsrf(r.json.csrf);
    return { ok: true, user: r.json.user };
  }
  async function logout() {
    try { await jfetch("POST", "/api/auth/logout"); } catch (_) {}
    setCsrf(null);
    return { ok: true };
  }

  // ── upload ───────────────────────────────────────────────────────────────
  function stripMeta(metaJson) {
    var meta = {};
    try { meta = typeof metaJson === "string" ? JSON.parse(metaJson || "{}") : (metaJson || {}); } catch (_) { meta = {}; }
    for (var i = 0; i < CONTENT_META_KEYS.length; i++) delete meta[CONTENT_META_KEYS[i]];
    return JSON.stringify(meta);
  }
  function rowForUpload(w) {
    return {
      id: w.id, item_key: w.item_key, kind: w.kind, reviewed_at: w.reviewed_at,
      grade: w.grade == null ? null : Number(w.grade), source: w.source,
      channel: w.channel != null ? w.channel : null,
      latency_ms: w.latency_ms != null ? Number(w.latency_ms) : null,
      meta_json: stripMeta(w.meta_json),
    };
  }
  // One page up. keyPrefix distinguishes the normal pass ('up') from the cutover VERIFY pass
  // ('vf': fresh idempotency keys → the server reports TRUE dup counts instead of replaying
  // the stored result of the original batch).
  async function _uploadFrom(ldb, fromRowid, keyPrefix, totals) {
    var LC = (typeof window !== "undefined") ? window.LemmaCanon : (typeof require === "function" ? null : null);
    var cur = fromRowid;
    for (;;) {
      var rows = await ldb.listReviewLogAfterRowid(cur, BATCH_UP);
      if (!rows.length) break;
      var payload = rows.map(rowForUpload);
      var idsFlat = rows.map(function (w) { return w.id; }).join("\n");
      var key = keyPrefix + ":" + (LC && LC.sha1Hex ? LC.sha1Hex(idsFlat).slice(0, 24) : String(cur) + "-" + rows.length);
      var r = await jfetch("POST", "/api/learner/ingest", {
        idempotency_key: key, schema_version: 1,
        keyer_version: LC ? LC.KEYER_VERSION : undefined,
        source_client_version: (typeof window !== "undefined" && window.APP_VERSION) || undefined,
        review_log: payload,
      });
      if (r.status !== 200 || !r.json || r.json.ok === false) {
        return { ok: false, status: r.status, error: (r.json && r.json.error) || "INGEST_FAILED", at: cur };
      }
      totals.sent += rows.length;
      totals.new += (r.json.review_log && r.json.review_log.new) || 0;
      totals.dup += (r.json.review_log && r.json.review_log.dup) || 0;
      var rejectedRows = (r.json.review_log && Number(r.json.review_log.rejected)) || 0;
      totals.rejected += rejectedRows;
      // A row-level reject is not a successful upload. Advancing the rowid cursor here
      // permanently skipped the rejected tail while the UI still said "synced". Valid
      // rows in a mixed page are idempotent on retry, so keep the cursor before the page
      // and make the failure explicit until the bad row or server contract is repaired.
      if (rejectedRows > 0) {
        return { ok: false, error: "INGEST_REJECTED", status: r.status, at: cur,
          rejectedRows: rejectedRows, rejected: Array.isArray(r.json.rejected) ? r.json.rejected.slice(0, 20) : [] };
      }
      cur = Number(rows[rows.length - 1].rid) || cur;
    }
    return { ok: true, cursor: cur };
  }
  async function syncUp(ldb) {
    var totals = { sent: 0, new: 0, dup: 0, rejected: 0 };
    var cur = Number(await ldb.getSyncState(UP_CURSOR)) || 0;
    var up = await _uploadFrom(ldb, cur, "up", totals);
    if (!up.ok) return { ...up, totals: totals };
    await ldb.setSyncState(UP_CURSOR, String(up.cursor));
    // §4.3 cutover: trust the cursor only after a full-scan verify reports 0 new server-side.
    var cutover = await ldb.getSyncState(CUTOVER_OK);
    if (!cutover) {
      var vTotals = { sent: 0, new: 0, dup: 0, rejected: 0 };
      var vf = await _uploadFrom(ldb, 0, "vf-" + Date.now(), vTotals);
      if (!vf.ok) return { ok: false, error: vf.error, status: vf.status, totals: totals };
      if (vTotals.new === 0) {
        await ldb.setSyncState(CUTOVER_OK, "1");
      } else {
        // rows landed mid-scan (or a hole) — cursor catches up; next sync re-verifies
        await ldb.setSyncState(UP_CURSOR, String(vf.cursor));
        totals.new += vTotals.new;
      }
    }
    return { ok: true, totals: totals };
  }

  // ── download ─────────────────────────────────────────────────────────────
  async function syncDown(ldb) {
    var afterRid = Number(await ldb.getSyncState(DOWN_CURSOR)) || 0;
    var addedKeys = new Set(); var markKeys = new Set(); var pulled = 0;
    for (;;) {
      var r = await jfetch("GET", "/api/learner/log?limit=" + BATCH_DOWN + "&after_rid=" + afterRid);
      if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, status: r.status, error: (r.json && r.json.error) || "READ_FAILED" };
      var rows = r.json.rows || [];
      if (!rows.length) break;
      var pageKeys = new Set();
      for (var i = 0; i < rows.length; i++) {
        var w = rows[i];
        // per-row existence pre-check: appendReviewLog's OR IGNORE can't tell new from dup,
        // and we need the NEW item_keys for the projection recompute (§4.3: before repaint).
        var isNew = !(await ldb.hasReviewLogRow(w.id));
        var res = await ldb.appendReviewLog({
          id: w.id, item_key: w.item_key, kind: w.kind, reviewed_at: w.reviewed_at,
          grade: w.grade, source: w.source, channel: w.channel, latency_ms: w.latency_ms,
          meta_json: w.meta_json,
        });
        if (isNew && res && res.accepted >= 1) {
          addedKeys.add(String(w.item_key)); pageKeys.add(String(w.item_key)); pulled++;
          if (w.kind === "mark") markKeys.add(String(w.item_key));
        }
      }
      // P7.0c (критика R13, crash-window): recompute ключей СТРАНИЦЫ ДО продвижения
      // курсора. Раньше один recompute шёл ПОСЛЕ всего цикла — краш вкладки между
      // сохранением курсора и рекомпьютом терял addedKeys НАВСЕГДА: для annul-to-null
      // это значило «сервер память удалил, клиент планирует слово по отменённому грейду
      // вечно» (counts-reconcile равен, engine-heal не срабатывает, новых событий по
      // слову нет). Recompute идемпотентен — повтор страницы после ретрая безопасен;
      // провал вызова НЕ продвигает курсор (следующий sync дотянет, OR IGNORE дедупит).
      if (pageKeys.size && typeof ldb.recomputeSrsFromLog === "function") {
        try { await ldb.recomputeSrsFromLog(Array.from(pageKeys)); }
        catch (e) { return { ok: false, error: "RECOMPUTE_FAILED", pulled: pulled }; }
      }
      afterRid = Number(r.json.next_rid) || afterRid;
      await ldb.setSyncState(DOWN_CURSOR, String(afterRid));
      if (rows.length < BATCH_DOWN) break;
    }
    // §4.7 manual-axis LWW: a NEW foreign mark row may or may not be the newest — fold the FULL
    // merged log per key (last mark by reviewed_at,id) and apply WITHOUT re-emitting (suppressed).
    var lwwApplied = 0;
    if (markKeys.size && typeof ldb.lastMarkStatus === "function" && typeof ldb.applyWordStatusFromSync === "function") {
      for (const mk of markKeys) {
        try {
          var target = await ldb.lastMarkStatus(mk);
          if (target == null) continue;
          var cur = await ldb.getWordStatus(mk);
          if (String(cur || "") !== target) { await ldb.applyWordStatusFromSync(mk, target); lwwApplied++; }
        } catch (_) {}
      }
    }
    // recompute уже прошёл по-странично ДО каждого продвижения курсора (см. цикл выше).
    return { ok: true, pulled: pulled, lwwApplied: lwwApplied, recomputedKeys: Array.from(addedKeys) };
  }

  // ── CLG-P5.5 class-B artifact sync («Мои тексты») + Sync-hardening P0 (slim/state) ────────
  // Consent-gated on BOTH sides: the engine checks the session's consents (server enforces 403
  // independently). Payload = per-text bundle exportBundle({textIds, slim}) — P0: slim несёт
  // ТОЛЬКО данные этого текста; text-независимое состояние (заметки/полки/overrides/anki/
  // study_day) едет ОДНИМ артефактом kind='state_bundle' (см. _syncState ниже). Merge на
  // приёмнике = importBundle (skip для нового, delete+import при server-NEWER — LWW по
  // updated_at текста; P0 §6.1: importBundle теперь СОХРАНЯЕТ updated_at бандла — пинг-понг
  // погашен). Corpus works never travel (listOwnTextsForSync excludes them).
  // Откат без редеплоя: sync_state['sync_slim_disabled']='1' → старое поведение (fat, без state).
  var STATE_KEY = "__state__", STATE_KIND = "state_bundle";
  var STATE_UP_MIN_MS = 10 * 60 * 1000;   // троттлинг авто-UP state (§6.2; ручной синк — сразу)
  // P1 (§2/§6.7) — ЕДИНСТВЕННЫЙ источник версии consent-карты cloud_texts: сервер require'ит
  // эту же константу (config-string-match-by-construction). Bump версии = новая карта =
  // обязательный re-consent (грант старой версии НЕ переносится молча — решение владельца).
  var CLOUD_TEXTS_CONSENT_VERSION = "v2";
  async function syncArtifacts(ldb, session, opts) {
    opts = opts || {};
    var consents = (session && session.consents) || {};
    if (!consents.cloud_texts || consents.cloud_texts.granted !== true) {
      return { ok: true, skipped: "no_consent" };
    }
    if (typeof ldb.listOwnTextsForSync !== "function" || typeof ldb.exportBundle !== "function") {
      return { ok: true, skipped: "no_ldb_support" };
    }
    // P1 — грант СТАРОЙ версии карты: синк честно приостановлен до re-consent (сервер и сам
    // 403-ит list/get/put), но delete-интенты дренируются — right-to-delete работает под
    // любой версией (§6.7). ☁-модал показывает амбер-строку re-consent.
    if (String(consents.cloud_texts.version || "") !== CLOUD_TEXTS_CONSENT_VERSION) {
      if (typeof ldb.listArtifactIntents === "function") {
        try {
          var vIntents = await ldb.listArtifactIntents();
          for (var vi = 0; vi < vIntents.length; vi++) {
            var vit = vIntents[vi];
            var vres = await jfetch("POST", "/api/learner/artifacts/delete",
              vit.op === "undelete"
                ? { artifact_key: vit.artifact_key, restore: true }
                : { artifact_key: vit.artifact_key, deleted_at: vit.deleted_at || undefined });
            if (vres.status === 200 || vres.status === 400) await ldb.removeArtifactIntent(vit.id);
          }
        } catch (_) {}
      }
      return { ok: true, skipped: "reconsent_required" };
    }
    var slim = typeof ldb.exportStateBundle === "function";
    try { if ((await ldb.getSyncState("sync_slim_disabled")) === "1") slim = false; } catch (_) {}
    var out = { ok: true, uploaded: 0, downloaded: 0, updated: 0, upSkipped: 0, failed: [], nearCap: 0, state: null, intents: 0, tombstoned: 0 };
    // P2 §6.6 — разовый heal dangling occurrences (годы delete+reimport копили строки с
    // мёртвыми sentence-id; mode:'replace' далее не создаёт новых).
    if (typeof ldb.healDanglingOccurrences === "function") {
      try {
        if ((await ldb.getSyncState("occ_dangle_healed_v1")) !== "1") {
          await ldb.healDanglingOccurrences();
          await ldb.setSyncState("occ_dangle_healed_v1", "1");
        }
      } catch (_) {}
    }
    // P2 §6.5 — дренаж delete/undelete-интентов ДО list (и до любого UP): удаление, сделанное
    // в Студии офлайн, доезжает раньше, чем чей-либо UP успеет ресурректить. Per-intent
    // best-effort: 4xx-ответ снимает интент (не ретраить вечно), сбой сети оставляет в очереди.
    if (typeof ldb.listArtifactIntents === "function") {
      try {
        var intents = await ldb.listArtifactIntents();
        for (var ii = 0; ii < intents.length; ii++) {
          var it = intents[ii];
          var dres = await jfetch("POST", "/api/learner/artifacts/delete",
            it.op === "undelete"
              ? { artifact_key: it.artifact_key, restore: true }
              : { artifact_key: it.artifact_key, deleted_at: it.deleted_at || undefined });
          if (dres.status === 200 || dres.status === 400) {
            await ldb.removeArtifactIntent(it.id);
            if (dres.status === 200) out.intents++;
          }
        }
      } catch (_) {}
    }
    var listRes = await jfetch("GET", "/api/learner/artifacts");
    if (listRes.status !== 200 || !listRes.json || !listRes.json.ok) {
      return { ok: false, error: (listRes.json && listRes.json.error) || "ARTIFACTS_LIST_FAILED", status: listRes.status };
    }
    var server = new Map((listRes.json.rows || []).map(function (r) { return [String(r.artifact_key), String(r.updated_at)]; }));
    var serverState = listRes.json.state || null;   // additive-поле; старый сервер его не шлёт
    var local = await ldb.listOwnTextsForSync();
    var localByKey = new Map(local.map(function (t) { return [t.text_key, t]; }));
    // P2 §6.4 — применение серверных tombstones СТРОГО ДО UP (иначе стейл-девайс ресурректит
    // удалённое своим UP'ом раньше, чем узнает об удалении). LWW: локальная копия НОВЕЕ
    // deleted_at → живёт, её UP снимет tombstone («правка воскрешает»).
    var tombs = (listRes.json.tombstones || []);
    if (tombs.length && typeof ldb.deleteText === "function") {
      var deadKeys = new Set();
      for (var ti = 0; ti < tombs.length; ti++) {
        var tb = tombs[ti];
        var locT = localByKey.get(String(tb.artifact_key));
        if (!locT) continue;
        if (Date.parse(locT.updated_at) <= Date.parse(tb.deleted_at)) {
          try { await ldb.deleteText(locT.id); deadKeys.add(String(tb.artifact_key)); out.tombstoned++; } catch (_) {}
        }
      }
      if (deadKeys.size) {
        local = local.filter(function (t) { return !deadKeys.has(String(t.text_key)); });
        deadKeys.forEach(function (k) { localByKey.delete(k); });
      }
    }
    // Одноразовая миграция формата (§1.5): равный updated_at + slim ⇒ replace_equal
    // (тот же контентный момент, меняется только состав) — 7,5-МБ fat-артефакты
    // перезаписываются слимами БЕЗ клок-игр. Флаг ставится после полного прохода без провалов.
    var migrated = "1";
    if (slim) { try { migrated = (await ldb.getSyncState("slim_migrated")) || ""; } catch (_) { migrated = ""; } }
    // UP: new or locally-newer texts. PER-TEXT BEST-EFFORT: один негабаритный/битый текст не
    // должен абортить остальные 80 (урок owner-верифи 2026-07-05: «в облаке 0» при 81 локально —
    // и ошибка была НЕВИДИМА). Каждый провал — в failed[] с причиной, наружу и в console.
    for (var i = 0; i < local.length; i++) {
      var t = local[i];
      try {
        var srvAt = server.get(t.text_key);
        var needMigrate = slim && !migrated && srvAt && Date.parse(srvAt) === Date.parse(t.updated_at);
        if (srvAt && Date.parse(srvAt) >= Date.parse(t.updated_at) && !needMigrate) { out.upSkipped++; continue; }
        var bundle = await ldb.exportBundle({ textIds: [t.id], slim: slim });
        var put = await jfetch("POST", "/api/learner/artifacts/put", {
          artifact_key: t.text_key, updated_at: t.updated_at, payload: bundle,
          replace_equal: needMigrate ? true : undefined,
        });
        if (put.status === 200 && put.json && put.json.stored) {
          out.uploaded++;
          if (put.json.warn === "NEAR_CAP") out.nearCap++;   // тикающий кап больше НЕ молчит
        }
        else if (put.status === 200 && put.json && put.json.reason === "DELETED_NEWER") {
          // P2 §6.4 — текст удалён на другом устройстве ПОЗЖЕ нашей версии: LWW deletion-wins,
          // применяем удаление локально (наша копия старее события удаления).
          try { await ldb.deleteText(t.id); out.tombstoned++; } catch (_) {}
        }
        else if (put.status === 200) out.upSkipped++;   // OLDER_OR_EQUAL race — уже на сервере
        else {
          out.failed.push({ key: t.text_key, title: t.title, error: (put.json && put.json.error) || ("HTTP_" + put.status) });
          try { console.warn("[cloud-sync] artifact PUT failed:", t.title, put.status, put.json); } catch (_) {}
        }
      } catch (e) {
        out.failed.push({ key: t.text_key, title: t.title, error: String(e && e.message || e) });
        try { console.warn("[cloud-sync] artifact export/PUT threw:", t.title, e); } catch (_) {}
      }
    }
    if (slim && !migrated && !out.failed.length) { try { await ldb.setSyncState("slim_migrated", "1"); } catch (_) {} }
    // DOWN: missing or server-newer texts
    for (const entry of server) {
      var key = entry[0], srvUpdated = entry[1];
      var loc = localByKey.get(key);
      if (loc && Date.parse(loc.updated_at) >= Date.parse(srvUpdated)) continue;
      var got = await jfetch("GET", "/api/learner/artifacts/get?key=" + encodeURIComponent(key));
      if (got.status !== 200 || !got.json || !got.json.ok) continue;   // per-text best-effort down
      try {
        // P2 §6.6 — server NEWER → mode:'replace': удаление старой версии АТОМАРНО с вставкой
        // внутри sp_text (сбой импорта откатывает — старый текст цел; раньше deleteText шёл ДО
        // импорта и сбой глотался = локальная потеря) + снапшот в lww_replace_backups + чистка
        // occurrences; закладки/occurrences восстанавливаются из самого slim-бандла.
        var imp = await ldb.importBundle(got.json.payload, { mode: loc ? "replace" : "skip" });
        if (imp && imp.imported >= 1) { if (loc) out.updated++; else out.downloaded++; }
      } catch (e3) {
        try { console.warn("[cloud-sync] artifact DOWN import failed:", key, e3 && e3.message); } catch (_) {}
      }
    }
    // state_bundle — ПОСЛЕ текстов (§1.3: якоря state-occurrences резолвятся по text_key
    // уже-импортированных текстов). forceDown после LWW-replace: replace снёс occurrences
    // канонических заметок этого текста — state re-apply их возвращает (merge идемпотентен).
    if (slim) {
      try {
        out.state = await _syncState(ldb, serverState, { manual: !opts.auto, forceDown: out.updated > 0 });
        if (out.state && out.state.nearCap) out.nearCap++;
      } catch (e2) {
        out.state = { ok: false, error: String(e2 && e2.message || e2) };
      }
    }
    return out;
  }

  // state-синк (§6.2): change-signal вместо слепого ts (occurrence-only действия и удаления
  // видимы); DOWN при ЛЮБОМ изменении серверного ts относительно запомненного (ловит
  // равный-ts-новый-контент); merge-back публикует union СТРОГО новее серверного ts —
  // replace_equal здесь НЕ используется (критика F1-2: равный ts не идентифицирует контент).
  async function _syncState(ldb, serverState, o) {
    var st = { ok: true, action: "none" };
    var lastServerTs = (await ldb.getSyncState("state_server_ts")) || "";
    var lastSig = (await ldb.getSyncState("state_up_sig")) || "";
    var lastUpAt = Number(await ldb.getSyncState("state_up_at")) || 0;
    var sig = await ldb.stateChangeSignal();
    var needDown = !!serverState && String(serverState.updated_at || "") !== lastServerTs;
    if (o.forceDown && serverState) needDown = true;
    var localChanged = sig.signal !== lastSig;
    // P2: сервер потерял state (revoke→purge→re-grant) — сигнал не менялся, но перезалить надо
    var serverLost = !serverState && !!lastServerTs;
    if (serverLost) { localChanged = true; lastUpAt = 0; }
    if (!needDown && !localChanged) return st;
    if (!needDown && localChanged && !o.manual && Date.now() - lastUpAt < STATE_UP_MIN_MS) {
      st.action = "deferred";   // авто-троттлинг: правки заметок не молотят 5-МБ PUT каждые 90 с
      return st;
    }
    var _finish = async function (serverTs, exp2) {
      await ldb.setSyncState("state_server_ts", String(serverTs));
      await ldb.setSyncState("state_up_sig", exp2 && exp2.signal ? exp2.signal : (await ldb.stateChangeSignal()).signal);
      await ldb.setSyncState("state_up_at", String(Date.now()));
    };
    if (needDown) {
      var got = await jfetch("GET", "/api/learner/artifacts/get?kind=" + STATE_KIND + "&key=" + encodeURIComponent(STATE_KEY));
      if (got.status !== 200 || !got.json || !got.json.ok) {
        st.ok = false; st.error = (got.json && got.json.error) || ("STATE_GET_HTTP_" + got.status);
        return st;
      }
      st.merged = await ldb.importStateBundle(got.json.payload);
      var expAfter = await ldb.exportStateBundle();
      var serverCanon = JSON.stringify((got.json.payload && got.json.payload.state) || null);
      if (JSON.stringify(expAfter.state) === serverCanon) {
        await _finish(serverState.updated_at, expAfter);
        st.action = "downloaded";
        return st;
      }
      // union отличается → merge-back строго-новее серверного (другие устройства детектируют)
      var srvTsMs = Date.parse(serverState.updated_at) || 0;
      var upTs = (expAfter.updated_at && Date.parse(expAfter.updated_at) > srvTsMs)
        ? expAfter.updated_at
        : new Date(srvTsMs + 1).toISOString();
      var putM = await jfetch("POST", "/api/learner/artifacts/put", {
        kind: STATE_KIND, artifact_key: STATE_KEY, updated_at: upTs, payload: expAfter,
      });
      if (putM.status === 200 && putM.json && putM.json.stored) {
        if (putM.json.warn === "NEAR_CAP") st.nearCap = true;
        await _finish(upTs, expAfter);
        st.action = "merged";
      } else if (putM.status === 200) {
        // OLDER_OR_EQUAL: сервер успел уйти вперёд (гонка второго устройства) — честно
        // отложить до следующего цикла (state_server_ts не обновляем → DOWN повторится).
        st.action = "conflict-deferred";
      } else {
        st.ok = false; st.error = (putM.json && putM.json.error) || ("STATE_PUT_HTTP_" + putM.status);
      }
      return st;
    }
    // локальные изменения без серверных: обычный UP
    var exp = await ldb.exportStateBundle();
    if (!exp.updated_at) { st.action = "empty"; return st; }
    var put2 = await jfetch("POST", "/api/learner/artifacts/put", {
      kind: STATE_KIND, artifact_key: STATE_KEY, updated_at: exp.updated_at, payload: exp,
    });
    if (put2.status === 200 && put2.json && put2.json.stored) {
      if (put2.json.warn === "NEAR_CAP") st.nearCap = true;
      await _finish(exp.updated_at, exp);
      st.action = "uploaded";
    } else if (put2.status === 200) {
      // OLDER_OR_EQUAL: сервер держит равный/новее ts, о котором мы не знали (lastServerTs
      // стейл) — сбросить память серверного ts, следующий цикл сделает DOWN+merge.
      await ldb.setSyncState("state_server_ts", "");
      st.action = "conflict-deferred";
    } else {
      st.ok = false; st.error = (put2.json && put2.json.error) || ("STATE_PUT_HTTP_" + put2.status);
    }
    return st;
  }

  // ── full cycle + reconciliation ──────────────────────────────────────────
  async function fullSync(ldb, opts) {
    var session = await me();
    if (!session) return { ok: false, error: "UNAUTHENTICATED" };
    // §4.7 backfill at cutover: manual разметка asserted BEFORE mark-emission existed gets its
    // synthetic mark rows ONCE, so the historic axis rides the same log channel (idempotent).
    try {
      if (!(await ldb.getSyncState(CUTOVER_OK)) && typeof ldb.backfillMarkRows === "function") {
        await ldb.backfillMarkRows();
      }
    } catch (_) {}
    var up = await syncUp(ldb);
    if (!up.ok) return up;
    var down = await syncDown(ldb);
    if (!down.ok) return down;
    // P7.0a heal: смена семантики фолда (FsrsCore.ENGINE_VERSION, annul-aware v2) →
    // ОДНОРАЗОВЫЙ пересчёт всех локальных ключей с annul-строками. Обычный recompute
    // трогает только ключи НОВЫХ down-sync строк — annul-строка, пришедшая ДО апгрейда
    // движка (SW-кэш), фолдилась как neutral и без heal-а больше никогда не пересчиталась
    // бы (version-skew, критика wf_1bf34023).
    try {
      var FCv = (typeof self !== "undefined" && self.FsrsCore) ? self.FsrsCore : null;
      if (FCv && typeof ldb.dbQuery === "function" && typeof ldb.recomputeSrsFromLog === "function") {
        var seen = await ldb.getSyncState("annul_engine_v");
        if (String(seen || "") !== String(FCv.ENGINE_VERSION)) {
          var aRows = await ldb.dbQuery("SELECT DISTINCT item_key FROM review_log WHERE kind = 'annul'", []);
          var aKeys = (aRows || []).map(function (r) { return String(r.item_key); }).filter(Boolean);
          if (aKeys.length) await ldb.recomputeSrsFromLog(aKeys);
          await ldb.setSyncState("annul_engine_v", String(FCv.ENGINE_VERSION));
        }
      }
    } catch (_) {}
    // §4.3 постоянная reconciliation, встроенная в каждый цикл: после полного двустороннего
    // синка local == server; расхождение (напр. унаследованная дыра v1-курсора) → ОДИН
    // авто-heal: сброс курсоров → полный re-verify-upload + полный re-download (идемпотентно).
    var healed = false, localN = null, serverN = null;
    try {
      localN = await ldb.countReviewLog();
      var c = await jfetch("GET", "/api/learner/counts");
      serverN = c.json && c.json.ok ? Number(c.json.review_log) : null;
      if (serverN != null && serverN !== localN && !(opts && opts.noHeal)) {
        await ldb.setSyncState(UP_CURSOR, "");
        await ldb.setSyncState(CUTOVER_OK, "");
        await ldb.setSyncState(DOWN_CURSOR, "");
        var again = await fullSync(ldb, { noHeal: true, auto: !!(opts && opts.auto) });
        if (!again || !again.ok) return again || { ok: false, error: "RECONCILE_FAILED" };
        if (again.ok) {
          healed = true;
          up = { totals: again.up }; up.ok = true; up.totals = again.up;
          down.pulled = (down.pulled || 0) + ((again.down && again.down.pulled) || 0);
          localN = again.counts ? again.counts.local : await ldb.countReviewLog();
          serverN = again.counts ? again.counts.cloud : serverN;
        }
      }
    } catch (_) {}
    // CLG-P5.5 — class-B artifacts ride the same cycle (consent-gated; no-op otherwise)
    var artifacts = null;
    try { artifacts = await syncArtifacts(ldb, session, { auto: !!(opts && opts.auto) }); } catch (e) { artifacts = { ok: false, error: String(e && e.message || e) }; }
    try { await ldb.setSyncState(LAST_SYNC, new Date().toISOString()); } catch (_) {}
    return { ok: true, up: up.totals, down: { pulled: down.pulled }, healed: healed,
             artifacts: artifacts, counts: { local: localN, cloud: serverN }, user: session.user };
  }
  // Permanent reconciliation (§4.3): after a full two-way sync the local log and the server log
  // are the SAME SET — compare counts; on mismatch re-verify-upload from 0 + full re-download.
  async function reconcile(ldb) {
    var counts = await jfetch("GET", "/api/learner/counts");
    if (counts.status !== 200 || !counts.json || !counts.json.ok) return { ok: false, error: "COUNTS_FAILED" };
    var localCount = await ldb.countReviewLog();
    if (Number(counts.json.review_log) === localCount) return { ok: true, equal: true, count: localCount };
    await ldb.setSyncState(UP_CURSOR, "");               // retry any row the old cursor skipped/rejected
    await ldb.setSyncState(CUTOVER_OK, "");            // force a fresh full-scan verify
    await ldb.setSyncState(DOWN_CURSOR, "");           // full re-download
    var again = await fullSync(ldb);
    if (!again.ok) return again;
    var counts2 = await jfetch("GET", "/api/learner/counts");
    var local2 = await ldb.countReviewLog();
    return { ok: true, equal: Number(counts2.json && counts2.json.review_log) === local2, count: local2 };
  }

  return {
    me: me, login: login, logout: logout,
    syncUp: syncUp, syncDown: syncDown, fullSync: fullSync, reconcile: reconcile,
    syncArtifacts: syncArtifacts,
    stripMeta: stripMeta,
    CONTENT_META_KEYS: CONTENT_META_KEYS,
    CLOUD_TEXTS_CONSENT_VERSION: CLOUD_TEXTS_CONSENT_VERSION,
    KEYS: { UP_CURSOR: UP_CURSOR, DOWN_CURSOR: DOWN_CURSOR, CUTOVER_OK: CUTOVER_OK, LAST_SYNC: LAST_SYNC },
  };
});
