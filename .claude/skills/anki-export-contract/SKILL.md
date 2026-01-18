---
name: anki-export-contract
description: Контракт экспорта Anki (CSV/AnkiConnect) и fixtures для детерминированных тестов.
---

# Anki Export Contract (Project)

## Базовый контракт (фиксируем заранее)
Поля (рекомендуемый минимум):
- hebrew
- hebrew_niqqud
- translit
- ru
- tags
- source
- notes_md
- audio_ref

## Правила
1) Порядок и имена полей не меняются без отдельного PATCH.
2) tags — канонизируются (стабильный порядок, без дублей).
3) Любая генерация должна проверяться на fixtures/export-sample.json.

## Выход
- если изменён экспорт: показать пример CSV/JSON на fixtures
- перечислить совместимость
