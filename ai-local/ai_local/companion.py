"""Per-user Windows supervisor and desktop UI for the Local ASR beta."""

from __future__ import annotations

import argparse
import json
import multiprocessing
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

APP_VERSION = "0.2.0-beta.2"
PRODUCTION_ORIGIN = "https://linguistpro.kolosei.com"
GUIDE_FILENAMES = {
    "ru": "LOCAL_ASR_COMPANION_GUIDE.md",
    "en": "LOCAL_ASR_COMPANION_GUIDE.en.md",
    "he": "LOCAL_ASR_COMPANION_GUIDE.he.md",
}


def _bootstrap_environment() -> Path:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    root = local / "LinguistPro" / "LocalASR"
    os.environ["AI_LOCAL_HOST"] = "127.0.0.1"
    os.environ["AI_LOCAL_PORT"] = "8799"
    os.environ["AI_LOCAL_ASR_ENABLED"] = "1"
    os.environ["AI_LOCAL_MODELS_DIR"] = str(root / "models")
    os.environ["AI_LOCAL_STATE_DIR"] = str(root / "state")
    os.environ["AI_LOCAL_JOB_ROOT"] = str(root / "jobs")
    os.environ["AI_LOCAL_HF_CACHE"] = str(root / "downloads" / "cache")
    os.environ["AI_LOCAL_NAKDAN_EAGER"] = "0"
    os.environ["AI_LOCAL_TRANSLATOR_WARMUP"] = "0"
    os.environ["AI_LOCAL_ALLOWED_ORIGINS"] = ",".join(
        (PRODUCTION_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000")
    )
    frozen_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    binary_roots = [
        Path(sys.executable).parent / "bin",
        Path(sys.executable).parent / "_internal" / "bin",
        frozen_root / "bin",
        Path(sys.executable).parent / "cuda",
        Path(sys.executable).parent / "_internal" / "cuda",
        frozen_root / "cuda",
    ]
    os.environ["PATH"] = os.pathsep.join([str(path) for path in binary_roots] + [os.environ.get("PATH", "")])
    return root


MANAGED_ROOT = _bootstrap_environment()

import psutil  # noqa: E402

from ai_local import config  # noqa: E402
from ai_local.asr_constants import ASR_MODEL_REVISION  # noqa: E402
from ai_local.companion_diagnostics import export_diagnostics  # noqa: E402
from ai_local.companion_preflight import preflight_report  # noqa: E402
from ai_local.security import pairing_token  # noqa: E402

CONTROL_ROOT = config.STATE_DIR / "control"
PID_FILE = CONTROL_ROOT / "service.json"
CONTROL_TOKEN_FILE = CONTROL_ROOT / "control-token"
STOP_REQUEST_FILE = CONTROL_ROOT / "stop-request"


def bundled_guide_path(language: str = "ru") -> Path:
    """Resolve an allowlisted guide from source or the frozen Companion bundle."""
    filename = GUIDE_FILENAMES.get(language, GUIDE_FILENAMES["ru"])
    roots = (
        Path(sys.executable).parent,
        Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)),
        Path(__file__).resolve().parents[2],
    )
    for root in roots:
        candidate = root / "docs" / filename
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"BUNDLED_GUIDE_MISSING:{filename}")


def _atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(value, encoding="utf-8")
    try:
        os.chmod(temp, 0o600)
    except OSError:
        pass
    temp.replace(path)


def _command(*args: str) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, *args]
    return [sys.executable, "-m", "ai_local.companion", *args]


def _capability() -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8799/v1/capabilities", timeout=1.0) as response:
            payload = json.loads(response.read(64 * 1024).decode("utf-8"))
        return payload if payload.get("protocol") == "studio-local-asr-v1" else None
    except (OSError, ValueError, urllib.error.URLError):
        return None


def _owned_pid() -> int | None:
    try:
        payload = json.loads(PID_FILE.read_text(encoding="utf-8"))
        pid = int(payload["pid"])
        process = psutil.Process(pid)
        expected = Path(sys.executable).resolve()
        actual = Path(process.exe()).resolve()
        if actual != expected:
            return None
        return pid
    except (OSError, ValueError, KeyError, psutil.Error):
        return None


def service_status() -> dict[str, Any]:
    capability = _capability()
    pid = _owned_pid()
    port_check = next(item for item in preflight_report()["checks"] if item["code"] == "PORT_8799")
    if capability and pid is not None:
        state = "RUNNING"
    elif capability:
        # A valid protocol listener is still not ours unless its PID is
        # authenticated by the per-user control state and executable path.
        state = "UNOWNED_COMPANION"
    elif port_check["observed"].get("state") == "foreign_listener":
        state = "PORT_CONFLICT"
    elif pid is not None:
        state = "STARTING"
    else:
        state = "STOPPED"
    return {
        "state": state,
        "health": "ok" if capability else None,
        "port_state": port_check["observed"].get("state"),
        "owned_pid_present": pid is not None,
    }


def start_service(timeout_sec: float = 20.0) -> dict[str, Any]:
    current = service_status()
    if current["state"] == "RUNNING":
        return current
    if current["state"] == "UNOWNED_COMPANION":
        raise RuntimeError("UNOWNED_COMPANION_PROCESS")
    if current["state"] == "PORT_CONFLICT":
        raise RuntimeError("PORT_CONFLICT")
    CONTROL_ROOT.mkdir(parents=True, exist_ok=True)
    flags = 0
    if os.name == "nt":
        flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
    subprocess.Popen(
        _command("--serve"),
        cwd=str(Path(sys.executable).parent if getattr(sys, "frozen", False) else Path.cwd()),
        env=os.environ.copy(),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
    )
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        status = service_status()
        if status["state"] == "RUNNING":
            return status
        if status["state"] == "UNOWNED_COMPANION":
            raise RuntimeError("UNOWNED_COMPANION_PROCESS")
        if status["state"] == "PORT_CONFLICT":
            raise RuntimeError("PORT_CONFLICT")
        time.sleep(0.25)
    raise RuntimeError("SERVICE_START_TIMEOUT")


def stop_service(timeout_sec: float = 20.0) -> dict[str, Any]:
    pid = _owned_pid()
    if pid is None:
        if _capability():
            raise RuntimeError("UNOWNED_COMPANION_PROCESS")
        for stale in (PID_FILE, STOP_REQUEST_FILE):
            try:
                stale.unlink()
            except FileNotFoundError:
                pass
        return service_status()
    try:
        token = CONTROL_TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise RuntimeError("CONTROL_TOKEN_UNAVAILABLE") from exc
    _atomic_text(STOP_REQUEST_FILE, token + "\n")
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        if not psutil.pid_exists(pid):
            return service_status()
        time.sleep(0.25)
    process = psutil.Process(pid)
    if Path(process.exe()).resolve() != Path(sys.executable).resolve():
        raise RuntimeError("PROCESS_IDENTITY_CHANGED")
    process.terminate()
    try:
        process.wait(timeout=5)
    except psutil.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    return service_status()


def restart_service() -> dict[str, Any]:
    stop_service()
    return start_service()


def _serve() -> int:
    import uvicorn

    from ai_local.main import app

    CONTROL_ROOT.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    _atomic_text(CONTROL_TOKEN_FILE, token + "\n")
    _atomic_text(PID_FILE, json.dumps({"pid": os.getpid(), "version": APP_VERSION}) + "\n")
    try:
        STOP_REQUEST_FILE.unlink()
    except FileNotFoundError:
        pass
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8799, log_level="info", access_log=False))

    def watch_stop() -> None:
        while not server.should_exit:
            try:
                candidate = STOP_REQUEST_FILE.read_text(encoding="utf-8").strip()
            except FileNotFoundError:
                candidate = ""
            except OSError:
                candidate = ""
            if candidate and secrets.compare_digest(candidate, token):
                server.should_exit = True
                break
            time.sleep(0.2)

    watcher = threading.Thread(target=watch_stop, name="companion-stop-watch", daemon=True)
    watcher.start()
    try:
        server.run()
        return 0
    finally:
        for owned in (PID_FILE, CONTROL_TOKEN_FILE, STOP_REQUEST_FILE):
            try:
                owned.unlink()
            except FileNotFoundError:
                pass


def _api(path: str, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Authorization": "Bearer " + pairing_token(), "Origin": "http://127.0.0.1:3000"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request("http://127.0.0.1:8799" + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read(512 * 1024).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read(64 * 1024).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP_{exc.code}:{detail[:200]}") from exc


class CompanionWindow:
    def __init__(self) -> None:
        import tkinter as tk
        from tkinter import ttk

        self.tk = tk
        self.ttk = ttk
        self.root = tk.Tk()
        self.root.title("LinguistPro Local ASR Companion")
        self.root.geometry("760x650")
        self.root.minsize(660, 600)
        self.status_var = tk.StringVar(value="Checking Companion…")
        self.device_var = tk.StringVar(value="Checking Windows/NVIDIA/CUDA…")
        self.model_var = tk.StringVar(value="Checking pinned model…")
        self.pairing_var = tk.StringVar(value="The token is created automatically. Start the service, then copy it here.")
        self.progress_var = tk.DoubleVar(value=0)
        self._build()
        threading.Thread(target=self._ensure_started, daemon=True).start()
        self.root.after(400, self._poll)

    def _build(self) -> None:
        from tkinter import ttk

        frame = ttk.Frame(self.root, padding=22)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Local Hebrew transcription", font=("Segoe UI Semibold", 20)).pack(anchor="w")
        ttk.Label(frame, text="Invite-only beta · Windows 11 · NVIDIA/CUDA · Chrome").pack(anchor="w", pady=(2, 14))
        privacy = ttk.Label(
            frame,
            text="MEDIA  →  THIS COMPUTER  →  127.0.0.1     ☁ cloud upload: off",
            padding=(12, 10),
            relief="solid",
            font=("Consolas", 10),
        )
        privacy.pack(fill="x", pady=(0, 16))
        for title, variable in (("Companion", self.status_var), ("Device", self.device_var), ("Pinned model", self.model_var)):
            row = ttk.Frame(frame)
            row.pack(fill="x", pady=4)
            ttk.Label(row, text=title, width=16, font=("Segoe UI Semibold", 10)).pack(side="left")
            ttk.Label(row, textvariable=variable, wraplength=500).pack(side="left", fill="x", expand=True)
        ttk.Progressbar(frame, variable=self.progress_var, maximum=100).pack(fill="x", pady=(10, 16))

        pairing = ttk.LabelFrame(frame, text="Connect LinguistPro in Chrome", padding=12)
        pairing.pack(fill="x", pady=(5, 8))
        ttk.Label(
            pairing,
            text="1. Wait for Companion: RUNNING   2. Copy the token   3. Paste it in Settings → Experimental Local ASR",
            wraplength=680,
        ).pack(anchor="w")
        pairing_actions = ttk.Frame(pairing)
        pairing_actions.pack(fill="x", pady=(9, 2))
        ttk.Button(pairing_actions, text="Copy token for browser", command=self._copy_token).pack(side="left")
        ttk.Label(pairing_actions, textvariable=self.pairing_var, wraplength=455).pack(side="left", padx=(12, 0), fill="x", expand=True)

        service = ttk.LabelFrame(frame, text="Service", padding=10)
        service.pack(fill="x", pady=5)
        for label, action in (("Start", self._start), ("Stop", self._stop), ("Restart", self._restart)):
            ttk.Button(service, text=label, command=action).pack(side="left", padx=4)

        model = ttk.LabelFrame(frame, text="Model and local data", padding=10)
        model.pack(fill="x", pady=5)
        for label, action in (("Install pinned model…", self._install), ("Cancel download", self._cancel_install), ("Delete model…", self._delete_model), ("Delete jobs…", self._delete_jobs)):
            ttk.Button(model, text=label, command=action).pack(side="left", padx=4)

        support = ttk.Frame(frame)
        support.pack(fill="x", pady=(12, 0))
        ttk.Button(support, text="Export redacted diagnostics…", command=self._diagnostics).pack(side="left")
        ttk.Button(support, text="Help / Справка", command=self._open_help).pack(side="left", padx=(8, 0))
        ttk.Label(
            frame,
            text=f"Companion {APP_VERSION} · model revision {ASR_MODEL_REVISION[:12]}… · Apache-2.0 · unsigned internal build",
            font=("Consolas", 9),
        ).pack(anchor="w", pady=(14, 0))

    def _run(self, func) -> None:
        def target() -> None:
            try:
                func()
            except Exception as exc:
                self.root.after(0, lambda: self._error(str(exc)))

        threading.Thread(target=target, daemon=True).start()

    def _error(self, text: str) -> None:
        from tkinter import messagebox

        messagebox.showerror("Local ASR Companion", text[:500])

    def _ensure_started(self) -> None:
        try:
            start_service()
        except Exception as exc:
            self.root.after(0, lambda: self._error(str(exc)))

    def _start(self) -> None:
        self._run(start_service)

    def _stop(self) -> None:
        self._run(stop_service)

    def _restart(self) -> None:
        self._run(restart_service)

    def _copy_token(self) -> None:
        token = pairing_token()
        self.root.clipboard_clear()
        self.root.clipboard_append(token)
        self.pairing_var.set("Copied. Return to LinguistPro, paste it, and click Connect.")
        self.status_var.set("RUNNING · pairing token copied for this browser session")

    def _open_help(self) -> None:
        try:
            guide = bundled_guide_path("ru")
            subprocess.Popen(
                ["notepad.exe", str(guide)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            self.pairing_var.set("Help opened in Notepad. English and Hebrew guides are bundled too.")
        except Exception as exc:
            self._error(str(exc))

    def _install(self) -> None:
        from tkinter import messagebox

        accepted = messagebox.askyesno(
            "Install pinned Local ASR model",
            "Download about 1.62 GB to this Windows account?\n\n"
            f"ivrit-ai/whisper-large-v3-turbo-ct2\n{ASR_MODEL_REVISION}\n"
            "License: Apache-2.0\n\nThe revision and every runtime SHA-256 will be verified before activation.",
        )
        if accepted:
            self._run(lambda: _api("/v1/asr/model/install", "POST", {"revision": ASR_MODEL_REVISION, "accepted_license": True}))

    def _cancel_install(self) -> None:
        self._run(lambda: _api("/v1/asr/model/install-cancel", "POST"))

    def _delete_model(self) -> None:
        from tkinter import messagebox

        if messagebox.askyesno("Delete Local ASR model", "Delete the managed pinned model from this Windows account?"):
            self._run(lambda: _api("/v1/asr/model", "DELETE"))

    def _delete_jobs(self) -> None:
        from tkinter import messagebox

        if messagebox.askyesno("Delete Local ASR jobs", "Delete all terminal/recoverable local media jobs and outputs?"):
            self._run(lambda: _api("/v1/companion/jobs", "DELETE"))

    def _diagnostics(self) -> None:
        from tkinter import filedialog

        target = filedialog.asksaveasfilename(
            title="Export redacted diagnostics",
            defaultextension=".zip",
            filetypes=[("ZIP archive", "*.zip")],
            initialfile="LinguistPro-Local-ASR-diagnostics.zip",
        )
        if target:
            notices = Path(sys.executable).parent / "THIRD_PARTY_NOTICES.md"
            export_diagnostics(Path(target), APP_VERSION, service_status(), notices)
            self.status_var.set("Redacted diagnostics exported; no media, transcript, filename, or token included.")

    def _poll(self) -> None:
        def gather() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
            status = service_status()
            preflight = preflight_report()
            model = _api("/v1/asr/model/status?verify_hash=true") if status["state"] == "RUNNING" else {"verified": False, "reason": "SERVICE_STOPPED"}
            install = _api("/v1/asr/model/install-status") if status["state"] == "RUNNING" else {"state": "IDLE", "downloaded_bytes": 0, "total_bytes": 1}
            return status, preflight, {"model": model, "install": install}

        def apply(result) -> None:
            try:
                status, preflight, details = result
                self.status_var.set(status["state"])
                failed = [item["code"] for item in preflight["checks"] if not item["ok"] and item["code"] != "PORT_8799"]
                self.device_var.set("Ready" if not failed else "Needs attention: " + ", ".join(failed))
                model, install = details["model"], details["install"]
                self.model_var.set("Verified and ready" if model.get("verified") else f"{install.get('state')}: {model.get('reason') or install.get('error_code') or 'not installed'}")
                total = max(1, int(install.get("total_bytes") or 1))
                self.progress_var.set(min(100, 100 * int(install.get("downloaded_bytes") or 0) / total))
            finally:
                self.root.after(1500, self._poll)

        def background() -> None:
            try:
                result = gather()
                self.root.after(0, lambda: apply(result))
            except Exception:
                self.root.after(0, lambda: apply((service_status(), preflight_report(), {"model": {"reason": "UNAVAILABLE"}, "install": {}})))

        threading.Thread(target=background, daemon=True).start()

    def run(self) -> None:
        self.root.mainloop()


def main(argv: list[str] | None = None) -> int:
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser(description="LinguistPro Local ASR Companion")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--serve", action="store_true")
    group.add_argument("--start", action="store_true")
    group.add_argument("--stop", action="store_true")
    group.add_argument("--restart", action="store_true")
    group.add_argument("--status", action="store_true")
    group.add_argument("--autostart", action="store_true")
    args = parser.parse_args(argv)
    if args.serve:
        return _serve()
    if args.start or args.autostart:
        print(json.dumps(start_service(), indent=2))
        return 0
    if args.stop:
        print(json.dumps(stop_service(), indent=2))
        return 0
    if args.restart:
        print(json.dumps(restart_service(), indent=2))
        return 0
    if args.status:
        print(json.dumps(service_status(), indent=2))
        return 0
    CompanionWindow().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
