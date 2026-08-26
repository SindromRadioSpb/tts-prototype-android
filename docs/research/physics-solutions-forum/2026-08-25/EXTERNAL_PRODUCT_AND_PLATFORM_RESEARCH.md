# External product and platform research

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=provider/OWASP/W3C/FTC/ICO facts dated 2026-08-25; INFERENCE=product fit/recommendation.

## Mature discussion/Q&A contracts

| Product/protocol | Primary-source facts | Portable contract | Mismatch/risk |
|---|---|---|---|
| Discourse | Hosted Pro is USD 100/month; Business USD 500/month and includes SSO; current plan table lists 500k page views, 20GB/100GB storage. It is open source/self-hostable. Full backups include topics, posts, users, groups and settings; uploads are optional in backup. [Official pricing](https://www.discourse.org/pricing), [backup/restore](https://meta.discourse.org/t/create-download-and-restore-a-backup-of-your-discourse-database/122710) | Mature moderation/trust, search, notification, export/restore and read-only maintenance mode | Separate identity/ops stack; task edition mapping remains a LinguistPro projection; SSO tier/cost and embedding privacy/CSP need proof |
| Apache Answer 2.0.2 | Open-source Apache-2.0 Q&A; official docs expose Q&A, revisions, votes, reputation, moderation roles, notifications, search and Swagger API. Supports SQLite/MySQL/PostgreSQL; dump command exports SQL. [Introduction](https://answer.apache.org/docs/), [permissions](https://answer.apache.org/docs/permission/), [API](https://answer.apache.org/docs/api/), [backup command](https://answer.apache.org/docs/command-line/), [release](https://answer.apache.org/download/) | Strong question/answer/revision semantics; self-hostable and portable DB | Reputation defaults are not physics correctness; requires separate service, upgrades, identity and moderation; task mapping plugin/integration still custom |
| NodeBB | Open-source GPLv3, REST API/plugin framework, real-time notifications. Hosted plans on 2026-08-25: USD 20/100/250/750 per month for 50k/500k/2m/10m page views; storage 5/20/100/300GB; weekly on Starter, daily backups above. [Docs](https://docs.nodebb.org/), [pricing](https://nodebb.org/pricing), [privileges](https://docs.nodebb.org/activitypub/privileges/) | Fine-grained category privileges, API and self-host path | Conversation-first rather than structured physics solutions; Redis/Mongo/Postgres operations and plugin security broaden scope |
| GitHub Discussions | Repository/organization forum supports Q&A, open discussion, categories and moderators; GraphQL can read/create/edit/delete discussions. Tokens require repository scopes. Transfer is restricted to same owner/org and cannot transfer private to public. [Docs](https://docs.github.com/en/discussions), [GraphQL](https://docs.github.com/en/enterprise-cloud%40latest/graphql/guides/using-the-graphql-api-for-discussions), [management](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions), [pricing](https://github.com/pricing) | Fast external community experiment, API-deep links and proven moderation | GitHub account is mandatory for writes, developer-centric UX, repository permission coupling, limited product-owned identity/data portability |
| Stack Exchange API / Q&A semantics | API v2.3 provides questions, answers, comments, accept/vote/flag/edit operations with OAuth and throttling; semantically identical polling faster than once/minute is called abusive. [API docs](https://api.stackexchange.com/docs) | Separating questions, answers and comments; accepted answer distinct from score; explicit throttles | Stack Exchange network is not a deployable embedded community. Use as semantics evidence, not a provider recommendation |

Inference: if the owner wants a real community before native identity/moderation is ready, a separately hosted Discourse or Apache Answer pilot is safer than simulating a forum in publication/group tables. For the smallest solo-first pilot, even those platforms add more identity and operations than task-bound link metadata needs.

## Google Drive for link-first

Official facts:

- A file may be Restricted, Public or Anyone with the link; viewer/commenter download is allowed by default but owner can restrict it. Folder permissions inherit; a child cannot simply reduce inherited access. [Drive sharing help](https://support.google.com/drive/answer/2494822), [permission propagation](https://developers.google.com/workspace/drive/api/guides/manage-sharing).
- The URL is stable for a fileId, while access is evaluated against the current ACL; revoke/expiry makes the same link inaccessible. This proves that link stability is not access stability. [Manage sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing).
- Drive API has explicit project/user quotas and may return 403/429; its page dated 2026-07-31 says standard use currently has no extra cost and over-quota charging is planned later in 2026 with notice. Download consumes more quota than metadata. [Usage limits](https://developers.google.com/workspace/drive/api/guides/limits).
- Downloads require an authorized scope; owners/organizers can restrict them, and abusive files require explicit acknowledgement. [Downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

Inference/recommendation:

- Store provider=GOOGLE_DRIVE, canonical file ID where parseable, normalized HTTPS display URL, claimed permission state, last_checked_at and health/access status.
- Pilot must not call Drive API or fetch arbitrary bodies. User opens provider directly; LinguistPro shows hostname and permission-unknown warning.
- Do not claim backup/export of external content. Export only the registry record and original URL. Link death and owner revocation remain residual risks.

## Telegram for link-first or external community

Official facts:

- Public/private message links can target a specific message and thread/topic; private links still require access. [Deep links](https://core.telegram.org/api/links).
- Telegram topics have distinct histories and notification settings; only admins with manage_topics can create/modify/delete group topics. [Forum topics](https://core.telegram.org/api/forum).
- Groups support replies, mentions, search, moderation and anti-spam; public groups expose history and permit anyone to join/post subject to permissions. [FAQ](https://telegram.org/faq).
- Telegram Desktop/Lite can export chats; account deletion does not remove copies of messages retained by other participants. [FAQ](https://telegram.org/faq).

Inference/recommendation:

- A t.me message/topic URL is a useful external_resource but cannot be the canonical task anchor or a guaranteed export.
- Telegram identity/pairing in LinguistPro must not silently become community SSO. External group membership and local account authorization are different facts.
- No public preview scraping. A private link should display access=REQUIRES_PROVIDER_MEMBERSHIP and a privacy warning.

## OWASP contracts

- Authorization: least privilege, deny by default, validate permission on every request, prefer ABAC/ReBAC for object relationships, and never trust guessed IDs. [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- State-changing cookie-authenticated requests require server-validated CSRF defenses. [CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- Untrusted rich content requires context-aware output encoding/sanitization; URL values require canonicalization and safe protocols. [Input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [XSS prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).
- Avoid user-controlled redirects; prefer direct visible destinations or allowlisted mappings. [Redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html).
- If uploads ever exist: extension/type/signature checks in combination, generated filename, size limits, out-of-webroot/object storage, authorization, AV/sandbox/CDR, post-decompression limits. [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- Bound CPU, memory, page sizes, uploads, operation count, rates and provider spend. [OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## WAI/WCAG and bidi contracts

- Comment/question forms need explicit labels/instructions, textual errors, error summary linked to fields, focus management and live status messages. [WAI forms](https://www.w3.org/WAI/tutorials/forms/), [notifications](https://www.w3.org/WAI/tutorials/forms/notifications/), [Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification).
- Target size minimum is 24×24 CSS px subject to spacing exceptions; product target remains 44×44 where practical. [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Reflow must work around 320 CSS px equivalent and sticky UI must not obscure focus. [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow).
- Login must not block password managers/paste and should offer a non-cognitive path such as WebAuthn/email link/OAuth. [Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).
- Document direction and content language are independent; use dir=auto for unknown user content and bdi for mixed inline identity. [W3C bidi guidance](https://www.w3.org/International/questions/qa-html-dir).

## Minors/privacy boundary

This packet is not legal advice and does not determine jurisdiction.

- FTC says COPPA may apply to child-directed services or actual knowledge of users under 13; open posting can itself collect personal information, and parental notice/consent, access/delete, security and retention duties may follow. A general-audience service may choose not to permit under-13 participation. [FTC plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business), [FTC FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- UK ICO says the Children’s code may apply when children are likely to access a service even if not targeted. [ICO introduction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code).

Recommendation: anonymous read may remain age-neutral; community writes are NO_GO until owner chooses target audience/jurisdictions and obtains legal review. Pilot has no DMs, voice/photo uploads, location, real-name requirement or public contact fields.

## Source fact vs inference

Provider capabilities, documented limits and prices are source facts dated 2026-08-25. Suitability, gates, workload and architecture choices are inferences. No provider availability, account, API token, paid plan or live integration was tested.
