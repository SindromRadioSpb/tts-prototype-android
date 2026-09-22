# Public Mediatheque card surfaces — 2026-09-22

Baseline: production 3.11.613 / eb4e5670. Owner supplied two marked screenshots and requested distinct tiles and a common right edge for Hebrew, Russian and English copy. Existing authorization covers release.

## Design

Retain Segoe UI/system typography and the LinguistPro palette: background #f6f8fc, paper #ffffff, ink #162438, muted #536479, blue #2358a8, card border #d4deec. Use 14px tile corners, 16–20px insets, a restrained cool tint for awaiting channels/series and a two-layer shadow. Available channels retain their actual preview and blue edge. All copy inside public topic/collection tiles aligns to the physical right edge, while existing `dir=auto` preserves each title's natural reading order. Navigation and page layout keep the selected locale direction.

The owner's explicit request supersedes the earlier compact border-only empty entries. Entire cards now have an enclosing surface; no new empty artwork or animated movement. Source links and editor controls remain separate actionable elements.

## Verification

- PASS: 63 isolated browser checks using public metadata as a fixture; RU/EN/HE at 380/820/1366px, ready/empty cards, right alignment, borders/shadows, no overflow, keyboard focus, dark mode and existing publisher UI checks.
- PASS: 17 shell/module/integrity contract checks.
- Reviewed topic and collection screenshots in desktop/mobile/light/dark. Both external artwork and text fallback remain readable.
- CSS-only product change; no catalogue, publication, archive or learner-state writes.
- Release 3.11.614, CSS v7. Production verified: 16 served asset hashes match the committed release, three coherent health/version probes, public catalogue byte-equivalent as parsed JSON to the pre-redesign baseline. Active image b8fbf285ad2f / commit 09b17516.

Reproduce: set `MEDIATHEQUE_DESIGN_OUT=docs/research/mediatheque-card-surfaces/2026-09-22/layout` and run `node scripts/premium/mediatheque-design-smoke.cjs`.

## Owner-authorized production cleanup

Owner requested safe cleanup during release verification. Root disk was 100% full. Removed unused BuildKit cache (Docker reported 6.701 GB) and five exact LinguistPro image IDs after checking every container image reference: 989cfff9eb45, 1aa9051b64d5, 07a53fb95934, b8a4c6c7fc66, 735da9abc300. Image removal used no force.

Retained active b8fbf285ad2f (3.11.614), rollback f9340d02df41 (3.11.613) and 8a850c17857d (3.11.612). Final root usage: 72%, 11 GiB available; cache 0 B. All 12 post-deployment containers and all four volumes retained; no container/volume/backup/database/user-data deletion commands were issued. The rolling deployment itself removed its old application container and transient build helper. Health: ok, DB ready, migrations ready, disk_warn=false.
`Owner-live`: existing Chrome tab updated to CSS v7. Verified 11 topic surfaces and 22 collections, all card copy right-aligned; reviewed actual rendered cards. Only update/navigation/scroll actions, no study or content edits.
