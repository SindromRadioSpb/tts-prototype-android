# Handoff

## State
- **CLG-P9 «дом наставника» ЗАКРЫТА** (v3.11.114, owner live-verified 2026-07-06).
- **Решения P7 приняты владельцем** — канон docs/planning/TELEGRAM_P7_DECISION_2026_07_06.md
  (READ FIRST): «бот — тонкий канал, не новый учебный мозг»; стадирование P7.0a→P7.3;
  развилки: webhook in-process MVP · отдельный pairing-consent (формулировка утверждена) ·
  bot_action_log-lite + ОБЯЗАТЕЛЬНЫЙ dedup update_id · MVP только command-response.
  Readiness-анализ: TELEGRAM_P7_READINESS_2026_07_06.md.
- **P7.0a annul-семантика SHIPPED v3.11.115** (спека → adversarial-критика wf_1bf34023
  (3 BLOCKER+8 MAJOR) → код; адъюдикация — в конце decision-дока). Ядро: двухпроходный
  fold (только review/skip-цели; un-annul НЕ поддерживается; «annul меняет ТОЛЬКО
  projection»); clearSrsState на клиенте (NOT NULL srs_interval → нули!); withoutAnnulled
  для D1-вызывателей; LemmaCanon.annulId (reviewId для annul ЗАПРЕЩЁН);
  ENGINE_VERSION=fsrs6-core-v2 + client one-shot heal (sync_state annul_engine_v) +
  oracle rebuild на mismatch + oracle.annul_rows; SQL-агрегаты annul-aware.

## Gates
server-replay 65/65 (golden-v2 ×8 annul-векторов; v1 БАЙТ-СТАБИЛЕН = do-no-harm;
e2e annul-to-null удаляет проекцию) · memory-canon 63/63 (+6 клиентских annul) ·
fsrs 30/30 · agent-plan 32/32 (+2: annul гасит fresh_struggles) · agent-explain 43/43 ·
learner-graph 14/14 · mentor-home 25/25 · grade-policy 24/24 · api-smoke · cloud-sync
(вердикт последнего прогона — проверить перед пушем, если сессия оборвалась до него).

## Next
1. **P7.0b — серверный детерминированный грейдер + gold-набор.** Контракт УТВЕРЖДЁН
   владельцем: категории correct/accepted_variant/near_miss/wrong/empty/ambiguous;
   провенанс {policy_version, normalizer_version, resolver_version, expected_form_id,
   matched_variant, decision, reason}. Состав: normalizeAnswer (skeleton/ktiv male-haser
   через keyingService) · resolveHebrewVariants · classifyAnswer · D1 через ОБЩИЙ
   grade-policy.js (rows фильтровать withoutAnnulled!) · gold fixtures (источники:
   pealim-infl-v12 9279 парадигм, hebrewNorm, методика R1.0 gold eval) ·
   smoke:grader-gold с порогом. LLM в грейде НЕ участвует (advisory без grade).
2. **P7.0c — активация record_review_answer** (flag→staging→web-smoke: запись через
   штатный ingest (source='agent:*') → проекции → annul ошибочного грейда → down-sync
   в OPFS). Минтер-контракт annul: item_key = item_key ЦЕЛИ (резолв по (user_id,
   annul_of), цели нет = reject; sent:-цели = reject — их state вне recompute-пути).
3. P7.1 pairing+channel_links+webhook+read-only команды (/start /link /unlink /status
   /plan /explain /due /summary /help; consent-копия при pairing) → P7.2 /review.

## Context
- Прод-деплой P7.0a: ожидание oracle.annul_rows == 0 (писателя ещё нет) — виден
  в ответе /api/learner/oracle; ☁-модал сам перезапустит rebuild при mismatch.
- Урок харнесса: chrome-headless-shell CPU НЕ показывает активность рендереров
  (отдельные процессы) — «завис ли смок» мерить инструментированной копией.
- Урок схемы: word_status.srs_interval/reps/lapses NOT NULL DEFAULT 0 — «очистка»
  расписания = NULL только для due/stability/difficulty/reviewed_at/scheme.
