/* studio-agent.js — PAS слайс B: agent-UI Студии (чартер §7.7 — ВЕСЬ агент-код Студии
 * живёт здесь, НЕ в inline-JS index.html; index.html даёт только script-тег, эмиссию
 * .row-agent-btn в renderTable и host-bridge window.StudioAgentHost).
 *
 * B1 — per-row 🤖 «объяснить предложение»: тот же POST /api/agent/explain, что в Зале
 * (personal-путь, двойной consent СЕРВЕРОМ fail-closed; клиентские проверки — только
 * для честных сообщений). Якорь LIVE: order_index резолвится из OPFS по sentence-id
 * НА КЛИКЕ (кэш ряда протухает при реордере — критика wf_7f300c39) + sentence_row_id
 * для точного матча на сервере. Лестница честных состояний без тупиков (R4):
 * offline → вход в облако (Зал, #cloud) → cloud_texts → situated agent_read_texts →
 * адресный пуш ОДНОГО текста (artifacts/put, НЕ fullSync) → объяснение.
 *
 * Инварианты: LLM-текст рендерится ТОЛЬКО textContent; провенанс 🤖 provider·model;
 * usage в точке трат (R16); ни одного LLM-вызова без явного тапа (этикет).
 * i18n: все строки через tt(key, fallback) — ключи studio.agent.* ОБЯЗАНЫ жить в
 * ×3 локалях (t() возвращает ключ при промахе — fallback недостижим при живом t()).
 */
(function () {
  'use strict';
  if (window.StudioAgent) return;

  var tt = function (key, fallback) {
    try { return (window.t && window.t(key)) || fallback || key; } catch (_) { return fallback || key; }
  };
  var CSRF = function () { try { return localStorage.getItem('cloud.csrf') || ''; } catch (_) { return ''; } };
  var stripNiq = function (s) { return String(s || '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim(); };

  function jpost(url, body, signal) {
    var opts = {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': CSRF() },
      body: JSON.stringify(body),
    };
    if (signal) opts.signal = signal;
    return fetch(url, opts).then(function (x) { return x.json(); });
  }

  // ── CSS: инжект при init — ПОЗЖЕ всех документных стилей = побеждает каскад.
  // Ловушки CLAUDE.md: глобальный button{width:100%} на mobile → width:auto по id;
  // [hidden] vs display → явный guard.
  // Общие правила — под классом .sa-modal (оба модала его несут); ловушки CLAUDE.md:
  // width:auto по id-селектору против глобального button{width:100%}, [hidden]-guard.
  var STYLE_CSS = [
    '.sa-modal{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(10,14,20,.55)}',
    '.sa-modal[hidden]{display:none!important}',
    '.sa-modal .sa-card{background:var(--panel-bg,#141a22);color:var(--text,#e8eef5);border:1px solid rgba(255,255,255,.12);border-radius:14px;max-width:560px;width:calc(100% - 24px);max-height:86vh;overflow:auto;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.5)}',
    '.sa-modal .sa-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}',
    '.sa-modal .sa-title{font-weight:600;font-size:15px}',
    '#saExplainModal button,#saMaterialModal button{width:auto}',
    '.sa-modal .sa-close{background:none;border:none;color:inherit;font-size:20px;cursor:pointer;padding:2px 8px;margin:0}',
    '.sa-modal .sa-he{direction:rtl;text-align:right;font-size:19px;line-height:1.7;padding:8px 10px;background:rgba(255,255,255,.05);border-radius:10px;margin-bottom:8px}',
    '.sa-modal .sa-body{white-space:pre-wrap;font-size:14px;line-height:1.55;min-height:40px}',
    '.sa-modal .sa-constructs{font-size:12.5px;opacity:.85;margin-top:6px}',
    '.sa-modal .sa-meta{font-size:12px;opacity:.7;margin-top:8px}',
    '.sa-modal .sa-consent,.sa-modal .sa-actions{margin-top:10px;padding:10px;border:1px solid rgba(255,193,7,.35);border-radius:10px;font-size:13px;background:rgba(255,193,7,.06)}',
    '.sa-modal .sa-consent[hidden],.sa-modal .sa-actions[hidden]{display:none!important}',
    '.sa-modal .sa-actions-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}',
    '.sa-modal .sa-actions-row button{padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;cursor:pointer}',
    '.sa-modal .sa-actions-row button.sa-primary{background:#2b6cb0;border-color:#2b6cb0}',
    '.sa-modal .sa-followup{margin-top:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px}',
    '.sa-modal .sa-followup[hidden]{display:none!important}',
    '.sa-modal .sa-turns{font-size:12px;opacity:.75;margin-bottom:6px}',
    '.sa-modal .sa-ask-row{display:flex;gap:8px}',
    '.sa-modal .sa-ask-row input{flex:1;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:inherit;font-size:14px}',
    '.sa-modal .sa-mat-actions{display:flex;flex-direction:column;gap:8px;margin:10px 0}',
    '.sa-modal .sa-mat-actions button{text-align:left;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;cursor:pointer;font-size:14px}',
    '.sa-modal .sa-mat-actions button:hover{background:rgba(120,160,220,.15)}',
    '.row-agent-btn{background:none;border:1px solid rgba(120,160,220,.45);border-radius:8px;cursor:pointer;font-size:13px;line-height:1;padding:3px 6px;margin-top:4px}',
    '.row-agent-btn:hover{background:rgba(120,160,220,.15)}',
    '#saMaterialBtn{background:none;border:1px solid rgba(120,160,220,.45);border-radius:8px;cursor:pointer;font-size:13px;padding:4px 10px;margin-left:6px;width:auto}',
    '@media (max-width:600px){.sa-modal{align-items:flex-end}.sa-modal .sa-card{max-height:78vh;border-radius:14px 14px 0 0;width:100%}}',
  ].join('\n');

  // Статический шаблон модала — ЕДИНСТВЕННОЕ innerHTML-присваивание файла, без
  // интерполяции (гейт smoke:studio-agent следит). Всё динамическое — textContent.
  var MODAL_HTML =
    '<div class="sa-card" role="dialog" aria-modal="true" aria-labelledby="saExplainTitle">' +
    '<div class="sa-head"><div class="sa-title" id="saExplainTitle"></div>' +
    '<button type="button" class="sa-close" data-sa-close="1" aria-label="close">×</button></div>' +
    '<div class="sa-he" id="saExplainHe" dir="rtl" lang="he"></div>' +
    '<div class="sa-body" id="saExplainBody"></div>' +
    '<div class="sa-constructs" id="saExplainConstructs" hidden></div>' +
    '<div class="sa-consent" id="saExplainConsent" hidden>' +
    '<div id="saExplainConsentText"></div>' +
    '<div class="sa-actions-row"><button type="button" class="sa-primary" id="saExplainAllow"></button>' +
    '<button type="button" id="saExplainCancel"></button></div></div>' +
    '<div class="sa-actions" id="saExplainActions" hidden>' +
    '<div id="saExplainActionsText"></div>' +
    '<div class="sa-actions-row" id="saExplainActionsRow"></div></div>' +
    '<div class="sa-meta" id="saExplainMeta"></div>' +
    '<div class="sa-followup" id="saExplainFollowup" hidden>' +
    '<div class="sa-turns" id="saExplainTurns"></div>' +
    '<div class="sa-ask-row"><input type="text" id="saExplainQ" maxlength="500">' +
    '<button type="button" class="sa-primary" id="saExplainAsk">➤</button></div></div>' +
    '</div>';

  // Второй статический шаблон (гейт: ровно ДВА innerHTML, оба — литералы без интерполяции).
  var MATERIAL_HTML =
    '<div class="sa-card" role="dialog" aria-modal="true" aria-labelledby="saMatTitle">' +
    '<div class="sa-head"><div class="sa-title" id="saMatTitle"></div>' +
    '<button type="button" class="sa-close" data-sa-mclose="1" aria-label="close">×</button></div>' +
    '<div class="sa-mat-actions">' +
    '<button type="button" id="saMatNotes"></button>' +
    '<button type="button" id="saMatQuiz"></button>' +
    '<button type="button" id="saMatSummary"></button></div>' +
    '<div class="sa-body" id="saMatBody"></div>' +
    '<div class="sa-consent" id="saMatConsent" hidden>' +
    '<div id="saMatConsentText"></div>' +
    '<div class="sa-actions-row"><button type="button" class="sa-primary" id="saMatAllow"></button>' +
    '<button type="button" id="saMatCancel"></button></div></div>' +
    '<div class="sa-actions" id="saMatActions" hidden>' +
    '<div id="saMatActionsText"></div>' +
    '<div class="sa-actions-row" id="saMatActionsRow"></div></div>' +
    '<div class="sa-meta" id="saMatMeta"></div>' +
    '</div>';

  var $ = function (id) { return document.getElementById(id); };
  var _modal = null;

  function ensureModal() {
    if (_modal) return _modal;
    var st = document.createElement('style');
    st.textContent = STYLE_CSS;
    document.head.appendChild(st);
    _modal = document.createElement('div');
    _modal.id = 'saExplainModal';
    _modal.className = 'sa-modal';
    _modal.hidden = true;
    _modal.innerHTML = MODAL_HTML;
    document.body.appendChild(_modal);
    $('saExplainTitle').textContent = '🤖 ' + tt('studio.agent.title', 'Наставник · объяснение');
    _modal.addEventListener('click', function (e) {
      if (e.target === _modal || (e.target.getAttribute && e.target.getAttribute('data-sa-close') === '1')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _modal && !_modal.hidden) closeModal();
    });
    $('saExplainAsk').addEventListener('click', followupSend);
    $('saExplainQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') followupSend(); });
    return _modal;
  }

  var _abort = null;          // AbortController текущего запроса
  var _inFlight = false;      // один explain на Студию (двойной тап не жжёт леджер)
  var _followupCtx = null;    // { explanationId, left, baseText }
  var _followupBusy = false;

  function closeModal() {
    if (_modal) _modal.hidden = true;
    if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }
    _followupCtx = null;
  }

  function setBody(text) { var b = $('saExplainBody'); if (b) b.textContent = text || ''; }
  function setMeta(text) { var m = $('saExplainMeta'); if (m) m.textContent = text || ''; }
  function hidePanels() {
    var c = $('saExplainConsent'); if (c) c.hidden = true;
    var a = $('saExplainActions'); if (a) a.hidden = true;
    var f = $('saExplainFollowup'); if (f) f.hidden = true;
    var k = $('saExplainConstructs'); if (k) { k.hidden = true; k.textContent = ''; }
  }

  // Универсальная панель действий: честный текст + кнопки [основное действие] [Повторить].
  function showActions(text, buttons) {
    var box = $('saExplainActions'), t = $('saExplainActionsText'), row = $('saExplainActionsRow');
    if (!box || !row) return;
    t.textContent = text || '';
    row.textContent = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      if (b.primary) btn.className = 'sa-primary';
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      row.appendChild(btn);
    });
    box.hidden = false;
  }

  function showConsentPanel(onAllow) {
    var box = $('saExplainConsent');
    if (!box) return;
    $('saExplainConsentText').textContent = tt('studio.agent.consentBody',
      'Наставник отправит ЭТО предложение внешнему AI-провайдеру вместе с вашими слабыми/просроченными словами и потратит 1 вызов из дневного лимита. Разрешить чтение предложений ваших текстов (отзыв — в ☁ Зала)?');
    var allow = $('saExplainAllow'), cancel = $('saExplainCancel');
    allow.textContent = tt('studio.agent.consentAllow', 'Разрешить и объяснить');
    cancel.textContent = tt('studio.agent.consentCancel', 'Отмена');
    allow.onclick = async function () {
      box.hidden = true;
      try {
        var r = await jpost('/api/auth/consent', { key: 'agent_read_texts', granted: true, version: 'v1' });
        if (!r || r.ok === false) { setBody(tt('studio.agent.err', 'Не удалось получить объяснение')); return; }
      } catch (_) { setBody(tt('studio.agent.err', 'Не удалось получить объяснение')); return; }
      onAllow();
    };
    cancel.onclick = function () { box.hidden = true; setBody(''); setMeta(''); };
    box.hidden = false;
  }

  // ── follow-up (порт паттерна Зала: ≤3 хода, серверный счётчик — истина) ────
  function followupSetup(r) {
    var f = $('saExplainFollowup');
    if (!f) return;
    if (!r || !r.explanation_id || r.followups_left == null) { f.hidden = true; _followupCtx = null; return; }
    _followupCtx = { explanationId: r.explanation_id, left: Number(r.followups_left) || 0, baseText: $('saExplainBody').textContent || '' };
    f.hidden = false;
    var q = $('saExplainQ');
    if (q) { q.value = ''; q.placeholder = tt('studio.agent.askPh', 'Спросить о предложении…'); }
    followupPaint();
  }
  function followupPaint() {
    var t = $('saExplainTurns');
    if (!t || !_followupCtx) return;
    var out = _followupCtx.left <= 0;
    t.textContent = out
      ? tt('studio.agent.turnsOut', 'Вопросы по этому объяснению исчерпаны.')
      : tt('studio.agent.turnsLeft', 'Осталось вопросов') + ': ' + _followupCtx.left + '/3';
    var q = $('saExplainQ'), a = $('saExplainAsk');
    if (q) q.disabled = out;
    if (a) a.disabled = out;
  }
  async function followupSend() {
    var qEl = $('saExplainQ');
    var q = (qEl && qEl.value || '').trim();
    if (!q || _followupBusy || !_followupCtx || _followupCtx.left <= 0) return;
    _followupBusy = true;
    var askB = $('saExplainAsk'); if (askB) askB.disabled = true;
    setBody(_followupCtx.baseText + '\n\n❓ ' + q + '\n' + tt('studio.agent.loading', 'Наставник думает…'));
    var r = null;
    try { r = await jpost('/api/agent/explain/followup', { explanation_id: _followupCtx.explanationId, question: q }); } catch (_) {}
    _followupBusy = false;
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      var msg;
      if (code === 'FOLLOWUP_LIMIT') { _followupCtx.left = 0; msg = tt('studio.agent.turnsOut', 'Вопросы по этому объяснению исчерпаны.'); }
      else if (code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT') msg = tt('studio.agent.limit', 'дневной лимит LLM исчерпан');
      else msg = '✗ ' + tt('studio.agent.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
      setBody(_followupCtx.baseText + '\n\n❓ ' + q + '\n' + msg);
      followupPaint();
      return;
    }
    _followupCtx.baseText = _followupCtx.baseText + '\n\n❓ ' + q + '\n💬 ' + (r.text || '');
    _followupCtx.left = Number(r.turns_left) || 0;
    setBody(_followupCtx.baseText);
    if (qEl) qEl.value = '';
    followupPaint();
    var b = $('saExplainBody'); try { b.scrollTop = b.scrollHeight; } catch (_) {}
  }

  // ── якорь: LIVE-резолв из OPFS на клике (кэшированные индексы протухают при
  // реордере — критика wf_7f300c39; sentence_row_id даёт точный матч на сервере) ──
  async function resolveAnchor(row) {
    var host = window.StudioAgentHost;
    if (!host || !host.ldb) return null;
    var tid = String(row._v3_textId || ''), sid = String(row._v3_sentenceId || '');
    if (!tid || !sid) return null;
    try {
      var ldb = await host.ldb();
      var text = await ldb.getTextById(tid);
      if (!text || !text.text_key) return null;
      var sentences = await ldb.getSentences(tid);
      var s = (sentences || []).find(function (x) { return x && String(x.id) === sid; });
      if (!s || s.order_index == null) return null;
      return { tid: tid, sid: sid, textKey: String(text.text_key), orderIndex: Number(s.order_index), he: String(s.he_plain || '') };
    } catch (_) { return null; }
  }

  // ── лестница честных состояний (R4: без тупиков; сервер = единственный авторитет) ──
  var ROOM_CLOUD_URL = '/library.html#cloud';
  function openRoomCloud() { try { window.open(ROOM_CLOUD_URL, '_blank', 'noopener'); } catch (_) {} }
  function retryBtn(row) {
    return { label: tt('studio.agent.retry', 'Повторить'), onClick: function () { runLadder(row); } };
  }

  async function runLadder(row) {
    hidePanels();
    setMeta('');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setBody('');
      showActions(tt('studio.agent.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.'), [retryBtn(row)]);
      return;
    }
    var CS = window.CloudSync;
    var session = null;
    try { session = CS ? await CS.me() : null; } catch (_) {}
    if (!session) {
      setBody('');
      showActions(tt('studio.agent.needLogin', 'Для объяснений нужен вход в облако — откройте ☁ в Зале и войдите.'),
        [{ label: tt('studio.agent.openRoomCloud', 'Открыть ☁ в Зале'), primary: true, onClick: openRoomCloud }, retryBtn(row)]);
      return;
    }
    var consents = session.consents || {};
    if (!(consents.cloud_texts && consents.cloud_texts.granted === true)) {
      setBody('');
      showActions(tt('studio.agent.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ Зала.'),
        [{ label: tt('studio.agent.openRoomCloud', 'Открыть ☁ в Зале'), primary: true, onClick: openRoomCloud }, retryBtn(row)]);
      return;
    }
    if (!(consents.agent_read_texts && consents.agent_read_texts.granted === true)) {
      setBody('');
      showConsentPanel(function () { runLadder(row); });
      return;
    }
    var anchor = await resolveAnchor(row);
    if (!anchor) {
      setBody(tt('studio.agent.noAnchor', 'Ряд не найден в локальной базе — пересохраните текст в библиотеку.'));
      return;
    }
    requestExplain(anchor, row);
  }

  async function requestExplain(anchor, row) {
    if (_inFlight) return;
    _inFlight = true;
    hidePanels();
    setBody(tt('studio.agent.loading', 'Наставник думает…'));
    _abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = _abort ? setTimeout(function () { try { _abort.abort(); } catch (_) {} }, 30000) : null;
    var r = null, aborted = false;
    try {
      r = await jpost('/api/agent/explain', {
        text_key: anchor.textKey, order_index: anchor.orderIndex,
        sentence_row_id: anchor.sid, scope_level: 'sentence_only',
      }, _abort ? _abort.signal : null);
    } catch (e) { aborted = !!(e && e.name === 'AbortError'); }
    finally { _inFlight = false; if (timer) clearTimeout(timer); _abort = null; }
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      if (aborted) { setBody(tt('studio.agent.timeout', 'Наставник не успел ответить — попробуйте ещё раз (вызов мог быть учтён).')); return; }
      if (!r && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setBody(tt('studio.agent.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.')); return;
      }
      if (code === 'TEXT_NOT_IN_CLOUD') {
        setBody('');
        showActions(tt('studio.agent.notInCloud', 'Этот текст ещё не в облаке — можно отправить его копию сейчас (только этот текст).'),
          [{ label: tt('studio.agent.pushBtn', 'Отправить и объяснить'), primary: true, onClick: function () { pushAndRetry(anchor, row); } }, retryBtn(row)]);
        return;
      }
      if (code === 'SENTENCE_NOT_FOUND') {
        setBody('');
        showActions(tt('studio.agent.staleCloud', 'Локальная версия текста новее облачной копии — обновить копию и объяснить?'),
          [{ label: tt('studio.agent.pushUpdBtn', 'Обновить копию и объяснить'), primary: true, onClick: function () { pushAndRetry(anchor, row); } }, retryBtn(row)]);
        return;
      }
      if (code === 'CLOUD_TEXTS_CONSENT_REQUIRED') { runLadder(row); return; }
      if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') { setBody(''); showConsentPanel(function () { runLadder(row); }); return; }
      if (code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT') { setBody(tt('studio.agent.limit', 'дневной лимит LLM исчерпан')); return; }
      setBody('✗ ' + tt('studio.agent.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : ''));
      return;
    }
    // LLM/фолбэк-текст — СТРОГО textContent
    var bodyText = r.text || '';
    if (r.sentence && r.sentence.he && anchor.he && stripNiq(anchor.he) !== stripNiq(r.sentence.he)) {
      bodyText += '\n\n⚠ ' + tt('studio.agent.mismatch', 'Облачная копия текста отличается от локальной — объяснение может отставать; нажмите «Обновить копию» при следующем вопросе.');
    }
    setBody(bodyText);
    var k = $('saExplainConstructs');
    if (k && Array.isArray(r.constructs) && r.constructs.length) {
      k.textContent = '⚙ ' + r.constructs.map(function (c) { return c && c.title; }).filter(Boolean).join(' · ');
      k.hidden = false;
    }
    var metaParts = [];
    if (r.from_history) metaParts.push(tt('studio.agent.fromHistory', 'из истории — без нового вызова'));
    if (r.llm_used) metaParts.push('🤖 ' + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
    else if (!r.from_history) metaParts.push(tt('studio.agent.noLlm', 'без AI: перевод и морфология офлайн') + (r.degraded_reason ? ' (' + r.degraded_reason + ')' : ''));
    if (r.usage && r.usage.limit) metaParts.push(tt('studio.agent.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
    setMeta(metaParts.join(' · '));
    followupSetup(r);
  }

  // ── адресный пуш ОДНОГО текста (критика: fullSync-комбайн в модале запрещён) ──
  var _pushBusy = false;
  async function pushAndRetry(anchor, row) {
    if (_pushBusy) return;
    _pushBusy = true;
    hidePanels();
    setBody(tt('studio.agent.pushing', 'Отправляю копию текста в облако…'));
    try {
      var host = window.StudioAgentHost;
      var ldb = await host.ldb();
      var bundle = await ldb.exportBundle({ textIds: [anchor.tid] });
      var text = await ldb.getTextById(anchor.tid);   // свежий updated_at (бамп при правках — B0.5)
      var r = await jpost('/api/learner/artifacts/put', {
        artifact_key: text.text_key, updated_at: text.updated_at, payload: bundle,
      });
      if (!r || r.ok === false) {
        setBody(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако') + ((r && r.error) ? ' (' + r.error + ')' : ''));
        _pushBusy = false;
        return;
      }
    } catch (e) {
      setBody(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако'));
      _pushBusy = false;
      return;
    }
    _pushBusy = false;
    var fresh = await resolveAnchor(row);   // порядок мог поменяться — резолвим заново
    if (!fresh) { setBody(tt('studio.agent.noAnchor', 'Ряд не найден в локальной базе — пересохраните текст в библиотеку.')); return; }
    requestExplain(fresh, row);
  }

  // ══ PAS-B2 — «Материал из текста»: sheet с тремя действиями. Детерминированные
  // движки (② заметки, frontier-квиз) — клиентские/офлайн; LLM-пункт «что стоит
  // выучить» — POST /api/agent/study-summary за ТРОЙНЫМ consent (server fail-closed;
  // agent_read_texts_digest — отдельный durable-ключ, критика wf_7f300c39 BLOCKER). ══
  var _matModal = null;
  var _matTid = null;
  var _matBusy = false;

  function ensureMaterialModal() {
    if (_matModal) return _matModal;
    ensureModal();   // общий <style> + explain-модал
    _matModal = document.createElement('div');
    _matModal.id = 'saMaterialModal';
    _matModal.className = 'sa-modal';
    _matModal.hidden = true;
    _matModal.innerHTML = MATERIAL_HTML;
    document.body.appendChild(_matModal);
    $('saMatTitle').textContent = '🤖 ' + tt('studio.agent.matTitle', 'Материал из текста');
    $('saMatNotes').textContent = '② ' + tt('studio.agent.matNotes', 'Заметки — обзор кандидатов');
    $('saMatQuiz').textContent = '🎯 ' + tt('studio.agent.matQuiz', 'Квиз i+1 по тексту');
    $('saMatSummary').textContent = '🤖 ' + tt('studio.agent.matSummary', 'Что стоит выучить (наставник)');
    _matModal.addEventListener('click', function (e) {
      if (e.target === _matModal || (e.target.getAttribute && e.target.getAttribute('data-sa-mclose') === '1')) _matModal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _matModal && !_matModal.hidden) _matModal.hidden = true;
    });
    $('saMatNotes').addEventListener('click', function () {
      _matModal.hidden = true;
      if (typeof window.v3ReviewQueueOpen === 'function' && _matTid) window.v3ReviewQueueOpen(_matTid);
    });
    $('saMatQuiz').addEventListener('click', function () {
      if (!(window.KnowledgeMapQuizLoader && typeof window.KnowledgeMapQuizLoader.open === 'function')) {
        matBody(tt('studio.agent.matQuizMissing', 'Модуль тренировки недоступен — обновите страницу.'));
        return;
      }
      _matModal.hidden = true;
      window.KnowledgeMapQuizLoader.open({ mode: 'frontier', textId: _matTid });
    });
    $('saMatSummary').addEventListener('click', function () { runSummary(); });
    return _matModal;
  }

  function matBody(text) { var b = $('saMatBody'); if (b) b.textContent = text || ''; }
  function matMeta(text) { var m = $('saMatMeta'); if (m) m.textContent = text || ''; }
  function matHidePanels() {
    var c = $('saMatConsent'); if (c) c.hidden = true;
    var a = $('saMatActions'); if (a) a.hidden = true;
  }
  function matShowActions(text, buttons) {
    var box = $('saMatActions'), t = $('saMatActionsText'), row = $('saMatActionsRow');
    if (!box || !row) return;
    t.textContent = text || '';
    row.textContent = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      if (b.primary) btn.className = 'sa-primary';
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      row.appendChild(btn);
    });
    box.hidden = false;
  }
  // situated consent-панель материала: key = 'agent_read_texts' | 'agent_read_texts_digest'
  function matShowConsent(key, copyText, onAllow) {
    var box = $('saMatConsent');
    if (!box) return;
    $('saMatConsentText').textContent = copyText;
    var allow = $('saMatAllow'), cancel = $('saMatCancel');
    allow.textContent = tt('studio.agent.consentAllow', 'Разрешить и объяснить');
    cancel.textContent = tt('studio.agent.consentCancel', 'Отмена');
    allow.onclick = async function () {
      box.hidden = true;
      try {
        var r = await jpost('/api/auth/consent', { key: key, granted: true, version: 'v1' });
        if (!r || r.ok === false) { matBody(tt('studio.agent.err', 'Не удалось получить объяснение')); return; }
      } catch (_) { matBody(tt('studio.agent.err', 'Не удалось получить объяснение')); return; }
      onAllow();
    };
    cancel.onclick = function () { box.hidden = true; };
    box.hidden = false;
  }

  async function runSummary() {
    if (_matBusy || !_matTid) return;
    matHidePanels();
    matMeta('');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      matBody(tt('studio.agent.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.'));
      return;
    }
    var CS = window.CloudSync;
    var session = null;
    try { session = CS ? await CS.me() : null; } catch (_) {}
    if (!session) {
      matBody('');
      matShowActions(tt('studio.agent.needLogin', 'Для объяснений нужен вход в облако — откройте ☁ в Зале и войдите.'),
        [{ label: tt('studio.agent.openRoomCloud', 'Открыть ☁ в Зале'), primary: true, onClick: openRoomCloud },
         { label: tt('studio.agent.retry', 'Повторить'), onClick: runSummary }]);
      return;
    }
    var consents = session.consents || {};
    if (!(consents.cloud_texts && consents.cloud_texts.granted === true)) {
      matBody('');
      matShowActions(tt('studio.agent.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ Зала.'),
        [{ label: tt('studio.agent.openRoomCloud', 'Открыть ☁ в Зале'), primary: true, onClick: openRoomCloud },
         { label: tt('studio.agent.retry', 'Повторить'), onClick: runSummary }]);
      return;
    }
    if (!(consents.agent_read_texts && consents.agent_read_texts.granted === true)) {
      matBody('');
      matShowConsent('agent_read_texts',
        tt('studio.agent.consentBody', 'Наставник отправит ЭТО предложение внешнему AI-провайдеру вместе с вашими слабыми/просроченными словами и потратит 1 вызов из дневного лимита. Разрешить чтение предложений ваших текстов (отзыв — в ☁ Зала)?'),
        runSummary);
      return;
    }
    if (!(consents.agent_read_texts_digest && consents.agent_read_texts_digest.granted === true)) {
      matBody('');
      matShowConsent('agent_read_texts_digest',
        tt('studio.agent.digestConsentBody', 'Для совета «что стоит выучить» наставник отправит внешнему AI-провайдеру ВЕСЬ этот текст (до 40 предложений с переводами и название) и ваши слабые/просроченные слова; 1 вызов из дневного лимита. Разрешить отправку целых текстов по вашему запросу (отзыв — в ☁ Зала)?'),
        runSummary);
      return;
    }
    var host = window.StudioAgentHost;
    var textKey = null;
    try {
      var ldb = await host.ldb();
      var text = await ldb.getTextById(_matTid);
      textKey = text && text.text_key ? String(text.text_key) : null;
    } catch (_) {}
    if (!textKey) { matBody(tt('studio.agent.noAnchor', 'Ряд не найден в локальной базе — пересохраните текст в библиотеку.')); return; }
    _matBusy = true;
    matBody(tt('studio.agent.loading', 'Наставник думает…'));
    var r = null;
    try { r = await jpost('/api/agent/study-summary', { text_key: textKey }); } catch (_) {}
    _matBusy = false;
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      if (code === 'AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED') {
        matBody('');
        matShowConsent('agent_read_texts_digest',
          tt('studio.agent.digestConsentBody', 'Для совета «что стоит выучить» наставник отправит внешнему AI-провайдеру ВЕСЬ этот текст (до 40 предложений с переводами и название) и ваши слабые/просроченные слова; 1 вызов из дневного лимита. Разрешить отправку целых текстов по вашему запросу (отзыв — в ☁ Зала)?'),
          runSummary);
        return;
      }
      if (code === 'TEXT_NOT_IN_CLOUD') {
        matBody('');
        matShowActions(tt('studio.agent.notInCloud', 'Этот текст ещё не в облаке — можно отправить его копию сейчас (только этот текст).'),
          [{ label: tt('studio.agent.pushBtn', 'Отправить и объяснить'), primary: true, onClick: matPushAndRetry },
           { label: tt('studio.agent.retry', 'Повторить'), onClick: runSummary }]);
        return;
      }
      matBody('✗ ' + tt('studio.agent.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : ''));
      return;
    }
    matBody(r.text || '');
    var metaParts = [tt('studio.agent.matAdvisory', 'Совет наставника, не оценка — в память не записывается.')];
    if (r.from_history) metaParts.push(tt('studio.agent.fromHistory', 'из истории — без нового вызова'));
    if (r.llm_used) metaParts.push('🤖 ' + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
    else if (!r.from_history) metaParts.push(tt('studio.agent.noLlm', 'без AI: перевод и морфология офлайн') + (r.degraded_reason ? ' (' + r.degraded_reason + ')' : ''));
    if (r.usage && r.usage.limit) metaParts.push(tt('studio.agent.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
    matMeta(metaParts.join(' · '));
  }

  async function matPushAndRetry() {
    if (_matBusy || !_matTid) return;
    _matBusy = true;
    matHidePanels();
    matBody(tt('studio.agent.pushing', 'Отправляю копию текста в облако…'));
    try {
      var host = window.StudioAgentHost;
      var ldb = await host.ldb();
      var bundle = await ldb.exportBundle({ textIds: [_matTid] });
      var text = await ldb.getTextById(_matTid);
      var r = await jpost('/api/learner/artifacts/put', {
        artifact_key: text.text_key, updated_at: text.updated_at, payload: bundle,
      });
      if (!r || r.ok === false) {
        matBody(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако') + ((r && r.error) ? ' (' + r.error + ')' : ''));
        _matBusy = false;
        return;
      }
    } catch (_) {
      matBody(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако'));
      _matBusy = false;
      return;
    }
    _matBusy = false;
    runSummary();
  }

  function openMaterial(tid) {
    if (!tid) return;
    _matTid = String(tid);
    ensureMaterialModal();
    matHidePanels();
    matBody('');
    matMeta('');
    _matModal.hidden = false;
  }

  // Кнопка «🤖 Материал» в тулбаре редактора (#tableEditToolbar) — той же post-render
  // инъекцией; появляется только когда таблица library-linked (есть _v3_textId).
  function injectMaterialButton() {
    if (document.body && document.body.classList.contains('room-mode')) return;
    var bar = document.getElementById('tableEditToolbar');
    if (!bar || document.getElementById('saMaterialBtn')) return;
    var host = window.StudioAgentHost;
    if (!host || !host.getRow) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'saMaterialBtn';
    btn.textContent = '🤖 ' + tt('studio.agent.matBtn', 'Материал');
    btn.title = tt('studio.agent.matTitle', 'Материал из текста');
    btn.addEventListener('click', function () {
      var tid = null;
      for (var i = 0; i < 2000; i++) {
        var row = host.getRow(i);
        if (row === undefined) break;   // за концом currentTableData
        if (row && row._v3_textId) { tid = String(row._v3_textId); break; }
      }
      if (!tid) { alertHonest(); return; }
      openMaterial(tid);
    });
    bar.appendChild(btn);
    function alertHonest() {
      ensureMaterialModal();
      _matTid = null;
      matHidePanels(); matMeta('');
      matBody(tt('studio.agent.matNoText', 'Сохраните текст в библиотеку, чтобы собрать материал.'));
      _matModal.hidden = false;
    }
  }

  // ── инъекция 🤖-кнопок POST-RENDER (renderTable заморожен byte-parity гейтом
  // smoke:reader-parity — паттерн studio-karaoke: обёртка, не правка). room-mode
  // (index.html?room=1 — читальный вид Зала) — скип: там свой explain-контур. ──
  function injectRowButtons() {
    if (document.body && document.body.classList.contains('room-mode')) return;
    var host = window.StudioAgentHost;
    if (!host || !host.getRow) return;
    var cells = document.querySelectorAll('td.col-action-cell');
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.querySelector('.row-agent-btn')) continue;
      var tts = cell.querySelector('.row-tts-btn[data-row-idx]');
      if (!tts) continue;
      var idx = Number(tts.getAttribute('data-row-idx'));
      var row = Number.isFinite(idx) ? host.getRow(idx) : null;
      if (!row || !row._v3_sentenceId || !row._v3_textId) continue;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-agent-btn';
      btn.setAttribute('data-row-idx', String(idx));
      btn.title = tt('studio.agent.title', 'Наставник · объяснение');
      btn.setAttribute('aria-label', tt('studio.agent.title', 'Наставник · объяснение'));
      btn.textContent = '🤖';
      var edits = cell.querySelector('.row-edit-actions');
      if (edits) cell.insertBefore(btn, edits); else cell.appendChild(btn);
    }
  }
  function wrapRenderTable() {
    var orig = window.renderTable;
    if (typeof orig !== 'function' || orig.__saWrapped) return false;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { injectRowButtons(); } catch (_) {}
      try { injectMaterialButton(); } catch (_) {}   // PAS-B2 — кнопка тулбара
      return out;
    };
    wrapped.__saWrapped = true;
    window.renderTable = wrapped;
    try { injectRowButtons(); } catch (_) {}
    try { injectMaterialButton(); } catch (_) {}
    return true;
  }
  if (!wrapRenderTable()) {
    document.addEventListener('DOMContentLoaded', wrapRenderTable);
  }

  // ── вход: делегированный клик по .row-agent-btn (инъекция выше) ──
  function startExplain(rowIdx) {
    var host = window.StudioAgentHost;
    var row = host && host.getRow ? host.getRow(rowIdx) : null;
    if (!row || !row._v3_sentenceId || !row._v3_textId) return;
    ensureModal();
    hidePanels();
    var he = $('saExplainHe');
    if (he) he.textContent = row.he_niqqud || row.he || '';
    setBody('');
    setMeta('');
    _modal.hidden = false;
    runLadder(row);
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.row-agent-btn') : null;
    if (!b) return;
    var idx = Number(b.getAttribute('data-row-idx'));
    if (Number.isFinite(idx)) startExplain(idx);
  });

  window.StudioAgent = { explainRow: startExplain };
})();
