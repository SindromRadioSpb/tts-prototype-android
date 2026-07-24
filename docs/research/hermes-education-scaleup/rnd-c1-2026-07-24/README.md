# C1 Hebrew pronunciation scoring R&D

Статус: **IN PROGRESS / UNDERPOWERED**. Это одноразовый локальный research-прототип, не
production-функция LinguistPro.

Главные файлы:

- `PREREGISTRATION.md` — протокол и неизменяемые пороги до owner benchmark;
- `benchmark_manifest.tsv` — 50 normal + 25 intentionally distorted prompts;
- `prototype/c1_score.py` — локальный Phonikud + MMS_FA scorer;
- `REPORT.md` — evidence-отчёт и текущий вердикт;
- `OWNER_RECORDING_RUNBOOK.md` — единственное действие, которое должен выполнить владелец.

Raw owner audio, transcripts, model weights, virtual environments and detailed per-recording
scores are deliberately excluded from git. Keep them under `.tmp/h3-c1-owner-audio/` and
`.tmp/h3-c1-results/`. The tracked report receives aggregates only.

Source commit at preregistration: `01e2334` (`main`, 2026-07-24).

## Runtime

The tested scratch runtime uses CPython 3.12.13 and these exact packages:

```text
phonikud==0.4.1
phonikud-onnx==1.0.6
torch==2.8.0+cpu
torchaudio==2.8.0+cpu
numpy==2.2.6
scipy==1.15.3
soundfile==0.13.1
praat-parselmouth==0.4.6
```

External local-only model artifacts:

- Phonikud ONNX `phonikud-1.0.int8.onnx`, 307,844,158 bytes,
  SHA-256 `113afb58d3140502aa1e7691cdc6b240b56cf97e5852fc870e1a7fb5a400dd62`;
- TorchAudio MMS_FA checkpoint `ctc_alignment_mling_uroman/model.pt`, 1,262,047,414 bytes,
  SHA-256 `20ef12963ab4924bef49ac4fc7f58ad5da2ee43b2c11bc8c853c9b90ecdbc680`;
  it is cache, not a project artifact.

Licensing boundary: Phonikud G2P code is CC BY 4.0 and its referenced ONNX model card says MIT;
MMS_FA weights are CC BY-NC 4.0. MMS_FA is therefore acceptable for this non-production R&D
measurement only, not silently cleared for a commercial production path. TorchAudio forced-align
APIs are also deprecated after 2.8, so the prototype pins 2.8 and production planning would need a
separately licensed, maintained aligner.

Recreate the environment (PowerShell):

```powershell
uv venv --python 3.12 .tmp/h3-c1-venv
uv pip install --python .tmp/h3-c1-venv/Scripts/python.exe phonikud==0.4.1 phonikud-onnx==1.0.6 numpy==2.2.6 scipy==1.15.3 soundfile==0.13.1 praat-parselmouth==0.4.6
uv pip install --python .tmp/h3-c1-venv/Scripts/python.exe --index https://download.pytorch.org/whl/cpu torch==2.8.0 torchaudio==2.8.0
```

Download the pinned Phonikud model into scratch and verify its hash. The scorer refuses a hash
mismatch. Run commands are printed by `python prototype/c1_score.py --help`.

## Artifact classes

- tracked files here: preregistration, non-personal prompts, prototype source, aggregate report;
- `.tmp/h3-c1-owner-audio/`: private raw recordings, never commit;
- `.tmp/h3-c1-results/`: detailed local scores, never commit;
- `.tmp/phonikud-1.0.int8.onnx` and `.tmp/torch-cache/`: regenerable model cache.
