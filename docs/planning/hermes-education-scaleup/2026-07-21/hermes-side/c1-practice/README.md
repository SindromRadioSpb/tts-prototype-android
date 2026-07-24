# C1-P — Hermes pronunciation practice loop

Date: 2026-07-24. Status: **ENGINEERING_COMPLETE / OWNER-LIVE pending**.

This slice integrates the unchanged C1 experimental scorer into ordinary Hermes learning sessions
used from Hermex iPhone and Hermes WebUI. It adds no LinguistPro API/schema/scope and never writes
learner state. Canon: `../../C1_HERMES_PRACTICE_LOOP_PLAN_2026_07_24.md`.

## Runtime topology

- Native Hermex press-and-hold voice notes and WebUI raw-audio attachments land below the WebUI
  state volume's session-scoped `attachments/` directory.
- Local stdio MCP `c1_pronunciation` runs as a WebUI child, so no listening port is introduced.
- The evaluation tool validates the exact session directory, decodes the attachment in memory, runs the
  pinned local ivrit.ai ASR and frozen MMS_FA/Phonikud scorer, then deletes the source attachment in
  `finally`.
- A separate discard-only tool deletes a current-session voice note that arrived before an exercise
  was selected; it performs no transcription or scoring.
- The skill enforces transcript confirmation before it reveals the C1 portion of the tool result.
- Models and the owner profile stay in gitignored `G:\HERMES_AGENT\models` / `private` paths.

## Installed paths

```text
/workspace/mcp-servers/c1-pronunciation/
  c1_practice_mcp.py
  c1_companion.py
  install_c1_practice_config.py
  frozen/benchmark_manifest.tsv
  frozen/prototype/c1_score.py
/workspace/models/c1-pronunciation/phonikud-1.0.int8.onnx
/workspace/models/c1-pronunciation/dictabert-tokenizer.json
/workspace/models/c1-pronunciation/torch-cache/hub/checkpoints/model.pt
/workspace/private/c1-practice/profile.json
/home/hermeswebui/.hermes/mcp-runtimes/c1-py312/
/home/hermeswebui/.hermes/skills/linguistpro-pronunciation-practice/SKILL.md
```

## Installation outline

1. Copy only the canonical tool/installer, current `c1_companion.py`, frozen scorer/manifest and
   skill to the paths above. Copy the already hash-verified model files and local owner profile;
   never copy owner audio or detailed benchmark rows. Pin the Dicta tokenizer as
   `dictabert-tokenizer.json` with SHA-256
   `8e62e3b46c924e14fc32c749ef8944c311411ce9c4dc01c5b606953a169140ba`; C1-P sets
   `HF_HUB_OFFLINE=1` and loads this file directly rather than using `Tokenizer.from_pretrained`.
2. Create the isolated Linux runtime in the shared Hermes volume:

```sh
uv venv --python 3.12 /home/hermeswebui/.hermes/mcp-runtimes/c1-py312
uv pip install --python /home/hermeswebui/.hermes/mcp-runtimes/c1-py312/bin/python \
  fastmcp==3.4.4 faster-whisper==1.2.1 ctranslate2==4.8.1 av==18.0.0 \
  numpy==2.2.6 phonikud==0.4.1 phonikud-onnx==1.0.6 praat-parselmouth==0.4.6 \
  scipy==1.15.3 soundfile==0.13.1
uv pip install --python /home/hermeswebui/.hermes/mcp-runtimes/c1-py312/bin/python \
  --index https://download.pytorch.org/whl/cpu torch==2.8.0 torchaudio==2.8.0
```

3. Run `install_c1_practice_config.py` with a runtime that has PyYAML. The installer also creates
   the dedicated sticky scratch directory needed by Hermes' remapped MCP uid; individual scratch
   files remain mode `0600` and are deleted in `finally`. Restart both Hermes containers and open
   a fresh ordinary chat because tool lists are cached.
4. Enable tailnet-only HTTPS without Funnel: `tailscale serve --bg 8787`. A browser on another
   tailnet device uses `https://<machine>.<tailnet>.ts.net/`. Chrome on the Hermes Windows host uses
   `http://localhost:8787`, which is a secure-context route and does not depend on MagicDNS. Hermex
   may keep its supported Tailscale HTTP URL because native microphone capture does not use browser
   secure-context rules.

## Verification and privacy audit

- Run the focused unit tests in the new runtime.
- Check exact model/profile hashes and the 25-item exercise count.
- Use an explicitly authorized fixture for the engineering call; verify its attachment is gone
  after success and after a forced error. The 2026-07-24 live E2E reused owner benchmark D01; it
  was not retained or copied into the runtime.
- Inspect the MCP log: request id/bytes/timing/status only; no path, transcript or detailed score.
- In a fresh ordinary Hermes chat, verify actual tool invocation and the transcript-confirmation
  state machine. Tool discovery alone is not acceptance.
- Owner-live needs one Hermex iPhone voice note and one secure-context WebUI raw-audio attempt,
  including transcript confirmation and the post-confirmation advisory response.

## Rollback

Run the installer with `--remove`, deactivate only the C1-P skill and restart both containers.
Optionally `tailscale serve reset` removes the HTTPS proxy. H2.5 ASR, H2.6 voice skill, C1-X
loopback page and all LinguistPro product paths remain unchanged.
