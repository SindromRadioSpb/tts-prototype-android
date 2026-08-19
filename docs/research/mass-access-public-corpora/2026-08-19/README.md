# MASS-ACCESS — public corpora, sharing and onboarding research

Date: 2026-08-19

Status: `D1–D6 OWNER-APPROVED · P0 DESIGN FROZEN · I3 SHARE IMPLEMENTED ON NON-DEPLOY BRANCH`

Branch: `main`

Source commit at recon start: `e80f2aef74f7c070101e55bd421051320d25f4be`

Production inspected read-only: `https://linguistpro.kolosei.com`, version `3.11.404`

## Question

How should LinguistPro move from a successful owner/group experiment to mass use
without flattening four materially different trust domains:

1. public corpora available without an invitation;
2. private browser-local **My Texts**;
3. protected group corpora;
4. owner/editor publication and curation.

The research also covers the broken Studio text-card share expectation, a possible
Reading Room share action, and in-context account + Telegram + Mentor onboarding.

## Artifacts

- [Current state and evidence](CURRENT_STATE_AND_GAPS.md)
- [Access and capability matrix](CAPABILITY_ACCESS_MATRIX.md)
- [Canonical decision packet](../../../planning/LINGUISTPRO_MASS_ACCESS_PUBLIC_CORPORA_DECISION_PACKET_2026_08_19.md)
- [P0 detailed design and red tests](p0-detailed-design/README.md)
- [I3 Send or save implementation evidence](../../mass-access-i3-share/2026-08-19/README.md)

## Authority and boundaries

The owner has made the mature product decision that **Study Songs may be offered
publicly**. That product authority is recorded here. It does not by itself replace
the currently recorded per-work copyright/recording review: every Study Songs work
and downloadable audio asset still needs an explicit distribution basis before a
public release.

This is a fresh successor program. It does **not** reopen the closed Library/corpus
surface program and does **not** unfreeze `ROOM-UX-B9` Curated Paths & Assignments.
No Path/Assignment schema, speculative AI curator, migration, runtime code, owner
data write, deployment, or public corpus release is authorized by this packet.

## Evidence passport

| Class | Evidence used | Limitation |
|---|---|---|
| `CODE` | current schema, routes, registry, Studio share code, Mentor/Telegram UI | code can differ from future releases |
| `CANON` | Library/corpus closure, Study Songs P0, B9 freeze, Mentor decision records | older records were checked against current code where relevant |
| `PRODUCTION_READ_ONLY` | health, served version, anonymous protected endpoints | no signed-in owner state and no mutation |
| `EXISTING_SCREENSHOT` | 380 px Studio/Room and Study Songs research captures | not fresh physical-device or AT evidence |
| `EXTERNAL_PRIMARY` | Web Share, Telegram, WordPress, YouTube and WIPO materials | patterns inform decisions; they do not prove LinguistPro implementation |

The Chrome DevTools connection could not attach because its configured persistent
Chrome profile was already owned by another running instance. Per the local
troubleshooting procedure, no process was killed and no second profile was silently
substituted. Production source/API probes and existing repository screenshots were
used instead. Therefore this packet contains no new interactive-browser, physical
device, screen-reader, WhatsApp, Telegram-bot, or owner-live PASS.

## Read-only execution record

```text
CODE_CHANGE=NONE
SCHEMA_CHANGE=NONE
OWNER_DATA_WRITE=NONE
PRODUCTION_WRITE=NONE
PUBLICATION=NONE
B9=FROZEN
```
