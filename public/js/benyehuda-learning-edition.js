// Immutable publication verification and device-edition policy; no storage writes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BenYehudaLearningEdition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HASH = /^[a-f0-9]{64}$/;
  const BODY = /^works\/\d{1,8}-[a-f0-9]{32}\.json$/;
  const PREVIEW = /^works\/\d{1,8}-[a-f0-9]{16}-preview\.json$/;
  async function verifyBytes(bytes, expected) {
    if (!HASH.test(expected || '') || !globalThis.crypto?.subtle) throw new Error('Unverifiable publication');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error('Publication hash mismatch');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function verifyBundle(card, bytes) {
    const bundle = card.bundle_sha256 ? await verifyBytes(bytes, card.bundle_sha256) : JSON.parse(new TextDecoder().decode(bytes));
    const texts = bundle?.library?.texts;
    if (!Array.isArray(texts) || !texts.length) throw new Error('Malformed publication');
    if (card.learning_edition_id && (!BODY.test(card.file) || texts.length !== 1
      || texts[0].text_key !== card.text_key || String(texts[0].corpus?.byehuda_id) !== String(card.id)
      || texts[0].source_meta?.public_learning?.edition_id !== card.learning_edition_id
      || texts[0].rows?.length !== Number(card.segments))) throw new Error('Publication identity mismatch');
    if ('canon_version' in bundle.library) throw new Error('Publication cannot reconcile device editions');
    return bundle;
  }
  async function verifyManifest(root, bytes) {
    const manifest = await verifyBytes(bytes, root.release_manifest_sha256);
    const ids = [...manifest.works.map(x => x.work_id), ...manifest.retained_works.map(x => x.work_id)];
    if (manifest.catalog_version !== root.version || new Set(ids).size !== ids.length
      || ids.length !== root.counts.baked || root.pointers.ready.some(id => !ids.includes(id))) throw new Error('Release manifest mismatch');
    return manifest;
  }
  function deviceChoice(card, currentId, previousIds, openPublished) {
    if (currentId) return { id: currentId, edition: 'published' };
    if (!openPublished && card.learning_edition_id && previousIds.length) return { id: previousIds[0], edition: 'previous' };
    return { id: null, edition: 'published' };
  }
  return { verifyBytes, verifyBundle, verifyManifest, deviceChoice, BODY, PREVIEW };
});
