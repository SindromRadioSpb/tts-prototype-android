# H2.7 — live Hermes policy, skill and memory audit

Captured on 2026-07-24 from both running containers, then updated under explicit owner approval.
No secret values were read or printed. The three original files remain recoverable under
`~/.hermes/backups/h2-profile-20260724-043956/` in the shared Hermes volume.

## Runtime surface

- `hermes-agent` and `hermes-webui` are running; WebUI is healthy.
- LinguistPro MCP is enabled with 25 selected tools, 23 OAuth scopes, callback port 8765 and
  `supports_parallel_tool_calls:false`.
- The separate local `ivrit_asr` MCP is enabled with exactly `transcribe_audio`.
- Active model config is `gemini / gemini-3.5-flash-lite`.

The persistent files are visible as `/home/hermes/.hermes/...` in `hermes-agent` and as
`/home/hermeswebui/.hermes/...` in `hermes-webui`. Corresponding `MEMORY.md`, `USER.md` and
`SOUL.md` hashes are identical across the two mounts:

| File | SHA-256 |
|---|---|
| `memories/MEMORY.md` | `4d9d201a1c78d7cf73b3b1227f686cf059fa4b51732e63d3d377396728cbda3b` |
| `memories/USER.md` | `35621a5f9ba634e332f69c7086fd979a74423de4b0c445ef6d64643eca2d7cb2` |
| `SOUL.md` | `5d8aa240ede51a510b86f276c255a853ea15ab6a90ba399bff871865cb398052` |

## Installed LinguistPro skills

| Skill | Role | H1/H2 status |
|---|---|---|
| `linguistpro-trainer-policy` | Global W0, grounding, ASR-confirmation and typed-denial policy | installed |
| `linguistpro-conversation-session` | H1.1 conversation state machine | installed |
| `linguistpro-writing-wcf` | H1.2 focused written-correction loop | installed |
| `linguistpro-weekly-srl` | H1.3 weekly reflection/proposal loop | installed; intentionally still uses H1 note proposal rather than H2 goal-store |
| `linguistpro-sefaria-policy` | H1.4 bounded external-source policy | installed |
| `linguistpro-youtube-transcript-policy` | H1.5 bounded transcript policy | installed |
| `linguistpro-voice-session` | H2.5/H2.6 local-ASR preview/confirm → H1.1 conversation → analysis/retry | installed; canonical/live SHA from H2.6 evidence matches |
| `linguistpro-mcp` | Current 25-tool live policy/cheat sheet, content-integrity and fresh-chat verification rules | installed under category `productivity` |
| `linguistpro-mcp-recovery` | OAuth/tool-selection/live-grant recovery | installed |

The global `SOUL.md` additionally contains mandatory H2.1 morphology, H2.2 coverage, restricted
group-corpus and H2.3 proposal policies. H2.4 is deliberately not a new MCP skill: Nakdan is a
first-party on-demand preview/Library service, while exact-body/no-silent-transformation behavior
already lives in the H2.3 proposal policy. H2.5/H2.6 behavior is correctly isolated in the
triggered `linguistpro-voice-session` skill rather than injected into every text-only turn.

## Freshness verdict and applied update

### `USER.md`: UPDATED

The durable owner profile remains free of mutable queue/progress counts. It now records only the
stable voice preference: ASR text must be confirmed before analysis, and ASR differences are never
learner errors. It explicitly forbids storing transcripts, filenames or session metrics there.

### `SOUL.md`: UPDATED

It retains the global H2 rules and now adds a mandatory routing paragraph: every audio/voice request
must load `linguistpro-voice-session`, use only the real local ASR tool and never bypass it through
shell/Python/ffmpeg/cloud STT. No H3 behavior was added.

### `MEMORY.md`: UPDATED

Observed discrepancies:

1. It does not record the current 25-tool / 23-scope LinguistPro surface.
2. It does not record the separate local `ivrit_asr` tool or the installed H2.6 voice skill.
3. It does not contain the repeatedly confirmed cache-recovery rule: after OAuth/tool-surface
   changes restart both `hermes-agent` and `hermes-webui`, then verify in a completely new ordinary
   chat; SDK/CLI discovery alone is insufficient.
4. It does not summarize the H2 W1, goal-store, morphology, coverage and group-corpus boundaries.

The owner explicitly authorized the bounded live-profile update. The first post-restart manifest
check corrected an incomplete shallow-directory audit: `linguistpro-mcp` does exist under
`skills/productivity/linguistpro-mcp/` and is enabled. The final deployed memory preserves both
`linguistpro-mcp` and `linguistpro-mcp-recovery`, and adds the 25/23 surface, H2 boundaries, local
ASR/voice protocol and the two-container-restart plus completely-new-chat recovery rule.

Final shared-volume hashes after the correction:

| File | SHA-256 |
|---|---|
| `memories/MEMORY.md` | `8dd30476a7504933c6797d46c51ebac34f27963669c081a4c03b67c1fc0eccc0` |
| `memories/USER.md` | `a9dd7c1ddb71e5e2207d20e56b3af0736a999ddf7e4a5a34682d8f269d5f8ad8` |
| `SOUL.md` | `09b8073efcda61b10d23f69fa0dcf0abb4e3eed0f8136fb2830737e82d0067c6` |

## Restart, manifest and live acceptance

- Both `hermes-agent` and `hermes-webui` were restarted after the final correction. Final
  `StartedAt`: `2026-07-24T01:51:57Z` and `2026-07-24T01:51:59Z` respectively.
- WebUI localhost and Tailscale health passed. The H2.5 health probe found one selected ASR tool,
  wrapper, runtime, pinned model and inbox ready.
- `hermes skills list`: 85 enabled total, 16 local; `linguistpro-mcp`, recovery, trainer,
  conversation and voice skills are enabled.
- `hermes prompt-size`: updated memory and user-profile blocks loaded; skills index 9,839 bytes;
  27 tool schemas in the fresh prompt.
- LinguistPro live discovery returned 25 tools. Read-only live calls passed for morphology, public
  coverage, all three group-corpus tools and current goal. The three proposal tools were called with
  deliberately invalid empty input and each returned non-retryable `ARGUMENT_SCHEMA_INVALID` with
  no `proposal_id`; no new proposal was created.
- The WebUI-owned ASR stdio server returned exactly one `transcribe_audio` tool. A missing-file call
  returned a typed tool error and created no raw file.
- Completely new ordinary WebUI session `69d469542242` called `get_word_morphology` and
  `get_current_goal`, both `ok:true`, reported 25 tools and reproduced the updated memory rule to
  restart both services and open a new chat after OAuth/tool-surface changes. It disclosed only
  `goal_present:true`, not the goal body.

## Incidents during verification

1. A shallow `find -maxdepth 2` missed category-nested `linguistpro-mcp`; the first audit statement
   was corrected immediately after the authoritative manifest listed the enabled skill.
2. Running `hermes mcp test` from `hermes-agent` is invalid for WebUI-owned local stdio servers
   because `/workspace` is deliberately mounted only in `hermes-webui`. The correct WebUI runtime
   probe passed.
3. A concurrent CLI MCP test rotated token state while the gateway was live, producing one refresh
   400 in the first attempted fresh chat. All CLI tests were stopped, both containers were restarted
   again, and the final new-chat acceptance passed. This reinforces the newly stored recovery rule.
