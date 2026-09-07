# iPhone + Chrome local-media feasibility implementation

Status: **OWNER QUALIFICATION KIT / PHYSICAL IPHONE NOT TESTED**.
Source baseline: `c992300d5de5f5cdc9a1dc0cf272d3f8ab458321` on
`feat/studio-media-downloader-2026-09-08`. No main push, production change or paid service.

Start with [OWNER_README.md](OWNER_README.md). The owner-test artifact is
[linguistpro-iphone-probe.zip](linguistpro-iphone-probe.zip), a small source-only bundle.
It installs dependencies only with the owner's explicit `--install-runtime` action.
The ZIP is generated, not a second editable source. Edit the original scripts/engine;
edit OWNER_README for instructions. Temporary runtime downloads and unpacked test copies
live under `.tmp/rma-iphone-probe-check/`, are not delivery artifacts and are not committed.

Canon: `docs/planning/STUDIO_IPHONE_CHROME_LOCAL_MEDIA_2026_09_08.md`.

## Verification performed

All results below are **desktop technical evidence**, not iPhone acceptance.

| Check | Result |
|---|---|
| New offline contract/safety/package tests | 13/13 PASS |
| Existing media-acquisition Python tests | 28/28 PASS |
| API smoke | PASS |
| Full Node unit suite | 1370/1370 PASS |
| Actual install of generated kit in disposable directory | COMPLETE; all three pinned wheel hashes verified |
| Repeat installer | `RUNTIME_EXISTS_NO_OVERWRITE`; no global runtime change |
| Packaged `--preflight` on Windows | `IOS_REQUIRED`, as required |
| Packaged `--download` without rights | `RIGHTS_REQUIRED`, before source access |
| Native provider import experiment on Windows | NOT_SUPPORTED: missing `os.RTLD_LAZY`; no fake-native workaround |
| Native iPhone execution / Chrome handoff | NOT_TESTED |

Initial red test failed because the runner did not exist. A subsequent archive test
exposed Windows `ZipInfo` normalization; validation now examines `orig_filename` so
malicious backslashes have the same rejection on Windows/iOS. Tests also cover traversal,
symlinks, hashes, failed-install rollback, no overwrite, arbitrary return URL rejection,
closed error codes, rights gate, repeatable ZIP and byte parity with the existing engine.
The local-report test explicitly uses a fake media backend; it is **not** codec evidence.

Commands (PowerShell from repository root unless noted):

```powershell
.tmp/rma-downloader-venv/Scripts/python.exe -m unittest discover -s scripts/premium/tests -p test_iphone_media_probe.py
.tmp/rma-downloader-venv/Scripts/python.exe scripts/premium/build-iphone-media-probe.py
npm run test:api-smoke
npm test
```

Existing Python suite, working directory `media-acquisition`:

```powershell
../.tmp/rma-downloader-venv/Scripts/python.exe -m unittest discover -s tests
```

The first existing-suite attempt from root omitted its import path and produced
`ModuleNotFoundError: acquisition_service`; rerun from its own directory passed 28/28.

To regenerate the package with another installed Python 3.10+, invoke the builder with
that interpreter. The builder copies five unchanged `acquisition_service` source files,
the probe and owner README into the ZIP. Its manifest records exact SHA-256 values and
the current base commit; deterministic bytes assume the same source bytes and base commit.

## Remaining owner boundary

The specific helper installation has not yet been accepted by the owner. No device
was installed/configured remotely. The kit does not automate the five-step Studio flow:
it establishes whether the native route can work before integrating it. See canon for
the separate native runtime, source download, Chrome return, local file binding,
interruption recovery and production gates. A callback alone is never a receipt.
