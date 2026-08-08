# Studio Media Readiness Gate — next-session prompt

```text
Продолжи Studio Media Readiness Gate из текущего состояния. Не переоткрывай W1–W6, P0–P3,
Portable Package P2/P3/P4 или уже закрытый targeted full-delete fix v3.11.341.

READ FIRST целиком и по порядку:
1. CLAUDE.md
2. docs/PROJECT_ROLES.md
3. docs/planning/STUDIO_MEDIA_READINESS_GATE_DECISION_PACKET_2026_08_08.md
4. docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md
5. docs/planning/STUDIO_LONG_JOB_HONESTY_REAL_SERIES_ACCEPTANCE_PACKET_2026_08_07.md
6. docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_LESSONS_LEARNED_2026_08_07.md
7. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md

Сначала read-only recon: HEAD/origin, dirty worktree, served APP_VERSION, health/DB/migrations,
browser MIGRATIONS.length, Companion version/capabilities and presence/version of bundled
ffmpeg/ffprobe. Expected planning baseline: main/origin 91dce80b, production 3.11.341,
browser schema 48. Re-verify; do not treat this dated value as current truth. Preserve every
unrelated dirty owner file.

Authority gate: implementation may start only if the owner has granted the exact §19 sentence
from the decision packet (or supplied an explicit replacement with equivalent exact scope). The
message `Утверждаю. Стартуй.` authorised the docs-only packet, not implementation, push or deploy.
If implementation authority is absent, stop and quote §19 verbatim as the next action.

After authority: adversarial review first, then exact allowlist §15, red-before-fix §16, and only
then code. One bounded local implementation commit. No push/deploy or Companion installer
publication without a new separate owner instruction.

Core contract:
select media -> read-only readiness -> READY | LOSSLESS_REPAIR | TRANSCODE_REQUIRED | BLOCKED
-> explicit owner action for byte changes -> final canonical SHA -> ASR -> table -> binding ->
.lplp -> actual-file iPhone/Android play+seek proof after exact relink.

Empirical oracle:
- episodes 1–3: H.264 Main L3.2, yuv420p, 720p50, AAC -> READY;
- episode 4: H.264 Main L3.0, yuv420p, 480p25, AAC -> READY;
- original episode 5: H.264 Main L6.2, yuv420p, 720p50, AAC -> LOSSLESS_REPAIR;
- prepared episode 5: identical essence, declared L3.2 -> READY.

Never allow: automatic ASR/translation/conversion; cloud fallback; server FFmpeg; production
media upload; schema migration; batch/L2 queue; overwrite/delete/archive/rebind of existing owner
cards or packages; bulk retrofit; media bytes in .lplp; interpolated/neighbor/voted timing;
derived timing canon; provider-default change. `Только расшифровать` must remain explicit and
must record not_bound/playback-not-prepared rather than pretending to be a media material.

Every refusal names the next action. A 380 px Playwright run is not owner-iPhone or real-Android
acceptance. Separate automated PASS, production PASS and owner-device PASS.
```
