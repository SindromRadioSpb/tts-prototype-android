// Keep the full, searchable text in the table. Prepare word controls in short tasks,
// prioritising the viewport; distant rows must not delay reading or a saved position.
//
// Every frame that changes a long table costs the browser far more than the change itself (paint
// properties, layout and commit of one huge layer), so in a browser the background tail waits
// while the person scrolls and then runs one larger slice per drawn frame. Rows next to the ones
// on screen are prepared with them: a rootMargin does not reach past a scrolling table container.
// The Studio uses the same algorithm through ReaderMorph.createRowWork (classic script).
const AHEAD = 8, BEHIND = 3, SCROLL_QUIET_MS = 220;
let lastScrollAt = -1e9, scrollWatched = false;
function watchScroll() {
  if (scrollWatched || typeof window === 'undefined' || !window.addEventListener) return;
  scrollWatched = true;
  const mark = () => { lastScrollAt = performance.now(); };
  for (const name of ['scroll', 'touchmove', 'wheel']) window.addEventListener(name, mark, { capture: true, passive: true });
}

export function scheduleRowWork(mount, prepare, options = {}) {
  const rows = Array.from(mount.querySelectorAll('tr[data-row-idx]'));
  const positions = new Map(rows.map((row, i) => [row, i]));
  const done = new Set(), priority = new Set();
  let cursor = 0, cancelled = false, timer = null, frame = null, observer = null, resolve;
  const complete = new Promise(r => { resolve = r; });
  const isCurrent = options.isCurrent || (() => mount.isConnected);
  const framed = typeof requestAnimationFrame === 'function';
  function ensure(row) {
    if (!row || cancelled || done.has(row) || !isCurrent() || !mount.contains(row)) return false;
    prepare(row);
    done.add(row); priority.delete(row);
    if (observer) observer.unobserve(row);
    return true;
  }
  function clearPending() {
    if (timer != null) { if (timer !== -1) clearTimeout(timer); timer = null; }
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
  }
  function stop(ok) {
    cancelled = true; clearPending();
    if (observer) observer.disconnect();
    mount.removeEventListener('focusin', focus);
    priority.clear(); resolve(ok);
  }
  const quiet = () => performance.now() - lastScrollAt >= SCROLL_QUIET_MS;
  function schedule() {
    if (timer != null || frame != null || cancelled) return;
    if (!framed || priority.size > 0) { timer = setTimeout(step, 0); return; }
    watchScroll();
    // the word engine colours the rows on screen: the background tail waits while it is built
    const busy = typeof window !== 'undefined' && window.ReaderMorph && window.ReaderMorph.engineBusy && window.ReaderMorph.engineBusy();
    if (busy) { timer = -1; busy.then(() => { if (timer === -1) { timer = null; frame = requestAnimationFrame(() => { frame = null; timer = setTimeout(step, 0); }); } }); return; }
    timer = setTimeout(() => {
      timer = null;
      frame = requestAnimationFrame(() => { frame = null; timer = setTimeout(step, 0); });
    }, quiet() ? 0 : SCROLL_QUIET_MS);
  }
  function step() {
    timer = null;
    if (cancelled) return;
    if (!isCurrent()) { stop(false); return; }
    const urgent = priority.size > 0;
    if (framed && !urgent && !quiet()) { schedule(); return; }
    const deadline = performance.now() + (framed && !urgent ? 24 : 8);
    do {
      const next = priority.values().next().value;
      if (next) ensure(next);
      else if (cursor < rows.length) ensure(rows[cursor++]);
      else { stop(true); return; }
    } while (performance.now() < deadline);
    schedule();
  }
  function focus(event) { ensure(event.target.closest('tr[data-row-idx]')); }
  mount.addEventListener('focusin', focus);
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      let added = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const at = positions.get(entry.target);
        if (at == null) continue;
        // the row itself first, then the rows below it (scrolling down), then the few above
        for (let k = 0; k <= AHEAD + BEHIND; k++) {
          const n = k <= AHEAD ? at + k : at - (k - AHEAD), row = rows[n];
          if (row && !done.has(row) && !priority.has(row)) { priority.add(row); added = true; }
        }
      }
      // a row coming on screen does not wait for a background pause
      if (added && !cancelled) { clearPending(); schedule(); }
    }, { rootMargin: '700px 0px' });
    rows.forEach(row => observer.observe(row));
  }
  // Prepare at least one row before observer delivery, but long paragraphs must not
  // turn the eight-row first-screen allowance into an unbounded synchronous task.
  const warmupDeadline = performance.now() + 8;
  for (const row of rows.slice(0, 8)) {
    ensure(row);
    if (performance.now() >= warmupDeadline) break;
  }
  timer = setTimeout(step, 0);
  return { complete, ensure, cancel: () => stop(false) };
}
