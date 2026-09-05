# Reliability release evidence

Source baseline: `1500f19ee8985546cdcd96fdad39737822ba26e3`; target 3.11.482.
Details and limitations: `docs/planning/REPOSITORY_RELIABILITY_AUDIT_2026_09_06.md`.

`room-audio-indicator-he-380.png` was produced by
`ROOM_AUDIO_BASE=<disposable-loopback-server> ROOM_AUDIO_SHOT_DIR=<this-directory> node scripts/premium/room-audio-indicator-smoke.js --locale=he`.
Gate: 19/19. Fresh Chromium context, Hebrew RTL, 380px, synthetic local rows and mocked audio.
Final capture exercises forced colors/non-color state. Visually inspected; no owner browser/profile used.

Reproducible repository checks: `npm ci`, `npm test` (1334/1334),
`npm run test:api-smoke`, `npm run smoke:ingest` (22/22),
`npm run smoke:learner-ingest` (24/24), `npm run smoke:fsrs` (140/140),
`npm run smoke:memory-canon` (89/89), `npm audit` (0 vulnerabilities).
Use Node 22, Python 3.12+ and `npx playwright install chromium`.
The scripts use disposable storage; these commands do not constitute production owner acceptance.
