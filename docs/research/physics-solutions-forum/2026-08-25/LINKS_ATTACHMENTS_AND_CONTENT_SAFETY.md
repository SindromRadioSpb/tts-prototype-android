# Links, attachments and content safety

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=provider/OWASP facts; INFERENCE=link/upload policy.

## Link-first contract

Pilot supported provider candidates:

- Google Drive document/file links;
- Telegram public message/topic links and explicitly marked private-access links;
- direct HTTPS pages from owner-approved host allowlist.

Every record stores:

- original_url encrypted/visible according to record visibility;
- normalized_url and provider;
- provider_object_ref only when parsed without network;
- declared resource_type: FULL_SOLUTION, HINT, DERIVATION, VIDEO, DISCUSSION or REFERENCE;
- author display/provenance/language;
- permission_state: PUBLIC, LINK_ACCESS, REQUIRES_PROVIDER_MEMBERSHIP, RESTRICTED, UNKNOWN;
- rights declaration/evidence reference separate from physics corpus attestation;
- health_state: UNCHECKED, HEALTHY, AUTH_REQUIRED, NOT_FOUND, BLOCKED, DEAD, QUARANTINED;
- last_checked_at/check_method and immutable task_anchor;
- independent quality/moderation/official signals.

## URL normalization and opening

1. Parse with a standards URL library; require HTTPS.
2. Reject credentials, IP literals, localhost/private/special-use hosts, non-default provider shapes and control characters.
3. Lowercase/punycode host, normalize default port/path only according to provider contract.
4. Remove known tracking parameters where semantics are not affected; retain provider IDs and message/thread selectors.
5. Never accept a local redirect target parameter. Render a normal external anchor with the final hostname.
6. Open by explicit user action in a new context with rel=noopener noreferrer; show provider/access warning before first open.
7. No iframe/rich preview/server fetch in pilot.

Allowlist is versioned configuration reviewed in code, not arbitrary owner input. A supported host is not a claim that every URL/content on it is safe.

## Link health

Pilot health is owner-confirmed/manual because unauthenticated HEAD/GET is often misleading and server fetch adds SSRF/privacy. Later checker, if approved:

- isolated egress worker; DNS resolution checked before and after redirect;
- max 3 redirects and low byte/time ceiling; never download body except minimal headers;
- no cookies/auth tokens; no user-IP correlated request;
- exponential schedule: new, 7d, 30d, 90d depending on state;
- permission-required is not dead;
- two failures separated in time before DEAD; author notified before archival;
- user report can quarantine immediately.

External content is not in LinguistPro backup. Export says projection only and includes provider URL/provenance.

## Content format

Pilot contains short plain-text title/summary only; no HTML/Markdown/LaTeX body. Native text gate may add:

- CommonMark subset parsed to AST;
- no raw HTML, inline style, iframe, script, data URL or arbitrary embed;
- safe link renderer and server-side length/nesting/node ceilings;
- math through a pinned safe renderer with macro/expansion/time limits;
- stored source plus derived sanitized rendering version; re-render after sanitizer update;
- bidi isolation and language metadata.

## Attachment decision

D10 recommendation: DEFERRED. Link-first and later native text cover the current job without taking custody of binaries.

Attachments may be reconsidered only with all of:

- evidence that at least 10% of approved attempts need binaries;
- allowed business types and per-file/per-user/per-task/month quotas;
- direct-to-quarantine upload with random object key;
- extension + MIME + signature validation, AV/sandbox and CDR where applicable;
- decompressed-size and page/pixel/duration limits;
- object storage outside webroot, private by default, signed bounded download;
- state machine and orphan inventory/GC grace;
- legal takedown, retention and account deletion behavior;
- DB + object version backup, hash read-back and isolated restore;
- cost ceiling/alerts and egress cache policy.

Proposed initial future limits are decision options, not approval: PDF/PNG/JPEG only; 10MB/file, 25MB/user/day, 100MB/user total; no ZIP, Office macro, SVG, audio/video. Actual values need demand and scanner capacity.

## Rights and takedown

- Each author declares they own or may link/publish the specific solution/resource.
- Owner attestation for physics problem text/audio does not cover solution text, images, Drive files, Telegram messages or attachments.
- Linking does not copy the body, but provenance, privacy and takedown still matter.
- Takedown acts on exact resource/revision, quarantines first, records claimant/evidence under restricted access and permits counter-review.
- Official corpus status requires an additional corpus-editor event; moderation approval alone does not grant it.

## Failure-state UI

- Unknown access: “Доступ у внешнего сервиса не проверен”.
- Provider membership: “Нужен доступ в Telegram/Drive; LinguistPro его не выдаёт”.
- Dead: keep provenance/tombstone and offer alternatives/report, do not silently remove history.
- Quarantined: generic unavailable state; do not reveal report details.
- Offline: show cached metadata only and state that external content needs network.

## GO/NO_GO

GO candidate: owner-curated typed HTTPS links, explicit click, no fetch/preview.
NO_GO: arbitrary redirector, automatic provider scraping, storing OAuth refresh tokens, embedding private Drive/Telegram content, accepting user binaries, or claiming external export/backup.
