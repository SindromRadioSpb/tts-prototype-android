import { createRuntimeDiagnostics } from './runtime-diagnostics.js?v=544';
import { ENABLE_KEY, readJournal, safeSnapshot } from './diagnostic-journal.js?v=545';
const $ = id => document.getElementById(id);
let storage;
try { storage = localStorage; } catch (_) {}
const bounded = async (fn, fallback) => {
  let timer;
  try { return await Promise.race([Promise.resolve().then(fn), new Promise(resolve => { timer = setTimeout(() => resolve(fallback), 1500); })]); }
  catch (_) { return fallback; } finally { clearTimeout(timer); }
};
function lastLifecycle(history, workerId) {
  const row = history.find(entry => entry.workerId === workerId);
  const event = row?.lifecycle?.[row.lifecycle.length - 1];
  if (!event?.event) return 'событий страницы в журнале нет';
  const persisted = typeof event.persisted === 'boolean' ? ` (persisted=${event.persisted})` : '';
  return `последнее событие страницы: ${event.event}${persisted}, ${Math.max(0, Math.round((Date.now() - event.at) / 1000))} с назад`;
}
// Facts only: which labelled client holds and waits, and what its own journal
// recorded. It never infers a dead tab, corruption or a cause of failure.
function describeRelation(relation, clients, history) {
  const holder = clients.find(client => client.client === relation.holder);
  const waiters = relation.waiters.map(waiter => {
    const identity = clients.find(client => client.client === waiter.client)?.identity;
    if (waiter.sameClientAsHolder) return `${waiter.client}: тот же клиент, что держит`;
    if (!identity) return `${waiter.client}: без метки`;
    return `${waiter.client}: «${identity.surface}», ${waiter.sameDocumentAsHolder ? 'тот же документ' : 'другой документ'}, поколение ${identity.generation}`;
  });
  const waiting = `Ожидают: ${waiters.length ? waiters.join('; ') : 'никто'}.`;
  if (!holder?.identity) {
    return `${relation.lock}: держит ${relation.holder} без опознавательной метки (worker создан до включения записи, старый код или не DB-worker). ${waiting}`;
  }
  const id = holder.identity;
  return `${relation.lock}: держит ${relation.holder} — worker «${id.surface}», релиз ${id.release}, документ ${id.documentId.slice(0, 8)}, поколение ${id.generation}, создан ${id.ageSec} с назад; ${lastLifecycle(history, id.workerId)}. ${waiting}`;
}
async function refresh() {
  $('refresh').disabled = true;
  const diag = createRuntimeDiagnostics({ snapshot: () => ({ phase: 'diagnostic-page' }), locks: navigator.locks, waitMs: 500 });
  try {
    const [live, estimate] = await Promise.all([diag.capture(), bounded(() => navigator.storage.estimate(), null)]);
    const report = { reportVersion: 2, appVersion: '3.11.545', at: new Date().toISOString(),
      browser: navigator.userAgent, secureContext: isSecureContext,
      capabilities: { webLocks: !!navigator.locks, indexedDB: typeof indexedDB !== 'undefined', opfs: !!navigator.storage?.getDirectory, broadcastChannel: typeof BroadcastChannel === 'function' },
      storageEstimate: estimate ? { usage: estimate.usage, quota: estimate.quota } : 'unavailable',
      locks: live.locks, respondingWorkers: live.peers.map(safeSnapshot), history: readJournal(storage) };
    try { report.savedVfs = ['AccessHandlePool', 'tts-opfs-idb'].includes(storage.getItem('opfsVfsPreference_v1')) ? storage.getItem('opfsVfsPreference_v1') : 'unset'; } catch (_) { report.savedVfs = 'unavailable'; }
    $('report').value = JSON.stringify(report, null, 2);
    const held = live.locks.held?.length;
    const holder = report.respondingWorkers.find(row => row.holdsLease);
    const explanation = holder ? `Держатель блокировки отвечает. Этап: ${holder.phase}; длительность этапа: ${holder.elapsedMs} мс.`
      : held ? 'Блокировка удерживается, но её держатель не ответил. Возможны приостановленный или старый клиент; это НЕ доказательство второй открытой вкладки или повреждения базы.'
      : held === 0 ? 'В момент проверки блокировок БД нет. Для прошлого сбоя смотрите сохранённые этапы history.' : 'Браузер не вернул состояние блокировок в отведённое время.';
    const relations = (live.locks.relations || []).map(relation => describeRelation(relation, live.locks.clients || [], report.history));
    let enabled = false; try { enabled = Number(storage.getItem(ENABLE_KEY)) > Date.now(); } catch (_) {}
    $('status').textContent = [`Запись: ${enabled ? 'включена' : 'выключена'}. Сохранённых запусков: ${report.history.length}.`, explanation, ...relations].join('\n');
  } finally { diag.close(); $('refresh').disabled = false; }
}
$('enable').onclick = () => { try { storage.setItem(ENABLE_KEY, String(Date.now() + 15 * 60 * 1000)); void refresh(); } catch (_) { $('status').textContent = 'Браузер не разрешил локальную запись диагностики.'; } };
$('stop').onclick = () => { try { storage.removeItem(ENABLE_KEY); } catch (_) {} void refresh(); };
$('refresh').onclick = () => { void refresh(); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('report').value); $('status').textContent = 'Отчёт скопирован. Его можно отправить разработчику.'; } catch (_) { $('report').focus(); $('report').select(); $('status').textContent = 'Текст выделен — скопируйте его вручную.'; } };
void refresh();
