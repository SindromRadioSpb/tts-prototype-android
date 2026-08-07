# Next-session prompt — Studio honest long jobs / owner-live continuation

> Paste the block below as the first message of the next session. Everything after the block is
> durable context, not additional authority.

---

## Paste-ready prompt

```text
Продолжи Studio honest import / long-job работу из текущего состояния, не переоткрывая уже
реализованные W1–W6 и P0–P3.

READ FIRST целиком и по порядку:
1. CLAUDE.md
2. docs/PROJECT_ROLES.md
3. docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md
4. docs/planning/STUDIO_LONG_JOB_HONESTY_REAL_SERIES_ACCEPTANCE_PACKET_2026_08_07.md
5. docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_LESSONS_LEARNED_2026_08_07.md

Начни с read-only рекона: проверь HEAD/origin, served production APP_VERSION и
MIGRATIONS.length. Ожидаемый handoff: main/origin `5913b044`, production `3.11.340`, browser
schema 48, полный suite 868 total / 864 pass / 4 прежних baseline fail. Блокирует только новое
падение. Сохрани все посторонние dirty owner-файлы.

W1–W6 SHIPPED (`b04a7a8c`). P0/P1/P2 SHIPPED (`bfe7016e`, `e0a45643`, `0db64fd6`). P3 и два
owner-live follow-up исправления SHIPPED (`8df50a18`, `c36536bf`, `5913b044`). Не реализуй их
повторно и не возвращай ambient media globals, бинарный all-or-nothing timing или неявный retry.

Перед любыми изменениями данных read-only проверь фактические карточки 5–9 по таблице в acceptance
packet. Известно: две активные карточки `В сокрытии - 6` с 503 строками и одним exact package.
НЕ удаляй, не архивируй и не перепривязывай ни одну без моего отдельного решения. Также сначала
спроси, считать ли Google Free карточки 7–9 финальными или создавать отдельные Gemini-версии.

Следующий технический/UX шаг выбирай только после этих owner decisions. Если работа продолжает
acceptance, отдельно нужен owner-iPhone Studio interaction PASS; 380 px Playwright не заменяет
его. После любого разрешённого save: terminal receipt -> duplicate-title audit -> cold reload ->
card rows/provider -> exact binding -> disabled `✓ Сохранено`.

Не разрешено без нового явного согласия: автоматический ASR/перевод, расход Gemini, удаление или
архивация карточек, массовая перезапись bindings, интерполированный/neighbor/voted timing,
derived timing canon, schema migrations, provider-default changes, серверные изменения или prod
cleanup. Каждый отказ обязан назвать следующее действие.
```

---

## Verified live card snapshot

- `В сокрытии - 5`: `6ef735e8-f04a-424a-a0b0-354333b57d2a`, Gemini, 469 rows.
- `В сокрытии - 6`: `af96921b-3ddc-4d3c-97cf-a29d575105eb`, Gemini, 503 rows.
- duplicate `В сокрытии - 6`: `d271b2bf-b71f-459c-9bb0-1d01b0d73504`, Gemini, 503 rows.
- `В сокрытии - 7`: `f28cb766-3e6c-4969-baed-1b92344f40c2`, Google Free, 555 rows.
- `В сокрытии - 8`: `bf9ca39a-eb14-46cc-ad02-73f400fb1fd6`, Google Free, 566 rows.
- `В сокрытии - 9`: `670dd59b-5383-420c-b642-6e0ab1daf1bc`, Google Free, 567 rows.

All six observed rows are `bound_verified`. This snapshot is dated 2026-08-07 and must be
re-verified before mutation.
