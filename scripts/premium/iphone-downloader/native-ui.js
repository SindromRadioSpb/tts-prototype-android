/* Trusted, packaged a-Shell overlay. User/source text is never HTML or commands. */
(function (root) {
  'use strict';
  if (root.LPPhoneNative && root.LPPhoneNative.timer) root.clearInterval(root.LPPhoneNative.timer);
  function install(config) {
    const doc = root.document, copy = config.copy;
    const tr = (key, params) => String(copy[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(params && params[k] != null ? params[k] : ''));
    const old = doc.getElementById('lp-phone-native');
    if (old) old.remove();
    const oldStyle = doc.getElementById('lp-phone-style');
    if (oldStyle) oldStyle.remove();
    const style = doc.createElement('style'); style.id = 'lp-phone-style'; style.textContent = config.css; doc.head.appendChild(style);
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
    let sequence = 0, pending = null;
    function send(action, extra) {
      if (pending && action !== 'cancel') return;
      const message = { action, session: config.session, seq: ++sequence, ...(extra || {}) };
      const bridge = root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.aShell;
      if (!bridge || typeof bridge.postMessage !== 'function') throw new Error('NATIVE_UI_UNAVAILABLE');
      pending = message;
      // jsc --in-window briefly owns a-Shell's JS input route. Send after that
      // call returns, and retry until the Python receiver acknowledges the seq.
      root.setTimeout(() => { if (pending === message) bridge.postMessage('input:' + JSON.stringify(message) + '\n'); }, 150);
    }
    function button(action, key, primary) {
      const b = el('button', primary ? 'phone-primary' : '', tr(key)); b.type = 'button'; b.dataset.action = action;
      b.addEventListener('click', () => {
        if (action === 'download') {
          const selected = choiceList.querySelector('input:checked');
          if (!selected) return;
          b.disabled = true; send(action, { option: selected.value });
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
      state = next; updated = Date.now(); slow.hidden = true;
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
      buttons.download.hidden = phase !== 'options'; buttons.download.disabled = phase !== 'options';
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
      if (pending) {
        const bridge = root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.aShell;
        if (bridge) bridge.postMessage('input:' + JSON.stringify(pending) + '\n');
      }
      const busy = !['options', 'ready', 'failed', 'canceled', 'interrupted'].includes(state.phase);
      slow.hidden = !(busy && Date.now() - updated > 90000);
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
