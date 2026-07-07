# Handoff

## State
- **P7.2a reverse:tg + challenge-binding — SHIPPED (v3.11.120), deploy DORMANT (AGENT_REVIEW_WRITE
  OFF на проде).** Полный пользовательский review-поток в Telegram: /review → RU-глосс prompt
  (ForceReply) → reply-ответ → challenge-bound grader → single-use write → FSRS → безопасный verdict.
  Owner-вариант A: строгий reverse ТОЛЬКО на однозначных словах (strictSafe ~25%), БЕЗ синоним-приёма
  (карта из свободного глосса ненадёжна — критика wf_15f4c1ae). Гейт **smoke:telegram-review 32/32**
  (14 owner-пунктов + база). Регрессия зелёная: pairing 33 · content 15 · agent-review 66 ·
  grade-policy 26 · memory-canon 63 · fsrs 30 · api-smoke.
- Файлы: migrations/028_agent_challenges.sql · db/agentChallengeRepo.js · db/keyingService.js
  (glossForItemKey+strictSafe) · public/js/grade-policy.js (skip→D1 scoped-production +
  hasProductionSuccess исключает lexeme) · db/learnerLogRepo.js (META_ALLOW +=evidence_scope/sense_id/
  challenge_id) · agent/reviewer.js (challenge-bound) · agent/telegram/{review,api,router,format,content}.js
  · server.js (webhook dispatch + /api/agent/review guard + consent-off cancel).

## Next
1. **Owner live-verify P7.2a на проде:** включить AGENT_REVIEW_WRITE=1 в Coolify → /review в боте
   @LinguistProMentorBot → ответить → проверить, что запись доехала (Зал видит через down-sync) →
   ЗАМЕРИТЬ реальное покрытие strictSafe на профиле владельца (если очень низко → приоритизировать
   P7.2b cloze сразу). Выключить флаг после проверки, если не готов к постоянной работе.
2. Затем по стадированию: **P7.2b cloze** (контекст-cloze; снимает многозначность контекстом —
   решает то, что вырезано из reverse) → P7.2c dictate (аудио, инфра) → P7.2d premium selector.
3. Синоним-приём (owner-решение #4) отложен: нужен КУРИРУЕМЫЙ sense→синонимы датасет (отдельный слайс).

## Context
- Каноны: docs/planning/TELEGRAM_P7_2_REVIEW_ASSETS_PROPOSAL_2026_07_07.md + ..._SPEC_..._v3.md
  (в конце — v3→v4 адъюдикация критики, вариант A). Замер: docs/research/telegram-p72-gloss-ambiguity/.
- Reply-binding = ОДИН механизм: ForceReply + текстовые токены «не знаю»/«не сейчас» (inline+ForceReply
  несовместимы, callback_query не обрабатывается — критика). Ответ = reply на сохранённый
  telegram_prompt_message_id, иначе НЕ review.
- Транзакц. граница: txnLock НЕРЕЕНТРАНТЕН → «claim+ingest в одной txn» = дедлок; вместо этого
  recoverable processing (claim active→processing одним statement → ingest своя txn → complete;
  MNAR/ktiv → release). Детерминированный review-id = LC.reviewId с reviewed_at=challenge.created_at
  (совместим с merge/down-sync; retry идемпотентен).
- Гейт-урок: успешные ответы продвигают FSRS-due → слово перестаёт быть due; между тестами
  resetState() (сброс cooldown-exposure + due). Reply-таргет читать ИЗ БД (setPromptMessageId
  асинхронен относительно call-log).
- Git: многострочные коммиты — `git commit -F файл` (heredoc), НЕ PowerShell here-string в Bash.
- ⚠ Инвариант: запись ТОЛЬКО challenge-bound · production-unlock только на webhook-trusted пути
  (ctx.viaTelegramReview; /api/agent/review реджектит challenge_id+production) · privacy=A (сырой
  ответ не персистится: reviewer meta, bot_action_log.command='review-answer', stdout чисты) ·
  consent recheck перед write · флаг проверяется на пишущей границе (reviewer, не только tool-роутер).
