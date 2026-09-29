"""Add a separate, four-tool LinguistPro tutor MCP profile to an existing Hermes home.

No OAuth token is read or changed here. The existing `linguistpro` profile is left
untouched; its current grants and tool selection remain a rollback path.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

from ruamel.yaml import YAML

ALIAS = "linguistpro_tutor"
TOOLS = ["get_tutor_capabilities", "get_active_learning_context", "get_tutor_session", "propose_learning_artifact"]
SCOPES = ["tutor.capabilities.read", "tutor.context.read", "tutor.session.read", "tutor.artifact.propose"]
URL = "https://linguistpro.kolosei.com/agent-access/mcp"
TUTOR_URL = "https://linguistpro.kolosei.com/agent-access/tutor/mcp"


def configure(path: Path, apply: bool) -> dict:
    if not path.is_file() or path.is_symlink():
        raise RuntimeError("HERMES_CONFIG_UNAVAILABLE")
    source = path.read_bytes()
    original_hash = hashlib.sha256(source).hexdigest()
    yaml = YAML()
    data = yaml.load(source.decode("utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("mcp_servers"), dict):
        raise RuntimeError("HERMES_MCP_CONFIG_INVALID")
    servers = data["mcp_servers"]
    old = servers.get("linguistpro")
    if not isinstance(old, dict) or old.get("url") != URL or old.get("auth") != "oauth":
        raise RuntimeError("LINGUISTPRO_MCP_SOURCE_UNSUPPORTED")
    oauth = old.get("oauth")
    if not isinstance(oauth, dict) or not oauth.get("client_id") or not isinstance(oauth.get("redirect_port"), int):
        raise RuntimeError("LINGUISTPRO_MCP_OAUTH_UNSUPPORTED")
    expected = {
        "url": TUTOR_URL,
        "auth": "oauth",
        "oauth": {"client_id": oauth["client_id"], "redirect_port": oauth["redirect_port"], "scope": " ".join(SCOPES)},
        "tools": {"include": TOOLS, "prompts": False, "resources": False},
        "enabled": True,
        "supports_parallel_tool_calls": False,
    }
    present = servers.get(ALIAS)
    if present is not None:
        old_alias = copy.deepcopy(expected)
        old_alias["url"] = URL
        if present not in (expected, old_alias):
            raise RuntimeError("TUTOR_MCP_PROFILE_CONFLICT")
        if present == expected:
            return {"prepared": True, "changed": False, "tool_count": len(TOOLS), "scope_count": len(SCOPES)}
    if not apply:
        return {"prepared": False, "changed": False, "tool_count": len(TOOLS), "scope_count": len(SCOPES)}
    before = copy.deepcopy(data)
    before["mcp_servers"].pop(ALIAS, None)
    servers[ALIAS] = expected
    output = io.StringIO()
    yaml.dump(data, output)
    serialized = output.getvalue().encode("utf-8")
    checked = yaml.load(serialized.decode("utf-8"))
    checked["mcp_servers"].pop(ALIAS)
    if checked != before:
        raise RuntimeError("HERMES_CONFIG_SEMANTIC_DRIFT")
    if hashlib.sha256(path.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError("HERMES_CONFIG_CHANGED_CONCURRENTLY")
    backup_dir = path.parent / "linguistpro-tutor"
    backup_dir.mkdir(mode=0o700, exist_ok=True)
    os.chmod(backup_dir, 0o700)
    backup = backup_dir / f"config-before-tutor-mcp-{original_hash[:16]}.yaml"
    if not backup.exists():
        with backup.open("xb") as file:
            os.chmod(backup, 0o600)
            file.write(source)
    fd, temporary = tempfile.mkstemp(prefix="config-tutor-", dir=path.parent)
    try:
        os.fchmod(fd, stat.S_IMODE(path.stat().st_mode))
        with os.fdopen(fd, "wb") as file:
            file.write(serialized)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {"prepared": True, "changed": True, "tool_count": len(TOOLS), "scope_count": len(SCOPES)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    home = Path(os.environ.get("HERMES_HOME", "/home/hermes/.hermes"))
    target = args.config or home / "config.yaml"
    try:
        print(json.dumps(configure(target, args.apply), separators=(",", ":")))
    except Exception as error:
        print(json.dumps({"prepared": False, "error": str(error)}, separators=(",", ":")), file=sys.stderr)
        raise SystemExit(1)
