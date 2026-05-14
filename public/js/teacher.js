// public/js/teacher.js — Direction 11.5 teacher dashboard.
//
// Standalone vanilla-JS, no shared layout dependencies. Calls
// GET /api/research/v1/cohort/:code/aggregates with Bearer token (Phase 11.4).
// Renders summary tiles, SVG line charts, per-student table (k-gated),
// Pearson correlations, scatter plot with linear regression, CSV exports.

(function () {
  'use strict';

  // v3.3.2 D12 — multicohort schema. The v1 keys (single-string cohort +
  // token) are migrated into the v2 array on first boot; see _migrateLegacy.
  const LS = {
    cohortsArray: 'teacherDashCohorts_v2',
    activeView:   'teacherDashActiveView_v2',
  };
  const LEGACY_LS = {
    cohort: 'teacherDashCohort_v1',
    token:  'teacherDashToken_v1',
  };

  let _aggregates = null; // last fetched payload (active-cohort view)

  // ── storage layer (v2 schema) ──────────────────────────────────────────
  // Cohorts persisted as a JSON array; activeView is a separate string.
  // See docs/PHASE_PLAN_v3_3_2.md §4 for the contract.
  function _getCohorts() {
    try {
      const raw = localStorage.getItem(LS.cohortsArray);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function _setCohorts(arr) {
    try { localStorage.setItem(LS.cohortsArray, JSON.stringify(arr || [])); } catch (_) {}
  }
  function _getActiveView() {
    try { return localStorage.getItem(LS.activeView) || ''; } catch (_) { return ''; }
  }
  function _setActiveView(v) {
    try { localStorage.setItem(LS.activeView, String(v || '')); } catch (_) {}
  }
  // Returns {code, token} for the currently-active single-cohort view,
  // or null if active view is 'ALL' / empty / unknown cohort.
  function _activeCohort() {
    const view = _getActiveView();
    if (!view || view === 'ALL') return null;
    const list = _getCohorts();
    const match = list.find((c) => c && c.code === view);
    if (!match) return null;
    return { code: match.code, token: match.token };
  }
  function _upsertCohort(code, token) {
    const list = _getCohorts();
    const idx = list.findIndex((c) => c && c.code === code);
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], {
        token, last_ok_at: new Date().toISOString(),
      });
    } else {
      list.push({
        code, token,
        added_at: new Date().toISOString(),
        last_ok_at: new Date().toISOString(),
      });
    }
    _setCohorts(list);
  }
  function _clearAllCohorts() {
    _setCohorts([]);
    _setActiveView('');
  }

  // One-shot migration from v1 → v2 schema on first boot. Returns true
  // if migration ran (caller may surface a toast). The v1 keys are
  // deleted unconditionally after migration so the next boot is a no-op.
  function _migrateLegacy() {
    try {
      const existing = localStorage.getItem(LS.cohortsArray);
      if (existing) return false; // already on v2
      const c = localStorage.getItem(LEGACY_LS.cohort);
      const t = localStorage.getItem(LEGACY_LS.token);
      const hadLegacy = !!(c || t);
      if (c && t) {
        _setCohorts([{
          code: c, token: t,
          added_at: new Date().toISOString(),
          last_ok_at: null,
        }]);
        _setActiveView(c);
      }
      // Remove legacy keys unconditionally — they should never co-exist
      // with the v2 array, regardless of whether the migration actually
      // produced an entry (e.g. one key present without the other).
      if (hadLegacy) {
        localStorage.removeItem(LEGACY_LS.cohort);
        localStorage.removeItem(LEGACY_LS.token);
      }
      return c && t;
    } catch (_) { return false; }
  }

  // ── DOM helpers ────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function fmtMs(ms) {
    const n = Number(ms) || 0;
    if (n < 1000) return n + ' ms';
    const sec = Math.round(n / 1000);
    if (sec < 60) return sec + 's';
    const min = Math.round(sec / 60);
    if (min < 60) return min + 'm';
    return Math.round(min / 60 * 10) / 10 + 'h';
  }
  function fmtNum(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 10000) return (Math.round(n / 100) / 10) + 'k';
    return String(Math.round(n * 100) / 100);
  }

  // ── login flow ─────────────────────────────────────────────────────────
  function showLogin() {
    $('loginScreen').style.display = 'block';
    $('dashHeader').style.display = 'none';
    $('dashMain').style.display = 'none';
    // Prefill cohort field with the most-recently-added cohort code if any
    // (preserves the v1 ergonomic where re-login after logout pre-populated
    // the cohort code).
    const list = _getCohorts();
    if (list.length > 0) $('cohortInput').value = list[list.length - 1].code;
    $('tokenInput').value = '';
    setTimeout(() => $('cohortInput').focus(), 50);
  }
  function showDash() {
    $('loginScreen').style.display = 'none';
    $('dashHeader').style.display = 'flex';
    $('dashMain').style.display = 'block';
  }
  function loginErr(msg) {
    $('loginErr').textContent = msg || '';
  }

  async function tryLogin() {
    const cohort = String($('cohortInput').value || '').trim().toUpperCase();
    const token  = String($('tokenInput').value || '').trim();
    if (!/^[A-Z0-9-]{4,16}$/.test(cohort)) { loginErr('Cohort code должен быть 4–16 chars [A-Z0-9-].'); return; }
    if (!token) { loginErr('Введите researcher token.'); return; }
    loginErr('Загружаю…');
    const res = await fetchAggregates(cohort, token);
    if (!res.ok) {
      loginErr(`Ошибка ${res.status}: ${res.error || ''}`);
      return;
    }
    _upsertCohort(cohort, token);
    _setActiveView(cohort);
    _aggregates = res.body;
    showDash();
    render();
  }

  function logout() {
    _clearAllCohorts();
    _aggregates = null;
    showLogin();
  }

  async function fetchAggregates(cohort, token) {
    let resp;
    try {
      resp = await fetch(`/api/research/v1/cohort/${encodeURIComponent(cohort)}/aggregates`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      });
    } catch (e) {
      return { ok: false, status: 0, error: 'NETWORK' };
    }
    let body = null;
    try { body = await resp.json(); } catch (_) {}
    if (resp.ok) return { ok: true, status: resp.status, body };
    return { ok: false, status: resp.status, error: (body && body.error) || ('HTTP_' + resp.status) };
  }

  async function refresh() {
    const active = _activeCohort();
    if (!active) { showLogin(); return; }
    const res = await fetchAggregates(active.code, active.token);
    if (!res.ok) { logout(); return; }
    _aggregates = res.body;
    // Stamp last_ok_at for the cohort so the chip strip (C4) can show
    // freshness indicators.
    _upsertCohort(active.code, active.token);
    render();
  }

  // ── rendering ──────────────────────────────────────────────────────────
  function render() {
    if (!_aggregates) return;
    renderHeader();
    renderSummary();
    renderEngagementChart();
    renderAudioChart();
    renderSrsNotesChart();
    renderStudentTable();
    renderCorrelations();
    renderScatter();
  }

  function renderHeader() {
    const meta = _aggregates.cohort_meta || {};
    $('cohortMeta').textContent =
      `${meta.code}  ·  k=${meta.k_anonymity_threshold}  ·  schema ${meta.schema_version}  ·  retain → ${meta.retention_until || '—'}`;
  }

  function renderSummary() {
    const a = _aggregates;
    const tiles = [
      { label: 'Cohort size',     value: a.cohort_size,         sub: a.k_anonymity_met ? `k=${a.cohort_meta.k_anonymity_threshold} met` : `< k=${a.cohort_meta.k_anonymity_threshold}` },
      { label: 'Days observed',   value: a.days_observed,       sub: a.daily_aggregates && a.daily_aggregates.length ? `${a.daily_aggregates[0].date} … ${a.daily_aggregates[a.daily_aggregates.length-1].date}` : '—' },
      { label: 'Total minutes',   value: fmtNum(sumDaily(a, 'active_minutes_real')), sub: 'sum across cohort' },
      { label: 'Total audio',     value: fmtMs(sumDaily(a, 'audio_play_ms_total')),  sub: 'cohort total' },
      { label: 'SRS reviews',     value: fmtNum(sumDaily(a, 'cards_reviewed')),       sub: 'cohort total' },
      { label: 'Notes created',   value: fmtNum(sumDaily(a, 'notes_created')),        sub: 'cohort total' },
    ];
    $('summaryGrid').innerHTML = tiles.map((t) => `
      <div class="summary-tile">
        <div class="label">${escapeHtml(t.label)}</div>
        <div class="value">${escapeHtml(t.value)}</div>
        <div class="sub">${escapeHtml(t.sub)}</div>
      </div>
    `).join('');
  }

  function sumDaily(a, key) {
    if (!a.daily_aggregates) return 0;
    return a.daily_aggregates.reduce((s, d) => s + (Number(d[key]) || 0), 0);
  }

  // ── SVG chart helpers ──────────────────────────────────────────────────
  function svgLineChart(container, data, opts) {
    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-state">Нет данных для отображения</div>';
      return;
    }
    const W = 800, H = 220, PAD_L = 50, PAD_R = 12, PAD_T = 12, PAD_B = 28;
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const yMax = Math.max(1, ...ys);
    const xLen = xs.length;
    const xCoord = (i) => PAD_L + ((W - PAD_L - PAD_R) * (xLen > 1 ? i / (xLen - 1) : 0.5));
    const yCoord = (v) => H - PAD_B - ((H - PAD_T - PAD_B) * (v / yMax));
    const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xCoord(i)},${yCoord(d.y)}`).join(' ');
    const areaPath = `M${PAD_L},${H - PAD_B} ` + data.map((d, i) => `L${xCoord(i)},${yCoord(d.y)}`).join(' ') + ` L${xCoord(xLen - 1)},${H - PAD_B} Z`;
    const yTicks = [];
    const tickStep = niceStep(yMax / 4);
    for (let v = 0; v <= yMax + tickStep; v += tickStep) yTicks.push(v);
    const showEveryN = Math.max(1, Math.ceil(xLen / 10));
    const xLabels = data.map((d, i) => i % showEveryN === 0 || i === xLen - 1 ? d.x : '');

    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
    svg += '<g class="chart-grid">';
    for (const v of yTicks) svg += `<line x1="${PAD_L}" y1="${yCoord(v)}" x2="${W - PAD_R}" y2="${yCoord(v)}"/>`;
    svg += '</g>';
    svg += `<path class="chart-area" d="${areaPath}"/>`;
    svg += `<path class="chart-line" d="${linePath}"/>`;
    svg += '<g class="chart-axis">';
    for (const v of yTicks) svg += `<text x="${PAD_L - 6}" y="${yCoord(v) + 3}" text-anchor="end">${escapeHtml(String(v))}</text>`;
    for (let i = 0; i < xLen; i++) if (xLabels[i]) svg += `<text x="${xCoord(i)}" y="${H - PAD_B + 14}" text-anchor="middle">${escapeHtml(String(xLabels[i]).slice(5))}</text>`;
    svg += `<text x="${PAD_L - 36}" y="${PAD_T + 8}" text-anchor="start">${escapeHtml(opts && opts.yLabel || '')}</text>`;
    svg += '</g>';
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function svgScatterChart(container, data, opts) {
    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-state">Нет данных для scatter (нужны outcomes)</div>';
      return;
    }
    const W = 800, H = 280, PAD_L = 56, PAD_R = 12, PAD_T = 12, PAD_B = 36;
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const xCoord = (v) => PAD_L + ((W - PAD_L - PAD_R) * ((v - xMin) / xRange));
    const yCoord = (v) => H - PAD_B - ((H - PAD_T - PAD_B) * ((v - yMin) / yRange));
    const reg = linearRegression(xs, ys);
    const line = `M${xCoord(xMin)},${yCoord(reg.slope * xMin + reg.intercept)} L${xCoord(xMax)},${yCoord(reg.slope * xMax + reg.intercept)}`;
    const r = pearsonR(xs, ys);

    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
    // Y-axis ticks
    svg += '<g class="chart-grid">';
    const yStep = niceStep(yRange / 4);
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + yStep; v += yStep) {
      svg += `<line x1="${PAD_L}" y1="${yCoord(v)}" x2="${W - PAD_R}" y2="${yCoord(v)}"/>`;
    }
    svg += '</g>';
    svg += '<g class="chart-axis">';
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + yStep; v += yStep) {
      svg += `<text x="${PAD_L - 6}" y="${yCoord(v) + 3}" text-anchor="end">${escapeHtml(fmtNum(v))}</text>`;
    }
    svg += '</g>';
    // Trendline
    svg += `<path class="chart-trendline" d="${line}"/>`;
    // Dots
    for (const d of data) {
      svg += `<circle class="chart-dot" cx="${xCoord(d.x)}" cy="${yCoord(d.y)}" r="5">
        <title>${escapeHtml(d.label || '')} · x=${escapeHtml(fmtNum(d.x))} y=${escapeHtml(fmtNum(d.y))}</title>
      </circle>`;
    }
    // Axis labels + r
    svg += '<g class="chart-axis">';
    svg += `<text x="${W/2}" y="${H - 6}" text-anchor="middle">${escapeHtml(opts && opts.xLabel || 'x')}</text>`;
    svg += `<text x="14" y="${H/2}" text-anchor="middle" transform="rotate(-90, 14, ${H/2})">${escapeHtml(opts && opts.yLabel || 'y')}</text>`;
    svg += `<text x="${W - PAD_R - 4}" y="${PAD_T + 12}" text-anchor="end" style="fill:#fbbf24;">Pearson r = ${escapeHtml(fmtNum(r))}</text>`;
    svg += '</g>';
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function niceStep(rough) {
    if (rough <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(rough)));
    const m = rough / exp;
    if (m < 1.5) return exp;
    if (m < 3.5) return 2 * exp;
    if (m < 7.5) return 5 * exp;
    return 10 * exp;
  }

  function renderEngagementChart() {
    const days = _aggregates.daily_aggregates || [];
    const data = days.map((d) => ({ x: d.date, y: d.active_minutes_real }));
    svgLineChart($('engagementChart'), data, { yLabel: 'minutes' });
  }

  function renderAudioChart() {
    const days = _aggregates.daily_aggregates || [];
    const data = days.map((d) => ({ x: d.date, y: Math.round((d.audio_play_ms_total || 0) / 1000) }));
    svgLineChart($('audioChart'), data, { yLabel: 'sec' });
  }

  function renderSrsNotesChart() {
    const days = _aggregates.daily_aggregates || [];
    const data = days.map((d) => ({ x: d.date, y: d.cards_reviewed + d.notes_created }));
    svgLineChart($('srsNotesChart'), data, { yLabel: 'count' });
  }

  function renderStudentTable() {
    const a = _aggregates;
    if (!a.k_anonymity_met) {
      $('kBadge').innerHTML = '<span class="k-warn">⚠ k-anonymity not met (' + a.cohort_size + ' &lt; k=' + a.cohort_meta.k_anonymity_threshold + ')</span>';
      $('kHint').textContent = 'Per-student breakdown скрыт пока в когорте < k=' + a.cohort_meta.k_anonymity_threshold + ' студентов. Cohort-wide агрегаты (выше) видны всегда.';
      $('studentTable').innerHTML = '<div class="empty-state">Per-student data hidden until cohort_size ≥ ' + a.cohort_meta.k_anonymity_threshold + '.</div>';
      return;
    }
    $('kBadge').innerHTML = '<span class="k-met">✓ k-anonymity met (' + a.cohort_size + ' ≥ ' + a.cohort_meta.k_anonymity_threshold + ')</span>';
    $('kHint').textContent = 'Сортируйте кликом по заголовку. student_id обрезан до 8 hex-символов для краткости.';

    const students = a.students || [];
    const cols = [
      { key: 'student_id_short', label: 'student_id', fmt: (v) => `<code>${escapeHtml(v)}</code>` },
      { key: 'first_upload_ts', label: 'first', fmt: escapeHtml },
      { key: 'last_upload_ts',  label: 'last',  fmt: escapeHtml },
      { key: 'uploads_count',   label: 'uploads', cls: 'num', fmt: fmtNum },
      { key: 'active_minutes_real', label: 'active min', cls: 'num', fmt: fmtNum },
      { key: 'audio_play_ms_total', label: 'audio',   cls: 'num', fmt: (v) => fmtMs(v) },
      { key: 'cards_reviewed',   label: 'SRS',      cls: 'num', fmt: fmtNum },
      { key: 'srs_error_rate',   label: 'err rate', cls: 'num', fmt: (v) => v != null ? (v * 100).toFixed(0) + '%' : '—' },
      { key: 'notes_created',    label: 'notes',    cls: 'num', fmt: fmtNum },
      { key: 'pre_test_score',   label: 'pre',      cls: 'num', fmt: fmtNum },
      { key: 'post_test_score',  label: 'post',     cls: 'num', fmt: fmtNum },
    ];
    const rows = students.map((s) => {
      const t = s.totals || {};
      const o = s.outcome || {};
      const errRate = t.cards_reviewed > 0 ? t.cards_again / t.cards_reviewed : null;
      return {
        student_id_short: s.student_id.slice(0, 8) + '…',
        student_id: s.student_id,
        first_upload_ts: s.first_upload_ts,
        last_upload_ts: s.last_upload_ts,
        uploads_count: s.uploads_count,
        active_minutes_real: t.active_minutes_real,
        audio_play_ms_total: t.audio_play_ms_total,
        cards_reviewed: t.cards_reviewed,
        srs_error_rate: errRate,
        notes_created: t.notes_created,
        pre_test_score: o.pre_test_score,
        post_test_score: o.post_test_score,
      };
    });
    let sortKey = 'active_minutes_real', sortDir = -1;
    function applySort() {
      rows.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number') return (va - vb) * sortDir;
        return String(va).localeCompare(String(vb)) * sortDir;
      });
    }
    function paint() {
      applySort();
      let html = '<table><thead><tr>';
      for (const c of cols) html += `<th data-key="${c.key}" class="${c.cls || ''}">${escapeHtml(c.label)}${sortKey === c.key ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const c of cols) html += `<td class="${c.cls || ''}">${c.fmt ? c.fmt(r[c.key]) : escapeHtml(r[c.key] != null ? String(r[c.key]) : '—')}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      $('studentTable').innerHTML = html;
      $('studentTable').querySelectorAll('th[data-key]').forEach((th) => {
        th.addEventListener('click', () => {
          const k = th.getAttribute('data-key');
          if (sortKey === k) sortDir = -sortDir;
          else { sortKey = k; sortDir = -1; }
          paint();
        });
      });
    }
    paint();
  }

  // ── statistics ─────────────────────────────────────────────────────────
  function pearsonR(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    let sumX = 0, sumY = 0;
    for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; }
    const mx = sumX / n, my = sumY / n;
    let num = 0, dxs = 0, dys = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      num += dx * dy; dxs += dx * dx; dys += dy * dy;
    }
    if (dxs === 0 || dys === 0) return null;
    return num / Math.sqrt(dxs * dys);
  }
  function linearRegression(xs, ys) {
    const r = pearsonR(xs, ys);
    if (r == null) return { slope: 0, intercept: 0 };
    const n = xs.length;
    let sumX = 0, sumY = 0;
    for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; }
    const mx = sumX / n, my = sumY / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den === 0 ? 0 : num / den;
    return { slope, intercept: my - slope * mx };
  }

  function withOutcomes() {
    const a = _aggregates;
    if (!a.k_anonymity_met) return [];
    return (a.students || []).filter((s) => s.outcome && s.outcome.post_test_score != null);
  }

  function renderCorrelations() {
    const subjects = withOutcomes();
    const container = $('correlationsTable');
    if (!_aggregates.k_anonymity_met) {
      container.innerHTML = '<div class="empty-state">Корреляции недоступны (k-anonymity not met).</div>';
      return;
    }
    if (subjects.length < 3) {
      container.innerHTML = `<div class="empty-state">Нужно ≥ 3 студентов с заполненным <code>post_test_score</code>. Сейчас: ${subjects.length}. Проверь <code>outcomes.csv</code> в cohort dir.</div>`;
      return;
    }
    const ys = subjects.map((s) => s.outcome.post_test_score);
    const metricDefs = [
      { key: 'active_minutes_real', label: 'Total active minutes' },
      { key: 'audio_play_ms_total', label: 'Total audio (ms)' },
      { key: 'cards_reviewed',      label: 'Cards reviewed' },
      { key: 'cards_correct',       label: 'Cards correct' },
      { key: 'srs_error_rate',      label: 'SRS error rate (computed)' },
      { key: 'notes_created',       label: 'Notes created' },
      { key: 'sessions_count',      label: 'Sessions count' },
    ];
    const rows = metricDefs.map((d) => {
      const xs = subjects.map((s) => {
        const t = s.totals || {};
        if (d.key === 'srs_error_rate') {
          return t.cards_reviewed > 0 ? t.cards_again / t.cards_reviewed : 0;
        }
        return Number(t[d.key]) || 0;
      });
      return { metric: d.label, r: pearsonR(xs, ys) };
    });
    let html = '<table class="corr-table"><thead><tr><th>Metric</th><th class="num">Pearson r</th><th>Magnitude</th></tr></thead><tbody>';
    for (const row of rows) {
      const r = row.r;
      const cls = r == null ? 'corr-neutral' : (r > 0 ? 'corr-positive' : 'corr-negative');
      const tag = r == null ? '—' : (Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : Math.abs(r) >= 0.2 ? 'weak' : 'none');
      html += `<tr><td>${escapeHtml(row.metric)}</td><td class="num ${cls}">${r == null ? '—' : r.toFixed(3)}</td><td class="${cls}">${escapeHtml(tag)}</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function renderScatter() {
    const subjects = withOutcomes();
    const data = subjects.map((s) => ({
      x: (s.totals && s.totals.active_minutes_real) || 0,
      y: s.outcome.post_test_score,
      label: s.student_id.slice(0, 8) + '…',
    }));
    svgScatterChart($('scatterChart'), data, {
      xLabel: 'Total active minutes',
      yLabel: 'Post-test score',
    });
  }

  // ── CSV export ─────────────────────────────────────────────────────────
  function csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function downloadCsv(filename, lines) {
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exportAggregatesCsv() {
    if (!_aggregates) return;
    const a = _aggregates;
    const code = a.cohort_meta.code;
    if (!a.k_anonymity_met) {
      alert('Per-student CSV недоступен (k-anonymity not met).');
      return;
    }
    const cols = ['student_id', 'enrollment_date', 'withdrawal_date', 'total_active_minutes',
      'total_audio_ms', 'total_cards_reviewed', 'total_cards_correct', 'total_cards_again',
      'srs_error_rate', 'total_notes_created', 'total_notes_edited', 'total_search_queries',
      'total_smart_tag_overrides', 'total_texts_opened_distinct', 'total_sentences_read_distinct',
      'audio_replay_avg_per_row', 'active_days_count', 'streak_max',
      'pre_test_score', 'post_test_score', 'confidence_self_report', 'continuation_flag'];
    const lines = [cols.join(',')];
    for (const s of a.students) {
      const t = s.totals || {};
      const o = s.outcome || {};
      const errRate = t.cards_reviewed > 0 ? (t.cards_again / t.cards_reviewed).toFixed(3) : '';
      lines.push([
        s.student_id, s.first_upload_ts, '',  // withdrawal_date — Phase 11.6
        t.active_minutes_real, t.audio_play_ms_total, t.cards_reviewed, t.cards_correct, t.cards_again,
        errRate, t.notes_created, t.notes_edited, t.search_queries_count,
        t.smart_tag_overrides_count, t.texts_opened_distinct_max, t.sentences_read_distinct_max,
        '', '', '',
        o.pre_test_score != null ? o.pre_test_score : '',
        o.post_test_score != null ? o.post_test_score : '',
        '', '',
      ].map(csvEscape).join(','));
    }
    downloadCsv(`cohort_${code}_aggregates.csv`, lines);
  }
  function exportTimeseriesCsv() {
    if (!_aggregates) return;
    const a = _aggregates;
    const code = a.cohort_meta.code;
    if (!a.k_anonymity_met) {
      // Fall back to cohort-wide daily series.
      const lines = ['date,active_minutes_real,audio_play_ms_total,sessions_count,cards_reviewed,notes_created,students_active'];
      for (const d of (a.daily_aggregates || [])) {
        lines.push([d.date, d.active_minutes_real, d.audio_play_ms_total, d.sessions_count, d.cards_reviewed, d.notes_created, d.students_active].map(csvEscape).join(','));
      }
      downloadCsv(`cohort_${code}_timeseries.csv`, lines);
      return;
    }
    const lines = ['student_id,date,active_minutes_real,audio_play_ms_total,sessions_count,cards_reviewed,notes_created'];
    for (const s of (a.per_student_daily || [])) {
      for (const d of s.days) {
        lines.push([s.student_id, d.date, d.active_minutes_real, d.audio_play_ms_total, d.sessions_count, d.cards_reviewed, d.notes_created].map(csvEscape).join(','));
      }
    }
    downloadCsv(`cohort_${code}_timeseries.csv`, lines);
  }
  function exportDerivedCsv() {
    if (!_aggregates || !_aggregates.k_anonymity_met) {
      alert('Derived metrics требуют k-anonymity (нужно ≥ k студентов).');
      return;
    }
    const a = _aggregates;
    const students = a.students || [];
    // Normalize for engagement_score composite.
    const totals = students.map((s) => s.totals || {});
    const max = (k) => Math.max(1, ...totals.map((t) => Number(t[k]) || 0));
    const maxMin = max('active_minutes_real');
    const maxCards = max('cards_reviewed');
    const maxNotes = max('notes_created');
    const lines = ['student_id,engagement_score,quality_score,efficiency_ratio,growth_delta,engagement_consistency'];
    for (const s of students) {
      const t = s.totals || {};
      const o = s.outcome || {};
      const eng = 0.4 * ((t.active_minutes_real || 0) / maxMin) +
                  0.4 * ((t.cards_reviewed     || 0) / maxCards) +
                  0.2 * ((t.notes_created      || 0) / maxNotes);
      const qual = 1 - (t.cards_reviewed > 0 ? t.cards_again / t.cards_reviewed : 0);
      const eff = (t.active_minutes_real > 0) ? (t.cards_correct || 0) / t.active_minutes_real : 0;
      const growth = (o.pre_test_score != null && o.post_test_score != null) ? o.post_test_score - o.pre_test_score : '';
      // engagement_consistency requires unique active days / total cohort window — approximate with uploads_count / days_observed.
      const cons = a.days_observed > 0 ? (s.uploads_count / a.days_observed) : 0;
      lines.push([s.student_id, eng.toFixed(3), qual.toFixed(3), eff.toFixed(3), growth, cons.toFixed(3)].map(csvEscape).join(','));
    }
    downloadCsv(`cohort_${a.cohort_meta.code}_derived.csv`, lines);
  }

  // ── outcomes CSV upload ────────────────────────────────────────────────
  // Opens a hidden <input type="file"> to pick a CSV, reads it locally,
  // POSTs to /api/research/v1/cohort/:code/outcomes (Bearer-auth), then
  // refreshes the dashboard so the joined outcomes show up immediately.
  function uploadOutcomesCsv() {
    const active = _activeCohort();
    if (!active) { logout(); return; }
    const cohort = active.code;
    const token  = active.token;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv,text/plain';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      if (file.size > 256 * 1024) {
        alert('CSV больше 256 KB — слишком много. Поделите файл или сократите.');
        return;
      }
      const text = await file.text();
      // Quick client-side sanity check: header present, has student_id col.
      const firstLine = (text.split(/\r?\n/)[0] || '').toLowerCase();
      if (!firstLine.includes('student_id')) {
        alert("CSV header должен содержать колонку 'student_id'. Ожидаемые колонки:\nstudent_id,pre_test_score,post_test_score,exam_date,uploaded_by");
        return;
      }
      let resp;
      try {
        resp = await fetch(`/api/research/v1/cohort/${encodeURIComponent(cohort)}/outcomes`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'text/csv' },
          body: text,
        });
      } catch (e) {
        alert('Network error: ' + e.message);
        return;
      }
      let body = null;
      try { body = await resp.json(); } catch (_) {}
      if (resp.ok) {
        alert(`✓ Outcomes uploaded.\ninserted=${body && body.inserted}, updated=${body && body.updated}, total=${body && body.total}`);
        await refresh();
      } else {
        const err = (body && body.error) || ('HTTP_' + resp.status);
        const detail = body && (body.message || body.line) ? `\n${body.message || ''}${body.line ? ' (line ' + body.line + ')' : ''}` : '';
        alert(`Upload failed: ${err}${detail}`);
      }
    };
    inp.click();
  }

  // ── boot ───────────────────────────────────────────────────────────────
  function boot() {
    $('loginBtn').addEventListener('click', tryLogin);
    $('cohortInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('tokenInput').focus(); });
    $('tokenInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
    $('refreshBtn').addEventListener('click', refresh);
    $('logoutBtn').addEventListener('click', logout);
    $('uploadOutcomesBtn').addEventListener('click', uploadOutcomesCsv);
    $('exportAggregatesBtn').addEventListener('click', exportAggregatesCsv);
    $('exportTimeseriesBtn').addEventListener('click', exportTimeseriesCsv);
    $('exportDerivedBtn').addEventListener('click', exportDerivedCsv);

    // v3.3.2 D12 — migrate legacy v1 keys (single-cohort) into the v2 array
    // schema on first boot. Idempotent after one successful migration.
    _migrateLegacy();
    const active = _activeCohort();
    if (active) {
      // Auto-resume previous session.
      fetchAggregates(active.code, active.token).then((res) => {
        if (res.ok) {
          _aggregates = res.body;
          _upsertCohort(active.code, active.token); // refresh last_ok_at
          showDash();
          render();
        } else {
          showLogin();
          loginErr(`Saved session no longer valid (${res.status}). Re-enter token.`);
        }
      });
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
