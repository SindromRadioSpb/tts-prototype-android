# Mediatheque design refinement

Baseline: main 2c508350 / production 3.11.612. User approved the next design pass and existing release authorization remains in scope. No content publication or learner-state edits are required.

## Design decision

Keep LinguistPro's palette: background #f6f8fc, paper #ffffff, ink #162438, muted #536479, rule #dce3ee, action #2358a8. Keep system/Segoe UI typography for Russian and Hebrew continuity; reduce the page title to 28–32px, section titles 20px, controls 14–16px. Align copy to reading direction, never force Hebrew into left alignment.

The catalogue is a working media library: the real episode cover is its visual anchor. Spend space on content, with a compact identity/header and a shared discovery row. Available channels/series come first in reader views; editorial order remains unchanged in organization mode. Empty published structures remain visible as compact entries with an honest status.

```
Brand / Room / Studio                  language
Mediatheque                 edit / add material
Public | My materials       search field
Home / All / Topics / Collections
topic rail | episodes and compact controls
```

Avoid a marketing hero, decorative channel logos, and equally large empty cover boxes. Separate channel identity from series cover strips. Publisher: four visible steps, show only the chosen media mode, narrow collections by channel, collapse optional creation fields while keeping keyboard access.

## Gates

- [x] Verify clean checkout and start from current origin/main.
- [x] Compact layout, available-first browsing and honest compact empty cards.
- [x] Publisher field dependencies and editor tool hierarchy.
- [x] Isolated browser flows, RU/EN/HE at 380/820/1366px, screenshots, focus/dark mode, relevant regression and release contracts.
- [x] Scoped commit/push, production 3.11.613 / eb4e5670 deployed and verified; owner tab updated and checked without uploading or publishing content.

Automated, production, owner browser and physical-device evidence remain separate. No physical-device or assistive-technology claim.

Validation: 49/49 targeted unit/shell, 233/233 i18n, 99/99 broad browser regression, 42/42 publisher flow including channel-dependent collection selection. Responsive layout screenshots reviewed; final mobile editor disclosure and keyboard checks included in the layout rerun.

Production: 16 asset hashes match committed bytes, three repeated health/config checks, catalogue JSON exactly unchanged, 14 live guest browser checks. Owner tab confirms ready-first channels, grouped collections and four-step source form; upload cancelled and editor exited. Final layout gate: 45/45.
