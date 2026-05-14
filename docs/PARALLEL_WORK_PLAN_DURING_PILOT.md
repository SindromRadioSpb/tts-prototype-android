# Parallel Work Plan During Pilot — v3.2.0 → v3.3.0

> **Цель.** Запустить pilot run на 2-3 friendly users (см. `docs/RESEARCHER_GUIDE.md` §8)
> **не замораживая разработку** на ~10 рабочих дней. Параллельная работа делится на
> небольшие безопасные задачи (Workstream A, 1.5-2 дня суммарно) и одну крупную
> v3.3-feature (Workstream B, 5-7 дней).
>
> **Approved.** 2026-05-13. Anchor commit: `32d8cb4` (release v3.2.0).
> Companion: `Smoke-check/SMOKE_CHECK_RESEARCH_MODE_v3_2_0.docx`.

---

## 1. Pilot lockstep правила

Pilot users получают **замороженный snapshot v3.2.0**. Любое изменение, прилетающее
на их URL, ломает контракт «версия, на которую дали согласие». Поэтому:

### 1.1 Что нельзя трогать в main во время pilot (`pilot freeze zone`)

| Путь | Причина |
|---|---|
| `research/**` (validate.js, storage.js, routes) | Серверный контракт `/api/research/v1/*` |
| `public/js/research.js`, `research-ui.js` | Client opt-in + consent versioning |
| `public/teacher.html`, `public/js/teacher.js` | Teacher dashboard pilot-критичен |
| `scripts/research/**` | Smoke runners + provisioning |
| `public/js/morph-*.js`, `data/morphology/**` | Морфология auto-fill — UX-критична для D9 notes |
| `package.json` версия | Менять только при cut tag |
| `CHANGELOG.md` [Unreleased] | Открыть только после end-of-pilot |
| `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` | Material change → bump CONSENT_VERSION → forced re-consent у пилотов |

### 1.2 Что можно (safe edits)

- Чистый docs/markdown (любые в `docs/` кроме шаблона consent).
- Новые файлы под новыми путями (`public/js/notes-graph.js`, `scripts/morph/extract-full-dict.c`).
- `CHANGELOG.md` секция `[Unreleased]` остаётся пустой — нет коммитов в неё.
- Background-scripts (build-time only): `scripts/morph/build-*.mjs` — не влияет на runtime.

### 1.3 Что делать с emergency fix во время pilot

Если pilot user обнаруживает privacy / data-loss bug:

```bash
# 1. Создай hotfix-ветку от v3.2.0 tag, НЕ от main.
git checkout -b hotfix/v3.2.1-<slug> v3.2.0

# 2. Минимальный фикс + smoke green.
npm run smoke:research

# 3. Merge в main с тэгом v3.2.1.
git tag -a v3.2.1 -m "hotfix: <slug>"
git push origin main v3.2.1

# 4. Pilot Railway → перевести pin с v3.2.0 на v3.2.1.
```

Любая другая работа (UX feedback, feature gap) идёт **в backlog для v3.3**, не в hotfix.

---

## 2. Deploy strategy

Railway по умолчанию autodeploys из `main`. Чтобы pilot user не получил случайный
deploy, выбери **одну** из трёх стратегий:

### Strategy A — Pin Railway на v3.2.0 tag (рекомендуемо)

В Railway settings → Deploys → Source: change from `Branch: main` to `Tag: v3.2.0`.

**Плюсы:** zero-cost setup; main продолжает развиваться; pilot stable.
**Минусы:** требует одного клика в Railway UI; забыть pin обратно после pilot.

### Strategy B — Stable-pilot branch

```bash
git checkout v3.2.0
git checkout -b release/v3.2.0-pilot
git push origin release/v3.2.0-pilot
```

Railway pin на `release/v3.2.0-pilot`. Main свободен.

**Плюсы:** можно cherry-pick critical-fix в эту ветку без перетягивания main.
**Минусы:** появляется лишняя ветка для maintenance; pilot-users get fixes — если хотим этого.

### Strategy C — Two environments (production + pilot)

Создать второй Railway service (например `linguistpro-pilot.up.railway.app`)
из `release/v3.2.0-pilot`. Production остаётся на main.

**Плюсы:** наиболее robust; pilot URL отличается от production URL.
**Минусы:** удвоение Railway-стоимости; нужно дать pilot users другой URL.

### Рекомендация

**Strategy A** для текущего pilot (small scale, 2-3 users, 10 дней).
**Strategy C** — когда выйдем на multi-cohort (v3.3+).

---

## 3. Workstream A — Small tasks (~2 дней суммарно)

Все задачи — **zero-risk для pilot**: либо docs-only, либо новые файлы вне freeze zone.

### A1 — 250K full hspell dict expansion

| Поле | Значение |
|---|---|
| Effort | 2-3 ч |
| Branch | `feat/morph-full-hspell-dict` |
| Risk | Low (opt-in toggle, default OFF) |
| Memory anchor | `[[project_v3_3_backlog]]` |

**Scope:**
1. Создать `scripts/morph/extract-full-dict.c` (50-100 LOC), linking against `libhspell`.
2. `scripts/morph/build-morphology.mjs` — расширить для full dict (~250K entries).
3. Settings UI — toggle «📚 Расширенный словарь» (default OFF). Сохраняется в `localStorage.morphDictTier_v1`.
4. Service worker cache strategy — отдельный bundle (`hebrew-morph-dict-full.json.gz` ~30 MB).
5. Lazy-load: при включении toggle — fetch + IndexedDB cache; не блокирует app boot.

**Acceptance:**
- [ ] Default behavior unchanged (34K dict).
- [ ] При opt-in: lookup miss rate падает на тестовых текстах.
- [ ] iOS Safari quota safe (≤50 MB total origin storage).
- [ ] Smoke runner: `node scripts/morph/test-tier-switch.js` зелёный.

**Где безопасно мерджить:** main, **не во время pilot** (затрагивает `data/morphology/`).
Оставить в feature branch до end-of-pilot.

> ⚠ **Уточнение pilot freeze:** A1 *выкладывает* новые файлы, но *не меняет* существующие
> до момента активации toggle юзером. Можно мерджить во время pilot **только если**
> default toggle гарантированно OFF и pilot users не клацнут случайно. Если есть сомнения
> — держи в branch.

---

### A2 — `rotate_token.js` CLI

| Поле | Значение |
|---|---|
| Effort | 2-3 ч |
| Branch | `feat/research-rotate-token-cli` |
| Risk | Zero (admin tool, не runtime) |
| Memory anchor | Q4 в `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §14 |

**Scope:**
1. `scripts/research/rotate_token.js` — обёртка для Procedure B (см. `RESEARCHER_GUIDE.md` §2.1.1).
2. Argument: `--cohort <code>`. Optional `--token <new>` (else auto-generate).
3. Atomic rewrite `cohort_meta.json` (через `.tmp` + rename).
4. Stdout: новый plaintext token (один раз, как в `create_cohort.js`).
5. Append to `cohort_meta.json` audit field: `token_rotations: [{ts, rotated_by}]`.
6. Update `RESEARCHER_GUIDE.md` §2.1.1: remove «deferred to v3.3» note, добавить usage.

**Acceptance:**
- [ ] `npm run research:rotate -- --cohort TEST` works.
- [ ] Старый token немедленно перестаёт работать (verify GET → 401).
- [ ] Новый token работает.
- [ ] Test: `scripts/research/smoke.js` добавляет case-26 (rotation).

**Где мерджить:** main (CLI = admin tool, не в pilot scope).

---

### A3 — Manual multi-device student_id link

| Поле | Значение |
|---|---|
| Effort | 0.5-1 день |
| Branch | `feat/research-multi-device-link` |
| Risk | **Medium — затрагивает `research/` freeze zone** |
| Memory anchor | Q6 в `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §14 |

**Scope:**
1. UI в research panel: «🔗 Связать с другим устройством» — генерирует/принимает 8-char link code.
2. Server endpoint: `POST /api/research/v1/student/:uuid/link { code }`. Merges aggregates на сервере (write `student_alias.json` в cohort dir).
3. Aggregator на teacher dashboard — учитывает aliases.

**⚠ DEFERRED**: затрагивает freeze zone. Делать **только после end-of-pilot** (день D9-D10
в расписании). Pilot — by-design per-device UUIDs, это документировано в consent template.

**Acceptance (post-pilot):**
- [ ] Связь 2 UUID → 1 «virtual student».
- [ ] Withdrawal любого из linked UUID — корректный cleanup.
- [ ] k-anonymity counter учитывает linked-merged set (не считает дважды).

---

### A4 — Q2 docs formalization (re-consent rule)

| Поле | Значение |
|---|---|
| Effort | 0.5 дня |
| Branch | `docs/research-reconsent-policy` |
| Risk | Zero |
| Memory anchor | Q2 в `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §14 |

**Scope:**
1. Новый раздел `RESEARCHER_GUIDE.md` §11 «CONSENT_VERSION bump policy».
2. Чёткий decision-tree: material change → bump; cosmetic → not.
3. Список material changes с примерами.
4. Update `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §14 Q2 → ✅ resolved.

**Acceptance:**
- [ ] Reviewer-test: 5 примеров правок consent template → reviewer верно классифицирует.

**Где мерджить:** main, любое время (docs only).

---

### A5 — `validate.js` lint CLI

| Поле | Значение |
|---|---|
| Effort | 0.5 дня |
| Branch | `feat/research-validate-cli` |
| Risk | Zero (offline tool) |

**Scope:**
1. `scripts/research/lint.js` — читает payload из stdin или file, прогоняет через `research/validate.js`, печатает violations.
2. Use case: разработчик/researcher проверяет custom payload перед POST.
3. Add npm script: `research:lint`.

**Acceptance:**
- [ ] `echo '{"...invalid..."}' | npm run research:lint --silent` печатает structured error.
- [ ] Exit code 0 на valid, 1 на invalid.

**Где мерджить:** main.

---

## 4. Workstream B — Big task (5-7 дней)

**Выбрать одну** из двух options. Обе deferred к v3.3 (см. `[[project_v3_3_backlog]]`).

### Option B1 — M8 Knowledge graph view (recommended)

| Поле | Значение |
|---|---|
| Effort | 5-7 дней |
| Branch | `feat/notes-knowledge-graph` |
| Risk | Low (новая feature, не трогает existing) |
| Memory anchor | M8 в `docs/PREMIUM_NOTES_PLAN_v3_2.md` |

**Scope:**
1. SVG/Canvas force-layout (`d3-force` light port или vanilla impl).
2. Узлы: notes / texts / roots / binyanim. Рёбра: links между ними.
3. Filters: by type, by tag, by date range.
4. Zoom / pan / hover preview.
5. Click on node → opens canonical view (note → notes editor, text → reader).
6. Integration: новая кнопка «🕸 Граф» в Library + Notes Hub.

**Acceptance:**
- [ ] Cohort with ≥50 notes + 5 texts → renders в <500ms.
- [ ] Filters работают live (не reload).
- [ ] Mobile-friendly (touch pan).
- [ ] Smoke runner: новые playwright cases.

**Why B1:** delight-tier, маркетингово-видимая, отделит LinguistPro от Anki/standard SRS tools.

---

### Option B2 — Workstream E cross-text «Где встречается» hub

| Поле | Значение |
|---|---|
| Effort | 5-7 дней |
| Branch | `feat/cross-text-references-hub` |
| Risk | Low (новая feature) |
| Memory anchor | Workstream E в `[[project_v3_3_backlog]]` |

**Scope:**
1. Index of root → list of (text, sentence_id, position).
2. Reference view: кликаешь по слову/root в любом тексте → hub показывает все occurrences across library.
3. Sortable by frequency, recency, binyan match.
4. Bulk action: add all references to SRS as one card-set.

**Why B2:** ulpan-релевантно, помогает текстовому контексту для self-study.

---

### Рекомендация

**B1 (knowledge graph)** — если v3.3 будет позиционироваться как «delight & visual».
**B2 (cross-text hub)** — если pilot подтвердит, что users хотят больше контекста для незнакомых слов.

Решение можно принять после D2-D3 pilot, когда есть первый feedback.

---

## 5. Suggested 10-day schedule

| День | Pilot status | Параллельная работа | Mergeable to main? |
|---|---|---|---|
| **D1** (today, 2026-05-13) | Smoke check (.docx) → distribute codes to 2-3 friendly users | A4 (docs Q2) | ✅ docs |
| **D2** | Pilot users opt-in, first consents | A2 (rotate_token CLI) | ✅ admin tool |
| **D3** | First uploads visible in dashboard | A5 (lint CLI) | ✅ tool |
| **D4** | Daily check via teacher dashboard | B (start) | branch only |
| **D5** | Continued usage | B (cont) | branch only |
| **D6** | Pilot midway → ask each user 3 UX questions | B (cont) | branch only |
| **D7** | Continue | B (cont) | branch only |
| **D8** | Pilot end announcement (1 day notice) | B (finishing) | branch only |
| **D9** | Pilot teardown: export CSVs, archive data | A3 (multi-device, теперь safe) + A1 (250K dict) | merge after smoke |
| **D10** | Pilot debrief + decide v3.3 vs v3.2.1 scope | Final merges, version bump, tag | merge all |

**Параллельный bandwidth:** ~3-4 ч/день параллельной работы (остальное — pilot monitoring + ad-hoc fixes). Итого: 30-40 ч на workstreams A+B за 10 дней — реалистично.

---

## 6. Pilot feedback интеграция

### Daily ритм

- **Утро:** 5 мин — открыть teacher dashboard, проверить cohort_size, uploads, нет ли drop-off.
- **Полдень:** проверить `📬 Feedback` модал в репе (или GitHub Issues с тэгом `pilot`).
- **Вечер:** quick journal entry — что увидел / что сломано / что cool.

### Mid-pilot check (D6)

Личное сообщение каждому pilot user:
1. «Нашлось что-то странное?» (catch UX bugs)
2. «Понятно ли что собирается?» (catch consent confusion)
3. «Удобно ли заглядывать в 👁 «Что собрано»?» (catch trust signals)

### End-of-pilot debrief (D10)

- Data review: cohort aggregate CSV → R/Python notebook → r-correlation engagement vs activity (нет outcome-данных у friendly users, но видна engagement-distribution).
- UX review: список всех feedback items.
- Triage: каждый item → `v3.2.1 hotfix` / `v3.3 backlog` / `won't fix`.

---

## 7. Merge / release strategy at pilot end

После D10:

```bash
# 1. Verify each branch is rebased on latest main.
for b in feat/morph-full-hspell-dict feat/research-rotate-token-cli \
         docs/research-reconsent-policy feat/research-validate-cli \
         feat/notes-knowledge-graph feat/research-multi-device-link; do
  git checkout $b && git rebase main
done

# 2. Squash-merge каждую в main.
for b in ...; do
  git checkout main && git merge --squash $b && git commit -m "<conventional commit>"
done

# 3. Full smoke на main.
npm run smoke:research        # 60/60 + 9 PNG

# 4. Bump version.
#    - Если merged ТОЛЬКО A-tasks + bug fixes → v3.2.1 (patch).
#    - Если merged ХОТЯ БЫ одна new feature (B1 или B2) → v3.3.0 (minor).
npm version <patch|minor> --no-git-tag-version

# 5. CHANGELOG: открыть Unreleased секцию, описать closed items, datestamp.

# 6. Tag + push.
git tag -a v3.3.0 -m "feat: <summary>"
git push origin main v3.3.0
```

---

## 8. Risk register

| Риск | Вероятность | Impact | Mitigation |
|---|---|---|---|
| Pilot user находит privacy bug | Low | Critical | Hotfix branch from v3.2.0 → v3.2.1 → repin Railway |
| Pilot user находит UX bug | Medium | Low | Backlog → fix в v3.3 batch merge |
| Параллельная работа случайно затрагивает freeze zone | Medium | High | Code review + branch protection (если возможно); checklist в этом файле §1.1 |
| Railway autodeploys на main и ломает pilot | Medium | High | Strategy A (pin на tag) — set в самом начале |
| HE consent native review не закрылся за pilot | High | Medium | Не блокирует — RU/EN-only pilot acceptable; HE-blocker tracked отдельно |
| Pilot user drop-off в первые 2 дня | Medium | Medium | Daily ping; разделить «активный» vs «забыл» в данных |
| B1/B2 не успевает за 5-7 дней | Medium | Low | Расширить до v3.3.1; не блокирует pilot end |
| Conflict при merge A3 + B (если оба трогают research-ui.js) | Low | Low | A3 трогает только `research-ui.js`, B (M8 graph) — `notes-graph.js` — нет пересечения |

---

## 9. Метрики успеха pilot

**Quantitative:**
- ≥80% pilot users (≥2 из 3) сделали ≥3 uploads за 10 дней.
- ≥1 successful withdrawal flow (real user clicks 🗑) → server полностью почистил.
- 0 privacy bug reports.
- npm run smoke:research green throughout (D1, D5, D10).

**Qualitative:**
- ≥1 «WOW, не думал что так аккуратно» feedback re privacy / transparency.
- ≥3 actionable UX items для v3.3 backlog.
- Pilot user готов рекомендовать tool другому ulpan-студенту (NPS proxy).

---

## 10. Контрольные точки и ответственность

| Веха | Дата | Кто | Готовность |
|---|---|---|---|
| Smoke .docx готов | D1 = 2026-05-13 | Claude/dev | ✅ Smoke-check/SMOKE_CHECK_RESEARCH_MODE_v3_2_0.docx |
| Smoke прогон (manual) | D1 | dev | ☐ |
| Railway pin на v3.2.0 | D1 | dev | ☐ |
| Pilot codes distributed | D1-D2 | dev | ☐ |
| First upload visible | D3 | dev (monitor) | ☐ |
| Mid-pilot UX check | D6 | dev (talk to users) | ☐ |
| B-task choice committed | D2-D3 | dev | ☐ |
| Pilot end announcement | D8 | dev | ☐ |
| Data review (CSV → R) | D10 | dev | ☐ |
| Release (v3.2.1 или v3.3.0) | D10 | dev | ☐ |
| Railway repin to main | D10 | dev | ☐ |

---

## 11. Related docs

- `docs/RESEARCHER_GUIDE.md` — pre-deployment checklist (§8) + pilot procedure.
- `docs/ULPAN_RESEARCH_PLAN_v3_2.md` — master plan + open questions.
- `Smoke-check/SMOKE_CHECK_RESEARCH_MODE_v3_2_0.docx` — manual smoke runner (Tester + Developer parts).
- `docs/C_SERIES_PLAN.md` — separate post-OPFS premium-product backlog (не входит в этот план).

---

**Last updated:** 2026-05-13. Anchor commit: `32d8cb4`.
