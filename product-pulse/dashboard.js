"use strict";
const { EVENT_DEFINITIONS, PROPERTY_DEFINITIONS, CONTRACT_REVISION } = require("./contract");
const PERIODS = ["today", "days7", "days30"];
const MATERIAL_EVENTS = ["material_open", "material_started", "material_engaged"];
const BREAKDOWN_PROPERTIES = ["surface", "entry_point", "material_collection"];
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
      usage: () => client.read("metrics/expanded", start, end, { type: "event", limit: "16" }),
      previous: () => client.read("metrics/expanded", Math.max(0, start - (end - start)), start - 1, { type: "event", limit: "16" }),
      recent: () => client.read("metrics/expanded", end - 300000, end, { type: "event", limit: "16" }),
    };
    const operations = PROPERTY_DEFINITIONS.find(x => x.name === "operation").values;
    const results = PROPERTY_DEFINITIONS.find(x => x.name === "result").values;
    for (const operation of operations) for (const result of results) {
      queries[`${operation}:${result}`] = () => client.read("event-data/values", start, end, {
        event: "eq.operation_result", propertyName: "app_version", path: `eq./pulse-v2/operations/${operation}/${result}`,
      });
    }
    for (const property of BREAKDOWN_PROPERTIES) for (const event of MATERIAL_EVENTS) {
      queries[`breakdown:${property}:${event}`] = () => client.read("event-data/values", start, end, {
        event: `eq.${event}`, propertyName: property,
      });
    }
    queries["breakdown:material_media:material_open"] = () => client.read("event-data/values", start, end, {
      event: "eq.material_open", propertyName: "material_media",
    });
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
    const ratios = [["study_started", "app_open"], ["study_engaged", "study_started"]].map(([numerator, denominator]) => {
      const n = usage.find(x => x.name === numerator).value, d = usage.find(x => x.name === denominator).value;
      return { name: `${numerator}/${denominator}`, title: { study_started: "Начали / открыли", study_engaged: "Вовлеклись / начали", study_completed: "Завершили чтение / открыли материал" }[numerator], numerator: n,
        ...metric(n == null || !d ? null : Math.round(n / d * 1000) / 10,
          `Отношение числа событий ${numerator} / ${denominator}; не когортная конверсия людей, возможны границы периода и повторения.`, { event: denominator, value: d }) };
    });
    function breakdownMetric(property, eventName, value) {
      const rows = raw[`breakdown:${property}:${eventName}`], allowed = PROPERTY_DEFINITIONS.find(x => x.name === property).values;
      const eventTotal = usage.find(x => x.name === eventName)?.value;
      if (!Array.isArray(rows)) return metric(null, `События ${eventName}, где ${property}=${value}.`);
      const valid = rows.every(row => typeof row.value === "string" && allowed.includes(row.value) && count(row.total) != null);
      const covered = valid ? rows.reduce((sum, row) => sum + count(row.total), 0) : null;
      const row = valid ? rows.find(item => item.value === value) : null;
      const partial = !valid || eventTotal == null || covered !== eventTotal;
      return metric(valid ? (row ? count(row.total) : 0) : null,
        `Количество ${eventName} в закрытой категории ${property}=${value}; raw slug, URL, ID и название не собираются.`,
        null, partial);
    }
    const material_breakdowns = BREAKDOWN_PROPERTIES.map(property => {
      const def = PROPERTY_DEFINITIONS.find(x => x.name === property);
      const values = property === "surface" ? ["studio", "reading_room"] : def.values;
      return { property, definition: def.definition, source: "umami", timezone: "UTC", freshness: meta.freshness,
        rows: values.map(value => {
          const open = breakdownMetric(property, "material_open", value), started = breakdownMetric(property, "material_started", value), engaged = breakdownMetric(property, "material_engaged", value);
          return { value, open, started, engaged,
            rate: metric(open.value == null || engaged.value == null || !open.value ? null : Math.round(engaged.value / open.value * 1000) / 10,
              `Отношение material_engaged / material_open для ${property}=${value}; не когортная конверсия людей.`, { event: "material_open", value: open.value }, open.state === "partial" || engaged.state === "partial") };
        }) };
    });
    const mediaDef = PROPERTY_DEFINITIONS.find(x => x.name === "material_media");
    const material_media = { property: "material_media", definition: mediaDef.definition, source: "umami", timezone: "UTC", freshness: meta.freshness,
      rows: mediaDef.values.map(value => ({ value, open: breakdownMetric("material_media", "material_open", value) })) };
    const roomOpen = material_breakdowns.find(group => group.property === "surface").rows.find(row => row.value === "reading_room").open;
    const completed = usage.find(row => row.name === "study_completed").value;
    ratios.push({ name: "study_completed/reading_room_material_open", title: "Завершили чтение / открыли в Зале", numerator: completed,
      ...metric(completed == null || roomOpen.value == null || !roomOpen.value ? null : Math.round(completed / roomOpen.value * 1000) / 10,
        "Отношение study_completed / material_open только для surface=reading_room; не включает открытия Студии и не является когортной конверсией людей.",
        { event: "reading_room material_open", value: roomOpen.value }, roomOpen.state === "partial") });
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
    const breakdownMetrics = material_breakdowns.flatMap(group => group.rows.flatMap(row => [row.open, row.started, row.engaged])).concat(material_media.rows.map(row => row.open));
    const metrics = [...usage, ...traffic, ...recent, ...reliability, ...breakdownMetrics];
    const available = metrics.filter(x => x.state !== "unavailable").length;
    return { ok: true, contract_revision: CONTRACT_REVISION, ...meta, generated_at: new Date(end).toISOString(), period,
      state: !available ? "unavailable" : available < metrics.length || metrics.some(x => x.state === "partial") ? "partial" : "available",
      usage, ratios, traffic, recent, reliability, material_breakdowns, material_media,
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
