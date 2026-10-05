// Read-only resolution of the immutable release deployed with this application image.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MANIFEST = path.join(__dirname, '../public/data/benyehuda/learning-release-v8.json');
let cached;
function publishedFile(workId, manifestPath = MANIFEST) {
  if (!/^\d{1,8}$/.test(String(workId))) return null;
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  if (manifestPath === MANIFEST) {
    const rootPath = path.join(path.dirname(MANIFEST), 'corpus-catalog-v8.json');
    const stamps = [manifestPath, rootPath].map(file => { const s = fs.statSync(file); return s.mtimeMs + ':' + s.size; }).join('|');
    if (!cached || cached.stamps !== stamps) {
      const bytes = fs.readFileSync(manifestPath), root = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
      checkBody(bytes, root.release_manifest_sha256);
      cached = { stamps, manifest: JSON.parse(bytes.toString('utf8')) };
    }
    manifest = cached.manifest;
  } else {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  const work = manifest.works.find(item => item.work_id === String(workId));
  const retained = !work && manifest.retained_works?.find(item => item.work_id === String(workId));
  if (retained) {
    if (retained.body !== 'works/' + workId + '.json' || !/^[a-f0-9]{64}$/.test(retained.sha256)) throw new Error('Invalid retained work reference');
    return { name: path.basename(retained.body), sha256: retained.sha256 };
  }
  if (!work) return null;
  if (!/^\d{1,8}$/.test(String(workId)) || !new RegExp('^works/' + workId + '-[a-f0-9]{32}\\.json$').test(work.body)
    || !/^[a-f0-9]{64}$/.test(work.body_sha256) || !work.body.includes(work.body_sha256.slice(0, 32))) throw new Error('Invalid published work reference');
  return { name: path.basename(work.body), sha256: work.body_sha256, textKey: work.edition_text_key, rows: work.rows, editionId: work.learning_edition_id };
}
function checkBody(bytes, expected) {
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Published work checksum mismatch');
}
module.exports = { publishedFile, checkBody };
