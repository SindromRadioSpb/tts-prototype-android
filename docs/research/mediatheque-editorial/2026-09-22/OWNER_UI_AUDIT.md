# Mediatheque owner UI audit — 2026-09-22

Baseline: production 3.11.611, source c65fcd34. User authorized the open owner tab, sample archive publication, exclusion of three text corpora, and fixes to the public navigation.

## Reproduced and corrected

- Sidebar listed 11 published topics while topic/collection screens hid every empty entity. Published scaffolding now stays browsable, with zero counts and an explicit unpublished-episodes state. Unpublished editorial drafts remain private.
- Public catalogue admitted all readable corpus items. Mediatheque now admits audio/video metadata only; public corpus endpoints and publication permissions are unchanged. This excludes 60 materials-science exercises, 74 physics exercises and 77 study songs without withdrawing their Room editions.
- Empty sections previously claimed a failed search and suggested resetting filters even with no filters. They now explain that episodes have not been published; the owner can add a material directly.
- Attached publication media MIME is projected alongside existing YouTube and source-media metadata, preserving both supported publication paths.

- Rapid Reader back navigation raced with late assignment of the Mediatheque return route. The return destination is now passed through the reader open options and established before the reader becomes visible, for both personal and public entries.

## Actual owner browser

Connected to the existing Mediatheque Chrome tab through Kapture and CUA. Reproduced Topics and Collections failures. Selected the user's ZIP using the native browser file-chooser API, entered the supplied YouTube URL, checked the 270-row result and automatic C14 / תוכנית חומש destination, and completed both explicit publication previews. Public structure revision became 5; the episode card reports 24:14. No video file was uploaded.

Archive: `linguistpro-learning-Пятилетний-план-1-e9f44bcb36f8-archive.lplp.zip`; SHA-256 `2479d512623b793c242922b253a1f71976a6cdc1dddb4815b1c7a49d807e5c14`.

Opened Edit showcase → Configure home, saved the existing settings and exited edit mode. This produces draft revision 6 with the same structure as the published edition. No study/review actions were performed in the owner profile; no physical-device or assistive-technology acceptance is claimed.

## Automated evidence

- 110 targeted unit/domain/media/shell checks: initial run 109 passed, release-pin assertion corrected; affected 7-check suite then passed.
- i18n: 233 passed.
- `owner-audit-browser/evidence.json`: 39 passed, including guest empty-topic/collection visibility, explicit empty state, archive publication, authenticated upload protection, MP4 Room playback and HTTP ranges. RU/EN/HE at 380/820/1366 px; screenshots reviewed for RTL mobile and collection layout.
- First added empty-state assertion used Russian text while retaining Hebrew UI from the preceding locale check. Runner now explicitly selects Russian before that assertion; the final rerun passed.

Additional return-path/shell regression: 41/41 passed. The first broad browser run exposed the rapid-back race described above; the corrected rerun passed 99/99, including exact return position/focus, offline/SW lifecycle and 5000-item library. The unpublished-episodes label is limited to public collections.

Deployment and final live verification are recorded after the release gate.
