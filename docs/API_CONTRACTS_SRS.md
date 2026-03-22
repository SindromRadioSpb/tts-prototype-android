# API_CONTRACTS_SRS — SRS / Trainer endpoints

Этот документ фиксирует:
- текущий runtime-контракт SRS v1
- утверждённый roadmap для PATCH-04..PATCH-08
- границы между уже реализованным и planned

Связанные документы:
- `docs/CONTRACTS_SRS.md`
- `docs/CONTRACTS_ANALYTICS.md`
- `docs/DB_SCHEMA.md`
- `docs/ROADMAP_PREMIUM.md`

---

## 0) Current Runtime Baseline (2026-03-22)

Уже реализовано:
- `GET /api/srs/templates`
- `GET /api/srs/cards?sentenceId=...`
- `GET /api/srs/cards/:id/trainer-view`
- `POST /api/srs/cards`
- `POST /api/srs/cards/generate`
- `POST /api/srs/review`
- `POST /api/srs/attempts/check`
- `GET /api/srs/today`
- `GET /api/srs/today/summary`
- `POST /api/srs/sessions`
- `GET /api/srs/sessions/:id`
- `GET /api/srs/sessions/:id/next`
- `POST /api/srs/sessions/:id/review`
- `POST /api/srs/sessions/:id/finish`

Текущая сущность карточки:
- template-driven `sentence`-level cards
- `entity_type = "sentence"`
- базовые template codes: `ru_to_he`, `he_to_ru`
- session queue хранит `cardId`, а не `sentenceId`

---

## 1) Current SRS v1 API

### 1.1. `GET /api/srs/templates`
Назначение:
- вернуть доступный catalog шаблонов для IDE inspector и trainer

Успех:
```json
{
  "ok": true,
  "templates": [
    {
      "id": "tpl_ru_to_he",
      "code": "ru_to_he",
      "label": "Russian -> Hebrew",
      "cardKind": "sentence",
      "promptLang": "ru",
      "answerLang": "he",
      "answerMode": "reveal",
      "isActive": true,
      "sortOrder": 10,
      "frontSchema": { "prompt": "ru" },
      "backSchema": { "answer": "he", "extra": ["translit", "textTitle"] }
    }
  ]
}
```

### 1.2. `GET /api/srs/cards?sentenceId=<id>&templateCode=<code>`
Назначение:
- получить snapshot конкретной template-card по sentence

Успех:
```json
{
  "ok": true,
  "sentence": {
    "sentenceId": "uuid",
    "textId": "uuid",
    "orderIndex": 12,
    "hePlain": "...",
    "heNiqqud": "...",
    "translit": "...",
    "ru": "...",
    "textTitle": "...",
    "audioAssetKey": "..."
  },
  "card": {
    "id": "uuid",
    "entityType": "sentence",
    "entityId": "uuid",
    "templateId": "tpl_ru_to_he",
    "sourceSentenceId": "uuid",
    "sourceNoteId": null,
    "state": "new|learning|review|relearning|suspended",
    "dueDate": "YYYY-MM-DD",
    "intervalDays": 0,
    "easeFactor": 2.5,
    "lapses": 0,
    "reps": 0,
    "createdAt": "ISO",
    "updatedAt": "ISO",
    "lastReviewAt": "ISO|null",
    "isDue": true,
    "meta": {},
    "template": {
      "id": "tpl_ru_to_he",
      "code": "ru_to_he",
      "label": "Russian -> Hebrew",
      "cardKind": "sentence",
      "promptLang": "ru",
      "answerLang": "he",
      "answerMode": "reveal",
      "isActive": true,
      "sortOrder": 10,
      "frontSchema": { "prompt": "ru" },
      "backSchema": { "answer": "he", "extra": ["translit", "textTitle"] }
    }
  }
}
```

Замечание:
- если карточки ещё нет, `card = null`

Ошибки:
- `400 BAD_CARD_QUERY`
- `400 BAD_TEMPLATE`
- `404 SENTENCE_NOT_FOUND`
- `500 INTERNAL_ERROR`

### 1.3. `POST /api/srs/cards`
Body:
```json
{ "sentenceId": "uuid", "templateCode": "ru_to_he" }
```

Назначение:
- явное создание карточки

Успех:
- такой же envelope, как у `GET /api/srs/cards`

Ошибки:
- `400 BAD_SENTENCE_ID`
- `400 BAD_TEMPLATE`
- `404 SENTENCE_NOT_FOUND`
- `500 INTERNAL_ERROR`

### 1.4. `POST /api/srs/cards/generate`
Body:
```json
{
  "sentenceId": "uuid",
  "templateCodes": ["ru_to_he", "he_to_ru"]
}
```

Назначение:
- создать несколько template-card для одной sentence за один запрос

### 1.5. `POST /api/srs/review`
Body:
```json
{
  "sentenceId": "uuid",
  "templateCode": "ru_to_he",
  "rating": 1,
  "reviewTimeMs": 1200
}
```

Правила:
- `rating ∈ {1,2,3,4}`
- если карточки нет, server создаёт её автоматически

Успех:
- обновлённый snapshot карточки

Ошибки:
- `400 BAD_SENTENCE_ID`
- `400 BAD_RATING`
- `400 BAD_TEMPLATE`
- `404 CARD_NOT_FOUND`
- `404 SENTENCE_NOT_FOUND`
- `500 INTERNAL_ERROR`

### 1.6. `GET /api/srs/cards/:id/trainer-view?mode=reveal|typing|listening|cloze`
Назначение:
- вернуть trainer payload для отдельной card и выбранного режима

Успех:
```json
{
  "ok": true,
  "sentence": { "...": "..." },
  "card": { "...": "..." },
  "trainer": {
    "mode": "typing",
    "templateCode": "ru_to_he",
    "promptText": "Privet",
    "promptLang": "ru",
    "answerText": "שלום",
    "answerLang": "he",
    "supportText": "shalom",
    "audioAssetKey": "asset-key-or-empty",
    "cloze": null
  }
}
```

Ошибки:
- `400 BAD_CARD_ID`
- `400 BAD_TRAINER_MODE`
- `404 CARD_NOT_FOUND`
- `500 INTERNAL_ERROR`

### 1.7. `POST /api/srs/attempts/check`
Body:
```json
{
  "cardId": "uuid",
  "sessionId": "uuid|null",
  "attemptType": "typing",
  "answer": "שלום",
  "latencyMs": 900
}
```

Назначение:
- проверить ответ пользователя и записать попытку в `srs_attempts`

Успех:
```json
{
  "ok": true,
  "cardId": "uuid",
  "attemptType": "typing",
  "isCorrect": true,
  "normalizedAnswer": "שלום",
  "normalizedExpected": "שלום",
  "trainer": {
    "mode": "typing",
    "templateCode": "ru_to_he",
    "promptText": "Privet",
    "promptLang": "ru",
    "answerLang": "he",
    "supportText": "shalom",
    "audioAssetKey": "",
    "clozePrompt": null
  }
}
```

Ошибки:
- `400 BAD_CARD_ID`
- `400 BAD_ATTEMPT_TYPE`
- `400 BAD_ATTEMPT_ANSWER`
- `404 CARD_NOT_FOUND`
- `500 INTERNAL_ERROR`

### 1.8. `GET /api/srs/today?limit=25&templateCode=he_to_ru`
Назначение:
- вернуть due queue для template-cards
- если передан `templateCode`, очередь фильтруется по направлению карточки

Успех:
```json
{
  "ok": true,
  "limit": 25,
  "templateCode": "he_to_ru",
  "cards": [ { "sentence": { ... }, "card": { ... } } ]
}
```

### 1.9. `GET /api/srs/today/summary?limit=200&templateCode=he_to_ru`
Назначение:
- вернуть summary по Today queue c optional template filter

### 1.10. `POST /api/srs/sessions`
Body:
```json
{
  "source": "ui",
  "limit": 50,
  "mode": "typing",
  "templateCode": "he_to_ru"
}
```

Назначение:
- стартовать trainer session для выбранного режима и направления карточек
- если передан `templateCode`, в queue попадают только card’ы этого template

---

## 2) Approved Delivery Roadmap

### PATCH-04 — Trainer Foundations
Статус:
- foundation уже реализован
- trainer работает как отдельный modal/workspace entry point
- session API уже поднят
- richer trainer modes остаются для PATCH-05/06

Endpoint’ы PATCH-04:
- `GET /api/srs/today/summary`
- `POST /api/srs/sessions`
- `GET /api/srs/sessions/:id`
- `GET /api/srs/sessions/:id/next`
- `POST /api/srs/sessions/:id/review`
- `POST /api/srs/sessions/:id/finish`

### PATCH-05 — Card Templates
Статус:
- реализовано
- `srs_card_templates` добавлена миграцией `012_srs_templates.sql`
- `srs_cards` теперь уникальны по `(entity_type, entity_id, template_id)`
- появились `/api/srs/templates` и `/api/srs/cards/generate`
- trainer session queue переведена на `cardId`

### PATCH-06 — Trainer Modes
Статус:
- реализовано базовое trainer ядро
- `GET /api/srs/cards/:id/trainer-view`
- `POST /api/srs/attempts/check`
- UI modes: reveal / typing / listening / cloze
- session start теперь принимает `mode` и `templateCode`
- trainer home явно показывает card direction (`Hebrew -> Russian` / `Russian -> Hebrew`)

### PATCH-07 — Analytics Alignment
Добавить:
- event layer для `srs_review`, `trainer_attempt`, `session_started`, `session_finished`

### PATCH-08 — Anki Export v1
Добавить:
- preview/export/status
- stable export metadata
- idempotent mapping to Anki

---

## 3) Contract Rules

1. Любой новый SRS endpoint обязан иметь:
- documented success envelope
- documented error envelope
- smoke path

2. Любой новый SRS session/trainer endpoint не должен ломать baseline API из раздела 1.

3. PATCH-05 сохраняет sentence-level source model, но разрешает несколько template-card на одну sentence.
