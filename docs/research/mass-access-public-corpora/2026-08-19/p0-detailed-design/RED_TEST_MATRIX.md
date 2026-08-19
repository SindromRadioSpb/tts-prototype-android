# Red-test matrix and expected baseline

Status: executable contract frozen; implementation intentionally absent.

## Invocation

```text
npm run smoke:mass-access:p0:red
```

The command is explicitly named `:red`, is not included in `npm test`, and must exit
`1` at this stage. Exit `2` means a current invariant or fixture is broken and is not
an acceptable red baseline.

## Green guards

| ID | Frozen existing invariant |
|---|---|
| P0-G01 | no migration/deploy authority |
| P0-G02 | B9 remains frozen |
| P0-G03 | `group_corpora` remains structurally `GROUP_RESTRICTED` |
| P0-G04 | no Curated Path/Assignment schema |
| P0-G05 | publish-copy never deletes private source in its transaction |
| P0-G06 | public read, stream and package-download rights are independent |
| P0-G07 | “complete audio” requires zero expected missing assets |
| P0-G08 | RU/EN/HE contract copy uses the same owner-approved takedown email |

Every green guard must pass now and after implementation.

## Implementation red checks

| ID | Future contract currently expected RED |
|---|---|
| P0-R01 | dedicated `published_corpora` aggregate |
| P0-R02 | immutable editions + append-only publication events |
| P0-R03 | three separate item permission facts |
| P0-R04 | one publication repository |
| P0-R05 | anonymous public-corpus read routes |
| P0-R06 | separately authorized publisher writer routes |
| P0-R07 | typed Room public-corpus adapter |
| P0-R08 | single Publication Center writer UI |
| P0-R09 | publisher-only Studio Add to corpus entrance |
| P0-R10 | Room Manage publication deep link to the same writer |
| P0-R11 | shared native file/ZIP share service |
| P0-R12 | Studio primary Share stops sending JSON |
| P0-R13 | Mentor ordered account/sync/Telegram/AI-consent core |
| P0-R14 | exact copyright/takedown copy in all three runtime locales |

## Required later dynamic tests not faked in P0

Static red tests freeze shape; they cannot prove runtime safety. A later approved
implementation must add:

- temporary-DB migration forward/backward and edition immutability tests;
- owner/publisher/member/anonymous tenant matrix;
- source snapshot hash/read-back and forbidden-field scanner;
- rights matrix including stream-only and download-denied assets;
- publish idempotency, crash before/after pointer flip and cache-warm failure;
- anonymous cache and withdrawal behavior;
- 1/77/1000-item pagination, memory and package-size gates;
- 380 RU/HE RTL, keyboard, 200%, forced-colors, reduced-motion;
- Web Share supported/unsupported/cancel/large-file paths;
- Android Telegram/WhatsApp and iPhone Share Sheet/Files receive + import/read-back;
- Telegram pair pending/confirm/expiry/replay/mismatch/unlink;
- account local/cloud mismatch dry-run with zero mutation on cancel;
- zero `review_log`, notes, progress and owner-data delta.

Automation, fixtures and local browsers do not become physical-device, AT,
receiving-app, production or owner-live evidence.

## Transition rule

No implementation check may be weakened merely to turn the suite green. When all
P0-R checks are genuinely implemented, the command may be renamed from `:red` only
in the implementation packet's scoped diff and after all green guards plus dynamic
tests pass.
