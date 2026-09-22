# Mediatheque design refinement — 2026-09-22

Baseline: production 3.11.612, commit 2c508350. Scope: approved visual/interaction refinement of the existing Mediatheque, without corpus, editorial-structure or learner-data mutations.

## Delivered design

- Compact heading and shared space/search row. At desktop size the first catalogue card starts above 480px, approximately 240px earlier than the baseline screenshot.
- Published channels and collections with available lessons precede empty entries in reader views. Empty topics/series remain visible in a compact labelled group. This is presentation order; stored editorial order is unchanged.
- Channels use a horizontal media preview; series use a cover strip; empty series have no oversized cover placeholder. Original YouTube URLs use a readable external-source link.
- Channel pages show episodes before the series overview. Secondary editorial templates/research/history live in a disclosure; the draft preview action is not duplicated.
- Four explicit publication steps. Upload controls follow the chosen YouTube/media mode. Collection options follow the channel; incompatible selection clears when switching channels. Optional new channel/series fields are disclosed separately and disable conflicting existing selectors.

## Verification

- 49 targeted Mediatheque/domain/shell tests; 233 i18n checks.
- `layout/evidence.json`: 45 isolated UI checks using public catalogue metadata, RU/EN/HE at 380/820/1366, dark mode, keyboard focus and mobile editor disclosure. Metadata/auth responses are fixtures here, not production authorization evidence. Screenshots reviewed and captured with animations finished.
- `publisher/evidence.json`: 42 checks through the actual isolated publication server, ZIP/YouTube and MP4, channel-dependent destinations, canonical publication, independent download permission, guest access, Room playback and HTTP byte ranges.
- `regression/evidence.json`: 99 checks including personal organization, exact learner-log preservation in fixtures, reader return, conflicts, offline/SW lifecycle and a 5000-item catalogue.

Reproduce with `node scripts/premium/mediatheque-design-smoke.cjs`; publication and broad regression use the existing `mediatheque-publisher-smoke.cjs` / `mediatheque-browser-smoke.cjs` with `MEDIATHEQUE_EVIDENCE_DIR` pointing to separate output directories. All use temporary local databases/profiles. No physical-device or assistive-technology acceptance is claimed.

Production and owner-tab verification follows deployment; no source archive is republished by this design pass.
