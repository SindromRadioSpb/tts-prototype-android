# H2.7 — live Hermes policy, skill and memory audit

Captured read-only on 2026-07-24 from both running containers. No secret values were read or
printed, and no live Hermes profile file was changed by this audit.

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
| `linguistpro-mcp-recovery` | OAuth/tool-selection/live-grant recovery | installed |

The global `SOUL.md` additionally contains mandatory H2.1 morphology, H2.2 coverage, restricted
group-corpus and H2.3 proposal policies. H2.4 is deliberately not a new MCP skill: Nakdan is a
first-party on-demand preview/Library service, while exact-body/no-silent-transformation behavior
already lives in the H2.3 proposal policy. H2.5/H2.6 behavior is correctly isolated in the
triggered `linguistpro-voice-session` skill rather than injected into every text-only turn.

## Freshness verdict

### `USER.md`: CURRENT, one optional durable clarification

The durable owner profile is accurate and correctly excludes mutable queue/progress counts. A
future edit may add only the stable preference that ASR text must be confirmed before analysis and
ASR differences are never learner errors. It must not store transcripts or session metrics.

### `SOUL.md`: FUNCTIONALLY CURRENT FOR H2

It contains the global rules that must apply to every relevant turn and delegates the detailed
voice state machine to an installed triggered skill. No H3 behavior should be added before a
specific charter receives Д6-go. An optional hardening edit could add one routing sentence requiring
`linguistpro-voice-session` for any audio/voice request, but the installed skill already declares
mandatory triggers for those requests.

### `MEMORY.md`: STALE; UPDATE REQUIRED

Observed discrepancies:

1. It says separate skills `linguistpro-mcp` and `linguistpro-mcp-recovery` are installed, but the
   live skill directory contains only `linguistpro-mcp-recovery`; the MCP connection itself is live.
2. It does not record the current 25-tool / 23-scope LinguistPro surface.
3. It does not record the separate local `ivrit_asr` tool or the installed H2.6 voice skill.
4. It does not contain the repeatedly confirmed cache-recovery rule: after OAuth/tool-surface
   changes restart both `hermes-agent` and `hermes-webui`, then verify in a completely new ordinary
   chat; SDK/CLI discovery alone is insufficient.
5. It does not summarize the H2 W1, goal-store, morphology, coverage and group-corpus boundaries.

Because the owner asked whether the files are current rather than explicitly authorizing a live
profile mutation, this audit records the required patch without silently editing the running
agent's durable identity/memory. Applying that bounded live-memory patch is a separate explicit
owner-authorized action and should be followed by a two-container restart plus a fresh-chat check.
