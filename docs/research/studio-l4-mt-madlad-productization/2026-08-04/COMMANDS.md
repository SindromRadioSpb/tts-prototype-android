# Commands and results

All commands ran from `E:\projects\tts-prototype-android` on 2026-08-04.

## Automated gates

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -m pytest ai-local/tests -q
```

Current result after the frozen-binary and blank-row regression tests:
`66 passed in 6.50s`.

```powershell
node --test tests/localMtClient.test.js tests/localMtTable.test.js tests/localMtStudioAdapter.test.js tests/madladProviderStatus.test.js tests/materialRevisionCore.test.js tests/materialRevisionWorkspace.test.js
```

Result: `29 passed, 0 failed`.

```powershell
node tests/i18n.smoke.js
```

Result: `233 passed, 0 failed`.

```powershell
npm run smoke:translation-provider
npm run smoke:studio-chunks
git diff --check
```

Results: provenance fresh-Chromium gate PASS with `providerRequests=[]`; Studio chunks
scenarios 1–11 PASS; diff check PASS. Generated provenance screenshots were restored after
the gate so this slice did not stage or overwrite that prior evidence set.

```powershell
npm test
```

Result: `784 tests; 783 passed; 1 failed`. The sole failure is the pre-existing
`tests/classicModeRedesign.test.js` expectation for `id="btnTableCustomizeToggle"`.
`git show HEAD:public/index.html` also lacks that ID, so this slice did not alter unrelated
Classic redesign scope.

## Exact artifact verification

The already-present benchmark artifact was checked against every runtime size and SHA-256
in `ai-local/ai_local/mt_constants.py`:

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -c "from pathlib import Path; from ai_local.mt_model_store import verify_source_directory; verify_source_directory(Path('ai-local/models/madlad400-10b-ct2-int8f16')); print('EXACT_RUNTIME_SHA256_PASS')"
```

Result: PASS in about 36.9 seconds; total runtime bytes `10,739,625,126`.

## Fresh exact-source installation attempt

The production lifecycle manager was exercised against an absent legacy model path. The
first request was cancelled after `117,518,238` bytes; it returned `CANCELED` and retained
the `.part` file. A second request resumed, downloaded all `42,854,943,654` expected bytes,
and passed the pinned per-file SHA-256 manifest.

The isolated CT2 conversion process then exited `-1073741819` (Windows native access
violation) while loading model shards with only about 6 GiB physical RAM available. The
manager returned `MODEL_CONVERSION_FAILED`, performed no activation, and retained the
verified source cache. Pagefile headroom did not make this safe. The product now fails
before download with `MODEL_CONVERSION_MEMORY_LOW`. Subsequent recon found the upstream
config declares float32 (~39.91 GiB of weight shards), while the worker had not explicitly
requested FP16. Two red tests reproduced that mismatch. The worker now passes both
`load_as_float16=True` and `low_cpu_mem_usage=True`; the weight representation is ~19.95
GiB and the product gate is 22 GiB including overhead. Owner cleanup reached 17.09 GiB,
so the corrected retry was not started. See `raw/fresh-install-attempt.json` and
`raw/fp16-remediation.json`.

The already-present exact CT2 runtime was separately passed through the same hash gate,
copied into the managed model directory, atomically manifested, and reported `READY`.

## Real heavy-GPU swap

The exact unchanged D-HNR-11 ASR snapshot was installed through its existing lifecycle
manager, then the repository smoke script exercised both registered scheduler handlers:

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe ai-local/scripts/smoke_mt_gpu_swap.py
```

Result: `asr → translator → asr → unloaded`, `exclusive_residency_pass=true`. The MT
stage loaded the managed exact runtime and returned `Это локальная проверка.`; final
scheduler state was `resident=null`, `active=null`, `waiting=0`. See `raw/gpu-swap.json`.

## Browser QA

A temporary local server ran with `LOCAL_MT_BETA_ENABLED=true` solely for UI QA. A fresh
Chrome profile/session loaded package `3.11.302`; the test then removed its test service
worker/caches, reloaded, and exercised the real MT settings control.

Assertions:

- exact viewport `innerWidth=380`, `innerHeight=843`;
- MT control right edge `179.79`, inside viewport;
- page scroll width `361`, no horizontal overflow;
- modal panel `scrollWidth=340`, `clientWidth=340`;
- English and Hebrew changed live through the real locale selector;
- Hebrew set `dir=rtl` and rendered `תרגום מקומי עם MADLAD`;
- absent old Companion displayed unavailable and could not enable MADLAD.

The temporary server was stopped. The owner-installed Companion on port 8799 was not
stopped, upgraded, or otherwise mutated.

## Production read-only preflight

Observed before any mutation:

- served package `3.11.300`;
- served image origin commit `47959ce88647d6b38d829c3f1dd3c3bdbe6e9cf0`;
- production MADLAD request returned 503 and status had the reproduced false positive;
- production disk about 96% used with about 1.4 GB free;
- Docker images about 20 GB with about 4.421 GB reclaimable, build cache about 6.436 GB
  with about 2.738 GB reclaimable;
- latest observed backup about 699 MB.

No Docker cleanup, backup mutation, build, push, deploy, restart or production write was
performed.

The FP16 remediation advanced the final undeployed package to `3.11.304`; the reproducible
v2 runtime repin advanced Companion source to `0.3.0-beta.4`. Locale cache-bust lock `112`
passes all 233 i18n checks.

Focused red→green evidence:

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -m pytest ai-local/tests/test_mt_l4.py -q
```

Before implementation: 2 failed (`load_as_float16` absent; gate still 24 GiB). After the
FP16 fix: `11 passed`; after adding the beta.4 `accelerate` packaging invariant:
`12 passed`. The complete ai-local suite passes `64 passed` with a test-only empty model
root because the restored sandbox denies direct reads of the real 1.6-GB ASR binary.

## Bounded production cleanup

Read-only inventory found root at 97% with 1.4 GB free, six old unreferenced LinguistPro
images beyond the active and newest rollback images, and unused builder cache. Under the
owner's explicit authority, each candidate was rechecked against all containers, then only
those six exact image IDs and `docker builder prune -f` were removed.

Post-check: root 76% with 8.8 GB free; `disk_warn=false`; DB/migrations healthy; active and
newest rollback images, all 10 running containers, all 3 volumes, backups and data remain.
No `docker system prune`, volume/container prune, backup deletion or data mutation ran.
See `raw/production-cleanup.json`.

## Companion beta-3 build attempt

`ai-local/scripts/build_companion.ps1` now selects a temporary loopback port for its frozen
smoke so it cannot collide with or stop the owner Companion on port 8799. The beta-3 build
attempt then stopped during isolated dependency preparation because the restored sandbox
blocked outbound socket access. The build script rejected the run; no beta-3 installer was
produced and existing beta-2 artifacts were not reused.

## Controlled FP16 conversion retry

The owner explicitly authorized a controlled retry after reporting 20.6 GiB available.
The immediate pre-run measurement was 21.25 GiB. Because this was below the product gate,
the lifecycle endpoint was not bypassed or weakened; the corrected worker was invoked
directly with the already verified source and a separate temporary output directory:

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -m ai_local.mt_convert_worker `
  $verifiedSource `.tmp/mt-fp16-retry-20260804
```

Result: exit `0`, 190 s, seven files, 10,739,625,126 output bytes. Across 162 one-second
samples, available physical RAM fell to 0.03 GiB. The source and current managed READY
runtime were untouched.

The required post-conversion integrity command failed closed:

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -c "from pathlib import Path; from ai_local.mt_model_store import verify_source_directory; verify_source_directory(Path(r'.tmp\mt-fp16-retry-20260804'))"
```

Failure: `MODEL_RUNTIME_FILE_HASH_MISMATCH:model.bin`. Its byte count is identical, but
the fresh SHA-256 is `281b69be...e9e97`; the approved/managed SHA-256 remains
`8edcf2e2...a54b3`. All six other runtime file hashes match. No activation, pin change or
managed-model replacement was performed. The 22 GiB product gate remains in force; this
near-zero memory floor is evidence against lowering it to 20.6 GiB.

## Reproducibility, frozen release subset and v2 activation

After explicit owner approval, a second independent conversion ran into
`.tmp/mt-fp16-repro-20260804`. It completed in 199.8 seconds with the same seven files,
same byte counts and exact same `model.bin` SHA-256 `281b69be...e9e97`; available RAM
again approached exhaustion at 0.11 GiB. This established conversion reproducibility but
did not by itself authorize a pin change.

Before candidate inference, `release-regression-contract.json` froze a deterministic
64-shared-ID/128-row subset, its input hash, the approved v1 baseline and all PASS
thresholds. The candidate then ran with the original benchmark parameters:

```powershell
& ai-local/.venv/Scripts/python.exe scripts/research/l4_mt_benchmark.py run `
  --system madlad-400-10b-ct2-int8 `
  --input .tmp/l4-mt/release-regression/fp16-v1/input.tsv `
  --output .tmp/l4-mt/release-regression/fp16-v1/candidate.tsv `
  --model-dir .tmp/mt-fp16-repro-20260804 `
  --device cuda --compute-type int8_float16 --beam-size 4 --batch-size 8
```

Result: 128/128 rows, exact order and unique IDs, zero provider failures/truncation/
critical flags. he→ru chrF++ changed 50.7953→51.4397, ru→he 47.8975→47.8492,
macro 49.3464→49.6445; every predeclared chrF++ and spBLEU threshold passed. Output
changed on 51/128 rows, so the old identity was not reused: the candidate is pinned as
`madlad-400-10b-ct2-int8f16@v2`.

The normal lifecycle activated v2 into an isolated root and fully rehashed it. A bounded
owner-managed swap then retained v1 as `int8_float16.v1-backup-20260804`, moved the verified
v2 directory into the canonical target, and passed a second full rehash. The managed v2
runtime loaded on RTX 3070, translated four synthetic rows, unloaded, and left GPU use at
497 MiB. The v2 ASR→MT→ASR repeat could not start because the restricted sandbox denies
reads of the unchanged ASR binary; the earlier v1 scheduler swap remains recorded.

## Companion beta-4 binary lifecycle

The restored network was able to install the exact public pins into the isolated build
venv. The build ran PyInstaller, frozen `--mt-runtime-check`, isolated random-port
start/health/stop and Inno Setup. Its report contains exactly one beta.4 artifact and no
beta.1/beta.2 candidates. The frozen converter reports Torch `2.5.1+cpu`, Accelerate
`1.13.0` and `ctranslate2.TransformersConverter`.

The final post-commit rebuild reports source commit `ce811de7`, global dirty state only
because unrelated owner files remain preserved, and `source_input_dirty=false`. Its sole
artifact is `LinguistProLocalAsrCompanion-0.3.0-beta.4-unsigned-internal.exe`,
1,867,104,763 bytes, SHA-256
`ec65f5f4c8adc428abe96f3ed9cdf46a74515f6b1025886c0939a46f1c72550c`.
After logged Inno exit 0, all 5,304 final dist files matched the installed tree by
relative path, byte count and SHA-256. Full model rehash and a cold production-Origin
job passed; final runtime state is unloaded.

The installer upgraded the existing beta.2 in place, preserving the pairing token and
exact ASR revision. The first real job exposed a red defect: an empty segment reached the
model and returned a non-empty numeric sequence. The manager now excludes blank and
whitespace inputs from inference and restores them exactly into their original indexes.
Focused Python tests pass `25/25`; the rebuilt binary preserves empty, whitespace and
duplicate rows in a real job.

The rebuilt binary deleted the managed v2 model and returned a durable receipt with
`deleted=true`, `absent_after=true`. Reinstall started from the exact remote revision. A
last-shard network interruption failed closed as `MODEL_INSTALL_FAILED` after
41,332,133,110 processed bytes and retained a 1,652,555,776-byte partial. A second request
rehash-resumed that partial, converted, activated and reached `READY` with all
53,594,568,780 lifecycle bytes. Full runtime rehash passed; observed conversion RAM floor
was 0.96 GiB, reinforcing the unchanged 22 GiB preflight gate.

Two authenticated jobs using the production Origin started within 2 ms: he→ru completed
3/3 rows and ru→he completed 2/2 rows, both with `provider=madlad` and
`local_execution=true`. Graceful restart, post-restart full rehash, cold job and final
unload passed. See `raw/beta4-binary-lifecycle.json`.
