"""Bounded actual-byte probe. Uses a temporary directory, emits no URL or credentials."""
import argparse
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "media-acquisition"))
from acquisition_service.jobs import YtDlpBackend, _hash_file
from acquisition_service.planner import build_resolved_source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--kind", choices=["video", "audio"], required=True)
    parser.add_argument("--quality", type=int, default=360)
    args = parser.parse_args()
    started = time.monotonic()
    backend = YtDlpBackend()
    info = backend.resolve(args.url)
    resolved = build_resolved_source(info, canonical_url=args.url, subject="isolated-live-probe", secret="probe-only-not-an-api-secret-00000000")
    option = next((o for o in resolved["options"] if o["kind"] == args.kind and
                   (args.kind != "video" or o["quality"] == args.quality)), None)
    if not option:
        raise RuntimeError("NO_REQUESTED_OPTION")
    with tempfile.TemporaryDirectory(prefix="lp-media-probe-") as directory:
        output, mime, _name, verification = backend.prepare(
            plan={"canonical_url": args.url, "video_id": info["id"], "duration_seconds": info["duration"]},
            option=option, job_dir=Path(directory), cancel_event=threading.Event(), progress=lambda *a: None)
        digest, size = _hash_file(output)
        print(json.dumps({"result": "PASS", "kind": args.kind, "size_bytes": size,
                          "sha256": digest, "mime": mime, "verification": verification,
                          "elapsed_seconds": round(time.monotonic() - started, 2)}, sort_keys=True))
    print(json.dumps({"temporary_media_deleted": not Path(directory).exists()}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"result": "FAIL", "error_code": getattr(error, "code", "PROBE_FAILED")}))
        sys.exit(1)
