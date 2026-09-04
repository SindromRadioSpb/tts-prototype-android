# Контур разрешения неоднозначной морфологии

Дата: 2026-09-04

Статус: `ARCHITECTURE_DECISION_DRAFT · P0.5_CORE_STORAGE_TECHNICAL_PASS · UI_NOT_IMPLEMENTED`

Связанные документы:

- [общая концепция](./README.md);
- [контракт лексического экспорта](./LEXICAL_EXPORT_CONTRACT.md);
- [фактический P0-прогон](./P0_PREVIEW_REPORT.md).

## 1. Решение

`fail-closed` означает «не публиковать сомнительный словарный смысл как факт».
Он **не означает** «спрятать вхождение навсегда».

Каждое вхождение с одним или несколькими сигналами
`ambiguous / identity_guarded / unknown_pos / collision / skipped_token` обязано:

1. остаться привязанным к точным `text + row + word_offset` и контексту;
2. попасть в видимую очередь разбора LinguistPro;
3. сохранить машинные альтернативы и отвергнутую fail-closed привязку как
   evidence, а не как выбранную истину;
4. получить путь `посмотреть → подтвердить/исправить/отложить → переэкспортировать`;
5. быть учтено conservation-gate: число уникальных сомнительных occurrences
   равно числу occurrences в очереди.

Пока этот контур не реализован end-to-end, массовый экспорт vault и
whole-library rollout заблокированы.

## 2. Не суммировать пересекающиеся категории

Одно occurrence может одновременно быть неоднозначным, иметь конфликт
идентичности и входить в collision-key. Поэтому UI показывает:

- **уникальные сомнительные вхождения** — размер очереди;
- **сигналы по причинам** — диагностические пересекающиеся счётчики;
- **кластеры** — группы для удобства ручной проверки.

Сумма reason-counts не является числом слов в очереди.

## 3. Два масштаба ручной работы

### Небольшой учебный текст

Очередь открывается по одному occurrence. Карточка показывает исходную строку,
огласованную строку, перевод, форму, текущий контекстный POS, кандидатов Pealim,
confidence, provider/model и причину карантина.

Доступные действия:

- `Подтвердить кандидата`;
- `Исправить вручную`;
- `Ни один кандидат не подходит`;
- `Отложить`;
- `Вернуть в нерешённые`.

### Большой текст

Те же occurrences сначала группируются по точной сигнатуре: pointed form,
контекстный POS, набор причин, candidate fingerprint и conflict fingerprint.
Кластер — только средство review, не новая словарная сущность.

Пакетное решение допустимо, только если владелец:

1. открыл кластер;
2. увидел количество затрагиваемых occurrences;
3. просмотрел все контексты либо явно раскрыл полный список;
4. подтвердил применение к перечисленному immutable набору occurrence IDs.

Экспортёр записывает отдельное решение для каждого occurrence с общим
`batch_id`. Нельзя создавать вечное правило «эта форма всегда означает X»:
новые контексты снова проходят resolver и при необходимости попадают в очередь.
Автоматическое применение пакетного решения запрещено.

## 4. Источник истины

Решение хранится в LinguistPro. Obsidian получает read-only проекцию и может
хранить личный комментарий, но не является каноническим редактором морфологии.

Исходные `sentence_morph` и `notes_v2` не переписываются. Поверх них применяется
append-only журнал решений `lexical_resolution_events`.

Нормативный event shape:

```json
{
  "id": "uuid",
  "occurrence_key": {
    "text_id": "...",
    "sentence_id": "...",
    "word_offset": 4
  },
  "portable_anchor": {
    "text_key": "...",
    "order_index": 23,
    "surface_norm": "שרפו",
    "sentence_sha256": "..."
  },
  "action": "confirm_candidate | manual_correction | reject_all | defer | clear",
  "chosen_analysis": {
    "lemma": "לשרוף",
    "lp_pos": "verb",
    "pealim_id": "2321",
    "root": "שרף",
    "binyan": "paal",
    "meaning_ru": "жечь"
  },
  "candidate_fingerprint": "sha256:...",
  "morph_model_version": "...",
  "actor_kind": "owner | teacher",
  "batch_id": null,
  "supersedes_id": null,
  "note": "",
  "created_at": "..."
}
```

`chosen_analysis` обязателен только для `confirm_candidate` и
`manual_correction`. Агент или resolver может сформировать proposal, но не может
записать событие с `actor_kind=owner|teacher`.

## 5. Эффективные состояния

Состояние вычисляется из последнего применимого события и текущего source
snapshot:

| Состояние | Значение |
|---|---|
| `unresolved` | применимого решения нет |
| `resolved` | подтверждение или ручное исправление валидно |
| `rejected_all` | показанные кандидаты отвергнуты; нужен новый анализ |
| `deferred` | владелец сознательно отложил решение |
| `stale` | решение больше нельзя безопасно применить |

Для `confirm_candidate` изменение candidate fingerprint, текста строки,
позиции или surface переводит решение в `stale`. Смена версии модели сама по
себе не отменяет `manual_correction`; ручное исправление устаревает при изменении
его occurrence-anchor. `clear` возвращает occurrence в `unresolved`, не удаляя
историю.

## 6. Приоритет чтения

При построении карточки и экспорта:

1. валидное owner/teacher решение;
2. текущий контекстный resolver;
3. словарная заметка как кандидат/evidence;
4. пустое поле, если доказательства недостаточны.

Решение никогда не меняет FSRS, `review_log`, progress или learning selection.
Resolved reference-лексема также не становится автоматически учебной карточкой.

## 7. Проекция в Obsidian

Пакет содержит:

```text
_LinguistPro/
  texts/<text_id>/
    Разбор.base
    Очередь разбора.md
    resolution-occurrences.tsv
  resolution/
    cluster-<fingerprint>.md
```

`lp-resolution-cluster` показывает причины, кандидатов и все контексты. Он
имеет `managed_by: linguistpro`, `status: unresolved` и предупреждение, что
редактирование generated Markdown не принимает решение.

После канонического решения повторный экспорт:

- переносит подтверждённые поля в `lp-lexeme` с verification/provenance;
- удаляет occurrence из текущей unresolved queue;
- фиксирует переход в receipt и resolution audit, чтобы элемент не исчезал
  бесследно;
- не возвращает отвергнутого кандидата выбранным при следующем resolver-run.

## 8. Обязательные инварианты

1. `uncertain_occurrences == queued_uncertain_occurrences`.
2. Каждый queue item имеет уникальный occurrence ID и точный контекст.
3. Все IDs queue items встречаются ровно в одном текущем кластере.
4. Candidate evidence сохраняется при fail-closed очистке выбранных полей.
5. Ни один кластер не применяется автоматически.
6. Batch review перечисляет точные occurrence IDs и пишет отдельные события.
7. Raw morphology неизменна; журнал append-only.
8. Stale decision снова видим и не применяется молча.
9. Экспорт/preview не пишет в FSRS или `review_log`.
10. Hermes/ИИ имеет право `propose`, но не `confirm`.

## 9. Реализационный gate

До P1 требуется завершить `P0.5 Resolution`:

1. browser SQLite migration и repository API для append-only events —
   `TECHNICAL_PASS`;
2. overlay resolver с тестами `resolved / rejected / deferred / stale / clear`;
3. очередь и карточка проверки в LinguistPro;
4. preview точного batch impact;
5. backup/export/import новых событий;
6. повторный Obsidian-export с доказанным переходом unresolved → resolved;
7. owner acceptance на малом тексте и затем на `Кфар Аза - 2`.

События являются text-bound локальными данными владельца. Они входят в
`notes_advanced` обычного backup и slim per-text artifact. В облачный backend
они автоматически не отправляются; server sync требует отдельного решения о
privacy, конфликтах и owner scope.

Только после этого разрешается test-vault P1. Действующий vault на `F:` остаётся
без изменений.
