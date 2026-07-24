# 08 — Измерение, эксперименты, rollout

Принципы: XP не является primary-метрикой ни для чего; effect sizes из литературы (01_SLA) — это
prior, НЕ обещание воспроизведения в LinguistPro; метрики, которые агент может «нарисовать себе
сам» (его же суждения о прогрессе), не используются как success-мера (R17 анти-циркулярность) —
только детерминированные первопартийные данные + явные вердикты владельца.

## 1. Реестр метрик

| Метрика | Источник (детерминированный) | Для чего |
|---|---|---|
| production minutes/week (речь+письмо) | ручная фиксация владельцем в H1 (evidence-журнал H1.8); H2: минуты транскриптов | P1/P2 primary |
| revised drafts / week | журнал владельца (H1); при Д1-хранении — леджер | P2 |
| completed conversation sessions / week | журнал владельца | P3 |
| repeated error categories (динамика) | пост-сессионные разборы (фиксируются в note-итогах сессий) | P1–P3 quality |
| retry success (доля верных ретраев после разбора) | итог сессии | P3 |
| later deterministic retrieval (слова из сессий → исход в review_log) | review_log (слова, затреканные после сессий) | самая честная: обсуждение → память |
| lapse rate | review_log/FSRS | глобальное здоровье удержания |
| text coverage % фактически читаемого | H2: get_text_coverage | P4 |
| sessions/week + дней занятий/нед | study_day-леджер, progress_delta | SRL-модератор (частота — ключевой) |
| goal adherence (цель ↔ факт недели) | H1: notes; H2: goal-store × progress_delta | P6 |
| ASR correction rate (доля правок transcript-preview) | журнал сессий H2.6 | качество голосовой петли |
| owner-perceived usefulness (1–5 по петле) | явный вердикт владельца в STATUS/evidence | продукт-истина single-tenant |
| hallucination/grounding failures (шт.) | инцидент-журнал: любое пойманное нарушение правил 11–12 | P9 guard |
| sycophancy incidents | то же, правила 10/24 | P9 |
| unwanted writes (должно быть ≡0) | proposals-леджер: всё, что появилось без запроса юзера + аудит серверных путей | W0/W1-инвариант |
| cost per active week | R16-леджер + счета внешних сервисов | R16 |

Инцидент-журнал = простой раздел в evidence-файле слайса (hermes-side/<slice>/EVIDENCE.md);
заполняет владелец/сессия при наблюдении. Ноль инцидентов при нуле наблюдений ≠ доказательство —
фиксировать и объём наблюдения (сколько сессий просмотрено).

## 2. Per-slice экспериментальная рамка (H1)

Общее: baseline = состояние до слайса (обычно «петли нет вообще» → baseline тривиален:
0 сессий/0 минут); trial = owner-only (других пользователей нет); observation window указан ниже;
rollback = деинсталляция скилла/секции config (03 §Общее) — порог срабатывания и no-go per-slice.

| Слайс | Trial | Window | Evidence для continuation | Rollback threshold | No-go |
|---|---|---|---|---|---|
| H1.0 policy | 5 сценариев + 3 живых | немедленно | 5/5 сценариев соответствуют | любое систематическое нарушение правил из §1.3 | политика игнорируется моделью даже после 2 итераций формулировок |
| H1.1 разговор | immediate smoke + ≥2 monitoring-сессии | 14 дней parallel | qualitative owner PASS закрывает H1; monitoring: retry success >0, итог ≥3/5 | владелец бросает сессии из-за качества (≤2/5) | сикофантия/галлюцинации неустранимы правками скилла |
| H1.2 письмо | immediate smoke + ≥2 monitoring-цикла | 14 дней parallel | qualitative owner PASS закрывает H1; monitoring: ревизии сделаны, итог ≥3/5 | фидбек систематически неверен (>1 ложная «ошибка»/цикл) | то же |
| H1.3 SRL | immediate smoke + 2 monitoring-цикла | 14 дней parallel | qualitative owner PASS закрывает H1; monitoring: owner-choice оба раза, якорь ≥50% дней | ощущение «отчёт ради отчёта» (вердикт ≤2/5) | — |
| H1.4 Sefaria | 3 smoke + 1 разбор | 1 нед | интертекст найден в реальном разборе | сервер стабильно недоступен | — |
| H1.5 YouTube | 3 smoke + 1 разбор | 1 нед | сабы получены для реального видео | пакет мёртв/нестабилен → заменить альтернативой в рамках слайса | — |
| H1.6 LRCLIB | 3 smoke + 5 песен плейлиста | 1 нед | покрытие ≥2/5 песен владельца | покрытие 0/5 → слайс закрывается с вердиктом LOW_VALUE (обёртка остаётся, приоритет падает) | — |
| H1.7 datasets | 3 smoke + 1 приоритизация | 1 нед | lookup работает офлайн; частоты адекватны | — | — |
| H1.8 closure | initial audit + monitoring plan | немедленно; затем 14 дней parallel | см. G-H1-CLOSURE и G-H1-PARALLEL-MONITOR (10 §2) | stop-условия ниже | — |

## 3. H2: continuation evidence и решения

- Обычно G-H2-START требует из H1 ≥1 петлю с вердиктом владельца ≥4/5 И
  регулярным использованием (≥1 раз/нед). Owner amendment 2026-07-23 является
  явным override только для времени измерения: H2 может стартовать после H1
  closure и отдельного Д5, пока этот критерий проверяется 14 дней параллельно.
- Monitoring stop-условия: unwanted write → немедленно остановить новые H2
  mutation-paths и расследовать; неожиданные metered-затраты >$0 без owner go →
  остановить cost-path; систематическая hallucination/sycophancy → выключить и
  чинить затронутую петлю; к концу окна нет ни одной регулярной петли ≥4/5 →
  не начинать следующий ещё не начатый H2-слайс до owner решения
  `continue/repair/disable`. Текущий атомарный слайс доводится до безопасной
  точки, но новый scope не открывается.
- Каждый H2-слайс: свой smoke-набор (паттерн `scripts/premium/agent-*-smoke.js`, включается в
  гейты), деплой → прод-верификация, owner-live сценарий из промта слайса, запись метрик петли
  в течение 2 нед. Owner amendment 2026-07-24, по аналогии с У7 для H1, переносит завершение
  этого окна из блокирующего prerequisite G-H2-CLOSURE в обязательный параллельный monitor:
  H2 может быть закрыт после остальных closure-гейтов и initial metrics snapshot, пока окно
  2026-07-24—2026-08-06 продолжается независимо от Codex-сессий. Поправка не отменяет сбор
  метрик, cost evidence или stop-условия. Сама эта поправка не была Д6-go; последующее owner
  decision Д6-P от 2026-07-24 отдельно разрешило H3 R&D portfolio при сохранении этих условий.
- Decision record: после каждого owner-live окна — 3 строки в STATUS.md (evidence, вердикт,
  продолжаем/чиним/выключаем). Это и есть «decision record» промта — отдельный файл не плодим.

## 4. Rollout-дисциплина

Всё default-off и owner-only by construction (единственный пользователь — владелец; multi-user =
отдельное будущее решение, 00 §Д-таблица). Порядок включения любой способности: engineering
complete (гейт) → owner-live smoke → вердикт → CLOSED в STATUS. Ничто не
остаётся «включённым и забытым»: H1.8 запускает monitoring ledger, его day-14
follow-up обновляет тот же evidence, а H2.7 сводит initial verdicts и запускает отдельный
H2 parallel monitor. H2 day-14 follow-up обновляет тот же H2.7 evidence и STATUS даже если
G-H2-CLOSURE уже пройден.

После Д6-A все C1–C5 H3 R&D могут идти параллельно H2 monitor. Их duration/data-volume/case-count
thresholds становятся recommended evidence maturity targets: до достижения вывод маркируется
`UNDERPOWERED`, но старт не блокируется. Любой unwanted write, consent/scope drift, неожиданный
metered cost или systematic quality incident немедленно останавливает связанный H3 path так же,
как H2 path; незатронутые локальные/read-only исследования не объявляются автоматически проваленными.
