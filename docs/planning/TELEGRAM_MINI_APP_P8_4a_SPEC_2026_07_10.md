# CLG-P8.4a — канонический write-flow Mini App — SPEC-дельта

**Date:** 2026-07-10 · **Status:** design → adversarial critique → код · **Parents:** `TELEGRAM_MINI_APP_P8_4_CHARTER_REV_2026_07_10.md` (§3 hint-таксономия, §5 слайс 4a), `TELEGRAM_MINI_APP_P8_3_SPEC_2026_07_10.md` §9 (пп.1-4, 7, 12-15, 19-22)
**Скоуп:** answer/skip/annul + два hint'а для ТРЁХ существующих модальностей + down-sync. **НЕ в 4a:** manual mode (4b), listen (4c), tiles-у-диктанта, handoff/`Открыть в Зале` (P8.5).

## §1 Флаги (двойной гейт)
`MINI_APP_REVIEW_WRITE=1` разрешает BFF answer/skip/hint/annul (403 `MINIAPP_REVIEW_WRITE_OFF` иначе); reviewer-граница дополнительно требует существующий `AGENT_REVIEW_WRITE` (прод ON). Preview-режим start() при OFF сохраняется как есть.

## §2 Migration 036 (additive)
`agent_challenges` += `hint_kind TEXT` (enum в коде: `context|sentence_audio`) · `result_decision TEXT` · `result_grade INTEGER` (минимальный вердикт для lost-response replay, §9 п.21 — класс A, без raw answer).

## §3 Reviewer-дельты (`agent/reviewer.js`)
1. `CHALLENGE_CHANNEL_RE` → `/^(reverse|cloze|dictate):(tg|ma)$/`.
2. Trust-флаги: challenge-ветка требует `ctx.viaTelegramReview===true` ИЛИ `ctx.viaMiniappReview===true`; **surface-binding (§9 п.4):** `chal.surface`↔ctx (`telegram_bot`↔viaTelegramReview, `telegram_miniapp`↔viaMiniappReview) И суффикс канала↔surface (`:tg`↔bot, `:ma`↔miniapp); нарушение → `CHALLENGE_SURFACE_MISMATCH` (fail-closed, до claim).
3. `EXPECTED_SCOPE`-проверка НЕ меняется (равенство канону по prompt_kind на challenge-строке — challenge-scope никогда не мутируется, §9 п.7).
4. **Производный записываемый scope:** после `claimForAttempt` challenge ПЕРЕЧИТЫВАЕТСЯ (гонка hint→claim: hint валиден только при status='active', claim закрывает окно; свежая строка = истина); `meta.evidence_scope = (prompt_kind==='dictate' && hint_kind==='context' && hint_used_at) ? 'context_supported' : chal.evidence_scope`.
5. `grade-policy.js:41`: `CONTEXT_SUPPORTED_SCOPES += { context_supported: 1 }` + **gate-consumers-sweep**: hasProductionSuccess (hinted-успех не латчит production), isContextSupportedRow → hasDictateHistory (hinted-диктант ≠ dictate-history), channel_stats producer, D1-политика. Гейт-кейсы на каждого потребителя.

## §4 reviewSessionService (новые методы)
**`answer({userId, surface, challenge_id, client_nonce, answer})`:**
1. флаги → 403; `chal = getForReviewer(userId, challenge_id)` → 404; surface-check (§3.2);
2. **`attempt_eff = "ma" + sha1(challenge_id + ":" + client_nonce).slice(0,40)`** (§9 п.3 — challenge-bound by construction, неймспейс отделён от `tg…`; nonce: клиент генерит 1 раз на challenge, ретрай шлёт тот же);
3. **lost-response replay (§9 п.21):** `chal.status==='completed'`: `claimed_attempt_id===attempt_eff` → `{recorded:true, replayed:true, decision:result_decision, grade:result_grade}` (reveal НЕ переотдаётся — якоря вычищены при closure, честная деградация); иначе `CHALLENGE_CLOSED`;
4. **reveal-до-record (§9 п.22):** consent-гейтированная резолюция reveal-пейлоада (полное предложение he+ru по anchor-указателям из артефактов; consent отозван/артефакт purged → reveal=null, честно) — В ПАМЯТИ, до записи;
5. `reviewer.record(ctx{viaMiniappReview:true}, {item_key: chal.item_key, answer, channel: chal.review_mode, attempt_id: attempt_eff, challenge_id})`;
6. **исходы (§9 п.13,19):** `recorded:true` → attach reveal + `completeWithResult` персистит `result_decision/result_grade`; `dictate_gate` (near_miss → cancel, ТЕРМИНАЛЕН) → attach reveal (challenge сожжён — reveal-then-retry закрыт); released (MNAR/ktiv/abstain) → `recorded:false`, **БЕЗ reveal**, challenge жив (ретрай с НОВЫМ nonce легален).

**`skip({...})`:** те же шаги 1-4 + `reviewer.record({skipped:true, ...})` (терминален → reveal). Кнопка «Не знаю» = skip (D1-Hard-семантика как в боте).

**`hint({userId, surface, challenge_id, kind})`:** флаги; **только surface='telegram_miniapp'** (bot-challenge → 403 `HINT_NOT_AVAILABLE`, BLOCKER §9 п.1); `kind='context'`→только dictate, `kind='sentence_audio'`→только cloze (иначе 409); **только status='active'** (после claim — 409, §9 п.12); **двойной text-consent recheck** (cloud_texts+agent_read_texts) до отдачи любого предложения (fail-closed → `HINT_UNAVAILABLE`); `markHint(challenge_id, kind)` — сервер пишет `hint_used_at+hint_kind` ОДИН раз (повтор → тот же payload, не второй факт); ответ: `context` → `{gloss, masked_he, sentence_ru}` (target замаскирован; при отсутствии якоря → `HINT_UNAVAILABLE`); `sentence_audio` → `{audio_token}` предложения (ассет по дефолт-профилю; нет ассета → `HINT_UNAVAILABLE`, кнопка у клиента прячется).

**`annul({userId, review_row_id, reason})`:** флаги на BFF → `reviewer.record({annul_of, reason})` (собственные гарды reviewer: только `agent:*`-source, 24ч, annullable kinds — без изменений).

## §5 Якоря для dictate/reverse (fork-4C)
Новый `agentClozeRepo.findAnchorForItem(userId, itemKey)`: тот же bounded-scan (consent-гейты, voc-forward-match, function-gate, TIME_BUDGET_MS), возврат `{text_key, order_index}` | null. Вызывается в `_capsForSurface` при создании dictate/reverse-challenge — на строку пишутся ТОЛЬКО указатели (контент предложения НЕ хранится на классе A; отдача — всегда live-резолюция с consent-recheck). **`_purgeClassC`-дельта (§9 п.2):** при closure якорь-колонки чистятся для ВСЕХ классов (второй UPDATE `WHERE stimulus_privacy_class != 'C'` на anchor_*); класс-C полный purge без изменений.

## §6 BFF + shell
- `POST /api/miniapp/review-sessions/:id/answer {nonce, answer}` · `/skip {nonce}` · `/hint {kind}` · `POST /api/miniapp/review-events/:id/annul {reason}` — все за requireMiniappSession+CSRF+rlMiniapp.
- Дескриптор cloze получает `stimulus.tiles` — server-shuffled буквы expected-surface (crypto-shuffle; owner-решение: тайлы у cloze без демоции; leak-gate обновляется: полная строка surface отсутствует, letter-multiset допущен и документирован).
- Shell: поле ответа (keyboard) + тайловая сборка для cloze; кнопки «Проверить»/«Не знаю»; hint-кнопки (🔊 у cloze, «Показать контекст» у dictate — прячутся на HINT_UNAVAILABLE); result-карточка: вердикт (✅/≈/✗/skip) + grade + reveal-предложение (target подсветкой) + «Дальше» (новый start) — честные состояния для replayed/closed/write-off.
- Ответ после вердикта: challenge терминален → «Дальше»; released → «непонятно, попробуй ещё» без reveal.

## §7 Down-sync
Ничего нового на сервере: строка идёт штатным ingest → `GET /api/learner/log` (rowid-cursor) → PWA syncDown. Гейт: строка видна через readLog после верного after_rid; `learnerProjectionRepo.oracle` чист (state==replay(log)); полная OPFS-нога уже покрыта agent-review-smoke (тот же source-пайплайн `agent:review`).

## §8 Гейт smoke:miniapp-review (новый) — матрица
happy-path 3 канала `:ma` (ровно одна строка, верный evidence_scope/провенанс/канал) · attempt_eff: кросс-challenge nonce-reuse НЕ реплеит чужой результат и не жжёт challenge без строки (анти-§9 п.3) · lost-response: same nonce на completed → реконструированный вердикт, ноль новых строк · surface-mismatch: miniapp-ответ на bot-challenge → CHALLENGE_SURFACE_MISMATCH, zero-write · hint-матрица (§3 чартера): context-hint→записанный scope context_supported; non-hinted dictate→cell; sentence_audio→scope cloze + hint_kind в строке challenge; hint на bot-challenge/чужой модальности/processing → 403/409; hint-consent-revoke → HINT_UNAVAILABLE · hinted-успех: hasProductionSuccess=false, hasDictateHistory=false (потребители CONTEXT_SUPPORTED_SCOPES) · released (MNAR) → без reveal, challenge active, ретрай новым nonce пишет одну строку · skip → одна строка kind=skip · annul: своя строка, 24ч-окно, чужой source → reject · reveal-до-record: cloze answer возвращает полное предложение при purge-гонке (резолюция до записи) · write-off (оба флага) → 403 и zero-write · down-sync §7 · **регрессия:** telegram-review/selector/cloze/dictate · agent-review · grade-policy юниты · review-session 22/22 · miniapp-auth/home · server-replay · memory-canon · api-smoke.

## §9 Rollout
Код ships dormant (`MINI_APP_REVIEW_WRITE` unset). Owner: включить флаг в Coolify → live-verify (одна cloze + один dictate с hint и без, annul, обрыв сети на submit → replay) → зафиксировать. Rollback: флаг off — записанные строки остаются (§18 recon).

---

## §10 CRITIQUE ADJUDICATION (wf_0996f9ea-0e3, 2026-07-10) — ВСЕ 23 ПРИНЯТЫ; при противоречии §10 ПОБЕЖДАЕТ

**BLOCKER-дельты:**
1. **Бот-гард на чужой surface (#1/#17):** `startReview` open-challenge ветка проверяет `(open.surface||'telegram_bot') !== 'telegram_bot'` → честная нота «заверши в Mini App», БЕЗ send/setPromptMessageId/exposure/decline; `submitAnswer` на foreign-surface challenge → null (reply, «не сейчас», «не знаю» НЕ трогают challenge). Обе стороны в гейт-матрице.
2. **Реплей реджекта ≠ успех (#7):** `_ingestOne` применяет new/dup-проверку И к replayed-результату (сохранённый результат несёт счётчики) — фантомный `recorded:true` с нулём строк невозможен. Гейт: committed-batch reject + retry same nonce → recorded:false, challenge НЕ completed, result_* пуст.
3. **Annul под обоими флагами (#14/#3/#8):** BFF annul-роут требует `MINI_APP_REVIEW_WRITE` И `reviewer.flagOn()` (reviewer._annul не трогаем — bot-путь через tools уже гейтится). Гейт: AGENT_REVIEW_WRITE=0 → annul 403 zero-write.
4. **Hint: payload-first, latch-атомарно (#15/#6/#12):** сначала ПОЛНАЯ резолюция (consent+якорь+masked_he/audio); только при готовом payload — `UPDATE … SET hint_used_at=?,hint_kind=? WHERE challenge_id=? AND status='active' AND hint_used_at IS NULL`; changes=0 при прежнем hint → идемпотентная ре-резолюция (свежий токен), changes=0 из-за claim → 409; провал резолюции → HINT_UNAVAILABLE БЕЗ записи состояния. Post-claim re-read — единственный источник challenge-state для scope.

**MAJOR-дельты:**
5. **Персист вердикта внутри complete() (#2/#11):** `complete(userId, challengeId, attemptId, result?)` — ОДИН UPDATE (status/completed_at/result_decision/result_grade WHERE processing AND claimed_attempt_id=?); reviewer передаёт вердикт; возврат проверяется (0-changes → громкий лог). Replay-контракт: на closed-статусах при `claimed_attempt_id===attempt_eff` и заполненных result_* → реконструированный вердикт (не CHALLENGE_CLOSED). Purge-списки result_* не трогают.
6. **ЯКОРЯ НЕ ПЕРСИСТЯТСЯ для dictate/reverse (#4 — упрощение):** findAnchorForItem-при-create ОТМЕНЁН; вместо него `resolveAnchorLive(userId, itemKey)` (bounded-scan, consent-гейты) вызывается ТОЛЬКО в hint/reveal. Следствия: нет create-латентности, нет якорей на классе A, §5-purge-дельта НЕ НУЖНА (класс-C purge как был), нет расхождения форм bot/miniapp-строк.
7. **Анти-double-row (#10):** ответ на `processing` c `claimed_attempt_id ≠ attempt_eff` → reject `RETRY_WITH_ORIGINAL` (не тихий re-claim); shell персистит nonce per challenge_id (localStorage) и на этот код повторяет исходным nonce.
8. **Reveal fail-closed default (#16):** attach ТОЛЬКО на `recorded:true` ИЛИ `dictate_gate`; ЛЮБОЙ ok:false / recorded:false / исключение → reveal discarded. Гейты: ANSWER_TOO_LONG и TEXT_CONSENT_REVOKED → без reveal, challenge active.
9. **Audio-токены с привязкой (#18):** токен = {assetKey, userId, challengeId?, classC, exp}; маршрут сверяет userId сессии; classC → double-consent recheck В МОМЕНТ стрима; закрытие challenge/revoke-каскад удаляет его токены. Гейт: hint → revoke → валидный токен → 404.
10. **Провенанс в канон (#19):** `GRADE_ARGS += input_mode` (enum tiles|keyboard), `META_ALLOW += input_mode, hint_kind`; reviewer копирует hint_kind из re-read challenge, input_mode из args. Гейт: tiles-ответ → meta.input_mode='tiles'; sentence_audio-cloze → meta.hint_kind.
11. **Tiles ≥3 (#20) + не в preview (#21):** tiles только при len(expected_surface)≥3 (зеркало dictate-правила) и только на challenge-backed пути (preview-дескриптор без tiles). Гейты на оба.
12. **Grade-policy = клиент-шаренный модуль (#13/#23):** изменение CONTEXT_SUPPORTED_SCOPES требует **SW CACHE_VERSION bump** (правило проекта) + отметка version-skew окна в коммите.
13. **Hint sticky через release (#5) — ЯВНО:** hint per-challenge липкий (пользователь ВИДЕЛ контекст; retry после MNAR остаётся context_supported) — документировано, не баг.
14. **Токены после рестарта (#22):** shell на AUDIO_TOKEN_INVALID → re-POST review-sessions (resume ре-минтит); повторный hint = ре-резолюция + свежий токен; single-process допущение отмечено.
15. **Кросс-surface annul запрещён (#9):** BFF annul принимает только строки, чей meta.challenge_id резолвится в challenge с surface='telegram_miniapp' этого пользователя (session-local undo). Бот-строки из Mini App не аннулируются (v1). Гейт: annul :tg-строки → reject.
