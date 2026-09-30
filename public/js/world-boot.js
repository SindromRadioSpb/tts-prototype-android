/*
 * LinguistPro Worlds — boot stub (the only world code every shell loads).
 * The election world is ON by default (owner decision 2026-09-30): the engine loads unless this
 * device explicitly chose Classic. A Classic device pays for this file alone: no engine, no
 * renderer, no skin, no art, no timers — until the user opens the «Оформление» picker.
 */
(function () {
  "use strict";
  var ENGINE_URL = "/js/world-engine.js?v=711"; // lockstep with the sw.js precache key
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
  // The election world is on by default: load the engine unless this device explicitly chose
  // Classic ({"id":"classic"}). ?world=off also needs the engine, to record that choice.
  var wanted = true;
  try {
    var raw = localStorage.getItem("lp_world_v1");
    var classic = false;
    try { classic = !!raw && JSON.parse(raw).id === "classic"; } catch (_) {}
    wanted = !classic || /[?&]world=off\b/.test(location.search);
  } catch (_) {}
  if (wanted) load().catch(function () {});
})();
