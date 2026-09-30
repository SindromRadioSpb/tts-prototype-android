/*
 * LinguistPro Worlds — boot stub (the only world code every shell loads).
 * Loads the full engine (/js/world-engine.js) only when this device has a world chosen, the
 * user opens the «Оформление» picker, or ?world=off must clear a choice. Classic pays for this
 * file alone: no engine, no renderer, no skin, no art, no timers.
 */
(function () {
  "use strict";
  var ENGINE_URL = "/js/world-engine.js?v=707"; // lockstep with the sw.js precache key
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = ENGINE_URL; s.async = true; s.setAttribute("data-world-ui", "");
      s.onload = function () { window.LPWorld && window.LPWorld.boot ? resolve(window.LPWorld) : reject(new Error("world engine missing")); };
      s.onerror = function () { loading = null; reject(new Error("world engine load failed")); };
      document.head.appendChild(s);
    });
    return loading;
  }
  var stub = {
    stub: true,
    load: load,
    openPicker: function () { return load().then(function (w) { return w.openPicker(); }); },
    current: function () { return null; }
  };
  window.LPWorld = stub;
  var wanted = false;
  try { wanted = !!localStorage.getItem("lp_world_v1") || /[?&]world=off\b/.test(location.search); } catch (_) {}
  if (wanted) load().catch(function () {});
})();
