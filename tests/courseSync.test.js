const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/course-evidence');
const S = require('../public/js/course-store');
const Sync = require('../public/js/course-sync');

function progress(ids) {
  let p = E.emptyProgress('ulpan');
  for (const [id, at] of ids) {
    p = E.record(p, { lessonId: 'L001', lessonVersion: 1, task: { id, spec: { kind: 'order' } },
      channel: 'read', input: id, result: { kind: 'accepted' }, at }).progress;
    p.attempts.at(-1).id = id;
  }
  return p;
}
function response(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }
function fakeServer() {
  let remote = null, gets = 0, puts = 0;
  return {
    get remote() { return remote; }, get gets() { return gets; }, get puts() { return puts; },
    fetch: async (_url, opts) => {
      if (opts.method === 'GET') { gets++; return remote ? response(200, { payload: remote, digest: E.progressDigest(remote) }) : response(404, {}); }
      puts++;
      const { payload, baseDigest } = JSON.parse(opts.body);
      if ((remote ? E.progressDigest(remote) : null) !== baseDigest) return response(409, { payload: remote, digest: E.progressDigest(remote) });
      remote = payload;
      return response(200, { digest: E.progressDigest(remote) });
    }
  };
}
test('offline phone and desktop converge to all five attempts', async () => {
  const server = fakeServer();
  const phone = S.memoryStore(), desktop = S.memoryStore();
  phone.save(progress([['a', 1], ['b', 2], ['c', 3]]));
  desktop.save(progress([['d', 4], ['e', 5]]));
  const options = { courseId: 'ulpan', me: { user: { id: 'u1' }, csrf: 'token' }, consent: true, fetch: server.fetch };
  assert.equal(await Sync.create({ ...options, store: desktop }).syncNow(), 'synced');
  assert.equal(await Sync.create({ ...options, store: phone }).syncNow(), 'synced');
  await Sync.create({ ...options, store: desktop }).syncNow();
  assert.deepEqual(phone.load('ulpan').progress.attempts.map(a => a.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(desktop.load('ulpan').progress.attempts.map(a => a.id), ['a', 'b', 'c', 'd', 'e']);
});
test('409 merges concurrent tab writes and retries once', async () => {
  const server = fakeServer(), store = S.memoryStore();
  store.save(progress([['a', 1]]));
  let first = true;
  const fetch = async (url, opts) => {
    if (opts.method === 'PUT' && first) { first = false; await server.fetch(url, { method: 'PUT', body: JSON.stringify({ payload: progress([['b', 2]]), baseDigest: null }) }); }
    return server.fetch(url, opts);
  };
  const sync = Sync.create({ store, courseId: 'ulpan', me: { user: { id: 'u1' }, csrf: 'token' }, consent: true, fetch });
  assert.equal(await sync.syncNow(), 'synced');
  assert.deepEqual(server.remote.attempts.map(a => a.id), ['a', 'b']);
  assert.equal(server.puts, 3);
});
test('server failure preserves local progress and unauthorised state stays local', async () => {
  for (const status of [413, 503, 401]) {
    const store = S.memoryStore(); store.save(progress([['a', 1]]));
    let calls = 0;
    const sync = Sync.create({ store, courseId: 'ulpan', me: { user: { id: 'u1' }, csrf: 'token' }, consent: true,
      fetch: async () => { calls++; return calls === 1 ? response(404, {}) : response(status, {}); } });
    assert.equal(await sync.syncNow(), status === 401 ? 'local_only' : 'error');
    assert.deepEqual(store.load('ulpan').progress.attempts.map(a => a.id), ['a']);
  }
});
test('missing consent and changed user never fetch or mix anonymous progress', async () => {
  const store = S.memoryStore(); store.save(progress([['anon', 1]]));
  let calls = 0, me = { user: { id: 'u1' }, csrf: 'token' };
  const opts = { store, courseId: 'ulpan', me: () => me, fetch: async () => { calls++; return response(404, {}); } };
  assert.equal(await Sync.create({ ...opts, consent: false }).syncNow(), 'local_only');
  const sync = Sync.create({ ...opts, consent: true, userKey: 'u1' });
  me = { user: { id: 'u2' }, csrf: 'other' };
  assert.equal(await sync.syncNow(), 'local_only');
  assert.equal(calls, 0);
});
test('an attempt recorded during PUT remains pending for another sync', async () => {
  const store = S.memoryStore(); store.save(progress([['a', 1]]));
  const server = fakeServer();
  const fetch = async (url, opts) => {
    if (opts.method === 'PUT') store.save(progress([['a', 1], ['b', 2]]));
    return server.fetch(url, opts);
  };
  const sync = Sync.create({ store, courseId: 'ulpan', me: { user: { id: 'u1' }, csrf: 'token' }, consent: true, fetch });
  assert.equal(await sync.syncNow(), 'pending');
  assert.deepEqual(store.load('ulpan').progress.attempts.map(a => a.id), ['a', 'b']);
  sync.dispose();
});
