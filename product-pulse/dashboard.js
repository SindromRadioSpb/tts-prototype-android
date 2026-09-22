"use strict";
const { EVENT_DEFINITIONS, PROPERTY_DEFINITIONS, CONTRACT_REVISION } = require("./contract");
const PERIODS = ["today", "days7", "days30"];
// PostgreSQL SUM(bigint) in Umami expanded metrics is serialized as a string.
// Accept only exact non-negative integers, never coerce null/blank/missing to 0.
const count = value => {
  if (typeof value === "string" && /^(0|[1-9]\d{0,15})$/.test(value)) value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
};
function createDashboard(client, { now = Date.now, ttl = 30000 } = {}) {
  const cache = new Map(), pending = new Map();
  let running = 0; const queue = [];
  async function limited(task) {
    if (running >= 3) await new Promise(resolve => queue.push(resolve));
    running++;
    try { return await task(); } finally { running--; const next = queue.shift(); if (next) next(); }
  }
  async function build(period) {
    const end = now(), date = new Date(end);
    const start = period === "today" ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) : end - (period === "days30" ? 30 : 7) * 86400000;
    const queries = {
      traffic: () => client.stats(start, end),
      usage: () => client.read("metrics/expanded", start, end, { type: "event", limit: "8" }),
      previous: () => client.read("metrics/expanded", Math.max(0, start - (end - start)), start - 1, { type: "event", limit: "8" }),
      recent: () => client.read("metrics/expanded", end - 300000, end, { type: "event", limit: "8" }),
    };
    const operations = PROPERTY_DEFINITIONS.find(x => x.name === "operation").values;
    const results = PROPERTY_DEFINITIONS.find(x => x.name === "result").values;
    for (const operation of operations) for (const result of results) {
      queries[`${operation}:${result}`] = () => client.read("event-data/values", start, end, {
        event: "eq.operation_result", propertyName: "app_version", path: `eq./pulse-v2/operations/${operation}/${result}`,
      });
    }
    const entries = await Promise.all(Object.entries(queries).map(async ([key, task]) => {
      try { return [key, await limited(task)]; } catch (_) { return [key, null]; }
    }));
    const raw = Object.fromEntries(entries);
    const meta = { source: "umami", timezone: "UTC", freshness: "cache_max_30_seconds; poll_60_seconds", observed_at: new Date(end).toISOString(), start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() };
    function metric(value, definition, denominator = null, partial = false) {
      return { ...meta, value, definition, denominator, state: value == null ? "unavailable" : partial ? "partial" : value === 0 ? "available zero" : "available" };
    }
    function eventValue(rows, name, field) {
      if (!Array.isArray(rows) || rows.some(x => !EVENT_DEFINITIONS.some(e => e.name === x.name) || count(x[field]) == null)) return null;
      const row = rows.find(x => x.name === name);
      return row ? count(row[field]) : 0;
    }
    const usage = EVENT_DEFINITIONS.map(event => ({ name: event.name, title: event.title,
      ...metric(eventValue(raw.usage, event.name, "pageviews"), event.trigger),
      sessions: eventValue(raw.usage, event.name, "visitors"),
      previous: eventValue(raw.previous, event.name, "pageviews"),
    }));
    const ratios = [["study_started", "app_open"], ["study_engaged", "study_started"], ["study_completed", "material_open"]].map(([numerator, denominator]) => {
      const n = usage.find(x => x.name === numerator).value, d = usage.find(x => x.name === denominator).value;
      return { name: `${numerator}/${denominator}`, title: { study_started: "Начали / открыли", study_engaged: "Вовлеклись / начали", study_completed: "Завершили чтение / открыли материал" }[numerator], numerator: n,
        ...metric(n == null || !d ? null : Math.round(n / d * 1000) / 10,
          `Отношение числа событий ${numerator} / ${denominator}; не когортная конверсия людей, возможны границы периода и повторения.`, { event: denominator, value: d }) };
    });
    const reliability = [];
    for (const operation of operations) for (const result of results) {
      const rows = raw[`${operation}:${result}`];
      const valid = Array.isArray(rows) && rows.every(x => typeof x.value === "string" && /^(\d{1,4}\.\d{1,4}\.\d{1,6}|unknown)$/.test(x.value) && count(x.total) != null);
      if (!valid || !rows.length) reliability.push({ operation, result, app_version: null, ...metric(valid ? 0 : null, "Количество завершённых серверных запросов по операции, HTTP-итогу и версии.") });
      else rows.forEach(row => reliability.push({ operation, result, app_version: row.value, ...metric(count(row.total), "Количество завершённых серверных запросов по операции, HTTP-итогу и версии.", null, rows.length >= 100) }));
    }
    const recent = ["study_started", "study_engaged"].map(name => ({ name,
      ...metric(eventValue(raw.recent, name, "visitors"), `Сессии с событием ${name} за последние 5 минут; не онлайн и не heartbeat. Счётчики пересекаются, не суммировать.`),
      start_at: new Date(end - 300000).toISOString(),
    }));
    const traffic = ["visits", "visitors", "pageviews"].map(name => ({ name, ...metric(count(raw.traffic && raw.traffic[name]), {
      visits: "Уникальные Umami visit_id среди pageviews. При нашей доставке без cache-header ID меняется по часовой соли Umami.",
      visitors: "Уникальные Umami session_id среди pageviews; это технические сессии, не люди.",
      pageviews: "Pageview создаётся только для app_open; named events считаются отдельно.",
    }[name]), previous: count(raw.traffic && raw.traffic.comparison && raw.traffic.comparison[name]) }));
    const metrics = [...usage, ...traffic, ...recent, ...reliability];
    const available = metrics.filter(x => x.state !== "unavailable").length;
    return { ok: true, contract_revision: CONTRACT_REVISION, ...meta, generated_at: new Date(end).toISOString(), period,
      state: !available ? "unavailable" : available < metrics.length || metrics.some(x => x.state === "partial") ? "partial" : "available",
      usage, ratios, traffic, recent, reliability,
      retention: { state: "unavailable", definition: "Не измеряется: ключ сессии не связывает возвращения человека между днями/устройствами." },
      releases: { state: "partial", definition: "Версии видны в результатах операций; временные deployment markers пока не подключены. Предыдущий период равной длительности, без причинного вывода о релизе." },
      acquisition: { state: "unavailable", definition: "Google Search Console / Bing подключены владельцем; данные ещё не получены. Отдельный будущий источник, не часть visits." },
      uptime: { state: "unavailable", definition: "Внешний UptimeRobot указан в ops-runbook; read-интеграция не подключена. Этот сервер не доказывает собственную полную недоступность." },
    };
  }
  return async function dashboard(period = "days7") {
    if (!PERIODS.includes(period)) throw new Error("PERIOD_INVALID");
    const item = cache.get(period);
    if (item && now() - item.at < ttl) return item.value;
    if (pending.has(period)) return pending.get(period);
    const promise = build(period).then(value => { cache.set(period, { at: now(), value }); return value; }).finally(() => pending.delete(period));
    pending.set(period, promise); return promise;
  };
}
module.exports = { createDashboard, PERIODS };
