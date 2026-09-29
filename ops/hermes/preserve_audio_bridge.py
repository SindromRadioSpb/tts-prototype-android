"""Reapply the existing C1 current-turn bridge to the pinned WebUI release.

Only ephemeral agent input changes; persisted messages and session history do not.
Fail closed on upstream changes instead of applying a fuzzy streaming patch.
"""
import hashlib
import runpy
from pathlib import Path

BASE = "adfd1e371320c4dc1dc6778009f24047ddcd46d9a135866ccffe9d4523086fa4"


def main():
    target = Path("/apptoo/api/streaming.py")
    if hashlib.sha256(target.read_bytes()).hexdigest() != BASE:
        raise RuntimeError("WEBUI_0_52_113_SOURCE_MISMATCH")
    legacy = runpy.run_path(str(Path(__file__).with_name("legacy_audio_patch.py")))
    patch = legacy["patch"]
    patch.__globals__["BASE_SHA256"] = BASE
    digest = patch(target)
    compile(target.read_text(encoding="utf-8"), str(target), "exec")
    print("AUDIO_BRIDGE_SHA256=" + digest)


if __name__ == "__main__":
    main()
