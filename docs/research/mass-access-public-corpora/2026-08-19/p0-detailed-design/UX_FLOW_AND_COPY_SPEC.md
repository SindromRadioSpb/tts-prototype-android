# UX flow and copy specification

Status: frozen target for a later implementation packet; no runtime authority.

## Subject, audience and single jobs

- **Learner subject:** a Hebrew-learning library and workshop, not a file manager.
- **Learner job:** begin or continue useful reading with the least required setup.
- **Publisher subject:** a small educational press with explicit provenance and
  edition control, not a generic admin dashboard.
- **Publisher job:** assemble, check, preview and publish one trustworthy edition.

## Visual plan

The design adopts the shipped visual foundation rather than creating a new theme.

| Role | Existing token / exact light value | Use |
|---|---|---|
| Page field | `--theme-bg-page` / `#f4f6f9` | quiet outer canvas |
| Paper | `--theme-bg-card` / `#ffffff` | corpus and edition surfaces |
| Ink | `--theme-text-primary` / `#0f172a` | headings and decisive facts |
| Rule | `--theme-border-soft` / `#e2e8f0` | edition/item separation |
| Action | `--theme-accent` / `#2563eb` | one primary action per state |
| Review | `--theme-warning` / `#d97706` | unresolved rights/audio/privacy only |

Dark values and forced-colors behavior come from `visual-foundations.css`; no new
parallel palette is permitted.

Typography:

- interface/body: existing `--lp-font-ui` system stack;
- editorial corpus/edition identity: existing `--lp-font-editorial` sparingly;
- Hebrew UI: `--lp-font-hebrew-ui`;
- Hebrew reading/content preview: `--lp-font-hebrew-reading` (Frank Ruhl Libre).

Layout: a narrow identity column plus a wider ordered manuscript list on desktop;
one vertical document flow on mobile. It encodes source → checks → edition rather
than presenting unrelated dashboard cards.

Signature: the **publication spine**. A single vertical rule joins the real states
`Draft`, `Checks`, `Preview`, `Published edition N`. It is not numbered decoration:
each stop is an actual state with an owner action or blocking fact.

Design critique and revision: the first concept exposed the full spine at all times,
which made a three-item corpus feel bureaucratic. The frozen design collapses it to
one `Ready to publish` line when every gate is green, but expands unresolved text,
audio, privacy and provenance checks before the final Publish confirmation. No
gradient, ornamental illustration or extra status-card grid is added.

## Reading Room entry

The closed Learning Home hierarchy stays authoritative:

```text
Continue / Start
Today
Ready to read
Corpora
  Public              Ben-Yehuda · Study Songs · future published corpora
  On this device       My Texts
  Your access          entitled protected corpora only
Mentor
```

Corpus trust labels are plain facts:

| Domain | RU | EN | HE |
|---|---|---|---|
| Public | Открытый корпус | Public corpus | קורפוס פתוח |
| Local private | На этом устройстве | On this device | במכשיר הזה |
| Restricted | Доступ для участников | Members only | לחברי הקבוצה בלבד |
| Publisher draft | Черновик · виден только редакторам | Draft · publishers only | טיוטה · לעורכים בלבד |

Rules:

- anonymous public entry never opens a registration wall;
- an account prompt appears only after a cloud-only action;
- auth preserves and returns to the requested corpus/work deep link;
- learner cards never expose edition IDs, rights queues or publisher controls;
- an entitled protected corpus remains a separate domain, not a public corpus with
  a hidden switch.

## Contextual account journey

```text
Requested cloud capability
  -> explain the benefit in this context
  -> Continue on this device remains available where truthful
  -> Sign in / create account
  -> local profile check
       clean       -> connect
       mismatch    -> dry-run merge / keep separate / cancel
  -> ask separately for sync
  -> return to original action
```

Candidate sign-in providers remain Telegram login plus email magic link fallback.
Provider choice, recovery and account deletion require their own implementation
threat model; P0 does not select or implement them.

## Studio publisher entrance

Card and multi-select use the same verb: **Add to corpus**.

```text
Selected: השיעור שלי

Add to corpus
  [ Study Songs · draft ]
  [ New public corpus ]

Publishing creates a separate checked copy.
Your text remains in My Texts.
```

After a successful published read-back, an optional separate action may say
**Archive the original in My Texts**. It is never checked by default and never part
of the publish transaction.

## Publication Center information architecture

```text
+ Publication Center ---------------------------------+
| Study Songs                       Draft · Edition 1  |
| Public URL · description · cover                    |
|                                                     |
| Publication spine                                  |
| ● Draft       77 selected                           |
| ● Checks      77 rights reviews · audio unverified  |
| ○ Preview     available after blocking checks       |
| ○ Published   no edition yet                        |
|                                                     |
| [Issues] [All items] [Order]                        |
| 01  שיר...    Text: review   Audio: review           |
| 02  שיר...    Text: cleared  Audio: stream only      |
|                                                     |
| [Anonymous preview]              [Publish edition]  |
+-----------------------------------------------------+
```

Mobile 380 px:

```text
Study Songs
Draft · Edition 1

Checks  77 issues                [Review]

Issues
01 שיר...
   Text · review
   Audio · review

[Anonymous preview]
[Publish edition]  (disabled · 77 issues)
```

The sticky primary action must remain above the safe area. Minimum touch target is
44 px. Status is text + icon/shape, never color alone. Hebrew titles use `dir=auto`
and their content direction; interface controls follow the active locale.

### Create corpus

The first step is deliberately short:

- name (required);
- short description;
- visibility: Public or Restricted;
- default rights policy: always `Review each item` for imported/user material;
- create draft.

Slug is proposed from the name but shown/editable before first publication. Changing
it after publication creates a redirect decision, not silent link breakage.

### Add items

- default operation: publish a copy;
- source snapshot and hash are visible in details;
- duplicate source/hash gets a merge/keep-both decision;
- source changed after copy becomes `Source updated` warning; public draft does not
  silently mutate;
- order supports pointer, keyboard controls and exact position input;
- bulk actions never hide per-item failures: completed/failed counts and reasons are
  retained.

### Checks

Blocking checks:

- content exists and reads back by hash;
- source/provenance is recorded;
- text permission is cleared for public read;
- every included recording separately permits public stream;
- every downloadable recording separately permits package distribution;
- expected/included/missing audio counts are exact;
- no progress, notes, `review_log`, keys, Mentor memory, Telegram identity or local
  filesystem paths exist in the edition;
- anonymous preview can read the exact candidate manifest.

### Publish confirmation

```text
Publish edition 1?

77 works · 3,106 rows
Public reading: 77 cleared
Recorded audio: 77 stream-cleared
Package download: 51 allowed · 26 excluded

Publishing makes these materials available at a public URL.
Previously downloaded copies cannot be recalled.

[Cancel] [Publish edition 1]
```

Canonical publish success and optional cache warm-up are separate receipts. Once the
edition and pointer are committed and read back, a cache warning must not ask the
owner to publish again.

## Send or save

One interaction shell chooses a truthful payload by domain:

| Domain | Primary | Secondary |
|---|---|---|
| Public work/corpus | Share public link | copy link; ZIP only when permitted |
| My Texts | Share learning ZIP | save ZIP; JSON in Advanced |
| Protected corpus | Share protected link | explain recipient access requirement |
| Publisher draft | no public share | owner-only preview link with expiry |

```text
Send or save

Learning ZIP · 84 MB
36 rows · 34 audio files included · 2 missing

The package is partial. It will not be labelled “with all audio”.

[Share ZIP]  [Save ZIP]
Advanced: lightweight JSON
```

The builder returns a `Blob`/`File` and a manifest; it never starts a download.
The UI calls `navigator.canShare({files:[file]})` under user activation and then
`navigator.share`. Unsupported browsers show Save/download. `archive_built`,
`share_sheet_opened` and `copy_saved` are different outcomes.

## Mentor connection

```text
Connect Mentor

✓ Account          Connected
2 Progress sync    Review and enable
3 Telegram         Available after sync
4 AI enhancement   Optional
```

Only the next unfinished step expands. Account, sync, Telegram delivery and AI
processing remain independent decisions.

Telegram:

- `NOT_LINKED`: consent copy and **Open @LinguistProMentorBot**;
- `PENDING`: **Confirm in Telegram**, reopen, new link, cancel; refresh on focus and
  a bounded visible-only poll;
- `LINKED`: masked identity, send test, notification settings, disconnect;
- `EXPIRED`: explain expiry and generate a new link;
- `ERROR`: stable error code translated to one recovery action.

The bot receives a signed one-time short-lived start token and displays a Confirm
button. Manual `/confirm` is not part of the target UX, but bilateral confirmation,
expiry, replay rejection and account-match checks remain mandatory.

## Copyright/takedown notice placement

“Every corpus” means consistent availability, not repeated legal text on every work
card.

1. Every corpus identity/header: compact disclosure using `summary`.
2. Every public/protected reader: **About this material** disclosure with full body
   and a `mailto:peter@kolosei.com` action.
3. My Texts corpus: `localPrivateNote` first, then the same project notice; this
   avoids implying that private local text is already published.
4. Publication Center preview and final confirmation: full notice plus per-item
   rights facts; the generic notice cannot turn a red rights check green.
5. Public share/landing metadata: a stable Copyright/contact link.

No banner blocks reading. No phrase says the notice, attribution, educational
purpose or takedown promise itself grants publication rights.

## Frozen RU/EN/HE copy

### Russian

**О проекте и авторских правах**

LinguistPro — некоммерческий образовательный проект. Материалы размещаются прежде
всего для изучения языков. Если вы считаете, что какой-либо материал нарушает
авторские права, напишите на peter@kolosei.com и укажите ссылку на материал и, по
возможности, сведения о правообладателе. Мы рассмотрим обращение и удалим материал,
нарушающий права, либо ограничим доступ к нему.

### English

**About this project and copyright**

LinguistPro is a non-commercial educational project. Materials are provided
primarily for language learning. If you believe that any material infringes
copyright, email peter@kolosei.com and include the material URL and, if possible,
information identifying the rightsholder. We will review the notice and remove
infringing material or restrict access to it.

### Hebrew

**על המיזם וזכויות יוצרים**

LinguistPro הוא מיזם חינוכי לא־מסחרי. החומרים מוצגים בראש ובראשונה לצורך לימוד
שפות. אם לדעתכם חומר כלשהו מפר זכויות יוצרים, אנא כתבו ל־peter@kolosei.com וציינו
את הקישור לחומר, ואם אפשר, פרטים המזהים את בעל הזכויות. אנו נבדוק את הפנייה ונסיר
חומר מפר או נגביל את הגישה אליו.

The exact runtime strings are machine-frozen in
`scripts/premium/fixtures/mass-access-p0/contract-v1.json` to prevent locale drift.
