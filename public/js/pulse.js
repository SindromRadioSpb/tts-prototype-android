(function () {
  "use strict";
  var status = document.getElementById("pulseStatus");
  var counter = document.getElementById("visitCounter");
  var note = document.getElementById("metricNote");
  var button = document.getElementById("pulseRefresh");
  var contractVersion = document.getElementById("contractVersion");
  var contractState = document.getElementById("contractState");
  var eventList = document.getElementById("eventList");
  var propertyList = document.getElementById("propertyList");
  var envelopeFields = document.getElementById("envelopeFields");
  var forbiddenFields = document.getElementById("forbiddenFields");
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
  function appendTextElement(parent, tagName, className, value) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }
  function renderContract(data) {
    var contract = data && data.contract;
    if (!contract || !Array.isArray(contract.events) || !Array.isArray(contract.properties)) {
      throw new Error("CONTRACT_INVALID");
    }
    contractVersion.textContent = String(contract.schema_version);
    contractState.textContent = contract.events.length + " событий · " + contract.properties.length + " свойств";
    contractState.dataset.state = "ready";
    eventList.textContent = "";
    contract.events.forEach(function (item, index) {
      var card = document.createElement("article");
      card.className = "event-card";
      var top = document.createElement("div");
      top.className = "event-top";
      appendTextElement(top, "span", "event-number", String(index + 1).padStart(2, "0"));
      appendTextElement(top, "code", "event-name", item.name);
      var badge = appendTextElement(top, "span", "event-badge", item.collection === "automatic" ? "Подключено" : "Точка интеграции");
      badge.dataset.collection = item.collection;
      card.appendChild(top);
      appendTextElement(card, "h3", "", item.title);
      appendTextElement(card, "p", "", item.definition);
      appendTextElement(card, "p", "event-trigger", item.trigger);
      appendTextElement(card, "p", "event-properties", "Смысловые свойства: " + (item.properties_used || []).join(", "));
      eventList.appendChild(card);
    });

    propertyList.textContent = "";
    contract.properties.forEach(function (item) {
      var row = document.createElement("div");
      appendTextElement(row, "code", "", item.name);
      appendTextElement(row, "p", "", item.definition);
      var constraint = item.values ? item.values.join(" · ") : item.format;
      appendTextElement(row, "small", "", (item.required ? "Обязательное" : "Опциональное") + " · " + constraint);
      propertyList.appendChild(row);
    });
    envelopeFields.textContent = (contract.envelope || []).join(" · ");
    forbiddenFields.textContent = (contract.forbidden || []).join(" · ");
  }
  function requestJson(url) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || "SOURCE_UNAVAILABLE");
        return body;
      });
    });
  }
  function loadDashboard(preview) {
    return requestJson("/api/product-pulse/v1/dashboard" + preview)
      .then(render)
      .catch(function (error) {
        counter.setAttribute("aria-busy", "false");
        note.textContent = error.message === "PRODUCT_PULSE_NOT_CONFIGURED"
          ? "Umami ещё не настроен. Значения не заменены нулями."
          : "Источник аналитики временно недоступен. Последние значения не выдаются за актуальные.";
        setStatus("error", error.message === "PRODUCT_PULSE_NOT_CONFIGURED" ? "Не настроено" : "Источник недоступен");
      });
  }
  function loadContract(preview) {
    return requestJson("/api/product-pulse/v1/contract" + preview)
      .then(renderContract)
      .catch(function () {
        contractState.textContent = "Контракт недоступен";
        contractState.dataset.state = "error";
      });
  }
  function load() {
    button.disabled = true;
    setStatus("loading", "Обновление");
    var preview = new URLSearchParams(location.search).get("preview") === "1" ? "?preview=1" : "";
    Promise.all([loadDashboard(preview), loadContract(preview)])
      .finally(function () { button.disabled = false; });
  }
  button.addEventListener("click", load);
  load();
  setInterval(load, 60000);
})();
