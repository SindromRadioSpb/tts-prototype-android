import { RealtimeVoiceProvider } from './provider-contract.mjs';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export class GeminiLiveProvider extends RealtimeVoiceProvider {
  constructor({ apiKey, model = 'gemini-3.1-flash-live-preview', systemInstruction }) {
    super();
    if (!apiKey) throw new Error('C2_GEMINI_API_KEY_MISSING');
    if (model !== 'gemini-3.1-flash-live-preview') throw new Error('C2_MODEL_NOT_PREREGISTERED');
    this.apiKey = apiKey;
    this.model = model;
    this.systemInstruction = systemInstruction;
    this.ws = null;
    this.ready = false;
    this.closed = false;
  }

  async connect() {
    if (this.ws) throw new Error('PROVIDER_ALREADY_CONNECTED');
    const url = `${ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      this.ws.addEventListener('open', () => {
        this.#send({
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
              thinkingConfig: { thinkingLevel: 'minimal' },
            },
            systemInstruction: { parts: [{ text: this.systemInstruction }] },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 40,
                silenceDurationMs: 500,
              },
            },
          },
        });
      });
      this.ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(typeof event.data === 'string'
            ? event.data
            : Buffer.from(event.data).toString('utf8'));
          this.#handle(message);
          if (message.setupComplete && !settled) {
            settled = true;
            this.ready = true;
            this.emit('ready');
            resolve();
          }
        } catch (error) {
          this.emit('error', { code: 'PROTOCOL_PARSE_ERROR', message: error.message });
          fail(error);
        }
      });
      this.ws.addEventListener('error', () => {
        const error = new Error('GEMINI_LIVE_TRANSPORT_ERROR');
        this.emit('error', { code: error.message });
        fail(error);
      });
      this.ws.addEventListener('close', (event) => {
        this.closed = true;
        const reason = String(event.reason || '');
        const quota = /429|quota|resource_exhausted/i.test(reason);
        if (quota) this.emit('quota_exhausted', { code: 'GEMINI_QUOTA_EXHAUSTED' });
        this.emit('closed', { code: event.code, reason: quota ? 'QUOTA_EXHAUSTED' : 'CLOSED' });
        if (!settled) fail(new Error(quota ? 'GEMINI_QUOTA_EXHAUSTED' : 'GEMINI_LIVE_CLOSED_BEFORE_READY'));
      });
    });
  }

  sendAudioChunk(pcm, sampleRate = 16000) {
    if (!this.ready || this.closed) throw new Error('PROVIDER_NOT_READY');
    if (!Buffer.isBuffer(pcm) || pcm.length === 0) return;
    if (sampleRate !== 16000) throw new Error('C2_INPUT_RATE_MUST_BE_16000');
    this.#send({ realtimeInput: { audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } });
  }

  endAudioStream() {
    if (this.ready && !this.closed) this.#send({ realtimeInput: { audioStreamEnd: true } });
  }

  close() {
    if (this.ws && !this.closed) this.ws.close(1000, 'OWNER_SESSION_COMPLETE');
  }

  #send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('PROVIDER_SOCKET_NOT_OPEN');
    this.ws.send(JSON.stringify(payload));
  }

  #handle(message) {
    if (message.error) {
      const text = JSON.stringify(message.error);
      const quota = /429|quota|resource_exhausted/i.test(text);
      if (quota) this.emit('quota_exhausted', { code: 'GEMINI_QUOTA_EXHAUSTED' });
      else this.emit('error', { code: 'GEMINI_API_ERROR' });
    }
    const content = message.serverContent;
    for (const part of content?.modelTurn?.parts || []) {
      const inline = part.inlineData;
      if (inline?.data && /^audio\/pcm/i.test(inline.mimeType || '')) {
        this.emit('audio', Buffer.from(inline.data, 'base64'));
      }
    }
    if (content?.interrupted) this.emit('error', { code: 'MODEL_INTERRUPTED', nonfatal: true });
    if (content?.turnComplete) this.emit('turn_complete');
    if (message.usageMetadata) this.emit('usage', sanitizeUsage(message.usageMetadata));
  }
}

export function sanitizeUsage(usage = {}) {
  const integer = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
  return {
    promptTokenCount: integer(usage.promptTokenCount),
    responseTokenCount: integer(usage.responseTokenCount),
    totalTokenCount: integer(usage.totalTokenCount),
  };
}
