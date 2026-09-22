(function () {
  "use strict";
  var $ = function(id) { return document.getElementById(id); };
  var labels = { available: "Доступно", "available zero": "Доступно: 0", unavailable: "Недоступно", partial: "Частичные данные", loading: "Загрузка" };
  var fmt = new Intl.NumberFormat("ru-RU");
  var busy = false, generation = 0;
  function add(parent, tag, text, cls) {
    var node = document.createElement(tag); node.textContent = text;
    if (cls) node.className = cls; parent.appendChild(node); return node;
  }
  function value(m) { return m && Number.isFinite(m.value) ? fmt.format(m.value) : "—"; }
  function status(state, text) { $("pulseStatus").dataset.state = state; $("pulseStatus").querySelector("b").textContent = text; }
  function cards(id, rows) {
    var host = $(id); host.textContent = "";
    rows.forEach(function(m) {
      var card = add(host, "article", "", "metric-card"); card.dataset.state = m.state;
      add(card, "h3", m.title || m.name); add(card, "strong", value(m), "metric-value");
      add(card, "small", labels[m.state] || m.state);
      if (Object.hasOwn(m, "previous")) add(card, "p", "Предыдущий период: " + (Number.isFinite(m.previous) ? fmt.format(m.previous) : "—"));
      var detail = m.source ? add(card, "details", "") : card;
      if (m.source) add(detail, "summary", "Определение и источник");
      add(detail, "p", m.definition);
      if (m.denominator) add(card, "p", "Знаменатель: " + m.denominator.event + " = " + (m.denominator.value == null ? "—" : m.denominator.value) + ". Значение в %.");
      if (m.source) add(detail, "small", m.source + " · UTC · " + m.start_at + " — " + m.end_at + " · снимок " + m.observed_at + " · кэш ≤30 с, опрос 60 с");
    });
  }
  function render(data) {
    (data.traffic || []).forEach(function(m) { var n = $("visitCounter").querySelector('[data-metric="' + m.name + '"]'); if(n) n.textContent = value(m); });
    $("visitCounter").setAttribute("aria-busy", "false");
    $("metricNote").textContent = (data.source === "preview" ? "Тестовый источник. " : "Umami · только schema v2. ") + "UTC · " + data.start_at + " — " + data.end_at + ". Снимок: " + data.generated_at + ". Кэш ≤30 с, опрос 60 с. Пропущенные offline/outage события не восстанавливаются.";
    cards("usageMetrics", data.usage || []); cards("ratioMetrics", data.ratios || []);
    cards("recentMetrics", (data.recent || []).map(function(m) { return Object.assign({},m,{title:m.name === "study_started" ? "Начали недавно" : "Достигли вовлечения недавно"}); }));
    cards("trafficDefinitions", data.traffic || []);
    cards("sourceLimits", ["retention","releases","acquisition","uptime"].map(function(k,i) { return Object.assign({title:["Возврат","Релизы","SEO","Внешняя доступность"][i]},data[k]); }));
    var host = $("reliabilityRows"); host.textContent = "";
    (data.reliability || []).forEach(function(m) { var tr = add(host,"tr",""); [m.operation,m.app_version || "—",m.result,value(m),labels[m.state]].forEach(function(v) { add(tr,"td",v); }); });
    var d = data.delivery_since_process_start;
    $("deliveryNote").textContent = "Источник Umami; период и свежесть указаны выше. Доля успеха рассчитывается только среди всех исходов одной операции и версии. " + (d ? "После старта процесса: доставлено " + d.delivered + ", недоступно " + d.unavailable + ", перегрузка " + d.saturated + ". Это не статистика всего периода." : "");
    status(data.state === "available" ? "ready" : "error", data.state === "available" ? "Источник доступен" : labels[data.state]);
  }
  function renderContract(data) {
    var c = data.contract;
    if (!c || !Array.isArray(c.events) || !Array.isArray(c.properties)) throw new Error("CONTRACT_INVALID");
    $("contractVersion").textContent = c.contract_revision + " · schema " + c.schema_version;
    $("contractState").textContent = c.events.length + " событий · " + c.properties.length + " свойств";
    $("contractState").dataset.state = "ready";
    $("transitionNote").textContent = "v1 принимается до " + c.transition.accept_until + " с прежней валидацией, но не доставляется в основную статистику. v2: строгие правила каждого события, только enum-свойства.";
    $("eventList").textContent = "";
    c.events.forEach(function(e,i) {
      var card=add($("eventList"),"article","","event-card"), top=add(card,"div","","event-top");
      add(top,"span",String(i+1).padStart(2,"0"),"event-number"); add(top,"code",e.name,"event-name");
      add(top,"span",{automatic:"Автоматически",integrated:"Подключено",reserved:"Резерв",deprecated:"Устарело"}[e.status],"event-badge");
      add(card,"h3",e.title); add(card,"p",e.definition);
      add(card,"p","Обязательные: "+e.required_properties.join(", ")+". Необязательные: "+(e.optional_properties.join(", ")||"нет"),"event-properties");
      add(card,"p","Запрещённые сочетания: "+JSON.stringify(e.forbidden_combinations),"event-properties");
      add(card,"p","Owner: "+e.owner+" · metric: "+e.metric+" · retention: "+e.retention_class+" · introduced: "+e.introduced_in,"event-properties");
      Object.keys(e.reserved_surfaces||{}).forEach(function(s){add(card,"p",s+" · reserved: "+e.reserved_surfaces[s],"event-trigger");});
    });
    $("propertyList").textContent="";
    c.properties.forEach(function(p){var row=add($("propertyList"),"div","");add(row,"code",p.name);add(row,"p",p.definition);add(row,"small",p.values.join(" · "));});
    $("envelopeFields").textContent=c.envelope.join(" · "); $("forbiddenFields").textContent=c.forbidden.join(" · ");
  }
  function request(url) {
    return fetch(url,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(30000)}).then(function(r){if(!r.ok)throw new Error("SOURCE_UNAVAILABLE");return r.json();});
  }
  function unavailable() {
    $("visitCounter").querySelectorAll("strong").forEach(function(n){n.textContent="—";});
    $("visitCounter").setAttribute("aria-busy","false");
    ["usageMetrics","ratioMetrics","recentMetrics","trafficDefinitions"].forEach(function(id){cards(id,[{title:"Источник недоступен",state:"unavailable",definition:"Значения прошлого ответа скрыты. Это не ноль."}]);});
    $("reliabilityRows").textContent=""; $("deliveryNote").textContent="Источник недоступен.";
    $("metricNote").textContent="Источник аналитики недоступен. Значения не заменены нулями.";
    status("error","Источник недоступен");
  }
  function load() {
    if(busy)return; busy=true; var token=++generation;
    $("pulseRefresh").disabled=true; $("pulsePeriod").disabled=true; status("loading","Обновление");
    var preview=new URLSearchParams(location.search).get("preview")==="1"?"preview=1&":"";
    Promise.all([
      request("/api/product-pulse/v1/dashboard?"+preview+"period="+$("pulsePeriod").value).then(function(d){if(token===generation)render(d);}).catch(unavailable),
      request("/api/product-pulse/v1/contract?"+preview).then(renderContract).catch(function(){$("contractState").textContent="Контракт недоступен";$("contractState").dataset.state="error";})
    ]).finally(function(){busy=false;$("pulseRefresh").disabled=false;$("pulsePeriod").disabled=false;});
  }
  $("pulseRefresh").addEventListener("click",load); $("pulsePeriod").addEventListener("change",load);
  load(); setInterval(function(){if(document.visibilityState==="visible")load();},60000);
})();
