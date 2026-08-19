# Capability and access matrix

Status: proposed target contract; no implementation authority.

## Trust domains

| Domain | Discover/access | Learner truth | Content truth | Default share | Writer |
|---|---|---|---|---|---|
| Public corpus | anonymous; optional account | device-local before account; cloud after explicit claim/sync | immutable published edition | stable public link | owner/publisher only |
| My Texts | current local profile only | local; optional explicit cloud sync | editable OPFS/SQLite source | portable ZIP | learner/owner |
| Protected group corpus | invitation + authenticated active entitlement | cloud/group scoped | protected server corpus | protected link with access warning | group owner in bounded contract |
| Ben-Yehuda | anonymous | device-local or opted-in cloud | baked public corpus/version | stable public link | corpus pipeline, not UI editor |

No share or publish operation transfers learner progress, `review_log`, personal
notes, keys, Mentor memory, Telegram identity or private cloud grants.

## Learner capabilities

Legend: `YES` first-class; `POLICY` only when source data/rights permit; `LINK`
link only; `N/A` intentionally absent.

| Capability | Public corpus | My Texts | Protected group | Ben-Yehuda |
|---|---:|---:|---:|---:|
| Browse/search/filter/sort | YES | YES | YES after access | YES |
| Open reader, RTL/niqqud | YES | YES | YES | YES |
| Translation/morphology | POLICY/data | YES | POLICY/data | POLICY/data |
| Recorded row audio | POLICY | YES/local | POLICY | POLICY |
| TTS fallback | YES | YES | YES | YES |
| Karaoke/timed playback | POLICY/data | YES/data | POLICY/data | POLICY/data |
| Local progress/Finished | YES | YES | YES | YES |
| Retention/SRS | YES | YES | YES | YES |
| Cross-device sync | after account + consent | after account + consent | required identity | after account + consent |
| Mentor plan/history | after account | after account + sync | after account | after account |
| Telegram delivery | after separate pairing consent | same | same | same |
| Share stable link | YES | N/A | LINK, recipient still needs access | YES |
| Share/download full ZIP | POLICY | YES | owner/policy only | POLICY |
| Edit source | N/A | YES | bounded owner import | N/A |
| Add to public corpus | owner/publisher copy | owner/publisher copy | explicit rights + copy | pipeline only |

“Maximum parity” means the same learner tools whenever the underlying text, audio,
timing, rights and identity state support them. It does not mean manufacturing
translations/timing, bypassing entitlements, or labeling missing audio as present.

## Progressive onboarding

```text
Anonymous visitor
  -> browse and read public corpus
  -> local progress is useful immediately
  -> contextual prompt only when a cloud capability is requested
       -> create/sign in to LinguistPro account
       -> review local-profile claim/merge summary
       -> choose cloud sync
       -> optionally connect Telegram
       -> optionally enable Mentor data/AI consents

Invite recipient
  -> inspect corpus name + inviter + access meaning
  -> JOIN creates identity, LOGIN restores existing identity
  -> entitlement is checked on every protected request

Owner/publisher
  -> Studio Library: select material(s) -> Add to corpus
  -> Publication Center: draft -> checks -> anonymous preview -> publish edition
  -> Reading Room: Manage corpus deep-links to the same writer
```

## Account states shown in context

| State | Copy/action |
|---|---|
| Guest, local profile | “Your reading stays on this device.” Continue without account; secondary “Sync across devices”. |
| Account required | Inline sheet explains the requested benefit; Telegram sign-in and email magic-link fallback are product candidates. |
| Local/cloud identity mismatch | Block silent rebinding; show both profiles, dry-run counts, choose merge/keep separate/cancel. |
| Signed in, sync off | “Account connected; this device is not syncing.” Offer explicit enable. |
| Telegram unlinked | Explain delivery consent, then “Open @LinguistProMentorBot”. |
| Telegram pending | “Confirm in Telegram”; reopen, refresh link, cancel; refresh state on return. |
| Telegram linked | Masked identity, send test, notification controls, disconnect. |

Authentication proves identity. Sync consent permits data movement. Telegram pairing
permits delivery to one channel. Mentor/LLM consent permits specific processing.
They must not be collapsed into one checkbox.

## Public-corpus publication states

```text
DRAFT -> READY_FOR_REVIEW -> PUBLISHED(edition N) -> SUPERSEDED
  |            |
  |            +-- blocked by rights/provenance/audio/privacy gate
  +-- ARCHIVED

Public URL -> current published edition
Prior edition -> immutable evidence/rollback target
```

Minimum item metadata:

- stable source ID and copied content hash;
- title/author/source/provenance;
- text license and attribution;
- audio recording license and attribution;
- `public_stream_allowed` and `package_download_allowed` independently;
- audio expected/included/missing counts;
- published edition and timestamps;
- withdrawal/takedown state and reason.

## Share payload decision

| Source | Primary action | Secondary actions |
|---|---|---|
| Public work | Share public link | save/copy link; ZIP only if policy permits |
| My Texts | Share learning ZIP | save ZIP; lightweight JSON under Advanced |
| Protected work | Share protected link | explain that recipient needs access; owner export remains separate |
| Public corpus | Share corpus link | share individual work; package export only if explicitly designed and licensed |

The common share sheet is **one interaction contract**, not one payload. It shows
payload, size, included/missing audio and recipient access before the user invokes
the operating-system share target.
