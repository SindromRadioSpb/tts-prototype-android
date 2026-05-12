# SRS Strategy — v3.2 scope decision

> **Status.** Approved by user 2026-05-12 (after R2.2 dogfood, before R5/R6).
> **Companion docs.** `PREMIUM_NOTES_PLAN_v3_2.md`, `ULPAN_RESEARCH_PLAN_v3_2.md`, `CONTRACTS_ANALYTICS.md`.

## Decision

**LinguistPro is the *creation + linkage* layer for SRS cards. Anki is the *review* layer.**

Concretely:
- The in-app `🎯 SRS Trainer` stays in v3.2 as a **minimal stub** — it can render cards and accept grades, but it is not the recommended path.
- Every templated note keeps the `🎴 Сделать карточкой` button. The created `srs_cards` row is the linkage record (note ↔ flashcard) — preserved for research metrics and for Anki export packaging.
- The primary "review" CTA is `📥 Экспорт в Anki` (already implemented as `btnAnki`). The user reviews in Anki, where 15+ years of FSRS polish and ecosystem (mobile sync, decks, study options) are mature.

## Why not a premium in-app SRS

| Dimension | Anki | What in-app SRS would need |
|-----------|------|---------------------------|
| Algorithm | FSRS-4.5 (research-validated retention) | Re-implement or vendor; ~2-3 weeks |
| Mobile sync | AnkiMobile, AnkiDroid native | LinguistPro is web-only in v3.2-v3.3 |
| Study options | Deck filters, review-ahead, suspend, bury, advanced configs | ~3-4 weeks of UX work |
| Community decks | Shared decks, voting, dual-language pre-builts | Out of scope |
| Audio playback in card | Native | Possible but requires asset routing |

Conservative effort to ship Anki-quality in-app SRS: **6-10 weeks of dedicated work**. That displaces Direction 9.4 (HebMorph), Direction 10 (text-card), and Direction 11 (research-mode), each of which is uniquely LinguistPro-shaped value that Anki cannot deliver. The opportunity cost is not justified.

## What ships in v3.2

| Layer | v3.2 behavior |
|-------|---------------|
| **Card creation** | `🎴 Сделать карточкой` on any templated note → polymorphic `srs_cards` row, `template_id = note_<note_type>`, `source_note_id` back-pointer set. (No change from current 9.3.C.) |
| **In-app Trainer** | Minimum-viable: opens, lists cards due today, supports four-grade review (Again / Hard / Good / Easy), persists grade + interval. **Not** the primary path. The home view of the Trainer gains a prominent "📥 Reviewing in Anki? Export →" CTA. |
| **Anki export** | Existing `btnAnki` flow. For v3.2 we add an explicit "Export all SRS-flagged notes" path — sentence-cards + note-cards bundle into one `.apkg`. |
| **Card lifecycle on note delete** | Existing CASCADE remains. |
| **Card lifecycle on note convert** | R2.2 behavior: `convertNoteType` drops the linked card (template no longer matches). Warn banner promises removal. |
| **Orphan-card sweep** | `srs.cleanupOrphanedNoteCards()` runs on Trainer open (defensive — catches pre-R2.2 broken cards). |

## What is deferred to v3.4+ (Premium SRS Epic)

A separate phase, post-Direction 11 diploma. Indicative scope (subject to re-research at the time):
- FSRS-4.5 algorithm implementation or library vendor.
- Premium Trainer UX: keyboard shortcuts, deck filters, study-ahead, suspend/bury, mature card progress indicators.
- Audio-anchored cards (note's audio_anchor_ms plays during review).
- `Anki Connect sync` — bidirectional: review results from Anki land back in `srs_reviews` so research-mode retention metrics work without forcing in-app reviews.
- Multi-deck organisation, tags, custom intervals.
- Effort estimate (preliminary): **8-12 days** for FSRS + premium Trainer; **3-4 days** for Anki Connect sync. To be re-scoped when the epic opens.

## Research-mode adjustment (Direction 11)

The original Direction 11 design assumed in-app `srs_review` events would be the retention-metric source for the diploma research. Under the new scope:

**Demoted events** (still emit when user uses the in-app stub Trainer, but no longer load-bearing for research validity):
- `srs_review`
- `srs_session_started`
- `srs_session_finished`

**New events** (replace retention metric with creation/export-stage metrics):
| Event | Trigger | Payload |
|-------|---------|---------|
| `srs_card_exported_to_anki` | `btnAnki` flow that includes ≥1 `card_kind='note'` cards | `payload_json.{cards_total, cards_note_kind}` — counts only |
| `srs_card_created` (already covered by `card_added_to_srs` in Phase 11.0) | `🎴 Сделать карточкой` success | `note_id` hash |

**New research-metric definition** for the diploma:
- *Engagement proxy:* `cards_created` / `notes_created` ratio per cohort week. Tracks active processing, not memorisation.
- *Mastery proxy* (interim): cards reaching `exported_to_anki` state, normalised per active day. Tracks user moving cards into "real" review pipeline.
- *Retention metric* (deferred to v3.4+): blocked on Anki Connect sync. The diploma narrative either (a) accepts engagement-proxy + mastery-proxy as the primary outcome and frames retention as future work, OR (b) waits for v3.4 Anki sync before final analysis.

User decision required (before Direction 11B): which framing for the diploma. Default assumption is (a) — engagement + mastery proxies are sufficient for a v1 ulpan study; retention validation is a v2 follow-up.

## User-facing UX implications (R5 onboarding)

- The notes help-popover SRS section text should be updated to set the right expectation: *«Карточки создаются здесь, повторение — в Anki через "📥 Экспорт".»*
- The in-app Trainer's empty/home view gains the export-CTA banner.
- No new toasts; no UI surprises beyond what R2.2 already shipped.

## Code surface — what does NOT change in this scope decision

- `srs_cards` schema stays.
- `srs.createCardFromNote` / `srs.cleanupOrphanedNoteCards` / `srs.reviewCard` stay.
- `convertNoteType` R2.2 drop-on-convert behavior stays.
- All Phase 9.3.C SRS plumbing (toSrs button, template seeding) stays.

## Code surface — what we do change (R5 scope)

1. Help-popover SRS section copy + i18n (RU/EN/HE).
2. Trainer home view banner with `📥 Export to Anki` CTA (and updated subtitle copy).
3. `Anki` export flow: include note-cards (`card_kind='note'`) alongside sentence-cards in the `.apkg`.
4. New event `srs_card_exported_to_anki` emitted at the end of a successful export. Registered in `CONTRACTS_ANALYTICS.md`.
5. Plan documents updated (this commit).

## Risks

| Risk | Mitigation |
|------|------------|
| Users who don't use Anki feel stranded by the "minimum stub" Trainer. | The stub IS functional — they can still review in-app. We only de-emphasize it as the recommended path. |
| Research diploma loses retention-metric narrative. | Engagement + mastery proxies + framed-as-future-work in thesis. Accepted by user. |
| Anki export complexity (note-card templates differ from sentence-card templates). | R5 includes the export-format work; falls back to plain-text card content if Anki template fails. |
| Some users may want a polished in-app SRS later. | v3.4+ Premium SRS Epic — explicit, planned, not abandoned. |

## Approval signature

- User confirmation: 2026-05-12 (chat transcript) — *"Подтверждаю курс. Оформляй scope-документ + правь планы + затем продолжай R5/R6"*.
- Implementer: Claude Opus 4.7 (1M context).
- Branch: `phase-9-3-5-foundation-reinforcement`.
- This document governs SRS-related scope decisions for the remainder of v3.2 and the planning of v3.4.
