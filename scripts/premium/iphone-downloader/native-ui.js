/* Packaged local screen, hosted in a-Shell's supported internal browser. */
(function (root) {
  'use strict';
  if (root.LPPhoneNative && root.LPPhoneNative.timer) root.clearInterval(root.LPPhoneNative.timer);
  function install(config) {
    const doc = root.document, copy = config.copy;
    if (root.location.protocol !== 'http:' || root.location.hostname !== '127.0.0.1' ||
      !/^\/session\/[a-f0-9]{64}\/$/.test(config.endpoint) || root.location.pathname !== config.endpoint) throw new Error('NATIVE_UI_UNAVAILABLE');
    const tr = (key, params) => String(copy[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(params && params[k] != null ? params[k] : ''));
    const old = doc.getElementById('lp-phone-native');
    if (old) old.remove();
    const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const overlay = el('section', 'lp-phone'); overlay.id = 'lp-phone-native';
    overlay.lang = config.language; overlay.dir = config.language === 'he' ? 'rtl' : 'ltr';
    overlay.setAttribute('aria-label', tr('helperName'));
    const main = el('div', 'phone-main'); overlay.appendChild(main);
    const header = el('header'); header.appendChild(el('span', 'phone-brand', 'LinguistPro')); main.appendChild(header);
    const symbol = el('div', 'phone-symbol', '↓'); symbol.setAttribute('aria-hidden', 'true'); main.appendChild(symbol);
    const heading = el('h1'); heading.setAttribute('aria-live', 'polite'); main.appendChild(heading);
    const hint = el('p', 'phone-note'); main.appendChild(hint);
    const source = el('p', 'phone-source-title'); source.dir = 'auto'; main.appendChild(source);
    const meta = el('p', 'phone-metadata'); main.appendChild(meta);
    const progress = el('progress'); progress.max = 100; progress.setAttribute('aria-label', tr('downloading')); main.appendChild(progress);
    const count = el('p', 'phone-metadata'); count.setAttribute('aria-live', 'polite'); main.appendChild(count);
    const slow = el('p', 'phone-note', tr('slow')); slow.hidden = true; main.appendChild(slow);
    const choices = el('fieldset'); const legend = el('legend', '', tr('quality')); choices.appendChild(legend); main.appendChild(choices);
    const choiceList = el('div'); choices.appendChild(choiceList);
    const actions = el('div', 'phone-actions'); main.appendChild(actions);
    const buttons = {};
    let state = { phase: 'connecting' }, lastPhase = '', optionsSignature = '', waitingCancel = false, updated = Date.now();
    let sequence = Number(config.ack) || 0, pending = null, fetching = false, failures = 0, lastRevision = -1;
    let disconnected = false, waitingDownload = false;
    async function exchange() {
      if (fetching) return;
      fetching = true;
      const message = pending;
      const abort = new AbortController(); const timeout = root.setTimeout(() => abort.abort(), 6000);
      try {
        const response = await root.fetch(config.endpoint + (message ? 'command' : 'state'), {
          method: message ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: abort.signal,
          ...(message ? { headers: { 'Content-Type': 'application/json', 'X-LP-Session': config.session }, body: JSON.stringify(message) } : {})
        });
        if (!response.ok) throw new Error('LOCAL_UI_HTTP');
        const next = await response.json();
        if (!Number.isSafeInteger(next.revision) || !Number.isSafeInteger(next.ack)) throw new Error('LOCAL_UI_STATE');
        const reconnecting = disconnected;
        failures = 0; disconnected = false; sequence = Math.max(sequence, next.ack);
        if (reconnecting || next.revision !== lastRevision || pending && next.ack >= pending.seq) {
          lastRevision = next.revision; render(next);
        }
      } catch (_) {
        if (++failures >= 3) {
          disconnected = true; slow.hidden = false; slow.textContent = tr('connectionLost');
          buttons.return.hidden = false;
        }
      } finally { root.clearTimeout(timeout); fetching = false; }
    }
    function send(action, extra) {
      if (pending && action !== 'cancel') return;
      const message = { action, session: config.session, seq: ++sequence, ...(extra || {}) };
      pending = message;
      exchange();
    }
    function button(action, key, primary) {
      const b = el('button', primary ? 'phone-primary' : '', tr(key)); b.type = 'button'; b.dataset.action = action;
      b.addEventListener('click', () => {
        if (action === 'return' && disconnected) {
          root.location.href = 'googlechromes://linguistpro.kolosei.com/download-media.html'; return;
        }
        if (action === 'download') {
          const selected = choiceList.querySelector('input:checked');
          if (!selected) return;
          waitingDownload = true; b.disabled = true; send(action, { option: selected.value });
        } else if (action === 'cancel') {
          waitingCancel = true; b.disabled = true; heading.textContent = tr('canceling'); hint.textContent = tr('cancelHint'); send(action);
        } else { b.disabled = true; send(action); root.setTimeout(() => { b.disabled = false; }, 1500); }
      }); actions.appendChild(b); buttons[action] = b;
    }
    button('download', 'download', true); button('preview', 'preview', true);
    button('retry', 'retry', true); button('return', 'chrome', false); button('cancel', 'cancel', false);
    const location = el('p', 'phone-note', tr('savedLocation')); main.appendChild(location);
    const details = el('details'); details.appendChild(el('summary', '', tr('technical')));
    const technical = el('pre'); details.appendChild(technical); main.appendChild(details);
    // Keep taps on this product surface away from the terminal's focus handlers.
    overlay.addEventListener('pointerdown', e => e.stopPropagation());
    overlay.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    doc.body.appendChild(overlay);
    try { if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur(); } catch (_) {}
    function size(bytes) { return (Number(bytes) / (1024 * 1024)).toFixed(1) + ' MB'; }
    function render(next) {
      state = next; updated = Date.now(); slow.hidden = true; slow.textContent = tr('slow');
      if (pending && Number(next.ack) >= pending.seq) pending = null;
      const phase = next.phase;
      const busy = ['connecting', 'installing', 'checking', 'resolving', 'downloading', 'merging', 'verifying'].includes(phase);
      if (!busy) waitingCancel = false;
      heading.textContent = tr(waitingCancel ? 'canceling' : (phase === 'ready' && next.kind === 'audio' ? 'readyAudio' : phase === 'options' ? 'chooseQuality' : phase));
      hint.textContent = tr(waitingCancel ? 'cancelHint' : next.hint || (phase === 'installing' ? 'installingHint' : phase === 'ready' ? 'previewHint' : phase === 'canceled' ? 'cancelDone' : 'foreground'));
      hint.hidden = phase === 'options';
      source.textContent = next.title || ''; source.hidden = !next.title;
      meta.textContent = next.duration ? Math.floor(next.duration / 60) + ':' + String(Math.round(next.duration % 60)).padStart(2, '0') : '';
      if (next.name) meta.textContent = next.name + ' · ' + size(next.bytes);
      progress.hidden = !busy; count.hidden = !busy || !next.bytes;
      if (next.total > 0 && next.bytes >= 0) progress.value = Math.min(100, next.bytes * 100 / next.total); else progress.removeAttribute('value');
      count.textContent = next.bytes ? tr('bytes', { size: size(next.bytes) }) : '';
      choices.hidden = phase !== 'options';
      const signature = JSON.stringify(next.options || []);
      if (phase === 'options' && signature !== optionsSignature) {
        optionsSignature = signature; choiceList.replaceChildren();
        (next.options || []).forEach((option, index) => {
          const label = el('label', 'phone-choice'); const radio = el('input'); radio.type = 'radio'; radio.name = 'phone-quality'; radio.value = option.key;
          radio.checked = index === 0; label.appendChild(radio);
          const body = el('span'); body.appendChild(el('strong', '', option.kind === 'audio' ? tr('audio') : option.quality + 'p · ' + tr('video')));
          body.appendChild(el('small', '', option.bytes ? tr('estimated', { size: size(option.bytes) }) : tr('unknownSize'))); label.appendChild(body); choiceList.appendChild(label);
        });
      }
      if (phase !== 'options') waitingDownload = false;
      buttons.download.hidden = phase !== 'options'; buttons.download.disabled = phase !== 'options' || waitingDownload;
      buttons.preview.hidden = phase !== 'ready'; buttons.retry.hidden = !['failed', 'canceled', 'interrupted'].includes(phase) || next.retry === false;
      buttons.return.hidden = busy; buttons.cancel.hidden = !busy && phase !== 'options'; buttons.cancel.disabled = waitingCancel;
      location.hidden = phase !== 'ready'; details.hidden = !next.error && phase !== 'ready';
      technical.textContent = next.error || (next.sha256 ? 'SHA-256\n' + next.sha256 : '');
      symbol.textContent = phase === 'ready' ? '✓' : phase === 'failed' ? '!' : '↓';
      symbol.classList.toggle('phone-success', phase === 'ready');
      if (!lastPhase) main.classList.add('phone-pane');
      lastPhase = phase;
    }
    if (root.LPPhoneNative && root.LPPhoneNative.timer) root.clearInterval(root.LPPhoneNative.timer);
    const timer = root.setInterval(() => {
      exchange();
      const busy = !['options', 'ready', 'failed', 'canceled', 'interrupted'].includes(state.phase);
      slow.hidden = !disconnected && !(busy && Date.now() - updated > 90000);
    }, 700);
    root.LPPhoneNative = { install, render, timer };
    render(state);
    const bounds = overlay.getBoundingClientRect();
    if (root.getComputedStyle(overlay).position !== 'fixed' || bounds.width < 280 || bounds.height < 200 || buttons.cancel.getBoundingClientRect().height < 44) {
      root.clearInterval(timer);
      throw new Error('NATIVE_UI_UNAVAILABLE');
    }
    send('ui-ready', { version: 1 });
  }
  root.LPPhoneNative = { install };
})(window);
