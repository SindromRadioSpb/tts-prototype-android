# H2.5 — local ivrit.ai ASR MCP

Дата: 2026-07-24.

H2.5 installs one local, single-concurrency stdio MCP tool for Hebrew transcription. It changes
no LinguistPro code or production service. Every result is explicitly an ASR hypothesis, raw audio
is accepted only from `voice-inbox` and is deleted only after a complete successful result.

## Measured host and topology

- Host: AMD Ryzen 5 5600G, 6 physical / 12 logical cores, 31.37 GB RAM.
- G drive at preflight: 6,670.87 GB free of 13,974.98 GB.
- Hermes volume at preflight: 838 GB free.
- `hermes-webui` owns local MCP child processes and already mounts
  `G:\HERMES_AGENT` as `/workspace`; `hermes-agent` does not mount G.
- Therefore the stdio wrapper/model/inbox live under `/workspace`, while the isolated Python
  runtime lives in the shared Hermes volume. This is the same live-process distinction recorded
  for H1.5, without adding a port or network service.

Operational locations:

- wrapper: `G:\HERMES_AGENT\mcp-servers\ivrit-asr\ivrit_asr_mcp.py`;
- inbox: `G:\HERMES_AGENT\voice-inbox\`;
- model: `G:\HERMES_AGENT\models\ivrit-ai-whisper-large-v3-turbo-ct2\`;
- runtime: `/home/hermeswebui/.hermes/mcp-runtimes/asr-py312` in the shared volume.

The canonical and installed wrapper SHA-256 are both
`bfd5c79666f95599eb1269391cf9e545477e3f128c2869538b289e8baee1e253`.

## Pinned runtime

- Python 3.12.13 isolated venv, 519M;
- `faster-whisper==1.2.1`;
- `fastmcp==3.4.4`;
- `ctranslate2==4.8.1`;
- `av==18.0.0`;
- `onnxruntime==1.27.0`.

Model source, exact revision, installed sizes and per-file hashes are in
`MODELS_MANIFEST.md`. CPU inference is fixed to CT2 `int8`, six threads and one worker.
`supports_parallel_tool_calls:false` plus the wrapper lock caps transcription concurrency at one.

## Contract and safety

`transcribe_audio{file_path, language:"he"}` returns schema `asr.transcribe.1.0.0`, transcript,
timestamped segments, `avg_logprob`, deterministic `confidence`, exact model revision and
`confidence_note:"ASR_HYPOTHESIS_NOT_GROUND_TRUTH"`.

- An absolute or relative path must resolve under `/workspace/voice-inbox`; symlinks are rejected.
  Audio is decoded from an `O_NOFOLLOW` file descriptor and the device/inode/size/timestamps are
  rechecked before unlink, closing validation/open/delete races. A swap returns `ASR_INPUT_CHANGED`
  and preserves the replacement.
- Empty, corrupt, missing/outside files and unsupported language fail with typed errors.
- Failed input remains in place for owner diagnosis; successful input is unlinked before success is
  returned. A delete failure changes the call to `ASR_RAW_DELETE_FAILED`.
- `avg_logprob <= -0.15` is marked `confidence:"LOW"`, calibrated against the pinned clean/noisy
  fixtures. This is uncertainty display, never pronunciation scoring.
- The model is local-only. No cloud STT fallback exists.
- Wrapper logs contain request id, byte count, segment count, elapsed time, status and exception
  type only; they contain no filename, path or transcript content.

## Installation

1. Create the isolated venv in the shared volume and install the pinned packages above.
2. Download exactly the manifest revision/files into the model directory and verify all hashes.
3. Copy the canonical wrapper, tests and config installer into
   `G:\HERMES_AGENT\mcp-servers\ivrit-asr\`.
4. Run the installer with the ASR venv (the WebUI system Python has no PyYAML):

```sh
/home/hermeswebui/.hermes/mcp-runtimes/asr-py312/bin/python \
  /workspace/mcp-servers/ivrit-asr/install_ivrit_asr_config.py
```

5. Restart both containers, then open a new WebUI session because MCP advertises
   `listChanged:false`:

```powershell
docker compose --env-file .hermex.env -f docker-compose.hermex.yml restart hermes-agent
docker compose --env-file .hermex.env -f docker-compose.hermex.yml restart hermes-webui
```

Config before SHA-256: `bf0c8ab8d1c635a9dc1892c393d74506d223130c2227bb18c26c2c8e142b8967`.
Config after SHA-256: `000fdef0a55255d6c569e74700ac5f3e659c1c363f1a0089576014b96595337d`.
Emergency backup: `config.yaml.pre-h2.5-20260723T230046Z.bak` in the shared Hermes volume.
The installer is idempotent and mutates only `mcp_servers.ivrit_asr`.

## Benchmark and acceptance

The reproducible engineering fixtures use the local Microsoft Asaf `he-IL` voice. They are not
represented as human speech; the mandatory owner-live remains one real owner recording.

| Fixture | Duration | Elapsed | RTF | Result |
|---|---:|---:|---:|---|
| clean | 30.0s | 49.065s | 1.635 | 10 segments; min logprob -0.085171 |
| normal | 120.0s | 167.213s | 1.393 | 41 segments; min logprob -0.635177 |
| noisy, final policy | 30.0s | 49.100s | 1.637 | 10/10 segments marked LOW at -0.154207 |

Cold start on 6.113s audio took 17.270s including model load. Warm inference is about 0.61–0.72×
real-time throughput, expressed in the conventional elapsed/audio RTF as 1.39–1.64. No GPU was
used. Full evidence is in `ACCEPTANCE_TRANSCRIPTS.md`.

`health-check.sh` now verifies WebUI localhost/Tailscale health plus exactly one enabled ASR tool,
runtime imports, inbox and nonempty model. It does not load the model or inspect content.

## Rollback

1. Remove only the mapping and restart both containers:

```sh
/home/hermeswebui/.hermes/mcp-runtimes/asr-py312/bin/python \
  /workspace/mcp-servers/ivrit-asr/install_ivrit_asr_config.py --remove
```

2. Verify `ivrit_asr` is absent and all pre-existing MCP servers remain enabled.
3. Only within the authorized H2.5 scope, the exact wrapper, runtime and model directories may then
   be removed. Do not delete `voice-inbox`: a failed/unprocessed owner recording may still be there.
4. Remove only the H2.5 block from the host health check. Never restore the whole config backup over
   newer config changes.

## Current completion boundary

Engineering smoke is 5/5 and local health is PASS. Fresh WebUI session `b0d167bc15b5` first reached
the ordinary chat path but Gemini returned `HTTP 429 RESOURCE_EXHAUSTED`; per policy it was not
retried immediately. After the provider backoff, one fresh session `41fb9d1103aa` succeeded and
returned exactly `mcp__ivrit_asr__transcribe_audio`. H2.5 remains `ENGINEERING_COMPLETE`, not
`CLOSED`, until that tool processes one real owner recording and the owner records readability.
