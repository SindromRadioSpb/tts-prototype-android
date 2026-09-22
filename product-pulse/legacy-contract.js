"use strict";

const crypto = require("crypto");

// Frozen v1 compatibility validator. Do not tighten this historical schema.
const SCHEMA_VERSION = 1;

// This manifest is the single machine-readable description of the public
// Product Pulse contract. The validator, owner panel and contract endpoint all
// derive from it so a new allowlisted event cannot remain undocumented.
const EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: "app_open",
    title: "Открытие приложения",
    definition: "Оболочка LinguistPro загрузилась в текущей вкладке.",
    collection: "automatic",
    trigger: "Один раз при запуске каждой поддерживаемой поверхности во вкладке.",
    properties_used: Object.freeze(["surface"]),
  }),
  Object.freeze({
    name: "material_open",
    title: "Открытие материала",
    definition: "Пользователь открыл учебный материал, без передачи его названия или содержимого.",
    collection: "integration",
    trigger: "Разрешено контрактом; точка отправки ещё не подключена.",
    properties_used: Object.freeze(["surface", "media_kind"]),
  }),
  Object.freeze({
    name: "study_started",
    title: "Начало занятия",
    definition: "После открытия поверхности произошло первое содержательное действие пользователя.",
    collection: "automatic",
    trigger: "Первое нажатие клавиши или указателя в сессии вкладки.",
    properties_used: Object.freeze(["surface"]),
  }),
  Object.freeze({
    name: "study_engaged",
    title: "Вовлечённое занятие",
    definition: "Сессия достигла порога активной работы после начала занятия.",
    collection: "automatic",
    trigger: "Не менее 30 секунд на видимой странице после первого действия.",
    properties_used: Object.freeze(["surface", "duration_bucket"]),
  }),
  Object.freeze({
    name: "study_completed",
    title: "Завершение занятия",
    definition: "Конкретный учебный сценарий дошёл до заранее определённой точки завершения.",
    collection: "integration",
    trigger: "Разрешено контрактом; сценарии завершения ещё не подключены.",
    properties_used: Object.freeze(["surface", "duration_bucket"]),
  }),
  Object.freeze({
    name: "audio_engaged",
    title: "Осмысленное аудио",
    definition: "Аудио или видео действительно воспроизводилось, а не только получило нажатие Play.",
    collection: "automatic",
    trigger: "Один раз на media-элемент после не менее 8 секунд фактического воспроизведения.",
    properties_used: Object.freeze(["surface", "media_kind"]),
  }),
  Object.freeze({
    name: "operation_result",
    title: "Результат операции",
    definition: "Разрешённая техническая операция завершилась успехом, ошибкой или отменой.",
    collection: "integration",
    trigger: "Разрешено контрактом; продуктовые операции ещё не подключены.",
    properties_used: Object.freeze(["surface", "operation", "result", "duration_bucket"]),
  }),
]);

const PROPERTY_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: "surface",
    required: true,
    definition: "Поверхность приложения; неизвестное значение нормализуется только как unknown.",
    values: Object.freeze(["studio", "reading_room", "mediatheque", "study_video", "unknown"]),
  }),
  Object.freeze({
    name: "result",
    required: false,
    definition: "Итог разрешённой технической операции.",
    values: Object.freeze(["success", "failure", "cancelled"]),
  }),
  Object.freeze({
    name: "duration_bucket",
    required: false,
    definition: "Грубый диапазон длительности вместо точного времени.",
    values: Object.freeze(["lt_30_sec", "30_sec_2_min", "2_5_min", "5_15_min", "15_30_min", "30_min_plus"]),
  }),
  Object.freeze({
    name: "operation",
    required: false,
    definition: "Стабильный технический код операции, без текста пользователя.",
    format: "token: 1-40 chars, a-z 0-9 _ . -",
  }),
  Object.freeze({
    name: "media_kind",
    required: false,
    definition: "Стабильный технический тип медиа, например audio или video.",
    format: "token: 1-40 chars, a-z 0-9 _ . -",
  }),
]);

const EVENT_NAMES = new Set(EVENT_DEFINITIONS.map((item) => item.name));
const SURFACES = new Set(PROPERTY_DEFINITIONS.find((item) => item.name === "surface").values);
const RESULTS = new Set(PROPERTY_DEFINITIONS.find((item) => item.name === "result").values);
const DURATION_BUCKETS = new Set(PROPERTY_DEFINITIONS.find((item) => item.name === "duration_bucket").values);
const ALLOWED_PROPERTY_KEYS = new Set(PROPERTY_DEFINITIONS.map((item) => item.name));

function contractManifest() {
  return {
    schema_version: SCHEMA_VERSION,
    stability: "additive changes require review; incompatible changes require a new schema version",
    envelope: ["schema_version", "event_id", "event_name", "occurred_at", "session_id", "app_version", "properties"],
    events: EVENT_DEFINITIONS,
    properties: PROPERTY_DEFINITIONS,
    forbidden: ["идентичность пользователя", "учебное содержимое", "заметки", "переводы", "имена файлов", "полные URL", "свободный ввод"],
  };
}

function cleanToken(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > maxLength || !/^[a-z0-9][a-z0-9_.-]*$/i.test(text)) return "";
  return text;
}

function normalizeEvent(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "INVALID_EVENT" };
  }
  const eventName = cleanToken(input.event_name, 50);
  if (!EVENT_NAMES.has(eventName)) return { ok: false, error: "EVENT_NOT_ALLOWED" };
  if (Number(input.schema_version) !== SCHEMA_VERSION) return { ok: false, error: "SCHEMA_VERSION_UNSUPPORTED" };

  const eventId = cleanToken(input.event_id, 80);
  const sessionId = cleanToken(input.session_id, 80);
  if (!eventId || !sessionId) return { ok: false, error: "IDENTIFIER_INVALID" };

  const occurredAtMs = Date.parse(String(input.occurred_at || ""));
  if (!Number.isFinite(occurredAtMs) || Math.abs(now - occurredAtMs) > 24 * 60 * 60 * 1000) {
    return { ok: false, error: "EVENT_TIME_INVALID" };
  }

  const properties = {};
  const source = input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)
    ? input.properties : {};
  for (const key of Object.keys(source)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) return { ok: false, error: "PROPERTY_NOT_ALLOWED" };
  }

  const surface = cleanToken(source.surface || input.surface || "unknown", 32) || "unknown";
  if (!SURFACES.has(surface)) return { ok: false, error: "SURFACE_INVALID" };
  properties.surface = surface;

  if (source.result != null) {
    const result = cleanToken(source.result, 16);
    if (!RESULTS.has(result)) return { ok: false, error: "RESULT_INVALID" };
    properties.result = result;
  }
  if (source.duration_bucket != null) {
    const bucket = cleanToken(source.duration_bucket, 24);
    if (!DURATION_BUCKETS.has(bucket)) return { ok: false, error: "DURATION_BUCKET_INVALID" };
    properties.duration_bucket = bucket;
  }
  for (const key of ["operation", "media_kind"]) {
    if (source[key] != null) {
      const value = cleanToken(source[key], 40);
      if (!value) return { ok: false, error: `${key.toUpperCase()}_INVALID` };
      properties[key] = value;
    }
  }

  return {
    ok: true,
    event: {
      schema_version: SCHEMA_VERSION,
      event_id: eventId,
      event_name: eventName,
      occurred_at: new Date(occurredAtMs).toISOString(),
      session_id: sessionId,
      app_version: cleanToken(input.app_version, 32) || "unknown",
      properties,
    },
  };
}

function anonymousEventKey(event) {
  return crypto.createHash("sha256").update(`${event.session_id}:${event.event_id}`, "utf8").digest("hex");
}

module.exports = {
  SCHEMA_VERSION,
  EVENT_NAMES,
  ALLOWED_PROPERTY_KEYS,
  EVENT_DEFINITIONS,
  PROPERTY_DEFINITIONS,
  contractManifest,
  normalizeEvent,
  anonymousEventKey,
};
