/* Chrome surface. The helper owns media; this journal is only a UI projection. */
(function (root) {
  'use strict';
  const core = root.IPhoneDownloaderCore, release = root.IPhoneDownloaderRelease;
  const byId = id => root.document.getElementById(id);
  const tr = key => root.t('phoneDownload.' + key);
  const KEY = 'studio.iphone-downloads.v1';
  const isPhone = /iPhone|iPad|iPod/i.test(root.navigator.userAgent) || /Macintosh/i.test(root.navigator.userAgent) && root.navigator.maxTouchPoints > 1;
  let rows = [], lastRequest = null, lockUntil = 0;
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 12))); return true; }
    catch (_) { byId('phoneStorageWarning').hidden = false; return false; }
  }
  function read() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw || raw.length > 65536) return;
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) return;
      rows = value.slice(0, 12).flatMap(row => {
        try {
          const req = core.request(row.request);
          if (row.result) return [{ ...core.acceptReturn(req, row.result), requested_at: row.requested_at }];
          return [{ ...core.started(req, row.requested_at), state: 'requested' }];
        } catch (_) { return []; }
      });
    } catch (_) { byId('phoneStorageWarning').hidden = false; }
  }
  function launch(request) {
    if (Date.now() < lockUntil) return;
    if (!isPhone) { byId('phonePlatform').hidden = false; return; }
    let href;
    try { href = core.launch(request, release); }
    catch (_) { byId('phoneFormError').textContent = tr('failedStart'); byId('phoneFormError').hidden = false; return; }
    lockUntil = Date.now() + 2000; lastRequest = request;
    byId('phoneLaunchStatus').hidden = false;
    byId('phoneReturnError').hidden = true;
    // This line requests an app switch. It cannot establish installation or completion.
    root.location.href = href;
  }
  function addRow(request) {
    rows = [core.started(request), ...rows.filter(row => row.request.job !== request.job)].slice(0, 12);
    save(); render();
  }
  function node(tag, className, text) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function render() {
    const list = byId('phoneHistory'); list.replaceChildren();
    byId('phoneEmpty').hidden = rows.length > 0;
    for (const row of rows) {
      const item = node('li', 'phone-history-item'); item.dataset.job = row.request.job;
      const ready = row.state === 'helper_ready';
      item.appendChild(node('strong', 'phone-file', ready ? row.result.name : 'YouTube · ' + row.request.source));
      const label = ready ? 'helperReady' : row.state === 'failed' ? 'failed' : row.state === 'canceled' ? 'canceled' : 'interrupted';
      item.appendChild(node('p', ready ? 'phone-success' : 'phone-note', tr(label)));
      if (ready) {
        item.appendChild(node('p', 'phone-metadata', (row.result.bytes / (1024 * 1024)).toFixed(1) + ' MB · ' + (row.result.kind === 'video' ? row.result.quality + 'p' : 'M4A')));
        item.appendChild(node('p', 'phone-note', tr('helperEvidence')));
      } else {
        const code = row.result && row.result.error;
        const hint = row.state !== 'failed' ? 'interruptedHint' : code === 'NATIVE_UI_UNAVAILABLE' ? 'errorBridge'
          : code && code.startsWith('SOURCE_') ? 'errorSource' : 'errorGeneric';
        item.appendChild(node('p', 'phone-note', tr(hint)));
      }
      const actions = node('div', 'phone-actions');
      const open = node('button', ready ? 'phone-primary' : '', tr(ready ? 'openFile' : 'openAgain'));
      open.type = 'button'; open.dataset.action = 'open';
      open.addEventListener('click', () => launch({ ...row.request, action: ready ? 'open' : 'start', language: root.appGetLocale() }));
      const forget = node('button', 'phone-link', tr('forget')); forget.type = 'button'; forget.dataset.action = 'forget';
      forget.addEventListener('click', () => {
        rows = rows.filter(other => other.request.job !== row.request.job); save(); render();
        if (lastRequest && lastRequest.job === row.request.job) { lastRequest = null; byId('phoneLaunchStatus').hidden = true; }
        byId('phoneNotice').textContent = tr('removed');
      });
      actions.append(open, forget); item.appendChild(actions);
      if (row.result && row.result.error) {
        const details = node('details'); details.appendChild(node('summary', '', tr('technical')));
        details.appendChild(node('pre', '', row.result.error)); item.appendChild(details);
      }
      list.appendChild(item);
    }
  }
  function consumeFragment() {
    const fragment = root.location.hash;
    if (!fragment) return;
    root.history.replaceState(null, '', root.location.pathname + root.location.search);
    if (fragment.startsWith('#source=')) {
      const source = fragment.slice(8);
      if (/^[A-Za-z0-9_-]{11}$/.test(source)) byId('phoneSource').value = 'https://www.youtube.com/watch?v=' + source;
      return;
    }
    if (!fragment.startsWith('#result=')) return;
    try {
      const result = core.decode(fragment.slice(8));
      const existing = rows.find(row => row.request.job === result.job);
      if (!existing) throw new Error('UNKNOWN_JOB');
      const row = core.acceptReturn(existing.request, result);
      rows = [{ ...row, requested_at: existing.requested_at }, ...rows.filter(other => other.request.job !== result.job)];
      save(); byId('phoneLaunchStatus').hidden = true;
      byId('phoneReturnError').hidden = true;
    } catch (_) { byId('phoneReturnError').hidden = false; }
    render();
  }
  byId('phoneForm').addEventListener('submit', event => {
    event.preventDefault(); byId('phoneFormError').hidden = true;
    try {
      const source = core.videoId(byId('phoneSource').value);
      if (!byId('phoneRights').value) throw new Error('RIGHTS_REQUIRED');
      const bytes = root.crypto.getRandomValues(new Uint8Array(16));
      const request = core.request({ v: 1, job: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''),
        source, rights: byId('phoneRights').value, language: root.appGetLocale(), action: 'start' });
      if (Date.now() < lockUntil) return;
      if (!isPhone) { byId('phonePlatform').hidden = false; return; }
      addRow(request); launch(request);
    } catch (error) {
      byId('phoneFormError').textContent = tr(error.message === 'RIGHTS_REQUIRED' ? 'rightsRequired' : 'invalidUrl');
      byId('phoneFormError').hidden = false;
      byId(error.message === 'RIGHTS_REQUIRED' ? 'phoneRights' : 'phoneSource').focus();
    }
  });
  byId('phoneReopen').addEventListener('click', () => { if (lastRequest) launch(lastRequest); });
  byId('phoneSource').addEventListener('input', () => { byId('phoneFormError').hidden = true; byId('phoneLaunchStatus').hidden = true; });
  byId('phoneRights').addEventListener('change', () => { byId('phoneFormError').hidden = true; });
  byId('phoneLanguage').value = root.appGetLocale();
  byId('phoneLanguage').addEventListener('change', event => root.appSetLocale(event.target.value));
  root.document.addEventListener('i18n:changed', () => {
    byId('phoneLanguage').value = root.appGetLocale();
    byId('phoneNotice').textContent = '';
    byId('phoneFormError').hidden = true;
    root.document.title = tr('title') + ' — LinguistPro'; render();
  });
  root.addEventListener('hashchange', consumeFragment);
  byId('phonePlatform').hidden = isPhone;
  read(); consumeFragment(); render();
  root.document.title = tr('title') + ' — LinguistPro';
})(window);
