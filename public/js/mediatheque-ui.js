import * as localDb from '/db/local-db.js?v=520';
import './mediatheque-core.js';
const C = globalThis.MediathequeCore;
const $ = id => document.getElementById(id);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key, vars) => window.t('mediatheque.' + key, vars);
const uid = () => 'm_' + crypto.randomUUID().replaceAll('-', '');
const clone = value => JSON.parse(JSON.stringify(value));
const state = { space: 'public', section: 'home', filters: C.filters(), personal: { revision: 0, structure: C.empty(), canUndo: false },
  published: { revision: 0, structure: C.empty(), items: [] }, draft: null, local: [], localReady: false, publicReady: false,
  localError: '', publicError: '', owner: false, editing: false, preview: false, selected: new Set(), page: 1, busy: false,
  filterOpen: false, topicSearch: '', expanded: new Set(), viewId: '', publicItems: [], localItems: [], prepared: C.prepare(C.empty(), []), publicKnown: false };
let toastTimer, searchTimer, lastDialogFocus = null, loadEpoch = 0, dialogAction = null;

function announce(message, error = false) {
  clearTimeout(toastTimer); $('ml-status').textContent = message; $('ml-status').dataset.error = String(error);
  toastTimer = setTimeout(() => { $('ml-status').textContent = ''; }, error ? 12000 : 5500);
}
function errorText(error) {
  const code = String(error && (error.code || error.message) || '');
  if (/CONFLICT/.test(code)) return t('conflict');
  if (/UNAVAILABLE|REFERENCE_MISSING/.test(code)) return t('referenceUnavailable');
  if (/CYCLE|DEPTH|PARENT/.test(code)) return t('invalidTree');
  if (/UNAUTHENTICATED|PUBLISHER_FORBIDDEN|BAD_CSRF/.test(code)) return t('signInOwner');
  return t('failed');
}
async function api(path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'; headers['X-Idempotency-Key'] = uid();
    try { headers['X-LP-CSRF'] = localStorage.getItem('cloud.csrf') || ''; } catch (_) {}
  }
  const response = await fetch(path, { signal: AbortSignal.timeout(15000), method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) { const e = new Error(json.error || 'HTTP_' + response.status); e.code = e.message; throw e; }
  return json;
}
function documentState() { return state.space === 'personal' ? state.personal : state.editing && state.draft ? state.draft : state.published; }
function structure() { return documentState().structure; }
function canEdit() { return !state.preview && (state.space === 'personal' ? state.localReady : state.owner && state.editing && !!state.draft); }
function organizeMode() { return state.editing && canEdit(); }
function makeHref(next = {}) {
  const params = new URLSearchParams();
  params.set('space', next.space || state.space); params.set('section', next.section || state.section);
  const f = next.filters || state.filters;
  params.set('filters', JSON.stringify(f));
  if (f.category) params.set('category', f.category); if (f.collection) params.set('collection', f.collection);
  if (next.viewId) params.set('view', next.viewId);
  if (Number.isSafeInteger(next.page) && next.page > 1) params.set('page', next.page);
  return '/mediatheque.html?' + params.toString();
}
function persist() {
  try { localStorage.setItem('mediatheque.presentation.' + state.space, JSON.stringify({ filters: state.filters, section: state.section, viewId: state.viewId })); } catch (_) {}
  history.replaceState(null, '', makeHref({ viewId: state.viewId, page: state.page }));
}
function restorePresentation(space, useUrl = false) {
  state.space = space; state.filters = C.filters(); state.section = 'home'; state.viewId = ''; state.page = 1; state.selected.clear();
  try {
    const saved = JSON.parse(localStorage.getItem('mediatheque.presentation.' + space));
    if (saved) { state.filters = C.filters(saved.filters); if (['home', 'catalog', 'topics', 'collections'].includes(saved.section)) state.section = saved.section; state.viewId = saved.viewId || ''; }
  } catch (_) {}
  if (useUrl) {
    const p = new URLSearchParams(location.search);
    if (['home', 'catalog', 'topics', 'collections'].includes(p.get('section'))) state.section = p.get('section');
    if (p.has('section')) {
      try { state.filters = C.filters(p.has('filters') ? JSON.parse(p.get('filters')) : {}); } catch (_) { state.filters = C.filters(); }
      state.filters.category = p.get('category') || state.filters.category; state.filters.collection = p.get('collection') || state.filters.collection; state.viewId = p.get('view') || '';
      const page = Number(p.get('page')); if (Number.isSafeInteger(page) && page > 0 && page <= 100000) state.page = page;
    }
  }
}
function navigate(section, filters = {}, options = {}) {
  state.section = section; state.page = 1; state.selected.clear(); state.topicSearch = '';
  state.filters = C.filters({ ...state.filters, ...filters }); state.viewId = options.viewId || '';
  persist(); render(); if (options.scroll !== false) $('ml-content')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function personalMaterial(row) {
  let ref;
  if (row.public_slug) ref = { kind: 'public', slug: row.public_slug, workId: row.public_work_id, snapshotHash: row.public_snapshot };
  else ref = { kind: 'personal', textKey: row.text_key };
  try { C.reference(ref); } catch (_) { return null; }
  let tags; try { tags = JSON.parse(row.tags_json); } catch (_) {}
  return { ref, localId: row.id, title: row.title || t('untitled'), description: row.topic || '', tags: Array.isArray(tags) ? tags : [],
    ...row.media, source: row.media.source || (row.source && !/^https?:\/\//i.test(row.source) ? row.source : '') || row.public_slug || '',
    addedAt: row.created_at, openedAt: row.last_opened_at, progress: row.finished_at ? 'finished' : (row.last_row_idx > 0 || row.last_opened_at) ? 'in_progress' : 'not_started',
    progressKnown: true, hasTranslation: !!row.has_translation, available: true };
}
function rebuild() {
  const localByKey = new Map(state.localItems.map(i => [C.refKey(i.ref), i]));
  state.publicItems = (state.published.items || []).map(row => {
    const local = state.preview ? null : localByKey.get(C.refKey(row.ref));
    return { ref: row.ref, title: row.title, description: row.topic || '', tags: row.tags || [], ...row.media,
      source: row.media?.source || row.creator || row.corpus_title || row.slug, corpusTitle: row.corpus_title,
      addedAt: row.published_at, position: row.position_no, hasTranslation: !!row.has_translation,
      progress: local?.progress || 'not_started', progressKnown: state.localReady, openedAt: local?.openedAt || null,
      localId: local?.localId || null, available: true };
  });
  const pubByKey = new Map(state.publicItems.map(i => [C.refKey(i.ref), i]));
  let items = state.space === 'public' ? state.publicItems : state.localItems.filter(i => i.ref.kind === 'personal');
  const d = structure(), included = new Set(items.map(i => C.refKey(i.ref)));
  const needed = state.space === 'personal' ? new Set([...d.saved, ...d.categories.flatMap(c => c.items), ...d.collections.flatMap(c => c.items), ...d.annotations.map(a => a.key), ...(d.home.featured ? [d.home.featured] : [])])
    : state.editing ? new Set(d.references.map(C.refKey)) : new Set();
  const refs = new Map(d.references.map(r => [C.refKey(r), r]));
  for (const key of needed) {
    if (included.has(key)) continue;
    const ref = refs.get(key); if (!ref) continue;
    const item = pubByKey.get(key) || (state.space === 'personal' ? localByKey.get(key) : null);
    items.push(item || { ref, title: t(ref.kind === 'personal' ? 'missingPersonal' : 'missingPublic'), source: ref.slug || '', kind: 'text',
      available: false, progressKnown: false, tags: [], durationSeconds: null }); included.add(key);
  }
  state.prepared = C.prepare(d, items);
}
async function loadLocal() {
  try {
    await localDb.initLocalDB();
    if (localDb.vfsBackendChanged()) throw new Error('STORAGE_CHANGED');
    const personal = await localDb.getMediathequeStructure(), rows = []; let after = '';
    for (;;) {
      const batch = await localDb.listMediathequeMaterials({ after, limit: 500 }); rows.push(...batch);
      if (batch.length < 500) break; after = batch[batch.length - 1].id;
    }
    state.personal = personal; state.localItems = rows.map(personalMaterial).filter(Boolean); state.localReady = true; state.localError = '';
  } catch (e) { state.localError = /STORAGE_CHANGED/.test(e.message) ? t('storageChanged') : t('localFailed'); state.localReady = false; }
}
async function loadPublic() {
  try { const payload = await api('/api/mediatheque'); payload.structure = C.validate(payload.structure, { publicOnly: true });
    state.published = payload; state.publicReady = true; state.publicKnown = true; state.publicError = ''; }
  catch (_) { state.publicError = t('publicFailed'); state.publicReady = false; }
}
async function loadAll() {
  const epoch = ++loadEpoch;
  const results = await Promise.allSettled([loadLocal(), loadPublic(), api('/api/auth/me').then(result => { state.owner = result.user?.role === 'owner'; try { if (result.csrf) localStorage.setItem('cloud.csrf', result.csrf); } catch (_) {} }).catch(() => { state.owner = false; })]);
  if (epoch !== loadEpoch) return;
  results.forEach(r => { if (r.status === 'rejected') announce(errorText(r.reason), true); });
  if (state.viewId) { const view = structure().views.find(v => v.id === state.viewId); if (view) state.filters = C.filters(view.filters); }
  render();
}
async function save(next) {
  if (!canEdit()) throw new Error('PUBLISHER_FORBIDDEN');
  if (state.space === 'personal') state.personal = await localDb.saveMediathequeStructure(next, state.personal.revision);
  else { const result = await api('/api/publication/mediatheque/draft', { structure: next, expectedVersion: state.draft.revision }); state.draft = { ...state.draft, ...result }; }
}
async function mutate(command, success = t('saved')) {
  if (state.busy) return; state.busy = true;
  try { const next = typeof command === 'function' ? command(structure()) : C.command(structure(), command, { publicOnly: state.space === 'public' });
    await save(next); state.selected.clear(); render(); announce(success); }
  catch (e) { announce(errorText(e), true); if (/CONFLICT/.test(e.message)) await refreshStructure(); }
  finally { state.busy = false; }
}
async function refreshStructure() {
  if (state.space === 'personal') state.personal = await localDb.getMediathequeStructure();
  else if (state.editing) state.draft = await api('/api/publication/mediatheque');
  render();
}
function selectedMaterials() { return Array.from(state.selected).map(k => state.prepared.byKey.get(k)).filter(Boolean); }
function duration(value) {
  if (value == null || !Number.isFinite(value)) return t('durationUnknown');
  const seconds = Math.round(value), h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function materialHref(item) {
  if (!item.available) return '';
  const back = '&from=mediatheque&return_to=' + encodeURIComponent(makeHref({ viewId: state.viewId, page: state.page }));
  if (item.localId) return '/library.html?my_text=' + encodeURIComponent(item.localId) + back;
  const r = item.ref;
  return '/library.html?public_corpus=' + encodeURIComponent(r.slug) + '&public_work=' + encodeURIComponent(r.workId)
    + '&public_snapshot=' + r.snapshotHash + back;
}
function cover(item, time = true) {
  const symbol = item.kind === 'video' ? '▷' : item.kind === 'audio' ? '♫' : 'א';
  return `<div class="ml-cover" data-kind="${esc(item.kind)}"><span class="ml-cover-symbol" aria-hidden="true">${symbol}</span>
    ${item.videoId ? `<img src="https://i.ytimg.com/vi/${esc(item.videoId)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer">` : ''}
    ${time && item.durationSeconds != null ? `<span class="ml-cover-time">${esc(duration(item.durationSeconds))}</span>` : ''}</div>`;
}
function button(action, label, extra = '', cls = '') { return `<button type="button" data-action="${action}" class="${cls}" ${extra}>${esc(label)}</button>`; }
function orderButtons(type, id, canUp, canDown, extra = '') {
  return `<span class="ml-order-buttons">${button('up', '↑', `data-order-type="${type}" data-id="${esc(id)}" aria-label="${esc(t('up'))}" ${canUp ? '' : 'disabled'} ${extra}`)}
    ${button('down', '↓', `data-order-type="${type}" data-id="${esc(id)}" aria-label="${esc(t('down'))}" ${canDown ? '' : 'disabled'} ${extra}`)}</span>`;
}
function itemHtml(item) {
  const selected = state.selected.has(item.key), href = materialHref(item), manage = organizeMode();
  const target = state.filters.collection ? structure().collections.find(c => c.id === state.filters.collection) : structure().categories.find(c => c.id === state.filters.category);
  const index = target?.items.indexOf(item.key) ?? -1;
  const order = manage && state.filters.sort === 'position' && index >= 0;
  const action = item.progressKnown && item.progress === 'in_progress' ? t('continueAction') : t('study');
  return `<article class="ml-item" data-key="${esc(item.key)}" data-selected="${selected}" ${order ? `draggable="true" data-drag-type="item" data-drag-id="${esc(item.key)}"` : ''}>
    ${manage ? `<label class="ml-selection"><input type="checkbox" data-select="${esc(item.key)}" ${selected ? 'checked' : ''} aria-label="${esc(t('selectMaterial', { title: item.title }))}">${esc(t('select'))}</label>` : ''}
    ${href ? `<a href="${esc(href)}" aria-label="${esc(item.title)}">${cover(item)}</a>` : cover(item)}
    <div class="ml-item-copy"><h3 dir="auto">${href ? `<a href="${esc(href)}">${esc(item.title)}</a>` : esc(item.title)}</h3>
      <div class="ml-item-meta"><span dir="auto">${esc(item.source || t('sourceUnknown'))}</span>${!item.videoId && item.kind !== 'text' ? `<span>${esc(duration(item.durationSeconds))}</span>` : ''}</div>
      <div class="ml-item-status"><span>${esc(item.available ? t('kind.' + item.kind) : t('unavailable'))}</span>
      ${item.hasTranslation ? `<span>${esc(t('withTranslation'))}</span>` : ''}${item.progressKnown && item.progress === 'finished' ? `<span>${esc(t('progress.finished'))}</span>` : ''}</div>
    </div>
    <div class="ml-item-footer">${href ? `<a class="ml-open" href="${esc(href)}">${esc(action)}</a>` : ''}
      ${!state.preview && (state.space === 'personal' || item.ref.kind === 'public') ? button('add-item', t('addToCollection'), `data-key="${esc(item.key)}"`) : ''}
      ${manage && state.space === 'personal' && item.ref.kind === 'public' ? button('forget-reference', t('forgetReference'), `data-key="${esc(item.key)}"`) : ''}
      ${order ? orderButtons('item', item.key, index > 0, index < target.items.length - 1) : ''}
    </div></article>`;
}
function materialsHtml(items, layout = 'cards') { return `<div class="ml-materials" data-layout="${layout}">${items.map(itemHtml).join('')}</div>`; }
function sectionHead(title, section, filters = {}) {
  return `<div class="ml-section-head"><h2>${esc(title)}</h2><a data-nav href="${esc(makeHref({ section, filters: C.filters(filters) }))}">${esc(t('seeAll'))}</a></div>`;
}
function collectionHtml(c, index) {
  const items = c.items.map(k => state.prepared.byKey.get(k)).filter(Boolean), available = items.filter(i => i.available);
  const known = available.filter(i => i.durationSeconds != null), sum = known.reduce((n, i) => n + i.durationSeconds, 0);
  const parts = available.slice(0, 3); while (parts.length < 3) parts.push({ kind: 'text', durationSeconds: null });
  return `<article class="ml-collection" ${organizeMode() ? `draggable="true" data-drag-type="collection" data-drag-id="${esc(c.id)}"` : ''}>
    <a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ collection: c.id }) }))}"><div class="ml-collection-art">${parts.map(i => cover(i, false)).join('')}</div>
    <h3 dir="auto">${esc(c.title)}</h3><small>${esc(t('materialCount', { count: c.items.length }))}${known.length ? ' · ' + esc(duration(sum)) + (known.length !== items.length ? ' + ' + esc(t('unknownDurationPart')) : '') : ''}</small></a>
    ${c.description ? `<p dir="auto">${esc(c.description)}</p>` : ''}
    ${organizeMode() ? `<div class="ml-actions">${button('edit-collection', t('edit'), `data-id="${esc(c.id)}"`)}${orderButtons('collection', c.id, index > 0, index < structure().collections.length - 1)}</div>` : ''}</article>`;
}
function categoryCount(id) {
  const children = C.descendants(structure(), id), keys = new Set(structure().categories.filter(c => children.has(c.id)).flatMap(c => c.items));
  return Array.from(keys).filter(k => state.prepared.byKey.get(k)?.available).length;
}
function topicsOverview() {
  const roots = structure().categories.filter(c => !c.parentId && (organizeMode() || categoryCount(c.id) > 0));
  return `<div class="ml-topics-grid">${roots.map(c => `<a class="ml-topic-link" data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ category: c.id }) }))}"><span dir="auto">${esc(c.title)}</span><small>${categoryCount(c.id)}</small></a>`).join('')}</div>`;
}
function homeHtml() {
  const d = structure(), p = state.prepared, all = p.items.filter(i => i.available);
  let html = '';
  const feature = d.home.featured && p.byKey.get(d.home.featured);
  if (feature && feature.available) html += `<section class="ml-feature">${cover(feature)}<div class="ml-feature-copy"><span class="ml-muted">${esc(t('featured'))}</span><h2 dir="auto">${esc(feature.title)}</h2>
    <p>${esc(feature.description || feature.source)}</p><a class="ml-primary" href="${esc(materialHref(feature))}">${esc(feature.progress === 'in_progress' ? t('continueAction') : t('study'))}</a></div></section>`;
  for (const section of d.home.sections) {
    if (section === 'continue') {
      const items = C.query(d, p, { progress: 'in_progress', sort: 'opened_desc' }).filter(i => i.available && i.key !== feature?.key).slice(0, 3);
      if (items.length) html += `<section class="ml-section">${sectionHead(t('continueHeading'), 'catalog', { progress: 'in_progress', sort: 'opened_desc' })}${materialsHtml(items)}</section>`;
    } else if (section === 'pinned') {
      const pinned = d.collections.filter(c => c.pinned);
      if (pinned.length) html += `<section class="ml-section">${sectionHead(t('pinnedHeading'), 'collections')}<div class="ml-collections">${pinned.slice(0, 6).map(c => collectionHtml(c, d.collections.indexOf(c))).join('')}</div></section>`;
    } else if (section === 'recent' && all.length) {
      const items = C.query(d, p, { sort: 'added_desc' }).filter(i => i.available && i.key !== feature?.key).slice(0, 6);
      if (items.length) html += `<section class="ml-section">${sectionHead(t('recentHeading'), 'catalog', { sort: 'added_desc' })}${materialsHtml(items)}</section>`;
    } else if (section === 'topics' && d.categories.length) html += `<section class="ml-section">${sectionHead(t('topicsHeading'), 'topics')}${topicsOverview()}</section>`;
  }
  if (!html) html = `<section class="ml-empty"><h2>${esc(t(all.length ? 'homeHiddenTitle' : 'emptyTitle'))}</h2><p>${esc(t(all.length ? 'homeHiddenBody' : state.space === 'personal' ? 'emptyPersonal' : 'emptyPublic'))}</p>
    ${all.length ? `<a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters() }))}" class="ml-primary">${esc(t('allMaterials'))}</a>` : state.space === 'personal' ? `<a href="/" class="ml-primary">${esc(t('addMaterial'))}</a>` : ''}</section>`;
  return html;
}
function option(value, label, current) { return `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`; }
function filterSelect(name, label, values) {
  return `<label>${esc(label)}<select data-filter="${name}" id="ml-filter-${name}">${option('', t('any'), state.filters[name])}${values.map(([v, l]) => option(v, l, state.filters[name])).join('')}</select></label>`;
}
function filtersHtml() {
  const f = state.filters, items = state.prepared.items;
  const values = field => Array.from(new Set(items.map(i => i[field]).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map(v => [v, v]);
  return `<details class="ml-filters" id="ml-filters" ${state.filterOpen ? 'open' : ''}><summary>${esc(t('filters'))}</summary><div class="ml-filter-fields">
    ${filterSelect('category', t('category'), structure().categories.map(c => [c.id, C.categoryPath(structure(), c.id).map(x => x.title).join(' / ')]))}
    ${filterSelect('kind', t('format'), ['video', 'audio', 'text'].map(k => [k, t('kind.' + k)]))}
    ${filterSelect('source', t('source'), values('source'))}${filterSelect('genre', t('genre'), values('genre'))}${filterSelect('language', t('language'), values('language'))}
    <label>${esc(t('duration'))}<select id="ml-filter-duration" data-filter="maxDuration">${option('', t('any'), f.maxDuration ?? '')}${[300,600,1200,3600].map(n => option(n, t('upToMinutes', { count: n / 60 }), f.maxDuration)).join('')}</select></label>
    ${filterSelect('progress', t('studyStatus'), ['not_started', 'in_progress', 'finished'].map(p => [p, t('progress.' + p)]))}
    <label>${esc(t('tags'))}<input id="ml-filter-tags" data-filter="tags" value="${esc(f.tags.join(', '))}" placeholder="${esc(t('tagsHint'))}"></label>
    <div>${[['translation', 'withTranslation'], ['captions', 'withCaptions'], ['uncategorized', 'uncategorized']].map(([key,label]) => `<label class="ml-checkbox"><input type="checkbox" data-filter="${key}" ${f[key] ? 'checked' : ''}>${esc(t(label))}</label>`).join('')}</div>
    </div></details>`;
}
function activeFiltersHtml() {
  const f = state.filters, chips = [];
  for (const field of ['q','kind','source','genre','language','maxDuration','progress','translation','captions','uncategorized','tags']) {
    const value = f[field]; if (!value || (Array.isArray(value) && !value.length)) continue;
    const label = field === 'kind' ? t('kind.' + value) : field === 'progress' ? t('progress.' + value) : field === 'maxDuration' ? t('upToMinutes', { count: value / 60 })
      : typeof value === 'boolean' ? t(field === 'translation' ? 'withTranslation' : field === 'captions' ? 'withCaptions' : 'uncategorized') : Array.isArray(value) ? value.join(', ') : value;
    chips.push(button('clear-filter', label + ' ×', `data-field="${field}" aria-label="${esc(t('removeFilter', { value: label }))}"`));
  }
  return chips.length ? `<div class="ml-active-filters">${chips.join('')}${button('reset-filters', t('reset'), '', 'ml-quiet')}</div>` : '';
}
function bulkHtml(items) {
  if (!organizeMode()) return '';
  const n = state.selected.size;
  return `<div class="ml-bulk"><label class="ml-checkbox"><input id="ml-select-page" type="checkbox" ${items.length && items.every(i => state.selected.has(i.key)) ? 'checked' : ''}>${esc(t('selectPage'))}</label>
    <strong>${esc(t('selectedCount', { count: n }))}</strong>${button('assign', t('distribute'), n ? '' : 'disabled')}${button('tags', t('tags'), n ? '' : 'disabled')}
    ${button('feature', t('featureAction'), n === 1 ? '' : 'disabled')}
    ${state.filters.category || state.filters.collection ? button('remove-items', t('removeFromHere'), n ? '' : 'disabled') : ''}
    ${n ? button('clear-selection', t('clearSelection'), '', 'ml-quiet') : ''}</div>`;
}
function catalogHtml() {
  const d = structure(), f = state.filters, results = C.query(d, state.prepared, f), size = 36;
  const pages = Math.max(1, Math.ceil(results.length / size)); state.page = Math.min(state.page, pages);
  const items = results.slice((state.page - 1) * size, state.page * size), collection = d.collections.find(c => c.id === f.collection), category = d.categories.find(c => c.id === f.category);
  const context = collection || category;
  const path = category ? C.categoryPath(d, category.id) : [];
  const matches = C.navigationMatches(d, f.q).slice(0, 6);
  return `<div class="ml-catalog-layout"><aside class="ml-side"><h2>${esc(t('topicsHeading'))}</h2>
    <a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters() }))}">${esc(t('allMaterials'))}</a>
    ${d.categories.filter(c => !c.parentId).slice(0, 20).map(c => `<a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ category: c.id }) }))}" ${path.some(x => x.id === c.id) ? 'aria-current="page"' : ''} dir="auto">${esc(c.title)}</a>`).join('')}
    <a data-nav href="${esc(makeHref({ section: 'topics', filters: C.filters() }))}">${esc(t('topicMap'))}</a>
    ${d.views.length ? `<div class="ml-side-views"><h2>${esc(t('savedViews'))}</h2>${d.views.map(v => `<a data-action="use-view" data-id="${esc(v.id)}" href="${esc(makeHref({ section: 'catalog', filters: v.filters, viewId: v.id }))}" ${state.viewId === v.id ? 'aria-current="page"' : ''}>${esc(v.title)}</a>`).join('')}</div>` : ''}</aside>
    <section class="ml-catalog-results"><nav class="ml-breadcrumbs" aria-label="${esc(t('searchScope'))}"><a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters() }))}">${esc(t('allMaterials'))}</a>
      ${path.map(c => `<span aria-hidden="true">/</span><a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ category: c.id }) }))}" dir="auto">${esc(c.title)}</a>`).join('')}
      ${collection ? `<span aria-hidden="true">/</span><span dir="auto">${esc(collection.title)}</span>` : ''}</nav>
      <div class="ml-result-head"><div><h2 dir="auto">${esc(context?.title || t('allMaterials'))}</h2><small>${esc(t('materialCount', { count: results.length }))}${category ? ' · ' + esc(t('includesSubcategories')) : ''}</small></div>
        <div class="ml-result-controls"><select id="ml-sort" aria-label="${esc(t('sortLabel'))}">${C.SORTS.map(s => option(s, t('sort.' + s), f.sort)).join('')}</select>
        <div class="ml-layout-toggle" role="group" aria-label="${esc(t('layout'))}">${['cards','list'].map(l => button('layout', t(l), `data-layout="${l}" aria-pressed="${f.layout === l}"`)).join('')}</div></div></div>
      ${context?.description ? `<p class="ml-tree-description">${esc(context.description)}</p>` : ''}
      ${organizeMode() && context ? `<div class="ml-toolbar">${button(collection ? 'edit-collection' : 'edit-category', t('edit'), `data-id="${esc(context.id)}"`)}${button('assign', t('addSelectedHere'), state.selected.size ? '' : 'disabled')}</div>` : ''}
      ${filtersHtml()}${activeFiltersHtml()}
      <div class="ml-view-controls">${d.views.length ? `<label class="ml-view-select"><span>${esc(t('savedViews'))}</span><select id="ml-view-select" aria-label="${esc(t('savedViews'))}">${option('', t('currentView'), state.viewId)}${d.views.map(v => option(v.id, v.title, state.viewId)).join('')}</select></label>` : ''}
      ${canEdit() ? button('save-view', t('saveView')) : ''}</div>
      ${matches.length ? `<div class="ml-navmatches">${matches.map(m => `<a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ [m.type]: m.id }) }))}"><small>${esc(t(m.type))}</small><span dir="auto">${esc(m.path)}</span></a>`).join('')}</div>` : ''}
      ${bulkHtml(items)}${results.length ? materialsHtml(items, f.layout) : `<div class="ml-empty"><h2>${esc(t('noResults'))}</h2><p>${esc(t('noResultsBody'))}</p>${button('search-all', t('searchAll'))}${button('reset-filters', t('reset'), '', 'ml-quiet')}</div>`}
      ${pages > 1 ? `<nav class="ml-pager" aria-label="${esc(t('pages'))}">${button('previous-page', t('previous'), state.page > 1 ? '' : 'disabled')}<span>${state.page} / ${pages}</span>${button('next-page', t('next'), state.page < pages ? '' : 'disabled')}</nav>` : ''}
    </section></div>`;
}
function topicsHtml() {
  const d = structure(), tokens = C.normalize(state.topicSearch).split(/\s+/).filter(Boolean), visibleIds = new Set();
  for (const c of d.categories) if (tokens.every(x => C.normalize(c.title + ' ' + c.description).includes(x))) C.categoryPath(d,c.id).forEach(p => visibleIds.add(p.id));
  const level = parentId => d.categories.filter(c => c.parentId === parentId && visibleIds.has(c.id)).map((c) => {
    const siblings = d.categories.filter(x => x.parentId === parentId), index = siblings.indexOf(c), children = d.categories.filter(x => x.parentId === c.id);
    const count = categoryCount(c.id);
    if (!organizeMode() && count === 0 && !tokens.length) return '';
    return `<div class="ml-tree-item" ${organizeMode() ? `draggable="true" data-drag-type="category" data-drag-id="${esc(c.id)}"` : ''}><div class="ml-tree-line">
      <a data-nav href="${esc(makeHref({ section: 'catalog', filters: C.filters({ category: c.id }) }))}" dir="auto">${esc(c.title)}</a><small>${esc(t('materialCount', { count }))}</small>
      ${organizeMode() ? `<div class="ml-actions">${orderButtons('category', c.id, index > 0, index < siblings.length - 1)}${button('edit-category', t('edit'), `data-id="${esc(c.id)}"`)}${button('new-category', '+', `data-parent="${esc(c.id)}" aria-label="${esc(t('newSubcategory'))}"`)}</div>` : ''}</div>
      ${c.description ? `<p class="ml-tree-description" dir="auto">${esc(c.description)}</p>` : ''}
      ${children.length ? `<details data-expand="${esc(c.id)}" ${state.expanded.has(c.id) || tokens.length ? 'open' : ''}><summary>${esc(t('subcategoryCount', { count: children.length }))}</summary>${level(c.id)}</details>` : ''}</div>`;
  }).join('');
  return `<section><div class="ml-section-head"><div><h2>${esc(t('topicMap'))}</h2><p>${esc(t('topicMapHelp'))}</p></div></div>
    <input class="ml-topic-search" id="ml-topic-search" value="${esc(state.topicSearch)}" placeholder="${esc(t('findTopic'))}" aria-label="${esc(t('findTopic'))}">
    <div class="ml-tree">${level(null) || `<div class="ml-empty"><p>${esc(t('noTopics'))}</p>${canEdit() ? button('new-category', t('newCategory'), '', 'ml-primary') : ''}</div>`}</div></section>`;
}
function collectionsHtml() {
  const d = structure();
  return `<section class="ml-section"><div class="ml-section-head"><div><h2>${esc(t('collections'))}</h2><p>${esc(t('collectionsHelp'))}</p></div>${canEdit() ? button('new-collection', t('newCollection')) : ''}</div>
    <div class="ml-collections">${d.collections.map(collectionHtml).join('')}</div>
    ${d.collections.length ? '' : `<div class="ml-empty"><p>${esc(t('noCollections'))}</p></div>`}</section>
    ${d.views.length ? `<section><h2>${esc(t('savedViews'))}</h2>${d.views.map(v => `<div class="ml-view-row"><div><a href="${esc(makeHref({ section: 'catalog', filters: v.filters, viewId: v.id }))}" data-action="use-view" data-id="${esc(v.id)}">${esc(v.title)}</a><p>${esc(t('dynamicView'))}</p></div>
      ${canEdit() ? button('delete-view', t('delete'), `data-id="${esc(v.id)}"`, 'ml-quiet') : ''}</div>`).join('')}</section>` : ''}`;
}
function toolbarHtml() {
  if (!organizeMode()) return '';
  return `<div class="ml-toolbar">${button('new-category', t('newCategory'))}${button('new-collection', t('newCollection'))}${button('edit-home', t('editHome'))}
    ${button('template', t('template'))}${button('undo', t('undo'), documentState().canUndo ? '' : 'disabled')}
    ${state.space === 'personal' ? button('export', t('export')) + button('import', t('import')) : button('preview', t('preview'), '', 'ml-primary') + button('history', t('history'))}</div>`;
}
function render() {
  const focus = document.activeElement, focusId = focus?.id, start = focus?.selectionStart, end = focus?.selectionEnd;
  rebuild(); const d = structure();
  const active = state.space === 'personal' ? state.localReady : state.publicReady;
  $('ml-root').setAttribute('aria-busy', 'false');
  $('ml-root').innerHTML = `<div class="ml-heading"><div class="ml-heading-copy"><h1>${esc(t('title'))}</h1><p>${esc(d.home.title || t(state.space === 'public' ? 'publicSubtitle' : 'personalSubtitle'))}</p></div>
    <div class="ml-actions">${state.preview ? '' : state.space === 'personal' && state.localReady ? button('organize', t(state.editing ? 'finishEditing' : 'organize'))
      : state.owner ? button('organize', t(state.editing ? 'finishEditing' : 'editPublic')) : ''}
      ${state.space === 'personal' ? `<a class="ml-textlink" href="/">${esc(t('addMaterial'))}</a>` : ''}</div></div>
    <div class="ml-space" role="group" aria-label="${esc(t('space'))}">${button('space', t('public'), 'data-space="public" aria-pressed="' + (state.space === 'public') + '"')}${button('space', t('personal'), 'data-space="personal" aria-pressed="' + (state.space === 'personal') + '"')}</div>
    ${state.preview ? `<div class="ml-banner"><div><strong>${esc(t('previewTitle'))}</strong><p>${esc(t('previewHelp'))}</p></div><div class="ml-actions">${button('publish', t('publish'), '', 'ml-primary')}${button('exit-preview', t('backToDraft'))}</div></div>`
      : state.editing && state.space === 'public' ? `<div class="ml-banner"><span>${esc(t('draftNotice'))} · ${esc(t('revision', { count: state.draft?.revision || 0 }))}</span>${button('preview', t('preview'))}</div>` : ''}
    ${state.publicError ? `<div class="ml-banner ml-banner-error"><span>${esc(state.publicError)}</span>${button('retry', t('retry'))}</div>` : ''}
    ${state.localError ? `<div class="ml-banner ml-banner-error"><span>${esc(state.localError)}</span>${button('retry', t('retry'))}</div>` : ''}
    <div class="ml-searchbar"><label class="ml-search"><span class="sr-only">${esc(t('search'))}</span><input type="search" id="ml-search" value="${esc(state.filters.q)}" placeholder="${esc(t('searchPlaceholder'))}"></label>
    ${state.section !== 'catalog' ? button('search-submit', t('search')) : ''}</div>
    <nav class="ml-tabs" aria-label="${esc(t('navigation'))}">${['home','catalog','topics','collections'].map(s => button('section', t(s === 'catalog' ? 'allMaterials' : s), `data-section="${s}" ${state.section === s ? 'aria-current="page"' : ''}`)).join('')}</nav>
    ${toolbarHtml()}<div id="ml-content" tabindex="-1">${!active ? `<p class="ml-loading">${esc(t(state.localError || state.publicError ? 'retryHelp' : 'loading'))}</p>`
      : state.section === 'home' ? `${d.home.description ? `<p class="ml-home-description">${esc(d.home.description)}</p>` : ''}${homeHtml()}`
      : state.section === 'catalog' ? catalogHtml() : state.section === 'topics' ? topicsHtml() : collectionsHtml()}</div>
    <p class="ml-storage">${esc(t(state.space === 'personal' ? 'localStorageNote' : 'videoOnlineNote'))}</p>`;
  $('ml-root').querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  $('ml-filters')?.addEventListener('toggle', event => { state.filterOpen = event.target.open; });
  $('ml-root').querySelectorAll('[data-expand]').forEach(details => details.addEventListener('toggle', () => { if (details.open) state.expanded.add(details.dataset.expand); else state.expanded.delete(details.dataset.expand); }));
  if (focusId) { const next = $(focusId); if (next) { next.focus({ preventScroll: true }); if (typeof start === 'number' && next.setSelectionRange) try { next.setSelectionRange(start, end); } catch (_) {} } }
}

function closeDialog() { $('ml-dialog').close(); dialogAction = null; lastDialogFocus?.focus?.({ preventScroll: true }); }
function showDialog(title, html, action) {
  if (!$('ml-dialog').open) lastDialogFocus = document.activeElement;
  $('ml-dialog-title').textContent = title;
  $('ml-dialog-body').innerHTML = `<form class="ml-form" id="ml-form">${html}<p id="ml-form-error" class="ml-form-error" role="alert" hidden></p></form>`;
  dialogAction = action;
  if (!$('ml-dialog').open) $('ml-dialog').showModal();
  $('ml-dialog').querySelector('input:not([type=hidden]),select,textarea,button[type=submit]')?.focus();
}
function formActions(label = t('save'), danger = false) {
  return `<div class="ml-form-actions">${button('cancel-dialog', t('cancel'))}<button type="submit" class="${danger ? 'ml-danger' : 'ml-primary'}">${esc(label)}</button></div>`;
}
async function formSave(next, message = t('saved')) { await save(next); closeDialog(); state.selected.clear(); render(); announce(message); }
function categoryOptions(current, exclude = new Set()) {
  return option('', t('rootCategory'), current || '') + structure().categories.filter(c => !exclude.has(c.id))
    .map(c => option(c.id, C.categoryPath(structure(), c.id).map(x => x.title).join(' / '), current)).join('');
}
function editCategory(id, parentId) {
  const c = structure().categories.find(x => x.id === id), excluded = c ? C.descendants(structure(), c.id) : new Set();
  showDialog(t(c ? 'editCategory' : 'newCategory'), `<label>${esc(t('name'))}<input name="title" maxlength="200" required value="${esc(c?.title || '')}"></label>
    <label>${esc(t('description'))}<textarea name="description" maxlength="2000">${esc(c?.description || '')}</textarea></label>
    <label>${esc(t('parentCategory'))}<select name="parentId">${categoryOptions(c?.parentId || parentId, excluded)}</select></label>
    ${c ? `<div class="ml-actions">${button('merge-category', t('merge'), `data-id="${esc(c.id)}"`)}${button('delete-category', t('delete'), `data-id="${esc(c.id)}"`, 'ml-danger')}</div>` : ''}${formActions()}`,
  async data => {
    let d = C.command(structure(), { type: c ? 'category.update' : 'category.create', id: c?.id || uid(), title: data.get('title').trim(), description: data.get('description').trim(), parentId: data.get('parentId') || null });
    if (c && c.parentId !== (data.get('parentId') || null)) d = C.command(d, { type: 'category.move', id: c.id, parentId: data.get('parentId') || null });
    await formSave(d);
  });
}
function editCollection(id) {
  const c = structure().collections.find(x => x.id === id);
  showDialog(t(c ? 'editCollection' : 'newCollection'), `<label>${esc(t('name'))}<input name="title" maxlength="200" required value="${esc(c?.title || '')}"></label>
    <label>${esc(t('description'))}<textarea name="description" maxlength="2000">${esc(c?.description || '')}</textarea></label>
    <label class="ml-checkbox"><input type="checkbox" name="pinned" ${c?.pinned ? 'checked' : ''}>${esc(t('pinHome'))}</label>
    ${c ? button('delete-collection', t('delete'), `data-id="${esc(c.id)}"`, 'ml-danger') : ''}${formActions()}`,
  async data => {
    const id = c?.id || uid(); let d = structure();
    if (!c) d = C.command(d, { type: 'collection.create', id, title: data.get('title').trim(), description: data.get('description').trim() });
    d = C.command(d, { type: 'collection.update', id, title: data.get('title').trim(), description: data.get('description').trim(), pinned: data.has('pinned') });
    await formSave(d);
  });
}
function deleteCategory(id) {
  const c = structure().categories.find(x => x.id === id); if (!c) return;
  showDialog(t('deleteCategory'), `<p>${esc(t('deleteCategoryHelp', { title: c.title }))}</p><label>${esc(t('childrenAction'))}<select name="children"><option value="lift">${esc(t('liftChildren'))}</option><option value="subtree">${esc(t('removeSubtree'))}</option></select></label>${formActions(t('deleteCategory'), true)}`,
    async data => { await formSave(C.command(structure(), { type: 'category.remove', id, children: data.get('children') }), t('categoryRemoved')); if (state.filters.category === id) { state.filters.category = ''; persist(); render(); } });
}
function mergeCategory(id) {
  const c = structure().categories.find(x => x.id === id); if (!c) return;
  const excluded = C.descendants(structure(), id), targets = structure().categories.filter(x => !excluded.has(x.id));
  if (!targets.length) { announce(t('mergeNoTarget')); return; }
  showDialog(t('merge'), `<p>${esc(t('mergeHelp', { title: c.title }))}</p><label>${esc(t('mergeTarget'))}<select name="targetId">${targets.map(x => option(x.id, C.categoryPath(structure(), x.id).map(y => y.title).join(' / '), '')).join('')}</select></label>${formActions(t('merge'))}`,
    data => formSave(C.command(structure(), { type: 'category.merge', id, targetId: data.get('targetId') })));
}
async function addToCollection(key) {
  const item = state.prepared.byKey.get(key); if (!item) return;
  if (state.space === 'public' && !organizeMode()) {
    if (!state.localReady) { announce(t('localFailed'), true); return; }
    const d = state.personal.structure;
    showDialog(t('addToMyCollection'), `<p dir="auto">${esc(item.title)}</p><label>${esc(t('collection'))}<select name="collection"><option value="">${esc(t('saveToMineOnly'))}</option>${d.collections.map(c => option(c.id,c.title,'')).join('')}</select></label>
      <label>${esc(t('orNewCollection'))}<input name="newTitle" maxlength="200"></label>${formActions(t('add'))}`, async data => {
      let next = d, id = data.get('collection');
      if (data.get('newTitle').trim()) { id = uid(); next = C.command(next, { type: 'collection.create', id, title: data.get('newTitle').trim() }); }
      next = C.command(next, id ? { type: 'items.add', target: 'collection', id, references: [item.ref] } : { type: 'reference.save', references: [item.ref] });
      state.personal = await localDb.saveMediathequeStructure(next, state.personal.revision); closeDialog(); render(); announce(t('savedToMine'));
    }); return;
  }
  state.selected = new Set([key]); assignmentDialog();
}
function assignmentDialog() {
  const items = selectedMaterials(); if (!items.length) return;
  const d = structure(), values = [...d.categories.map(c => ['category:' + c.id, t('category') + ': ' + C.categoryPath(d,c.id).map(x => x.title).join(' / ')]),
    ...d.collections.map(c => ['collection:' + c.id, t('collection') + ': ' + c.title])];
  const fromId = state.filters.collection || state.filters.category, fromType = state.filters.collection ? 'collection' : 'category';
  showDialog(t('distribute'), `<p>${esc(t('selectedCount', { count: items.length }))}</p>
    <label>${esc(t('destination'))}<select name="target">${option('', t('chooseDestination'), '')}${values.map(([v,l]) => option(v,l,'')).join('')}</select></label>
    <label>${esc(t('orNewCollection'))}<input name="newTitle" maxlength="200"></label>
    ${fromId ? `<label class="ml-checkbox"><input type="checkbox" name="move">${esc(t('moveFromCurrent'))}</label>` : ''}${formActions(t('add'))}`,
  async data => {
    let next = d, target = data.get('target'), newTitle = data.get('newTitle').trim();
    if (newTitle) { const id = uid(); next = C.command(next, { type: 'collection.create', id, title: newTitle }); target = 'collection:' + id; }
    if (!target) throw new Error('MEDIATHEQUE_INVALID');
    const [type,id] = target.split(':');
    if (data.has('move') && type !== fromType) throw new Error('MEDIATHEQUE_INVALID');
    next = C.command(next, { type: 'items.add', target: type, id, references: items.map(i => i.ref), fromId: data.has('move') ? fromId : undefined }, { publicOnly: state.space === 'public' });
    await formSave(next);
  });
}
function tagsDialog() {
  const items = selectedMaterials(); if (!items.length) return;
  const single = items.length === 1 ? structure().annotations.find(a => a.key === items[0].key) : null;
  showDialog(t('addTags'), `<p>${esc(t('tagsHelp'))}</p><label>${esc(t('additionalTags'))}<input name="tags" maxlength="1000" value="${esc(single?.tags.join(', ') || '')}" placeholder="${esc(t('tagsHint'))}"></label>
    <label>${esc(t('genre'))}<input name="genre" maxlength="100" value="${esc(single?.genre || '')}" placeholder="${esc(t('genreHint'))}"></label><label>${esc(t('language'))}<input name="language" maxlength="40" value="${esc(single?.language || '')}" placeholder="he"></label><label class="ml-checkbox"><input type="checkbox" name="clear">${esc(t('clearProperties'))}</label>${formActions()}`,
  async data => {
    let next = structure(); const added = data.get('tags').split(',').map(t => t.trim()).filter(Boolean);
    for (const item of items) {
      const a = next.annotations.find(a => a.key === item.key);
      next = C.command(next, { type: 'annotation.set', references: [item.ref], tags: data.has('clear') ? [] : items.length === 1 ? added : Array.from(new Set([...(a?.tags || []), ...added])),
        genre: data.has('clear') ? '' : data.get('genre').trim() || (items.length === 1 ? '' : undefined), language: data.has('clear') ? '' : data.get('language').trim() || (items.length === 1 ? '' : undefined) });
    }
    await formSave(next);
  });
}
function saveViewDialog() {
  const current = structure().views.find(v => v.id === state.viewId);
  showDialog(t('saveView'), `<p>${esc(t('saveViewHelp'))}</p><label>${esc(t('name'))}<input name="title" maxlength="200" required value="${esc(current?.title || '')}"></label>
    ${current ? `<label class="ml-checkbox"><input type="checkbox" name="replace" checked>${esc(t('replaceView'))}</label>` : ''}${formActions()}`,
  async data => { const id = current && data.has('replace') ? current.id : uid(); await formSave(C.command(structure(), { type: 'view.save', id, title: data.get('title').trim(), filters: state.filters })); state.viewId = id; persist(); render(); });
}
function editHome(selectedReference) {
  const d = structure(), h = d.home, feature = selectedReference || d.references.find(r => C.refKey(r) === h.featured);
  const order = [...h.sections, ...C.SECTIONS.filter(s => !h.sections.includes(s))];
  showDialog(t('editHome'), `<label>${esc(t('homeTitle'))}<input name="title" maxlength="200" value="${esc(h.title)}"></label>
    <label>${esc(t('description'))}<textarea name="description" maxlength="2000">${esc(h.description)}</textarea></label>
    <p>${esc(t('featureHelp'))}</p>${feature ? `<label class="ml-checkbox"><input type="checkbox" name="feature" checked>${esc(t('keepFeatured'))}</label>` : ''}
    <div class="ml-home-order" id="ml-home-order">${order.map(s => `<div data-section="${s}"><label class="ml-checkbox"><input type="checkbox" name="section" value="${s}" ${h.sections.includes(s) ? 'checked' : ''}>${esc(t('section.' + s))}</label>${button('home-up','↑',`aria-label="${esc(t('up'))}"`)}${button('home-down','↓',`aria-label="${esc(t('down'))}"`)}</div>`).join('')}</div>${formActions()}`,
    data => formSave(C.command(structure(), { type: 'home.update', title: data.get('title').trim(), description: data.get('description').trim(), reference: data.has('feature') ? feature : null,
      sections: Array.from($('ml-home-order').children).filter(row => row.querySelector('input').checked).map(row => row.dataset.section) })));
}
function templateDialog() {
  showDialog(t('template'), `<p>${esc(t('templateHelp'))}</p>${formActions(t('addTemplate'))}`, async () => {
    let d = structure();
    for (const [key, children] of [['israel',['everyday','work','culture']], ['news',['newsBrief','interviews']], ['science',['space','nature','technology']], ['historyCulture',['history','art','traditions']], ['travel',[]],['humor',[]],['music',[]],['languageStudy',[]]]) {
      const title = t('templateTopics.' + key), existing = d.categories.find(c => c.parentId === null && C.normalize(c.title) === C.normalize(title));
      const id = existing?.id || uid(); if (!existing) d = C.command(d, { type:'category.create', id, title });
      for (const child of children) { const childTitle = t('templateTopics.' + child); if (!d.categories.some(c => c.parentId === id && C.normalize(c.title) === C.normalize(childTitle))) d = C.command(d, { type:'category.create', id: uid(), title: childTitle, parentId: id }); }
    }
    await formSave(d); state.section = 'topics'; persist(); render();
  });
}
function importDialog() {
  showDialog(t('import'), `<p>${esc(t('importHelp'))}</p><label>${esc(t('chooseFile'))}<input name="file" type="file" accept="application/json,.json" required></label>${formActions(t('restore'))}`, async data => {
    const file = data.get('file'); if (!file || file.size > C.LIMITS.bytes) throw new Error('MEDIATHEQUE_INVALID');
    const next = C.importStructure(JSON.parse(await file.text())); await formSave(next, t('restored'));
  });
}
async function historyDialog() {
  state.draft = await api('/api/publication/mediatheque');
  const editions = state.draft.editions || [];
  showDialog(t('history'), `<p>${esc(t('historyHelp'))}</p><label>${esc(t('edition'))}<select name="editionId" required>${editions.map(e => option(e.edition_id, t('revision', { count: e.revision }) + ' · ' + new Date(e.published_at).toLocaleString(), state.draft.edition_id)).join('')}</select></label>${formActions(t('restoreEdition'))}`, async data => {
    await api('/api/publication/mediatheque/rollback', { editionId: data.get('editionId'), expectedVersion: state.draft.revision, expectedEdition: state.draft.edition_id }); await loadPublic(); state.draft = await api('/api/publication/mediatheque'); closeDialog(); render(); announce(t('editionRestored'));
  });
}
function publishDialog() {
  const d = state.draft.structure;
  showDialog(t('publishTitle'), `<p>${esc(t('publishHelp'))}</p><ul class="ml-diff"><li>${esc(t('categoryCount', { count: d.categories.length }))}</li><li>${esc(t('collectionCount', { count: d.collections.length }))}</li><li>${esc(t('viewCount', { count: d.views.length }))}</li></ul>${formActions(t('publish'))}`, async () => {
    await api('/api/publication/mediatheque/publish', { expectedVersion: state.draft.revision, expectedEdition: state.draft.edition_id }); await loadPublic(); state.preview = false; state.editing = false; state.draft = null; closeDialog(); render(); announce(t('published'));
  });
}
async function reorder(type, id, direction, targetId) {
  const d = structure(); let ids, command;
  if (type === 'category') { const c = d.categories.find(c => c.id === id); if (!c) return;
    ids = d.categories.filter(x => x.parentId === c.parentId).map(x => x.id); command = { type: 'category.order', parentId: c.parentId }; }
  else if (type === 'collection') { ids = d.collections.map(c => c.id); command = { type: 'collection.order' }; }
  else {
    const target = state.filters.collection ? 'collection' : 'category', id = state.filters.collection || state.filters.category;
    const c = (target === 'collection' ? d.collections : d.categories).find(x => x.id === id); if (!c) return;
    ids = c.items.slice(); command = { type: 'items.order', target, id };
  }
  const from = ids.indexOf(id), to = targetId ? ids.indexOf(targetId) : from + direction;
  if (from < 0 || to < 0 || to >= ids.length || to === from) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]); command[command.type === 'items.order' ? 'keys' : 'ids'] = ids; await mutate(command, t('orderSaved'));
}
async function onAction(action, node) {
  if (state.busy && action !== 'cancel-dialog') return;
  const id = node.dataset.id;
  if (action === 'cancel-dialog') return closeDialog();
  if (action === 'space') { persist(); state.editing = false; state.preview = false; restorePresentation(node.dataset.space); persist(); render(); return; }
  if (action === 'section') return navigate(node.dataset.section, { q: '', category: '', collection: '' });
  if (action === 'organize') {
    if (state.space === 'public' && !state.editing) state.draft = await api('/api/publication/mediatheque');
    state.editing = !state.editing; state.preview = false; state.selected.clear(); render(); return;
  }
  if (action === 'layout') { state.filters.layout = node.dataset.layout; persist(); render(); return; }
  if (action === 'search-submit') return navigate('catalog', { q: $('ml-search').value }, { scroll: false });
  if (action === 'search-all') return navigate('catalog', { category: '', collection: '' });
  if (action === 'reset-filters') return navigate('catalog', C.filters({ layout: state.filters.layout }));
  if (action === 'clear-filter') { const f = node.dataset.field; state.filters[f] = C.filters()[f]; state.page = 1; persist(); render(); return; }
  if (action === 'clear-selection') { state.selected.clear(); render(); return; }
  if (action === 'previous-page' || action === 'next-page') { state.page += action === 'next-page' ? 1 : -1; persist(); render(); $('ml-content').scrollIntoView({ block:'start' }); return; }
  if (action === 'retry') return loadAll();
  if (action === 'add-item') return addToCollection(node.dataset.key);
  if (action === 'use-view') { const v = structure().views.find(v => v.id === id); if (v) return navigate('catalog', v.filters, { viewId:id }); return; }
  if (action === 'exit-preview') { state.preview = false; render(); return; }
  if (action === 'publish' && state.owner && state.preview) return publishDialog();
  if (!canEdit()) return;
  if (action === 'new-category' || action === 'edit-category') return editCategory(id, node.dataset.parent);
  if (action === 'delete-category') return deleteCategory(id);
  if (action === 'merge-category') return mergeCategory(id);
  if (action === 'new-collection' || action === 'edit-collection') return editCollection(id);
  if (action === 'delete-collection') return showDialog(t('deleteCollection'), `<p>${esc(t('deleteCollectionHelp'))}</p>${formActions(t('delete'),true)}`, () => formSave(C.command(structure(), { type: 'collection.remove', id })));
  if (action === 'delete-view') return showDialog(t('deleteView'), `<p>${esc(t('deleteViewHelp'))}</p>${formActions(t('delete'),true)}`, () => formSave(C.command(structure(), { type:'view.remove', id })));
  if (action === 'assign') return assignmentDialog();
  if (action === 'tags') return tagsDialog();
  if (action === 'forget-reference' && state.space === 'personal') return showDialog(t('forgetReference'), `<p>${esc(t('forgetReferenceHelp'))}</p>${formActions(t('remove'))}`, () => formSave(C.command(structure(), { type: 'reference.forget', keys: [node.dataset.key] })));
  if (action === 'save-view') return saveViewDialog();
  if (action === 'edit-home') return editHome();
  if (action === 'feature') { const items = selectedMaterials(); if (items.length === 1) return editHome(items[0].ref); return; }
  if (action === 'template') return templateDialog();
  if (action === 'import' && state.space === 'personal') return importDialog();
  if (action === 'export' && state.space === 'personal') {
    const blob = new Blob([JSON.stringify(C.exportStructure(structure()), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'linguistpro-mediatheque-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); return;
  }
  if (action === 'undo') { state.busy = true; try {
    if (state.space === 'personal') state.personal = await localDb.undoMediathequeStructure(state.personal.revision);
    else state.draft = { ...state.draft, ...await api('/api/publication/mediatheque/undo', { expectedVersion: state.draft.revision }) };
    render(); announce(t('undone')); } finally { state.busy = false; } return;
  }
  if (action === 'up' || action === 'down') return reorder(node.dataset.orderType, id, action === 'up' ? -1 : 1);
  if (action === 'remove-items') return showDialog(t('removeFromHere'), `<p>${esc(t('removeItemsHelp', { count:state.selected.size }))}</p>${formActions(t('remove'))}`, () => formSave(C.command(structure(), { type:'items.remove', target: state.filters.collection ? 'collection' : 'category', id:state.filters.collection || state.filters.category, keys:Array.from(state.selected) })));
  if (action === 'preview') { state.preview = true; state.selected.clear(); render(); return; }
  if (action === 'history') return historyDialog();
  if (action === 'home-up' || action === 'home-down') { const row = node.closest('[data-section]'), parent = row.parentElement;
    if (action === 'home-up' && row.previousElementSibling) parent.insertBefore(row,row.previousElementSibling);
    if (action === 'home-down' && row.nextElementSibling) parent.insertBefore(row.nextElementSibling,row); }
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) { event.preventDefault(); Promise.resolve(onAction(action.dataset.action, action)).catch(e => announce(errorText(e), true)); return; }
  const link = event.target.closest('a[data-nav]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault(); const p = new URL(link.href).searchParams;
    let filters; try { filters = C.filters(p.has('filters') ? JSON.parse(p.get('filters')) : { category:p.get('category') || '', collection:p.get('collection') || '' }); } catch (_) { filters = C.filters(); }
    navigate(p.get('section') || 'catalog', filters);
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'ml-search') { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.filters.q = $('ml-search').value; state.section = 'catalog'; state.page = 1; state.selected.clear(); persist(); render(); }, 200); }
  if (event.target.id === 'ml-topic-search') { state.topicSearch = event.target.value; render(); }
});
document.addEventListener('change', event => {
  const node = event.target;
  if (node.dataset.filter) {
    const key = node.dataset.filter; state.filters[key] = node.type === 'checkbox' ? node.checked : key === 'maxDuration' ? node.value ? Number(node.value) : null : key === 'tags' ? node.value.split(',').map(v => v.trim()).filter(Boolean) : node.value;
    state.viewId = ''; state.page = 1; state.selected.clear(); persist(); render();
  }
  if (node.id === 'ml-sort') { state.filters.sort = node.value; state.page = 1; persist(); render(); }
  if (node.id === 'ml-view-select' && node.value) { const v = structure().views.find(v => v.id === node.value); if (v) navigate('catalog',v.filters,{viewId:v.id}); }
  if (node.dataset.select) { if (node.checked) state.selected.add(node.dataset.select); else state.selected.delete(node.dataset.select); render(); }
  if (node.id === 'ml-select-page') { const items = C.query(structure(),state.prepared,state.filters).slice((state.page - 1)*36,state.page*36); items.forEach(i => node.checked ? state.selected.add(i.key) : state.selected.delete(i.key)); render(); }
});
let drag = null;
$('ml-root').addEventListener('dragstart', event => { const item = event.target.closest('[data-drag-type]'); if (!item || !organizeMode()) return;
  drag = { type:item.dataset.dragType, id:item.dataset.dragId }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain',drag.id); });
$('ml-root').addEventListener('dragover', event => { const item = event.target.closest('[data-drag-type]'); if (drag && item?.dataset.dragType === drag.type) { event.preventDefault(); item.classList.add('ml-drag-over'); } });
$('ml-root').addEventListener('dragleave', event => event.target.closest('[data-drag-type]')?.classList.remove('ml-drag-over'));
$('ml-root').addEventListener('drop', event => { event.preventDefault(); const item = event.target.closest('[data-drag-type]'); if (drag && item?.dataset.dragType === drag.type) reorder(drag.type, drag.id, 0, item.dataset.dragId).catch(e => announce(errorText(e),true)); drag = null; });
$('ml-root').addEventListener('dragend', () => { drag = null; $('ml-root').querySelectorAll('.ml-drag-over').forEach(n => n.classList.remove('ml-drag-over')); });
$('ml-dialog-close').addEventListener('click', closeDialog);
$('ml-dialog').addEventListener('cancel', () => { dialogAction = null; });
$('ml-dialog').addEventListener('submit', async event => {
  event.preventDefault(); if (!dialogAction || state.busy) return;
  const action = dialogAction, data = new FormData(event.target); state.busy = true;
  const submit = event.target.querySelector('button[type=submit]'); if (submit) submit.disabled = true;
  try { await action(data); }
  catch (e) {
    if (/CONFLICT/.test(e.message)) { closeDialog(); state.personal = await localDb.getMediathequeStructure(); await refreshStructure(); announce(errorText(e), true); }
    else { const error = $('ml-form-error'); if (error) { error.hidden = false; error.textContent = errorText(e); } }
  }
  finally { state.busy = false; if (submit?.isConnected) submit.disabled = false; }
});
function applyTheme() {
  let theme; try { theme = localStorage.getItem('appTheme_v1'); } catch (_) {}
  document.body.classList.toggle('ml-dark', theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme:dark)').matches));
}
$('ml-theme').addEventListener('click', () => { try { localStorage.setItem('appTheme_v1',document.body.classList.contains('ml-dark') ? 'light' : 'dark'); } catch (_) {} applyTheme(); });
$('ml-language').value = window.appGetLocale();
$('ml-language').addEventListener('change', event => window.appSetLocale(event.target.value));
document.addEventListener('i18n:changed', () => { $('ml-language').value = window.appGetLocale(); document.title = t('title') + ' · LinguistPro'; render(); });
window.addEventListener('pageshow', event => { if (event.persisted) loadAll(); });
window.addEventListener('online', () => loadAll());
window.addEventListener('popstate', () => { restorePresentation(new URLSearchParams(location.search).get('space') === 'personal' ? 'personal' : 'public', true); render(); });
applyTheme(); restorePresentation(new URLSearchParams(location.search).get('space') === 'personal' ? 'personal' : 'public', true);
loadAll();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
