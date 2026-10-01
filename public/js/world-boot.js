/* Worlds boot: one-time Sukkot trial defaults, then preserve the learner choice. */
(function () {
  "use strict";
  var ENGINE_URL = "/js/world-engine.js?v=715"; // lockstep with the sw.js precache key
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
  var wanted = true;
  try {
    // One-time owner-requested trial rollout. Later user choices remain authoritative.
    if (localStorage.getItem("lp_world_sukkot_trial_v1") !== "1") {
      localStorage.setItem("lp_world_v1", JSON.stringify({ id: "sukkot", mode: "live", paused: false, lighting: "day" }));
      localStorage.setItem("lp_world_sukkot_trial_v1", "1");
    }
    var raw = localStorage.getItem("lp_world_v1");
    var classic = false;
    try { classic = !!raw && JSON.parse(raw).id === "classic"; } catch (_) {}
    wanted = !classic || /[?&]world=off\b/.test(location.search);
  } catch (_) {}
  if (wanted) load().catch(function () {});
})();
