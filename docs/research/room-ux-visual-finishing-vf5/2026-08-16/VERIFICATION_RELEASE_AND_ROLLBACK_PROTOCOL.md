# Verification, release and rollback protocol

Artifact date: `2026-08-16`

## Evidence passport

- Source/branch: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`; local/remote match.
- Dirty: 34 unrelated entries preserved; VF5 docs only.
- Production/client: API/Studio/Room/SW/owner client `3.11.399`; no update.
- URLs: `https://linguistpro.kolosei.com/library.html`, `https://linguistpro.kolosei.com/index.html`.
- Health: application/DB/migrations ready; disk 86% warning.
- Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`.
- Limitations/safety: no physical/AT, owner write, provider, cache/update/cleanup or runtime/release action.

## Research verification performed

| Gate | Result |
|---|---:|
| VF0–VF4/current visual contracts | PASS `42/42` |
| RU/EN/HE i18n/version/bidi | PASS `233/233` |
| Reader builder/golden parity | PASS |
| row-audio current contract | PASS unit `3/3`, browser `18/18` |
| Studio UX maturity | PASS unit `9/9`, browser `92/92` |
| Room B6 scale/resilience | PASS unit `26/26`, browser `45/45` |
| Room B8 journey/reflow/write guard | PASS unit `30/30`, browser PASS; zero review/RUM writes |
| served-byte cohort | PASS for inspected visual/runtime assets |
| actual owner client | current, no update, no overflow/audio; markers named |
| isolated production | 380 RU/HE, forced/reduced, Ben cold-load and Studio shell green; zero non-GET/page errors |

## NO-GO implementation matrix

Because `F1=NO_GO_KEEP_PROGRAM_CLOSED`, there is no recommended candidate, runtime allowlist, failing red test, green implementation, deployment or rollback release.

| Future implementation row | Status |
|---|---|
| exact failing red contract | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| exact green contract | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| desktop RU/EN/HE | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| 380×844 RU and HE/RTL | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| actual owner-browser 200% | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| mixed long titles | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| keyboard/focus/sticky/overlay | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| screen-reader/AT row | `NOT_APPLICABLE_NO_RUNTIME_SLICE`; remains unclaimed evidence |
| light/dark/auto/system | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| forced colors/non-color/reduced motion | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| loading/empty/partial/offline/reconnect/stale/error | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| Reader/Morph/Trainer/Mentor/Studio shared reach | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| no writes/providers/network | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| old HTML/new SW; new HTML/old SW | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| sprite/CSS/JS/locale failure fallback | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| APP/Room/SW/API/locale lock | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |
| static/data rollback | `NOT_APPLICABLE_NO_RUNTIME_SLICE` |

## Future regression re-entry protocol

Re-enter only when all are available:

1. current source and current served production reproduction;
2. named real workflow and user-visible or accessibility-relevant harm;
3. evidence that it is not accepted backlog;
4. one canonical behavior/truth owner;
5. smallest surface/component family and exact runtime/test allowlist;
6. exact failing red assertion and measurable green result;
7. RU/EN/HE, RTL, 380/reflow, focus, non-color, forced/reduced and relevant state rows;
8. old/new HTML/SW/failure compatibility;
9. static rollback and no data rollback;
10. explicit new owner approval.

Any later approved implementation must use the mandated serialized gates→commit/push→production convergence→agent-applied update→updated owner-client smoke loop. This document does not authorize that loop today.

The quota finding requires a separately named persistence/storage recon. No localStorage key inspection/deletion, cache cleanup or migration is authorized by VF5. Disk warning likewise authorizes no cleanup.
