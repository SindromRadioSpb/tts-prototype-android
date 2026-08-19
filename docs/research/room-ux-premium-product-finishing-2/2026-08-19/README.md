# ROOM-UX-PPF2-R research index

Date: `2026-08-19`
Mode: `RESEARCH_THEN_EXPLICIT_OWNER_GATE`
Status: `CLOSED_OWNER_ACCEPTED_PRODUCTION_3.11.404`

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PROTOCOL_PASS`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Source: `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`.
- Relationship: `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty state: 34 unrelated pre-existing entries were preserved; this research adds only this directory and the decision packet.
- Production/client: API, Studio, Room, SW and actual owner Chrome are `3.11.403`; `/healthz` is green, DB/migrations ready, disk 64%, `disk_warn=false`.
- Evidence classes: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations: no physical-device or assistive-technology speech run; automation is not owner-live, physical-device or AT evidence.
- Owner-data safety: no research call navigated, clicked, focused, invoked a provider, or wrote owner data/settings/caches. The baseline My Texts state was inspected in place; a final read-only call found the hidden tab at `#room=hub`, without any intervening research navigation, so it was not forcibly restored. Focus/scroll remained body/zero and `review_log` remained `7420 -> 7420`.

## Result

Recommendation: `ACCESSIBILITY_NECESSITY_ONLY`.

One current, measurable family crosses the gate: insufficient light-mode contrast for secondary informational text in Library/L0 and Studio. The exact observed ratios are `4.34:1`, `4.37:1`, `2.56:1` and `2.36:1`, below WCAG AA `4.5:1` for normal text. The smallest coherent correction is selector-local color reassignment to existing semantic secondary-text roles; it is not a palette, theme or design-system rewrite.

## Closure

The approved `PPF2-01..04` contrast slice shipped as production `3.11.404` and received explicit owner acceptance:

```text
ACCEPT ROOM-UX-PPF2-01:
PRODUCTION_3.11.404_OWNER_CLIENT_PASS;
```

`PPF2-05` and `PPF2-06` remain backlog. No next slice, design-system rewrite or renewed Visual Finishing campaign is authorized by this closure.

The shared table's Russian note/edit/resize names under EN/HE are real current copy debt, but no AT/owner-live harm was established and the behavior spans the Reader/Studio parity builder plus locale/SW compatibility. It remains explicit `BACKLOG`, not hidden implementation scope.

## Files

- `CLOSED_BASELINE_AND_CURRENT_RECON.md` — closed predecessor and current code/production baseline.
- `SURFACE_WORKFLOW_COMPONENT_STATE_INVENTORY.md` — exact workflow matrix and 20-field candidate ledger.
- `LIVE_OWNER_CLIENT_EVIDENCE.md` — actual owner Chrome read-only evidence.
- `PREMIUM_COMPOSITION_AND_COPY_AUDIT.md` — composition, hierarchy and copy conclusions.
- `A11Y_MOTION_RTL_REFLOW_AUDIT.md` — Lighthouse, contrast, focus, RTL/reflow and evidence limits.
- `CSS_AND_COMPONENT_OWNERSHIP_RECHECK.md` — exact behavior/CSS owners and specificity boundary.
- `OPTIONS_AND_ROLE_SYNTHESIS.md` — A-E comparison and R4-R17 synthesis.
- `VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md` — prospective red/green, release, owner-client and rollback loop.
- `FINDINGS.md` — final research recommendation and gate.
- `IMPLEMENTATION_EVIDENCE.md` — approved local implementation, red/green evidence and remaining release-lock allowlist blocker.
- `screenshots/README.md` — isolated implementation screenshot provenance and visual inspection.
- [`ROOM_UX_PREMIUM_PRODUCT_FINISHING_2_DECISION_PACKET_2026_08_19.md`](../../../planning/ROOM_UX_PREMIUM_PRODUCT_FINISHING_2_DECISION_PACKET_2026_08_19.md) — P1-P8 owner decision packet.

No screenshots were captured during research. After approval, isolated implementation screenshots were captured and inspected under `screenshots/`; they are not production, owner-live, physical-device or AT evidence.
