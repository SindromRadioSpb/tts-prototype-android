// Content-free, on-demand worker diagnostics. Never queries SQLite, steals a
// lock, changes storage identity or sends anything to a server.
export const IDENTITY_PREFIX = 'linguistpro-diag-id-v1';
const DB_LOCKS = new Set(['linguistpro-opfs-db-owner-v1', '/app.db-outer', '/app.db-reserved']);
const SURFACES = ['studio', 'room', 'other'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RELEASE = /^\d{1,2}\.\d{1,3}\.\d{1,4}$/;
const IDENTITY = /^linguistpro-diag-id-v1\|worker\|(studio|room|other)\|(\d{1,2}\.\d{1,3}\.\d{1,4})\|([0-9a-f-]{36})\|([0-9a-f-]{36})\|(\d{1,2})\|(\d{10})$/;

// Opt-in identity of one DB worker, built only from allowlisted fields. The
// browser lock manager reports this name with the client that holds it, so a
// frozen worker is identifiable without answering anything itself.
export function identityLockName({ surface, release, documentId, workerId, generation, createdSec }) {
  if (!SURFACES.includes(surface) || !RELEASE.test(release || '') || !UUID.test(documentId || '') || !UUID.test(workerId || '')
    || !Number.isInteger(generation) || generation < 1 || generation > 99
    || !Number.isInteger(createdSec) || String(createdSec).length !== 10) return null;
  return [IDENTITY_PREFIX, 'worker', surface, release, documentId, workerId, generation, createdSec].join('|');
}

export function parseIdentity(name) {
  const match = IDENTITY.exec(typeof name === 'string' ? name : '');
  if (!match || !UUID.test(match[3]) || !UUID.test(match[4])) return null;
  return { surface: match[1], release: match[2], documentId: match[3], workerId: match[4], generation: Number(match[5]), createdSec: Number(match[6]) };
}

// Unique name + ifAvailable: never contended, never awaited by DB work, and
// released when the opt-in recording window ends.
export function holdIdentityLock({ locks, name, holdMs, setTimer = setTimeout }) {
  if (!name || typeof locks?.request !== 'function') return false;
  try {
    Promise.resolve(locks.request(name, { ifAvailable: true }, lock => (lock ? new Promise(release => setTimer(release, holdMs)) : undefined))).catch(() => {});
    return true;
  } catch (_) { return false; }
}

// Joins DB lock holders and waiters to identity locks. Raw clientIds never
// leave this function: each client becomes a per-report label (C1, C2, ...).
export function describeLocks(value, { self = null, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const labels = new Map();
  const label = clientId => {
    if (typeof clientId !== 'string' || !clientId) return 'unknown';
    if (!labels.has(clientId)) labels.set(clientId, `C${labels.size + 1}`);
    return labels.get(clientId);
  };
  const rows = list => (Array.isArray(list) ? list : []);
  const db = list => rows(list).filter(row => DB_LOCKS.has(row?.name)).map(row => ({ name: row.name, mode: row.mode, client: label(row.clientId) }));
  const held = db(value?.held);
  const pending = db(value?.pending);
  const identities = new Map();
  for (const row of rows(value?.held)) {
    const identity = parseIdentity(row?.name);
    if (identity && identities.size < 16) identities.set(label(row.clientId), identity);
  }
  const clients = [...labels.values()].map(client => {
    const identity = identities.get(client) || null;
    return { client, identity: identity && { ...identity, ageSec: Math.max(0, nowSec - identity.createdSec) },
      self: !!(identity && self?.workerId && identity.workerId === self.workerId),
      sameDocumentAsSelf: !!(identity && self?.documentId && identity.documentId === self.documentId) };
  });
  const byLabel = new Map(clients.map(client => [client.client, client]));
  const relations = held.map(lock => {
    const holder = byLabel.get(lock.client);
    return { lock: lock.name, holder: lock.client, holderIdentified: !!holder?.identity, holderIsSelf: !!holder?.self,
      waiters: pending.filter(row => row.name === lock.name).map(row => {
        const waiter = byLabel.get(row.client);
        return { client: row.client, identified: !!waiter?.identity, self: !!waiter?.self, sameClientAsHolder: row.client === lock.client,
          sameDocumentAsHolder: !!(holder?.identity && waiter?.identity && holder.identity.documentId === waiter.identity.documentId) };
      }) };
  });
  return { held, pending, clients, relations };
}

// Short, content-free holder description for a lock error message.
export function holderSummary(locks) {
  if (!locks || locks.unavailable) return 'unknown';
  const relation = locks.relations?.find(row => row.waiters.some(waiter => waiter.self)) || locks.relations?.[0];
  if (!relation) return 'none';
  if (relation.holderIsSelf) return 'self';
  const holder = locks.clients.find(client => client.client === relation.holder);
  if (!holder?.identity) return 'uninstrumented';
  const selfKnown = locks.clients.some(client => client.self);
  const document = !selfKnown ? 'document-unknown' : holder.sameDocumentAsSelf ? 'same-document' : 'other-document';
  return `${holder.identity.surface}/${holder.identity.release}/${document}/gen${holder.identity.generation}/age${holder.identity.ageSec}s`;
}

export function createRuntimeDiagnostics({ snapshot, locks, self = () => null, Channel = globalThis.BroadcastChannel, waitMs = 150 }) {
  let channel;
  const pending = new Map();
  try {
    channel = typeof Channel === 'function' ? new Channel('localdb-diagnostics-v1') : null;
    if (channel) channel.onmessage = ({ data }) => {
      if (data?.kind === 'probe' && typeof data.id === 'string') {
        channel.postMessage({ kind: 'snapshot', id: data.id, value: snapshot() });
      } else if (data?.kind === 'snapshot') {
        const rows = pending.get(data.id);
        if (rows && rows.length < 16) rows.push(data.value);
      }
    };
  } catch (_) { channel = null; }
  return {
    async capture() {
      const id = globalThis.crypto.randomUUID();
      const peers = [];
      pending.set(id, peers);
      let lockState = { unavailable: true };
      // Query and peer responses are bounded independently of the DB queue.
      // An unresponsive worker is reported as unknown, not pronounced dead.
      const query = Promise.resolve().then(() => locks?.query()).then(value => {
        if (!value) return;
        lockState = describeLocks(value, { self: self() });
      }).catch(() => {});
      try { channel?.postMessage({ kind: 'probe', id }); } catch (_) {}
      await Promise.race([query.then(() => new Promise(resolve => setTimeout(resolve, waitMs))), new Promise(resolve => setTimeout(resolve, waitMs * 2))]);
      pending.delete(id);
      return { own: snapshot(), peers, locks: lockState };
    },
    close() { channel?.close(); pending.clear(); },
  };
}
