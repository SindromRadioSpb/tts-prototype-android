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

  // PAS-F1 — BYOK-ключ агента: литералы БАЙТ-РАВНЫ library-ui.js (критика UX-6 — гейт
  // сверяет); ключ только в localStorage, вплетается в body ТОЛЬКО LLM-тратящих запросов.
  var BYOK_LS_PROVIDER = 'agent.byok.provider';
  var BYOK_LS_KEY = 'agent.byok.key';
  var BYOK_LLM_URL_RE = /\/api\/agent\/(explain(\/followup)?|explain-word|comprehension|study-summary|draft-retell|roleplay\/turn|writing\/review|next-text\/explain|plan)$/;
  function agentByok() {
    try {
      var provider = localStorage.getItem(BYOK_LS_PROVIDER) || '';
      var key = (localStorage.getItem(BYOK_LS_KEY) || '').trim();
      if ((provider !== 'openrouter' && provider !== 'gemini') || key.length < 20) return null;
      return { provider: provider, key: key };
    } catch (_) { return null; }
  }
  function jpost(url, body, signal) {
    var b = BYOK_LLM_URL_RE.test(url) ? agentByok() : null;
    var opts = {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LP-CSRF': CSRF() },
      body: JSON.stringify(b ? Object.assign({}, body, { byok: b }) : body),
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
    '.sa-modal .sa-he-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
    '.sa-modal .sa-he-row #saExplainSpeak{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:8px;cursor:pointer;font-size:14px;padding:6px 8px;flex:0 0 auto}',
    '.sa-modal .sa-he{direction:rtl;text-align:right;font-size:19px;line-height:1.7;padding:8px 10px;background:rgba(255,255,255,.05);border-radius:10px;flex:1}',
    '.sa-modal .sa-ru{font-size:13px;opacity:.75;margin:0 0 8px 2px}',
    '.sa-modal .sa-ru[hidden]{display:none!important}',
    '.sa-modal .sa-extra{margin-top:10px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px}',
    '.sa-modal .sa-extra[hidden]{display:none!important}',
    '.sa-modal .sa-extra>button{padding:7px 12px;border-radius:8px;border:1px dashed rgba(120,160,220,.6);background:rgba(120,160,220,.08);color:inherit;cursor:pointer;font-size:13.5px}',
    '.sa-modal .sa-extra-out{margin-top:8px;font-size:13.5px}',
    '.sa-modal .sa-extra-out[hidden]{display:none!important}',
    '.sa-modal .sa-plate{font-size:12.5px;opacity:.8;padding:6px 8px;background:rgba(255,193,7,.08);border-radius:8px;margin-bottom:6px}',
    '.sa-modal .sa-q{font-weight:600;margin:8px 0 4px}',
    '.sa-modal .sa-opts{display:flex;flex-direction:column;gap:6px}',
    '.sa-modal .sa-opts button{text-align:left;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;cursor:pointer}',
    '.sa-modal .sa-opts button.sa-right{border-color:#2f855a;background:rgba(47,133,90,.25)}',
    '.sa-modal .sa-opts button.sa-wrong{border-color:#c53030;background:rgba(197,48,48,.25)}',
    '.sa-modal .sa-draft-he{direction:rtl;text-align:right;font-size:17px;line-height:1.6;margin-top:6px}',
    '.sa-modal .sa-draft-ru{font-size:12.5px;opacity:.7;margin-bottom:4px}',
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
    // PAS-C1b — шит grounded-диалога (порт Room-шита в sa-стиле); ловушка №1:
    // width:auto по id против глобального mobile button{width:100%}
    '#saTalkSheet{position:fixed;inset:0;z-index:9600}',
    '#saTalkSheet[hidden]{display:none!important}',
    '#saTalkSheet button{width:auto}',
    '.sa-talk-backdrop{position:absolute;inset:0;background:rgba(10,14,20,.55)}',
    '.sa-talk-card{position:absolute;left:0;right:0;bottom:0;max-height:88vh;display:flex;flex-direction:column;background:var(--panel-bg,#141a22);color:var(--text,#e8eef5);border:1px solid rgba(255,255,255,.12);border-radius:14px 14px 0 0;padding:12px 14px;box-shadow:0 -8px 30px rgba(0,0,0,.5)}',
    '@media (min-width:700px){.sa-talk-card{left:50%;right:auto;transform:translateX(-50%);width:640px;bottom:4vh;border-radius:14px}}',
    '.sa-talk-head{display:flex;align-items:center;gap:8px}',
    '.sa-talk-title{font-weight:600;font-size:14px;flex:1;min-width:0}',
    '.sa-talk-end{padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;font-size:12px;cursor:pointer}',
    '.sa-talk-x{background:none;border:none;color:inherit;font-size:18px;cursor:pointer;padding:2px 8px}',
    '.sa-talk-passage{margin-top:8px;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px 10px;font-size:13px}',
    '.sa-talk-passage summary{cursor:pointer;opacity:.75;font-size:12px}',
    '.sa-talk-feed{flex:1;min-height:80px;overflow-y:auto;margin-top:8px;display:flex;flex-direction:column;gap:6px}',
    '.sa-talk-m{align-self:flex-start;max-width:88%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:10px 10px 10px 4px;padding:8px 11px;font-size:15px;direction:rtl;text-align:right}',
    '.sa-talk-mru{align-self:flex-start;max-width:88%;font-size:12px;opacity:.7;padding:0 4px}',
    '.sa-talk-l{align-self:flex-end;max-width:88%;background:rgba(43,108,176,.25);border:1px solid rgba(43,108,176,.5);border-radius:10px 10px 4px 10px;padding:8px 11px;font-size:14px}',
    '.sa-talk-op{font-size:13px;background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.2);border-radius:10px;padding:8px 11px}',
    '.sa-talk-err{margin-top:6px;font-size:12px;color:#f56565}',
    '.sa-talk-err[hidden]{display:none!important}',
    '.sa-talk-ack,.sa-talk-confirm{margin-top:8px;padding:10px 12px;border:1px solid rgba(255,193,7,.35);border-radius:10px;background:rgba(255,193,7,.06);font-size:12.5px}',
    '.sa-talk-ack[hidden],.sa-talk-confirm[hidden]{display:none!important}',
    '.sa-talk-inputrow{display:flex;gap:8px;margin-top:8px}',
    '.sa-talk-inputrow input{flex:1;min-width:0;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:inherit;font-size:14px}',
    '.sa-talk-inputrow button{padding:9px 14px;border-radius:8px;border:1px solid #2b6cb0;background:#2b6cb0;color:#fff;font-size:14px;font-weight:700;cursor:pointer}',
    '.sa-talk-inputrow .sa-talk-voice{min-width:42px;padding-inline:10px;border-color:rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:inherit}',
    '.sa-talk-inputrow .sa-talk-voice[aria-pressed="true"]{border-color:#f56565;color:#f56565}',
    '.sa-talk-voice-status{min-height:1.35em;margin-top:5px;font-size:12px;opacity:.78}',
    '.sa-talk-status{margin-top:6px;font-size:12px;opacity:.7}',
  ].join('\n');

  // Статический шаблон модала — ЕДИНСТВЕННОЕ innerHTML-присваивание файла, без
  // интерполяции (гейт smoke:studio-agent следит). Всё динамическое — textContent.
  var MODAL_HTML =
    '<div class="sa-card" role="dialog" aria-modal="true" aria-labelledby="saExplainTitle">' +
    '<div class="sa-head"><div class="sa-title" id="saExplainTitle"></div>' +
    '<button type="button" class="sa-close" data-sa-close="1" aria-label="close">×</button></div>' +
    '<div class="sa-he-row"><button type="button" id="saExplainSpeak" aria-label="tts">🔊</button>' +
    '<div class="sa-he" id="saExplainHe" dir="rtl" lang="he"></div></div>' +
    '<div class="sa-ru" id="saExplainRu" hidden></div>' +
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
    '<div class="sa-extra" id="saExplainComp" hidden>' +
    '<button type="button" id="saExplainCompBtn"></button>' +
    '<div class="sa-extra-out" id="saExplainCompOut" hidden></div></div>' +
    '<div class="sa-extra" id="saExplainDraft" hidden>' +
    '<button type="button" id="saExplainDraftBtn"></button>' +
    '<div class="sa-extra-out" id="saExplainDraftOut" hidden></div></div>' +
    '<div class="sa-extra" id="saExplainTalk" hidden>' +
    '<button type="button" id="saExplainTalkBtn"></button></div>' +
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

  // PAS-C1b — ТРЕТИЙ статический шаблон (гейт: ровно ТРИ innerHTML, все — литералы):
  // шит grounded-диалога «обсудить прочитанное», порт Room-шита (library-ui.js).
  var TALK_HTML =
    '<div class="sa-talk-backdrop" data-sa-talk-hide="1"></div>' +
    '<div class="sa-talk-card" role="dialog" aria-modal="true" aria-labelledby="saTalkTitle">' +
    '<div class="sa-talk-head"><span class="sa-talk-title" id="saTalkTitle"></span>' +
    '<button type="button" class="sa-talk-end" data-sa-talk-end="1"></button>' +
    '<button type="button" class="sa-talk-x" data-sa-talk-hide="1" aria-label="close">✕</button></div>' +
    '<details class="sa-talk-passage"><summary id="saTalkPassageSum"></summary>' +
    '<div id="saTalkPassageBody"></div></details>' +
    '<div class="sa-plate" id="saTalkPlate"></div>' +
    '<div class="sa-talk-feed" id="saTalkFeed"></div>' +
    '<div class="sa-talk-err" id="saTalkErr" hidden></div>' +
    '<div class="sa-talk-ack" id="saTalkAck" hidden></div>' +
    '<div class="sa-talk-confirm" id="saTalkConfirm" hidden>' +
    '<div id="saTalkConfirmText"></div>' +
    '<div class="sa-actions-row"><button type="button" class="sa-primary" id="saTalkConfirmYes"></button>' +
    '<button type="button" id="saTalkConfirmNo"></button></div></div>' +
    '<div class="sa-talk-inputrow"><input type="text" id="saTalkInput" maxlength="400" dir="auto" lang="he" autocomplete="off">' +
    '<button type="button" class="sa-talk-voice" id="saTalkVoice" hidden>🎙</button>' +
    '<button type="button" id="saTalkSend" aria-label="send">➤</button></div>' +
    '<div class="sa-talk-voice-status" id="saTalkVoiceStatus" role="status" aria-live="polite"></div>' +
    '<div class="sa-talk-status" id="saTalkStatus"></div>' +
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
    // Паритет с Залом (owner-фидбэк 2026-07-12): 🔊 = штатная per-row озвучка Студии
    // (клик по .row-tts-btn ряда — кэш/karaoke переиспользуются), квиз и пересказ ниже.
    $('saExplainSpeak').addEventListener('click', function () {
      if (_currentRowIdx == null) return;
      var b = document.querySelector('.row-tts-btn[data-row-idx="' + _currentRowIdx + '"]');
      if (b) b.click();
    });
    $('saExplainCompBtn').addEventListener('click', compRun);
    $('saExplainDraftBtn').addEventListener('click', draftRun);
    $('saExplainTalkBtn').addEventListener('click', talkOpen);   // PAS-C1b
    return _modal;
  }

  var _abort = null;          // AbortController текущего запроса
  var _inFlight = false;      // один explain на Студию (двойной тап не жжёт леджер)
  var _followupCtx = null;    // { explanationId, left, baseText }
  var _followupBusy = false;
  var _currentRowIdx = null;  // ряд текущего модала (🔊 + якорь квиза/пересказа)
  var _extraCtx = null;       // { textKey, orderIndex } — квиз/пересказ после успешного explain
  var _compBusy = false;
  var _draftBusy = false;

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
    var cp = $('saExplainComp'); if (cp) cp.hidden = true;
    var co = $('saExplainCompOut'); if (co) { co.hidden = true; co.textContent = ''; }
    var dr = $('saExplainDraft'); if (dr) dr.hidden = true;
    var dro = $('saExplainDraftOut'); if (dro) { dro.hidden = true; dro.textContent = ''; }
    var tk = $('saExplainTalk'); if (tk) tk.hidden = true;   // PAS-C1b
    _extraCtx = null;
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
    if (!(consents.cloud_texts && consents.cloud_texts.granted === true && String(consents.cloud_texts.version || "") === ((window.CloudSync && window.CloudSync.CLOUD_TEXTS_CONSENT_VERSION) || "v2"))) {   // P1: карта v2 — v1-грант ведёт в ☁ на re-consent
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
    // PAS-C1b — диалог доступен НЕЗАВИСИМО от исхода/цены explain (критика wf_5ea38001):
    // якорь уже live-резолвлен — кнопка ставится до запроса, не в success-ветке.
    talkSetup(anchor, row);
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
    if (r.llm_used) metaParts.push('🤖 ' + (r.key_source === 'byok' ? tt('room.cloud.byokProvenance', 'ваш ключ') + ' · ' : '') + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
    else if (!r.from_history) metaParts.push(tt('studio.agent.noLlm', 'без AI: перевод и морфология офлайн') + (r.degraded_reason ? ' (' + r.degraded_reason + ')' : ''));
    if (r.usage && r.usage.limit) metaParts.push(tt('studio.agent.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit);
    setMeta(metaParts.join(' · '));
    followupSetup(r);
    extrasSetup(anchor);   // паритет с Залом: квиз + пересказ (owner-фидбэк 2026-07-12)
  }

  // ── «Проверь меня по абзацу» + «Пересказ проще» (паритет модала с Залом) ─────
  function extrasSetup(anchor) {
    _extraCtx = { textKey: anchor.textKey, orderIndex: anchor.orderIndex };
    var cp = $('saExplainComp'), cb = $('saExplainCompBtn');
    if (cp) { cp.hidden = false; }
    if (cb) { cb.disabled = false; cb.textContent = '🧠 ' + tt('studio.agent.compBtn', 'Проверь меня по абзацу'); }
    var dr = $('saExplainDraft'), db = $('saExplainDraftBtn');
    if (dr) { dr.hidden = false; }
    if (db) { db.disabled = false; db.textContent = '✍️ ' + tt('studio.agent.draftBtn', 'Пересказ проще'); }
  }
  async function compRun() {
    if (_compBusy || !_extraCtx) return;
    var out = $('saExplainCompOut'), btn = $('saExplainCompBtn');
    if (!out) return;
    // first-use раскрытие объёма (та же кладовка, что Зал — не спрашиваем дважды)
    var acked = false;
    try { acked = localStorage.getItem('room.ownCompAck') === '1'; } catch (_) {}
    if (!acked) {
      out.hidden = false; out.textContent = '';
      var plate = document.createElement('div');
      plate.className = 'sa-plate';
      plate.textContent = tt('studio.agent.ownCompAck', 'Наставник отправит внешнему LLM до 5 предложений этого текста (начиная с выбранного) и потратит 1 вызов из дневного лимита. Продолжить?');
      out.appendChild(plate);
      var row = document.createElement('div'); row.className = 'sa-actions-row';
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'sa-primary';
      ok.textContent = tt('studio.agent.ackOk', 'Понятно, продолжить');
      ok.addEventListener('click', function () { try { localStorage.setItem('room.ownCompAck', '1'); } catch (_) {} out.textContent = ''; compRun(); });
      var no = document.createElement('button'); no.type = 'button';
      no.textContent = tt('studio.agent.consentCancel', 'Отмена');
      no.addEventListener('click', function () { out.hidden = true; out.textContent = ''; });
      row.appendChild(ok); row.appendChild(no); out.appendChild(row);
      return;
    }
    _compBusy = true;
    if (btn) btn.disabled = true;
    out.hidden = false; out.textContent = tt('studio.agent.loading', 'Наставник думает…');
    var r = null;
    try { r = await jpost('/api/agent/comprehension', { text_key: _extraCtx.textKey, order_index: _extraCtx.orderIndex }); } catch (_) {}
    _compBusy = false;
    if (btn) btn.disabled = false;
    if (!r || !r.ok || !Array.isArray(r.questions)) {
      var code = (r && r.error) || '';
      out.textContent = code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT' ? tt('studio.agent.limit', 'дневной лимит LLM исчерпан')
        : code === 'TEXT_NOT_IN_CLOUD' ? tt('studio.agent.notInCloud', 'Этот текст ещё не в облаке — можно отправить его копию сейчас (только этот текст).')
        : tt('studio.agent.compFail', 'Не получилось составить вопросы — попробуйте ещё раз.');
      return;
    }
    out.textContent = '';
    var pl = document.createElement('div');
    pl.className = 'sa-plate';
    pl.textContent = '🧠 ' + tt('studio.agent.compPlate', 'Понимание · проверка наставником, не оценка — в память не записывается.');
    out.appendChild(pl);
    r.questions.forEach(function (q) {
      var qd = document.createElement('div'); qd.className = 'sa-q'; qd.textContent = q.question;
      out.appendChild(qd);
      var opts = document.createElement('div'); opts.className = 'sa-opts';
      (q.options || []).forEach(function (optText, oi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = optText;
        b.addEventListener('click', function () {
          opts.querySelectorAll('button').forEach(function (x, xi) {
            x.disabled = true;
            if (xi === q.correct_index) x.classList.add('sa-right');
          });
          if (oi !== q.correct_index) b.classList.add('sa-wrong');
        });
        opts.appendChild(b);
      });
      out.appendChild(opts);
    });
    if (r.usage && r.usage.limit) {
      var um = document.createElement('div'); um.className = 'sa-plate';
      um.textContent = tt('studio.agent.usage', 'AI сегодня') + ': ' + r.usage.user_llm_calls + '/' + r.usage.limit + (r.key_source === 'byok' ? ' · 🤖 ' + tt('room.cloud.byokProvenance', 'ваш ключ') : '');
      out.appendChild(um);
    }
  }
  async function draftRun() {
    if (_draftBusy || !_extraCtx) return;
    var out = $('saExplainDraftOut'), btn = $('saExplainDraftBtn');
    if (!out) return;
    _draftBusy = true;
    if (btn) btn.disabled = true;
    out.hidden = false; out.textContent = tt('studio.agent.loading', 'Наставник думает…');
    var r = null;
    try { r = await jpost('/api/agent/draft-retell', { text_key: _extraCtx.textKey, order_index: _extraCtx.orderIndex }); } catch (_) {}
    _draftBusy = false;
    if (btn) btn.disabled = false;
    if (!r || !r.ok || !r.draft || !Array.isArray(r.draft.lines)) {
      var code = (r && r.error) || '';
      out.textContent = code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT' ? tt('studio.agent.limit', 'дневной лимит LLM исчерпан')
        : code === 'DRAFT_INVALID' ? tt('studio.agent.draftInvalid', 'Пересказ не получился — попробуйте ещё раз.')
        : '✗ ' + tt('studio.agent.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
      return;
    }
    out.textContent = '';
    var pl2 = document.createElement('div');
    pl2.className = 'sa-plate';
    pl2.textContent = '✍️ ' + tt('studio.agent.draftPlate', 'Черновик наставника — простой пересказ. «В редактор» вставит его как несохранённый текст (сборка таблицы штатным путём).');
    out.appendChild(pl2);
    r.draft.lines.forEach(function (l) {
      var he = document.createElement('div');
      he.className = 'sa-draft-he'; he.setAttribute('dir', 'rtl'); he.setAttribute('lang', 'he');
      he.textContent = l.he;
      out.appendChild(he);
      if (l.ru) { var ru = document.createElement('div'); ru.className = 'sa-draft-ru'; ru.textContent = l.ru; out.appendChild(ru); }
    });
    var row2 = document.createElement('div'); row2.className = 'sa-actions-row';
    var ins = document.createElement('button'); ins.type = 'button'; ins.className = 'sa-primary';
    ins.textContent = tt('studio.agent.draftInsert', 'В редактор');
    ins.addEventListener('click', function () {
      ins.disabled = true;
      closeModal();
      applyDraftToComposer({ source_text: r.draft.lines.map(function (l) { return l.he; }).join('\n') });
    });
    row2.appendChild(ins);
    out.appendChild(row2);
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

  // ══ PAS-C1b — «Обсудить прочитанное»: grounded-диалог, порт Room-шита (паритет
  // модала — owner-ожидание из B-фидбэка). Сессия СЕРВЕРНАЯ эфемерная (класс D);
  // hide≠stop (Escape/backdrop прячут, сессия живёт до TTL, reopen = GET state);
  // завершение — только кнопкой с confirm при потраченных ходах. Локале-ключи —
  // ОБЩИЕ room.talk.* (те же файлы локалей грузятся обеими поверхностями; копии
  // идентичны by construction — R4-паритет). Личный текст: ack-ключ room.ownTalkAck
  // (та же кладовка, что Зал — не спрашиваем дважды). ══
  var _talkSheet = null;
  var _talkCtx = null;   // { textKey, orderIndex, rowId, tid, row, sessionId, turnsUsed, turnsLeft, busy }
  var _talkVoice = null; // Wave 2 C3a — DOM-only draft controller, never Send/API owner.

  function talkSetup(anchor, row) {
    var btn = $('saExplainTalkBtn'), box = $('saExplainTalk');
    if (!btn || !box) return;
    if (!_talkCtx || _talkCtx.textKey !== anchor.textKey || _talkCtx.orderIndex !== anchor.orderIndex) {
      _talkCtx = { textKey: anchor.textKey, orderIndex: anchor.orderIndex, rowId: anchor.sid || null,
        tid: anchor.tid || null, row: row || null, sessionId: null, turnsUsed: 0, turnsLeft: null, busy: false };
    } else {
      _talkCtx.row = row || _talkCtx.row;
    }
    box.hidden = false;
    btn.disabled = false;
    btn.textContent = '💬 ' + tt('room.talk.btn', 'Обсудить прочитанное');
  }
  function ensureTalkSheet() {
    if (_talkSheet) return _talkSheet;
    ensureModal();
    _talkSheet = document.createElement('div');
    _talkSheet.id = 'saTalkSheet';
    _talkSheet.hidden = true;
    _talkSheet.innerHTML = TALK_HTML;
    document.body.appendChild(_talkSheet);
    $('saTalkTitle').textContent = '💬 ' + tt('room.talk.title', 'Разговор о прочитанном');
    $('saTalkPassageSum').textContent = '📖 ' + tt('room.talk.passage', 'Отрывок');
    $('saTalkPlate').textContent = '💬 ' + tt('room.talk.plate', 'Не оценка — в память не записывается, реплики не сохраняются. Иврит наставника сгенерирован ИИ и может содержать ошибки.');
    $('saTalkConfirmText').textContent = tt('room.talk.confirmStop', 'Завершить диалог? Ходы не вернутся.');
    $('saTalkConfirmYes').textContent = tt('room.talk.confirmYes', 'Завершить');
    $('saTalkConfirmNo').textContent = tt('room.talk.confirmNo', 'Продолжить диалог');
    $('saTalkInput').placeholder = tt('room.talk.inputPh', 'Ваша реплика (лучше на иврите)…');
    _talkSheet.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-sa-talk-hide') === '1') { talkHide(); return; }
      if (t && t.getAttribute && t.getAttribute('data-sa-talk-end') === '1') { talkEndClick(); return; }
    });
    // Escape = скрыть (НЕ-деструктивно; сессия живёт до TTL)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _talkSheet && !_talkSheet.hidden) talkHide();
    });
    $('saTalkConfirmYes').addEventListener('click', function () { $('saTalkConfirm').hidden = true; talkStop(); });
    $('saTalkConfirmNo').addEventListener('click', function () { $('saTalkConfirm').hidden = true; });
    $('saTalkSend').addEventListener('click', talkSend);
    $('saTalkInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); talkSend(); } });
    var VD = window.LinguistProVoiceDraft;
    if (VD && typeof VD.create === 'function') {
      _talkVoice = VD.create({
        input: $('saTalkInput'), button: $('saTalkVoice'), status: $('saTalkVoiceStatus'), language: 'he-IL',
        messages: {
          micLabel: tt('room.talk.voiceMic', 'Произнести реплику на иврите'),
          stopLabel: tt('room.talk.voiceStop', 'Остановить запись'),
          listening: tt('room.talk.voiceListening', 'Слушаю иврит… Нажмите стоп для отмены.'),
          ready: tt('room.talk.voiceReady', 'Речь добавлена как черновик. Проверьте текст и отправьте сами.'),
          cancelled: tt('room.talk.voiceCancelled', 'Запись отменена — можно продолжить печатать.'),
          timeout: tt('room.talk.voiceTimeout', 'Время ожидания истекло — можно продолжить печатать.'),
          denied: tt('room.talk.voiceDenied', 'Доступ к микрофону недоступен — можно продолжить печатать.'),
          error: tt('room.talk.voiceError', 'Речь не распознана — можно продолжить печатать.'),
          privacy: tt('room.talk.voicePrivacy', 'Речь распознаёт браузер; приложение не получает и не хранит аудио.'),
        },
      });
    }
    var endB = _talkSheet.querySelector('.sa-talk-end');
    if (endB) endB.textContent = tt('room.talk.stop', 'Завершить');
    return _talkSheet;
  }
  // C3a visual gate hook: opens the real Studio sheet without a role-play/API
  // session. The 380x844 oracle uses it to inspect all three locales and RTL.
  try { window.__c3aEnsureStudioTalkSheet = ensureTalkSheet; } catch (_) {}
  function talkHide() {
    if (_talkVoice) _talkVoice.cancel(true);
    if (_talkSheet) _talkSheet.hidden = true;
  }
  function talkErr(msg) {
    var e = $('saTalkErr'); if (!e) return;
    e.textContent = msg || ''; e.hidden = !msg;
  }
  var _TALK_FATAL = { SESSION_NOT_FOUND: 1, TEXT_NOT_IN_CLOUD: 1, SENTENCE_NOT_FOUND: 1,
    CLOUD_TEXTS_CONSENT_REQUIRED: 1, AGENT_READ_TEXTS_CONSENT_REQUIRED: 1 };
  function talkErrMsg(code, providerError) {
    // PAS-F1: постоянная мисконфигурация ключа ≠ транзиент (критика UX-1/UX-2)
    if (code === 'BYOK_INVALID') return tt('room.cloud.byokInvalid', 'Ваш ключ не подходит выбранному провайдеру — проверьте его в «⚙ Наставник».');
    if (code === 'BYOK_FAILED') {
      var pe = String(providerError || '');
      if (pe === '429') return tt('room.cloud.byokQuota', 'У вашего ключа закончилась квота провайдера на сегодня.');
      if (pe === '401' || pe === '403') return tt('room.cloud.byokRejected', 'Ключ не принят провайдером — проверьте его в «⚙ Наставник».');
      return tt('room.cloud.byokFailed', 'Вызов на вашем ключе не прошёл — проверьте ключ в «⚙ Наставник».') + (pe ? ' (' + pe + ')' : '');
    }
    if (code === 'SESSION_NOT_FOUND') return tt('room.talk.expired', 'Сессия завершена (истекла или начата новая).');
    if (code === 'TURN_IN_FLIGHT') return tt('room.talk.busy', 'Наставник ещё отвечает…');
    if (code === 'TURNS_LIMIT') return tt('room.talk.turnsOut', 'Ходы этой сессии исчерпаны — завершите и начните новую.');
    if (code === 'ROLEPLAY_DAILY_LIMIT') return tt('room.talk.dailyOut', 'Дневной лимит диалогов исчерпан — продолжите завтра.');
    if (code === 'USER_LIMIT' || code === 'GLOBAL_LIMIT') return tt('studio.agent.limit', 'дневной лимит LLM исчерпан');
    if (code === 'LLM_UNAVAILABLE') return tt('studio.agent.noLlm', 'без AI: перевод и морфология офлайн');
    if (code === 'ROLEPLAY_INVALID') return tt('room.talk.invalid', 'Ответ не получился — попробуйте ещё раз (вызов учтён).');
    if (code === 'CLOUD_TEXTS_CONSENT_REQUIRED') return tt('studio.agent.needTexts', 'Сначала включите «Синхронизировать Мои тексты» в ☁ Зала.');
    if (code === 'AGENT_READ_TEXTS_CONSENT_REQUIRED') return tt('room.explain.needConsent', 'Разрешите наставнику читать тексты (галочка 🤖 в доме наставника).');
    return '✗ ' + tt('studio.agent.err', 'Не удалось получить объяснение') + (code ? ' (' + code + ')' : '');
  }
  function talkRenderPassage(rows) {
    var box = $('saTalkPassageBody'); if (!box) return;
    box.textContent = '';
    (rows || []).forEach(function (r) {
      var he = document.createElement('div');
      he.className = 'sa-draft-he'; he.setAttribute('dir', 'rtl'); he.setAttribute('lang', 'he');
      he.textContent = r.he; box.appendChild(he);
      if (r.ru) { var ru = document.createElement('div'); ru.className = 'sa-draft-ru'; ru.textContent = r.ru; box.appendChild(ru); }
    });
  }
  function talkRenderFeed(transcript, openingText) {
    var feed = $('saTalkFeed'); if (!feed) return;
    feed.textContent = '';
    if (openingText) {
      var op = document.createElement('div'); op.className = 'sa-talk-op';
      op.textContent = '🤖 ' + openingText; feed.appendChild(op);
    }
    (transcript || []).forEach(function (t) {
      if (t.who === 'mentor') {
        var m = document.createElement('div'); m.className = 'sa-talk-m';
        m.setAttribute('lang', 'he'); m.textContent = t.he || ''; feed.appendChild(m);
        if (t.ru) { var mr = document.createElement('div'); mr.className = 'sa-talk-mru'; mr.textContent = t.ru; feed.appendChild(mr); }
      } else {
        var l = document.createElement('div'); l.className = 'sa-talk-l';
        l.setAttribute('dir', 'auto'); l.textContent = t.text || ''; feed.appendChild(l);
      }
    });
    try { feed.scrollTop = feed.scrollHeight; } catch (_) {}
  }
  function talkRenderStatus(usage) {
    var s = $('saTalkStatus'); if (!s || !_talkCtx) return;
    var bits = [];
    if (_talkCtx.turnsLeft != null) bits.push(tt('room.talk.turns', 'Ходы') + ': ' + _talkCtx.turnsUsed + '/' + (_talkCtx.turnsUsed + _talkCtx.turnsLeft));
    if (usage && usage.limit) bits.push(tt('studio.agent.usage', 'AI сегодня') + ': ' + usage.user_llm_calls + '/' + usage.limit);
    if (_talkCtx.lastKeySource === 'byok') bits.push('🤖 ' + tt('room.cloud.byokProvenance', 'ваш ключ'));   // PAS-F1 (UX-4)
    s.textContent = bits.join(' · ');
  }
  async function talkOpen() {
    if (!_talkCtx) return;
    closeModal();   // модал уступает место шиту
    var sheet = ensureTalkSheet();
    sheet.hidden = false;
    talkErr('');
    var c = $('saTalkConfirm'); if (c) c.hidden = true;
    if (_talkCtx.sessionId) { await talkResync(); return; }
    talkAckFlow();
  }
  function talkAckFlow() {
    // Студия видит только ЛИЧНЫЕ тексты → ack-ключ личного пути (общая кладовка с Залом)
    var acked = false;
    try { acked = localStorage.getItem('room.ownTalkAck') === '1'; } catch (_) {}
    if (acked) { talkStart(); return; }
    var ack = $('saTalkAck'); if (!ack) return;
    ack.textContent = '';
    var txt = document.createElement('div');
    txt.textContent = tt('room.talk.ownAck', 'Наставник отправит внешнему LLM до 5 предложений вашего текста и ваши реплики; 1 вызов из дневного лимита за каждый ход диалога. Продолжить?');
    ack.appendChild(txt);
    var row = document.createElement('div'); row.className = 'sa-actions-row';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'sa-primary';
    ok.textContent = tt('room.talk.start', 'Начать разговор');
    ok.addEventListener('click', function () { try { localStorage.setItem('room.ownTalkAck', '1'); } catch (_) {} ack.hidden = true; talkStart(); });
    var no = document.createElement('button'); no.type = 'button';
    no.textContent = tt('studio.agent.consentCancel', 'Отмена');
    no.addEventListener('click', function () { ack.hidden = true; talkHide(); });
    row.appendChild(ok); row.appendChild(no); ack.appendChild(row);
    ack.hidden = false;
  }
  async function talkStart() {
    if (!_talkCtx || _talkCtx.busy) return;
    talkErr('');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      talkErr(tt('studio.agent.offline', '🤖 Наставник доступен онлайн — объяснение появится при подключении.')); return;
    }
    _talkCtx.busy = true;
    talkRenderFeed([], tt('studio.agent.loading', 'Наставник думает…'));
    var r = null;
    try {
      r = await jpost('/api/agent/roleplay/start', {
        text_key: _talkCtx.textKey, order_index: _talkCtx.orderIndex,
        sentence_row_id: _talkCtx.rowId || undefined,
      });
    } catch (_) {}
    _talkCtx.busy = false;
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      talkRenderFeed([], null);
      // Несинканный/стейл текст — штатный случай Студии: адресный пуш и повтор (B1-паттерн)
      if (code === 'TEXT_NOT_IN_CLOUD' || code === 'SENTENCE_NOT_FOUND') { talkPushOffer(code); return; }
      talkErr(talkErrMsg(code, r && r.provider_error));
      return;
    }
    _talkCtx.sessionId = r.session_id;
    _talkCtx.turnsUsed = r.turns_used || 0;
    _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
    talkRenderPassage(r.passage);
    talkRenderFeed([], r.opening && r.opening.text);
    talkRenderStatus(r.usage);
    var inp = $('saTalkInput'); if (inp) { try { inp.focus(); } catch (_) {} }
  }
  function talkPushOffer(code) {
    var ack = $('saTalkAck'); if (!ack) { talkErr(talkErrMsg(code, r && r.provider_error)); return; }
    ack.textContent = '';
    var txt = document.createElement('div');
    txt.textContent = code === 'TEXT_NOT_IN_CLOUD'
      ? tt('studio.agent.notInCloud', 'Этот текст ещё не в облаке — можно отправить его копию сейчас (только этот текст).')
      : tt('studio.agent.staleCloud', 'Локальная версия текста новее облачной копии — обновить копию и объяснить?');
    ack.appendChild(txt);
    var row = document.createElement('div'); row.className = 'sa-actions-row';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'sa-primary';
    ok.textContent = tt('studio.agent.pushBtn', 'Отправить и объяснить');
    ok.addEventListener('click', function () { ack.hidden = true; talkPushAndStart(); });
    var no = document.createElement('button'); no.type = 'button';
    no.textContent = tt('studio.agent.consentCancel', 'Отмена');
    no.addEventListener('click', function () { ack.hidden = true; });
    row.appendChild(ok); row.appendChild(no); ack.appendChild(row);
    ack.hidden = false;
  }
  async function talkPushAndStart() {
    if (!_talkCtx || !_talkCtx.tid) { talkErr(talkErrMsg('TEXT_NOT_IN_CLOUD')); return; }
    talkErr('');
    talkRenderFeed([], tt('studio.agent.pushing', 'Отправляю копию текста в облако…'));
    try {
      var host = window.StudioAgentHost;
      var ldb = await host.ldb();
      var bundle = await ldb.exportBundle({ textIds: [_talkCtx.tid] });
      var text = await ldb.getTextById(_talkCtx.tid);
      var r = await jpost('/api/learner/artifacts/put', {
        artifact_key: text.text_key, updated_at: text.updated_at, payload: bundle,
      });
      if (!r || r.ok === false) { talkRenderFeed([], null); talkErr(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако')); return; }
    } catch (_) { talkRenderFeed([], null); talkErr(tt('studio.agent.pushFail', 'Не удалось отправить текст в облако')); return; }
    // порядок мог поменяться — пере-резолв якоря по живому ряду (B1-паттерн)
    if (_talkCtx.row) {
      var fresh = await resolveAnchor(_talkCtx.row);
      if (fresh) { _talkCtx.textKey = fresh.textKey; _talkCtx.orderIndex = fresh.orderIndex; _talkCtx.rowId = fresh.sid; _talkCtx.tid = fresh.tid; }
    }
    talkStart();
  }
  async function talkResync() {
    if (!_talkCtx || !_talkCtx.sessionId) { talkAckFlow(); return; }
    var r = null;
    try {
      r = await fetch('/api/agent/roleplay/state?session_id=' + encodeURIComponent(_talkCtx.sessionId),
        { credentials: 'same-origin' }).then(function (x) { return x.json(); });
    } catch (_) {}
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      _talkCtx.sessionId = null;
      if (code === 'SESSION_NOT_FOUND') { talkAckFlow(); return; }   // TTL/замена/деплой — start бесплатен
      talkErr(talkErrMsg(code, r && r.provider_error));
      return;
    }
    _talkCtx.turnsUsed = r.turns_used || 0;
    _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
    talkRenderPassage(r.passage);
    talkRenderFeed(r.transcript, r.opening && r.opening.text);
    talkRenderStatus(r.usage);
  }
  async function talkSend() {
    if (_talkVoice) _talkVoice.cancel(true);
    var inp = $('saTalkInput');
    var msg = (inp && inp.value || '').trim();
    if (!msg || !_talkCtx || _talkCtx.busy || !_talkCtx.sessionId) return;
    _talkCtx.busy = true;
    talkErr('');
    var sendB = $('saTalkSend'); if (sendB) sendB.disabled = true;
    var feed = $('saTalkFeed');
    if (feed) {
      var l = document.createElement('div'); l.className = 'sa-talk-l'; l.setAttribute('dir', 'auto'); l.textContent = msg;
      feed.appendChild(l);
      var w = document.createElement('div'); w.className = 'sa-talk-op'; w.textContent = tt('studio.agent.loading', 'Наставник думает…');
      feed.appendChild(w);
      try { feed.scrollTop = feed.scrollHeight; } catch (_) {}
    }
    var r = null;
    try { r = await jpost('/api/agent/roleplay/turn', { session_id: _talkCtx.sessionId, message: msg }); } catch (_) {}
    _talkCtx.busy = false;
    if (sendB) sendB.disabled = false;
    if (!r || !r.ok) {
      var code = (r && r.error) || '';
      // реплика в input НЕ очищается (переживает ошибку); лента ре-синкается из state
      if (_TALK_FATAL[code]) _talkCtx.sessionId = null;
      await talkResyncAfterError();
      talkErr(talkErrMsg(code, r && r.provider_error));
      return;
    }
    if (inp) inp.value = '';
    _talkCtx.turnsUsed = r.turns_used || 0;
    _talkCtx.turnsLeft = r.turns_left != null ? r.turns_left : null;
    _talkCtx.lastKeySource = r.key_source === 'byok' ? 'byok' : 'agent';   // PAS-F1
    talkRenderFeed(r.transcript, null);
    talkRenderStatus(r.usage);
  }
  async function talkResyncAfterError() {
    if (_talkCtx && _talkCtx.sessionId) { await talkResync(); return; }
    var feed = $('saTalkFeed'); if (!feed) return;
    var row = document.createElement('div'); row.className = 'sa-actions-row';
    var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'sa-primary';
    rb.textContent = tt('room.talk.restart', 'Начать заново');
    rb.addEventListener('click', function () { talkErr(''); talkAckFlow(); });
    row.appendChild(rb);
    feed.appendChild(row);
    try { feed.scrollTop = feed.scrollHeight; } catch (_) {}
  }
  function talkEndClick() {
    if (_talkCtx && _talkCtx.sessionId && _talkCtx.turnsUsed > 0) {
      var c = $('saTalkConfirm'); if (c) { c.hidden = false; return; }
    }
    talkStop();
  }
  async function talkStop() {
    var sid = _talkCtx && _talkCtx.sessionId;
    if (sid) { try { await jpost('/api/agent/roleplay/stop', { session_id: sid }); } catch (_) {} }
    if (_talkCtx) { _talkCtx.sessionId = null; _talkCtx.turnsUsed = 0; _talkCtx.turnsLeft = null; }
    var feed = $('saTalkFeed'); if (feed) feed.textContent = '';
    var p = $('saTalkPassageBody'); if (p) p.textContent = '';
    talkErr('');
    talkHide();
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
    if (!(consents.cloud_texts && consents.cloud_texts.granted === true && String(consents.cloud_texts.version || "") === ((window.CloudSync && window.CloudSync.CLOUD_TEXTS_CONSENT_VERSION) || "v2"))) {   // P1: карта v2 — v1-грант ведёт в ☁ на re-consent
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
    if (r.llm_used) metaParts.push('🤖 ' + (r.key_source === 'byok' ? tt('room.cloud.byokProvenance', 'ваш ключ') + ' · ' : '') + (r.provider || '') + (r.model ? ' · ' + r.model : ''));
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

  // ── PAS-B3 (owner-фидбэк 2026-07-12): приём драфта наставника как НЕСОХРАНЁННОЙ
  // карточки — штатный пайплайн Студии (композер #inputText → translateTable():
  // огласовки/транслит/перевод формируются так же, как у дефолтной таблицы).
  var DRAFT_HANDOFF_KEY = 'studio.agentDraftHandoff';
  function applyDraftToComposer(p) {
    var ta = document.getElementById('inputText');
    if (!ta || !p || !p.source_text) return false;
    ta.value = String(p.source_text);
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { ta.scrollIntoView({ block: 'center' }); } catch (_) {}
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(tt('studio.agent.draftLoaded', 'Черновик наставника вставлен — собираю таблицу…'), 'info');
      }
    } catch (_) {}
    // Явный тап «Открыть в Студии»/«В редактор» уже был — сборка штатным путём
    try { if (typeof window.translateTable === 'function') window.translateTable(); } catch (_) {}
    return true;
  }
  function consumeDraftHandoff() {
    if (document.body && document.body.classList.contains('room-mode')) return;
    var raw = null;
    try { raw = localStorage.getItem(DRAFT_HANDOFF_KEY); } catch (_) {}
    if (!raw) return;
    try { localStorage.removeItem(DRAFT_HANDOFF_KEY); } catch (_) {}
    var p = null;
    try { p = JSON.parse(raw); } catch (_) { return; }
    if (!p || p.v !== 1 || !p.source_text) return;
    if (Date.now() - Number(p.ts || 0) > 10 * 60 * 1000) return;   // TTL — залежавшийся handoff не выстрелит
    // небольшая пауза: дать приложению доинициализироваться (LOCAL_MODE/ключи)
    setTimeout(function () { applyDraftToComposer(p); }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', consumeDraftHandoff);
  else consumeDraftHandoff();

  // ── вход: делегированный клик по .row-agent-btn (инъекция выше) ──
  function startExplain(rowIdx) {
    var host = window.StudioAgentHost;
    var row = host && host.getRow ? host.getRow(rowIdx) : null;
    if (!row || !row._v3_sentenceId || !row._v3_textId) return;
    ensureModal();
    hidePanels();
    _currentRowIdx = rowIdx;
    var he = $('saExplainHe');
    if (he) he.textContent = row.he_niqqud || row.he || '';
    // Паритет с Залом: перевод ряда под предложением (колонка «Перевод»)
    var ru = $('saExplainRu');
    if (ru) { ru.textContent = String(row.ru || ''); ru.hidden = !String(row.ru || '').trim(); }
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
