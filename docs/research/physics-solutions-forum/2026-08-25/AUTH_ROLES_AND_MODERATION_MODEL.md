# Authentication, roles and moderation model

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=role/moderation recommendation.

## Current identity verdict

Current code has sound primitives: hashed opaque sessions, CSRF token, session revoke, append-only consent, audit, export/delete, short scoped Mini App sessions and auth-context revocation. It does not have a public account registration/verification/recovery lifecycle. Owner bootstrap and one-time group invites create OWNER/MEMBER only. Therefore:

- anonymous public read is compatible;
- owner-only pilot writes are compatible after an approved additive domain;
- public/community writes are incompatible until a separate identity/onboarding decision and red-test suite;
- Telegram pairing and group membership are not substitutes for account identity.

## Onboarding phases

| Phase | Read | Write | Identity |
|---|---|---|---|
| Pilot | anonymous approved resources; owner private view | owner-curated metadata only | existing owner session, same-origin + CSRF |
| Private contributor pilot | invited verified adults/known participants | suggest resource/native draft | new explicit invitation principal; recovery/export/delete green |
| Bounded community | anonymous approved read | verified accounts; new-account quotas | email magic link or passkey-capable account, recovery, pseudonymous public profile |
| Wider community | same | earned capabilities, never automatic official status | risk-based verification/abuse controls; age/jurisdiction policy |

Accessible authentication must allow password managers/paste or use email link/WebAuthn; no puzzle-only path.

## Capability registry

Roles are human labels; authorization is a deny-by-default capability check plus object relationship/visibility on every request.

| Capability | Learner | Contributor | Reviewer | Moderator | Corpus editor | Owner |
|---|---:|---:|---:|---:|---:|---:|
| read public approved | anon | yes | yes | yes | yes | yes |
| create private draft/suggestion | after identity | yes | yes | yes | yes | yes |
| publish own external resource | no initially | submit only | no | no | no | yes in pilot |
| review exact revision | no | no own | yes, conflict-free | no by role | optional if separately granted | override audited |
| mark helpful | verified | yes | yes | yes | yes | yes |
| report | verified | yes | yes | yes | yes | yes |
| quarantine/lock | no | no | no | yes, not own conflict | no | yes |
| redact permanently | no | no | no | two-person | no | owner + second reviewer |
| map edition equivalence | no | no | advisory | no | yes | yes |
| mark official corpus relation | no | no | recommend only | no | yes | yes |
| grant/revoke roles | no | no | no | no | no | owner |

Group visibility adds ReBAC: principal must have ACTIVE membership in the exact group at action time. It does not add content or staff capability.

## Session and consent contract

- Session cookie Secure, HttpOnly, SameSite; rotate on login/recovery/privilege change.
- CSRF and strict Origin on every mutation; JSON content type; no GET side effects.
- Author principal is server-derived, never request body.
- Recent reauthentication for role grants, permanent redaction, export and account delete.
- Consent keys are purpose-specific: public_profile, community_notifications_email, community_notifications_telegram. Existing telegram_delivery consent is not silently broadened.
- Revoke stops future deliveries/writes immediately; it cannot recall prior public copies or provider messages, which UI must state.
- Pseudonym is public; verified email/phone stays private. No public contact link by default.

## Moderation lifecycle

Report → dedup/triage → no-action, warning, slow-mode, temporary hide, quarantine or lock → notify target/reporter where safe → appeal → independent review → restore or final reasoned action.

Rules:

- safety-critical quarantine may be immediate and single-moderator;
- mass action, permanent redaction, role elevation or ban beyond a bounded period requires two-person approval;
- moderator does not rewrite physics content; author revision or reviewer verdict corrects it;
- moderator may act on own safety conflict only to quarantine, then must transfer adjudication;
- reporter identity is not exposed to the reported user;
- every action has policy code, actor, target revision, timestamp, previous/new state and appeal reference;
- bodies and PII do not enter ordinary operational logs.

## Trust and reputation

Do not implement a single reputation score. Signals remain typed:

- contribution count with no authority;
- reviewer appointment and declared expertise;
- useful marks with unique-principal/rate/brigade controls;
- upheld/overturned moderation history visible only to governance;
- official corpus relation assigned only by corpus editor/owner.

Automatic promotion to reviewer/moderator/official is NO_GO. A high-volume user gets stricter concentration monitoring, not interface dominance.

## Spam, vandalism and conflict controls

- per-IP anonymous read budget; per-account create/edit/report/mention budgets;
- account-age and verified-contact gates for links, mentions and public posts;
- duplicate fingerprint + task-local search before publish;
- edit window then revision; no mass overwrite/delete;
- slow mode and temporary read-only state for hot task;
- explicit reviewer conflict-of-interest disclosure and self-review block;
- moderator action sampling and appeal-overturn dashboard;
- ban evasion detection limited to necessary security identifiers with retention policy.

## Export/delete

User export includes own profile, drafts, published authored revisions, subscriptions, reports they submitted, votes and action summaries; it excludes reporter identities, other users’ private data and secrets.

Account deletion:

- sessions/consents/private drafts/subscriptions are deleted;
- public authored content follows owner-approved policy: pseudonymous tombstone or retained attributed/pseudonymized contribution based on consent/legal basis;
- immutable moderation/legal audit may retain minimal actor surrogate and content hash, not login secret;
- external provider content must be deleted at that provider separately; local projection records the result/unknown honestly.

This policy must be legally reviewed before public writes.

## Moderation operating SLO options

Pilot owner-only: no public reports; link quarantine within owner workflow.
Private contributor pilot: abuse/PII report acknowledgement under 24h, safety quarantine under 4h during declared coverage.
Bounded community: named coverage calendar, high-risk response under 4h, normal reports under 48h, appeals under 7 days.

No phase opens unless actual human capacity satisfies its SLO for four consecutive weeks.
