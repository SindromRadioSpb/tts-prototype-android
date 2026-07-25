(() => {
  'use strict';
  if (window.__linguistProC2LiveLoaded) return;
  window.__linguistProC2LiveLoaded = true;

  const MODEL = 'gemini-3.1-flash-live-preview';
  const MAX_MS = 8 * 60 * 1000;
  const RUNS = {
    RT1: { surface: 'desktop_web', scenario: 'cafe', title: 'В кафе', hint: 'Закажи еду, задай два вопроса и уточни недопонимание.' },
    RT2: { surface: 'iphone_web', scenario: 'directions', title: 'Как пройти', hint: 'Уточни маршрут по двум ориентирам и повтори его своими словами.' },
    RT3: { surface: 'iphone_web', scenario: 'plans', title: 'Планы', hint: 'Договорись о времени встречи и предложи одно изменение.' },
  };

  const SYSTEM = `Ты доброжелательный собеседник для взрослого ученика иврита. Веди живой разговор только на простом современном иврите. Говори коротко, задавай один вопрос за раз и давай человеку договорить. Исправляй только то, что мешает понять смысл, без оценок и баллов. Не проси личные данные и не используй личные тексты. Если не расслышал, естественно попроси повторить.`;

  const state = {
    run: null, provider: null, stream: null, inputContext: null, inputNode: null,
    startedAt: 0, timer: null, completedTurns: 0, breakdowns: 0, incidents: 0,
  };

  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  };

  class RealtimeVoiceProvider extends EventTarget {
    async connect() { throw new Error('PROVIDER_CONNECT_NOT_IMPLEMENTED'); }
    sendPcm() { throw new Error('PROVIDER_AUDIO_NOT_IMPLEMENTED'); }
    close() { throw new Error('PROVIDER_CLOSE_NOT_IMPLEMENTED'); }
  }

  class GeminiBrowserProvider extends RealtimeVoiceProvider {
    constructor(token, callbacks) {
      super();
      this.token = token;
      this.callbacks = callbacks;
      this.ws = null;
      this.outputContext = null;
      this.nextPlaybackAt = 0;
      this.closedByOwner = false;
    }

    async connect() {
      const endpoint = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
      this.ws = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(this.token)}`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Gemini не ответил за 15 секунд.')), 15000);
        this.ws.addEventListener('open', () => {
          this.ws.send(JSON.stringify({ setup: {
            model: `models/${MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
              thinkingConfig: { thinkingLevel: 'minimal' },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            realtimeInputConfig: { automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
              prefixPaddingMs: 40,
              silenceDurationMs: 650,
            } },
            systemInstruction: { parts: [{ text: SYSTEM }] },
          } }));
        }, { once: true });
        this.ws.addEventListener('message', async (event) => {
          const message = await parseWebSocketMessage(event.data);
          if (!message) return;
          if (message.setupComplete) { clearTimeout(timeout); resolve(); }
          this.handle(message);
        });
        this.ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Не удалось открыть Live-соединение.')); }, { once: true });
        this.ws.addEventListener('close', (event) => {
          clearTimeout(timeout);
          if (!this.closedByOwner) this.callbacks.closed(event.reason || 'Соединение завершено.');
        });
      });
    }

    sendPcm(buffer) {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: bytesToBase64(buffer), mimeType: 'audio/pcm;rate=16000' } } }));
    }

    handle(message) {
      if (message.error) {
        const raw = JSON.stringify(message.error);
        if (/429|quota|resource_exhausted/i.test(raw)) this.callbacks.quota();
        else this.callbacks.error('Gemini завершил разговор из-за ошибки.');
      }
      const content = message.serverContent;
      if (content?.inputTranscription?.text) this.callbacks.input(content.inputTranscription.text);
      if (content?.outputTranscription?.text) this.callbacks.output(content.outputTranscription.text);
      for (const part of content?.modelTurn?.parts || []) {
        if (part.inlineData?.data && /^audio\/pcm/i.test(part.inlineData.mimeType || '')) {
          this.playPcm(base64ToBytes(part.inlineData.data), 24000);
        }
      }
      if (content?.interrupted) this.stopPlayback();
      if (content?.turnComplete) this.callbacks.turn();
    }

    async playPcm(bytes, sampleRate) {
      this.outputContext ||= new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      await this.outputContext.resume();
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const audio = this.outputContext.createBuffer(1, samples.length, sampleRate);
      const channel = audio.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
      const source = this.outputContext.createBufferSource();
      source.buffer = audio;
      source.connect(this.outputContext.destination);
      const start = Math.max(this.outputContext.currentTime + .02, this.nextPlaybackAt);
      source.start(start);
      this.nextPlaybackAt = start + audio.duration;
    }

    stopPlayback() {
      if (this.outputContext) this.nextPlaybackAt = this.outputContext.currentTime;
    }

    close() {
      this.closedByOwner = true;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        this.ws.close(1000, 'OWNER_SESSION_COMPLETE');
      }
      this.outputContext?.close().catch(() => {});
    }
  }

  function createRealtimeProvider(providerId, token, callbacks) {
    if (providerId === 'gemini-live') return new GeminiBrowserProvider(token, callbacks);
    throw new Error('REALTIME_PROVIDER_NOT_SUPPORTED');
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function base64ToBytes(value) {
    const binary = atob(value); const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  async function parseWebSocketMessage(data) {
    let raw = data;
    if (raw instanceof Blob) raw = await raw.text();
    else if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
    else if (ArrayBuffer.isView(raw)) raw = new TextDecoder().decode(raw);
    if (typeof raw !== 'string') return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function downsampleToPcm16(input, inputRate) {
    const ratio = inputRate / 16000;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const pcm = new Int16Array(length);
    for (let i = 0; i < length; i += 1) {
      const from = Math.floor(i * ratio); const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = from; j < to && j < input.length; j += 1) sum += input[j];
      const sample = Math.max(-1, Math.min(1, sum / (to - from)));
      pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return new Uint8Array(pcm.buffer);
  }

  const panel = el('section', { id: 'c2-live-panel', hidden: '', 'aria-label': 'Живой разговор на иврите' });
  panel.innerHTML = `<div class="c2-shell">
    <header class="c2-top"><div class="c2-brand">LinguistPro × Hermes</div><button class="c2-close" type="button">Вернуться в чат</button></header>
    <main class="c2-stage">
      <div class="c2-eyebrow">Эксперимент C2 · Free Tier</div>
      <h1 class="c2-title" lang="he" dir="rtl">בוא נדבר</h1>
      <p class="c2-subtitle">Живой разговор без кнопки «отправить». Вы сразу увидите, что услышал Gemini. Аудио и текст разговора не сохраняются.</p>
      <div class="c2-runs" role="group" aria-label="Сценарий"></div>
      <div class="c2-orb" data-state="idle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#071619" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg></div>
      <button class="c2-action" type="button">Начать разговор</button>
      <div class="c2-status" role="status">Выберите сценарий. На iPhone откройте этот экран по HTTPS.</div>
      <div class="c2-transcripts" hidden>
        <article class="c2-transcript"><span>Gemini услышал</span><p class="c2-input" lang="he" dir="rtl">—</p></article>
        <article class="c2-transcript"><span>Собеседник</span><p class="c2-output" lang="he" dir="rtl">—</p></article>
      </div>
      <div class="c2-controls" hidden><button class="c2-missed" type="button">Gemini меня не понял</button><span class="c2-clock">08:00</span></div>
    </main>
    <footer class="c2-foot"><span>До 8 минут</span><span>3 исследовательских разговора</span><span>$0/week</span></footer>
  </div>`;
  document.body.appendChild(panel);

  const runs = panel.querySelector('.c2-runs');
  for (const [id, run] of Object.entries(RUNS)) {
    const button = el('button', { class: 'c2-run', type: 'button', 'data-run': id, 'aria-pressed': 'false' });
    button.innerHTML = `<strong>${id} · ${run.title}</strong><small>${run.surface === 'desktop_web' ? 'ПК · Hermes WebUI' : 'iPhone · Hermes WebUI'}</small>`;
    button.addEventListener('click', () => selectRun(id));
    runs.appendChild(button);
  }

  const launch = el('button', { id: 'c2-live-launch', type: 'button', title: 'Живой разговор на иврите' }, '◉ Разговор');
  launch.addEventListener('click', openPanel);
  const mount = document.querySelector('#composerFooter, .composer-footer, #composer, .composer-actions, .composer') || document.body;
  mount.appendChild(launch);

  function selectRun(id) {
    if (state.startedAt) return;
    state.run = id;
    panel.querySelectorAll('.c2-run').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.run === id)));
    setStatus(RUNS[id].hint);
  }
  function openPanel() { panel.hidden = false; document.documentElement.style.overflow = 'hidden'; }
  function closePanel() { if (state.startedAt) return; panel.hidden = true; document.documentElement.style.overflow = ''; clearTranscript(); }
  function setStatus(text, error = false) { const node = panel.querySelector('.c2-status'); node.textContent = text; node.classList.toggle('c2-error', error); }
  function clearTranscript() { panel.querySelector('.c2-input').textContent = '—'; panel.querySelector('.c2-output').textContent = '—'; }

  async function requestToken(run) {
    const response = await fetch(`/api/extensions/c2-live/sidecar/token?run=${encodeURIComponent(run)}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error('FREE_TIER_QUOTA');
    if (!response.ok || !data.token) {
      if (response.status === 403) throw new Error('В Settings → Extensions разрешите Sidecar proxy для «Разговор на иврите».');
      if (data.error === 'GEMINI_TOKEN_REQUEST_SCHEMA_REJECTED') throw new Error('Gemini отклонил формат одноразового ключа. Обновите C2-адаптер.');
      if (data.error === 'GEMINI_KEY_NOT_AUTHORIZED_FOR_LIVE') throw new Error('Текущий Gemini API key не имеет доступа к Live API. Проверьте проект Google AI Studio.');
      throw new Error(data.error || 'Не удалось получить одноразовый ключ Live API.');
    }
    return data.token;
  }

  async function start() {
    if (!state.run) { setStatus('Сначала выберите один из трёх сценариев.', true); return; }
    const expected = RUNS[state.run].surface;
    const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if ((expected === 'iphone_web') !== isIphone) { setStatus(`${state.run} предназначен для ${expected === 'iphone_web' ? 'iPhone' : 'ПК'}.`, true); return; }
    if (!window.isSecureContext) { setStatus('Микрофон работает только по HTTPS или через localhost.', true); return; }
    const action = panel.querySelector('.c2-action'); action.disabled = true; setStatus('Включаю микрофон…');
    try {
      const token = await requestToken(state.run);
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
      state.provider = createRealtimeProvider('gemini-live', token, {
        input: (text) => { panel.querySelector('.c2-input').textContent = text; },
        output: (text) => { panel.querySelector('.c2-output').textContent = text; },
        turn: () => { state.completedTurns += 1; },
        quota: () => failToAsync('Free Tier временно недоступен (429). Продолжите обычной голосовой заметкой H2.6.'),
        error: (message) => { state.incidents += 1; setStatus(message, true); },
        closed: (message) => { state.incidents += 1; finish('transport_closed', message); },
      });
      await state.provider.connect();
      state.inputContext = new (window.AudioContext || window.webkitAudioContext)();
      await state.inputContext.resume();
      const source = state.inputContext.createMediaStreamSource(state.stream);
      state.inputNode = state.inputContext.createScriptProcessor(4096, 1, 1);
      state.inputNode.onaudioprocess = (event) => state.provider?.sendPcm(downsampleToPcm16(event.inputBuffer.getChannelData(0), state.inputContext.sampleRate));
      source.connect(state.inputNode); state.inputNode.connect(state.inputContext.destination);
      state.startedAt = Date.now(); state.completedTurns = 0; state.breakdowns = 0; state.incidents = 0;
      panel.querySelector('.c2-orb').dataset.state = 'live';
      panel.querySelector('.c2-transcripts').hidden = false; panel.querySelector('.c2-controls').hidden = false;
      action.disabled = false; action.dataset.kind = 'stop'; action.textContent = 'Завершить разговор';
      setStatus('Говорите по-ивритски — собеседник уже слушает.');
      state.timer = setInterval(updateClock, 500);
    } catch (error) {
      stopMedia(); action.disabled = false;
      if (String(error.message).includes('FREE_TIER_QUOTA')) failToAsync('Free Tier временно недоступен (429). Продолжите обычной голосовой заметкой H2.6.');
      else setStatus(error.message || 'Не удалось начать разговор.', true);
    }
  }

  function updateClock() {
    const left = Math.max(0, MAX_MS - (Date.now() - state.startedAt));
    panel.querySelector('.c2-clock').textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    if (!left) finish('completed', 'Восемь минут прошли — разговор сохранён только как обезличенный счётчик.');
  }
  function failToAsync(message) { state.incidents += 1; finish('quota_fallback', message); }
  function stopMedia() {
    state.inputNode?.disconnect(); state.inputNode = null;
    state.inputContext?.close().catch(() => {}); state.inputContext = null;
    state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null;
  }
  function finish(status = 'owner_complete', message = 'Разговор завершён. Расшифровка удалена с экрана.') {
    if (!state.startedAt && !state.provider) { setStatus(message, status !== 'owner_complete'); return; }
    clearInterval(state.timer); state.timer = null;
    const durationSeconds = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
    state.provider?.close(); state.provider = null; stopMedia();
    const result = { schema: 1, id: state.run.toLowerCase(), run: state.run, mode: 'realtime', surface: RUNS[state.run]?.surface,
      scenario: RUNS[state.run]?.scenario, durationSec: durationSeconds, turns: state.completedTurns, breakdowns: state.breakdowns,
      transportIncidents: state.incidents, actualCostUsd: null, containsContent: false,
      status: status === 'completed' || status === 'owner_complete' ? 'COMPLETE' : status.toUpperCase() };
    const previous = JSON.parse(localStorage.getItem('linguistpro.c2.results') || '[]').filter((item) => item.run !== state.run);
    previous.push(result); localStorage.setItem('linguistpro.c2.results', JSON.stringify(previous));
    const params = new URLSearchParams({ run: result.run, durationSec: String(result.durationSec), turns: String(result.turns),
      breakdowns: String(result.breakdowns), transportIncidents: String(result.transportIncidents), status: result.status });
    fetch(`/api/extensions/c2-live/sidecar/result?${params}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => {});
    state.startedAt = 0; panel.querySelector('.c2-orb').dataset.state = 'idle';
    panel.querySelector('.c2-transcripts').hidden = true; panel.querySelector('.c2-controls').hidden = true;
    const action = panel.querySelector('.c2-action'); action.dataset.kind = ''; action.textContent = 'Начать разговор'; action.disabled = false;
    clearTranscript(); setStatus(message, status === 'quota_fallback' || status === 'transport_closed');
  }

  panel.querySelector('.c2-close').addEventListener('click', closePanel);
  panel.querySelector('.c2-action').addEventListener('click', () => state.startedAt ? finish() : start());
  panel.querySelector('.c2-missed').addEventListener('click', () => { state.breakdowns += 1; setStatus('Отметил. Продолжайте разговор или попросите повторить.'); });
  window.addEventListener('beforeunload', () => { state.provider?.close(); stopMedia(); });
})();
