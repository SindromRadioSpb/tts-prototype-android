# Security, privacy and abuse threat model

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=OWASP/provider/W3C guidance; INFERENCE=controls/residual ratings.

| Threat | Prevention | Detection | Response | Audit/recovery | Residual |
|---|---|---|---|---|---|
| Spam/flood/duplicates | verified writer, per-IP/account/task budgets, bounded body/link count, duplicate search, slow mode | rate/duplicate aggregates, queue age | throttle, quarantine, temporary read-only | reasoned action; restore false positive | medium, adversarial paraphrase |
| Vandalism/mass edit/delete | append revisions, optimistic version, no bulk delete, least privilege | unusual mutation/concentration alerts | lock actor/task, revert pointer | immutable revisions/action log | low–medium |
| Account takeover/session fixation | rotate session, Secure/HttpOnly/SameSite, reauth sensitive actions, recovery notices | new-device/session/role-change events | revoke all, freeze privileged actions | session/audit replay; restore content projection | medium |
| CSRF | strict Origin/content-type + server CSRF token on all mutations | BAD_CSRF aggregate | reject 403, rotate suspected session | no side effect; security event | low with XSS caveat |
| IDOR/private/group bypass | principal-derived object scope, ReBAC every request, generic not-found, opaque IDs | authorization denial/consecutive enumeration | throttle, revoke, incident review | access-test matrix; restore visibility policy | medium |
| Privilege escalation/mod abuse | capability registry, no client role trust, two-person destructive actions, conflict rules | role delta and appeal-overturn sampling | revoke capability, quarantine effects | append role/action audit, independent appeal | medium |
| Unsafe link/open redirect | HTTPS/provider allowlist, canonical parser, visible hostname, direct link, no local redirect param | reports, health/denylist feed | quarantine resource, warning/takedown | URL revision/history; restore after review | medium; provider can change content |
| SSRF/tracking previews | no server fetch or rich preview in pilot; later egress allowlist/DNS rebinding controls | outbound network audit | disable checker, quarantine provider | retry only through isolated worker | low pilot |
| Malicious/oversized attachments | feature absent; future allowlist, size/decompressed cap, signature+MIME, AV/CDR, quarantine object | scanner failures, size/ratio alerts | reject/quarantine/delete after hold | object hash/inventory, restore clean version | high until future system; hence deferred |
| MIME confusion/decompression bombs | X-Content-Type-Options, forced download, generated name, no archive expansion request path | scanner/content mismatch | quarantine and invalidate cache | retained hash/action | medium if enabled |
| Stored XSS/Markdown/LaTeX | plain text pilot; later AST allowlist, no raw HTML, context encoding, CSP, safe math renderer | security tests/CSP reports | quarantine revision, patch renderer | immutable source + safe re-render | medium |
| Scraping/enumeration | anonymous pagination/cache, IP budgets, no private existence oracle, robots policy | traffic/cache miss/cardinality alerts | throttle/challenge only if accessible | content-free logs, tune budget | public data remains scrapeable |
| Notification amplification | no pilot notifications; explicit subscription, outbox unique key, recipient/event budgets, digest | fan-out/cost/error alerts | suppress event/channel, kill switch | intent/attempt ledger, replay bounded | medium later |
| Brigading/harassment/report abuse | unique-principal limits, no public reporter, no DMs, slow mode, anti-concentration | burst/correlation aggregates, overturn rate | freeze votes/reports, moderator review | preserve report evidence securely | medium–high |
| PII/accidental public post | private preview/default, concise warning, no contact fields, PII report path | moderator/optional local pattern warning, never external LLM | quarantine/redact, notify user | access-limited audit, cache purge | medium |
| Wrong task/edition | full immutable anchor, snapshot display before submit, no number-only lookup | orphan/mismatch validation | stop publish, quarantine mapping | anchor/equivalence events | low–medium human semantic error |
| Backup corruption/partial restore | Online Backup API, integrity/hash/read-back, forum/object inventory, scheduled restore drill | backup age/hash/count alarms | read-only, restore last verified, reconcile outbox/objects | drill receipt, RPO/RTO evidence | medium until drill |
| Orphaned storage | attachments absent; future DB/object state machine + grace GC | bidirectional inventory diff | quarantine orphan, never blind delete | tombstone/hash, recover within grace | low pilot |
| Edit/moderate/restore race | expected revision/state, BEGIN IMMEDIATE bounded transaction, idempotency, action sequence | conflict/error metrics, invariant checks | 409/retry, freeze aggregate if invariant fails | replay events/rebuild projection | low–medium |
| Copyright/takedown abuse | rights declaration per resource/body, no corpus attestation inheritance, counter-review | takedown queue and repeated claimant signals | quarantine, preserve evidence, appeal | exact revision/right/action record | medium/legal |
| Minor contact/grooming | no DMs, public contact fields, voice/photo/location attachments; community writes gated by age policy | reports and moderator safety queue | immediate quarantine/ban/escalation policy | restricted audit and legal response | high if open writes; NO_GO |

## Security invariants

1. Anonymous read endpoint never creates account/learner/forum state.
2. Every mutation derives author and scope from validated session.
3. Knowing an ID never grants access.
4. Publication pointer, group membership, review_log and forum writers are isolated.
5. Slow provider/network work never runs inside canonical DB transaction.
6. Audit failure cannot silently permit a privileged action; unlike current best-effort general audit, moderation/role action audit must be transactionally required.
7. Cache invalidation on quarantine/withdrawal is part of canonical outcome, or visibility fails closed.
8. No body, external URL query token, email, chat ID or report narrative in operational telemetry.

## Red-test threat fixtures

- two principals, every object/read/write pair, including guessed IDs and revoked group membership;
- missing/wrong CSRF, Origin, content type and session-kind cross-use;
- stale revision, duplicate idempotency key with different body, concurrent quarantine/edit;
- wrong edition/work/snapshot/subpart combinations;
- javascript/data/file URL, Unicode hostname, credentials, fragments, redirect chains and private-IP checker targets;
- Markdown HTML/script/event handlers, malicious links and math payloads;
- notification same event twice, 10k subscribers and revoked consent after select;
- report brigade, moderator self-conflict, two-person redaction requirement;
- backup corruption, missing object, partial DB restore and outbox replay;
- delete/export across every new user_id table with independently enumerated residue check.

## Residual-risk decision

Owner-only typed links + anonymous reads reduce but do not eliminate phishing/link rot. This is acceptable only with visible destination, no preview/fetch and rapid owner quarantine. Public writes, native rendering, notifications and attachments each add distinct high-risk surfaces and remain independently gated.
