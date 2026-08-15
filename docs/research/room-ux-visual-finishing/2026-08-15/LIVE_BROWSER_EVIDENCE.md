# Live-browser evidence

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `CODE`  
> Limitations: desktop Kapture and browser automation only; no physical iPhone/Android or VoiceOver/TalkBack/NVDA; isolated 720 CSS px is only a 200% reflow proxy.

## Owner-live read-only — Kapture

Authorized tab: `https://linguistpro.kolosei.com/library.html#room=benyehuda`, RU/LTR, Chrome, 1920×911.

| Observation | Evidence | Implication |
|---|---|---|
| Served version | footer/About both `3.11.388` | production and repo APP/SW version agree |
| Real Ben-Yehuda rows | 16 visible rows; all Hebrew titles; title length 9–38; row height 86–113 px; title 16/21.6 px | current vertical row grammar is viable and must stay frozen |
| Real My Texts fixtures | read-only DB aggregate: 115 total; first 48 sampled; title length 10–96; 19 Hebrew and 18 mixed-script titles; 1–1651 rows; 23 with bound media; 8 with progress | visual choices were evaluated against long/mixed titles, large texts, progress and media, not a synthetic empty profile |
| Learner truth protection | `review_log` count `7357 → 7357` around the DB reads | no grade/review event was synthesized |
| Layout | no horizontal page overflow; rows are 1054 px within the 1120 px content measure | desktop measure is stable but can feel under-scaled at 1920 |
| Global chrome | 67 visible buttons, 27 links, zero inline `svg` and zero `img` UI nodes | emoji/text glyphs are the entire live icon system |
| Header | full-width due CTA sits outside the 1120 px header/tabs measure | visual container rhythm is inconsistent, without being an IA problem |
| Safety | no navigation, text open, audio, filter, disclosure, bookmark, note, list, progress, presentation-key, cache or provider action | evidence is read-only, not owner acceptance |

Screenshots: `screenshots/prod-owner-readonly-desktop-header.png` and `screenshots/prod-owner-readonly-desktop-ben-middle.png`.

## Isolated production automation

Fresh isolated context, with no owner cookies/storage, was used for responsive and state probes.

### 380×844 RU

- No horizontal overflow.
- Header is ~159 px tall before content; five 29 px global controls sit in a second row.
- The literary tab visually ellipsizes although the accessibility name remains complete.
- 26 focusable targets are under 44 px, but none sampled under WCAG 2.2's 24 px minimum. Recent primary controls are 44 px; header controls are 29 px.
- Tab sequence is logical: Studio → Mentor → Sync → Theme → Language → three tracks → main action → next item → journey. Recent content components have a 3 px author focus ring; header/track controls rely on a 1 px UA outline.
- The page has two visible `h1` nodes (sub-brand and L0 title); the landmarks and tab roles are otherwise coherent.

### 380×844 HE/RTL

- `html lang=he dir=rtl`, no horizontal overflow, no clipped sampled heading/button after the WCAG text-spacing probe.
- Header controls reverse and the primary arrow mirrors correctly.
- Many Hebrew content titles receive `dir=rtl`, but Room often omits `lang=he`; this is masked when the whole UI is HE and exposed in RU/EN mixed-language views.
- The intended serif selector resolves to a missing `Noto Serif Hebrew` asset and falls back to Times/system Hebrew.

### Text spacing and reflow

- RU and HE survived the WCAG 1.4.12 probe (`line-height:1.5`, paragraph spacing `2em`, letter spacing `.12em`, word spacing `.16em`) with no page overflow or sampled clipping.
- A 720 CSS px desktop-width proxy for 1440 px at 200% had no horizontal overflow and retained the long Hebrew feature title. This is automation evidence only; actual browser 200% and physical owner checks remain future gates.

### Offline/reconnect and theme

- An isolated offline event rendered `offline-ready`: “Офлайн: локальные тексты и чтение доступны”, `role=status`, `aria-live=polite`; retry stayed hidden. Returning online hid the status.
- The supported auto dark theme rendered slate background/text correctly. Computed `color-scheme` remained `normal`, so native controls do not receive an explicit light/dark scheme contract.
- Reduced motion was inspected statically; the browser tool did not emulate the media preference in this session.

## Network and loading observations

- Key shell, font and runtime assets returned 200. Expected unauthenticated owner/group endpoints returned 401; no page JavaScript exception was observed.
- A fresh isolated guest showed “Готовим библиотеку…” then “Собираем следующий шаг…” for roughly 30 seconds before L0. This is not a performance trace, but it is strong state-design evidence: long local/canon preparation needs context and recovery, not merely an emoji spinner.
- Frank Ruhl Libre 400 is preloaded by Room even when L0 does not use it. Font loading and selector coverage therefore need a measured budget in V3.

## Evidence boundary

This session proves current DOM, responsive layout, aggregate real-fixture stress and read-only production appearance. It does not prove physical touch ergonomics, screen-reader speech, actual 200% zoom, forced-colors behavior, reduced-motion runtime behavior, offline cold-start integrity, or owner acceptance of either proposed composition.
