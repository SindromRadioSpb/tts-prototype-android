# Current capability and gap inventory

Date: 2026-08-26
Source commit: `e51e17ab8e88a378c221a9548a555539b6e18c2a`; branch `main`; dirty tree preserved
Production basis: `3.11.440`; anonymous recon only
Method: `CODE`, `LOCAL_TEST`, `PRODUCTION_ANONYMOUS`, predecessor `OWNER_LIVE_READ_ONLY` / `OWNER_REPORTED`, `INFERENCE`

## Capability map

| Capability | Evidence anchor | What is reusable | Gap / prohibition |
|---|---|---|---|
| MCP transport | `agent/access/mcpAdapter.js:12-14,50,64,78-95` | Fail-closed flags, bearer-only auth, rate/audit hooks, stateless request handling | Exact `2025-11-25`, tools only, SDK v1; no Resources and no modern 2026-07-28 route |
| Agent capability registry | `agent/access/capabilities.js:5-34` | One registry for scope/purpose/output cap | No generic publication scopes or tools |
| OAuth/consent | `agent/access/oauthContracts.js`, `consentCeremony.js` | PKCE/resource audience, live connection/scope checks, explicit consent copy | Scope lists and DB CHECKs require additive migration; old consent cannot silently widen |
| Legacy public search/read | `agent/access/capabilities.js:8,18`; `productionHandlers.js:363-435`; `contracts.js:254-278` | Bounded output/error patterns | Numeric Ben-Yehuda `work_id`, baked `text_key`, `public-domain` license constant; not generic publication identity |
| Public publication aggregate | `migrations/063_publication_domain.sql:91-219`; `db/publicationRepo.js:542-551,599-716` | Immutable editions/items/assets, hashes, pointer, read-back and public projections | Materialized permissions are only public read/stream/package; no agent-use fact for generic items/assets |
| Physics resource aggregate | `migrations/064_physics_task_resources.sql:18-75`; `db/physicsTaskResourceRepo.js:130-164,211-253` | Immutable PDF revision, task pin, hash/bytes/MIME, independent agent right | Physics-specific repo/routes; not registered with Agent Access |
| Public binary delivery | `server.js:4025-4097` | First-party exact-byte PDF, ETag, immutable cache, Range, nosniff | Anonymous URL cannot cryptographically distinguish browser from agent; official MCP must still obey `AGENT_READ` |
| Physics section UX | `physicsTaskResourceRepo.js:260-275`; `server.js:4066-4074` | Stable section/task metadata for agent discovery | Physics-only taxonomy; generic interface must treat section as optional corpus metadata |
| Study Songs | production publication evidence; `publicationRepo.js` | 77 immutable published works, text snapshots, 2,155 audio assets | Owner-attested public/stream/package rights do not imply agent text/audio rights |
| Group corpora | `migrations/056_group_song_corpus_p0.sql`; `db/groupCorpusRepo.js`; Agent Access `reading.group_corpus.*` | Object-level ACTIVE membership recheck and non-enumeration | Separate restricted authority; must not appear in public all-corpora tools |
| Personal texts | Agent Access personal scopes/grants | Per-object grant, revocation, bounded windows | Device-canonical private truth; must not be merged into publication APIs |
| Audit | Agent Access audit/usage ledger | Content-free purpose/scope/result aggregate | New tools need event names and output/rate budgets; never log titles, queries or bodies |

## Exact negative fact

There is no canonical all-corpora agent-resource domain today. Word matches such as “resource”, “corpus” or “read” do not prove one:

- the existing MCP public tools address only the legacy baked Ben-Yehuda corpus;
- the publication aggregate owns immutable public snapshots but has no Agent Access adapter;
- Physics owns its own task-resource rights and files;
- group and personal corpora already have intentionally separate authority models.

Therefore neither widening `get_reading_content` nor querying publication tables directly inside an MCP handler is safe. The reusable seam is the Agent Access service layer calling read-only domain projections.

## Current production-anonymous snapshot

`GET /api/public-corpora` on 2026-08-26 returned:

| Corpus | Edition | Items | Assets | Missing | Manifest |
|---|---:|---:|---:|---:|---|
| `study-songs` | 2 | 77 | 2,155 | 0 | `6e01c015e9ef2e0ccc05fc319027ca8e327df16b5ace4c1a9287272c83648d0f` |
| `physics-year1-problems` | 2 | 74 | 394 | 0 | `6926876557b93e984180a27a6cda01076b64a4649ff7287d4edd7ab35cbdde1b` |

Physics work read-back confirmed edition ID `ed_c345975244ff7bd33d86fcb9`. These are public metadata facts, not proof of MCP rights or owner-session behavior.

## Test evidence and blocker

| Check | Result | Meaning |
|---|---|---|
| `node --test tests/publicationDomain.test.js tests/physicsTaskResources.test.js tests/publicCorpusAdapter.test.js` | PASS 27/27 | Publication immutability and Physics resource boundaries are green locally |
| `npm run smoke:agent-access:production-handlers` | PASS, 61 checks, zero table/network/provider/LLM deltas | Current Agent Access handler boundary is read-safe in fixture execution |
| `npm run smoke:agent-access:mcp` | FAIL at `agent-access-mcp-smoke.mjs:181` | Existing MCP baseline cannot be claimed green |

Root-cause evidence for the MCP smoke: fixture lines 45 and 48 still produce `aa.text_coverage.1.0.0` / `aa.group_text_coverage.1.0.0`, while `contracts.js:439-479,511-519`, `mcpSchemas.js:327-350` and `productionHandlers.js:608-614` require v2. The adapter correctly returns a typed `UNKNOWN_FIELD`/error result. Fixing this test is a required pre-implementation gate but is outside research-only authority.

## Reuse decision

Reuse:

- Agent Access OAuth, consent, capability registry, schema validation, audit and rate infrastructure;
- publication IDs/hashes and public read projections;
- Physics task-resource repo with `agent:true` filtering;
- direct immutable HTTP asset delivery.

Do not reuse as a shortcut:

- legacy Ben-Yehuda tool names/scopes for publication corpora;
- group membership as public-agent authority;
- personal grants, notes, reading lists or learner state;
- public availability as automatic `AGENT_READ`;
- MCP handlers as SQL/file readers or rights writers.
