````md
# SMOKE-CHECK.md — Week 7.5 (P0)
Цель: доказать, что platform layer добавлен без регрессий Week 6/7, и что auth/groups/invites работают + RBAC соблюдён.

# Release gate (manual)

 - [x] Railway: npm run migrate applied/ok + /healthz returns db:"ok"
 - [x] Railway: platform smoke PASS (auth/groups/invites/rbac)
 - [x] Railway: Week 6/7 UI smoke PASS (REQUIRE_AUTH=0)

Last verified:
- Date: 2025-12-20
- Branch: multiuser-foundation
- Commit: "docs(smoke): record Railway PASS (migrate/healthz + platform + Week6/7 UI)"

------------------------------------------------

- [x] Week 6/7 regression smoke passed on `multiuser-foundation` (REQUIRE_AUTH=0)
- [x] Week 7.5 platform smoke (Auth/Groups/Invites/RBAC) passed

## A) Week 6/7 Smoke (регрессии не допускаются)
Выполняется при `REQUIRE_AUTH=0`.

### A1. Перевод → таблица строится
- [x] Открыть UI
- [x] Вставить текст, нажать Translate
- [x] Таблица отрендерилась, строки на месте, данные корректны

### A2. Row UX: selected / keyboard
- [x] Клик по строке → строка становится selected (визуально)
- [x] ↑/↓ перемещают selected
- [x] Enter запускает TTS выбранной строки
- [x] Ввод в input-полях не перехватывается горячими клавишами (если фокус в input)

### A3. Esc стопает playing и playlist
- [x] Запустить воспроизведение строки
- [x] Нажать Esc → воспроизведение останавливается
- [x] Если был playlist/training — он тоже останавливается (runActive гасится)

### A4. Playlist (если включён режим, где он используется)
- [x] Включить режим, где доступен playlist (Training/Run)
- [x] Запустить playlist
- [x] По окончании строки проигрывается следующая (ended → next)
- [x] Очистка таблицы / новый перевод гасит активный run (нет “залипания”)

### A5. Смена UI-настроек не убивает selected/playing
- [x] Сменить пресет/скрыть колонки/поменять отображение
- [x] selected/playing состояния остаются валидными, UI не “умирает”

### A6. Критично: нет дублей ended/error
- [x] Запустить несколько раз проигрывание/playlist
- [x] Убедиться, что нет двойных срабатываний “next” (симптом: перескакивает через строки)
- [ ] В логах нет повторяющихся сообщений одного события при одном действии

Last verified:
- Date: 2025-12-20
- Branch: multiuser-foundation
- Commit: <PASTE_GIT_SHA>

-------------------------------------------

## B) Platform Smoke (auth + groups + invites)
Выполняется при `REQUIRE_AUTH=1` (после успешного A).

### B1. Healthcheck
- [ ] `GET /healthz` → 200 OK, `ok:true`, `db:ok`

Команда:
```bash
curl -i http://localhost:3000/healthz
````

## Week 7.5 — Platform smoke (Auth + Groups + Invites + RBAC)

> Goal: validate platform layer without breaking Week 6/7 (Row UX + single audio pipeline).
> Assumes: server is running on [http://localhost:3000](http://localhost:3000) and Postgres is reachable (healthz db=ok).

### 0) Pre-check

* [ ] `GET /healthz` returns `{"ok":true,"db":"ok"}`

CMD:

```bat
curl http://localhost:3000/healthz
```

---

## Шаг 4. Подставить ваши реальные значения (опционально)

Чтобы это было максимально полезно именно вам, можно заменить плейсхолдеры на ваши реальные данные:

* `<TEACHER_EMAIL>` → `sindromradiospb@gmail.com`
* `<TEACHER_PASSWORD>` → **НЕ вставляйте в SMOKE-CHECK.md** (пароль не пишем в репозитории)
* `<GROUP_ID>` и `<INVITE_CODE>` → оставьте как переменные (они каждый раз новые)

То есть оставьте `<TEACHER_PASSWORD>` плейсхолдером, но можно добавить примечание:

> Teacher password is stored only in `.env` / Railway Variables. Do not commit it.

---

## Шаг 5. Проверьте, что файл сохранился

В CMD (корень проекта):

```bat
git diff SMOKE-CHECK.md
```

---

## Week 8 — Smoke (Library / Assignments / Progress) — PASS (2025-12-20)

**Env:** Railway production
**Base URL:** `https://tts-prototype-android-production.up.railway.app`

### 0) Vars + cookies

Windows CMD:

```bat
set "BASE_URL=https://tts-prototype-android-production.up.railway.app"

del teacher.cookie 2>nul
del student.cookie 2>nul
```

### 1) Healthz gate

```bat
curl -s %BASE_URL%/healthz
```

Expected: `{"ok":true,"db":"ok"}`

### 2) Teacher auth (cookie session)

```bat
curl -i -c teacher.cookie -H "Content-Type: application/json" -X POST %BASE_URL%/api/auth/login ^
  -d "{\"email\":\"sindromradiospb@gmail.com\",\"password\":\"<TEACHER_PASSWORD>\"}"
```

```bat
curl -s -b teacher.cookie %BASE_URL%/api/auth/me
```

Expected: `ok:true`, role `teacher`

### 3) Groups (precondition: teacher must be member)

We used group:

* `GROUP_ID=3713cd67-1040-40a4-b3e4-4b795060bce9`  (`Week8 Smoke Group`)
* Teacher `user_id=a1fea2f0-19b8-4063-a01f-db4b59f39bd0`

Verify groups:

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/groups"
```

Expected: `members_count: 1` for `Week8 Smoke Group`

**One-time fix (prod) if members_count==0:** add teacher to `group_members` via Railway SSH:

```sh
export GROUP_ID="3713cd67-1040-40a4-b3e4-4b795060bce9"
export TEACHER_ID="a1fea2f0-19b8-4063-a01f-db4b59f39bd0"
node -e 'const {Client}=require("pg"); (async()=>{ const group=process.env.GROUP_ID; const user=process.env.TEACHER_ID; const ssl=(process.env.DATABASE_SSL==="1")?{rejectUnauthorized:false}:false; const c=new Client({connectionString:process.env.DATABASE_URL, ssl}); await c.connect(); await c.query("INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",[group,user]); const r=await c.query("SELECT count(*)::int AS n FROM group_members WHERE group_id=$1",[group]); console.log("[membership] group",group,"members",r.rows[0].n); await c.end(); })().catch(e=>{ console.error(e); process.exit(1); });'
```

### 4) Library — create/list/get (teacher + member)

Set IDs:

```bat
set "GROUP_ID=3713cd67-1040-40a4-b3e4-4b795060bce9"
```

Create text:

```bat
curl -i -b teacher.cookie -H "Content-Type: application/json" -X POST "%BASE_URL%/api/library/texts" --data-binary "{\"groupId\":\"%GROUP_ID%\",\"title\":\"Smoke Text 1\",\"payload\":{\"raw\":\"hello\\nline2\"}}"
```

Expected: `201 Created`, returns `text.id`

We validated using:

* `TEXT_ID=bb2ce35b-9913-43c9-be44-b08cdb8b44a3`

Set:

```bat
set "TEXT_ID=bb2ce35b-9913-43c9-be44-b08cdb8b44a3"
```

List texts:

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/library/texts?groupId=%GROUP_ID%"
```

Get text:

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/library/texts/%TEXT_ID%"
```

Expected: `ok:true`

### 5) Assignments — create/list/get (teacher + member)

Create assignment:

```bat
curl -i -b teacher.cookie -H "Content-Type: application/json" -X POST "%BASE_URL%/api/assignments" --data-binary "{\"groupId\":\"%GROUP_ID%\",\"textId\":\"%TEXT_ID%\",\"title\":\"Smoke Assignment 1\",\"mode\":\"training\",\"settings\":{\"speed\":\"normal\"},\"dueAt\":null}"
```

Expected: `201 Created`, returns `assignment.id`

We validated using:

* `ASSIGNMENT_ID=6e136ae9-e1ad-4c66-b831-ddf1e6d8a9ed`

Set:

```bat
set "ASSIGNMENT_ID=6e136ae9-e1ad-4c66-b831-ddf1e6d8a9ed"
```

List assignments:

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/assignments?groupId=%GROUP_ID%"
```

Get assignment:

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/assignments/%ASSIGNMENT_ID%"
```

Expected: `ok:true`

### 6) Progress — upsert/get (assignment + text)

Upsert (assignment):

```bat
curl -i -b teacher.cookie -H "Content-Type: application/json" -X POST "%BASE_URL%/api/progress/upsert" --data-binary "{\"groupId\":\"%GROUP_ID%\",\"textId\":\"%TEXT_ID%\",\"assignmentId\":\"%ASSIGNMENT_ID%\",\"lastSelectedRow\":2,\"lastPlayedRow\":2,\"completion\":20,\"stats\":{\"note\":\"smoke\"}}"
```

Get (assignment):

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/progress?groupId=%GROUP_ID%&textId=%TEXT_ID%&assignmentId=%ASSIGNMENT_ID%"
```

Upsert (text only):

```bat
curl -i -b teacher.cookie -H "Content-Type: application/json" -X POST "%BASE_URL%/api/progress/upsert" --data-binary "{\"groupId\":\"%GROUP_ID%\",\"textId\":\"%TEXT_ID%\",\"lastSelectedRow\":5,\"lastPlayedRow\":5,\"completion\":40}"
```

Get (text only):

```bat
curl -s -b teacher.cookie "%BASE_URL%/api/progress?groupId=%GROUP_ID%&textId=%TEXT_ID%"
```

Expected: `ok:true`

### 7) RBAC cross-group — FORBIDDEN (isolation)

Use a group where teacher is not a member:

* `CROSS_GROUP_ID=eeb57434-e78f-41b2-94d9-9c9b13c76a95` (`Main Branch Smoke`, members_count=0)

```bat
curl -i -b teacher.cookie "%BASE_URL%/api/library/texts?groupId=eeb57434-e78f-41b2-94d9-9c9b13c76a95"
```

```bat
curl -i -b teacher.cookie "%BASE_URL%/api/assignments?groupId=eeb57434-e78f-41b2-94d9-9c9b13c76a95"
```

```bat
curl -i -b teacher.cookie "%BASE_URL%/api/progress?groupId=eeb57434-e78f-41b2-94d9-9c9b13c76a95&textId=%TEXT_ID%"
```

Expected: `403 Forbidden` for all

### Result

✅ Week 8 smoke PASS (Library/Assignments/Progress + RBAC) — 2025-12-20

---

```
