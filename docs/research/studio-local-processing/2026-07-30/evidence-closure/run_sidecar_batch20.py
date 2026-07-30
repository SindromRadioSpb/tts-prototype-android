"""Freeze and run the existing L0 batch-20 through the L1 loopback sidecar.

Raw owner audio and ASR text remain local.  The tracked report contains hashes,
error rates, runtime/model provenance, telemetry, and deletion receipts only.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
FROZEN = HERE / "sidecar-batch20-frozen-inputs.json"
REPORT = HERE / "sidecar-batch20-report.json"
GOLD = ROOT / "docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv"
AUDIO_ROOT = ROOT / ".tmp/h3-c1-owner-audio"
BASE_URL = "http://127.0.0.1:8799"
ORIGIN = "http://127.0.0.1:3000"
MODEL_ID = "ivrit-ai/whisper-large-v3-turbo-ct2"
REVISION = "72ad623a37947395efcc3933132353790e5a12f5"


def _benchmark_module():
    path = ROOT / "docs/research/studio-local-processing/2026-07-30/benchmark_runner.py"
    spec = importlib.util.spec_from_file_location("studio_l0_benchmark", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load frozen L0 scorer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def _rows() -> list[dict[str, str]]:
    rows = list(csv.DictReader(GOLD.open(encoding="utf-8"), delimiter="\t"))
    normal = [row for row in rows if row["condition"] == "NORMAL"][:20]
    if [row["id"] for row in normal] != [f"N{i:02d}" for i in range(1, 21)]:
        raise RuntimeError("frozen L0 batch membership changed")
    return normal


def freeze() -> dict[str, Any]:
    scorer = _benchmark_module()
    items = []
    for row in _rows():
        audio = AUDIO_ROOT / row["audio_file"]
        if not audio.is_file():
            raise FileNotFoundError(audio)
        probe = scorer.ffprobe(audio)
        items.append({
            "id": row["id"],
            "audio_file": row["audio_file"],
            "audio_sha256": _sha256(audio),
            "audio_bytes": audio.stat().st_size,
            "duration_sec": probe["duration_sec"],
            "reference_sha256": hashlib.sha256(row["sentence"].encode("utf-8")).hexdigest(),
        })
    manifest = {
        "schema": "studio-local-asr-sidecar-batch20-inputs-v1",
        "selection": "first 20 NORMAL rows from the pre-existing tracked C1 manifest; identical to L0",
        "gold_manifest": str(GOLD.relative_to(ROOT)).replace("\\", "/"),
        "gold_manifest_sha256": _sha256(GOLD),
        "scoring_protocol": "benchmark_runner.py norm_text/error_rates, frozen before inference",
        "model_id": MODEL_ID,
        "revision": REVISION,
        "items": items,
        "totals": {"items": len(items), "duration_sec": sum(item["duration_sec"] for item in items)},
    }
    _json_write(FROZEN, manifest)
    return manifest


def _request(method: str, path: str, token: str, body: bytes | None = None,
             content_type: str | None = None, timeout: float = 60) -> dict[str, Any]:
    headers = {"Origin": ORIGIN, "Authorization": f"Bearer {token}"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(BASE_URL + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def _verify_frozen(manifest: dict[str, Any]) -> list[tuple[dict[str, str], dict[str, Any], Path]]:
    if manifest.get("model_id") != MODEL_ID or manifest.get("revision") != REVISION:
        raise RuntimeError("frozen model boundary mismatch")
    if manifest.get("gold_manifest_sha256") != _sha256(GOLD):
        raise RuntimeError("gold manifest changed after freeze")
    frozen_by_id = {item["id"]: item for item in manifest.get("items", [])}
    verified = []
    for row in _rows():
        item = frozen_by_id.get(row["id"])
        audio = AUDIO_ROOT / row["audio_file"]
        if not item or item["audio_sha256"] != _sha256(audio):
            raise RuntimeError(f"frozen audio mismatch: {row['id']}")
        reference_hash = hashlib.sha256(row["sentence"].encode("utf-8")).hexdigest()
        if item["reference_sha256"] != reference_hash:
            raise RuntimeError(f"frozen gold mismatch: {row['id']}")
        verified.append((row, item, audio))
    return verified


def run(token: str) -> dict[str, Any]:
    if not FROZEN.is_file():
        raise RuntimeError("freeze first: run with --freeze before starting the sidecar")
    frozen = json.loads(FROZEN.read_text(encoding="utf-8"))
    inputs = _verify_frozen(frozen)
    scorer = _benchmark_module()
    capabilities = _request("GET", "/v1/capabilities", token)
    model_status = _request("GET", "/v1/asr/model/status?verify_hash=true", token, timeout=120)
    identity = capabilities["local_asr"]["model"]
    if not capabilities["local_asr"]["enabled"] or capabilities["local_asr"]["default"] is not False:
        raise RuntimeError("sidecar is not enabled/default-off as required")
    if identity.get("model_id") != MODEL_ID or identity.get("revision") != REVISION:
        raise RuntimeError("live sidecar model pin mismatch")
    if not model_status.get("verified"):
        raise RuntimeError(f"live sidecar model integrity failed: {model_status}")

    started = time.time()
    rows, references, hypotheses, receipts = [], [], [], []
    terminal_results = 0
    for row, frozen_item, audio in inputs:
        item_started = time.perf_counter()
        created = _request("POST", "/v1/asr/jobs", token, audio.read_bytes(), "audio/wav", timeout=120)
        job_id = created["job_id"]
        status = created
        try:
            deadline = time.monotonic() + 180
            while status.get("state") not in {"COMPLETE", "FAILED", "CANCELED"}:
                if time.monotonic() > deadline:
                    raise TimeoutError(f"job timeout: {row['id']} / {job_id}")
                time.sleep(0.2)
                status = _request("GET", f"/v1/asr/jobs/{job_id}", token)
            terminal_results += 1
            if status["state"] != "COMPLETE" or not status.get("result_available"):
                raise RuntimeError(f"non-success terminal result for {row['id']}: {status}")
            result = _request("GET", f"/v1/asr/jobs/{job_id}/result", token)
            result_model = result.get("model", {})
            if result.get("actual_provider") != "local-faster-whisper" or result_model.get("model_id") != MODEL_ID \
                    or result_model.get("revision") != REVISION:
                raise RuntimeError(f"provider/model fallback detected for {row['id']}")
            chunks = result.get("chunks", [])
            attempt_count = sum(len(chunk.get("raw_attempts", [])) for chunk in chunks)
            if attempt_count != len(chunks):
                raise RuntimeError(f"retry detected for {row['id']}: {attempt_count} attempts/{len(chunks)} chunks")
            segments = [segment for chunk in chunks for segment in chunk.get("raw", {}).get("segments", [])]
            hypothesis = " ".join(str(segment.get("text", "")).strip() for segment in segments).strip()
            metrics = scorer.error_rates(row["sentence"], hypothesis)
            elapsed = sum(float(chunk.get("raw", {}).get("elapsed_sec") or 0) for chunk in chunks)
            rows.append({
                "id": row["id"],
                **metrics,
                "duration_sec": frozen_item["duration_sec"],
                "inference_elapsed_sec": elapsed,
                "wall_sec": time.perf_counter() - item_started,
                "source_sha256": result["source_sha256"],
                "hypothesis_sha256": hashlib.sha256(hypothesis.encode("utf-8")).hexdigest(),
                "chunks": len(chunks),
                "raw_attempts": attempt_count,
                "state": status["state"],
                "telemetry": result.get("telemetry"),
            })
            references.append(row["sentence"])
            hypotheses.append(hypothesis)
        finally:
            receipt = _request("DELETE", f"/v1/asr/jobs/{job_id}", token)
            receipts.append({"id": row["id"], **receipt})

    aggregate = scorer.error_rates(" ".join(references), " ".join(hypotheses))
    aggregate.update({
        "items": len(rows),
        "terminal_results": terminal_results,
        "duration_sec": sum(row["duration_sec"] for row in rows),
        "inference_elapsed_sec": sum(row["inference_elapsed_sec"] for row in rows),
        "wall_sec": time.time() - started,
        "rtf": sum(row["inference_elapsed_sec"] for row in rows) /
               max(1.0, sum(row["duration_sec"] for row in rows)),
    })
    report = {
        "schema": "studio-local-asr-sidecar-batch20-report-v1",
        "started_unix": started,
        "finished_unix": time.time(),
        "code_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "dirty_worktree_during_run": True,
        "frozen_inputs_sha256": _sha256(FROZEN),
        "sidecar": {"base_url": BASE_URL, "origin": ORIGIN, "capabilities": capabilities,
                    "model_status": model_status},
        "aggregate": aggregate,
        "items": rows,
        "deletion_receipts": receipts,
        "gates": {
            "terminal_20_of_20": terminal_results == 20 and len(rows) == 20,
            "wer_lte_0_05": aggregate["wer"] <= 0.05,
            "cer_lte_0_02": aggregate["cer"] <= 0.02,
            "no_retry_or_fallback": all(row["raw_attempts"] == row["chunks"] for row in rows),
            "all_jobs_deleted": len(receipts) == 20 and all(receipt.get("deleted") for receipt in receipts),
        },
        "privacy": {"bytes_uploaded": 0, "raw_audio_committed": False,
                    "raw_transcripts_committed": False},
    }
    _json_write(REPORT, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--freeze", action="store_true")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--token")
    parser.add_argument("--token-file", type=Path)
    args = parser.parse_args()
    if args.freeze == args.run:
        parser.error("choose exactly one of --freeze or --run")
    token = args.token or (args.token_file.read_text(encoding="utf-8").strip() if args.token_file else "")
    value = freeze() if args.freeze else run(token)
    print(json.dumps(value.get("totals") or {"aggregate": value["aggregate"], "gates": value["gates"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
