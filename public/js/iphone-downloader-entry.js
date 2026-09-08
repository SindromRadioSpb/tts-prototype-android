/* Navigation only. Does not change media import, readiness, captions or ASR. */
(function () {
  'use strict';
  function init() {
    const isPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent) || /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    if (!isPhone) return;
    const panel = document.getElementById('v3PhoneDownloader');
    const link = document.getElementById('v3PhoneDownloadLink');
    if (!panel || !link) return;
    panel.hidden = false;
    const external = document.getElementById('v3DownrHandoff');
    if (external) external.hidden = true;
    link.addEventListener('click', () => {
      link.href = '/download-media.html';
      try {
        const value = document.getElementById('v3ImportVideoUrl').value;
        link.href += '#source=' + window.IPhoneDownloaderCore.videoId(value);
      } catch (_) { /* Empty or invalid input can be corrected on the download screen. */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
