/* Worlds boot: Classic by default; load the engine only for a world the learner chose. */
(function () {
  "use strict";
  var ENGINE_URL = "/js/world-engine.js?v=882"; // lockstep with the sw.js precache key
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
  function storedId() {
    try { var raw = localStorage.getItem("lp_world_v1"); return raw ? JSON.parse(raw).id : null; } catch (_) { return null; }
  }
  try {
    // Owner decision 2026-11-08: Classic is the default (weak phones during public testing).
    // Once per device, undo the 2026-10-06 Memorial trial, which stored Memorial everywhere.
    if (localStorage.getItem("lp_world_classic_default_v1") !== "1") {
      if (storedId() === "memorial-three-scenes") localStorage.setItem("lp_world_v1", JSON.stringify({ id: "classic" }));
      localStorage.setItem("lp_world_classic_default_v1", "1");
    }
    var id = storedId();
    wanted = (!!id && id !== "classic") || /[?&]world=off\b/.test(location.search);
  } catch (_) {}
  if (wanted) load().catch(function () {});
})();
