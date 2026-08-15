# Screenshot evidence index

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree as recorded in the parent README.  
> Production: `https://linguistpro.kolosei.com/library.html#room=benyehuda`, served `3.11.388`  
> Evidence class: `OWNER_LIVE_READ_ONLY`  
> Limitations: Chrome/Kapture desktop capture, not a physical-device or AT run; owner content was neither opened nor changed.

| File | What it proves | What it does not prove |
|---|---|---|
| `prod-owner-readonly-desktop-header.png` | Current 1920 px header, emoji-only global affordances, three-tab hierarchy, and full-viewport due CTA width | keyboard, mobile, zoom, AT or motion behavior |
| `prod-owner-readonly-desktop-ben-middle.png` | Current Ben-Yehuda real rows, text density, Learning Compass/status chips, 1120 px content measure and surrounding whitespace | corpus completeness or owner approval of a future direction |

The screenshots were captured through the already-authorized Kapture tab. No navigation, row opening, audio, filter, disclosure, presentation-key, progress, list, bookmark, note, review, cache or provider action was performed.

## VF0 isolated local implementation captures

> Local served version: `3.11.389`  
> Evidence class: `ISOLATED_AUTOMATION`  
> Capture engine: Playwright Chromium, fresh non-owner browser contexts  
> Limitations: automation, not a physical device, assistive technology, owner-live acceptance or actual browser-UI 200% zoom.

| File | View | Result |
|---|---|---|
| `vf0-local-380-ru.png` | 380×844 RU/LTR | no horizontal page overflow; real baked Ben-Yehuda fixture rendered; foundation linked before legacy CSS |
| `vf0-local-380-he-rtl.png` | 380×844 HE/RTL | no horizontal page overflow; logical shell and content alignment retained |
| `vf0-local-desktop-ru.png` | 1440×900 RU/LTR | Learning Home composition retained; release `3.11.389` |
| `vf0-local-desktop-en.png` | 1440×900 EN/LTR | localized desktop hierarchy retained; no horizontal overflow |
| `vf0-local-desktop-he-rtl.png` | 1440×900 HE/RTL | RTL desktop composition retained; no horizontal overflow |

The screenshots intentionally still show legacy emoji because VF0 only makes the bounded SVG system available. Live icon adoption starts in VF1 after the VF0 release gate.
