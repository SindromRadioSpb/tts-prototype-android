# CLG-P8.3 — Channel-neutral review session + context-first rendering — SPEC

**Date:** 2026-07-10 · **Status:** design (adversarial critique required before code) · **Parents:** `TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md` (§5, §6, §20), security spec §8.3, §2.3 probe (`docs/research/miniapp-p8-readiness/2026-07-10/anchor-coverage-probe.md`)
**Owner decisions folded in (2026-07-10):** fork-4 = **C-refined** (§1) · **due-window unification is a PRE-CODE precondition** (§2) · P8.3 ships with **write flag OFF** (answers cannot reach `review_log` until P8.4).

---

## §1 OWNER DECISION P8-D4C-refined — context timing per modality

**Formula: context-first ≠ context-before-answer.** Evidence-scope semantics must not be erased by a universal UI template (cloze = context-supported; reverse = uncued lexeme recall; dictate = strict production cell).

| Modality | BEFORE answer | AFTER verdict | evidence_scope |
|---|---|---|---|
| **cloze** | source sentence WITH mask (the context IS the task) | full sentence, target highlighted | `cloze` (unchanged) |
| **dictate** | audio + input field ONLY (no sentence) | full source sentence if anchor exists + highlight + «Открыть в Зале» | `cell`; **hint → `context_supported`** |
| **reverse** | RU gloss + input field ONLY | source sentence if found | `lexeme` (already context-supported class) |
| нет модальности и якоря | — | — | honest route to the Зал (16% пула по §2.3) |

**Explicit hint «Показать контекст» (dictate, опционально для новичков):**
- Tap → `POST /api/miniapp/review-sessions/:id/hint` → **сервер** записывает демоцию НА challenge-строке (hint state is server-owned, никогда client-claimed) и только тогда возвращает предложение (masked — target остаётся скрыт);
- Записанный review несёт `evidence_scope='context_supported'`;
- **Grounded consequences (все by construction):**
  - `grade-policy.CONTEXT_SUPPORTED_SCOPES` (`public/js/grade-policy.js:86-88`) пополняется значением `context_supported` → hinted-успех НЕ доказывает unsupported production (`hasProductionSuccess` пропустит его — `grade-policy.js:94`), НЕ латчит dictate-history (`review.js:147-148` исключает context-supported), НЕ снимает D1-Hard-смягчение;
  - `reviewer.EXPECTED_SCOPE` (`agent/reviewer.js:54`) из равенства становится per-kind МНОЖЕСТВОМ: `dictate → {'cell','context_supported'}`, причём `context_supported` принимается ТОЛЬКО если сама challenge-строка несёт server-recorded hint-флаг (fail-closed: клиентское самообъявление невозможно);
  - **gate-consumers-sweep обязателен**: все читатели evidence_scope/scopes (grade-policy каналы-статы, planner productionImbalance, hasDictateHistory, reviewer, smoke-гейты dictate) проверяются на новое значение ДО кода.

**Leak-инвариант не ослабляется:** до ответа expected отсутствует в payload/DOM/a11y на ВСЕХ модальностях; hint-предложение отдаётся masked.

---

## §2 PRE-CODE PRECONDITION — единый due-snapshot (закрыть MAX_DUE_FORMS-расхождение)

**Проблема (доказана §2.3-пробой):** builder (`agentClozeRepo._dueVocMap`, `MAX_DUE_FORMS=40` — `db/agentClozeRepo.js:26,54`) видит первые 40 due-форм, selector — 50 (`getDue limit:50` — `review.js:92`). При пуле 50 теряются 4 якорных слова: cloze на позиции 44 «не существует» для builder'а → неверная модальность/«нет задания». Это P7.3d-класс бага (одинаковая функция ≠ одинаковый результат при разных входных окнах).

**Fix (owner, обязателен ДО остального кода P8.3, чинит и бота):**
- Одна константа `REVIEW_DUE_WINDOW = 50` (один дом; selector и builder не имеют собственных чисел);
- **Один ordered due-snapshot** делается ОДИН раз за start: selector, builder, context-resolver получают ТЕ ЖЕ item_keys, тот же `nowMs`, те же struggle/exposure snapshots — НИКАКИХ независимых `getDue()`;
- `_dueVocMap` обрабатывает ВЕСЬ snapshot чанками (40+10, внутренний resolver-cap уважается), исходный due-порядок восстанавливается после чанкинга;
- Интерфейс: `reviewSessionService.start({ userId, nowMs, dueItems, surface, mode })` — due-window зафиксировано ДО ветвления.
- **Гейт-teeth:** фикстура с якорным item на позиции >40 → builder находит его; selector-путь бота и Mini App на одном snapshot выбирают ОДИН item+modality.

---

## §3 reviewSessionService — граница (extraction из agent/telegram/review.js)

```
reviewSessionService.start({userId, nowMs, surface, mode})   → challenge descriptor | {none}
reviewSessionService.resume({userId, surface})               → active challenge descriptor | null
reviewSessionService.answer({userId, surface, challenge_id, attempt_id, answer}) → reviewer.record
reviewSessionService.skip({userId, surface, challenge_id, attempt_id})           → explicit-skip policy
reviewSessionService.annul({userId, review_row_id, reason})                      → существующий _annul (24h)
reviewSessionService.hint({userId, surface, challenge_id})                       → §1 демоция + masked sentence
```

Flow (owner-диаграмма): start → фиксация due-window(50) → capabilities per item (anchor/cloze/dictate/reverse) → ОБЩИЙ selector выбирает item+modality → builder применяет P8-D4C (cloze=context-before; dictate/reverse=lexeme-before, context-after если якорь) → **surface-neutral challenge** → Mini App только рендерит → **P8.3 write OFF: ответ не может попасть в review_log**.

- Бот-адаптер (`agent/telegram/review.js`) делегирует сервису; форматирование сообщений остаётся в адаптере. Mini App адаптер = BFF-роуты.
- `mode` = intent (`reading_first`|`all_due`) → `ReviewAllocationPolicy` (reading-first-v1: `almost_lapsed := lapses≥1 OR stability<1` из замера; override поднимает резервацию). Селектор ranking НЕ меняется — политика фильтрует eligible-пул ДО селектора, одинаково для обеих поверхностей; select_reason/allocation provenance пишутся в challenge.
- Один активный challenge на пользователя across surfaces — уже обеспечен `ux_agent_challenges_open` (28:46); `resume` возвращает открытый.

## §4 Migration 035 — agent_challenges surface-generalization (REBUILD)

- `surface TEXT NOT NULL DEFAULT 'telegram_bot'` (enum в коде: `telegram_bot|telegram_miniapp`);
- `telegram_chat_id`, `telegram_prompt_message_id` → **nullable** (Mini App не имеет chat-сообщения) — SQLite table-rebuild (12-step), данные переносятся, партиал-уникальный `ux_agent_challenges_open` пересоздаётся БЕЗ изменения семантики (per-user, surface-agnostic);
- `hint_used_at TEXT` (server-recorded демоция §1) + CHECK: `surface='telegram_bot' → telegram_chat_id NOT NULL`;
- Anchor-колонки (`anchor_text_key`,`anchor_order_index`,`expected_surface`) уже есть (029) — переиспользуются для dictate/reverse post-answer контекста.
- До/после: `db:backup` перед деплоем; rebuild идемпотентен в одной транзакции раннера.

## §5 Answer-binding и write-gate (branch by surface, оба fail-closed)

- Бот: reply-binding `telegram_prompt_message_id` (как сейчас, `review.js:313-315`); attempt_id из `update_id` (как сейчас).
- Mini App: `challenge_id` + scoped-session + **клиентский stable `attempt_id`** (nonce, генерится 1 раз на challenge, идентичен при ретрае) → `UNIQUE(user_id, attempt_id)`-семантика через существующий `ingestBatch` idempotency (`"agentrev:"+attempt_id`); lost-response retry возвращает прежний результат.
- Каналы: `reverse:ma | cloze:ma | dictate:ma` — **префикс = модальность** (channel_stats/grade-policy сегментация не ломается: `channelPrefix` берёт префикс до ':'), **суффикс = surface-провенанс**. `CHALLENGE_CHANNEL_RE` (`reviewer.js:49`) → `/^(reverse|cloze|dictate):(tg|ma)$/`; `ctx.viaTelegramReview` обобщается до `ctx.trustedSurface ∈ {telegram_bot, telegram_miniapp}` — выставляется ТОЛЬКО webhook-путём (бот) или requireMiniappSession-путём (BFF). HTTP `/api/agent/review` остаётся receptive-locked (без изменений).
- P8.3: `answer/skip` за флагом OFF (двойной: `MINI_APP_REVIEW_WRITE !== '1'` → 403 на BFF, плюс существующий `AGENT_REVIEW_WRITE` на reviewer-границе). Рендер challenge и hint работают; записи нет.

## §6 BFF endpoints (P8.3)

```
POST /api/miniapp/review-sessions            {mode} → start/resume → masked descriptor
POST /api/miniapp/review-sessions/:id/hint   → §1 (dictate only)
POST /api/miniapp/review-sessions/:id/answer → 403 MINIAPP_REVIEW_WRITE_OFF (до P8.4)
POST /api/miniapp/review-sessions/:id/skip   → 403 (до P8.4)
```
Descriptor (closed shape, leak-gate): `{challenge_id, kind, select_reason, explain, stimulus}`, где stimulus: cloze=`{blanked_he, sentence_ru}`; dictate=`{audio_url}`; reverse=`{gloss}`. **Ни expected, ни anchor до вердикта.**

## §7 Гейты P8.3

- **smoke:review-session (новый):** parity бот-путь vs Mini App-путь на ОДНОМ snapshot (тот же item+modality+reason) · due-window teeth (якорь на позиции >40 найден) · leak-gate (payload/descriptor без expected/anchor pre-answer; dictate/reverse без предложения pre-answer; cloze с предложением) · hint: server-side демоция, masked sentence, `context_supported` ∈ CONTEXT_SUPPORTED_SCOPES, hasProductionSuccess/hasDictateHistory игнорируют hinted-успех · write OFF: answer/skip → 403, zero review_log rows · migration 035: rebuild сохраняет данные + open-challenge uniqueness across surfaces.
- **Регрессия:** telegram-review/selector/cloze/dictate (бот через сервис!), agent-review, grade-policy, miniapp-auth/home, server-replay, memory-canon, api-smoke.

## §8 Порядок работ (v2 — после критики, см. §9 п.8)

1. **Extraction first:** `reviewSessionService` как ЧИСТЫЙ перенос из `agent/telegram/review.js` (бот делегирует; parity-гейт: поведение бота байт-идентично, сегодняшние окна сохранены);
2. **Due-snapshot unification ВНУТРИ сервиса** (§2-v2) — гейт с teeth уже существует;
3. migration 035 (additive-only, §9 п.2) + surface-provenance в createChallenge;
4. BFF start (render-only preview при write-OFF, §9 п.5) + shell-рендер трёх модальностей;
5. прод-деплой (dormant для answer/hint), owner live-verify рендера.

---

## §9 CRITIQUE ADJUDICATION (wf_df27248f-748, 2026-07-10) — ВСЕ 23 находки ПРИНЯТЫ

3 линзы (pedagogy-grader · security-parity · migration-ops), 5 BLOCKER (2 сошлись кросс-линзово) + 15 MAJOR + 3 MINOR. Ниже — обязательные дельты к §1–§8; при противоречии §9 ПОБЕЖДАЕТ.

**BLOCKER-дельты:**
1. **Hint = write-путь, не рендер** (#17/#1): hint-endpoint за `MINI_APP_REVIEW_WRITE` (в P8.3 — 403); hint отвергает `surface='telegram_bot'` (иначе бот-ответ на демоцированный challenge пишет `context_supported` на живом AGENT_REVIEW_WRITE=ON ДО P8.4). EXPECTED_SCOPE-расширение шипится только вместе с включением hint. Гейт: bot-challenge + miniapp-hint → reject; последующий бот-ответ пишет `cell`.
2. **Class-C консент + purge для якорей** (#18/#12/#16/#22): двойной text-consent recheck (cloud_texts+agent_read_texts) fail-closed в hint, в post-verdict-reveal и при cloze-resume; `_purgeClassC` расширяется на anchor-колонки НЕЗАВИСИМО от stimulus_privacy_class; revoke-каскад чистит hint-state; reveal-payload резолвится ДО `reviewer.record` и прикладывается только на терминальном исходе.
3. **attempt_id связывается с challenge СЕРВЕРОМ** (#9/#6): `attempt_eff = "ma"+sha1(challenge_id+":"+client_nonce).slice(0,40)` — зеркало бот-конструкции; кросс-challenge idempotency-replay (challenge B completed с нулевой записью) невозможен by construction; неймспейсы tg/ma разделены. Гейт: reuse nonce across 2 challenges → второй НЕ completed без строки.
4. **Surface-binding на ответе** (#10/#7): `answer/skip/hint` fail-closed при `chal.surface !== caller-surface` (`CHALLENGE_SURFACE_MISMATCH`); reviewer дополнительно сверяет суффикс канала ↔ chal.surface (tg↔bot, ma↔miniapp); бот-адаптер НЕ редоставляет чужой surface-challenge — честное «заверши в Mini App» (challenge не тронут).

**MAJOR-дельты:**
5. **Dormant-режим без DoS бота** (#11): при write-OFF `start()` render-only — дескриптор БЕЗ `createChallenge` и БЕЗ `recordExposure` (не лочит `/review` бота на 10 мин, не жжёт cooldown); явно маркирован `preview:true`.
6. **Migration 035 = additive-only, rebuild ОТМЕНЁН** (#2/#3/#4): `ADD COLUMN surface` + `ADD COLUMN hint_used_at`; `telegram_chat_id` ОСТАЁТСЯ NOT NULL — для miniapp-challenge заполняется из активного channel_link (существует by construction); enum в коде (паттерн 034), без CHECK. Класс rebuild-рисков (FK-pragma в txn, потеря 2 из 3 индексов, живые active-строки) снят целиком.
7. **Один дом факта для демоции** (#20): evidence_scope на challenge-строке НЕ мутируется; hint пишет ТОЛЬКО `hint_used_at` (dictate-only, status='active'-only — после claim подсказка невозможна, #12); reviewer выводит записываемый scope в момент record: `hint_used_at → context_supported`, иначе `cell` (перечитывает ПОСЛЕ claimForAttempt — гонка hint↔answer закрыта).
8. **Порядок работ** (#8): extraction ПЕРВЫМ (чистый перенос + parity-гейт), snapshot-фикс — вторым внутри сервиса (§8-v2 выше); двойного churn нет.
9. **Snapshot one-truth внутри start()** (#13): due/struggle/exposure материализуются ОДИН раз внутри `reviewSessionService.start` (getDue(REVIEW_DUE_WINDOW,{nowMs}) + recentStruggleKeySet + materialized exposure-set одним запросом) и передаются вниз; `dueItems` как внешний параметр УБРАН из интерфейса (§3 поправлен по построению).
10. **Чанкинг с общей collide-картой** (#14): `_dueVocMap` принимает полный 50-item список, батчится ВНУТРИ, `map`+`collide` — одни на все батчи (кросс-чанковые vocForm-коллизии ловятся). Гейт: одна vocForm у item#5 и item#45 → исключена.
11. **Семантика 40→50 честно** (#5): выбор cloze — sentence-scan-order-first ВНУТРИ due-окна; расширение окна меняет, какой cloze выберет бот — это НАМЕРЕННОЕ исправление (документировано), не тихий дрейф.
12. **createChallenge получает surface явно** (#15): валидируется по code-enum; tg-ids null-preserving (не `String(null)`).
13. **Reveal только на терминале** (#19): released-исходы (MNAR, non-dictate ktiv) → текущий «unclear»-фидбек БЕЗ предложения/подсветки (reveal-then-retry остаётся закрытым); resume released-challenge возвращает исходный masked-дескриптор.
14. **P8.4 lost-response replay** (#21): при complete персистится минимальный вердикт (enum+grade, класс A, без raw answer) на challenge-строке; повторный answer с тем же claimed_attempt_id на completed → реконструированный результат, не CHALLENGE_CLOSED.
15. **Dictate-аудио без утечки assetKey** (#23): дескриптор отдаёт challenge-scoped маршрут `/api/miniapp/review-sessions/:id/audio` (сервер мапит на assetKey; content-derived ключ инвертируем против публичного датасета — pre-answer не выдаётся).

**Гейт smoke:review-session дополняется** случаями из пп.1–4, 10 (§7 расширен по ссылке).
