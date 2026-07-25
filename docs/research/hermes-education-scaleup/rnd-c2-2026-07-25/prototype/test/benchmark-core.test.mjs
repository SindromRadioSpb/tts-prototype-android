import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreBenchmark, validateSession } from '../benchmark-core.mjs';
import { assertProviderShape, RealtimeVoiceProvider } from '../provider-contract.mjs';

const row = (mode, scenario, turns, extra = {}) => ({
  id: `${mode}-${scenario}`, mode, scenario, turns, durationSec: 480,
  anxiety: 3, quality: 4, actualCostUsd: 0, status: 'COMPLETE', containsContent: false,
  ...extra,
});

test('provider contract accepts an independent implementation', () => {
  class MockProvider extends RealtimeVoiceProvider {
    async connect() {}
    sendAudioChunk() {}
    endAudioStream() {}
    close() {}
  }
  assert.equal(assertProviderShape(new MockProvider()) instanceof MockProvider, true);
});

test('incomplete benchmark refuses a verdict', () => {
  assert.deepEqual(scoreBenchmark([row('async', 'cafe', 4)]).status, 'INCOMPLETE');
});

test('complete benchmark applies the frozen 1.5x threshold', () => {
  const rows = ['cafe', 'directions', 'plans'].flatMap((scenario) => [
    row('async', scenario, 4), row('realtime', scenario, 6),
  ]);
  const result = scoreBenchmark(rows);
  assert.equal(result.status, 'DONE_GO_UNDERPOWERED');
  assert.equal(result.ratio, 1.5);
});

test('two broken realtime sessions force no-go', () => {
  const rows = ['cafe', 'directions', 'plans'].flatMap((scenario, index) => [
    row('async', scenario, 4), row('realtime', scenario, 8, { quality: index < 2 ? 2 : 4 }),
  ]);
  assert.equal(scoreBenchmark(rows).status, 'DONE_NO_GO_UNDERPOWERED');
});

test('positive cost violates the immutable envelope', () => {
  assert.throws(() => validateSession(row('realtime', 'cafe', 6, { actualCostUsd: 0.01 })), /ZERO_COST_CAP_VIOLATED/);
});

test('retained content is forbidden', () => {
  assert.throws(() => validateSession(row('realtime', 'cafe', 6, { containsContent: true })), /CONTENT_RETENTION_FORBIDDEN/);
});
