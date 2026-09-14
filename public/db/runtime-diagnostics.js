// Content-free, on-demand worker diagnostics. Never queries SQLite, steals a
// lock, changes storage identity or sends anything to a server.
export function createRuntimeDiagnostics({ snapshot, locks, Channel = globalThis.BroadcastChannel, waitMs = 150 }) {
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
        const known = row => row.name === 'linguistpro-opfs-db-owner-v1' || row.name === '/app.db-outer' || row.name === '/app.db-reserved';
        lockState = {
          held: value.held.filter(known).map(({ name, mode }) => ({ name, mode })),
          pending: value.pending.filter(known).map(({ name, mode }) => ({ name, mode })),
        };
      }).catch(() => {});
      try { channel?.postMessage({ kind: 'probe', id }); } catch (_) {}
      await Promise.race([query.then(() => new Promise(resolve => setTimeout(resolve, waitMs))), new Promise(resolve => setTimeout(resolve, waitMs * 2))]);
      pending.delete(id);
      return { own: snapshot(), peers, locks: lockState };
    },
    close() { channel?.close(); pending.clear(); },
  };
}
