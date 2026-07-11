# Агентный ментор — оставшаяся программа внедрения (Зал · Telegram · Студия)

**Дата:** 2026-07-11 · **Прод:** v3.11.151 · **READ FIRST для новой сессии.**
Составлен после закрытия: CLG-P0→P6+P9 · P7.0→P7.2d (production-запись LIVE) · P7.3a+c (за флагом) · P8.1→P8.5 (Mini App owner-live) · Room-continuity R1→R4 (`ROOM_DUE_CONTINUITY_2026_07_11.md`).

## §1 Текущее состояние (проверено live 2026-07-11)

- **Прод:** `https://linguistpro.kolosei.com`, деплой = push в main → Coolify (Dockerfile).
- **Флаги:** `AGENT_REVIEW_WRITE=1` **ON** (весь P7.2 write-path живой) · `AGENT_NUDGE_ENABLED` **OFF** (P7.3a/c задеплоены, ждут активации) · Mini App живой (`@LinguistProMentorBot`), `PUBLIC_BASE_URL` задан (dictate-аудио работает).
- **Счётчики ПК↔TG:** единая типология 4 метрик (К повторению · Сделано сегодня · В работе · В расписании), единые каноны, синк-каденс R4b (ре-синк на visibility+после сессии, троттл 90с). ⓘ «Мои показатели» в Зале объясняет всё, включая all-surface стрик (R3.3).
- **Due-петля кросс-поверхностна:** метка в Зале сорсится сразу (R1), несорсованный backlog дренируется boot-heal'ом по флексиям парадигмы (R4a: 179→104 на момент закрытия, ~48/бут), несобираемое сервится word-only с честным чипом (R2).

## §2 Оставшиеся пункты (порядок = рекомендация)

| # | Пункт | Поверхность | Канон/спека | Статус | Размер |
|---|---|---|---|---|---|
| 1 | **P8.6 — ops rollout Mini App** | TG/MA + инфра | `TELEGRAM_MINI_APP_P8_RECON` §15/§19 | спека есть; в основном owner-действия по ранбуку (агент готовит чек-лист и верифицирует) | M |
| 2 | **Активация нуджей** (`AGENT_NUDGE_ENABLED=1`) + live-verify первого DUE_READY-нуджа и backoff-петли (/notoday, /mute) | TG | `TELEGRAM_P7_3_PROACTIVE_RECON` | код задеплоен, флаг OFF | S |
| 3 | **P7.3d — premium reason-aware нуджи** (SKILL_GAP_AVAILABLE через selector-сигнал, разные типы возврата; анти-over-claim правила из критики уже зафиксированы) | TG | `TELEGRAM_P7_3d_REASON_AWARE_RECON_2026_07_09.md` | recon готов, код не начат | M |
| 4 | **Web Push P4.5** — PWA-нудж «N слов ждут» без содержимого; ОБЯЗАН уважать единый кросс-канальный суточный бюджет `notification_preferences` (TG+Push суммарно) | Зал/PWA | `AI_MENTOR_RECON` §8 | не начат | M |
| 5 | **Агент в Студии**: per-row 🤖-кнопки + token_index (остаток скоупа P9 «за P10-горизонтом») + сценарий «агент генерирует draft → [Открыть в Студии]» (recon §2.2) | Студия | `AI_MENTOR_RECON` §2.2, P9-остаток | не начат; ⚠ Studio live-JS INLINE в index.html (память: feedback_studio_live_source_inline) | L |
| 6 | **Misconception-карта**: из зачатка (constructs/summary) в полный блок с действиями | Зал+MA | часть P10 | зачаток shipped (P9) | M |
| 7 | **CLG-P10 — Premium Analytics**: weekly digest · personal curriculum engine («12 знакомых + 4 ЗБР») · retention-метрики; teacher dashboard за горизонтом | все | `AI_MENTOR_RECON` §9 P10 | не начат | XL |

### P8.6 — чек-лист (§19 recon, закрыть ДО public/pilot)
Ротация `AUDIO_UPLOAD_TOKEN` · firewall Coolify :8000 (ранбук в `.claude/PROD_OPS_PRIVATE.md`) · scrub приватных доков · rollback-drill **с MA-происхождёнными review-событиями** · верификация kill-switch `MINI_APP_ENABLED` · джобы purge сессий/протухших challenge · полнота delete/export по таблицам мигр. 034–038 · rate-limit burst · аудит «нет сырого initData/ответов в логах».

## §3 Процессные инварианты (не пересматривать без owner)

1. Роли-линзы R1–R17 автоматически (`docs/PROJECT_ROLES.md`); платформенные инварианты — `AI_MENTOR_RECON` §10 (один селектор, детерминированный грейдер, MNAR, annul-канон, down-sync обязателен, dual-write запрещён).
2. Существенный дизайн → adversarial-критика (workflow, малый фронт) ДО кода; адъюдикация в канон-док.
3. Каждый слайс: спека-дельта → код → независимые гейты (явные exit-коды!) → SW bump при задетых precached-файлах → commit+push → deploy-poll → **live-verify на прод-профиле owner (kapture)**.
4. Новые `tt()`-строки Зала → все три локали ru/en/he (fallback-аргумент недостижим). MA-строки — в словаре miniapp-ui.js.
5. «Sourced == servable», честные empty-state, никакой фабрикации cloze; identity-гейт канон-кейером на каждом heal.
6. Env-ловушки: headless-OPFS (same-page тест-хуки `__r31…`/`__r4HealDrain`), smoke-зависания при RAM<1GB (утёкшие webview/сироты chrome — проверять `Get-CimInstance`), `tokenize` возвращает ОБЪЕКТЫ {text,isWord}.

## §4 Промт для новой сессии

```
Продолжаем внедрение агентного ментора LinguistPro (Зал · Telegram · Студия).

READ FIRST: docs/planning/MENTOR_ROLLOUT_NEXT_2026_07_11.md — там текущее
состояние (прод v3.11.151+), таблица оставшихся пунктов §2 с канонами и
рекомендованным порядком, процессные инварианты §3.

Стартуй пункт №1 — P8.6 ops rollout: подготовь ранбук-чеклист по §19
TELEGRAM_MINI_APP_P8_RECON (что делаю я как owner, что автоматизируешь и
верифицируешь ты), выполни автоматизируемое, останови на шагах, требующих
моих секретов/доступов. Затем по порядку §2 — каждый следующий пункт после
моего «Стартуй N».

Дисциплина прежняя: роли-линзы автоматически; существенный дизайн — через
adversarial-критику до кода; гейты с явными exit-кодами; SW bump; после
деплоя — live-verify на моём прод-профиле через kapture (вкладка
linguistpro.kolosei.com/library.html); продуктовая зрелость — честные
тексты, локали ru/en/he, объяснимые счётчики.
```
