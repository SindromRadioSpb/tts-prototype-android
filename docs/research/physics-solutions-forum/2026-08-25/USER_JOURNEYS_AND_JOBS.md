# User journeys and jobs

Дата: 2026-08-25; source commit 7293a9212279f2292b33c55a5994afa41340ccbd; branch main; dirty pre-existing worktree; production inspected this session: NONE; predecessor version: 3.11.435.
Evidence: CODE=current HEAD; LOCAL_TEST=NONE; ISOLATED_AUTOMATION=predecessor only; PRODUCTION_ANONYMOUS=predecessor only; OWNER_LIVE_READ_ONLY=NONE; OWNER_REPORTED=predecessor owner acceptance; EXTERNAL_PRIMARY=official current sources; INFERENCE=journey/model/recommendation.

## Common learning journey

Problem → own attempt → hint/solution → precise question → response → clarification → usefulness decision → later return → new task edition → archive/delete/report.

The product should preserve problem identity and learning context, not merely keep a conversation alive. Metrics therefore observe task-bound retrieval and resolution aggregates, never answer bodies or learner mistakes.

## Personas and failure journeys

| Persona | Primary job | Intended journey | Failure journey and shield |
|---|---|---|---|
| Solo learner | Find/save a trustworthy explanation without waiting for others | Open task → see verified resources by language/type → open safe link → return through stable task URL | Empty forum or dead permission link; pilot uses curated registry, visible access state, health timestamp and browser-bookmarkable URL |
| Read-only learner | Compare approaches and know provenance | Task → solution cards → language/verification filters → source/provider disclosure | Popularity masquerades as correctness; keep expert review, useful votes, moderation and official status separate |
| Question asker | Ask exactly where stuck | Select edition-pinned task/subpart → search duplicates → draft question → preview visibility → publish → subscribe | Posts PII publicly or anchors wrong edition; default visibility preview, explicit task context, warning, reversible edit window |
| Contributor | Publish an attributable solution | Choose task → declare authorship/rights/language → create revision → submit for review | External copy without rights, destructive edit, accidental official claim; append revisions and independent quality states |
| Trusted reviewer | Verify physics and explanatory quality | Review exact revision + task snapshot → conflict declaration → structured verdict → reason | Reviewer edits own work or moderation conflates with correctness; separation of duties and conflict block |
| Moderator | Contain abuse quickly and appealably | Report queue → context → temporary quarantine → reasoned action → notify → appeal/review | Mass delete, invisible censorship, leaked reporter identity; quarantine/tombstone, immutable action log, two-person high-impact actions |
| Corpus editor/owner | Mark official relation and manage edition evolution | Inspect anchor/equivalence → approve official association → publish mapping → rollback projection | Silent carry to changed task; explicit old/new equivalence record and no body rewrite |
| Private study group | Avoid duplicate questions inside bounded membership | Group-scoped view → task-local duplicate suggestions → one Q&A → group-only visibility | IDOR or membership reuse as global authority; relationship-based checks on every object/request |
| Anonymous reader | Read approved public resources without account state | Public task → approved resources → external warning → back | Enumeration/tracking or UI pressure to sign in; cached paginated reads, no cookie requirement, no external previews |
| Potential minor | Learn without exposing identity/contact/voice | Anonymous read; write blocked until age/legal program is approved | Public PII, grooming/contact, permanent profile; no assumption of supported audience, minimal data, no DMs, no location/voice attachments |

## Jobs by scale

| Active people | Product value | Features that are real | Features that are decoration |
|---:|---|---|---|
| 1 | Curated task-bound resources, provenance, language, return URL, link health | owner writer, anonymous/private read, task-local search | reputation, followers, public activity feed, badges |
| 10 | Shared duplicate-free study index, explicit group/public visibility | resource suggestions, owner review queue, task subscriptions only if identity proven | global leaderboard, many empty categories |
| 100 | Repeated Q&A demand becomes measurable | duplicate suggestion, native text pilot, reviewer workflow, reports | chronological general forum |
| 1,000 | Moderation and discovery need queues/SLOs | bounded Q&A, digest, audit/appeal, SQLite FTS if measured healthy | unconstrained mentions and notification fan-out |
| 10,000 | Hot tasks and abuse need operational budgets | caching, queue for delivery, stronger anti-abuse, moderator staffing | automatic role promotion without review |

## Product-shape conclusion

- Structured solution is the durable learning artifact.
- Q&A is appropriate for a specific unresolved point and can have answers plus comments.
- Chronological discussion is useful only inside a named task-bound topic; it is poor as the primary knowledge model.
- Annotation may target a semantic subpart/row in one immutable edition, but must not bind to a DOM selector.
- The first slice contains no empty discussion UI. A task with no resources shows an honest owner-curation request path, not a zero-reply thread.

## Anti-entropy mechanisms

1. Search and duplicate candidates appear before publish.
2. One default task Q&A surface; additional topical threads need moderator/reviewer creation, not arbitrary taxonomy.
3. Solution cards rank verified/current/access-healthy first; usefulness is a secondary, abuse-resistant signal.
4. Accepted answer means asker-selected resolution, not official correctness. Canonical/official requires corpus-editor authority.
5. Slow mode, per-principal creation budgets, link count limits and new-account quarantine prevent capture by high-volume users.
6. Contributor/reviewer diversity and concentration dashboards are aggregate; no engagement manipulation feed.
7. Archive superseded edition discussions read-only with a visible successor link; never merge bodies silently.

## Reversible, appealable and audited actions

| Action | Reversible | Appealable | Audit |
|---|---|---|---|
| Draft/edit within window | yes through revision | n/a | revision actor/time |
| Author withdraw | public tombstone, body retention policy-dependent | yes if legal hold | reason, prior visibility |
| Moderator quarantine | yes | mandatory | actor, policy reason, target revision |
| Permanent redaction | body escrow/hash only after policy/legal review | mandatory | two-person approval for public content |
| Role grant/revoke | yes | owner review | principal, capability delta |
| Expert verdict | superseded by new verdict, not overwritten | conflict appeal | reviewer, rubric, revision |
| Official association | pointer/event rollback | owner governance | corpus editor + exact edition |
| Report closure | reopenable | reporter appeal where safe | reason, SLA, no reporter exposure |

## Learning-benefit metrics without surveillance

- task pages with at least one current, accessible, reviewed solution;
- median task-open → solution-open time;
- return-to-same-task within 7/30 days as content-free count;
- duplicate prevention rate before submit;
- question resolution time and fraction with a helpful answer;
- helpful marks per unique principal with rate/brigade controls;
- percentage of resources with healthy/permission-known links;
- correction rate after expert review;
- report SLA, appeal overturn rate and moderator concentration;
- anonymous/public read availability and error rate.

Excluded: answer text telemetry, keystrokes, formula contents, per-learner error profiles, reading of external provider content, contact graphs and cross-site tracking.

## Evidence gates for community demand

Native text solution gate over a rolling 8 weeks:

- at least 25 verified writers/requesters and 100 task-bound resource opens per week;
- at least 20 approved external resources, with either over 10% monthly access failure or owner-reported authoring friction;
- named reviewer and moderator coverage, each with response SLO;
- identity recovery/export/delete and abuse red tests green.

Native Q&A/comments gate over a rolling 8 weeks:

- at least 30 distinct verified askers and 15 distinct responders;
- at least 40 task-bound questions/month, with duplicate search unable to resolve at least half;
- moderation load forecast under available capacity and report/appeal runbook rehearsed;
- no unresolved minor-audience or public-PII blocker.

Attachments gate:

- at least 10% of approved solution attempts have a documented need not met by safe external links/native text;
- scanning, quarantine, object inventory, quotas, legal takedown, backup/read-back and restore all proven;
- bounded monthly storage/egress budget explicitly approved.
