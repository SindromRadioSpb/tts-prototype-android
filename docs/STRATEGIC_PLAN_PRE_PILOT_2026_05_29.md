# Стратегический план — Pre-pilot window (2026-05-29)

Документ зафиксирован 2026-05-29 после полного аудита состояния проекта.
Главные приоритеты пользователя:

1. **Пользовательский комфорт** (UX rating).
2. **Работа в группе** — cohorts для дипломного исследования (ulpan).

> **⚠ ОБНОВЛЕНО 2026-07-02 — пилот отложен на НЕОПРЕДЕЛЁННЫЙ срок (решение владельца).**
> Окно 2026-08-04…08-11 отменено; новой даты нет. Инструментовка пилота (#3 стратегического
> шорт-листа) теряет календарный приоритет и встраивается по целесообразности — ПОСЛЕ программы
> удержания (#2 FSRS + #5 канон-модель памяти + #6 reading-native retrieval), т.к. retention-loop
> изменит состав инструментируемых событий. **Триггер:** как только назначена новая дата пилота —
> #3 снова календарно-критичен, лид-тайм ~3 недели. Текущая последовательность приоритетов —
> `docs/planning/BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md` §9.
>
> _(история: 2026-06-03 пилот переносился на окно 2026-08-04…08-11; premium-трек был разблокирован,
> редизайн «Карты знаний» root-centric отгружен — см. `docs/KNOWLEDGE_MAP_REDESIGN_v3_8.md`.)_

Pre-pilot window — **~1–2 недели** до запуска пилота (исходный целевой период был 2026-06-04…06-11; затем 2026-08-04…08-11; **с 2026-07-02 — дата не назначена**).
После старта пилота — **pilot freeze zone** (большие фичи замораживаются, см. `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md`).


## Контекст на момент аудита

- v3.4.x BYOK-эпопея закрыта: Gemini / GCP TTS / GCP Translate (все BYOK через AIza-ключи), премиум HTML-документация с TOC + RTL, multi-step guided tour, onboarding modal, footer-link "🎯 Тур".
- Research Mode (Direction 11B) core shipped: cohorts A+B (`118c4f4`), in-UI cohort creation (`0f6c14d`), teacher.html i18n + help drawer (`8968548`), pre-deployment gate CLOSED 2026-05-15 (project-owner provisional sign-off), v3.3.6 knowledge-graph shipped.
- Pre-pilot maturity review зафиксирован в `docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md`. Polish bundle `4440aa5…9a1bfe2` shipped.
- Thesis Tier 1 closed: OSF preregistration DOI `10.17605/OSF.IO/ZDV9J`, IRB framework (Helsinki + GDPR), 8 chapters EN+RU драфты (~80 страниц, GLOSSARY 450+, 38 APA7 ссылок), Validity Audit `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md` (5 MUST + 6 HIGH gaps).
- Premium pipeline V5+V3+V1+V2 plan существует (~14 дней), V5+V3 pre-pilot активны.
- Prod: Hetzner CX23 + Coolify, `https://linguistpro.kolosei.com` (image slug → `.claude/PROD_OPS_PRIVATE.md`, gitignored).


## 🔴 P0 — Блокеры пилота (must close до старта)

Без этих пунктов нельзя запускать когорту — методология и приватность не пройдут защиту диплома.

| # | Задача | Категория | Оценка | Почему блокер |
|---|---|---|---|---|
| **P0.1** | Pre-test baseline collection (D2.1) | Cohorts | 1 день (CSV upload UI + thesis writeup) | Без baseline нельзя посчитать Δscore — главная outcome variable исследования. |
| **P0.2** | Primary-hypothesis lock + Bonferroni correction (D4.2) | Cohorts | 2 часа (методология) | 30 candidate переменных = inflated false-positive. Фиксируем 3–4 primary (`active_minutes_real`, `cards_added`, `notes_created`, `srs_error_rate`). |
| **P0.3** | OSF pre-registration верификация (D4.4) | Cohorts | 1 час | DOI ZDV9J уже зарегистрирован, но проверить что primary hypotheses + analysis plan там реально закреплены. |
| **P0.4** | Confound survey (D2.5) | Cohorts | 4–6 часов (5-question UI + thesis integration) | Без motivation / age / prior-exposure / hours-per-week невозможно отделить эффект приложения от других факторов. |
| **P0.5** | HE native review (единый раунд) | Cohorts + UX | ~1 неделя организационно | Закрывает consent template + `teacher.*` + `research.teacher.help.*` — один HE-носитель валидирует всё. См. `docs/HE_CONSENT_REVIEW_BRIEF.md`. |
| **P0.6** | External ulpan-teacher quiz review | Cohorts | ~1 неделя организационно (soft gate) | Recommended (не блокирующий после 2026-05-15 sign-off), но усиливает defendability. |


## 🟠 P1 — UX-комфорт (параллельно P0)

Напрямую усиливают первый приоритет (комфорт). Каждый item — самостоятельный мини-эпик.

| # | Задача | Оценка | Impact |
|---|---|---|---|
| **P1.UX.1** | RTL audit (3–4 главных экрана): Library, IDE, teacher.html, classic dashboard. Прогон через HE. | 1–2 дня | Высокий — каждый второй пользователь иврита натолкнётся на bug |
| **P1.UX.2** | Loading states + skeleton screens — везде где сейчас пустой блок 0.5–2 сек. | 1–2 дня | Высокий — «приложение зависло?» — самая частая жалоба |
| **P1.UX.3** | Error states унификация — 4xx / 5xx / network → консистентный component с retry + понятный текст. | 1 день | Средний — сейчас часть error'ов теряется в console |
| **P1.UX.4** | Empty states audit — где «нет данных» — добавить illustration + CTA. | 1 день | Средний — улучшает first-impression |
| **P1.UX.5** | iOS Safari + Android Chrome real-device тест + фиксы. | 1–2 дня | Высокий — большинство ulpan-студентов на мобильных |
| **P1.UX.6** | Performance audit — `public/index.html` 39K строк + локали 150KB — lazy-load неиспользуемых разделов. | 2–3 дня | Средний (для pilot — низкий, для v3.4 — высокий) |
| **P1.UX.7** | Accessibility basics — focus indicators, ARIA labels на icon-buttons, skip-to-content link. | 1 день | Низкий-средний (но cheap) |
| **P1.UX.8** | Feedback widget («сообщить о проблеме» → mailto или GitHub issue). | 0.5 дня | Высокий для pilot — пользователи смогут communicate |


## 🟠 P1 — Cohorts (параллельно P0)

Напрямую усиливают второй приоритет.

| # | Задача | Оценка | Impact |
|---|---|---|---|
| **P1.CH.1** | Teacher quick-start tutorial — отдельный guided tour для `teacher.html` (по аналогии с BYOK tour `7aa01a47`). | 1–2 дня | Высокий — teacher разово настраивает когорту, нужна clarity |
| **P1.CH.2** | Pre-test baseline upload UI (закрывает P0.1 кодом). | 1 день | Блокер пилота |
| **P1.CH.3** | Confound survey UI (закрывает P0.4 кодом) — 5 вопросов в student onboarding. | 1–2 дня | Блокер пилота |
| **P1.CH.4** | Withdrawal UX clarity — студент должен явно видеть как отозвать participation. | 0.5 дня | Ethics/IRB ожидает clear withdrawal |
| **P1.CH.5** | Cohort-aggregated baseline для студента (анонимизированный, k≥5) — «ваш score / средний по группе» — мотивация без приватность-нарушения. **Не путать с Direction C** (excluded per `docs/ULPAN_RESEARCH_PLAN_v3_2.md §13`). Это aggregates-only мотивационная панель, не per-student peer comparison. | 2 дня | Средний — повышает retention |
| **P1.CH.6** | Operator dashboard на проде — uptime, quota usage, error rate, cohort upload count. | 1–2 дня | Высокий — без этого пилот «слепой» для оператора |


## 🟡 P2 — Pilot execution support (operational)

Без них пилот можно провести, но если что-то пойдёт не так — нет playbook'а.

| # | Задача | Оценка |
|---|---|---|
| **P2.1** | Backup procedure (cohort data → schedule + restore drill). | 1 день |
| **P2.2** | Incident playbook — quota exceeded / server down / SW broken — что делать. | 0.5 дня |
| **P2.3** | Privacy audit checklist (final pre-launch) — GDPR, OPFS, не-личные данные на сервере. | 0.5 дня |
| **P2.4** | Pre-pilot smoke с 2–3 friendly users — найти острые углы до реальной когорты. | 2–3 дня (организационно) |


## 🔵 P3 — Thesis writing (parallel, не блокирует код)

Главы 1, 3–5, 7–8 готовы к написанию (source materials есть). Главы 2 и 6 заблокированы (literature search + pilot data).

| # | Глава | Оценка | Когда |
|---|---|---|---|
| **P3.1** | Chapter 1 — Introduction | 1–2 дня | Сейчас (нет блокеров) |
| **P3.2** | Chapter 3 — System architecture | 2 дня | Сейчас |
| **P3.3** | Chapter 4 — Privacy-preserving mode (D1 contribution) | 2 дня | Сейчас — **самая важная** |
| **P3.4** | Chapter 5 — Methodology | 1–2 дня | Сейчас |
| **P3.5** | Chapter 2 — Related Work | 3–5 дней | Можно начать (literature search) |
| **P3.6** | Chapter 6 — Results | 1 неделя | После пилота |
| **P3.7** | Chapter 7–8 — Discussion + Conclusion | 1 неделя | После Chapter 6 |


## 🟢 P4 — Deferred к v3.4 (после пилота)

Не блокирует диплом. Pilot-данные подскажут реальный приоритет.

| # | Эпик | Зачем |
|---|---|---|
| **P4.1** | Premium SRS Trainer (FSRS) | Закрывает retention proxy → реальные метрики |
| **P4.2** | Anki Connect sync | Bridges in-app → Anki ecosystem (huge user base) |
| **P4.3** | C1 — FTS5 search | Поиск по библиотеке (>500 текстов = неудобно) |
| **P4.4** | C6 — Keyboard shortcuts | Power-user комфорт |
| **P4.5** | Morphology Tier 3 (DictaBERT) | Лучшая огласовка для редких слов |
| **P4.6** | PWA install banner / iOS Add to Home Screen | Engagement через installed app |
| **P4.7** | Cloud sync (encrypted backup) | Cross-device — main user pain |


## 🟣 Рекомендованные (не в memory, но полезные)

| # | Что | Зачем |
|---|---|---|
| **R.1** | Sentry / error tracking (privacy-respecting, opt-in) | После запуска пилота — отловить молчаливые failures |
| **R.2** | UX metric: time-to-first-translation | KPI комфорта; одна метрика = один график = ясный сигнал улучшения |
| **R.3** | A/B testing infra (после пилота, когда есть N>20) | Объективно оценивать P1.UX-изменения |
| **R.4** | Onboarding completion rate телеметрия | Понять что 90% юзеров делают на демо-тексте vs своём |


## ⏱️ Распределение времени

### В pre-pilot window (1–2 недели до пилота)

```
50% — P0 блокеры пилота (P0.1–P0.6)
25% — P1.UX полировка (P1.UX.1, P1.UX.2, P1.UX.5, P1.UX.8) — самые impactful
15% — P1.CH usability (P1.CH.1 teacher tour, P1.CH.6 operator dashboard)
10% — P3.1–P3.4 thesis (главы 1, 3, 4, 5 — параллельно)
```

### Во время пилота (freeze zone)

```
70% — Thesis writing (P3)
20% — Operator support (P2)
10% — Только critical bug fixes (не features)
```

### После пилота (v3.4 epic)

```
P4 epic выбирается на основе pilot feedback + diploma defense.
Рекомендация: P4.1 (SRS Trainer) + P4.2 (Anki) — самый sustainable user value.
```


## 🎯 Рекомендованный «первый удар» в следующий заход

Если запускаемся прямо сейчас — берём **3 параллельных трека**:

1. **Cohort блокеры (1.5 дня):** P0.1 (pre-test UI) + P0.4 (confound survey UI) — закрывает методологические gap'ы и даёт ulpan-teacher'у что показать на P0.5.
2. **UX комфорт (1 день):** P1.UX.8 (feedback widget) + P1.UX.2 (skeleton states на 3-х top экранах). Самый высокий impact-per-hour.
3. **Thesis параллельно (час в день):** P3.3 (Chapter 4 — Privacy mode) — главный contribution, можно начать без блокеров.

Пользователь выбирает трек первым — план не предписывает порядок внутри pre-pilot window, только пропорции времени.


## Связанные документы

- `docs/PRE_PILOT_MATURITY_REVIEW_2026_05_21.md` — исходный maturity review (база для этого плана).
- `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md` — 5 MUST + 6 HIGH gaps (P0 список derived оттуда).
- `docs/V3_3_5_PREDEPLOYMENT_GATE_STATUS.md` §7 — pre-cohort-launch checklist (P0.6).
- `docs/HE_CONSENT_REVIEW_BRIEF.md` — структура HE review batch (P0.5).
- `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §13, §15 — privacy invariants + deployment gate (P1.CH.5 ограничения).
- `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md` — freeze zone rules (применяется после пилота).
- `docs/WRITE_UP_BRIEF.md` — главы thesis + source mapping (P3.*).
- `docs/IMPLEMENTATION_PLAN_PREMIUM_STACK_2026_05_22.md` — V5+V3+V1+V2 premium pipeline (контекст для P4).
- `docs/BYOK_SETUP.md` (+ `.en.md`, `.he.md`) — пользовательская инструкция, уже shipped.


## История ревизий

| Дата | Изменение |
|---|---|
| 2026-05-29 | Initial — план зафиксирован после full inventory project state. Базируется на pre-pilot review 2026-05-21 + validity audit + последняя BYOK-эпопея 2026-05-28. |
| 2026-06-03 | Пилот перенесён на ~2 мес → окно **2026-08-04…08-11** (pre-pilot ~2026-07-14…08-03). Премиум-трек разблокирован; запущен бескомпромиссный редизайн «Карты знаний» (root-centric, `docs/KNOWLEDGE_MAP_REDESIGN_v3_8.md`). P0-блокеры пилота → ~2026-07-14. |
| 2026-07-02 | **Пилот отложен на неопределённый срок** (владелец). #3 инструментовка → по целесообразности после программы удержания (#2+#5+#6); триггер возврата = назначение новой даты (лид ~3 нед). Утверждена последовательность: #1 context-overlay → B «Мои тексты» → retention-программа → #3 → #4 E2E-sync (recon) → AI-graded-генератор (recon). См. `BRR_CONTEXT_OVERLAY_RECON_2026_07_02.md` §9. |
