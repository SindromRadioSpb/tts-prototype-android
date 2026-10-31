'use strict';
// Engineering atlas: the owner's "page proofread" marks. One small JSON file per atlas on the data volume
// (DATA_DIR/atlas-review/<atlasId>.json), kept apart from the published reader data so a re-publish of the
// sections never wipes the owner's work. Anyone may read the marks; only the owner sets them.
const fs = require('fs');
const path = require('path');

const ATLAS_ID = /^[a-z0-9-]{1,40}$/;

function createStore(dir) {
  const file = (id) => path.join(dir, id + '.json');
  function read(id) {
    try {
      const data = JSON.parse(fs.readFileSync(file(id), 'utf8'));
      return data && typeof data.pages === 'object' && data.pages ? data : { pages: {} };
    } catch (_) { return { pages: {} }; }
  }
  function write(id, data) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file(id) + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, file(id));
  }
  function set(id, page, reviewed, by) {
    const data = read(id);
    if (reviewed) data.pages[String(page)] = { at: new Date().toISOString(), by: String(by || '') };
    else delete data.pages[String(page)];
    write(id, data);
    return data;
  }
  return { read, set };
}

function publicView(data) {
  const pages = {};
  Object.keys(data.pages || {}).forEach((p) => { pages[p] = { at: data.pages[p].at }; });
  return { ok: true, pages };
}

function installRoutes(app, { dir, requireUser, requireCsrf, limiter }) {
  const store = createStore(dir);
  app.get('/api/atlas/:id/review', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!ATLAS_ID.test(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json(publicView(store.read(req.params.id)));
  });
  const guards = limiter ? [limiter] : [];
  app.post('/api/atlas/:id/review', ...guards, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!ATLAS_ID.test(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
    const auth = await requireUser(req, res); if (!auth) return;
    if (String(auth.user.role || '').toLowerCase() !== 'owner') return res.status(403).json({ ok: false, error: 'OWNER_ONLY' });
    if (!requireCsrf(req, res, auth)) return;
    const page = Number(req.body && req.body.page);
    if (!Number.isInteger(page) || page < 1 || page > 5000) return res.status(400).json({ ok: false, error: 'BAD_PAGE' });
    try {
      res.json(publicView(store.set(req.params.id, page, !!req.body.reviewed, auth.user.id)));
    } catch (_) {
      res.status(500).json({ ok: false, error: 'SAVE_FAILED' });
    }
  });
  return store;
}

module.exports = { installRoutes, createStore };
