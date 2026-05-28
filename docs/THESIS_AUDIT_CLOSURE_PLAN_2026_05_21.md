# Thesis Audit Closure Plan — 2026-05-21

> **Назначение.** Фиксирует решения user-а 2026-05-21 о том, как
> закрываются gap'ы из `THESIS_VALIDITY_AUDIT_2026_05_21.md` в условиях
> **без возможности связаться с teacher** в pre-pilot окне. Чтобы
> следующие сессии не переоткрывали уже принятые решения.
>
> **Контекст.** User не имеет immediate доступа к ulpan-teacher, поэтому
> teacher-dependent gap'ы (D2.1 pre-test, D2.5 covariate survey, D5.1
> quiz external review, D6.1 HE consent review, D5.2 inter-rater)
> остаются открытыми и попадают в Discussion §«Threats to Validity» как
> acknowledged limitations.
>
> **Companion docs:** `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md`
> (полный аудит), `docs/WRITE_UP_BRIEF.md` (общая карта).

---

## 1. Утверждённый порядок закрытия

### Tier 1 — pre-pilot critical (сделать ДО запуска пилота)

| # | Gap | Deliverable | Кто делает | Статус |
|---|---|---|---|---|
| T1.1 | D4.1+D4.2+D4.3+D4.4 OSF pre-registration | `thesis/OSF_PREREGISTRATION_DRAFT.md` | I draft → user submits | ✅ Drafted 2026-05-21 |
| T1.2 | D6.2 Consent template Railway placeholder + GDPR formulation | Edit `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (RU + EN) | I edit | ✅ Done 2026-05-21 |
| T1.3 | D6.7 IRB framework declaration | `thesis/IRB_FRAMEWORK_DRAFT.md` + consent integration | I draft both | ✅ Drafted 2026-05-21 |

**Утверждённые решения user-а 2026-05-21:**

- **Railway region:** EU (заполнено в consent).
- **IRB framework:** «общие рекомендации» (user не уверен в applicability
  университетского IRB) → выбран **conservative general default**:
  - Helsinki Declaration §22-32 (информированное согласие в research with
    human subjects)
  - GDPR Art. 6(1)(a) (правовое основание = добровольное consent) — natural
    fit для EU hosting
  - Supervisor exercises de-facto ethics oversight для diploma
  - Non-clinical, low-risk, voluntary educational research framing
- **OSF submission:** **user submits сам** (security: не используем
  credentials из чата).

### Tier 2 — этой неделей (Chapter 4 Privacy material, doc-only, ~5-7 ч)

Запланировано закрытие в отдельной Role 1 сессии — это уже Chapter 4
drafting, не подготовительная работа:

| # | Gap | Deliverable | Когда |
|---|---|---|---|
| T2.1 | D6.3 Threat model document | Раздел в Chapter 4 Privacy thesis | Role 1 Chapter 4 session |
| T2.2 | D6.4 Comparison table (LinguistPro vs DP/federated/vendor/etc) | Раздел в Chapter 4 Privacy thesis | Role 1 Chapter 4 session |
| T2.3 | D5.3 active_minutes stopwatch validation | Manual test (3 sessions × 10 мин) → результат → Methodology §«Reliability» | User performs test; I analyze результат |

### Tier 3 — естественно в Methodology drafting (zero extra time)

Эти gap'ы — текстовые items, которые **автоматически закрываются** при
написании Methodology / Discussion drafts:

| Gap | Где появляется в thesis | Что пишем |
|---|---|---|
| D1.1, D1.2 | Methodology §«Operationalization» | active_minutes_real operational definition (тab visible + interaction within preceding 5 min) |
| D1.3 | Methodology + Limitations | cards_reviewed = stub Trainer only; cards_exported_to_anki = mastery proxy per SRS_STRATEGY |
| D1.4 (sentence_id distinct cross-text) | Limitations | acknowledged metric limitation (small impact for single-text sessions) |
| D1.7 | Methodology | per-device UUID (no auto-link); linked subsample отдельно |
| D2.2 | Discussion §«Threats» | Hawthorne effect inherent в privacy-transparent дизайне |
| D2.3, D2.4 | Discussion §«Threats» | opt-in + linking selection bias; sensitivity analysis (post-pilot) |
| D3.1, D3.2, D3.3 | Methodology §«Scope of generalization» | single-cohort × RU-L1 × app-friendly; per-teacher outcome scale |
| D5.4 | Methodology + Limitations | teacher CSV authoritative; self-report как fallback |
| D8.1 | Methodology | UTC-based timestamps; day-boundary caveats |
| D8.5 | Methodology §«Derived metrics» | growth_delta formula + null handling |
| D2.6, D2.7 | Limitations | quiz instrumentation; use-to-exam temporal drift |

### Tier 4 — после Chapter 4 + Methodology, если время позволит

| Gap | Cost | Что пишем |
|---|---|---|
| D7.3 DATA_DICTIONARY.md | 2-3 ч | Per-field таблица — thesis appendix |
| D7.5 heartbeat algorithm в METRICS_SCHEMA | 1 ч | Extract из code comments |
| D6.8 CONSENT_VERSION pre-commit hook | 1 ч | Process improvement |
| D1.5 schema-future-proofed fields cleanup | 0 ч | Doc cleanup, помечаем v3.4+ |

### Blocked (без teacher; явно park'аем как acknowledged limitations)

| Gap | Mitigation |
|---|---|
| D2.1 Pre-test baseline | Methodology явно reportирует отсутствие pre-test; primary outcome = `post_test_score` absolute. Discussion: causal direction не определена; correlation интерпретируется как effect-size estimate, не proof. |
| D2.5 Covariate survey | Limitations: confounding variables (motivation, prior exposure, hours/week) не measured. |
| D5.1 Quiz external review | Methodology: quiz = **secondary outcome**, teacher CSV = primary. Quiz validity = expert_judgement_v1 + AI pre-review. `production_ready: development_and_dogfood_only` per `V3_3_5_PREDEPLOYMENT_GATE_STATUS.md §7`. |
| D6.1 HE consent native review | Real-cohort deployment до HE-primary speakers — pending. RU/EN cohort деplyабельна сейчас. |
| D5.2 Inter-rater для teacher grading | Limitation; не критично для diploma-уровня. |

---

## 2. Consent edit audit call (T1.2)

Walking `RESEARCH_CONSENT_RULE.md §2` decision tree on the T1.2 edit:

| Question | Answer | Rationale |
|---|---|---|
| Q1: ADD metric / WEAKEN privacy guarantee? | NO | Filling placeholder with EU location + GDPR reference doesn't add metric, doesn't weaken privacy — strengthens framing |
| Q2: Extend retention beyond agreed? | NO | Retention still 2 года; not changed |
| Q3: Expand WHO has access? | NO | Same researcher, same provider (Railway), same region (was implicit, now explicit) |
| Q4: Change withdrawal / contact / k-anonymity? | NO | Mechanics unchanged |
| Q5: Wording polish / clarification of existing content? | YES | Filling `[Railway production server, расположение и compliance]` placeholder = wording clarification of existing intent. Adding ethical framework bullet to existing «Кто проводит исследование» section = clarifying existing implicit ethical foundation, not new section. |

**Verdict:** ✅ **NO `CONSENT_VERSION` bump.** Per Example B (cosmetic edit,
wording polish). Edit ships as a wording clarification under existing
v1.0.

**Note:** Если в будущем consent template получает добавление НОВОЙ
секции (не bullet в существующей), audit нужно перезапустить — borderline
minor bump per taxonomy.

---

## 3. Что было создано в этой сессии

### Документация
- `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md` (полный аудит, READ-only анализ)
- `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md` (этот документ — план closure)

### Thesis material (новый каталог `thesis/`)
- `thesis/OSF_PREREGISTRATION_DRAFT.md` (T1.1 — готов к submit на OSF)
- `thesis/IRB_FRAMEWORK_DRAFT.md` (T1.3 — material для thesis §1 + §4 + §5)

### Изменения в существующих docs
- `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` (T1.2):
  - RU §«Кто проводит исследование»: добавлен bullet «Этическая основа» (Helsinki §22-32 + supervisor oversight)
  - RU §«Хранение данных»: placeholder заменён на Railway EU + GDPR Art. 6(1)(a)
  - EN §«Who conducts the research»: parallel bullet «Ethical framework»
  - EN §«Data retention»: placeholder заменён parallel
  - Versioning table: note about cosmetic edit, no bump
- HE section: оставлена как есть (native review pending — machine-translation
  legal text не безопасна)

---

## 4. Что нужно от user-а ДО запуска пилота

### Critical-path
1. **Submit OSF pre-registration.** Open `thesis/OSF_PREREGISTRATION_DRAFT.md`,
   log in to OSF (osf.io), create new preregistration (recommend «OSF
   Standard Pre-Data Collection Registration» template), paste sections.
   После submit — захватить **registration DOI / URL** и записать в этот
   план §6 + в `thesis/OSF_PREREGISTRATION_DRAFT.md` header.
2. **Заменить placeholder'ы автора** в consent template:
   - RU/EN «Главный исследователь: [имя автора диплома, контакт]» → твоё имя + email
   - RU/EN «Контакт по исследованию: [email]» → твой email
   - RU/EN «security contact» → твой email
   - RU/EN «Учебная группа: [ulpan group identifier]» → реальный идентификатор когорты
3. **Stopwatch validation** (T2.3): сделать 3 sessions × 10 мин активного
   использования app с stopwatch'ем рядом. После каждой — copy
   `LinguistProResearch.previewToday().metrics.active_minutes_real` или
   IndexedDB `getActiveMsReal()`. Послать мне числа — я проанализирую
   соответствие против plan §11.1 acceptance ±10%.

### Optional (recommend но не блокер)
4. **Rotate OSF password** — он в transcript чата.
5. **Сообщить supervisor**: если есть supervisor у диплома, обсудить с
   ним consent + pre-registration + ethical framework choice. Supervisor
   sign-off усилит D6.7.

---

## 5. Tripwires для будущих сессий

- ❌ Не пытаться закрыть D2.1, D2.5, D5.1, D5.2, D6.1 без teacher. Они
  переезжают в Limitations.
- ❌ Не добавлять НОВЫЕ секции в consent template без re-running
  decision tree (это уже triggers minor bump).
- ❌ Не переписывать audit-report или этот closure plan как chapters —
  они source/working documents, не drafting space.
- ❌ Не submit'ить OSF pre-registration от моего имени с credentials
  из чата.
- ❌ Если pilot уже запущен — `research/**`, `public/js/research.js`,
  `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` становятся FROZEN. Verify
  pilot status before any edit.

---

## 6. Status log

| Date | Event | Detail |
|---|---|---|
| 2026-05-21 | Audit completed | `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md` written |
| 2026-05-21 | Closure plan approved | This document; user approved plan |
| 2026-05-21 | T1.1 Pre-reg drafted | `thesis/OSF_PREREGISTRATION_DRAFT.md` |
| 2026-05-21 | T1.2 Consent edit | Railway EU + GDPR + Helsinki added to consent template, no bump |
| 2026-05-21 | T1.3 IRB framework drafted | `thesis/IRB_FRAMEWORK_DRAFT.md` |
| 2026-05-22 | **T1.1 OSF preregistration REGISTERED** | URL: https://osf.io/zdv9j/ · DOI: 10.17605/OSF.IO/ZDV9J · public-immediately · ✅ Tier 1 fully closed |
| 2026-05-22 | README OSF badge | Added `[![Preregistered](...)](https://osf.io/zdv9j/)` to README badge row |
| 2026-05-22 | OSF integration env-var docs | `.env.example` placeholder `OSF_PERSONAL_TOKEN=` + `docs/CONFIG.md` "OSF Integration" subsection. Token slot for future replication-package automation; not required for diploma functionality. Raw token never stored in committed files. |
| 2026-05-22 | **Bilingual workflow setup** | User chose Option D 2026-05-22 (paired files + GLOSSARY + sync invariant) for full RU comprehension + EN deliverable. Created `docs/THESIS_BILINGUAL_WORKFLOW.md` (formal rule-set, 12 sections), `thesis/GLOSSARY.md` (initial 60+ term mappings from §4.1), `thesis/04_privacy_contribution.ru.md` (§4.1 RU mirror). Workflow rule: atomic dual update per section; single sign-off on RU = sign-off on EN. |
| 2026-05-22 | Chapter 4 §4.1 drafted (paired) | EN + RU mirror created; awaiting user RU review for sign-off before §4.2. |
| 2026-05-22 | Chapter 4 §§4.2–4.10 drafted (paired) | All 10 sections drafted EN + RU mirror. ~6000 words total ≈ 18–19 pages. Cadence transition mid-draft: §§4.1–4.6 with per-section sign-off; §§4.7–4.10 drafted in sequence per user request («перейди последовательно к каждому из блоков, я прочитаю итоговый файл»). GLOSSARY accumulated 250+ canonical RU↔EN term mappings. Open TODO citations: Sweeney 2002, NCES Standards, Helsinki Declaration formal, GDPR formal, Cohen 1988, Lakens 2018, Wasserstein & Lazar 2016, Siemens 2013, Microsoft STRIDE, Deng et al. LINDDUN, Dwork & Roth 2014, Geiping et al. 2020 — bundle for Role 2 literature pass. |
| 2026-05-22 | Chapter 5 Methodology drafted (paired, sequential) | All 10 sections (§§5.1–5.10) drafted EN + RU mirror in sequence per user request «основательно». ~6500 words EN ≈ 19–20 pages (over BRIEF §3 target 8-12; editing pass deferred). Closes audit MUST gaps D4.1 (power calc in §5.5.6), D4.2 (multiple comparisons in §5.5.4), D4.3 (wide CIs framing in §5.5.3+§5.5.6), D8.5 (growth_delta formula in §5.6.3). Closes HIGH gaps D1.1 + D1.2 (active_minutes operational definition §5.6.1), D1.3 (SRS proxy framing §5.6.2), D1.7 (multi-device §5.6.4), D8.1 (timezone §5.6.5), D3.1+D3.2+D3.3 (generalization scope §5.7), D2.2+D2.3+D2.4+D2.5 (limitations preview §5.9). Full alignment with OSF preregistration `osf.io/zdv9j`. New TODO citations: Cohen 1988, Cumming 2014, Rasch 1960/1980, Bond & Fox 2007, Hattie 2009, Ericsson & Pool 2016, Mueller & Oppenheimer 2014, Adair 1984, Kuncel et al. 2005. GLOSSARY now at 350+ entries. |
| 2026-05-22 | Chapter 3 System Design drafted (paired, sequential) | All 9 sections (§§3.1–3.9) drafted EN + RU mirror in sequence. ~3400 words EN ≈ 11 pages (on BRIEF §3 target 10–15). Foundation context for Chapters 4 and 5. Sections: (3.1) architectural philosophy — data sovereignty / Hebrew-first / iterative refinement; (3.2) v3.0→v3.7 evolution narrative; (3.3) core principles — offline-first OPFS+SQLite-WASM, PWA, cloud-only resources, open-source default; (3.4) domain — text editor + morphology + TTS/translation + premium notes + text-card + SRS + smart learning graph + cross-text hub; (3.5) research-mode integration with module boundary; (3.6) dual-mode UX + mobile v3.7 + teacher dashboard + single-file structure; (3.7) data — client SQLite + research-data + audio cache; (3.8) build + Railway EU deployment + tag-pinning. References ULPAN_RESEARCH_PLAN §2+§5, PRODUCT_COHESION, PREMIUM_RELEASE_PLAN_v3_3, SMART_LEARNING_GRAPH_ROADMAP_v3_6, MOBILE_UX_REDESIGN_PLAN_v3_7, MORPHOLOGY_REQUIREMENTS_v3_2, PREMIUM_NOTES_PLAN_v3_2, TEXT_CARD_PLAN_v3_2, OPFS_MIGRATION_PLAN. New TODO citations: WHATWG OPFS specification, project PWA documentation, hspell project Har'El & Kenigsberg, Norman 1988 affordance (HCI), TTS_HEBREW_DECISION. GLOSSARY now at 450+ entries. **Three thesis chapters drafted: 3 + 4 + 5.** |
| 2026-05-22 | Chapters 1, 2, 6, 7, 8 drafted (sequential, all roles) | **All 8 thesis chapters drafted.** Chapter 1 (Introduction, ~1700 words EN) — Role 1, sets up two RQs + twofold contribution + thesis roadmap. Chapter 2 (Related Work, ~4400 words EN) — Role 2 via sub-agent dispatch (general-purpose agent, ~9 minutes, 52 tool uses): all 22 + 22 additional citations verified through web search; structure 8 sections (CALL+MALL / Hebrew morphology / LA+ethics / SRS / privacy frameworks / Rasch+CEFR / small-N stats / synthesis). Chapter 6 (Results stub, ~450 words EN) — structured placeholder with per-section `[TODO: fill post-pilot]` markers for §§6.1–6.11. Chapter 7 (Discussion, ~1900 words EN) — Role 1, full structure with limitations / threats / future-work fully drafted; result-interpretation sections marked with `[TODO: fill post-pilot]`. Chapter 8 (Conclusion + Future Work, ~1300 words EN) — Role 1, synthesis + scaling architecture Stages 1-5 + open questions + acknowledgements placeholder. Created `thesis/BIBLIOGRAPHY.md` as master APA 7 bibliography (38 entries, all verified). Cadence change mid-session: user approved sequential drafting without per-chapter sign-off. **All TODO citations across all chapters now resolve to BIBLIOGRAPHY.md entries.** |
| 2026-05-22 | **Premium-stack {V5 + V3 + V1 + V2} implementation** | Full premium-stack roadmap implemented in single session per `C:\Users\lletp\.claude\plans\iterative-whistling-sky.md` + `docs/IMPLEMENTATION_PLAN_PREMIUM_STACK_2026_05_22.md`. (1) **V5 TOST-SESOI** — `scripts/research/tost_analysis.R` with locked SESOI=0.5 + α=0.00625 Bonferroni against 8 tests; OSF deviation log §9.1; 06_results §6.3.5 + 07_discussion §7.4 EN+RU. (2) **V3 CVP (Construct-Validity Pluralism)** — `getAudioExposureMs()` + `getTextExposureMs()` in `public/db/local-db.js`; `ALLOWED_METRIC_KEYS` + intMetrics extended in `research/validate.js`; daily aggregator emits `audio_exposure_minutes` + `text_exposure_minutes` in `public/js/research.js`; 06_results §6.7.1 multitrait-multimethod table + 07_discussion §7.4 V3 paragraph EN+RU; OSF §9.4. (3) **V1 PBSL** — `scripts/research/bayes_sensitivity.R` (BayesFactor JZS Prior A + analytic Normal Priors B/C) + `bayes_sensitivity_smoke.R`; OSF §9.2 three-prior pre-registration; 06_results §6.3.6 + 07_discussion §7.4 Bayesian paragraph EN+RU. (4) **V2 MCREMA** — `exportMetaAnalysisCsv()` in `public/js/teacher.js` with deidentified cohort_001/002 labels + per-cohort k=5 gate + Pearson r → Fisher z conversion for all 4 hypotheses; `scripts/research/meta_analysis.R` (REML via metafor::rma) + `meta_analysis_smoke.R` (K-curve simulation K=3/5/8); `thesis/META_ANALYSIS_PROTOCOL.md` + `.ru.md` (8 sections: purpose / REML / heterogeneity / min-K / cumulative-evidence / deidentification / K-curve / status); 07_discussion §7.8 MCREMA positioning EN+RU; OSF §9.3 protocol pre-registration. GLOSSARY ~40 new bilingual pairs (TOST, SESOI, JZS, REML, τ², I², forest plot, funnel plot, multitrait-multimethod, deidentified cohort label, K-curve, etc.). **Tripwires honored:** zero changes to `FORBIDDEN_FIELDS`; zero `CONSENT_VERSION` bumps; zero modifications to primary OSF-locked H1–H4 tests; all four supplementary analyses pre-declared in deviation log before any frozen-dataset access; all R scripts include locked-parameter footers. Total impl: ~14 deliverables across 1 session; V4 WSLR deferred to v3.5/v4.0 post-Anki-Connect per plan. |
| pending | Stopwatch validation (T2.3) | User to perform; result analyzed and merged into Methodology |
| pending | Chapter 4 drafting (T2.1+T2.2) | Role 1 session: threat model + comparison table → thesis §4 |
| pending | Methodology drafting (Tier 3) | Role 1 session: §«Operationalization» + §«Scope» + §«Statistical framing» + §«Reliability» + §«Ethics» |

---

**Authorship.** Closure plan approved by user 2026-05-21. Tracks closure
of audit gaps under constraint «no teacher contact pre-pilot».
