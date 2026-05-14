# Researcher Guide — LinguistPro Direction 11

> Quickstart для исследователя, проводящего ulpan study на платформе LinguistPro.
> Покрывает provisioning когорты, distribution кодов студентам, сбор outcomes,
> анализ через teacher dashboard, экспорт CSV для R/SPSS/Python.
>
> **Companion docs:** `ULPAN_RESEARCH_PLAN_v3_2.md` (полный план),
> `RESEARCH_METRICS_SCHEMA.md` (wire contract),
> `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (informed consent).

---

## 1. Privacy invariants (must hold always)

Прежде чем что-либо делать — убедись что understand эти invariants. Они не только этические, они *архитектурно enforced* в server-side validator (Phase 11.4).

| Инвариант | Enforcement |
|---|---|
| Default OFF — opt-in only | Client `LinguistProResearch.init()` no-ops пока `researchEnabled_v1 !== '1'` |
| Anonymous student_id (UUID v4, client-generated) | Client `crypto.randomUUID()` → localStorage; server никогда не видит PII |
| Aggregates only, no raw events | Server validator (`research/validate.js`) recursively rejects forbidden fields |
| k=5 anonymity threshold (default) | Server `aggregateCohort()` returns `students: []` когда `cohort_size < threshold` |
| One-click withdrawal | DELETE /api/research/v1/student/:uuid + локальный cleanup |
| Server stores ONLY aggregates | All payloads — daily counters; raw events live только on user device |
| Re-consent on consent_version bump | Client compares stored vs `CONSENT_VERSION` constant |
| 2-year retention post-cohort | `cohort_meta.retention_until` (configurable via `--retention-days`) |

**Если ты найдёшь способ нарушить любой из этих инвариантов — это bug, не feature.** Раппорти через `📬 Feedback` модал в приложении или GitHub issue.

#### 1.1 Transparency для студентов: «👁 Что собрано»

В приложении студент в любой момент может открыть модал **«👁 Что собрано»** (📊 Research panel → кнопка «👁 Что собрано»). Внутри модала — **две** независимые секции:

| Секция | Что показывает | Когда обновляется |
|---|---|---|
| 📋 Превью следующего upload-а | Live-aggregate сегодняшней активности студента (минуты, SRS, заметки, audio, ≈bytes). Статус — `⏳ preview` (амбер). | Каждый раз при открытии модала: `previewToday()` запрашивает локальный `events` table в реальном времени. |
| Отправленные uploads | Историю фактически загруженных aggregates (до 30 последних), статусы `✓ stored` / `↻ dedupe` / `⚠ <err>`. | Append-only при успешном upload (daily aggregator + outcome submissions). |

**Privacy-критическое различие.** Preview-секция помечена амбером + статусом `⏳ preview` + явным текстом «ещё не на сервере». Студент видит, что **будет** отправлено завтра, прежде чем оно фактически уедет — это дополнительная transparency-гарантия on top of «server stores only aggregates» инварианта.

`previewToday()` — pure read: никаких side-effects (нет POST, нет записи в upload log, нет изменения `lastUploadDate`). Pinned тестами в `public/research-client-test.html` («previewToday: NO fetch call», «previewToday: does not mutate state»).

---

## 2. Setup (one-time, server-side)

### 2.1 Provisioning new cohort

```bash
node scripts/research/create_cohort.js --code ULPAN-A-W2026 \
  --retention-days 730 \
  --outcome-scale 0-100 \
  --consent-min 1.0 \
  --k 5
```

Output:
```
Cohort created:
  code:                   ULPAN-A-W2026
  schema_version:         v1
  k_anonymity_threshold:  5
  retention_until:        2028-05-13
  ...

Researcher token (plaintext — SAVE NOW, NOT STORED ON DISK):
  abc123def456ghi789jkl0
```

**SAVE THE TOKEN IMMEDIATELY.** It's sha256-hashed at rest (`cohort_meta.researcher_token_hash`) — there's no way to recover plaintext from server.

### 2.1.1 Token rotation

Если researcher token compromised (попал в screenshot, leaked через chat,
etc.), действуйте по одной из двух процедур:

**Procedure A — provision a fresh cohort (preferred для new study).**

```bash
node scripts/research/create_cohort.js --code ULPAN-A-W2026-V2 --retention-days 730
```

Старая когорта (`ULPAN-A-W2026`) остаётся read-only с историческими данными;
студенты переходят на `-V2` через в-app смену cohort code (📊 → "🔁 Сменить
когорту"). Новый token не пересекается со старым.

**Procedure B — rotate token in place (когорта уже работает; не хотим
мигрировать студентов).**

```bash
# 1. Сгенерировать новый plaintext token (32 base64url chars):
NEW_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
echo "Save this immediately: $NEW_TOKEN"

# 2. Compute its sha256 hash:
NEW_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('$NEW_TOKEN').digest('hex'))")

# 3. Atomically rewrite cohort_meta.json:
META=data/research/<COHORT_CODE>/cohort_meta.json
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$META','utf8'));m.researcher_token_hash='$NEW_HASH';fs.writeFileSync('$META',JSON.stringify(m,null,2));console.log('rotated')"
```

Старый token немедленно перестаёт работать. Distribute `$NEW_TOKEN` to the
authorized researcher(s).

> Convenience CLI (`scripts/research/rotate_token.js`) для Procedure B
> deferred к v3.3 backlog. Manual procedure выше — workaround.

### 2.2 RESEARCH_DATA_DIR

Сервер пишет cohort-данные в `RESEARCH_DATA_DIR` (env var; default `<DATA_DIR>/research`). На Railway это persistent volume — не сбрасывается между deploy'ями.

Local dev: `data/research/<cohort>/...` относительно репо.

### 2.3 Verify the endpoint

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-deploy/api/research/v1/cohort/ULPAN-A-W2026/aggregates
```

Должно вернуть `200` и JSON с `cohort_size: 0` (когорта пустая).

---

## 3. Distribution к студентам

### 3.1 Что нужно дать студентам

Каждый студент получает:
1. **Cohort code** (например `ULPAN-A-W2026`) — by WhatsApp / printed handout / email.
2. **URL приложения** (`https://your-deploy/`) — если вы хотите чтобы они зашли через web; для PWA users — обычно уже установлено.
3. **Бриф** про research mode (см. §3.2).

**Researcher token** — НЕ давать студентам. Только тебе.

### 3.2 Шаблон бриф-сообщения

```
Привет!

Этот семестр мы участвуем в исследовании эффективности цифровых инструментов
изучения иврита (дипломный проект). Участие добровольное и анонимное.

Что сделать:
1. Открой LinguistPro: <URL>
2. Жми 📊 в верхней панели → "Дать согласие на участие"
3. Внимательно прочитай consent screen и отметь все 5 чекбоксов
4. Введи cohort code: ULPAN-A-W2026
5. Дальше всё автоматически — пользуйся приложением как обычно.

Что собирается: только агрегированные счётчики (минуты, количество карточек,
заметок). НЕ собирается: содержимое заметок, тексты, поисковые запросы,
аудио, имя, email, IP.

В любой момент можешь отозвать согласие одной кнопкой 🗑 в той же панели —
все твои данные будут удалены с сервера.

Если будут вопросы — пиши <твой контакт>.
Спасибо!
```

### 3.3 Distribution mechanism — рекомендации

| Канал | Плюсы | Минусы |
|---|---|---|
| WhatsApp / Telegram групп-чат | Быстро, students уже в чате | Code might leak за пределы группы |
| QR-код в PDF / printed handout | Контроль над распространением | Студент должен набрать code вручную (4-16 chars) |
| Email | Аудит trail | Можно случайно forward'нуть |

QR-код можно сгенерировать с любым cohort code — это не secret (он не token, он group identifier). Если QR утечёт — кто-то посторонний может присоединиться к когорте, но он будет анонимен и его данные просто будут шумом — privacy не нарушается.

---

## 4. Outcomes — экзамены и оценки

Two paths to capture exam scores:

### 4.1 Self-report (студент сам)

Студент в приложении: 📊 → "🎓 Сдать экзамен" → вводит балл (0-100) + опционально confidence (1-5).

Это POST'ит payload c `metrics.outcome` populated, `outcome_capture_method: "self-report"`.

**Плюсы:** не требует от тебя ручной работы.
**Минусы:** subjective accuracy; студент может ошибиться.

### 4.2 Teacher CSV upload (ты сам, authoritative)

В teacher dashboard (см. §5): **📤 Upload outcomes CSV** в шапке.

Формат файла:
```csv
student_id,pre_test_score,post_test_score,exam_date,uploaded_by
abc-1234-...,72,87,2026-06-15,teacher
def-5678-...,65,71,2026-06-15,teacher
...
```

Header REQUIRED, остальные колонки кроме `student_id` опциональные. Empty cells → null.

**Important:** student_id-ы получаются от студентов через **opt-in linking** — студент сам тебе передаёт свой UUID на бумаге при сдаче экзамена. Без этого ты не знаешь чей UUID какому имени соответствует — это by design (two-key privacy architecture, см. ULPAN_RESEARCH_PLAN §4).

**Authority:** Teacher CSV всегда перезаписывает self-report. Если студент сдал self-report, а потом ты upload'ил CSV с тем же student_id — твой балл outcome'у becomes the authoritative one.

---

## 5. Teacher dashboard

```
https://your-deploy/teacher.html
```

Login: cohort code + researcher token. Token cached в localStorage этой страницы — auto-resume на reload. ⎋ Logout стирает.

### 5.1 Что увидишь

| Section | Что показывает |
|---|---|
| **Cohort overview** | 6 tiles: cohort_size, days_observed, total_minutes, total_audio, SRS_reviews, notes_created |
| **Engagement timeline** | SVG line chart, active_minutes per day (cohort-wide) |
| **Audio playback** | per-day audio_play_ms_total |
| **SRS reviews + notes created** | per-day combined |
| **Per-student breakdown** | sortable table, **k-gated** — скрыта когда cohort < k |
| **Outcome correlations (Pearson r)** | r для каждой метрики vs post_test_score; magnitude label (strong/moderate/weak/none) |
| **Engagement vs exam scatter** | x = active_minutes total, y = post_test_score, dots + least-squares trendline |

### 5.2 k-anonymity gate

Если в когорте < `k_anonymity_threshold` opted-in студентов:
- Per-student table → empty state с ⚠ badge
- Correlations → empty state
- Scatter → empty state
- Cohort-wide aggregates остаются visible (они не идентифицируют individual)

Threshold можно увидеть в header: `k=5`.

### 5.3 CSV export — три вида

| Кнопка | Файл | Содержимое |
|---|---|---|
| ⬇ Aggregates CSV | `cohort_<code>_aggregates.csv` | per-student totals + outcomes (k-gated) |
| ⬇ Timeseries CSV | `cohort_<code>_timeseries.csv` | per-student per-day (k-gated) ИЛИ cohort-wide per-day fallback |
| ⬇ Derived CSV | `cohort_<code>_derived.csv` | composite engagement_score, quality_score, efficiency_ratio, growth_delta, engagement_consistency |

Schema column-by-column → `RESEARCH_METRICS_SCHEMA.md` §12.

---

## 6. Statistical analysis в R / Python / SPSS

CSV exports в standard форматы — никаких custom encoding'ов.

### 6.1 R пример

```r
library(readr)
library(ggplot2)

agg <- read_csv("cohort_ULPAN-A-W2026_aggregates.csv")

# Pearson correlation
cor.test(agg$total_active_minutes, agg$post_test_score)

# Linear regression
m <- lm(post_test_score ~ total_active_minutes + total_cards_reviewed +
                          srs_error_rate + total_notes_created, data = agg)
summary(m)

# Scatter с trendline
ggplot(agg, aes(x = total_active_minutes, y = post_test_score)) +
  geom_point() +
  geom_smooth(method = "lm") +
  labs(x = "Total active minutes", y = "Post-test score")
```

### 6.2 Python пример

```python
import pandas as pd
from scipy.stats import pearsonr
import statsmodels.formula.api as smf

agg = pd.read_csv("cohort_ULPAN-A-W2026_aggregates.csv")

# Pearson r
r, p = pearsonr(agg['total_active_minutes'], agg['post_test_score'])
print(f"r = {r:.3f}, p = {p:.4f}")

# Multiple regression
m = smf.ols('post_test_score ~ total_active_minutes + total_cards_reviewed + srs_error_rate', data=agg).fit()
print(m.summary())
```

### 6.3 SPSS

Откройте CSV через `File → Open → Data`. Variables tab → `student_id` mark as `Nominal`, остальные — `Scale`. Затем `Analyze → Correlate → Bivariate` для Pearson.

---

## 7. Withdrawal — что делать когда студент отзывает

Когда студент жмёт 🗑 в приложении:

1. Client отправляет `DELETE /api/research/v1/student/:uuid?cohort_code=<code>`.
2. Server scan'ит все `<date>.jsonl` файлы в когорте, переписывает без строк этого uuid (atomic .tmp + rename).
3. Audit-log в `<cohort>/deletions.log`: `<timestamp> student_id=<uuid> reason=user_withdrawal records_removed=N`.
4. Client очищает `localStorage.researchEnabled_v1` + `researchStudentId_v1` + `researchCohortCode_v1` + log.

**Что ты увидишь в dashboard:** `cohort_size` уменьшится на 1; этот студент перестанет появляться в per-student table. `outcomes.csv` НЕ очищается автоматически — если хочешь убрать оттуда строку студента, отредактируй CSV вручную и upload через 📤.

**Если студент отзывает после экспорта CSV** — экспортированный файл уже у тебя на руках. По этическим причинам (и по букве consent template) ты должен **удалить локальные копии экспорта** для этого студента после withdrawal'а. Это процедурный invariant, не enforced технически.

---

## 8. Operational checks (перед deployment в реальной группе)

Прежде чем дать code реальным студентам:

```bash
# 1. Server-side smoke (15 cases)
node scripts/research/smoke.js

# 2. Client opt-in flow (16 cases, headless Chromium)
node scripts/research/browser-smoke.js

# 3. Teacher dashboard (12 cases, headless)
node scripts/research/teacher-smoke.js

# 4. Visual regression captures (9 PNGs to Smoke-check/)
node scripts/research/teacher-screenshots.js
```

Все должны быть зелёные.

Pre-deployment checklist (checklist в ULPAN_RESEARCH_PLAN §9 расширенный):
- [ ] Consent template native-reviewed для языка студентов (RU/EN done; **HE требует native review**)
- [ ] Privacy policy (`docs/PRIVACY.md`) актуален
- [ ] Withdrawal UX manually tested на тестовом cohort
- [ ] Teacher CSV upload tested
- [ ] CSV export → импорт в R/Python tested
- [ ] k-anonymity gate verified (создай cohort с 4 students → individual breakdown скрыт)
- [ ] Researcher token rotation plan (если token compromised → новая cohort)
- [ ] Cohort code distribution channel выбран (WhatsApp / handout / etc)

---

## 9. Что не входит (defer to v3.3+)

- **In-app diagnostic quiz** для calibrated pre-test (D3 в master plan) — defer v3.3
- **Multi-cohort comparative dashboard** — defer v3.3
- **Federated research platform** — defer v4+
- **RCT methodology** (control vs experimental groups) — out of scope для diploma scale
- **Encrypted-at-rest server storage** — out of scope для v3.2; server data already privacy-minimal
- **Real-time per-student monitoring dashboard** — anti-pedagogical (surveillance), explicit non-goal

---

## 10. Поддержка и обратная связь

- **Bug reports / feature requests:** `📬` Feedback модал в приложении или GitHub issue.
- **Privacy concerns / breach reports:** см. `docs/PRIVACY.md` контактные данные.
- **Methodology questions для diploma:** `ULPAN_RESEARCH_PLAN_v3_2.md` §3 (метрики), §6+§7 (architecture).

---

**Last updated:** 2026-05-13 (v3.2.0-rc1, Direction 11B Phase 11.7)
