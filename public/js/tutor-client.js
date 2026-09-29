/* M1: explicit immutable local snapshot and same-origin relay. No provider keys. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LPTutorClient = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  async function sha(text) {
    const bytes = new TextEncoder().encode(text);
    const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
  }
  function capture({ surface, materialKey, rows, index, locale }) {
    const row = rows[index];
    const text = r => String(r && (r.he_niqqud || r.he || r.he_plain) || '');
    if (!row || !text(row) || !materialKey) throw new Error('context_unavailable');
    // Capture synchronously, before capability/auth/crypto awaits or tab navigation.
    return { surface, materialKey: String(materialKey), locale: ['ru','en','he'].includes(locale) ? locale : 'ru',
      sentenceId: String(row._v3_sentenceId ?? row.id ?? row._v3_orderIndex ?? `row-${index}`),
      excerpt: text(row), before: text(rows[index - 1]), after: text(rows[index + 1]) };
  }
  async function build(snapshot) {
    const source = { kind: 'local_snapshot', material_id: 'local:' + await sha(snapshot.materialKey),
      sentence_id: 'row:' + await sha(snapshot.sentenceId), excerpt: snapshot.excerpt,
      before: snapshot.before.length <= 4000 ? snapshot.before : '', after: snapshot.after.length <= 4000 ? snapshot.after : '' };
    source.revision_id = 'snapshot:' + await sha(JSON.stringify(source));
    return { surface: snapshot.surface, locale: snapshot.locale, instructional_intent: 'explain', source };
  }
  function createApi(fetcher = fetch) {
    let csrf = '';
    async function call(path, body, signal) {
      const res = await fetcher('/api/tutor' + path, { method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json', ...(body === undefined ? {} : {'X-LP-CSRF': csrf}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || 'service_unavailable'), { code: data.error || 'service_unavailable' });
      return data;
    }
    async function identity() {
      const res = await fetcher('/api/auth/me', { credentials:'same-origin', cache:'no-store' });
      const data = await res.json();
      if (!res.ok || !data.user || !data.csrf) throw Object.assign(new Error('UNAUTHENTICATED'), {code:'UNAUTHENTICATED'});
      csrf = data.csrf;
      return data.user.id;
    }
    return { call, identity };
  }
  return { capture, build, createApi };
});
