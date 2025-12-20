
---

```md
# SMOKE-CHECK.md — Week 7.5 (P0)
Цель: доказать, что platform layer добавлен без регрессий Week 6/7, и что auth/groups/invites работают + RBAC соблюдён.

## A) Week 6/7 Smoke (регрессии не допускаются)
Выполняется при `REQUIRE_AUTH=0`.

### A1. Перевод → таблица строится
- [ ] Открыть UI
- [ ] Вставить текст, нажать Translate
- [ ] Таблица отрендерилась, строки на месте, данные корректны

### A2. Row UX: selected / keyboard
- [ ] Клик по строке → строка становится selected (визуально)
- [ ] ↑/↓ перемещают selected
- [ ] Enter запускает TTS выбранной строки
- [ ] Ввод в input-полях не перехватывается горячими клавишами (если фокус в input)

### A3. Esc стопает playing и playlist
- [ ] Запустить воспроизведение строки
- [ ] Нажать Esc → воспроизведение останавливается
- [ ] Если был playlist/training — он тоже останавливается (runActive гасится)

### A4. Playlist (если включён режим, где он используется)
- [ ] Включить режим, где доступен playlist (Training/Run)
- [ ] Запустить playlist
- [ ] По окончании строки проигрывается следующая (ended → next)
- [ ] Очистка таблицы / новый перевод гасит активный run (нет “залипания”)

### A5. Смена UI-настроек не убивает selected/playing
- [ ] Сменить пресет/скрыть колонки/поменять отображение
- [ ] selected/playing состояния остаются валидными, UI не “умирает”

### A6. Критично: нет дублей ended/error
- [ ] Запустить несколько раз проигрывание/playlist
- [ ] Убедиться, что нет двойных срабатываний “next” (симптом: перескакивает через строки)
- [ ] В логах нет повторяющихся сообщений одного события при одном действии

## B) Platform Smoke (auth + groups + invites)
Выполняется при `REQUIRE_AUTH=1` (после успешного A).

### B1. Healthcheck
- [ ] `GET /healthz` → 200 OK, `ok:true`, `db:ok`

Команда:
```bash
curl -i http://localhost:3000/healthz

## Week 7.5 — Platform smoke (Auth + Groups + Invites + RBAC)

> Goal: validate platform layer without breaking Week 6/7 (Row UX + single audio pipeline).
> Assumes: server is running on http://localhost:3000 and Postgres is reachable (healthz db=ok).

### 0) Pre-check
- [ ] `GET /healthz` returns `{"ok":true,"db":"ok"}`

CMD:
```bat
curl http://localhost:3000/healthz


---

## Шаг 4. Подставить ваши реальные значения (опционально)
Чтобы это было максимально полезно именно вам, можно заменить плейсхолдеры на ваши реальные данные:

- `<TEACHER_EMAIL>` → `sindromradiospb@gmail.com`
- `<TEACHER_PASSWORD>` → **НЕ вставляйте в SMOKE-CHECK.md** (пароль не пишем в репозитории)
- `<GROUP_ID>` и `<INVITE_CODE>` → оставьте как переменные (они каждый раз новые)

То есть оставьте `<TEACHER_PASSWORD>` плейсхолдером, но можно добавить примечание:

> Teacher password is stored only in `.env` / Railway Variables. Do not commit it.

---

## Шаг 5. Проверьте, что файл сохранился
В CMD (корень проекта):

```bat
git diff SMOKE-CHECK.md


