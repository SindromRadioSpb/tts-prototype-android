"""Build a deterministic, small owner-test ZIP, with shared engine byte parity."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "docs/research/studio-iphone-local-media/2026-09-08/linguistpro-iphone-probe.zip"
ENGINE_FILES = ("__init__.py", "jobs.py", "planner.py", "receipts.py", "media_verify.py")


def build(output):
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT) or output.suffix != ".zip":
        raise ValueError("OUTPUT_MUST_BE_A_REPOSITORY_ZIP")
    files = {"run.py": (ROOT / "scripts/premium/iphone-media-probe.py").read_bytes()}
    for name in ENGINE_FILES:
        files["acquisition_service/" + name] = (ROOT / "media-acquisition/acquisition_service" / name).read_bytes()
    files["OWNER_README.md"] = (DEFAULT_OUTPUT.parent / "OWNER_README.md").read_bytes()
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    manifest = {"schema": "lp-iphone-probe-package-v1", "base_commit": source_commit,
                "status": "EXPERIMENTAL_OWNER_QUALIFICATION_NOT_PRODUCT_RELEASE",
                "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    files["package-manifest.json"] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo("LinguistPro-iPhone-probe/" + name, date_time=(2026, 9, 8, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    print(json.dumps({"file": str(output.relative_to(ROOT)), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                      "bytes": output.stat().st_size, "base_commit": source_commit}))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    build(parser.parse_args().output)
