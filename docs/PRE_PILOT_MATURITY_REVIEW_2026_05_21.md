# Pre-Pilot Maturity Review — 2026-05-21

> **Назначение.** Зафиксировать ревизию продуктовой зрелости накануне
> запуска пилота, чтобы при следующих планировочных сессиях не
> переизобретать пути развития с нуля.
>
> **Окно до пилота:** 1–2 рабочие недели (исходно — ориентировочно
> 2026-06-04…06-11). **⚠ ОБНОВЛЕНО 2026-06-03: пилот перенесён на ~2 месяца →
> новое окно 2026-08-04…08-11; новое pre-pilot окно ~2026-07-14…08-03.**
>
> **Опорный коммит на момент ревизии:** `6320ca3` (Railway deploy
> verified 2026-05-21; полный i18n teacher.html + Help-drawer на
> RU/EN/HE, admin-gated cohort creation, `RESEARCH_ADMIN_TOKEN`
> установлен в Railway Variables).

---

## 1. Где находится продукт сейчас (снимок состояния)

| Слой | Зрелость | Комментарий |
|---|---|---|
| Студенческий UX (Classic/IDE) | **Зрелый** | v3.7 mobile redesign + context continuity, premium IDE header, bottom tab bar. |
| Smart Learning Graph (v3.6) | **Pilot-ready gate пройден** | Confirm-panel, durable suggestions, A5 progress, k-anonymity чистый. |
| Calibrated quiz (v3.3.5) | **Provisional sign-off** | Item-bank внешним учителем-носителем ещё не ревьюился. |
| Research mode (Direction 11B) | **Архитектурно закрыт 2026-05-13** | Server endpoints + consent + k=5 + withdrawal + transparency. |
| Teacher dashboard | **Полный i18n + Help-drawer + in-UI cohort creation** | Закрыто `8968548`/`0f6c14d` в этой сессии. |
| Морфология (v3.2) | **34K/68K в проде** | 250K dict отложен — но пайплайн готов (см. §5). |
| SRS | **Stub Trainer + Anki export** | Bidirectional sync — v3.4 backlog (см. §6). |
| HE-локализации | **Best-effort, ждут native review** | Один внешний носитель закрывает три артефакта разом (см. §4). |

## 2. Главное противоречие зрелости (узкое место)

Технически выстроена research-grade EdTech-платформа. **Пилот не
запускался ни разу.** Все плановые документы (`§9 readiness
checklist` в `ULPAN_RESEARCH_PLAN_v3_2.md`, `PARALLEL_WORK_PLAN_DURING_PILOT.md`,
`PILOT_READINESS_GATE_v3_6.md`) предполагают:
**пилот → реальная когорта → диплом**. Между этими шагами и текущим
кодом лежит **операционная пустота**, а не инженерный долг.

→ Это и есть основное узкое место. Любой следующий код-цикл, не
запускающий пилот, отодвигает диплом ещё на месяц.

## 3. Что закрывается в окне 1–2 недели (операционное)

Упорядочено по разблокирующей силе. Время — грубая оценка одним
разработчиком.

| # | Задача | Объём | Разблокирует |
|---|---|---|---|
| 🔴 1 | **Запустить пилот на 2–3 friendly users.** Tag `v3.7.0-pilot`, frozen snapshot, 7 дней работы, валидация end-to-end по `§9 readiness checklist`. | 0.5–1 день setup + 7 дней наблюдения | Диплом (без этого ничего не двинется) |
| 🟡 2 | **HE native review** для трёх артефактов одним заходом: `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (Q3), новый `teacher.*` namespace, новый `research.teacher.help.*`. Брифы готовы — `docs/HE_CONSENT_REVIEW_BRIEF.md`. | 0 дней наших + ожидание внешнего ревьюера | Реальную ulpan-когорту (Hebrew users) |
| 🟡 3 | **Quiz item-bank внешний ревью.** `docs/QUIZ_ITEM_BANK_REVIEW_BRIEF.md` уже готов. До реальной когорты квиз нельзя считать calibrated. | 0 дней наших + ожидание ревьюера | Calibrated quiz outcome integration |
| 🟢 4 | **250K morph dict в прод** (см. §5 ниже). Пайплайн готов: `npm run build:morphology:full` + `full-dict-live-smoke.js` уже существуют. | **2–3 дня** | Закрывает «отложено в v3.3 backlog» из памяти |
| 🟢 5 | **Backfill оставшихся hardcoded RU/EN строк в `teacher.js`** (table column labels, «Нет данных для отображения», chip-strip dynamic text). Известный scope-limit предыдущего коммита. | 2–4 часа | Чистая 3-язычная teacher.html в HE-обзоре |
| 🟢 6 | **v3.7 P3/P4 polish** (accordion live state, filter chips, FAB, stats widget) из `MOBILE_UX_REDESIGN_PLAN_v3_7.md`. | 1–2 дня выборочно | Cosmetic полировка (не блокер) |
| 🟢 7 | **README-раздел про `RESEARCH_ADMIN_TOKEN`** для оператора Railway. Сейчас только в `.env.example` комментарием. | 30 минут | DevOps-документация для будущих развёртываний |

## 4. Стратегические пути (парковка после пилота)

Сохраняем как «не сейчас, но не забыто».

1. **Диплом-write-up.** Методология, статистический анализ, текст. Код перерос то, что нужно для одиночного correlational diploma; **переключение с разработки на написание текста** — главная скрытая критическая зависимость.
2. **Real cohort study (после пилота).** Реальная ulpan-группа, 6–12 недель. Эмпирическая часть диплома.
3. **Anki Connect bidirectional sync (v3.4).** См. §6 ниже — НЕ закрывается в pre-pilot окно, остаётся в v3.4 backlog.
4. **Multi-cohort comparative дизайн.** Инфраструктура (`teacher.html` D12 chip strip, cross-cohort CSV) есть — нет дизайна эксперимента. «Cohort A: app+traditional vs Cohort B: traditional only» = переход от single-group correlational к quasi-experimental, существенный методологический апгрейд.
5. **Open-source / federated research platform (v5).** `ULPAN_RESEARCH_PLAN §5 Stage 5`. После диплома — естественный путь, анонсируется в самом дипломе как контрибуция.

## 5. 250K morph dict — почему теперь операционное, а не стратегическое

В первой версии ревизии (моя устная) 250K dict был в «не трогать сейчас». Перепроверка показала, что это было слишком категорично:

- **Пайплайн уже целиком готов:**
  - `scripts/morph/build-morphology.mjs` — собирает `_full` tier
  - `scripts/morph/extract-hspell-stems.c` — извлекает из hspell
  - `package.json`: `build:morphology:full` команда зарегистрирована
  - `scripts/morph/full-dict-live-smoke.js` — end-to-end smoke на `DecompressionStream`-decode
  - `public/js/morph-provider.js` — уже знает про `_full` suffix и `.bin.gz`
- **Артефакт self-contained:** SW-cached статический файл, никаких API/server-side изменений.
- **Риск низкий:** провал собрать → не релизим, существующий 68K dict остаётся в проде.
- **Что реально нужно сделать:**
  1. `npm run build:morphology:full` → произвести `public/morph/heb_morphology_full.bin.gz` + meta.
  2. Проверить размер и время загрузки (особенно на mobile Safari — есть ограничение SW cache quota).
  3. `npm run smoke:morph:live` — full-dict end-to-end.
  4. Перформанс-smoke на больших таблицах (не должна деградировать таблица из 100+ предложений).
  5. Закоммитить артефакт + tag bump.

**Оценка**: 2–3 рабочих дня одного разработчика, при условии что hspell-stems корпус и build-окружение в порядке. Если корпус не на руках — добавить ещё 0.5 дня на acquire.

## 6. Anki Connect bidirectional sync — почему НЕ в pre-pilot окно

Несмотря на то, что в текущей `SRS_STRATEGY_v3_2.md` retention proxy
обозначен как «временный до v3.4 Anki Connect sync» — закрывать
это в окно 1–2 недели **не следует**:

- **Контрактная сложность:** двусторонний sync требует HTTP-соединение к локально-запущенному Anki приложению пользователя (Anki Connect plugin). Это новый класс зависимости (требует Anki установлен у студента) — не offline-first invariant.
- **Объём работы:** конфликт-резолюшн (студент изменил карточку в Anki и в LinguistPro), ingestion review records в `srs_reviews`, error handling сетевых отказов, схема, smoke-набор. Минимум 1–2 недели сосредоточенной работы.
- **Не блокирует диплом:** текущий retention proxy (`cards_exported_to_anki / cards_added_to_srs`) научно защитим в дипломе — framed как «forward work на bidirectional retention validation».
- **Риск регрессий перед пилотом:** изменения в `srs_reviews` / `note_links` могут случайно задеть Direction 11B research metrics → инвалидация согласия пилотов (`PARALLEL_WORK_PLAN §1.1 freeze zone`).

→ **Решение:** оставить Anki sync в v3.4 backlog. Сейчас НЕ начинать.

## 7. Итоговое распределение времени (1–2 недели до пилота)

Если есть N доступных часов, рекомендуется:

- **50% — операционное #1 + #2 + #3** (пилот setup + три внешних review запустить параллельно). Это критический путь к диплому.
- **20% — операционное #4** (250K dict — закрытие крупного backlog-пункта; повышает academic credibility морфологии).
- **15% — стратегическое #1** (начать write-up: методология + related work + первые таблицы). Долгая работа, лучше стартовать заранее.
- **10% — операционное #5–6** (backfill teacher.js строк + selective P3/P4 polish) — «маленькие победы» во время пилота, не задевая frozen zone.
- **5% — операционное #7** (README RESEARCH_ADMIN_TOKEN для DevOps-документации).

**Не трогать сейчас:**
- Anki Connect sync (см. §6) — v3.4.
- Multi-cohort comparative дизайн (см. §4) — после пилота.
- C-series student peer-comparison — намеренно исключено per §13 `ULPAN_RESEARCH_PLAN_v3_2.md` и тезису диплома.

## 8. Триггеры пересмотра этого документа

Этот ревью устаревает в момент любого из:

- Пилот запущен (tag `v3.7.0-pilot` создан) → переключиться на `PARALLEL_WORK_PLAN_DURING_PILOT.md` freeze-zone правила.
- 250K dict отгружен в прод → §5 → удалить пункт операционного бэклога.
- HE native review закрыл хотя бы один из трёх артефактов → §4 → обновить статус.
- Любая новая критическая фича попала в scope (тогда новый ревью + новый бэклог).

---

**Авторство.** Ревизия проведена ассистентом 2026-05-21 по запросу
владельца проекта. Подтверждена владельцем тем же днём (запрос
формализовать ревизию в документ во избежание переизобретения путей
развития).
