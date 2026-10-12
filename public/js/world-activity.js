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
  // One pass per burst, not per mutation. The status colouring changes the class of every word of a
  // long text (7 372 spans on the owner's 477-row material); calling sync for each batch ran a document-wide
  // querySelector thousands of times and held the main thread ~19 s of every 25 (O-080, Room, 3.11.748).
  // Word spans (.rm-w) never carry a reading/audio mode, so their mutations are ignored outright.
  let pending = 0;
  function schedule() { if (!pending) pending = setTimeout(() => { pending = 0; sync(); }, 80); }
  function relevant(m) {
    const t = m.target;
    return !(t && t.classList && t.classList.contains('rm-w')) && !(t && t.parentElement && t.parentElement.classList && t.parentElement.classList.contains('rm-w'));
  }
  window.LPWorldActivity = { sync, setAudio, trackMedia };
  new MutationObserver((muts) => { for (let i = 0; i < muts.length; i++) if (relevant(muts[i])) { schedule(); return; } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'data-phase', 'hidden'], childList: true });
  document.addEventListener('lp-world:changed', sync);
  sync();
})();
