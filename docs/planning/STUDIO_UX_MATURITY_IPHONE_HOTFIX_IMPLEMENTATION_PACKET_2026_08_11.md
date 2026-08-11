# Studio UX Maturity — iPhone owner-live hotfix

Date: 2026-08-11  
Predecessor: `STUDIO_UX_MATURITY_DECISION_PACKET_2026_08_11.md`, approved option B  
Source production before the slice: `3.11.345` / `952428f5`

## Owner-live evidence

The owner passed B1 on desktop and iPhone and reported two iPhone defects:

1. Add Material showed the loopback Local Companion token flow for selected video while hiding the only usable mobile provider, Gemini.
2. A portable media material retained its original player in Reading Room, but lost per-row original-media replay and bidirectional row/player synchronization. The same material kept exact replay in Studio.

The supplied `.lplp.zip` and matching `.mp4` were inspected read-only. The package contains 545 corrected media segments and 544 learning rows with an explicit 544-row Studio binding. This proves why the Room's honest positional fallback refused a guessed 545→544 alignment and why the existing exact binding is the required authority.

## Bounded fix

- On iPhone/iPad/Android, the provider surface is visible and fixed to Gemini; Local Companion and its `127.0.0.1` pairing UI are not offered.
- Selected mobile video bytes must pass actual play and two seek checks on that device and receive an exact SHA-256 before Gemini ASR becomes available. The receipt says only what Safari can prove; it does not claim a cross-device codec contract or fabricate audio-track telemetry.
- Reading Room opens the existing canonical `studio_text_media_bindings` relation and prefers its exact revision mapping over derived timing. It remains read-only and creates no second package/library source of truth.

## Preserved contracts

- Desktop Local/Gemini choice and Companion media-preflight remain unchanged.
- No provider fallback is automatic.
- OPFS media identity, package revisions, row mappings, save semantics and Reading Room table canon are unchanged.
- A missing/invalid exact binding falls back to the previous honest saved-passport behavior; no interpolation is introduced.

## Allowlist

- `public/index.html`
- `public/sw.js`
- `public/library.html`
- `public/js/library-ui.js`
- `public/js/media-readiness.js`
- `public/js/studio-import.js`
- `public/i18n/locales/{ru,en,he}.js`
- `tests/mediaReadiness.test.js`
- `tests/studioUxMaturity.test.js`
- `tests/i18n.locale-version.lock.json`
- `scripts/premium/room-media-smoke.js`
- `scripts/premium/studio-ux-maturity-browser-smoke.js`
- this packet

## Gates

- Unit/static regression: mobile Gemini-only policy; device-ready SHA receipt; Room exact-binding load/activation.
- Browser Studio: desktop RU plus iPhone-UA 380px RU/HE, including visible Gemini and absent Companion.
- Browser Room: existing media matrix plus an explicit 3-cue/2-row fixture whose two replay buttons can only come from the exact binding.
- Full i18n, syntax and release/version gates before production.

Automation is engineering evidence, not owner-live iPhone PASS. The post-deploy owner check remains: select the matching video on iPhone, verify on-device playback, run Gemini ASR, then reopen the imported material in Reading Room and check row replay and synchronization.
