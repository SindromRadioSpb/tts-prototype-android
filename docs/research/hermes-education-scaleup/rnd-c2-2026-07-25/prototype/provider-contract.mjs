import { EventEmitter } from 'node:events';

export const NORMALIZED_EVENTS = Object.freeze([
  'ready',
  'audio',
  'turn_complete',
  'usage',
  'quota_exhausted',
  'error',
  'closed',
]);

export class RealtimeVoiceProvider extends EventEmitter {
  async connect() { throw new Error('NOT_IMPLEMENTED'); }
  sendAudioChunk(_pcm, _sampleRate = 16000) { throw new Error('NOT_IMPLEMENTED'); }
  endAudioStream() { throw new Error('NOT_IMPLEMENTED'); }
  close() { throw new Error('NOT_IMPLEMENTED'); }
}

export function assertProviderShape(provider) {
  for (const name of ['connect', 'sendAudioChunk', 'endAudioStream', 'close', 'on']) {
    if (typeof provider?.[name] !== 'function') throw new TypeError(`PROVIDER_MISSING_${name}`);
  }
  return provider;
}
