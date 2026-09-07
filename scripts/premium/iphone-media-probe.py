"""Owner-only iPhone qualification runner. NOT a released Studio integration.

No HTTP listener, account/cookie import, provider credentials, ASR or media upload.
Dependency installation and actual YouTube download are separate explicit actions.
The package builder includes the EXISTING planner/backend/byte verifier unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import sys
import tempfile
import threading
import time
import urllib.request
import uuid
import zipfile

WHEELS = (
    ("yt_dlp-2026.8.19-py3-none-any.whl",
     "https://files.pythonhosted.org/packages/69/b2/8cd1613f56eed7ceb64fbd4df3f1c01246bfb098e6f398228bafda22b80b/yt_dlp-2026.8.19-py3-none-any.whl",
     "1d57897e94c6665a0a6f9bc54b34e584284e32c034ffab3a7df25d8f7b24eedf"),
    ("yt_dlp_ejs-0.8.0-py3-none-any.whl",
     "https://files.pythonhosted.org/packages/e3/bd/520769863744b669440a924271a6159ddd82ad5ae26b4ac4d4b69e9f8d44/yt_dlp_ejs-0.8.0-py3-none-any.whl",
     "79300e5fca7f937a1eeede11f0456862c1b41107ce1d726871e0207424f4bdb4"),
    ("yt_dlp_apple_webkit_jsi-0.1.1-py3-none-any.whl",
     "https://files.pythonhosted.org/packages/e6/b7/8e873c49a852876daa3e05192e424d6a90da8451f359117ce692a61e8153/yt_dlp_apple_webkit_jsi-0.1.1-py3-none-any.whl",
     "1892b14e7ee7161deaae11040b38b2e2b229178e1b96102ca2c1d5a0ed136688"),
)
RIGHTS = {"owned", "permission", "public-domain"}
MAX_WHEEL_BYTES = 32 * 1024 * 1024
SAFE_ERROR_CODES = frozenset("""
VIDEO_ID_INVALID JOB_ID_INVALID OPTION_INVALID RIGHTS_REQUIRED IOS_REQUIRED
DEPENDENCY_HASH_MISMATCH DEPENDENCY_REDIRECT_REJECTED DEPENDENCY_SIZE_LIMIT
DEPENDENCY_EXPANSION_LIMIT DEPENDENCY_ARCHIVE_INVALID RUNTIME_EXISTS_NO_OVERWRITE
INSTALL_RUNTIME_FIRST RUNTIME_MANIFEST_MISMATCH RUNTIME_VERSION_MISMATCH
WEBKIT_EXECUTION_FAILED NO_REQUESTED_OPTION DOWNLOAD_TIME_LIMIT OWNER_CANCELED
SOURCE_BOT_BLOCKED SOURCE_REGION_BLOCKED LOGIN_REQUIRED SOURCE_RATE_LIMIT
SOURCE_ACCESS_BLOCKED FORMAT_UNAVAILABLE SOURCE_UNAVAILABLE SOURCE_NETWORK_ERROR
SOURCE_FAILED EXTRACTOR_RESULT_INVALID EXTRACTOR_ID_INVALID EXTRACTOR_ID_MISMATCH
LIVE_UNSUPPORTED DURATION_UNKNOWN DURATION_LIMIT NO_COMPATIBLE_FORMAT
JOB_CANCELED MEDIA_VERIFY_TIMEOUT OUTPUT_MEDIA_INVALID OUTPUT_AUDIO_INVALID
OUTPUT_VIDEO_INVALID OUTPUT_QUALITY_MISMATCH OUTPUT_HDR_UNSUPPORTED
OUTPUT_DURATION_MISMATCH OUTPUT_SIZE_LIMIT OUTPUT_FILE_INVALID OUTPUT_PATH_INVALID
FORMAT_PLAN_INVALID PROBE_FAILED
""".split())


def source_url(video_id):
    if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("VIDEO_ID_INVALID")
    return "https://www.youtube.com/watch?v=" + video_id


def chrome_return_url(job_id):
    if not isinstance(job_id, str) or not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise ValueError("JOB_ID_INVALID")
    # Fixed origin. Fragment contains no file, provider URL, title, key or receipt.
    # Existing Studio does NOT consume this fragment; import is manual in this probe.
    return "googlechromes://linguistpro.kolosei.com/#lp-local-probe=" + job_id


def check_digest(path, expected):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError("DEPENDENCY_HASH_MISMATCH")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError("DEPENDENCY_REDIRECT_REJECTED")


def fetch_wheel(url, target, expected):
    # URLs are constants, not command-line inputs. No pip build scripts or updates.
    opener = urllib.request.build_opener(_NoRedirect())
    with opener.open(url, timeout=30) as response, Path(target).open("xb") as output:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_WHEEL_BYTES:
                raise ValueError("DEPENDENCY_SIZE_LIMIT")
            output.write(chunk)
    check_digest(target, expected)


def unpack_wheel(archive, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) > 10000 or sum(x.file_size for x in entries) > 100 * 1024 * 1024:
            raise ValueError("DEPENDENCY_EXPANSION_LIMIT")
        seen = set()
        for entry in entries:
            # orig_filename retains backslashes even when ZipInfo normalizes them
            # on Windows; validation must have the same result on iPhone and PC.
            name = entry.orig_filename
            path = PurePosixPath(name)
            target = (destination / name).resolve()
            if (path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name
                    or not name or name in seen
                    or ((entry.external_attr >> 16) & 0o170000) == 0o120000
                    or not target.is_relative_to(destination)
                    or (target.exists() and not entry.is_dir())):
                raise ValueError("DEPENDENCY_ARCHIVE_INVALID")
            seen.add(name)
        bundle.extractall(destination)


def install_runtime(root):
    root = Path(root).resolve()
    target = root / "runtime-v1"
    if target.exists():
        raise FileExistsError("RUNTIME_EXISTS_NO_OVERWRITE")
    # Failed installs leave no runnable marker; owner files/global Python untouched.
    with tempfile.TemporaryDirectory(prefix=".lp-runtime-stage-", dir=root) as stage_name:
        stage = Path(stage_name)
        downloads = stage / "downloads"
        downloads.mkdir()
        for name, url, digest in WHEELS:
            wheel = downloads / name
            fetch_wheel(url, wheel, digest)
            unpack_wheel(wheel, stage / "site")
        (stage / "complete.json").write_text(json.dumps({"wheels": WHEELS}), encoding="utf-8")
        # A new path only; never replace an existing owner runtime.
        stage.rename(target)
    return target


def activate_runtime(root):
    runtime = Path(root).resolve() / "runtime-v1"
    if not (runtime / "complete.json").is_file():
        raise RuntimeError("INSTALL_RUNTIME_FIRST")
    manifest = json.loads((runtime / "complete.json").read_text(encoding="utf-8"))
    if manifest.get("wheels") != [list(item) for item in WHEELS]:
        raise RuntimeError("RUNTIME_MANIFEST_MISMATCH")
    for name, _url, digest in WHEELS:
        check_digest(runtime / "downloads" / name, digest)
    sys.path.insert(0, str(runtime / "site"))
    from yt_dlp.globals import plugin_dirs
    from yt_dlp.version import __version__
    if __version__ != "2026.08.19":
        raise RuntimeError("RUNTIME_VERSION_MISMATCH")
    # No discovery in the user's other yt-dlp config/plugin folders.
    plugin_dirs.value = [str(runtime)]


def is_ios():
    return sys.platform == "ios" or (
        sys.platform == "darwin" and platform.machine().startswith(("iPhone", "iPad", "iPod")))


def native_preflight():
    if not is_ios():
        raise RuntimeError("IOS_REQUIRED")
    # Load ONCE through yt-dlp: importing the decorated provider first would cause
    # a duplicate registration when YoutubeDL subsequently discovers plugins.
    from yt_dlp.globals import all_plugins_loaded
    from yt_dlp.plugins import load_all_plugins
    if not all_plugins_loaded.value:
        load_all_plugins()
    from yt_dlp_plugins.extractor.ytjsc import AppleWebKitJCP
    from yt_dlp_plugins.webkit_jsi.lib.easy import WKJSE_Factory, WKJSE_Webview
    from yt_dlp_plugins.webkit_jsi.lib.logging import DefaultLoggerImpl
    from acquisition_service.media_verify import _run, normalize_and_verify

    # Prove actual native JS execution, not just availability of an import.
    messages = []
    with WKJSE_Factory(DefaultLoggerImpl()) as send:
        with WKJSE_Webview(send) as webview:
            webview.on_script_log(lambda item: messages.append(item.get("argsArr")))
            webview.execute_js("console.log(6 * 7);")
    if [42] not in messages or AppleWebKitJCP.JS_RUNTIME_NAME != "apple-webkit-jsi":
        raise RuntimeError("WEBKIT_EXECUTION_FAILED")
    cancel = threading.Event()
    # Native subprocess/FFmpeg compatibility is an independent gate on a-Shell.
    with tempfile.TemporaryDirectory(prefix="lp-codec-probe-") as directory:
        output = Path(directory) / "fixture.m4a"
        _run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
              "anullsrc=r=44100:cl=mono", "-t", "1", "-c:a", "aac", str(output)], cancel, timeout=30)
        normalize_and_verify(output, {"kind": "audio"}, {"duration_seconds": 1}, cancel)
    return {"native_webkit": "PASS", "native_ffmpeg_audio": "PASS",
            "python": platform.python_version(), "platform": "iOS",
            "yt_dlp": "2026.08.19", "webkit_plugin": "0.1.1"}


def failure_report(stage, error, job_id):
    # No raw provider exception, device name, absolute path, signed URL or cookies.
    code = getattr(error, "code", None)
    if not isinstance(code, str) or code not in SAFE_ERROR_CODES:
        code = str(error) if str(error) in SAFE_ERROR_CODES else "PROBE_FAILED"
    return {"schema": "lp-iphone-media-probe-v1", "status": "FAIL", "stage": stage,
            "job_id": job_id, "error_code": code, "iphone_acceptance": "NOT_TESTED"}


def run_download(root, video_id, kind, quality, rights, job_id):
    if rights not in RIGHTS:
        raise ValueError("RIGHTS_REQUIRED")
    url = source_url(video_id)
    chrome_return_url(job_id)
    if kind not in {"audio", "video"} or quality not in {360, 480, 720, 1080}:
        raise ValueError("OPTION_INVALID")
    native = native_preflight()
    from acquisition_service.jobs import YtDlpBackend, _hash_file, JobError
    from acquisition_service.planner import build_resolved_source, MAX_OUTPUT_BYTES

    class LocalWebKitBackend(YtDlpBackend):
        @staticmethod
        def _base_options():
            options = YtDlpBackend._base_options()
            # Device WebKit plugin only: no Deno executable and no remote EJS update.
            options.update({"js_runtimes": {}, "remote_components": []})
            return options

    backend = LocalWebKitBackend()
    info = backend.resolve(url)
    # Reuse the canonical full-duration, live/DRM and complete-format planner.
    # Its ephemeral tokens are INTERNAL ONLY, never a forged remote receipt.
    resolved = build_resolved_source(info, canonical_url=url, subject="local-probe",
                                     secret=uuid.uuid4().hex + uuid.uuid4().hex)
    option = next((item for item in resolved["options"] if item["kind"] == kind and
                   (kind == "audio" or item["quality"] == quality)), None)
    if option is None:
        raise JobError("NO_REQUESTED_OPTION")
    print(json.dumps({"phase": "RESOLVED", "title": resolved["source"]["title"],
                      "duration_seconds": resolved["source"]["duration_seconds"],
                      "kind": kind, "quality": option.get("quality")}, ensure_ascii=True), flush=True)
    root = Path(root).resolve()
    folder = root / "results" / job_id
    folder.mkdir(parents=True, exist_ok=False)
    cancel = threading.Event()
    started = time.monotonic()
    last_print = [0.0]

    def progress(phase, done, total):
        now = time.monotonic()
        if now - started > 1800:
            cancel.set()
            raise JobError("DOWNLOAD_TIME_LIMIT")
        # Includes partial/multiple tracks, not just one yt-dlp progress counter.
        if sum(p.stat().st_size for p in folder.rglob("*") if p.is_file()) > 2 * MAX_OUTPUT_BYTES:
            cancel.set()
            raise JobError("OUTPUT_SIZE_LIMIT")
        if now - last_print[0] >= 2 or phase == "VERIFYING":
            print(json.dumps({"phase": phase, "bytes_done": done, "bytes_total": total}), flush=True)
            last_print[0] = now

    output, mime, name, verification = backend.prepare(
        plan={"canonical_url": url, "video_id": video_id, "duration_seconds": info["duration"]},
        option=option, job_dir=folder, cancel_event=cancel, progress=progress)
    sha256, size = _hash_file(output)
    # Verified copy remains owner-visible. Do not auto-delete any owner result.
    report = {"schema": "lp-iphone-media-probe-v1", "status": "LOCAL_BYTES_VERIFIED",
              "job_id": job_id, "native": native, "kind": kind, "rights_basis": rights,
              "output_file": output.name, "suggested_name": name, "size_bytes": size,
              "sha256": sha256, "mime": mime, "verification": verification,
              "source_video_id": video_id, "elapsed_seconds": round(time.monotonic() - started, 2),
              "chrome_return": "NOT_TESTED", "chrome_file_import": "NOT_TESTED",
              "iphone_acceptance": "NOT_TESTED", "server_media_transfer": "NOT_USED_BY_RUNNER"}
    (folder / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install-runtime", action="store_true")
    action.add_argument("--preflight", action="store_true")
    action.add_argument("--download", action="store_true")
    action.add_argument("--return-chrome", metavar="JOB_ID")
    parser.add_argument("--video-id")
    parser.add_argument("--kind", choices=["video", "audio"], default="audio")
    parser.add_argument("--quality", type=int, choices=[360, 480, 720, 1080], default=360)
    parser.add_argument("--rights", choices=sorted(RIGHTS))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    # Developer checkout and generated owner package use one copy of engine source.
    if not (root / "acquisition_service").is_dir():
        sys.path.insert(0, str(root.parents[1] / "media-acquisition"))
    job_id = uuid.uuid4().hex
    stage = "INSTALL_RUNTIME" if args.install_runtime else "NATIVE_PREFLIGHT"
    try:
        if args.return_chrome:
            if not is_ios():
                raise RuntimeError("IOS_REQUIRED")
            url = chrome_return_url(args.return_chrome)
            # Only fixed scheme/origin + validated hex. No arbitrary shell text.
            status = os.system("open " + url)
            print(json.dumps({"chrome_return": "REQUESTED" if status == 0 else "REQUEST_FAILED",
                              "chrome_file_import": "NOT_TESTED"}))
            return 0 if status == 0 else 1
        if args.install_runtime:
            install_runtime(root)
            print(json.dumps({"runtime_install": "COMPLETE", "iphone_acceptance": "NOT_TESTED"}))
            return 0
        if args.download and args.rights not in RIGHTS:
            raise ValueError("RIGHTS_REQUIRED")
        activate_runtime(root)
        if args.preflight:
            report = {"schema": "lp-iphone-media-probe-v1", "native": native_preflight(),
                      "status": "NATIVE_PREFLIGHT_PASS", "iphone_acceptance": "NOT_TESTED"}
        else:
            stage = "LOCAL_DOWNLOAD"
            report = run_download(root, args.video_id, args.kind, args.quality, args.rights, job_id)
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return 0
    except (Exception, KeyboardInterrupt) as error:
        report = failure_report(stage, error, job_id)
        if isinstance(error, KeyboardInterrupt):
            report["error_code"] = "OWNER_CANCELED"
        print(json.dumps(report))
        # Failed downloads may retain only this run's partial files for owner review.
        folder = root / "results" / job_id
        if folder.is_dir():
            (folder / "failure.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return 1


if __name__ == "__main__":
    sys.exit(main())
