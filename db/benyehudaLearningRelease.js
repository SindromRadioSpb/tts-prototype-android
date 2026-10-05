// Read-only resolution of the immutable release deployed with this application image.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MANIFEST = path.join(__dirname, '../public/data/benyehuda/learning-release-v8.json');
function publishedFile(workId, manifestPath = MANIFEST) {
  if (!fs.existsSync(manifestPath)) return null;
  const bytes = fs.readFileSync(manifestPath);
  if (manifestPath === MANIFEST) {
    const root = JSON.parse(fs.readFileSync(path.join(path.dirname(MANIFEST), 'corpus-catalog-v8.json'), 'utf8'));
    checkBody(bytes, root.release_manifest_sha256);
  }
  const manifest = JSON.parse(bytes.toString('utf8'));
  const work = manifest.works.find(item => item.work_id === String(workId));
  if (!work) return null;
  if (!/^\d{1,8}$/.test(String(workId)) || !new RegExp('^works/' + workId + '-[a-f0-9]{32}\\.json$').test(work.body)
    || !/^[a-f0-9]{64}$/.test(work.body_sha256) || !work.body.includes(work.body_sha256.slice(0, 32))) throw new Error('Invalid published work reference');
  return { name: path.basename(work.body), sha256: work.body_sha256 };
}
function checkBody(bytes, expected) {
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Published work checksum mismatch');
}
module.exports = { publishedFile, checkBody };
