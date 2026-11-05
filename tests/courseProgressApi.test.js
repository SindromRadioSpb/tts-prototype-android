const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer, waitForSmokeHealth } = require('../scripts/smoke-server-env');
const E = require('../public/js/course-evidence');
const { CLOUD_TEXTS_CONSENT_VERSION } = require('../public/js/cloud-sync');

test('course progress API gates consent and CSRF, reports conflicts and size', async () => {
  const root = path.resolve(__dirname, '..');
  const baseDir = path.join(root, '.tmp', 'course-progress-api');
  fs.mkdirSync(baseDir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(baseDir, 'run-'));
  const secret = 'course-progress-api-disposable-owner-0123456789';
  const child = spawn(process.execPath, ['-e', SMOKE_SERVER_BOOTSTRAP], {
    cwd: root, env: { ...smokeServerEnv(scratch, 0), AUTH_BOOTSTRAP_SECRET: secret, TTS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
  });
  let logs = ''; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    await waitForSmokeHealth(base, { timeoutMs: 60000 });
    const login = await fetch(base + '/api/auth/bootstrap-login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const session = await login.json();
    const url = base + '/api/learner/course-progress/ulpan';
    const get = (userId = session.user.id) => fetch(url, { headers: { cookie, 'X-LP-User': userId } });
    const put = (payload, baseDigest, csrf = session.csrf, userId = session.user.id) => fetch(url, { method: 'PUT',
      headers: { cookie, 'X-LP-User': userId, 'Content-Type': 'application/json', ...(csrf ? { 'X-LP-CSRF': csrf } : {}) },
      body: JSON.stringify({ payload, baseDigest }) });
    const p = E.emptyProgress('ulpan');
    assert.equal((await get()).status, 403);
    assert.equal((await put(p, null)).status, 403);
    const grant = await fetch(base + '/api/auth/consent', { method: 'POST', headers: { cookie,
      'X-LP-CSRF': session.csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'cloud_texts', granted: true, version: CLOUD_TEXTS_CONSENT_VERSION }) });
    assert.equal(grant.status, 200);
    assert.equal((await get()).status, 404);
    assert.equal((await get('wrong-user')).status, 409);
    assert.equal((await put(p, null, session.csrf, 'wrong-user')).status, 409);
    assert.equal((await put(p, null, null)).status, 403);
    const stored = await put(p, null); assert.equal(stored.status, 200);
    const digest = (await stored.json()).digest;
    assert.equal((await get()).status, 200);
    const stale = await put({ ...p, seen: { abc: 1 } }, 'stale');
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).digest, digest);
    assert.equal((await put({ ...p, attempts: [{ input: 'x'.repeat(2 * 1024 * 1024) }] }, digest)).status, 413);
  } catch (error) { throw new Error(error.stack + '\nserver log:\n' + logs.slice(-2000)); }
  finally { child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 5000))]); }
});
