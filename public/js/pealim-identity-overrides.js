// Narrow, versioned identity corrections for known legacy Pealim metadata.
(function () {
  "use strict";
  var URL = "/data/inflection/pealim-pos-overrides.v1.json?rev=1";
  var _map = null;
  var _loading = null;
  function ensureReady() {
    if (_map) return Promise.resolve(_map);
    if (_loading) return _loading;
    _loading = fetch(URL, { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) { _map = data && data.overrides ? data.overrides : {}; return _map; })
      .catch(function () { _map = {}; return _map; });
    return _loading;
  }
  function lookupByPealimId(id) {
    if (!_map || id == null) return null;
    var entry = _map[String(id)];
    return entry ? Object.assign({ pealim_id: String(id) }, entry) : null;
  }
  window.PealimIdentityOverrides = { ensureReady: ensureReady, lookupByPealimId: lookupByPealimId, isReady: function () { return !!_map; } };
})();
