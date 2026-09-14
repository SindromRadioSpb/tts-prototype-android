// Opt-in, bounded, content-free local breadcrumbs. No SQLite/OPFS access.
export const JOURNAL_KEY = 'localdb-diagnostic-journal-v1';
export const ENABLE_KEY = 'localdb-diagnostic-until-v1';
const phases = /^[a-z][a-z0-9-]{0,63}$/;
export function safeSnapshot(value = {}) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const key of ['phase', 'operation', 'coordination', 'event']) {
    if (typeof value[key] === 'string' && phases.test(value[key])) out[key] = value[key];
  }
  for (const key of ['runtime', 'elapsedMs', 'requestId', 'pendingCount', 'oldestPendingMs', 'at']) {
    if (Number.isFinite(value[key]) && value[key] >= 0) out[key] = value[key];
  }
  for (const key of ['holdsLease', 'transactionIdle', 'persisted']) if (typeof value[key] === 'boolean') out[key] = value[key];
  if (['AccessHandlePool', 'tts-opfs-idb'].includes(value.vfs)) out.vfs = value.vfs;
  if (/^[0-9a-f-]{36}$/.test(value.workerId || '')) out.workerId = value.workerId;
  if (/^DB_[A-Z0-9_]{1,64}$/.test(value.code || '')) out.code = value.code;
  return out;
}
export function readJournal(storage) {
  try {
    const rows = JSON.parse(storage.getItem(JOURNAL_KEY) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.slice(-8).map(row => ({
      workerId: safeSnapshot(row).workerId,
      version: /^\d+\.\d+\.\d+$/.test(row.version || '') ? row.version : 'unknown',
      surface: ['studio', 'room', 'other'].includes(row.surface) ? row.surface : 'other',
      events: Array.isArray(row.events) ? row.events.slice(-24).map(safeSnapshot) : [],
    }));
  } catch (_) { return []; }
}
export function createDiagnosticJournal({ storage, workerId, version, surface, now = Date.now }) {
  let until = 0;
  try { until = Math.min(Number(storage.getItem(ENABLE_KEY)) || 0, now() + 15 * 60 * 1000); } catch (_) {}
  const entry = { workerId, version, surface, events: [] };
  const enabled = () => {
    try { return now() < until && now() < Number(storage.getItem(ENABLE_KEY)); } catch (_) { return false; }
  };
  return {
    enabled,
    record(value) {
      if (!enabled()) return;
      entry.events.push({ ...safeSnapshot(value), at: now() });
      entry.events = entry.events.slice(-24);
      try {
        const rows = readJournal(storage).filter(row => row.workerId !== workerId).slice(-7);
        storage.setItem(JOURNAL_KEY, JSON.stringify([...rows, entry]));
      } catch (_) { /* Diagnostic quota/access failure must never affect DB work. */ }
    },
  };
}
