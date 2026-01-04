# W10-NOTES-PREMIUM-02 — DB smoke FIX#4 (sentence_notes cleanup on updateText)

Цель: доказать, что при PUT /api/library/texts/:id (update текста),
когда удаляются sentences, удаляются и sentence_notes для удалённых sentence_id.

## Preconditions
- Выберите существующий Library текст (TEXT_A).
- В UI создайте 2–3 notes на разных строках.
- Запомните/выпишите sentence_id для каждой строки:
  - можно взять из DOM: кнопка 📝 имеет data-sentence-id
  - либо из API /api/library/texts/:id/sentences (id каждого sentence)

## DB path
По умолчанию SQLite: data/app.db (если не переопределяли).

## Step 1 — до update (зафиксировать базу)
sqlite3 data/app.db "SELECT sentence_id,note FROM sentence_notes WHERE text_id='TEXT_A' ORDER BY sentence_id;"

Также полезно:
sqlite3 data/app.db "SELECT COUNT(*) AS c FROM sentence_notes WHERE text_id='TEXT_A';"

## Step 2 — выполнить update текста так, чтобы реально удалились строки
Сделайте PUT update текста (через UI Edit / API) так, чтобы rows стало меньше,
и вы точно знали, какие sentence_id должны исчезнуть.

## Step 3 — после update (проверка каскада)
### A) Удалённые sentence_id отсутствуют
sqlite3 data/app.db "SELECT sentence_id FROM sentence_notes WHERE sentence_id='DELETED_SENTENCE_ID';"

Ожидаемо: пусто.

### B) Сохранённые sentence_id остались
sqlite3 data/app.db "SELECT sentence_id,note FROM sentence_notes WHERE sentence_id='KEPT_SENTENCE_ID';"

Ожидаемо: есть строка.

## Step 4 — итоговый снимок
sqlite3 data/app.db "SELECT sentence_id,note FROM sentence_notes WHERE text_id='TEXT_A' ORDER BY sentence_id;"
