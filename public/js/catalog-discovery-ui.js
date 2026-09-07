// One accessible catalog control surface, driven by explicit source capabilities.
(function (root) {
  'use strict';
  /**
   * @typedef {{key:string,label:string,options:Array<[string,string]>,defaultValue:string,id?:string}} SelectFacet
   * @param {{id:string,state:Object,t:Function,sorts:Array<[string,string]>,scopes:Array<[string,string]>,
   * defaults?:Object,ids?:Object,tags?:Array<{value:string,count:number}>,levels?:Array<{value:string,count:number}>,
   * providers?:Array<{value:string,count:number}>,smart?:boolean,smartCounts?:Object,extra?:SelectFacet[],
   * onChange:Function,beforeSort?:Function,placeholder?:string,personalHint?:boolean}} config
   */
  function create(config) {
    const core = root.CatalogDiscovery, state = config.state, t = config.t;
    const defaults = { q: '', scope: 'texts', sort: 'opened_desc', tags: [], tagMode: 'all', smart: '', level: '', provider: '', ...config.defaults };
    for (const [key, value] of Object.entries(defaults)) if (state[key] == null) state[key] = Array.isArray(value) ? value.slice() : value;
    const ids = config.ids || {}, fields = new Map();
    let expandedTags = false, tagQuery = '', sortSequence = 0;
    const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
    const button = (text, action, className = 'discovery-chip') => {
      const e = node('button', className, text); e.type = 'button'; e.addEventListener('click', action); return e;
    };
    const shell = node('section', 'catalog-discovery corpus-browse-tools');
    shell.dataset.discovery = config.id; shell.setAttribute('aria-label', t('discovery.browse'));
    const primary = node('div', 'discovery-primary');
    function field(label, input) {
      const wrap = node('label', 'discovery-field'); wrap.htmlFor = input.id;
      wrap.append(node('span', 'room-field-label', label), input); return wrap;
    }
    function select(key, label, options, id) {
      const input = node('select', 'mytexts-select'); input.id = id || ids[key] || config.id + key; input.name = input.id;
      input.setAttribute('aria-label', label);
      for (const [value, text] of options) { const option = node('option', '', text); option.value = value; input.append(option); }
      input.value = state[key] == null ? '' : state[key];
      if (input.selectedIndex < 0) { input.value = defaults[key] || ''; state[key] = input.value; }
      fields.set(key, { input, label, options });
      input.addEventListener('change', async () => {
        const value = input.value;
        if (key === 'sort' && config.beforeSort) {
          const sequence = ++sortSequence;
          input.setAttribute('aria-busy', 'true');
          let allowed = false;
          try { allowed = await config.beforeSort(value); } catch (_) { allowed = false; }
          if (sequence !== sortSequence) return;
          input.removeAttribute('aria-busy');
          if (!allowed) { input.value = state.sort; return; }
        }
        state[key] = value; refresh(); config.onChange(key);
      });
      return field(label, input);
    }
    const search = node('input', 'corpus-search-input'); search.type = 'search'; search.id = ids.q || config.id + 'Search'; search.name = search.id;
    search.placeholder = config.placeholder || t('discovery.searchPlaceholder'); search.value = state.q;
    search.setAttribute('aria-label', t('discovery.search'));
    search.addEventListener('input', () => { state.q = search.value; refreshActive(); config.onChange('q'); });
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape' && search.value) { event.preventDefault(); search.value = ''; state.q = ''; refreshActive(); config.onChange('q'); }
      if (event.key === 'Enter') { event.preventDefault(); config.onChange('enter'); }
    });
    const searchField = field(t('discovery.search'), search); searchField.classList.add('discovery-search');
    primary.append(searchField);
    const sortField = select('sort', t('discovery.sort'), config.sorts); sortField.classList.add('discovery-sort'); primary.append(sortField);
    shell.append(primary);

    const disclosure = node('details', 'discovery-filters'); disclosure.id = config.id + 'Filters'; disclosure.open = root.innerWidth > 760;
    const summary = node('summary', 'discovery-filter-summary');
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');
    icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');icon.setAttribute('class','discovery-filter-icon');
    use.setAttribute('href','/icons/linguistpro-ui.svg#lp-icon-settings');icon.append(use);
    const summaryLabel=node('span');summary.append(icon,summaryLabel);
    const panel = node('div', 'discovery-filter-panel');
    disclosure.append(summary, panel); shell.append(disclosure);
    const selects = node('div', 'discovery-selects');
    if (config.scopes && config.scopes.length > 1) selects.append(select('scope', t('discovery.scope'), config.scopes));
    if (config.levels && config.levels.length) selects.append(select('level', t('discovery.level'), [['', t('discovery.allLevels')], ...config.levels.map(x => [x.value, x.value + ' · ' + x.count])]));
    if (config.providers && config.providers.length) selects.append(select('provider', t('discovery.provider'), [['', t('discovery.allProviders')], ...config.providers.map(x => [x.value, (config.providerLabel ? config.providerLabel(x.value) : x.value) + ' · ' + x.count])]));
    for (const extra of config.extra || []) { defaults[extra.key] = extra.defaultValue; if (state[extra.key] == null) state[extra.key] = extra.defaultValue; selects.append(select(extra.key, extra.label, extra.options, extra.id)); }
    panel.append(selects);
    const toggles = node('div', 'discovery-toggles discovery-smart');
    for (const item of config.toggles || []) {
      if (state[item.key] == null) state[item.key] = false;
      defaults[item.key] = false;
      const b = button(item.label, () => { state[item.key] = !state[item.key]; refresh(); config.onChange(item.key); });
      b.dataset.toggle = item.key; if (item.help) b.title = item.help; toggles.append(b);
    }
    if (toggles.childElementCount) panel.append(toggles);
    const smartRail = node('div', 'discovery-smart'); smartRail.setAttribute('role', 'group'); smartRail.setAttribute('aria-label', t('discovery.personalFilters'));
    if (config.smart) {
      for (const [key, labelKey] of core.SMART_FILTERS) {
        const b = button(t(labelKey), () => { state.smart = state.smart === key ? '' : key; refresh(); config.onChange('smart'); });
        b.dataset.smart = key;
        const count = config.smartCounts && config.smartCounts[key];
        if (Number.isFinite(count)) b.append(node('span', 'discovery-count', String(count)));
        b.title = t('discovery.' + (key === 'recent' ? 'recentHelp' : key === 'fresh' ? 'newHelp' : 'personalHelp'));
        smartRail.append(b);
      }
      panel.append(smartRail);
      if (config.personalHint) panel.append(node('p', 'discovery-hint', t('discovery.personalHelp')));
    }
    const tagsSection = node('div', 'discovery-tags-section');
    const tagsHeader = node('div', 'discovery-tags-header');
    tagsHeader.append(node('span', 'room-field-label', t('discovery.tags')));
    tagsHeader.append(select('tagMode', t('discovery.tagMatch'), [['all', t('discovery.tagsAll')], ['any', t('discovery.tagsAny')]]));
    const tagSearch = node('input', 'discovery-tag-search'); tagSearch.type = 'search'; tagSearch.id = config.id + 'TagSearch';
    tagSearch.placeholder = t('discovery.findTag'); tagSearch.setAttribute('aria-label', t('discovery.findTag'));
    tagSearch.addEventListener('input', () => { tagQuery = tagSearch.value; renderTags(); });
    const tagsRail = node('div', 'discovery-tags'); tagsRail.setAttribute('role', 'group'); tagsRail.setAttribute('aria-label', t('discovery.tags'));
    const moreTags = button('', () => { expandedTags = !expandedTags; renderTags(); if (expandedTags) tagSearch.focus(); }, 'discovery-more-tags');
    tagsSection.append(tagsHeader, tagSearch, tagsRail, moreTags);
    if (config.tags && config.tags.length) panel.append(tagsSection);

    const active = node('div', 'discovery-active corpus-active-filters'); active.setAttribute('aria-live', 'polite'); shell.append(active);
    function renderTags() {
      const focusedTag = document.activeElement && document.activeElement.dataset.discoveryTag;
      const all = config.tags || [];
      let shown = tagQuery ? all.filter(x => core.normalize(x.value).includes(core.normalize(tagQuery))) : expandedTags ? all : all.slice(0, 18);
      for (const value of state.tags) if (!shown.some(x => x.value === value)) shown = shown.concat(all.find(x => x.value === value) || { value, count: 0 });
      tagsRail.replaceChildren();
      for (const item of shown) {
        const b = button('#' + item.value, () => {
          state.tags = state.tags.includes(item.value) ? state.tags.filter(x => x !== item.value) : state.tags.concat(item.value);
          refresh(); config.onChange('tags');
        });
        b.dataset.discoveryTag = item.value; b.setAttribute('aria-pressed', String(state.tags.includes(item.value)));
        b.append(node('span', 'discovery-count', String(item.count))); tagsRail.append(b);
      }
      if (!shown.length) tagsRail.append(node('span', 'discovery-hint', t('discovery.noTags')));
      moreTags.hidden = all.length <= 18;
      moreTags.textContent = t(expandedTags ? 'discovery.fewerTags' : 'discovery.allTags').replace('{count}', all.length);
      moreTags.setAttribute('aria-expanded', String(expandedTags));
      tagSearch.hidden = !expandedTags;
      if (focusedTag) [...tagsRail.querySelectorAll('button')].find(x => x.dataset.discoveryTag === focusedTag)?.focus();
    }
    function activeEntries() {
      const entries = [];
      if (String(state.q).trim()) entries.push({ label: state.q, remove() { state.q = ''; search.value = ''; } });
      for (const [key, value] of fields) {
        if (key === 'sort' || key === 'tagMode' || state[key] === defaults[key]) continue;
        const choice = value.options.find(x => x[0] === state[key]);
        entries.push({ label: value.label + ': ' + (choice ? choice[1] : state[key]), remove() { state[key] = defaults[key]; } });
      }
      if (state.smart) entries.push({ label: t((core.SMART_FILTERS.find(x => x[0] === state.smart) || [])[1]), remove() { state.smart = ''; } });
      for (const item of config.toggles || []) if (state[item.key]) entries.push({ label: item.label, remove() { state[item.key] = false; } });
      for (const tag of state.tags) entries.push({ label: '#' + tag, remove() { state.tags = state.tags.filter(x => x !== tag); } });
      if (config.activeEntries) entries.push(...config.activeEntries());
      return entries;
    }
    function refreshActive() {
      const entries = activeEntries();
      const restoreFocus = active.contains(document.activeElement);
      summaryLabel.textContent = t('discovery.filters') + (entries.length ? ' · ' + entries.length : '');
      active.replaceChildren();
      for (const entry of entries) {
        const b = button(entry.label, () => { entry.remove(); refresh(); config.onChange('remove'); }, 'discovery-active-chip');
        b.setAttribute('aria-label', t('discovery.removeFilter').replace('{filter}', entry.label));
        const close = node('span', 'discovery-remove', '×'); close.setAttribute('aria-hidden', 'true'); b.append(close); active.append(b);
      }
      if (entries.length) active.append(button(t('discovery.reset'), () => {
        for (const [key, value] of Object.entries(defaults)) if (key !== 'sort') state[key] = Array.isArray(value) ? value.slice() : value;
        if (config.resetExtra) config.resetExtra(); search.value = ''; tagQuery = ''; tagSearch.value = '';
        refresh(); config.onChange('reset'); search.focus();
      }, 'discovery-reset'));
      active.hidden = !entries.length;
      if (restoreFocus) (active.querySelector('button') || summary).focus();
    }
    function refresh() {
      for (const [key, value] of fields) value.input.value = state[key];
      for (const b of smartRail.querySelectorAll('[data-smart]')) b.setAttribute('aria-pressed', String(b.dataset.smart === state.smart));
      for (const b of toggles.querySelectorAll('[data-toggle]')) b.setAttribute('aria-pressed', String(!!state[b.dataset.toggle]));
      renderTags(); refreshActive();
    }
    refresh();
    return { node: shell, search, sort: fields.get('sort').input, disclosure, refresh, reset() { active.querySelector('.discovery-reset')?.click(); } };
  }
  root.CatalogDiscoveryUI = Object.freeze({ create });
})(window);
