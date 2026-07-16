# LinguistPro Agent Access — AA0 no-secret usability experiment decision packet

**Date:** 2026-07-16

**Status:** `OWNER_APPROVED / EXECUTION_CONFIGURATION_PENDING / DOCS_ONLY`.

**Authority:** AA0 package design only. This packet creates no Hermes installation, profile, skill, configuration, cron job, credential, browser export, API client, MCP/OAuth connection, LinguistPro runtime/schema/config change, provider call, commit, push, deploy or production operation. AA0 execution requires a separate owner-approved execution approval packet.

**Owner approval:** 2026-07-17 — Option B and the interpretation of AA0 as a non-blocking no-secret preflight, not the Agent Access product ceiling, are approved. Exact host/profile/channel mutation still requires the execution configuration in §15 and the separate AA0 execution packet; no Hermes mutation is authorized by this status alone.

**Repository baseline:** committed `main` / `ed3cf11`; package `3.11.189`; F2 is now `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED` and deployed default-off.

**Predecessors:** `LINGUISTPRO_AGENT_ACCESS_HERMES_DECISION_PACKET_2026_07_16.md`; owner-approved S0–S2; S3 `ENGINEERING_COMPLETE / LIVE_EVIDENCE_DEFERRED`; F1 owner path technically verified; F2 engineering complete/default-off.

**What to review:** this file. It is a decision contract, not a skill, configuration or evidence report.

## 1. Decision in one paragraph

Recommend **Option B: a dedicated owner-controlled local Hermes profile, manual-first, link-only AA0 package, with no LinguistPro secret or private read path**. The experiment tests whether a personal agent can save time by turning an owner request into a short learning-oriented message and an allowlisted first-party LinguistPro link. It does not test Agent Access, MCP, OAuth, external learner-data access or learning efficacy. One optional scheduled message per owner-local day may be enabled only after its exact channel is selected and the overlapping LinguistPro nudge is disabled or made ineligible for the same owner/channel. Hermes prose is always labelled external advisory text; LinguistPro alone decides canonical due, grade, mastery, learner state and any first-party action after the link opens.

AA0 is intentionally not the main value proof promised by Agent Access. Personalized cross-application value begins with AA2 read-only capabilities and expands through the owner-approved AA2-R1/AA3/AA4 horizon in the parent packet. AA0 evidence is optional prioritization evidence, never a prerequisite for those engineering stages.

## 2. Repository-grounded boundary

### 2.1 What exists

| Existing capability | Live fact | AA0 implication |
|---|---|---|
| First-party authentication | Owner bootstrap creates an HttpOnly `lp_session`; `user_id` comes from the validated session; mutations require `X-LP-CSRF`. | Hermes receives none of the cookie, session secret or CSRF value. The browser authenticates only after the owner opens a first-party link. |
| First-party mentor surfaces | Reading Room has stable `#mentor` and `#lesson-builder` views. | AA0 may link to these surfaces without calling their private APIs. |
| Public Reading Room | `/library.html` and Ben-Yehuda catalog/FTS assets are public first-party resources. | AA0 may open the public Reading Room; the package does not scrape or repackage corpus bodies. |
| Notification ownership | Push and Telegram share the atomic `nudge_ledger` key `(user_id, local_day)`, capped at one first-party claim/day. | Hermes cron is outside this ledger and therefore must not run as a second overlapping official reminder path. |
| Lesson Builder | Typed draft is created by the existing first-party flow and stored only in browser `sessionStorage` for at most 24 hours. | AA0 may open the Lesson Builder view but cannot create, inspect or claim status for a lesson draft. |
| Reading handoff | Existing token is user-bound, single-use and five minutes, minted only by first-party Mini App review. | AA0 cannot mint or reuse it; arbitrary `?handoff=` links are prohibited. |
| Export/delete | Account export/delete and restore-erasure replay exist. | They do not cover Hermes sessions. AA0 must disclose that local/external Hermes retention is a separate lifecycle. |

### 2.2 What does not exist

- no Agent Access Service, OAuth authorization/resource server, connected-agent record or external scope;
- no MCP endpoint, SDK dependency or external client runtime;
- no safe private API token for Hermes;
- no remote public-catalog search tool contract;
- no official external notification claim/receipt path;
- no durable server lesson intent/draft/status lifecycle;
- no LinguistPro mechanism that can delete an already delivered Hermes transcript.

### 2.3 Planning discrepancies fixed by this packet

- Live committed baseline inspected for this decision is `ed3cf11` / `3.11.189`; the older `CLAUDE.md` product-version line may lag and is not used as runtime evidence.
- The live CP0 registry contains **28** scenarios, not the 23-scenario count in an earlier S3 snapshot.
- `consent_records` is append-only lifecycle substrate, but it accepts a bounded arbitrary key string; it is not an Agent Access scope/consent registry.
- Existing public corpus search is primarily a browser/static-shard capability, not a remote Agent Access service.

## 3. Exact experiment objective

AA0 answers one bounded product question:

> For the owner, does a no-secret personal agent message plus one first-party LinguistPro link reduce the friction of starting or resuming a useful reading/review/mentor action without creating false learning claims, duplicate reminders, privacy discomfort or meaningful extra cost?

AA0 may establish:

- whether the owner starts the intended first-party action;
- whether the action is completed in LinguistPro;
- subjective time saved and friction;
- incorrect agent claims or unwanted reminders;
- whether link selection is useful enough to justify AA2 later.

AA0 cannot establish:

- OAuth/MCP compatibility, connection isolation or revoke behavior;
- correctness of private learner aggregates;
- F1/F2 educational authority;
- improved retention, mastery, transfer or grading quality;
- public-user demand, support cost or commercial readiness.

## 4. A/B/C options

| Option | Host/profile/channel shape | Value | Decision |
|---|---|---|---|
| **A — manual link card only** | Existing owner-controlled Hermes CLI/TUI session; no dedicated profile; no gateway/cron; result copied/opened manually. | Lowest mutation and reminder risk, but profile memory/tool contamination is harder to measure and no notification hypothesis is tested. | Safe fallback. |
| **B — dedicated local profile, manual-first, optional one daily channel (recommended)** | Exact owner-controlled local machine; dedicated `linguistpro-aa0` profile; package exposes only prose/links; manual use first; one named owner-only delivery channel may be added later under the duplicate-notification rule. | Isolates diary/session history, tests real convenience and one bounded scheduling hypothesis without private access. | **Recommend.** |
| **C — general-purpose or hosted gateway profile with multiple channels/cron** | Shared memory/tools, hosted runtime or broad messaging fan-out. | More convenience, but larger credential/tool/transcript surface and poor attribution of AA0 value. | Reject for AA0. |

## 5. Recommended no-secret configuration contract

This is a future configuration specification, not authorization to apply it.

| Field | Recommended value | Owner decision required |
|---|---|---|
| Host | One owner-controlled local desktop/WSL host; not a shared or hosted gateway | Exact machine/OS/runtime location |
| Profile | New dedicated profile `linguistpro-aa0`; no inherited LinguistPro data, browser state or unrelated skills | Exact profile name |
| Initial channel | Manual CLI/TUI output only | Approve manual-first |
| Optional scheduled channel | Exactly one owner-only channel after separate approval; never `all`/broadcast | Exact channel/account/chat |
| Tools | No LinguistPro API/MCP/browser-cookie tool; package may render allowlisted links only | Approve empty private tool surface |
| Cron | Absent initially; at most one fixed local-time message/day only after notification decision | Local time/timezone and days |
| Parallel calls | Not applicable; no LinguistPro tools | None |
| Session retention | Opt-in auto-prune for the dedicated profile, 30-day ended-session retention; active sessions manually ended; diary is stored separately | Approve 30 days or select another bounded value |
| Cost | Owner-chosen Hermes/model account only; no LinguistPro managed/BYOK key; diary records perceived cost friction | Exact provider/model budget if execution is approved |

Hermes currently stores full session messages and tool calls/results in `~/.hermes/state.db`; auto-prune is disabled by default, while opt-in pruning supports a retention window and manual deletion/export. This makes retention a real AA0 decision, not a harmless default ([Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/)).

## 6. Future local skill/package contents

The separately approved AA0 execution packet may create one local package containing only:

1. **Purpose and authority header** — “External owner assistant; LinguistPro remains system of record.”
2. **Closed task vocabulary** — `START_READING`, `OPEN_MENTOR`, `OPEN_LESSON_BUILDER`, `OPEN_STUDIO`, `RESUME_FIRST_PARTY_ACTION`.
3. **Link map** — exact allowlist in §7; arbitrary URLs and query construction prohibited.
4. **Message template** — one short reason, one action, one link, external-prose label.
5. **Truth rules** — never claim due count, mastery, weakness, grade, completion, recommendation authority or knowledge of private state.
6. **Notification rules** — at most one owner-controlled learning message/day; no fallback channel; no claim that delivery is official LinguistPro notification.
7. **Diary template** — exact fields in §10.
8. **Stop conditions** — exact list in §12.
9. **No-secret scanner/checklist** — reject cookies, CSRF, Authorization headers, tokens, exported payloads and private endpoint URLs.
10. **Removal instructions** — disable/remove package and cron; prune/delete the dedicated profile/session as separately chosen.

The package must not contain executable browser automation, HTTP calls to private endpoints, scraping logic, shell commands, provider credentials, LinguistPro credentials or a copy of any F1/F2 record.

## 7. First-party link allowlist

Only origin `https://linguistpro.kolosei.com` is allowed. URL parsing must compare normalized origin, pathname, query and hash; string-prefix matching is insufficient.

| Purpose | Exact allowed target | Constraints |
|---|---|---|
| Product home / Studio | `https://linguistpro.kolosei.com/` | No query or fragment generated by Hermes. |
| Reading Room | `https://linguistpro.kolosei.com/library.html` | Public entry; first-party browser owns local/session state. |
| Mentor Home | `https://linguistpro.kolosei.com/library.html#mentor` | Opening does not authorize a model call or canonical action. |
| Lesson Builder | `https://linguistpro.kolosei.com/library.html#lesson-builder` | User selects sources and triggers build in app; Hermes creates no lesson or intent. |

Explicitly not allowlisted:

- any `/api/*` path;
- `?handoff=`, OAuth/token/code/state parameters or arbitrary query strings;
- static corpus body/index paths as agent retrieval inputs;
- upload/admin/research endpoints;
- non-LinguistPro origins, URL shorteners or redirects.

## 8. No-secret and no-private-data invariant

The following must never enter Hermes config, skill/package, prompt, diary, cron output or session:

- `lp_session`, its session ID/secret, `X-LP-CSRF`, Mini App session or initData;
- bootstrap/admin/upload/research bearer credentials;
- LinguistPro BYOK or managed provider keys;
- browser local/session storage, OPFS/IndexedDB exports or cookies;
- private `/api/agent/*`, `/api/learner/*`, account export or memory export payloads;
- F1 records/source links/query receipts;
- F2 observations/hypotheses/requests/attempts/evaluations/shadow decisions;
- personal source bodies, explanation bodies, review items/answers or expected forms.

The experiment uses only owner-written prompts, Hermes-generated prose, the closed diary and allowlisted public/deep links.

## 9. Notification ownership and duplicate elimination

### 9.1 Owner-local rule

Before any Hermes cron is created, the owner selects one of these mutually exclusive policies:

- **N-A — manual-only (recommended for the first five uses):** no Hermes cron; LinguistPro notifications unchanged.
- **N-B — Hermes daily message:** exactly one Hermes owner-channel message/local day; overlapping LinguistPro nudge is disabled/muted or otherwise made ineligible for this owner/channel for the entire AA0 scheduled window.
- **N-C — LinguistPro notification:** Hermes remains on-demand only.

Never allow both systems to independently schedule the same learning reminder. Hermes supports cron delivery to multiple channels, so `all`, fan-out and fallback delivery are prohibited in AA0 ([Hermes Scheduled Tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)).

### 9.2 Daily cap

- Cap is **one owner-controlled learning message per owner-local calendar day**, across all Hermes AA0 jobs/channels.
- A manual owner request may receive a response; it does not authorize a second proactive delivery.
- A delivery failure is recorded as failure and is not retried to another channel that day.
- The message cannot say “LinguistPro says,” “you are due,” or “recommended for you” without a future canonical Agent Access response.

## 10. Structured diary contract

One row per AA0 use, UTF-8, no private LinguistPro payloads:

```json
{
  "use_id": "aa0-local-opaque",
  "used_at": "UTC timestamp",
  "task": "START_READING|OPEN_MENTOR|OPEN_LESSON_BUILDER|OPEN_STUDIO|RESUME_FIRST_PARTY_ACTION",
  "trigger": "MANUAL|SCHEDULED",
  "time_saved_minutes": 0,
  "wrong_claim": "NONE|short owner note <=280 chars",
  "unwanted_reminder": false,
  "privacy_friction": "NONE|short owner note <=280 chars",
  "cost_friction": "NONE|short owner note <=280 chars",
  "opened_first_party_action": true,
  "completed_first_party_action": "YES|NO|UNKNOWN",
  "link_target": "HOME|READING_ROOM|MENTOR|LESSON_BUILDER"
}
```

Rules:

- no title, sentence, word, answer, learner count, F1/F2 value, cookie, token or API response;
- `completed_first_party_action` is an owner report, not inferred learner evidence;
- time saved is subjective and must not be converted into learning efficacy;
- missing diary rows remain missing, not successful uses.

## 11. Evidence window and decision rule

Target: **14 calendar days and at least 20 actual uses**, whichever completes later. The window is `LIVE_EVIDENCE_DEFERRED` when unavailable and does not block AA1 contract work or later separately approved AA2 default-off engineering.

Evidence summary must report denominators:

```text
uses_total
manual_uses / scheduled_uses
links_opened / uses_total
first_party_actions_completed_yes|no|unknown / links_opened
wrong_claim_uses / uses_total
unwanted_reminder_uses / scheduled_uses
privacy_friction_uses / uses_total
cost_friction_uses / uses_total
median owner-reported time_saved_minutes
```

AA0 supports prioritization only if there are 20 uses, zero stop-condition incidents, and the owner judges the workflow meaningfully useful. No numeric threshold authorizes AA2, and no AA0 result is a learning-outcome claim.

## 12. Exact stop conditions

Stop AA0 immediately, disable any AA0 cron, preserve only content-safe incident facts and return to the owner if any occurs:

1. any LinguistPro cookie, CSRF value, bearer token, bootstrap secret, provider key or private export enters Hermes;
2. the package or agent calls or attempts a private LinguistPro API;
3. a URL outside §7 or any `?handoff=`/token/code/state URL is generated;
4. F1/F2 payload, review item/answer, personal text or explanation body is read, copied or inferred;
5. more than one proactive AA0 learning message is attempted in one owner-local day;
6. Hermes and LinguistPro deliver overlapping official-looking reminders;
7. Hermes prose claims mastery, grade, weakness, due truth, completion or canonical recommendation;
8. a first-party action is claimed completed without owner confirmation;
9. the dedicated profile is not isolated as approved or session retention exceeds the chosen policy without visible warning;
10. unexpected cost, broad tool execution, cross-profile content or non-owner delivery occurs;
11. the owner cannot disable/remove the package/cron/profile cleanly;
12. AA0 execution starts without the separate approval packet.

## 13. Hermes prose versus LinguistPro decision

| Output | Authority |
|---|---|
| Hermes wording, suggested timing or reason | External advisory prose; may be wrong; never evidence or learner truth |
| Allowlisted link choice | AA0 convenience mapping, not learner-specific recommendation |
| First-party page content after open | LinguistPro product output under its current session/consent/controller rules |
| Grade, `review_log`, FSRS, mastery, resolver truth, consent | LinguistPro canonical/deterministic authority only |
| Diary completion field | Owner report about workflow completion; not a grade or learning result |

Required label in every AA0 message:

> “Личный Hermes-помощник · не оценка и не решение LinguistPro.”

The execution packet may add localized equivalents, but it may not weaken the meaning.

## 14. R1–R17 adversarial review

| Lens | Attack | Locked response |
|---|---|---|
| R1 | External prose invents Hebrew facts. | AA0 carries no Hebrew fact payload and makes no morphology claim. |
| R2 | Generic reminders create activity, not learning. | One concrete first-party reading/review/mentor action; diary measures opened/completed action, not messages. |
| R3 | Link/diary IDs look like learner graph lineage. | AA0 IDs are local workflow IDs with zero learner-state authority. |
| R4 | Link opens a dead end or wrong surface. | Four exact first-party URLs; manual verification in execution packet. |
| R5 | “Agent integration” marketing outruns value. | Owner-only usability question and no interoperability claim. |
| R6 | Public corpus links become ungoverned ingestion. | UI entry only; no static-body scraping or corpus export. |
| R7 | Agent tone/register is confused with LinguistPro. | External-prose label on every message. |
| R8 | Lesson shortcut bypasses graded-reading design. | Lesson Builder is only opened; first-party user selection/confirmation remains. |
| R9 | Hermes memory becomes learner truth. | Dedicated external profile and explicit zero authority. |
| R10 | Twenty owner uses are generalized to product safety. | Evidence is personal prioritization only; no efficacy/public claim. |
| R11 | Hermes self-reports correctness. | Owner records wrong claims; no Hermes output grades itself. |
| R12 | Local skill becomes business logic. | Package maps closed tasks to links only; no controller/repository/API logic. |
| R13 | Removal loses or resurrects LinguistPro data. | No LinguistPro data enters AA0; removal affects only the local package/profile. |
| R14 | Cross-profile/channel confusion sends to another person. | Dedicated profile, exact owner-only channel, no broadcast/fallback. |
| R15 | Full sessions persist indefinitely. | Owner selects 30-day ended-session pruning and receives downstream-retention warning. |
| R16 | Cron/model use amplifies polling or managed spend. | No polling/API; one message/day; no LinguistPro model spend. |
| R17 | Prose claims mastery or evaluation. | Required advisory label and stop condition on any grade/mastery/evidence claim. |

## 15. Owner decisions

1. **Experiment shape:** A manual only / **B dedicated profile + manual-first + optional one daily channel (recommended)** / C general-hosted gateway.
2. **Exact host:** name the owner-controlled machine and whether Hermes runs in Windows, WSL or another local environment.
3. **Exact profile:** approve `linguistpro-aa0` or provide another dedicated name.
4. **Channel:** manual-only initially (recommended), or name exactly one owner-only scheduled channel.
5. **Notification policy:** N-A manual-only / N-B Hermes daily with overlapping LinguistPro path disabled / N-C LinguistPro-only.
6. **Schedule:** if N-B, exact timezone/local time/days; cap remains one/day.
7. **Retention:** approve auto-prune of ended AA0 sessions after 30 days, or select a shorter bounded value; active-session cleanup remains explicit.
8. **Provider/cost:** name the owner-controlled Hermes model/provider and a bounded personal cost ceiling; no LinguistPro key or spend.
9. **Package contents/link allowlist:** approve §§6–7 without additions, or adjudicate each addition.
10. **Evidence:** approve 14-day/20-use diary as deferrable prioritization evidence, not AA1/AA2 authority.
11. **Execution packet:** authorize preparation only; do not authorize installation/configuration yet.

## 16. Separate AA0 execution approval packet plan

After owner decisions, prepare `LINGUISTPRO_AGENT_ACCESS_AA0_EXECUTION_APPROVAL_PACKET_2026_07_16.md` containing:

1. exact host/profile/channel/version inventory and preflight;
2. exact local package file tree and complete proposed contents/diff;
3. normalized URL allowlist tests and secret/private-data sentinel tests;
4. notification policy, local-day cap implementation and duplicate-path proof;
5. retention/prune commands and removal/rollback commands;
6. cost ceiling and zero-LinguistPro-provider proof;
7. diary file location/schema/validation and summary command;
8. five manual-use gate before any cron mutation;
9. exact stop/incident procedure;
10. explicit mutation list requiring final owner approval.

Only that later packet may request permission to install/configure a dedicated profile, create the local package or mutate a cron job. Evidence collection starts only after those mutations are separately approved and verified.

## 17. Before / after

**Before AA0:** the owner can manually open LinguistPro and use a general agent separately, but there is no measured, isolated no-secret workflow and no rule preventing duplicate agent/product reminders.

**After this packet:** the exact personal experiment, link/package boundary, one-message/day policy, retention choice, diary, stop conditions and future execution gate are decision-ready. Nothing is installed, connected or scheduled.

## 18. Source map

Repository sources inspected:

- `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_ROLES.md` and the mandated Wave-2/Agent Access planning canon.
- Live identity/session/consent/account routes and `migrations/020_identity.sql`.
- `migrations/027_telegram_channels.sql`, `032_notification_prefs_nudge_ledger.sql`, `033_nudge_state_snooze.sql`, `034_miniapp_session.sql`, `038_reading_handoff.sql`, `039_cp0_observations.sql`.
- Live handoff, notification, CP0, Lesson Builder and Reading Room routing/storage code.
- `package.json`/lock and repo-wide runtime scan confirming no OAuth/MCP dependency or external-client runtime.

External official facts refreshed on 2026-07-16:

- Hermes MCP, OAuth and tool filtering: [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).
- Hermes session storage/pruning: [Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions/).
- Hermes cron/delivery: [Hermes Scheduled Tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron).

No private production operations file, real F1/F2 payload, browser credential, provider secret or external connection was opened.
