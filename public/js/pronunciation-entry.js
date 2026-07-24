(function () {
  "use strict";
  var ids = ["btnPronunciationLab", "v3IdePronunciationBtn"];
  function setVisible(visible) {
    ids.forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.hidden = !visible;
    });
  }
  setVisible(false);
  if (typeof fetch !== "function") return;
  fetch("/api/client-config", { cache: "no-store", credentials: "same-origin" })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (body) { setVisible(!!(body && body.flags && body.flags.c1ExperimentalEnabled === true)); })
    .catch(function () { setVisible(false); });
})();
