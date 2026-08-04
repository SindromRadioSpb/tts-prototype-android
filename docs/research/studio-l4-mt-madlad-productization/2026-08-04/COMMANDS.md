# Commands and results

All commands ran from `E:\projects\tts-prototype-android` on 2026-08-04.

## Automated gates

```powershell
$env:PYTHONPATH='ai-local'
& ai-local/.venv/Scripts/python.exe -m pytest ai-local/tests -q
```

Result: `60 passed in 5.14s`.

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
