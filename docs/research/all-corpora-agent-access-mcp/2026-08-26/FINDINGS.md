# Findings

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`, anonymous GET evidence only
Method: `CODE`, `LOCAL_TEST`, `PRODUCTION_ANONYMOUS`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`, `INFERENCE`

## Confirmed facts

1. LinguistPro already has a production-proven OAuth/consent/audit Agent Access perimeter and MCP thin adapter. It is reusable; its public corpus semantics are not generic.
2. Current MCP is tools-only and exact-version `2025-11-25`; the official current MCP era is `2026-07-28` and differs materially. A direct pin bump is unsafe.
3. Production exposes two immutable publication corpora: 77 Study Songs works and 74 Physics tasks. Browser-public does not equal agent-authorized.
4. Physics has the required machine identity: edition/item/work/snapshot plus resource revision/bytes/hash/MIME, and 74 explicit `AGENT_READ=YES` facts.
5. Study Songs has immutable text/audio publication data but only public read/stream/package rights. Official agent use remains unapproved and unmodeled.
6. Group and personal corpora already use separate membership/grant authority; merging them with public discovery would be an authorization regression.
7. The existing immutable HTTP asset path is better binary delivery than base64 in MCP. It preserves Range, cache, hash and client choice.
8. OCR can improve agent usability later, but it must remain a versioned derivative pinned to the source PDF, never canonical replacement.
9. Tools are the broad compatibility baseline; Resources are valuable additive identity/discovery for capable clients.
10. The current MCP smoke has a pre-existing v1/v2 `text_coverage` fixture drift. Implementation cannot start from a falsely green baseline.

## Unknowns requiring measured or owner evidence

- explicit Study Songs permissions for agent discovery, text model-context use and audio URL disclosure;
- actual demand: calls, repeated tasks, full-resource fetches and client mix;
- current host unit costs and CDN/egress allowance;
- current Hermes protocol-era behavior after future SDK v2 integration;
- OpenAI/Claude end-to-end handling of structured output and ResourceLink against this server;
- whether users need OCR beyond what agent-side PDF extraction can already do;
- Study Songs total asset bytes and real cache/egress profile;
- load ceiling of current host under authenticated MCP plus browser traffic.

## Assumptions used for planning

- first pilot is owner-only and read-only;
- direct public asset URLs remain available and immutable;
- no agent-side result writes, tutoring grades or learner telemetry are required;
- 10–50 tool calls per agent-active day and 20x burst are sensitivity ranges, not forecasts;
- SDK v2 dual-era support remains available at implementation time and will be re-verified;
- owner will either explicitly approve Study Songs agent-use classes or the pilot will run Physics-only as a compatibility fixture without pretending universal corpus coverage is complete.

## Recommendation

`GO` for a separately approved, staged implementation of **all published public corpora first**, with these hard conditions:

- fix and pass the existing MCP baseline before feature work;
- add new scopes/consent and domain-local agent-right facts; never widen old scopes;
- keep typed tools normative and Resources additive;
- return descriptors/bounded text only, never binary or OCR-inferred canonical content;
- maintain dual protocol eras and prove Hermes, OpenAI and Inspector compatibility;
- owner-only flags first, no private/group/personal expansion;
- fail closed on rights, edition, hash, cache epoch or restore uncertainty.

`NO_GO` if the goal is only “let one agent open one known PDF”; the existing immutable public URL already performs that job. MCP earns its cost only when users need typed discovery, provenance, cross-corpus identity, bounded retrieval and revocable official agent access.

## Long-horizon value

The durable value is not “AI reads PDFs.” It is a stable, rights-aware knowledge interface over every immutable publication. That enables agents to locate the correct edition, cite exact evidence, compare methods, request bounded source material and later consume reviewed OCR without screen scraping or confusing revisions. The same contract can serve multiple agent vendors without giving any one vendor the content writer or learner truth.

The long-horizon risks are equally structural: automated scraping, copyright/model-context leakage, prompt injection, provider retention, agent hallucinations over poor scans and a second derivative truth. The recommended design makes each of those a named permission, hash-pinned artifact, bounded call and reversible flag—not an implicit consequence of public web access.

```text
CODE=NONE
MIGRATION=NONE_EXECUTED
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
```
