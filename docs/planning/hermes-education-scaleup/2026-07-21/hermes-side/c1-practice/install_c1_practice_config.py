#!/usr/bin/env python3
"""Idempotently install only the local C1 pronunciation MCP mapping."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

CONFIG = Path(os.environ.get("HERMES_CONFIG", "/home/hermeswebui/.hermes/config.yaml"))
SERVER_NAME = "c1_pronunciation"
SERVER = {
    "command": "/bin/sh",
    "args": [
        "-lc",
        'exec "${HERMES_HOME:-$HOME/.hermes}/mcp-runtimes/c1-py312/bin/python" '
        "/workspace/mcp-servers/c1-pronunciation/c1_practice_mcp.py",
    ],
    "env": {
        "C1_ATTACHMENT_ROOT": "/home/hermeswebui/.hermes/webui/attachments",
        "C1_ASR_MODEL_DIR": "/workspace/models/ivrit-ai-whisper-large-v3-turbo-ct2",
        "C1_COMPANION_MODULE": "/workspace/mcp-servers/c1-pronunciation/c1_companion.py",
        "C1_FROZEN_DIR": "/workspace/mcp-servers/c1-pronunciation/frozen",
        "C1_PROFILE": "/workspace/private/c1-practice/profile.json",
        "C1_PHONIKUD_MODEL": "/workspace/models/c1-pronunciation/phonikud-1.0.int8.onnx",
        "C1_PHONIKUD_TOKENIZER": "/workspace/models/c1-pronunciation/dictabert-tokenizer.json",
        "C1_TORCH_HOME": "/workspace/models/c1-pronunciation/torch-cache",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "C1_SCRATCH": "/workspace/private/c1-practice/requests",
        "C1_CPU_THREADS": "6",
    },
    "enabled": True,
    "supports_parallel_tool_calls": False,
    "timeout": 600,
    "connect_timeout": 30,
    "tools": {
        "include": [
            "list_pronunciation_exercises",
            "evaluate_pronunciation_attempt",
            "transcribe_reading_attempt",
            "discard_pronunciation_attachment",
        ],
        "resources": False,
        "prompts": False,
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()

    document = yaml.safe_load(CONFIG.read_text(encoding="utf-8")) or {}
    servers = document.setdefault("mcp_servers", {})
    before = sha256(CONFIG)
    if args.remove:
        changed = servers.pop(SERVER_NAME, None) is not None
        action = "removed"
    else:
        scratch = Path(SERVER["env"]["C1_SCRATCH"])
        scratch.mkdir(parents=True, exist_ok=True)
        # The Hermes MCP sandbox may use a remapped uid. The sticky directory is
        # owner-host-local; each scratch file is private (mkstemp mode 0600) and
        # the scorer deletes it in finally on both success and failure.
        scratch.chmod(0o1777)
        changed = servers.get(SERVER_NAME) != SERVER
        servers[SERVER_NAME] = SERVER
        action = "installed"
    if not changed:
        print(f"NO_CHANGE action={action} sha256={before}")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = CONFIG.with_name(f"config.yaml.pre-c1-practice-{stamp}.bak")
    shutil.copy2(CONFIG, backup)
    rendered = yaml.safe_dump(document, allow_unicode=True, sort_keys=False)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=CONFIG.parent, delete=False) as tmp:
        tmp.write(rendered)
        temp_path = Path(tmp.name)
    os.replace(temp_path, CONFIG)
    print(f"OK action={action} before_sha256={before} after_sha256={sha256(CONFIG)} backup={backup.name}")


if __name__ == "__main__":
    main()
