// i18n core module
// API: window.t(key), window.appSetLocale(code), window.appGetLocale(), window.applyI18n()
(function () {
  var SUPPORTED = ['ru', 'en', 'he'];
  var DEFAULT = 'ru';
  var STORAGE_KEY = 'app.locale';
  var _locale = DEFAULT;

  function _resolve(locale, key) {
    var parts = key.split('.');
    var obj = window.I18N_LOCALES && window.I18N_LOCALES[locale];
    if (!obj) return undefined;
    for (var i = 0; i < parts.length; i++) {
      if (obj === null || obj === undefined) return undefined;
      obj = obj[parts[i]];
    }
    return typeof obj === 'string' ? obj : undefined;
  }

  function t(key, params) {
    var val = _resolve(_locale, key);
    if (val === undefined) {
      val = _resolve(DEFAULT, key);
    }
    if (val === undefined) {
      if (typeof console !== 'undefined') {
        console.debug('[i18n] missing key:', key, 'locale:', _locale);
      }
      return key;
    }
    if (params) {
      return val.replace(/\{(\w+)\}/g, function (_, k) {
        return params[k] !== undefined ? String(params[k]) : '{' + k + '}';
      });
    }
    return val;
  }

  function appGetLocale() {
    return _locale;
  }

  function appSetLocale(code) {
    if (SUPPORTED.indexOf(code) === -1) {
      console.warn('[i18n] unsupported locale:', code, '— falling back to', DEFAULT);
      code = DEFAULT;
    }
    _locale = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}

    document.documentElement.lang = code;
    document.documentElement.dir = code === 'he' ? 'rtl' : 'ltr';

    // Sync both language selectors
    ['appLangSelect', 'appLangSelectIde'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = code;
    });

    applyI18n();

    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { locale: code } }));
  }

  function applyI18n() {
    // Resilience: t() returns the key itself when the key is missing (e.g. a
    // stale service-worker-cached locale that predates a newly-shipped key).
    // In that case DON'T overwrite the element — keep the hardcoded HTML
    // fallback text/attribute instead of surfacing a raw key like
    // "classic.navLibrary" to the user. Real translations never equal their
    // dotted key, so this guard is safe.
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (val !== key) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var val = t(key);
      if (val !== key) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = t(key);
      if (val !== key) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var val = t(key);
      if (val !== key) el.title = val;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria-label');
      var val = t(key);
      if (val !== key) el.setAttribute('aria-label', val);
    });
  }

  // Load saved locale (safe fallback)
  function _loadSaved() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return DEFAULT;
  }

  // Initialize
  _locale = _loadSaved();
  document.documentElement.lang = _locale;
  document.documentElement.dir = _locale === 'he' ? 'rtl' : 'ltr';

  // Apply on DOM ready (scripts load after static HTML in body)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyI18n);
  } else {
    applyI18n();
  }

  // Export globals
  window.t = t;
  window.appGetLocale = appGetLocale;
  window.appSetLocale = appSetLocale;
  window.applyI18n = applyI18n;
})();
