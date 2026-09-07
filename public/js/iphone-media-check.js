(function (root) {
  'use strict';
  const rightsValues = new Set(['owned', 'permission', 'public-domain']);
  function videoId(raw) {
    let url;
    try { url = new URL(String(raw).trim()); } catch (_) { throw new Error('VIDEO_URL_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('VIDEO_URL_INVALID');
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('VIDEO_URL_INVALID');
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    else if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else if (/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('VIDEO_URL_INVALID');
    return id;
  }
  function downloadCommand(url, kind, rights) {
    if (!rightsValues.has(rights)) throw new Error('RIGHTS_REQUIRED');
    if (!['audio', 'video'].includes(kind)) throw new Error('KIND_INVALID');
    return 'python3 run.py --download --video-id ' + videoId(url) + ' --kind ' + kind +
      (kind === 'video' ? ' --quality 360' : '') + ' --rights ' + rights;
  }
  function returnCommand(jobId) {
    if (!/^[a-f0-9]{32}$/.test(jobId)) throw new Error('JOB_ID_INVALID');
    return 'python3 run.py --return-chrome ' + jobId;
  }
  if (typeof module === 'object' && module.exports) module.exports = { videoId, downloadCommand, returnCommand };
  if (!root.document) return;
  const byId = id => root.document.getElementById(id);
  function updateSource() {
    byId('downloadCommands').hidden = true;
    byId('audioCommand').textContent = '';
    byId('videoCommand').textContent = '';
    try {
      const audio = downloadCommand(byId('source').value, 'audio', byId('rights').value);
      const video = downloadCommand(byId('source').value, 'video', byId('rights').value);
      byId('audioCommand').textContent = audio;
      byId('videoCommand').textContent = video;
      byId('downloadCommands').hidden = false;
      byId('sourceStatus').textContent = 'Команды готовы. Скопируйте и запускайте по одной в a-Shell mini.';
    } catch (error) {
      byId('sourceStatus').textContent = error.message === 'RIGHTS_REQUIRED' ?
        'Выберите основание — появятся команды.' : 'Нужна HTTPS-ссылка на один ролик YouTube. Проверьте адрес.';
    }
  }
  byId('source').addEventListener('input', updateSource);
  byId('rights').addEventListener('change', updateSource);
  byId('jobId').addEventListener('input', () => {
    byId('returnBlock').hidden = true;
    byId('returnCommand').textContent = '';
    try {
      byId('returnCommand').textContent = returnCommand(byId('jobId').value.trim());
      byId('returnBlock').hidden = false;
      byId('returnStatus').textContent = 'Выполните эту команду в a-Shell mini после завершения скачивания.';
    } catch (_) { byId('returnStatus').textContent = 'Нужен job_id из отчёта: 32 строчных символа 0–9, a–f, без кавычек.'; }
  });
  let toastTimer;
  for (const button of root.document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const text = byId(button.dataset.copy).textContent;
      if (!text) return;
      try {
        await root.navigator.clipboard.writeText(text);
        byId('copyStatus').textContent = 'Скопировано. Вставьте команду в a-Shell mini.';
      } catch (_) { byId('copyStatus').textContent = 'Не удалось скопировать. Выделите команду и скопируйте вручную.'; }
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { byId('copyStatus').textContent = ''; }, 7000);
    });
  }
  updateSource();
})(typeof window === 'object' ? window : globalThis);
