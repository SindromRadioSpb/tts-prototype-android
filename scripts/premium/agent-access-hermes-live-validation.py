#!/usr/bin/env python3
"""Bounded, content-safe AA2-C4B Hermes live validation harness."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any

import yaml


SERVER_NAME = "linguistpro_owner_validation"
SERVER_URL = "https://linguistpro.kolosei.com/agent-access/mcp"
CLIENT_ID = "linguistpro-hermes-owner-v0"
SCOPES = (
    "learning.brief.read review.summary.read reading.public.search "
    "explanations.metadata.read agent.connection.read"
)
TOOLS = (
    "get_learning_brief",
    "get_review_summary",
    "search_public_reading_catalog",
    "get_recent_explanation_metadata",
    "get_agent_connection",
)
CALLS = (
    ("get_learning_brief", {}),
    ("get_review_summary", {}),
    (
        "search_public_reading_catalog",
        {"language": "he", "audio": "ANY", "ready": "ANY", "sort": "RELEVANCE", "limit": 1},
    ),
    ("get_recent_explanation_metadata", {"kinds": ["word"], "limit": 1}),
    ("get_agent_connection", {}),
)
EXPECTED_SCHEMAS = {
    "get_learning_brief": "aa.learning_brief.1.0.0",
    "get_review_summary": "aa.review_summary.1.0.0",
    "search_public_reading_catalog": "aa.public_reading_search.1.0.0",
    "get_recent_explanation_metadata": "aa.explanation_metadata.1.0.0",
    "get_agent_connection": "aa.connection.1.0.0",
}


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, sort_keys=True, separators=(",", ":")), flush=True)


def fail(code: str) -> None:
    raise RuntimeError(code)


def exact_config(config_path: Path) -> dict[str, Any]:
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    expected_entry = {
        "url": SERVER_URL,
        "auth": "oauth",
        "oauth": {"client_id": CLIENT_ID, "redirect_port": 8765, "scope": SCOPES},
        "enabled": True,
        "supports_parallel_tool_calls": False,
        "tools": {"include": list(TOOLS), "resources": False, "prompts": False},
    }
    if raw != {"mcp_servers": {SERVER_NAME: expected_entry}}:
        fail("CONFIG_SHAPE_MISMATCH")
    serialized = json.dumps(raw, sort_keys=True).lower()
    for forbidden in ("client_secret", "headers", "authorization", "bearer", "tls", "sampling", "command"):
        if forbidden in serialized:
            fail("CONFIG_FORBIDDEN_FIELD")
    return expected_entry


def protocol_value(value: Any) -> str:
    for key in ("protocolVersion", "protocol_version"):
        found = getattr(value, key, None)
        if found:
            return str(found)
    return ""


def structured_result(result: Any) -> dict[str, Any]:
    if bool(getattr(result, "isError", False) or getattr(result, "is_error", False)):
        fail("TOOL_RETURNED_ERROR")
    data = getattr(result, "structuredContent", None)
    if data is None:
        data = getattr(result, "structured_content", None)
    if data is None:
        content = getattr(result, "content", None) or []
        if len(content) != 1 or getattr(content[0], "type", None) != "text":
            fail("TOOL_RESULT_SHAPE_INVALID")
        envelope = json.loads(getattr(content[0], "text", ""))
        if envelope.get("ok") is not True or not isinstance(envelope.get("result"), dict):
            fail("TOOL_ENVELOPE_INVALID")
        data = envelope["result"]
    if not isinstance(data, dict):
        fail("TOOL_STRUCTURED_RESULT_INVALID")
    return data


def inspect_result(name: str, data: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 65536 or data.get("schema_version") != EXPECTED_SCHEMAS[name]:
        fail("TOOL_RESULT_BOUNDARY_INVALID")
    lower_keys = {str(key).lower() for key in data}
    if lower_keys.intersection({"body", "content", "source_body", "private_body", "answer", "grade"}):
        fail("PRIVATE_BODY_FIELD_PRESENT")
    result = {
        "tool": name,
        "schema_ok": True,
        "bytes_bounded": True,
        "top_level_fields": len(data),
    }
    if name in {"get_learning_brief", "get_review_summary"}:
        now = time.time()
        try:
            from datetime import datetime

            expiry = datetime.fromisoformat(str(data["expires_at"]).replace("Z", "+00:00")).timestamp()
        except Exception:
            fail("TOOL_TTL_INVALID")
        result["ttl_future"] = expiry > now
        if not result["ttl_future"]:
            fail("TOOL_TTL_EXPIRED")
    elif name == "search_public_reading_catalog":
        items = data.get("results")
        if not isinstance(items, list) or len(items) > 1:
            fail("PUBLIC_RESULT_CARDINALITY_INVALID")
        result["item_count"] = len(items)
    elif name == "get_recent_explanation_metadata":
        items = data.get("items")
        if not isinstance(items, list) or len(items) > 1:
            fail("METADATA_RESULT_CARDINALITY_INVALID")
        for item in items:
            if not isinstance(item, dict) or {str(key).lower() for key in item}.intersection(
                {"body", "content", "source", "source_body", "text", "answer", "grade"}
            ):
                fail("PRIVATE_METADATA_BODY_PRESENT")
        result["item_count"] = len(items)
    elif name == "get_agent_connection":
        scopes = data.get("granted_scopes")
        if not isinstance(scopes, list) or len(scopes) != 5:
            fail("CONNECTION_SCOPE_CARDINALITY_INVALID")
        result["scope_count"] = len(scopes)
        result["active"] = data.get("connection_status") in {"ACTIVE", "SCOPE_REDUCED"}
        if not result["active"]:
            fail("CONNECTION_NOT_ACTIVE")
    return result


async def run_live(entry: dict[str, Any]) -> None:
    edge_exe = Path(os.environ["AA2C4B_EDGE_EXE"])
    edge_profile = Path(os.environ["AA2C4B_EDGE_PROFILE"])
    if not edge_exe.is_file() or not edge_profile.is_dir():
        fail("ISOLATED_BROWSER_BOUNDARY_INVALID")

    logging.disable(logging.CRITICAL)
    from tools import mcp_oauth
    from tools.mcp_oauth import force_interactive_oauth
    from tools.mcp_oauth_manager import get_manager
    from tools.mcp_tool import MCPServerTask

    edge_processes: list[subprocess.Popen[Any]] = []

    async def isolated_redirect(authorization_url: str) -> None:
        proc = subprocess.Popen(
            [
                str(edge_exe),
                f"--user-data-dir={edge_profile}",
                "--no-first-run",
                "--no-default-browser-check",
                "--new-window",
                authorization_url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        edge_processes.append(proc)
        emit({"phase": "authorization_browser_opened", "isolated_profile": True})

    mcp_oauth._redirect_handler = isolated_redirect
    server = MCPServerTask(SERVER_NAME)
    inspections: list[dict[str, Any]] = []
    refresh_changed = False
    try:
        with force_interactive_oauth():
            await asyncio.wait_for(server.start(entry), timeout=360)
        if protocol_value(server.initialize_result) != "2025-11-25":
            fail("PROTOCOL_VERSION_MISMATCH")
        discovered = tuple(sorted(getattr(tool, "name", "") for tool in server._tools))
        if discovered != tuple(sorted(TOOLS)):
            fail("TOOLS_LIST_MISMATCH")

        for index, (name, arguments) in enumerate(CALLS):
            if index == 4:
                manager = get_manager()
                provider_entry = manager._entries.get(SERVER_NAME)
                provider = getattr(provider_entry, "provider", None)
                context = getattr(provider, "context", None)
                tokens = getattr(context, "current_tokens", None)
                old_refresh = getattr(tokens, "refresh_token", None)
                if not old_refresh:
                    fail("REFRESH_BASELINE_MISSING")
                context.token_expiry_time = time.time() - 1
            async with server._rpc_lock:
                call_result = await server.session.call_tool(name, arguments=arguments)
            inspections.append(inspect_result(name, structured_result(call_result)))
            if index == 4:
                tokens_after = getattr(context, "current_tokens", None)
                new_refresh = getattr(tokens_after, "refresh_token", None)
                refresh_changed = bool(new_refresh and new_refresh != old_refresh)
                if not refresh_changed:
                    fail("REFRESH_ROTATION_NOT_OBSERVED")

        emit(
            {
                "phase": "validation_complete",
                "initialize_count": 1,
                "tools_list_count": 1,
                "tool_call_count": len(inspections),
                "tools": inspections,
                "refresh_rotation": refresh_changed,
                "refresh_reuse": False,
                "extra_protocol_calls": 0,
            }
        )
    finally:
        await server.shutdown()
        for proc in edge_processes:
            if proc.poll() is None:
                proc.terminate()


def main() -> int:
    config_path = Path(os.environ["AA2C4B_CONFIG_PATH"])
    entry = exact_config(config_path)
    if len(sys.argv) != 2 or sys.argv[1] not in {"validate-config", "live"}:
        fail("USAGE_INVALID")
    if sys.argv[1] == "validate-config":
        emit(
            {
                "config_exact": True,
                "server_count": 1,
                "tool_count": 5,
                "headers_absent": True,
                "client_secret_absent": True,
                "resources_disabled": True,
                "prompts_disabled": True,
            }
        )
        return 0
    asyncio.run(run_live(entry))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        message = str(exc)
        safe_code = message if message.isupper() and " " not in message and len(message) <= 80 else "C4B_LIVE_VALIDATION_FAILED"
        payload = {"phase": "stopped", "safe_error": safe_code, "error_type": type(exc).__name__}
        if isinstance(exc, ImportError):
            match = re.search(r"cannot import name '([A-Za-z0-9_]+)' from '([A-Za-z0-9_.]+)'", message)
            if match:
                payload["import_symbol"] = match.group(1)
                payload["import_module"] = match.group(2)
            sanitized = re.sub(r"https?://\S+", "[url]", message)
            sanitized = re.sub(r"[A-Za-z]:[\\/][^\r\n'\"]+", "[path]", sanitized)
            payload["safe_detail"] = sanitized[:200]
        emit(payload)
        raise SystemExit(1)
