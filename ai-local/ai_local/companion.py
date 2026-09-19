"""Per-user Windows supervisor and desktop UI for local ASR/MT invite betas."""

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
    # Keep the private smoke marker in the child environment: --start launches
    # a second frozen process, which must bind the same isolated build port.
    build_smoke_port = os.environ.get("AI_LOCAL_BUILD_SMOKE_PORT", "").strip()
    os.environ["AI_LOCAL_PORT"] = build_smoke_port or "8799"
    os.environ["AI_LOCAL_ASR_ENABLED"] = "1"
    os.environ["AI_LOCAL_MT_ENABLED"] = "1"
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

from ai_local import companion_i18n, companion_settings, config  # noqa: E402
from ai_local.asr_constants import ASR_MODEL_REVISION  # noqa: E402
from ai_local.companion_diagnostics import export_diagnostics  # noqa: E402
from ai_local.companion_preflight import preflight_report  # noqa: E402
from ai_local.security import pairing_token  # noqa: E402
from ai_local.version import COMPANION_VERSION  # noqa: E402

# One string, one place: the window, the diagnostics bundle, the installer defines and the
# artifact filename all derive from ai_local.version, so the installed app cannot claim a
# different version from the installer that carried it.
APP_VERSION = COMPANION_VERSION

CONTROL_ROOT = config.STATE_DIR / "control"
PID_FILE = CONTROL_ROOT / "service.json"
CONTROL_TOKEN_FILE = CONTROL_ROOT / "control-token"
STOP_REQUEST_FILE = CONTROL_ROOT / "stop-request"


def _loopback_base() -> str:
    return f"http://127.0.0.1:{config.PORT}"


def mt_runtime_report() -> dict[str, Any]:
    """Fail closed when the frozen build cannot run the pinned MT converter stack."""
    import accelerate
    import torch
    from ctranslate2.converters import TransformersConverter

    torch_version = str(torch.__version__)
    accelerate_version = str(accelerate.__version__)
    if torch_version.split("+", 1)[0] != "2.5.1":
        raise RuntimeError("MT_RUNTIME_TORCH_VERSION_MISMATCH")
    if accelerate_version != "1.13.0":
        raise RuntimeError("MT_RUNTIME_ACCELERATE_VERSION_MISMATCH")
    if not callable(TransformersConverter):
        raise RuntimeError("MT_RUNTIME_CONVERTER_UNAVAILABLE")
    return {
        "status": "ok",
        "torch": torch_version,
        "accelerate": accelerate_version,
        "converter": "ctranslate2.TransformersConverter",
    }


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
        request = urllib.request.Request(
            _loopback_base() + "/v1/capabilities",
            headers={
                "Authorization": "Bearer " + pairing_token(),
                "Origin": "http://127.0.0.1:3000",
            },
        )
        with urllib.request.urlopen(request, timeout=1.0) as response:
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
    server = uvicorn.Server(uvicorn.Config(app, host=config.HOST, port=config.PORT, log_level="info", access_log=False))

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
    request = urllib.request.Request(_loopback_base() + path, data=data, headers=headers, method=method)
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
        self.language = companion_settings.ui_language()
        self.gpu_encoder_available: bool | None = None
        self.root = tk.Tk()
        self.root.title(self.t("app.title"))
        self.root.geometry("760x820")
        self.root.minsize(620, 480)
        self.status_var = tk.StringVar(value=self.t("status.checkingCompanion"))
        self.device_var = tk.StringVar(value=self.t("status.checkingDevice"))
        self.model_var = tk.StringVar(value=self.t("status.checkingModel"))
        self.mt_model_var = tk.StringVar(value=self.t("status.checkingMtModel"))
        self.pairing_var = tk.StringVar(value=self.t("pairing.idle"))
        self.encoder_probe_var = tk.StringVar(value=self.t("settings.encoderProbing"))
        self.language_var = tk.StringVar(value=companion_i18n.LANGUAGE_NAMES[self.language])
        self.encoder_var = tk.StringVar(value=companion_settings.media_hw_encoder())
        self.progress_var = tk.DoubleVar(value=0)
        self.mt_progress_var = tk.DoubleVar(value=0)
        self.frame = None
        self._build()
        threading.Thread(target=self._ensure_started, daemon=True).start()
        threading.Thread(target=self._probe_encoder, daemon=True).start()
        self.root.after(400, self._poll)

    def t(self, key: str, **fields: Any) -> str:
        return companion_i18n.translate(self.language, key, **fields)

    def _build(self) -> None:
        import tkinter as tk
        from tkinter import ttk

        # The body scrolls. The window already needed more height than a 1366x768 laptop can
        # show, and the part that falls off the bottom edge is the version footer - exactly
        # what someone opens this window to check after installing a new build.
        outer = ttk.Frame(self.root)
        outer.pack(fill="both", expand=True)
        canvas = tk.Canvas(outer, highlightthickness=0, borderwidth=0)
        scrollbar = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        frame = ttk.Frame(canvas, padding=22)
        body = canvas.create_window((0, 0), window=frame, anchor="nw")
        frame.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(body, width=event.width))
        canvas.bind_all("<MouseWheel>", lambda event: canvas.yview_scroll(int(-event.delta / 120), "units"))
        self.frame = outer
        ttk.Label(frame, text=self.t("app.heading"), font=("Segoe UI Semibold", 20)).pack(anchor="w")
        ttk.Label(frame, text=self.t("app.subtitle")).pack(anchor="w", pady=(2, 14))
        privacy = ttk.Label(
            frame,
            text=self.t("app.privacy"),
            padding=(12, 10),
            relief="solid",
            font=("Consolas", 10),
        )
        privacy.pack(fill="x", pady=(0, 12))
        for title, variable in (("row.companion", self.status_var), ("row.device", self.device_var), ("row.asrModel", self.model_var), ("row.mtModel", self.mt_model_var)):
            row = ttk.Frame(frame)
            row.pack(fill="x", pady=4)
            ttk.Label(row, text=self.t(title), width=22, font=("Segoe UI Semibold", 10)).pack(side="left")
            ttk.Label(row, textvariable=variable, wraplength=440).pack(side="left", fill="x", expand=True)
        ttk.Progressbar(frame, variable=self.progress_var, maximum=100).pack(fill="x", pady=(8, 8))
        ttk.Progressbar(frame, variable=self.mt_progress_var, maximum=100).pack(fill="x", pady=(0, 10))

        pairing = ttk.LabelFrame(frame, text=self.t("pairing.frame"), padding=12)
        pairing.pack(fill="x", pady=(5, 8))
        ttk.Label(pairing, text=self.t("pairing.steps"), wraplength=680).pack(anchor="w")
        pairing_actions = ttk.Frame(pairing)
        pairing_actions.pack(fill="x", pady=(9, 2))
        ttk.Button(pairing_actions, text=self.t("pairing.copy"), command=self._copy_token).pack(side="left")
        ttk.Label(pairing_actions, textvariable=self.pairing_var, wraplength=455).pack(side="left", padx=(12, 0), fill="x", expand=True)

        service = ttk.LabelFrame(frame, text=self.t("service.frame"), padding=10)
        service.pack(fill="x", pady=5)
        for label, action in (("service.start", self._start), ("service.stop", self._stop), ("service.restart", self._restart)):
            ttk.Button(service, text=self.t(label), command=action).pack(side="left", padx=4)

        model = ttk.LabelFrame(frame, text=self.t("model.frame"), padding=10)
        model.pack(fill="x", pady=5)
        for label, action in (("model.install", self._install), ("model.cancel", self._cancel_install), ("model.delete", self._delete_model), ("model.deleteJobs", self._delete_jobs)):
            ttk.Button(model, text=self.t(label), command=action).pack(side="left", padx=4)

        mt_model = ttk.LabelFrame(frame, text=self.t("mt.frame"), padding=10)
        mt_model.pack(fill="x", pady=5)
        for label, action in (("mt.install", self._install_mt), ("mt.cancel", self._cancel_mt_install), ("mt.delete", self._delete_mt_model)):
            ttk.Button(mt_model, text=self.t(label), command=action).pack(side="left", padx=4)

        self._build_settings(frame)

        support = ttk.Frame(frame)
        support.pack(fill="x", pady=(10, 0))
        ttk.Button(support, text=self.t("support.diagnostics"), command=self._diagnostics).pack(side="left")
        ttk.Button(support, text=self.t("support.help"), command=self._open_help).pack(side="left", padx=(8, 0))
        ttk.Label(
            frame,
            text=self.t("app.footer", version=APP_VERSION, revision=ASR_MODEL_REVISION[:12]),
            font=("Consolas", 9),
        ).pack(anchor="w", pady=(10, 0))

    def _build_settings(self, parent) -> None:
        """Stored options: they survive a restart and do not depend on who started this process."""
        from tkinter import ttk

        settings = ttk.LabelFrame(parent, text=self.t("settings.frame"), padding=10)
        settings.pack(fill="x", pady=5)

        language_row = ttk.Frame(settings)
        language_row.pack(fill="x")
        ttk.Label(language_row, text=self.t("settings.language"), width=22).pack(side="left")
        chooser = ttk.Combobox(
            language_row, textvariable=self.language_var, state="readonly", width=14,
            values=[companion_i18n.LANGUAGE_NAMES[code] for code in companion_i18n.LANGUAGES],
        )
        chooser.pack(side="left")
        chooser.bind("<<ComboboxSelected>>", self._on_language_changed)

        encoder_row = ttk.Frame(settings)
        encoder_row.pack(fill="x", pady=(10, 0))
        ttk.Label(encoder_row, text=self.t("settings.encoder"), width=22).pack(side="left", anchor="n")
        options = ttk.Frame(encoder_row)
        options.pack(side="left", fill="x", expand=True)
        for value, label in (("off", "settings.encoderCpu"), ("auto", "settings.encoderGpu")):
            ttk.Radiobutton(
                options, text=self.t(label), value=value, variable=self.encoder_var,
                command=self._on_encoder_changed,
            ).pack(anchor="w")
        ttk.Label(options, textvariable=self.encoder_probe_var, wraplength=470,
                  font=("Segoe UI", 8)).pack(anchor="w", pady=(4, 0))
        ttk.Label(options, text=self.t("settings.encoderHint"), wraplength=470,
                  font=("Segoe UI", 8)).pack(anchor="w")

    def _rebuild(self) -> None:
        """Rebuild in the chosen language; the next poll refreshes the live status lines."""
        if self.frame is not None:
            self.frame.destroy()
        self.root.title(self.t("app.title"))
        self.status_var.set(self.t("status.checkingCompanion"))
        self.device_var.set(self.t("status.checkingDevice"))
        self.model_var.set(self.t("status.checkingModel"))
        self.mt_model_var.set(self.t("status.checkingMtModel"))
        self.pairing_var.set(self.t("pairing.idle"))
        self.encoder_probe_var.set(
            self.t("settings.encoderProbing") if self.gpu_encoder_available is None
            else self.t("settings.encoderAvailable" if self.gpu_encoder_available else "settings.encoderUnavailable")
        )
        self._build()

    def _on_language_changed(self, _event=None) -> None:
        names = {name: code for code, name in companion_i18n.LANGUAGE_NAMES.items()}
        code = names.get(self.language_var.get(), self.language)
        if code == self.language:
            return
        if not self._store_setting("ui_language", code):
            self.language_var.set(companion_i18n.LANGUAGE_NAMES[self.language])
            return
        self.language = code
        self._rebuild()

    def _on_encoder_changed(self) -> None:
        if not self._store_setting("media_hw_encoder", self.encoder_var.get()):
            self.encoder_var.set(companion_settings.media_hw_encoder())

    def _store_setting(self, key: str, value: str) -> bool:
        """A setting that could not be written must not look applied."""
        try:
            companion_settings.update_setting(key, value)
            return True
        except Exception as exc:
            self._error(self.t("settings.saveFailed", error=str(exc)))
            return False

    def _probe_encoder(self) -> None:
        """Ask this machine, not the ffmpeg build, whether it can encode on the GPU."""
        try:
            from ai_local.media_compat import gpu_encoder_available_blocking

            available = bool(gpu_encoder_available_blocking())
        except Exception:
            available = False
        self.gpu_encoder_available = available
        key = "settings.encoderAvailable" if available else "settings.encoderUnavailable"
        self.root.after(0, lambda: self.encoder_probe_var.set(self.t(key)))

    def _run(self, func) -> None:
        def target() -> None:
            try:
                func()
            except Exception as exc:
                self.root.after(0, lambda: self._error(str(exc)))

        threading.Thread(target=target, daemon=True).start()

    def _error(self, text: str) -> None:
        from tkinter import messagebox

        messagebox.showerror(self.t("dialog.error"), text[:500])

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
        self.pairing_var.set(self.t("pairing.copied"))
        self.status_var.set(self.t("pairing.copiedStatus"))

    def _open_help(self) -> None:
        try:
            guide = bundled_guide_path("ru" if self.language == "ru" else "en")
            subprocess.Popen(
                ["notepad.exe", str(guide)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            self.pairing_var.set(self.t("support.helpOpened"))
        except Exception as exc:
            self._error(str(exc))

    def _install(self) -> None:
        from tkinter import messagebox

        accepted = messagebox.askyesno(
            self.t("dialog.installAsrTitle"),
            self.t("dialog.installAsrBody", revision=ASR_MODEL_REVISION),
        )
        if accepted:
            self._run(lambda: _api("/v1/asr/model/install", "POST", {"revision": ASR_MODEL_REVISION, "accepted_license": True}))

    def _cancel_install(self) -> None:
        self._run(lambda: _api("/v1/asr/model/install-cancel", "POST"))

    def _delete_model(self) -> None:
        from tkinter import messagebox

        if messagebox.askyesno(self.t("dialog.deleteAsrTitle"), self.t("dialog.deleteAsrBody")):
            self._run(lambda: _api("/v1/asr/model", "DELETE"))

    def _delete_jobs(self) -> None:
        from tkinter import messagebox

        if messagebox.askyesno(self.t("dialog.deleteJobsTitle"), self.t("dialog.deleteJobsBody")):
            self._run(lambda: _api("/v1/companion/jobs", "DELETE"))

    def _install_mt(self) -> None:
        from tkinter import messagebox
        from ai_local.mt_constants import MT_MODEL_REVISION

        accepted = messagebox.askyesno(
            self.t("dialog.installMtTitle"),
            self.t("dialog.installMtBody", revision=MT_MODEL_REVISION),
        )
        if accepted:
            self._run(lambda: _api("/v1/mt/model/install", "POST", {"revision": MT_MODEL_REVISION, "accepted_license": True}))

    def _cancel_mt_install(self) -> None:
        self._run(lambda: _api("/v1/mt/model/install-cancel", "POST"))

    def _delete_mt_model(self) -> None:
        from tkinter import messagebox
        if messagebox.askyesno(self.t("dialog.deleteMtTitle"), self.t("dialog.deleteMtBody")):
            self._run(lambda: _api("/v1/mt/model", "DELETE"))

    def _diagnostics(self) -> None:
        from tkinter import filedialog

        target = filedialog.asksaveasfilename(
            title=self.t("dialog.diagnosticsTitle"),
            defaultextension=".zip",
            filetypes=[(self.t("dialog.zipFilter"), "*.zip")],
            initialfile="LinguistPro-Local-ASR-diagnostics.zip",
        )
        if target:
            notices = Path(sys.executable).parent / "THIRD_PARTY_NOTICES.md"
            export_diagnostics(Path(target), APP_VERSION, service_status(), notices)
            self.status_var.set(self.t("support.diagnosticsDone"))

    def _poll(self) -> None:
        def gather() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
            status = service_status()
            preflight = preflight_report()
            model = _api("/v1/asr/model/status?verify_hash=true") if status["state"] == "RUNNING" else {"verified": False, "reason": "SERVICE_STOPPED"}
            install = _api("/v1/asr/model/install-status") if status["state"] == "RUNNING" else {"state": "IDLE", "downloaded_bytes": 0, "total_bytes": 1}
            mt_model = _api("/v1/mt/model/status") if status["state"] == "RUNNING" else {"verified": False, "reason": "SERVICE_STOPPED"}
            mt_install = _api("/v1/mt/model/install-status") if status["state"] == "RUNNING" else {"state": "IDLE", "processed_bytes": 0, "total_bytes": 1}
            return status, preflight, {"model": model, "install": install, "mt_model": mt_model, "mt_install": mt_install}

        def apply(result) -> None:
            try:
                status, preflight, details = result
                self.status_var.set(status["state"])
                failed = [item["code"] for item in preflight["checks"] if not item["ok"] and item["code"] != "PORT_8799"]
                self.device_var.set(self.t("status.deviceReady") if not failed else self.t("status.deviceAttention", codes=", ".join(failed)))
                model, install = details["model"], details["install"]
                self.model_var.set(self.t("status.modelVerified") if model.get("verified") else self.t(
                    "status.modelNot", state=install.get("state"),
                    reason=model.get("reason") or install.get("error_code") or self.t("status.notInstalled")))
                total = max(1, int(install.get("total_bytes") or 1))
                self.progress_var.set(min(100, 100 * int(install.get("downloaded_bytes") or 0) / total))
                mt_model, mt_install = details["mt_model"], details["mt_install"]
                self.mt_model_var.set(self.t("status.modelVerified") if mt_model.get("verified") else self.t(
                    "status.modelNot", state=mt_install.get("state"),
                    reason=mt_model.get("reason") or mt_install.get("error_code") or self.t("status.notInstalled")))
                mt_total = max(1, int(mt_install.get("total_bytes") or 1))
                self.mt_progress_var.set(min(100, 100 * int(mt_install.get("processed_bytes") or 0) / mt_total))
            finally:
                self.root.after(1500, self._poll)

        def background() -> None:
            try:
                result = gather()
                self.root.after(0, lambda: apply(result))
            except Exception:
                self.root.after(0, lambda: apply((service_status(), preflight_report(), {"model": {"reason": "UNAVAILABLE"}, "install": {}, "mt_model": {"reason": "UNAVAILABLE"}, "mt_install": {}})))

        threading.Thread(target=background, daemon=True).start()

    def run(self) -> None:
        self.root.mainloop()


def main(argv: list[str] | None = None) -> int:
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser(description="LinguistPro Local AI Companion")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--serve", action="store_true")
    group.add_argument("--start", action="store_true")
    group.add_argument("--stop", action="store_true")
    group.add_argument("--restart", action="store_true")
    group.add_argument("--status", action="store_true")
    group.add_argument("--autostart", action="store_true")
    group.add_argument("--convert-mt-worker", nargs=2, metavar=("SOURCE", "OUTPUT"))
    group.add_argument("--mt-runtime-check", action="store_true")
    group.add_argument("--subtitle-runtime-check", action="store_true")
    # The build asks the frozen binary itself which version it is and refuses to name the
    # installer differently: a gate that only re-reads the same source file would have passed
    # while the window said beta.9 inside a beta.10 installer.
    group.add_argument("--app-version", action="store_true")
    args = parser.parse_args(argv)
    if args.app_version:
        print(json.dumps({"companion_version": APP_VERSION}, sort_keys=True))
        return 0
    if args.subtitle_runtime_check:
        from ai_local.subtitle_sync import runtime_report
        print(json.dumps(runtime_report(), sort_keys=True))
        return 0
    if args.mt_runtime_check:
        print(json.dumps(mt_runtime_report(), sort_keys=True))
        return 0
    if args.serve:
        return _serve()
    if args.convert_mt_worker:
        from ai_local.mt_convert_worker import convert
        convert(Path(args.convert_mt_worker[0]), Path(args.convert_mt_worker[1]))
        return 0
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
