# RMA-M0 start evidence

> **Date:** 2026-08-11
> **Classification:** engineering/lab evidence; **not** production, beta, owner-device or M0
> acceptance evidence
> **Source baseline:** `01766df52375abaf19cdaab5c1e11b19b3b62dbc`
> **Tool:** `media-acquisition/lab/egress_probe.py`
> **Review target:** this report and `media-acquisition/lab/README.md`; `.tmp/` runtime files are
> disposable and must not be reviewed as durable evidence

## What was implemented

A lab-only content-free M0 harness now:

- reads source fixtures, raw egress address/proxy credentials and report salt from environment;
- compares named `direct_ipv4`, sticky `ipv6_prefix` and explicitly AUP-approved
  `managed_proxy` routes;
- reuses the real fixed `YtDlpBackend` and deterministic format planner;
- checks the same egress before/after resolve and after prepare;
- deletes prepared bytes with the temporary job directory;
- emits no URL, video ID/title, raw IP, proxy coordinate or provider exception text;
- evaluates a balanced 20-resolve/10-prepare campaign only after a full 24-hour span.

Red-before-fix evidence:

```text
python -m unittest media-acquisition/tests/test_m0_egress_probe.py -v
RED: FileNotFoundError, media-acquisition/lab/egress_probe.py absent
GREEN: 6 tests, OK
```

## Local diagnostic baseline — not the isolated-node gate

The current Windows host has a public Israeli IPv6 address, so it was used only to validate the
reporting boundary and establish a comparison point. The raw address and source identities were
not persisted.

| Fixture class | Phase | Result | Continuity | Latency |
|---|---|---|---|---:|
| control | resolve | PASS | same salted fingerprint | 3729 ms |
| owner | resolve | PASS | same salted fingerprint | 3569 ms |
| control | prepare | FAIL `NO_COMPLETE_VIDEO_OPTION` | same salted fingerprint | 4713 ms |

The two resolves prove neither an isolated route nor 24-hour reliability. The prepare failure was
captured rather than hidden or retried away. This local environment does not contain the complete
frozen container runtime and therefore cannot close M0.

Source commands used the locked environment and the two environment-only fixtures:

```text
python media-acquisition/lab/egress_probe.py sample --route ipv6_prefix --fixture control --phase resolve
python media-acquisition/lab/egress_probe.py sample --route ipv6_prefix --fixture owner --phase resolve
python media-acquisition/lab/egress_probe.py sample --route ipv6_prefix --fixture control --phase prepare --temp-root .tmp
```

## Open gates

1. Provision or identify a dedicated disposable node with a genuinely routed IPv6 prefix; the main
   application host and the home PC are forbidden substitutes.
2. Build/read back the exact worker image and SBOM on that node.
3. Resolve the transitive AGPL/source-offer decision before adding WPC/`nodriver` to any image.
4. If a managed Israel trial is desired, record the approved provider/AUP and spend/GB ceiling
   before credentials or procurement.
5. Run the full 24-hour campaign, preserve only its content-free JSONL/verdict, and require a clean
   20/20 resolve plus 10/10 prepare result before RMA-M1 or any production routing decision.
