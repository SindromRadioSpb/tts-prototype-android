# Premium Release Plan — v3.2.0

> **Цель релиза:** превратить LinguistPro из premium learning workspace в **профессиональную EdTech-платформу для изучения иврита и проведения образовательных экспериментов**.
>
> **Принцип** (формулировка пользователя): *«Direction 11 нужно делать не как аналитику, а как научно пригодный, этически защищённый и масштабируемый research-mode. Тогда приложение становится не просто учебным инструментом, а профессиональной EdTech-платформой для изучения иврита и проведения образовательных экспериментов.»* — этот принцип распространяется на весь v3.2 release.
>
> **Baseline:** v3.1.0 (premium polish complete: typography, theming, i18n, onboarding, smart-sort, error gentleness, PWA, trust signals).
>
> **Что не входит в этот релиз:** functional code-split монолита (deferred → v3.3+); cloud sync (явный non-goal); A/B framework (нужны метрики и трафик); knowledge-graph view notes (M8 deferred → v3.3); calibrated in-app diagnostic quiz (deferred → v3.3); short-link share-cache server endpoints (deferred → v3.3); custom user themes; multi-deck SRS; push notifications.

---

## Метарешение релиза

v3.2 = **mega-release** объединяющий 4 directions в одну cohesive поставку. Trade-off (~7–9 рабочих недель) принят сознательно потому что:

- **Direction 10 prerequisite для Direction 11** — без peer-share text-cards научно-валидное cohort comparison невозможно.
- **Direction 9 + Direction 11A share infrastructure** — note save/edit события emit'ятся одновременно с notes redesign.
- **Direction 11A standalone-ценен** для всех users (Activity Heatmap accuracy, CONTRACTS drift closure) — стимул shippит независимо.
- **Все 4 directions** соединены single principle: *premium → research-grade → scalable*.

**Approval timestamp:** 2026-05-10 (utvержден пользователем по результатам Brainstorm A + B + C).

---

## Структура релиза — четыре направления

| # | Direction | Что | Plan doc | Effort |
|---|-----------|-----|----------|-------:|
| **9** | Premium Notes Redesign | Polymorphic + audio-anchored + templated + versioned + linked + SRS-micro-card notes + **morphology auto-extraction via HebMorph sidecar** (re-research 2026-05-10 unlocked AGPL with non-commercial framing) | [`PREMIUM_NOTES_PLAN_v3_2.md`](PREMIUM_NOTES_PLAN_v3_2.md) | 16–20 дней |
| **10** | Text-card System | Three-mode artifact lifecycle: Mode A bulk builder + Mode B peer-share (lightweight JSON via content-addressed audio cache) + Mode C curator request | [`TEXT_CARD_PLAN_v3_2.md`](TEXT_CARD_PLAN_v3_2.md) | 7–8.5 дней |
| **11A** | Analytics Foundation (mini-direction, ships independently) | Phase 11.0 event emission gap closure (12 event types) + Phase 11.1 time-spent v2 (heartbeat-based real activity tracking) | [`ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md) §6 | 5–7 дней |
| **11B** | Research Mode | Opt-in privacy-preserving research infrastructure: anonymous student_id + cohort code + daily aggregate uploads + `/api/research/v1/*` endpoint family + teacher dashboard `/teacher.html` + IRB-style consent. Enables ulpan diploma project. | [`ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md) §7 | 11–14 дней |
| | | | **Total** | **39–49.5 дней** (~8–10 рабочих недель) |

Companion docs:
- [`RESEARCH_METRICS_SCHEMA.md`](RESEARCH_METRICS_SCHEMA.md) — formal v1 schema для research-mode payloads.
- [`RESEARCH_ETHICS_CONSENT_TEMPLATE.md`](RESEARCH_ETHICS_CONSENT_TEMPLATE.md) — IRB-style informed consent (RU complete, EN translated, HE skeleton).

---

## Принципы качества (наследуются от v3.1)

1. **Каждый экран должен ощущаться так же продуманно, как feedback-модалка.**
2. **Hebrew first.** Никакой компонент не ломается в RTL.
3. **i18n coverage real.** Любая UI-строка переводится.
4. **Optimistic + gentle.** UI отвечает мгновенно; ошибки не блокируют, а предлагают путь дальше.
5. **Mobile = native-feel.**
6. **Trust on every screen.**
7. **No regressions.**

### Дополнительно для v3.2

8. **Privacy is non-negotiable.** Research mode = opt-in only, default OFF, no PII, aggregates only, one-click withdrawal, k-anonymity ≥ 5.
9. **Offline-first invariant preserved.** Все 4 directions sushhectvyut при offline use; research mode добавляет single new server endpoint family как **архитектурное исключение** (opt-in, aggregates only).
10. **Backwards compat: bundle format unchanged.** v3.2 НЕ bumpит `library.json` schema_version (D2 Direction 9). Advanced notes ride в новом `library/notes_advanced.json` файле, ignored Android v2.

---

## Recommended order реализации

```
Phase 1 — Analytics Foundation (Direction 11A) — first
   Phase 11.0 → Phase 11.1
   Reason: shippable independently; useful to all users; foundation для Direction 11B и для note save/edit emit (Direction 9)

Phase 2 — Premium Notes (Direction 9) — параллельно с Direction 10
   Phase 9.0 (research) → 9.1 (foundation) → 9.2 (audio anchor) → 9.3 (linking + templates + SRS) → 9.4 (morphology)

Phase 3 — Text-card System (Direction 10) — параллельно с Direction 9
   Phase 10.0 (UX wireframes + privacy) → 10.1 (Mode A) → 10.2 (Mode B) → 10.3 (Mode C)

Phase 4 — Research Mode (Direction 11B) — последний (зависит от 9 + 10 + 11A)
   Phase 11.2 (consent + opt-in) → 11.3 (aggregation pipeline) → 11.4 (server endpoint) → 11.5 (teacher dashboard) → 11.6 (outcome capture) → 11.7 (documentation + ethics)
```

**Почему такой порядок:**
- **Direction 11A first** — closes existing CONTRACTS_ANALYTICS drift (Tier 0 audit gap). Shippable standalone. Improves Dashboard heatmap для всех users.
- **Direction 9 + Direction 10 параллельно** — independent, не блокируют друг друга. Direction 9 расширяет note-event emission (тянется на 11A); Direction 10 расширяет text-import event emission (тоже 11A).
- **Direction 11B last** — нуждается в 9 + 10 + 11A для full functionality.

---

## Quality gates

### Перед merge каждой Phase

- [ ] Syntax check passed (`node --check` для inline-scripts).
- [ ] i18n locale validation: новые ключи присутствуют во всех 3 языках.
- [ ] Manual smoke на desktop Chrome: главные сценарии работают.
- [ ] Manual smoke на mobile (DevTools mobile mode): touch UX не сломан.
- [ ] Existing tests (`/db/db-init-test.html`) проходят.
- [ ] Если phase touches OPFS-схему — миграция validated на пустой DB AND на DB с существующими данными.
- [ ] Если phase touches privacy surface — manual inspection of payload (grep for forbidden field patterns).

### Перед закрытием релиза v3.2.0

- [ ] Все 4 directions помечены как done в этом плане.
- [ ] Полный регрессионный pass: каждый сценарий из user-guide проходит.
- [ ] Lighthouse: Performance / Accessibility / Best Practices / PWA / SEO — все ≥ 90 (regression check vs v3.1.0).
- [ ] Mobile dogfood pass: iPhone + Android + Desktop Chrome.
- [ ] Cross-device ZIP roundtrip — preservation rules verified per [`TEXT_CARD_PLAN_v3_2.md`](TEXT_CARD_PLAN_v3_2.md) §6.
- [ ] Dark theme pass: каждый главный экран проверен в обоих режимах.
- [ ] **Research readiness checklist** (`ULPAN_RESEARCH_PLAN_v3_2.md` §9) **полностью зелёный** перед deployment в реальную ulpan group.
- [ ] CHANGELOG.md обновлён (v3.2.0 entry).
- [ ] Version bump в `package.json` → `3.2.0`.
- [ ] Git tag `v3.2.0` создан.
- [ ] GitHub Release с release notes опубликован.

---

## Audit checklist (финальный пасс v3.2)

После завершения всех 4 directions — глубокий аудит. Только если ВСЁ зелёное — релиз готов.

### Direction 9 (Premium Notes)
- [ ] Migrations 021–025 проходят на пустой DB AND на DB с существующими `sentence_notes` (≥ 100 rows).
- [ ] All 10 mechanics (M1–M10) функциональны *кроме* M8 (knowledge graph) deferred в v3.3.
- [ ] `notes_advanced.json` export/import roundtrip preserves all advanced notes (web→web).
- [ ] Web→Android v2→web roundtrip preserves только sentence-bound free notes (degradation acceptable, documented).
- [ ] Versioning retention (50 versions FIFO) функционален.
- [ ] All UI strings в ru/en/he.

### Direction 10 (Text-card System)
- [ ] Mode A bulk-build 10 текстов completes successfully на typical homework set within 8 minutes.
- [ ] Mode A pipeline survives modal close + reopen без loss progress.
- [ ] Mode B lightweight JSON file size ≤ 50 KB для card до 100 rows.
- [ ] Mode B receiver import preview показывает correct rows + audio status.
- [ ] Mode B audio resolution paths (cache hit / miss / re-synthesis) all functional.
- [ ] Mode C Standard branch redirects в Mode A с pre-filled content.
- [ ] Mode C Curated branch generates correct WhatsApp deep-link.

### Direction 11A (Analytics Foundation)
- [ ] All 12 event types emit с correct anonymized payloads.
- [ ] `events` table grows linearly с usage; нет hot-spot indexing issues.
- [ ] `active_minutes_real` за неделю в Activity Heatmap accurate (validated against manual stopwatch test, ±10%).
- [ ] Idle detection корректен (5 min idle → not counted).
- [ ] Background tab → not counted.
- [ ] iOS Safari + Android Chrome + Desktop Chrome — все работают.
- [ ] CONTRACTS_ANALYTICS doc обновлён на actual emission state.

### Direction 11B (Research Mode)
- [ ] Default OFF; activation requires explicit consent click.
- [ ] Consent screen lists exactly то, что collected per `RESEARCH_METRICS_SCHEMA.md`.
- [ ] `student_id` UUID never linked to any PII.
- [ ] Withdrawal flow tested manually — server data удаляется, local state cleared.
- [ ] k-anonymity enforced: per-student breakdown hidden when cohort < 5.
- [ ] Aggregator output identical to manual SQL queries on `events` (validation test).
- [ ] POST `/api/research/v1/metrics` rejects forbidden fields (schema-strict).
- [ ] DELETE `/api/research/v1/student/:student_id` removes all data + audit-logs.
- [ ] No PII in server logs.
- [ ] Teacher dashboard `/teacher.html` loads cohort aggregates given valid token.
- [ ] CSV export schema matches `ULPAN_RESEARCH_PLAN_v3_2.md` §8.
- [ ] Pearson r computed correctly (validated against R/Python).
- [ ] Research readiness checklist **all `[x]`** before deployment to real cohort.

### Privacy / data integrity (cross-direction)
- [ ] Cascade-delete (text → notes) corrected: text-bound notes удаляются, root/binyan/free — нет.
- [ ] OPFS quota warning (B1 from v3.0.0 — 80%/95%) учитывает growth от note_versions.
- [ ] Bundle export size остаётся reasonable (< +20% от текущего на realistic libraries).
- [ ] Mode B file format includes только что user explicitly chose; no user identity leaked.
- [ ] Research mode payload validation — server rejects payloads с raw text / PII fields.

### Documentation
- [ ] `PREMIUM_NOTES_PLAN_v3_2.md` — финальный live status flip [ ] → [x].
- [ ] `TEXT_CARD_PLAN_v3_2.md` — финальный live status flip.
- [ ] `ULPAN_RESEARCH_PLAN_v3_2.md` — финальный live status flip.
- [ ] `STORAGE_CONTRACT.md` — обновлён с описанием новых tables + bundle additions.
- [ ] `DB_SCHEMA.md` — обновлён.
- [ ] `CONTRACTS_ANALYTICS.md` — re-aligned с actual emission state.
- [ ] `PRIVACY.md` — extended section on research mode.
- [ ] `RESEARCH_METRICS_SCHEMA.md` — final.
- [ ] `RESEARCH_ETHICS_CONSENT_TEMPLATE.md` — RU/EN final, HE native-reviewed before deployment.
- [ ] `RESEARCHER_GUIDE.md` — final.

---

## Live status

> Обновляется по мере реализации. Каждое направление — `[ ]` planned → `[~]` in-progress → `[x]` done.

- [x] **Direction 11A** — Analytics Foundation *(commits 7ed309f → 3f6b959, 2026-05-10)*
  - [x] Phase 11.0 — Event emission gap closure (12 event types wired; CONTRACTS drift closed; 23/23 Playwright tests pass)
  - [x] Phase 11.1 — Time-spent v2 (heartbeat-based session tracking + idle-aware aggregation; getActiveMsReal / getActiveMinutesByDay / getSessionMetrics exports)
- [~] **Direction 9** — Premium Notes Redesign *(in progress — Phase 9.1 ~50% done)*
  - [x] Phase 9.0 — Hebrew root extractor research *(commits `39230f8` v1 + `6f5c1ad` v2 re-research, 2026-05-10)*
  - [~] Phase 9.1 — Foundation (split into 5 sub-phases A/B/C/D/E)
    - [x] 9.1.A — Schema migrations 021–025 *(commit `8da394e`, 18/18 tests)*
    - [x] 9.1.B — local-db.js polymorphic API *(commit `3a45833`, 38/38 tests)*
    - [ ] 9.1.C — Notes modal UI revamp *(handed off to separate worktree-isolated session — invasive UI work)*
    - [ ] 9.1.D — Bundle compat (notes_advanced.json)
    - [ ] 9.1.E — i18n keys + final audit
  - [ ] Phase 9.2 — Audio anchoring (M2)
  - [ ] Phase 9.3 — Linking + Templates + SRS micro-cards
  - [ ] Phase 9.4 — Morphology *(revised 5.5–7 days после Phase 9.0 v2 re-research; **Option A — HebMorph sidecar** для auto-extraction + Plan B + C as graceful offline/OOV fallback; new endpoint family `/api/morphology/v1/analyze`; AGPL-compatible due to non-commercial framing)*
- [ ] **Direction 10** — Text-card System
  - [ ] Phase 10.0 — UX wireframes + privacy section draft
  - [ ] Phase 10.1 — Mode A — Bulk builder
  - [ ] Phase 10.2 — Mode B — File-based share
  - [ ] Phase 10.3 — Mode C — Curated request channel
- [ ] **Direction 11B** — Research Mode
  - [ ] Phase 11.2 — Research mode opt-in + consent
  - [ ] Phase 11.3 — Aggregation pipeline
  - [ ] Phase 11.4 — Server-side ingestion (`/api/research/v1/*`)
  - [ ] Phase 11.5 — Teacher dashboard `/teacher.html` + fake cohort seed
  - [ ] Phase 11.6 — Outcome capture (self-report + CSV upload)
  - [ ] Phase 11.7 — Documentation + ethics

### Research readiness checklist

См. [`ULPAN_RESEARCH_PLAN_v3_2.md`](ULPAN_RESEARCH_PLAN_v3_2.md) §9. **ALL checkboxes** must be `[x]` before real ulpan deployment.

---

## Deferred → v3.3 (явно)

- **Functional code-split** монолита `public/index.html` (Dashboard / SRS / IDE → ES modules).
- **Sherpa adapter lazy-load** (~13.7 KB).
- **Knowledge-graph view notes** (Direction 9 M8).
- **Server-side TTL share-cache** + short public URLs (Direction 10 v3.3 epic).
- **End-to-end encryption на text-card share**.
- **Received cards inbox** (Direction 10 nice-to-have).
- **Mode A bulk limit 10 → 25** (after v3.2 dogfood feedback).
- **Mode B include-advanced-notes opt-in** (coordinate с Android v2 update).
- **Calibrated in-app diagnostic quiz** (Direction 11 outcome capture v2).
- **Multi-cohort comparative dashboard** (Direction 11 Stage 3).
- **Optional encryption / OS keychain** (long-term backlog).
- **Premium table-edit mechanics** (long-press DnD).
- **Hebrew `web_wasm` shipping** (license-blocked, separate research).
- **DictaBERT in-browser via transformers.js** (new highest-priority v3.3 morphology epic — replaces HebMorph sidecar with fully-offline premium Hebrew morphology; ~2–3 weeks, untested combination needs proof-of-concept first; CC BY 4.0).
- **HebMorph sidecar hardening** — sophisticated rate-limit tiers + morphology cache layer (keyed by word hash) + telemetry counters (small v3.2.x patch items, не v3.3 epic).
- **YAP→WASM Hebrew morphology** — demoted from "v3.3 candidate" to "nice-to-have v3.3+". HebMorph sidecar в v3.2 already solves runtime auto-extraction; WASM only matters if explicit offline-first user pressure emerges.

---

## Что явно out-of-roadmap (won't do)

- **Cloud sync** — противоречит offline-first invariant.
- **A/B framework** — нужны метрики и трафик (>1000 users).
- **Push notifications / Background sync** — нужны use-case + backend infra.
- **Server-side rendering** — overkill для offline-first.
- **Native iOS/Android packaging** — отдельный проект; web PWA install достаточен.
- **FSRS replacement of SM-2** — текущий algorithm работает.
- **Custom user themes** (deep customization) — после baseline theming.
- **Server-side TTS quota dashboard** для end users — для админов, не для юзеров.
- **Marketing landing page** — отдельный проект.

---

## Cross-references

- v3.1.0 plan: [`PREMIUM_RELEASE_PLAN_v3_1.md`](PREMIUM_RELEASE_PLAN_v3_1.md) — baseline; audit checklist updated 2026-05-10.
- ROADMAP_PREMIUM (P3/P4/P5/P6 status updated): [`ROADMAP_PREMIUM.md`](ROADMAP_PREMIUM.md).
- C-series backlog: [`C_SERIES_PLAN.md`](C_SERIES_PLAN.md).
- Storage contract: [`STORAGE_CONTRACT.md`](STORAGE_CONTRACT.md) (will be updated as part of Direction 9 + 10 + 11 documentation phases).
- Privacy: [`PRIVACY.md`](PRIVACY.md) (will be updated с research-mode section в Direction 11.7).
- Archived plans (для historical reference):
  - [`FINAL_RELEASE_PLAN.archived-2026-05-10.md`](FINAL_RELEASE_PLAN.archived-2026-05-10.md)
  - [`LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.archived-2026-05-10.md`](LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.archived-2026-05-10.md)

---

**Last updated:** 2026-05-10 (initial commit)
