// vfs-order.js — pure VFS attempt-order helper, extracted out of db-worker.js so its
// correctness is unit-testable in plain Node (no Worker/browser globals needed).
//
// `preferVfs` is the STICKY preference persisted by local-db.js — the real `vfs.name` that
// won last time (AccessHandlePoolVFS.name getter literally returns 'AccessHandlePool';
// IDBBatchAtomicVFS.name is whatever DB name string its constructor got — 'tts-opfs-idb' in
// db-worker.js, NOT the generic label 'IDBBatchAtomic'). Bug found via owner's iPhone repro
// 2026-07-05 (Room↔Studio hard-nav → raw SQLITE_CANTOPEN, then a page landing on 0 texts): the
// OLD code compared `preferVfs` directly against this same generic-label array, which never
// matched the IDB choice, so the sticky preference was a silent no-op — EVERY boot retried
// AccessHandlePoolVFS first regardless of which VFS actually holds the user's data. That
// VFS's constructor unconditionally acquires real OPFS sync access handles (exclusive
// per-origin) even on a doomed attempt, making repeated attempts a real leak risk if a page is
// torn down before its own cleanup completes.
export const VFS_CHOICE_NAME = { AccessHandlePool: 'AccessHandlePool', IDBBatchAtomic: 'tts-opfs-idb' };

export function computeVfsOrder(preferVfs) {
  const order = ['AccessHandlePool', 'IDBBatchAtomic'];
  if (preferVfs) {
    const preferredChoice = Object.keys(VFS_CHOICE_NAME).find((k) => VFS_CHOICE_NAME[k] === preferVfs);
    if (preferredChoice) order.sort((a, b) => (a === preferredChoice ? -1 : (b === preferredChoice ? 1 : 0)));
  }
  return order;
}
