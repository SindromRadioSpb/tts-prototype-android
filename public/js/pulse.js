(function () {
  "use strict";
  var status = document.getElementById("pulseStatus");
  var counter = document.getElementById("visitCounter");
  var note = document.getElementById("metricNote");
  var button = document.getElementById("pulseRefresh");
  var formatter = new Intl.NumberFormat("ru-RU");

  function setStatus(state, label) {
    status.dataset.state = state;
    status.querySelector("b").textContent = label;
  }
  function render(data) {
    ["today", "days7", "days30", "all"].forEach(function (period) {
      var node = counter.querySelector('[data-period="' + period + '"]');
      var value = data.periods && data.periods[period] && data.periods[period].visits;
      node.textContent = Number.isFinite(value) ? formatter.format(value) : "—";
    });
    counter.setAttribute("aria-busy", "false");
    note.textContent = data.definition + " Обновлено: " + new Date(data.generated_at).toLocaleString("ru-RU") + ".";
    setStatus("ready", "Umami подключён");
  }
  function load() {
    button.disabled = true;
    setStatus("loading", "Обновление");
    var preview = new URLSearchParams(location.search).get("preview") === "1" ? "?preview=1" : "";
    fetch("/api/product-pulse/v1/dashboard" + preview, { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || "SOURCE_UNAVAILABLE");
          return body;
        });
      })
      .then(render)
      .catch(function (error) {
        counter.setAttribute("aria-busy", "false");
        note.textContent = error.message === "PRODUCT_PULSE_NOT_CONFIGURED"
          ? "Umami ещё не настроен. Значения не заменены нулями."
          : "Источник аналитики временно недоступен. Последние значения не выдаются за актуальные.";
        setStatus("error", error.message === "PRODUCT_PULSE_NOT_CONFIGURED" ? "Не настроено" : "Источник недоступен");
      })
      .finally(function () { button.disabled = false; });
  }
  button.addEventListener("click", load);
  load();
  setInterval(load, 60000);
})();
