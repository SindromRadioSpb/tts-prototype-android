# H2.7 — MCP schema snapshot

Captured: 2026-07-24 (Asia/Jerusalem)

Pre-H2 source: `ee4a2cc2a00ffac4d35a6fce0c671526b0eeea0d`

Current schema source: `f61c59b3ae6b7bd878e66149a795bfd8a2e636e7`

Baseline: 16 LinguistPro tools

Current: 25 LinguistPro tools

Verdict: **PASS — nine additions, zero removals, zero mutations of the original 16 input/output schemas.**

The canonical baseline is `../h2.1/schema-before-sha256.json`. The current hashes were computed
from `agent/access/mcpSchemas` with the same operation as the H2.1 gate:

```js
crypto.createHash("sha256").update(JSON.stringify(schema)).digest("hex")
```

`npm run smoke:agent-word-morphology` rechecked every baseline pair against the live source and
returned `PASS 72 checks; ... existing schema hashes unchanged`. `npm run smoke:agent-access:mcp`
independently returned `tools:25`, `checks:65`, protocol `2025-11-25`.

## Additive diff

| Added tool | Slice |
|---|---|
| `get_word_morphology` | H2.1 |
| `get_text_coverage` | H2.2 |
| `search_group_reading_catalog` | H2.G1 |
| `get_group_reading_content` | H2.G1 |
| `get_group_text_coverage` | H2.G1 |
| `propose_import_text` | H2.3 |
| `propose_track_word` | H2.3 |
| `propose_goal` | H2.3 |
| `get_current_goal` | H2.3 |

H2.4 adds no MCP tool. H2.5 is a separate local `ivrit_asr` server with exactly one
`transcribe_audio` tool; it is not part of the LinguistPro 16→25 comparison. H2.6 is a skill-only
protocol and adds no tool.

## Frozen baseline hashes

Current input/output hashes equal the corresponding baseline values in every row.

| Original tool | Input SHA-256 | Output SHA-256 | Current comparison |
|---|---|---|---|
| `get_learning_brief` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `d3c22d6c7444b8cf72fbc46d7da3f13333bbad690bf74944383d5dcc12c7e9be` | equal |
| `get_review_summary` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `ef8170975cfdb23399555f8cd5d43e9a43d9869365fafbafc548e986b846364c` | equal |
| `search_public_reading_catalog` | `76679a3e75057d993fd47befd17906d0b5880c233da8f4842bed1bd81c3c4603` | `eeb8146bacccdb21a5fa10e4daf78b486be4c324cac73ff7bcf71c272d2aef74` | equal |
| `get_recent_explanation_metadata` | `195ceba70514b5ac5954813793cbe420b80814ebd33cae8a19d6dea4fac68d5f` | `b55f31909826190dff8a31d45baf31e24ab55b3f38d36a9d130ecf57af880b65` | equal |
| `get_agent_connection` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `75cae286db803c9e3808ee6c627c45642aa441b20d593ff1949e5e6d6dfbe6a9` | equal |
| `get_access_window` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `7f81e975c3727b69971763004b1b181d7d25a3539b9f46f8aac7ab50c98e8c9a` | equal |
| `get_due_review_items` | `34aaa36cc7ab117135210581e83dcbd33579191adb6aefc8546de96d5c5f7ae2` | `23a1ac464b3fbaf0a5e5dfc4818f946679886c7201dcd3e2846b05c0a71d866b` | equal |
| `get_learner_profile` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `645d5edcd5796a37bf0b3ca13fb5f5fc20b4122dea791282b142d43287c52461` | equal |
| `get_explanation_body` | `0568f9bc3935fea461c1d93bc6a186170a84185c5d754c0c0049c7cb34f270fc` | `ecc30e77a79a3afceb4fd8144c2abe8db410d0fcc9025548a11820858af994f6` | equal |
| `get_reading_content` | `d08478f5912a48821dc3a233b57f0c6d518e8137e83a67701ae55854c55273f9` | `72305d245638c339b57905e8fcb8683a62e5f913bce31d4ee3f7461ab6d1addc` | equal |
| `create_reading_handoff` | `4ccf8b20c7c9ca7cddfbafe7722e167b8eeb9ea46d12c23a931038850335ed95` | `6017fd9ea4d26c106e92273c15f10939b1a9a7694daa7d895fa37757c9852197` | equal |
| `propose_action` | `6edaebd1dcae3fdabcd7e26a98f48402679309e2e8951a4178bce3deb76f6825` | `87b4f72cd1a7add00015fd8d39353b6a996a1a6971e7ee4bf595e2fc511f55a9` | equal |
| `get_progress_delta` | `af32c4d5e05f62ec2d5f943fd4e87c4f794e243cf9c238d27b66f3c6cbd3f44a` | `ae69da3a26ec01c79c029b11d4269aa7d648be143f3150d930a561a598655ca4` | equal |
| `create_review_handoff` | `7b1a95d4626922e791a7e0d09fe6f478a123b3f291176945d4dbf64646fd1cfd` | `be08cb3de1dfe3cac1326ef252e69edd00d82171ebcbde580ca06ede61a67cfb` | equal |
| `list_personal_texts` | `34aaa36cc7ab117135210581e83dcbd33579191adb6aefc8546de96d5c5f7ae2` | `f6f97b0c91f81a3615cfd84de5ba10d0387cd96d58cf0487af8fcf7c64f50371` | equal |
| `get_personal_text_content` | `e9067d2a5841c13060d3ef17ac6a8d49a5a287b7e62dafb422b73aab7eb78cd1` | `89251a1bde1b1ce615a210e17651e42690788d815dd7cbcecae7cecae74903da` | equal |

## Live discovery

On 2026-07-24, `hermes mcp test linguistpro` connected to the production endpoint and discovered
25 selected tools. `hermes mcp list` also showed the separate enabled `ivrit_asr` mapping with one
selected tool. The host health script reported localhost and Tailscale WebUI healthy and the pinned
ASR runtime/model/inbox ready.
