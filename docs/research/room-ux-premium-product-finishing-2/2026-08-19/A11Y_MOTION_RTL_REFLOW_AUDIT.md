# Accessibility, motion, RTL and reflow audit

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; HEAD, local `origin/main` and live remote `main` match.
- Dirty state: 34 unrelated pre-existing entries preserved; only PPF2 research/planning documents added.
- Production/client: API, Studio, Room, SW and actual owner Chrome are `3.11.403`; `/healthz` green, DB/migrations ready, disk 64%, `disk_warn=false`.
- Evidence classes: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations: no physical-device or assistive-technology speech run. Lighthouse and browser automation are not physical-device, AT or owner-live evidence.
- Owner-data safety: actual owner tab remained read-only; no provider, content, list, progress, review, setting or cache mutation; `review_log 7420 -> 7420`.

## Current automated result

Current local bytes were served in an isolated browser after source/API integrity hashes matched. Mobile Lighthouse reported accessibility `96` on both Room and Studio. Passing audits are useful regression evidence, not a substitute for the failed-node review below.

| Surface/node | Light colors | Size/weight | Ratio | Requirement | Dark | Forced colors | Result |
|---|---|---:|---:|---:|---:|---:|---|
| Library `.learning-home-journey-types` | `#64748b` on `#f7f4f1` | 11.5px normal | `4.34:1` | `4.5:1` | `6.14:1` | `21:1` | fail light |
| Studio `.classic-next-step-label`, `#classicPhaseLabel` | `#64748b` on `#eff6ff` | 11px bold | `4.37:1` | `4.5:1` | not promoted separately | system override | fail light |
| Studio `.v3-onb-features-title` | `#94a3b8` on white | 12px normal | `2.56:1` | `4.5:1` | not promoted separately | system override | fail light |
| Studio footer credit/version | `#94a3b8` on `#f4f6f9` | 11–11.5px normal | `2.36:1` | `4.5:1` | not promoted separately | system override | fail light |

The Library candidate changes to the existing `--text-secondary` role, measured at `6.92:1` on the current warm background. Studio candidates must use the existing theme-aware `--theme-text-secondary`; a fixed light-mode literal would be incompatible with dark/auto.

## Focus, names, order and obscuration

- The actual owner tab retained `document.body` focus and scroll `0`. Baseline evidence was captured on My Texts; the final hidden-tab read reported `#room=hub` despite no research navigation/click call, so the session records that transition instead of manufacturing restoration evidence.
- Current B8 browser evidence remains green for keyboard/reflow/zero-write coverage at 320/380/200%; current Studio browser suite remains `92/92`.
- The promoted selectors are noninteractive supporting text. The proposed correction changes no role, name, value, order, hit target, focus ring, sticky region or overlay.
- Chrome Issues listed 31 Studio form-label findings and one unmatched `for`; the set mixes visible fields, hidden inputs, trigger-owned controls and legacy paths. A count is not a workflow deficit. `PPF2-06` remains `BACKLOG` until each reachable field has a named workflow and red contract.
- In isolated HE/RTL and EN, shared table note/edit/resize controls expose Russian titles/names. This is current localized-name debt (`PPF2-05`), but owner/AT harm was not demonstrated and its parity owner spans Reader and Studio; it remains `BACKLOG`.

## 380px, 200%, RTL and mixed direction

- Isolated 380px HE/RTL reproduced the shared-table names without horizontal document overflow or non-GET writes.
- The owner My Texts view contained 48 visible material rows, 19 Hebrew titles and 18 mixed-direction titles; max visible title length was 96 characters. It had no unnamed visible controls and no document overflow.
- Existing B8 gates cover 320/380/200% and RTL/reflow. No evidence justified reopening layout, typography, sticky or overlay ownership.
- The contrast slice does not alter box metrics; its green contract nevertheless reruns RU/HE at 380px and RU at 200% to detect unexpected reflow.

## Motion and color modes

- Reduced motion is not implicated: no promoted selector owns transitions or animation.
- Forced-colors output remained legible in the measured Library state; system colors overrode authored colors.
- Dark Library passed. Auto must be verified under both system schemes after implementation because it resolves through the same theme contract.
- No global color token should change. A global rewrite would create an unbounded contrast and hierarchy blast radius.

## Evidence boundary

`PHYSICAL_DEVICE=NOT_RUN` and `ASSISTIVE_TECHNOLOGY=NOT_RUN`. If implementation is approved, isolated keyboard and screen-reader-oriented semantic checks can establish automation evidence, but only an owner or explicitly performed device/AT run may close those evidence classes.
