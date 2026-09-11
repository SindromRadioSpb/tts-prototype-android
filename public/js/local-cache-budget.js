// Бюджет для кеша в localStorage. Кеш — не владелец хранилища: он обязан жить в своей квоте и
// уступать место, а не занимать всё и молча терять записи.
//
// Найдено у владельца 2026-09-11: `ttsDashboard_v3_library_cache_v1:*` вырос до 142 ключей и
// ~10 МБ (потолок Chrome ≈ 5 M символов), после чего ЛЮБАЯ запись в localStorage — включая чужие,
// не кешевые — падала QuotaExceededError. Писатель кеша ловил ошибку пустым catch, поэтому
// переполнение не проявляло себя ничем, кроме чужих необъяснимых сбоев.
//
// Размеры считаются в СИМВОЛАХ (String#length): именно их считает квота Chrome (UTF-16),
// и только их можно померить, не сериализуя хранилище целиком.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LocalCacheBudget = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var INDEX_SUFFIX = "__budget_index_v1";

  function indexKey(prefix) { return String(prefix) + INDEX_SUFFIX; }
  function isQuotaError(error) {
    if (!error) return false;
    var name = String(error.name || ""), code = Number(error.code);
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
  }
  function ownKeys(storage, prefix) {
    var out = [], index = indexKey(prefix);
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (typeof key === "string" && key.indexOf(prefix) === 0 && key !== index) out.push(key);
    }
    return out;
  }
  function charsOf(storage, key) {
    var value = storage.getItem(key);
    return value == null ? 0 : key.length + String(value).length;
  }
  function readIndex(storage, prefix) {
    try {
      var parsed = JSON.parse(storage.getItem(indexKey(prefix)) || "null");
      if (!parsed || !Array.isArray(parsed.entries)) return {};
      var map = {};
      parsed.entries.forEach(function (entry) {
        if (entry && typeof entry.k === "string" && Number.isFinite(Number(entry.t))) map[entry.k] = Number(entry.t);
      });
      return map;
    } catch (_) { return {}; }
  }
  function writeIndex(storage, prefix, recency) {
    var entries = Object.keys(recency).map(function (k) { return { k: k, t: recency[k] }; });
    // Индекс — вспомогательная запись: его потеря не обязана валить основную. Живой кеш без индекса
    // просто становится «неизвестного возраста» и уходит первым (см. порядок вытеснения).
    try { storage.setItem(indexKey(prefix), JSON.stringify({ v: 1, entries: entries })); return true; }
    catch (_) { return false; }
  }
  // Порядок вытеснения: сперва записи НЕИЗВЕСТНОГО возраста (осиротевшие от старых версий или
  // потерявшие индекс), затем самые старые известные. Свежая запись уходит последней.
  function evictionOrder(storage, prefix, recency, keep) {
    var keys = ownKeys(storage, prefix).filter(function (key) { return key !== keep; });
    return keys.sort(function (a, b) {
      var ta = Object.prototype.hasOwnProperty.call(recency, a) ? recency[a] : -Infinity;
      var tb = Object.prototype.hasOwnProperty.call(recency, b) ? recency[b] : -Infinity;
      return ta - tb;
    });
  }
  function usage(storage, options) {
    var prefix = String((options || {}).prefix || ""), keys = ownKeys(storage, prefix), chars = 0;
    for (var i = 0; i < keys.length; i++) chars += charsOf(storage, keys[i]);
    return { entries: keys.length, chars: chars };
  }

  function save(storage, options) {
    var opts = options || {};
    var prefix = String(opts.prefix || ""), key = String(opts.key || ""), value = String(opts.value == null ? "" : opts.value);
    var maxEntries = Math.max(1, Number(opts.maxEntries) || 1), maxChars = Math.max(1, Number(opts.maxChars) || 1);
    var now = Number(opts.now) || Date.now(), evicted = [];
    if (key.indexOf(prefix) !== 0) return { ok: false, reason: "KEY_OUTSIDE_PREFIX", evicted: evicted };
    var cost = key.length + value.length;
    // Одна запись больше всего бюджета: отказываем ЧЕСТНО и не платим за это уже накопленным кешем.
    if (cost > maxChars) return { ok: false, reason: "ENTRY_TOO_LARGE", evicted: evicted };

    var recency = readIndex(storage, prefix);
    var order = evictionOrder(storage, prefix, recency, key);
    var others = usage(storage, { prefix: prefix }).chars - charsOf(storage, key);
    var count = ownKeys(storage, prefix).filter(function (k) { return k !== key; }).length;
    function drop() {
      var victim = order.shift();
      if (!victim) return false;
      others -= charsOf(storage, victim); count -= 1;
      try { storage.removeItem(victim); } catch (_) {}
      delete recency[victim]; evicted.push(victim);
      return true;
    }
    while ((others + cost > maxChars || count + 1 > maxEntries) && drop()) { /* освобождаем место */ }

    for (;;) {
      try {
        storage.setItem(key, value);
        recency[key] = now;
        writeIndex(storage, prefix, recency);
        return { ok: true, reason: null, evicted: evicted };
      } catch (error) {
        // Место кончилось у ВСЕГО хранилища (заняли другие ключи). Освобождаем только своё —
        // кеш не имеет права удалять чужие записи ради себя.
        if (!isQuotaError(error) || !drop()) {
          try { storage.removeItem(indexKey(prefix)); } catch (_) {}
          writeIndex(storage, prefix, recency);
          return { ok: false, reason: isQuotaError(error) ? "QUOTA_EXCEEDED" : "WRITE_FAILED", evicted: evicted };
        }
      }
    }
  }

  // Лечение браузера, который вырос ДО появления бюджета: привести префикс к бюджету на загрузке.
  function prune(storage, options) {
    var opts = options || {};
    var prefix = String(opts.prefix || "");
    var maxEntries = Math.max(0, Number(opts.maxEntries) || 0), maxChars = Math.max(0, Number(opts.maxChars) || 0);
    var recency = readIndex(storage, prefix);
    var order = evictionOrder(storage, prefix, recency, null);
    var state = usage(storage, { prefix: prefix }), removed = [], freed = 0;
    while ((state.chars > maxChars || state.entries > maxEntries) && order.length) {
      var victim = order.shift(), cost = charsOf(storage, victim);
      try { storage.removeItem(victim); } catch (_) { continue; }
      delete recency[victim]; removed.push(victim); freed += cost;
      state.chars -= cost; state.entries -= 1;
    }
    if (removed.length) writeIndex(storage, prefix, recency);
    return { removed: removed, freedChars: freed, entries: state.entries, chars: state.chars };
  }

  return { indexKey: indexKey, usage: usage, save: save, prune: prune, isQuotaError: isQuotaError };
});
