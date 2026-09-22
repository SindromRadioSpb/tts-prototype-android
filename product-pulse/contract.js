"use strict";
const legacy = require("./legacy-contract");
const SCHEMA_VERSION = 2;
const CONTRACT_REVISION = "1.2";
const V1_UNTIL = "2026-09-29T00:00:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^(?:\d{1,4}\.\d{1,4}\.\d{1,6}|unknown)$/;
const ENVELOPE = ["schema_version", "event_id", "event_name", "occurred_at", "session_id", "app_version", "properties"];
const PROPERTY_DEFINITIONS = Object.freeze([
  { name: "surface", required: true, definition: "Поверхность приложения.", values: ["studio", "reading_room", "mediatheque", "study_video", "unknown"] },
  { name: "result", definition: "Канонический итог операции.", values: ["success", "failure", "cancelled"] },
  { name: "duration_bucket", definition: "Грубый диапазон длительности.", values: ["lt_30_sec", "30_sec_2_min", "2_5_min", "5_15_min", "15_30_min", "30_min_plus"] },
  { name: "operation", definition: "Серверный запрос синтеза или сборки таблицы; не вся пользовательская задача.", values: ["tts", "translate_table"] },
  { name: "media_kind", definition: "Тип открытого материала или проигрываемого медиа.", values: ["text", "audio", "video"] },
  { name: "entry_point", definition: "Закрытый маршрут входа в подтверждённо открытый материал; не URL и не referrer.", values: ["studio_library", "reading_room", "mediatheque"] },
  { name: "material_collection", definition: "Privacy-safe класс корпуса; неизвестные slug/id не передаются.", values: ["my_texts", "ben_yehuda", "materials_science_pb2", "public_study_songs", "physics_year1", "group_study_songs", "other_public_corpus", "other_group_corpus", "unknown"] },
  { name: "material_media", definition: "Наличие медиа в материале без имени, asset key, URL или video ID.", values: ["none", "audio", "video", "audio_video", "unknown"] },
].map(x => Object.freeze({ ...x, required: !!x.required, values: Object.freeze(x.values) })));
const specs = [
  ["app_open", "Открытие приложения", "automatic", ["surface"], [], "Один раз после загрузки документа поддерживаемой поверхности; повторная навигация — новое открытие.", "1.0"],
  ["material_open", "Открытие материала", "integrated", ["surface", "media_kind"], ["entry_point", "material_collection", "material_media"], "Студия или Читальный зал: материал успешно загрузил непустые строки и каноническая таблица отрисована.", "1.0"],
  ["material_started", "Начало работы с материалом", "automatic", ["surface", "entry_point", "material_collection", "material_media"], [], "Первое доверенное учебное действие после конкретного подтверждённого material_open; один раз на открытие материала.", "1.2"],
  ["material_engaged", "Вовлечение в материал", "automatic", ["surface", "entry_point", "material_collection", "material_media", "duration_bucket"], [], "30 секунд видимого сфокусированного активного времени после material_started; idle отсечён через 15 секунд; один раз на открытие материала.", "1.2"],
  ["study_started", "Начало занятия", "automatic", ["surface"], [], "Первое доверенное действие внутри учебной области на видимой сфокусированной странице; один раз на документ.", "1.0"],
  ["study_engaged", "Вовлечённое занятие", "automatic", ["surface", "duration_bucket"], [], "30 секунд видимого сфокусированного времени после начала; idle отсечён через 15 секунд без учебного действия. Один раз на документ.", "1.0"],
  ["study_completed", "Завершение чтения", "integrated", ["surface"], ["duration_bucket", "entry_point", "material_collection", "material_media"], "Только Читальный зал: подтверждённая запись «Прочитано» в карточке конца открытого текста. Не означает усвоения.", "1.0"],
  ["audio_engaged", "Воспроизведение медиа", "automatic", ["surface", "media_kind"], ["entry_point", "material_collection", "material_media"], "8 секунд фактического продвижения HTML audio/video на видимой сфокусированной странице; seek не учитывается; один раз на элемент и источник за документ.", "1.0"],
  ["operation_result", "Результат операции", "integrated", ["surface", "operation", "result", "duration_bucket"], [], "Серверный finish/close для POST /api/tts и /api/translate-table[-v2]. Один результат на запрос; 2xx=success, прочие=failure, преждевременный close=cancelled.", "1.0"],
];
const CONTEXT_KEYS = Object.freeze(["entry_point", "material_collection", "material_media"]);
const contextual = new Set(["material_open", "material_started", "material_engaged", "study_completed", "audio_engaged"]);
const EVENT_DEFINITIONS = Object.freeze(specs.map(([name, title, status, required, optional, trigger, introduced]) => Object.freeze({
  name, title, status, collection: status, definition: trigger, trigger,
  required_properties: Object.freeze(required), optional_properties: Object.freeze(optional),
  properties_used: Object.freeze([...required, ...optional]),
  required_property_groups: Object.freeze(contextual.has(name) && !["material_started", "material_engaged"].includes(name) ? [CONTEXT_KEYS] : []),
  forbidden_combinations: Object.freeze(name === "audio_engaged" ? [{ media_kind: "text" },
      { surface: "studio", entry_point: "reading_room" }, { surface: "studio", entry_point: "mediatheque" },
      { surface: "reading_room", entry_point: "studio_library" }] :
    name === "study_completed" ? [...PROPERTY_DEFINITIONS[0].values.filter(x => x !== "reading_room").map(surface => ({ surface })),
      { surface: "reading_room", entry_point: "studio_library" }] :
    ["material_open", "material_started", "material_engaged"].includes(name) ? [
      ...PROPERTY_DEFINITIONS[0].values.filter(x => !["studio", "reading_room"].includes(x)).map(surface => ({ surface })),
      { surface: "studio", entry_point: "reading_room" }, { surface: "studio", entry_point: "mediatheque" },
      { surface: "reading_room", entry_point: "studio_library" },
      ...(name === "material_engaged" ? [{ duration_bucket: "lt_30_sec" }] : []),
    ] :
    name === "study_engaged" ? [{ duration_bucket: "lt_30_sec" }] : []),
  reserved_surfaces: name === "material_open" ? { study_video: "Нет подтверждённой точки открытия", mediatheque: "Маршрут входа; фактическая работа происходит в Читальном зале" }
    : name === "study_completed" ? { studio: "Нет единой подтверждённой финальной точки", study_video: "Нет определённого финала занятия", mediatheque: "Каталог не является занятием" } : {},
  contract_revision: CONTRACT_REVISION, introduced_in: introduced, owner: "product", metric: name, retention_class: "pulse_90_days",
})));
const EVENT_NAMES = new Set(EVENT_DEFINITIONS.map(x => x.name));
const ALLOWED_PROPERTY_KEYS = new Set(PROPERTY_DEFINITIONS.map(x => x.name));
function contractManifest() {
  return { schema_version: SCHEMA_VERSION, contract_revision: CONTRACT_REVISION,
    transition: { schema_version: 1, accept_until: V1_UNTIL, delivery: "discarded_legacy_not_in_primary_statistics" },
    envelope: ENVELOPE, events: EVENT_DEFINITIONS, properties: PROPERTY_DEFINITIONS,
    forbidden: ["свободные строки", "URL/query", "local material/text/note IDs", "учебное содержимое", "вложенные объекты/массивы свойств", "user id/email/IP"] };
}
function normalizeEvent(input, now = Date.now()) {
  if (input && Number(input.schema_version) === 1) {
    if (now >= Date.parse(V1_UNTIL)) return { ok: false, error: "SCHEMA_VERSION_EXPIRED" };
    const result = legacy.normalizeEvent(input, now);
    return result.ok ? { ...result, legacy: true } : result;
  }
  const fail = error => ({ ok: false, error });
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_EVENT");
  if (input.schema_version !== 2) return fail("SCHEMA_VERSION_UNSUPPORTED");
  if (Object.keys(input).some(k => !ENVELOPE.includes(k))) return fail("ENVELOPE_NOT_ALLOWED");
  if (typeof input.event_id !== "string" || typeof input.session_id !== "string" || !UUID.test(input.event_id) || !UUID.test(input.session_id)) return fail("IDENTIFIER_INVALID");
  if (typeof input.app_version !== "string" || !VERSION.test(input.app_version)) return fail("VERSION_INVALID");
  const event = EVENT_DEFINITIONS.find(x => x.name === input.event_name);
  if (!event) return fail("EVENT_NOT_ALLOWED");
  const time = typeof input.occurred_at === "string" ? Date.parse(input.occurred_at) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== input.occurred_at || now - time > 86400000 || time - now > 300000) return fail("EVENT_TIME_INVALID");
  const props = input.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return fail("PROPERTIES_INVALID");
  if (event.required_properties.some(k => !Object.hasOwn(props, k))) return fail("PROPERTY_REQUIRED");
  for (const group of event.required_property_groups) {
    const present = group.filter(k => Object.hasOwn(props, k)).length;
    if (present > 0 && present !== group.length) return fail("PROPERTY_GROUP_INCOMPLETE");
  }
  for (const [key, value] of Object.entries(props)) {
    const def = PROPERTY_DEFINITIONS.find(x => x.name === key);
    if (!event.properties_used.includes(key) || !def) return fail("PROPERTY_NOT_ALLOWED");
    if (typeof value !== "string" || !def.values.includes(value)) return fail("PROPERTY_VALUE_INVALID");
  }
  if (event.forbidden_combinations.some(rule => Object.entries(rule).every(([k, v]) => props[k] === v))) return fail("COMBINATION_NOT_ALLOWED");
  return { ok: true, event: { ...input, properties: { ...props } } };
}
function durationBucket(ms) { return PROPERTY_DEFINITIONS[2].values[[30000,120000,300000,900000,1800000].filter(x => ms >= x).length]; }
module.exports = { SCHEMA_VERSION, CONTRACT_REVISION, V1_UNTIL, EVENT_NAMES, ALLOWED_PROPERTY_KEYS, EVENT_DEFINITIONS, PROPERTY_DEFINITIONS, contractManifest, normalizeEvent, anonymousEventKey: legacy.anonymousEventKey, durationBucket };
