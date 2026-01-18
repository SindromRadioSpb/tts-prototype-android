# NAV Fixtures (golden) — docs/fixtures/nav

Цель: минимальный, воспроизводимый набор “золотых” примеров для NAV-01..NAV-07:
- стабильные deeplinks (Target v1)
- NOT_FOUND target
- CORRUPT payload (decode ok, schema invalid)
- кейс “orderIndex changed but ids stable”
- минимальные поисковые results / контекст для Back-to-results

Важно:
- Это **fixtures для контрактов и smoke**, а не “реальная прод БД”.
- SQL seed здесь даётся как **ASSUMPTION** (таблицы/поля могут отличаться от ваших миграций).

Связанные документы:
- docs/GLOSSARY_DOMAIN.md
- docs/CONTRACTS_NAVIGATION.md (deeplink format + error handling)
- docs/schemas/nav_target_v1.schema.json
- docs/schemas/deeplink_payload_v1.schema.json
- docs/schemas/search_session_v3.schema.json
- docs/API_CONTRACTS.md

---

## 1) Структура папки

entities/
  texts_rows_v1.json
  texts_rows_v2_order_index_shifted.json
  notes.json

targets/
  target_sentence_ok.json
  target_note_ok.json
  target_not_found_sentence.json

deeplinks/
  deeplink_sentence_ok.url.txt
  deeplink_note_ok.url.txt
  deeplink_not_found_sentence.url.txt
  deeplink_corrupt_missing_id.url.txt

db/
  seed_minimal.sql  (ASSUMPTION)

---

## 2) Сущности (fixtures-датасет)

### 2.1. Texts
- t_1001: 3 строки (s_0006..s_0008)
- t_1002: 4 строки (s_0001..s_0004)

### 2.2. Notes
- n_501: note на sentenceId s_0007 (в t_1001)
- n_502: note на sentenceId s_0003 (в t_1002)

---

## 3) Кейс “orderIndex changed but ids stable”

- В v1 (`texts_rows_v1.json`) sentenceId `s_0003` имеет orderIndex=3.
- В v2 (`texts_rows_v2_order_index_shifted.json`) в текст t_1002 добавлена новая строка в начало,
  поэтому `s_0003` сдвинут на orderIndex=4.
- Deeplink по Target (type=sentence, id=s_0003, ref.textId=t_1002) обязан открывать тот же sentence,
  независимо от orderIndex.

---

## 4) Привязка к NAV-01..NAV-07 (минимум)

NAV-01 (deeplink ok):
- deeplinks/deeplink_sentence_ok.url.txt (sentence s_0003 в t_1002)
- deeplinks/deeplink_note_ok.url.txt (note n_501 в t_1001, ref.sentenceId=s_0007)

NAV-02 (NOT_FOUND):
- deeplinks/deeplink_not_found_sentence.url.txt (sentence s_missing в t_9999)

NAV-07 (CORRUPT):
- deeplinks/deeplink_corrupt_missing_id.url.txt (payload валиден как base64url JSON, но schema invalid: отсутствует id)

NAV-ID-STABILITY (orderIndex changed):
- сравнить entities v1 vs v2 и переоткрыть deeplink_sentence_ok — должен резолвиться по stable ids.

---

## 5) Примечание по SQL seed (ASSUMPTION)

db/seed_minimal.sql создаёт минимальные таблицы texts/library_rows/sentence_notes и вставляет данные.
В вашем проекте реальные имена/поля могут отличаться (см. DB_SCHEMA: “контракт, миграции — источник факта”),
поэтому этот seed — стартовая точка для адаптации под migrations/*.sql.
