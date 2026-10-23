// Keep the full, searchable text in the table. Prepare word controls in short tasks,
// prioritising the viewport; distant rows must not delay reading or a saved position.
export function scheduleRowWork(mount, prepare, options = {}) {
  const rows = Array.from(mount.querySelectorAll('tr[data-row-idx]'));
  const done = new Set(), priority = new Set();
  let cursor = 0, cancelled = false, timer = null, observer = null, resolve;
  const complete = new Promise(r => { resolve = r; });
  const isCurrent = options.isCurrent || (() => mount.isConnected);
  function ensure(row) {
    if (!row || cancelled || done.has(row) || !isCurrent() || !mount.contains(row)) return false;
    prepare(row);
    done.add(row); priority.delete(row);
    if (observer) observer.unobserve(row);
    return true;
  }
  function stop(ok) {
    cancelled = true; clearTimeout(timer);
    if (observer) observer.disconnect();
    mount.removeEventListener('focusin', focus);
    priority.clear(); resolve(ok);
  }
  function step() {
    if (cancelled) return;
    if (!isCurrent()) { stop(false); return; }
    const deadline = performance.now() + 8;
    do {
      const next = priority.values().next().value;
      if (next) ensure(next);
      else if (cursor < rows.length) ensure(rows[cursor++]);
      else { stop(true); return; }
    } while (performance.now() < deadline);
    timer = setTimeout(step, 0);
  }
  function focus(event) { ensure(event.target.closest('tr[data-row-idx]')); }
  mount.addEventListener('focusin', focus);
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && !done.has(entry.target)) priority.add(entry.target);
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
