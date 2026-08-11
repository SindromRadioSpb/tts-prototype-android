# Room Training premium release evidence

Date: 2026-08-11

Release version: `3.11.354`. Runtime release commit/image: `f47de45c9c0516c273e51507e0d3b063cb289e5c`; production evidence and owner-live boundary are recorded in the implementation packet.

## Scope

This evidence set covers the approved hardening of the one canonical Reading Room training loop. The full Russian sentence translation and full-sentence audio remain pre-answer scaffolds by owner decision. The slice changes persistence integrity, evidence classification, source continuity, same-session reinforcement, and mobile/accessibility quality; it does not change FSRS-6 mathematics.

## Deterministic evidence

- `npm run smoke:grade-policy` verifies task-mode evidence scopes and D1 grading behavior.
- `npm run smoke:room-training-premium` protects 21 architectural and UI contracts.
- `npm run smoke:studio-room-srs` passes 49 isolated OPFS/browser assertions for three sources, zero-write open/close, exactly-one grade, replay parity, transaction rollback, bounded reinforcement, responsive layout, RTL, focus, and tap targets.

## Screenshot index

| File | Viewport / locale | Evidence |
|---|---|---|
| `screenshots/room-training-desktop-ru.png` | 1280×900 RU | canonical review dialog, translation/audio scaffold, one focused training task |
| `screenshots/room-training-380-ru.png` | 380×844 RU | mobile fit, 44px controls, no horizontal overflow |
| `screenshots/room-training-380-he-rtl.png` | 380×844 HE/RTL | mirrored layout, localized dialog, no horizontal overflow |

The browser fixture contains one due word each from Ben-Yehuda, Study Songs, and My Texts. It uses stable source metadata and text keys, not title matching. No owner data is written.
