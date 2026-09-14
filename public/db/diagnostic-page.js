import { createRuntimeDiagnostics } from './runtime-diagnostics.js?v=541';
import { ENABLE_KEY, readJournal, safeSnapshot } from './diagnostic-journal.js?v=541';
const $ = id => document.getElementById(id);
let storage;
try { storage = localStorage; } catch (_) {}
const bounded = async (fn, fallback) => {
  let timer;
  try { return await Promise.race([Promise.resolve().then(fn), new Promise(resolve => { timer = setTimeout(() => resolve(fallback), 1500); })]); }
  catch (_) { return fallback; } finally { clearTimeout(timer); }
};
async function refresh() {
  $('refresh').disabled = true;
  const diag = createRuntimeDiagnostics({ snapshot: () => ({ phase: 'diagnostic-page' }), locks: navigator.locks, waitMs: 500 });
  try {
    const [live, estimate] = await Promise.all([diag.capture(), bounded(() => navigator.storage.estimate(), null)]);
    const report = { reportVersion: 1, appVersion: '3.11.542', at: new Date().toISOString(),
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
    let enabled = false; try { enabled = Number(storage.getItem(ENABLE_KEY)) > Date.now(); } catch (_) {}
    $('status').textContent = `Запись: ${enabled ? 'включена' : 'выключена'}. Сохранённых запусков: ${report.history.length}.\n${explanation}`;
  } finally { diag.close(); $('refresh').disabled = false; }
}
$('enable').onclick = () => { try { storage.setItem(ENABLE_KEY, String(Date.now() + 15 * 60 * 1000)); void refresh(); } catch (_) { $('status').textContent = 'Браузер не разрешил локальную запись диагностики.'; } };
$('stop').onclick = () => { try { storage.removeItem(ENABLE_KEY); } catch (_) {} void refresh(); };
$('refresh').onclick = () => { void refresh(); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('report').value); $('status').textContent = 'Отчёт скопирован. Его можно отправить разработчику.'; } catch (_) { $('report').focus(); $('report').select(); $('status').textContent = 'Текст выделен — скопируйте его вручную.'; } };
void refresh();
