/* App-owned activity bridge. Reads UI modes, never learner text or progress.
 * Detached/custom players report their real lifecycle here; no audio is created.
 */
(function () {
  'use strict';
  const sources = new Set(), tracked = new WeakSet();
  function sync() {
    const phase = document.getElementById('classicNextStep')?.dataset.phase;
    const reading = document.body.classList.contains('room-reading') || phase === 'learn';
    // Speech playback uses the same existing row state as the custom player UI.
    const speechOrRow = !!document.querySelector('.row-tts-playing, .row-playing');
    window.LPMemorialAdapter?.setActivity({ reading, audio: sources.size > 0 || speechOrRow });
  }
  function setAudio(source, playing) { if (playing) sources.add(source); else sources.delete(source); sync(); }
  function trackMedia(player) {
    if (tracked.has(player)) return;
    tracked.add(player);
    player.addEventListener('play', () => setAudio(player, true));
    for (const event of ['pause', 'ended', 'error', 'emptied']) player.addEventListener(event, () => setAudio(player, false));
    if (!player.paused && !player.ended) setAudio(player, true);
  }
  window.LPWorldActivity = { sync, setAudio, trackMedia };
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'data-phase', 'hidden'], childList: true });
  document.addEventListener('lp-world:changed', sync);
  sync();
})();
