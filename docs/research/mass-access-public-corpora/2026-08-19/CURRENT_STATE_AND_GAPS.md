# Current state and gaps

Date: 2026-08-19

Evidence basis: repository at `e80f2aef74f7c070101e55bd421051320d25f4be`
and production `3.11.404`, inspected read-only.

## 1. What already works

### Reading Room and corpus UX

- The closed Library/corpus program already owns the mature global journey:
  Library owns discovery and continuity; a corpus owns its identity, local hero,
  catalog and management.
- Ben-Yehuda, My Texts and Study Songs already share typed search/filter/sort and
  word-profile-fit concepts without pretending their source truth is identical.
- Study Songs has a mature 380 px learner surface, catalog, audio indicators,
  profile-fit projection and owner management. It is not a prototype-quality shell.
- Reader capabilities already include Hebrew reading, row audio/TTS, morphology,
  translation, progress and retention integrations, subject to source-specific data.

### Protected Study Songs corpus

- Migration `056_group_song_corpus_p0.sql` deliberately permits only
  `visibility='GROUP_RESTRICTED'`.
- Corpus access requires an authenticated user with `ACTIVE` group membership.
- The current corpus was imported under
  `EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED`; work rows carry
  `rights_status='REVIEW_REQUIRED'` until separately cleared.
- Current research records 77 works, 3,106 rows and 2,155 unique MP3 assets.
- The owner has now authorized public product use. The data/rights state has not
  consequently changed and no public endpoint has been opened.

### Studio portable package

- The Studio Library v3 text card has one dialog with **Share**, **Download JSON**
  and **Download ZIP with audio** actions.
- The ZIP builder already produces a portable learning package and augments it with
  available audio.
- A separate media-store code path already demonstrates standards-based file share
  through `navigator.canShare({files})` and `navigator.share({files})`.

### Mentor and Telegram

- Telegram pairing is already inside the Reading Room Mentor tab.
- It has honest `not linked`, `pending` and `linked` states, explicit consent,
  pair/unlink APIs, a masked linked identity and a bot deep link.
- Existing two-sided confirmation protects against linking the wrong Telegram user.

## 2. Confirmed gaps

### No public-corpus publication domain

The runtime has a static registry for public/predefined corpora and a separate
server-backed protected group-corpus model. There is no general owner workflow or
server contract for:

- creating a public corpus;
- drafting, previewing and publishing a corpus;
- copying a My Texts material into a public edition;
- ordering/removing works and creating a new revision;
- representing public visibility independently of group membership;
- recording per-work text/audio license, attribution and download policy;
- unpublishing or rolling back an edition.

My Texts lives in browser-local OPFS/SQLite. The server cannot safely treat a local
folder as a live public source, and doing so would couple private editing to public
availability.

### Mass identity is not available

- `/api/auth/bootstrap-login` is owner-secret bootstrap, not registration.
- Other cloud users currently enter through one-time group `JOIN` or `LOGIN` links.
- A browser-local profile is protected from being rebound to another cloud user,
  which correctly prevents silent OPFS identity mixing but leaves no guided account
  claim/switch/merge journey.
- Anonymous Reading Room use works for public/local content, but cloud sync, Mentor
  and Telegram need a clear contextual account path.

### Studio Share does not share the promised ZIP

- `v3TextCardShareNative()` constructs and shares a lightweight JSON file.
- `v3TextCardShareDownloadZip()` constructs the richer ZIP but forces a browser
  download.
- Consequently the primary **Share** action does not send the package users most
  naturally expect after asking to share a text with its audio.
- There is no automated acceptance test for native file-share of the ZIP.

### Room share semantics differ by trust domain

The existing protected Study Songs share action sends a deep link and correctly
warns that access is restricted. A public work can use a stable public link. A
private My Texts item has no recipient-readable server URL and needs a portable
package. One universal payload would therefore be misleading.

### Telegram connection is technically present but not a complete onboarding path

- A guest who reaches Mentor is sent toward the separate cloud/header login affordance.
- Pending copy tells the learner to type `/confirm`; the return/focus journey does
  not present a self-completing status step.
- Pairing, cloud identity, sync, Telegram delivery consent and optional BYOK are
  visible as separate technical controls rather than one progressive capability
  journey.

## 3. Production observations

At `2026-08-19T11:53:22Z`:

```text
GET /healthz                                      200
db.ready                                          true
migrations.ready                                  true
disk_pct_used                                     72
disk_warn                                         false
GET /library.html                                 200 · footer v3.11.404
GET /api/group-corpora                            401 UNAUTHENTICATED
GET /api/group-corpora/study-songs/works          401 UNAUTHENTICATED
```

This confirms the presently served protected boundary; it does not prove any
owner-authenticated flow or future scale capacity.

## 4. Rights and distribution gap

Study Songs contains at least three independently relevant rights layers:

1. words/composition or other source text;
2. sound recording/performance;
3. LinguistPro's learning annotations, translations and packaging.

Public reading, public streaming and downloadable ZIP redistribution are distinct
product permissions. The publication model must record them separately. The
Israeli Copyright Act materials published through WIPO identify literary and
musical works and sound recordings as protected subject matter and include
reproduction/making-available rights. This packet is product/engineering research,
not legal advice; ambiguous rows require rights-owner or qualified legal review.

## 5. External patterns that survive product scrutiny

- [Web Share API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API):
  use an HTTPS, user-activated share call; test file support with `canShare`; provide
  a deterministic fallback because availability varies.
- [Telegram bot features](https://core.telegram.org/bots/features) and
  [Mini Apps](https://core.telegram.org/bots/webapps): a signed, short-lived start
  parameter can carry the pairing handoff; the bot can render an explicit confirm
  action without requiring the user to memorize a command.
- [WordPress post status](https://wordpress.org/documentation/article/post-status/):
  Draft/Published separation and preview are familiar authoring semantics.
- [YouTube playlist management](https://support.google.com/youtube/answer/10232933?hl=en):
  title, description, visibility, adding and ordering items form a familiar compact
  collection-authoring pattern.
- [WIPO Lex — Israel Copyright Act](https://wipolex-res.wipo.int/edocs/lexdocs/laws/en/il/il027en.pdf):
  public publication and redistribution need explicit rights evidence, especially
  for songs and recordings.
