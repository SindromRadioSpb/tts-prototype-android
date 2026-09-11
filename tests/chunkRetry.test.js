'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ChunkRetry = require('../public/js/chunk-retry.js');

// Кусок таблицы повторялся ДВАЖДЫ ПОДРЯД без паузы. У распознавания лестница с ожиданием
// (4 с / 12 с / 30 с) — именно она доводила прогоны до конца при 503; у таблицы её не было,
// и разовая перегрузка провайдера стоила владельцу всего куска.
const err = (fields) => Object.assign(new Error(fields.message || 'boom'), fields);

test('an overloaded provider is waited out, not asked twice in the same second', () => {
  const first = ChunkRetry.classify(err({ httpStatus: 503 }), { attempt: 1 });
  assert.equal(first.code, 'PROVIDER_OVERLOADED');
  assert.equal(first.retryable, true);
  assert.equal(first.waitMs, ChunkRetry.DELAYS_MS[0]);
  assert.equal(ChunkRetry.classify(err({ httpStatus: 503 }), { attempt: 2 }).waitMs, ChunkRetry.DELAYS_MS[1]);
});

test('the last rung of the ladder is reachable', () => {
  // Дефект распознавания 2026-09-11: цикл сдавался на шаг раньше, и последняя — самая длинная —
  // пауза не наступала никогда. После починки именно она доводила прогон до конца.
  const last = ChunkRetry.ATTEMPTS;
  assert.equal(last, ChunkRetry.DELAYS_MS.length + 1);
  const beforeLast = ChunkRetry.classify(err({ httpStatus: 503 }), { attempt: last - 1 });
  assert.equal(beforeLast.retryable, true);
  assert.equal(beforeLast.waitMs, ChunkRetry.DELAYS_MS[ChunkRetry.DELAYS_MS.length - 1]);
  assert.equal(ChunkRetry.classify(err({ httpStatus: 503 }), { attempt: last }).retryable, false,
    'after the final attempt there is nothing left to wait for');
});

test('a rate limit and a bad key are not overload: they are not retried at all', () => {
  assert.deepEqual(
    ['httpStatus 429', 'httpStatus 401', 'httpStatus 403'].map((_, i) =>
      ChunkRetry.classify(err({ httpStatus: [429, 401, 403][i] }), { attempt: 1 }).retryable),
    [false, false, false]);
  assert.equal(ChunkRetry.classify(err({ httpStatus: 429 }), { attempt: 1 }).code, 'RATE_LIMITED');
  assert.equal(ChunkRetry.classify(err({ httpStatus: 403 }), { attempt: 1 }).code, 'AUTH');
  assert.equal(ChunkRetry.classify(err({ httpStatus: 400, raw: { retryable: false } }), { attempt: 1 }).code, 'NOT_RETRYABLE');
});

test('a request that died while the tab was in the background is named for what it was', () => {
  // Замер 2026-09-11: Chrome замораживает фоновую вкладку примерно через 5 минут и убивает
  // висящий запрос. «Сеть подвела» — неверный диагноз и неверный совет.
  const frozen = ChunkRetry.classify(err({ message: 'Failed to fetch' }), { attempt: 1, hiddenDuringRequest: true });
  assert.equal(frozen.code, 'TAB_BACKGROUNDED');
  assert.equal(frozen.retryable, true);
  assert.equal(frozen.needsForeground, true, 'waiting on a clock is useless while the tab is still frozen');
  const network = ChunkRetry.classify(err({ message: 'Failed to fetch' }), { attempt: 1, hiddenDuringRequest: false });
  assert.equal(network.code, 'NETWORK');
  assert.equal(network.needsForeground, false);
  assert.equal(network.waitMs, ChunkRetry.DELAYS_MS[0]);
});

test('damaged JSON keeps its one immediate retry and then hands over to the split', () => {
  // Ждать бессмысленно — пауза не чинит разбор. И повторять четырежды тоже: каждая попытка это
  // ОПЛАЧЕННЫЙ вызов, а лечит здесь дробление куска (отгруженный путь 120→60+60).
  const first = ChunkRetry.classify(err({ httpStatus: 200, jsonDamaged: true }), { attempt: 1 });
  assert.equal(first.code, 'JSON_DAMAGED');
  assert.equal(first.retryable, true);
  assert.equal(first.waitMs, 0);
  assert.equal(ChunkRetry.classify(err({ httpStatus: 200, jsonDamaged: true }), { attempt: 2 }).retryable, false,
    'the second failure belongs to the split, not to a third identical paid call');
});

test('the tab watch reports that the tab was hidden even if it came back before the answer did', () => {
  const listeners = {};
  const doc = { hidden: false, visibilityState: 'visible',
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; } };
  const watch = ChunkRetry.createTabWatch(doc);
  watch.begin();
  assert.equal(watch.sawHidden(), false);
  doc.hidden = true; doc.visibilityState = 'hidden'; listeners.visibilitychange();
  doc.hidden = false; doc.visibilityState = 'visible'; listeners.visibilitychange();
  assert.equal(watch.sawHidden(), true, 'the freeze happened even though the tab is visible again now');
  watch.begin();
  assert.equal(watch.sawHidden(), false, 'a new request starts with a clean record');
  watch.stop();
  assert.equal(listeners.visibilitychange, undefined, 'the watch unsubscribes itself');
});

test('waiting for the foreground resolves at once when the tab is already in front', async () => {
  const doc = { hidden: false, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  await ChunkRetry.waitForForeground(doc);
});

test('waiting for the foreground resolves when the person comes back to the tab', async () => {
  const listeners = {};
  const doc = { hidden: true, visibilityState: 'hidden',
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; } };
  const waited = ChunkRetry.waitForForeground(doc);
  let settled = false;
  waited.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false, 'a hidden tab must not be reported as ready');
  doc.hidden = false; doc.visibilityState = 'visible'; listeners.visibilitychange();
  await waited;
  assert.equal(listeners.visibilitychange, undefined, 'the wait cleans up after itself');
});

test('an ordinary 500 keeps its single retry: the ladder belongs to "come back later"', () => {
  // Каждая попытка — ОПЛАЧЕННЫЙ вызов. 503 прямо говорит «занято, вернитесь позже», и ждать его
  // стоит; обычная 500 такого не обещает, и четыре одинаковых вызова были бы платой ни за что.
  const first = ChunkRetry.classify(err({ httpStatus: 500 }), { attempt: 1 });
  assert.equal(first.code, 'SERVER_ERROR');
  assert.equal(first.retryable, true);
  assert.equal(first.waitMs, ChunkRetry.DELAYS_MS[0], 'even the single retry waits instead of asking again at once');
  assert.equal(first.attempts, 2, 'the screen must not promise attempts this error class will never get');
  assert.equal(ChunkRetry.classify(err({ httpStatus: 500 }), { attempt: 2 }).retryable, false);
  assert.equal(ChunkRetry.classify(err({ httpStatus: 503 }), { attempt: 2 }).retryable, true, '503 still gets the full ladder');
});
