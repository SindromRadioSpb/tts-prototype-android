/* Device-local download protocol. No acquisition API, media import or ASR. */
(function (root) {
  'use strict';
  const MAX_BYTES = 300 * 1024 * 1024;
  const languages = ['ru', 'en', 'he'];
  const rights = ['owned', 'permission', 'public-domain'];
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  function only(value, fields) {
    if (!plain(value) || Object.keys(value).some(k => !fields.includes(k))) throw new Error('PROTOCOL_INVALID');
  }
  function videoId(raw) {
    let url;
    try { url = new URL(String(raw).trim()); } catch (_) { throw new Error('VIDEO_URL_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('VIDEO_URL_INVALID');
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    else if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else if (/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('VIDEO_URL_INVALID');
    return id;
  }
  function request(value) {
    only(value, ['v', 'job', 'source', 'rights', 'language', 'action']);
    if (value.v !== 1 || !/^[a-f0-9]{32}$/.test(value.job) || !/^[A-Za-z0-9_-]{11}$/.test(value.source) ||
      !rights.includes(value.rights) || !languages.includes(value.language) || !['start', 'open'].includes(value.action)) {
      throw new Error('REQUEST_INVALID');
    }
    return { v: 1, job: value.job, source: value.source, rights: value.rights, language: value.language, action: value.action };
  }
  function encode(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(value) {
    if (typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('PROTOCOL_INVALID');
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  }
  function started(value, now) {
    return { request: request(value), state: 'requested', requested_at: now || Date.now(), browser_file_verified: false };
  }
  function acceptReturn(pending, value) {
    const req = request(pending);
    only(value, ['v', 'job', 'source', 'state', 'kind', 'quality', 'name', 'bytes', 'sha256', 'error']);
    if (value.v !== 1 || value.job !== req.job || value.source !== req.source ||
      !['ready', 'canceled', 'failed', 'interrupted'].includes(value.state)) throw new Error('RETURN_INVALID');
    if (value.state === 'ready') {
      if (!['video', 'audio'].includes(value.kind) ||
        !(value.kind === 'audio' ? value.quality === null : [360, 480, 720, 1080].includes(value.quality)) ||
        typeof value.name !== 'string' || value.name.length > 180 || !value.name ||
        /[\x00-\x1f\x7f/\\:]/.test(value.name) || value.name.startsWith('.') ||
        !value.name.endsWith(value.kind === 'video' ? '.mp4' : '.m4a') ||
        !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_BYTES ||
        !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error('RETURN_INVALID');
    } else if (value.error != null && (typeof value.error !== 'string' || !/^[A-Z_]{1,64}$/.test(value.error))) {
      throw new Error('RETURN_INVALID');
    }
    return { request: req, state: value.state === 'ready' ? 'helper_ready' : value.state,
      result: { ...value }, evidence: 'HELPER_REPORTED', browser_file_verified: false, updated_at: Date.now() };
  }
  function launch(value, release) {
    const req = request(value);
    only(release, ['v', 'sha256', 'bytes', 'path', 'bootstrap']);
    if (release.v !== 1 || !/^[a-f0-9]{64}$/.test(release.sha256) ||
      release.path !== '/downloads/iphone-downloader-' + release.sha256.slice(0, 16) + '.pyz' ||
      !Number.isSafeInteger(release.bytes) || release.bytes < 1 || release.bytes > 1024 * 1024 ||
      typeof release.bootstrap !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(release.bootstrap) || release.bootstrap.length > 6000) {
      throw new Error('RELEASE_INVALID');
    }
    // Only build-time code and strict base64url data cross the shell boundary.
    // No source URL, title, owner path, credential or signed media URL is interpolated.
    const command = 'python3 -c "import base64;exec(base64.b64decode(\'' + release.bootstrap + '\'))" ' + encode(req);
    return 'ashellmini://' + encodeURIComponent(command);
  }
  const api = { videoId, request, encode, decode, started, acceptReturn, launch, MAX_BYTES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IPhoneDownloaderCore = api;
})(typeof window === 'object' ? window : globalThis);
