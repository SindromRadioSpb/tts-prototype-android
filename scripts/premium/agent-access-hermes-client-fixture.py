"""AA2-C2 synthetic Hermes MCP/OAuth compatibility client.

Runs only against an explicit loopback URL supplied by the parent smoke. It
never prints authorization URLs, codes, tokens, headers, or tool payloads.
"""

from __future__ import annotations

import asyncio
import json
import sys
import threading
import time
import urllib.request
from urllib.parse import urlparse


TOOLS = {
    "get_learning_brief": {},
    "get_review_summary": {},
    "search_public_reading_catalog": {
        "language": "he",
        "audio": "ANY",
        "ready": "ANY",
        "sort": "RELEVANCE",
        "limit": 10,
    },
    "get_recent_explanation_metadata": {"kinds": ["word"], "limit": 10},
    "get_agent_connection": {},
}


def _loopback(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}


def _open_fixture_authorization(url: str) -> bool:
    if not _loopback(url):
        raise RuntimeError("AA2C2_NON_LOOPBACK_AUTHORIZATION_BLOCKED")

    def complete() -> None:
        time.sleep(1)
        for _ in range(20):
            try:
                with urllib.request.urlopen(url, timeout=5) as response:
                    response.read(128)
                return
            except Exception:
                time.sleep(0.25)

    threading.Thread(target=complete, daemon=True).start()
    return True


async def _run(server_url: str) -> dict:
    if not _loopback(server_url):
        raise RuntimeError("AA2C2_NON_LOOPBACK_SERVER_BLOCKED")

    from tools import mcp_oauth
    from tools.mcp_oauth import force_interactive_oauth
    from tools.mcp_tool import MCPServerTask

    mcp_oauth.webbrowser.open = _open_fixture_authorization
    mcp_oauth._can_open_browser = lambda: True
    task = MCPServerTask("aa2c2_hermes_fixture")
    config = {
        "url": server_url,
        "auth": "oauth",
        "connect_timeout": 30,
        "timeout": 30,
        "tools": {"resources": False, "prompts": False},
        "oauth": {
            "client_id": "linguistpro-hermes-owner-v0",
            "redirect_port": 8765,
            "scope": " ".join(
                [
                    "learning.brief.read",
                    "review.summary.read",
                    "reading.public.search",
                    "explanations.metadata.read",
                    "agent.connection.read",
                ]
            ),
        },
    }

    with force_interactive_oauth():
        await asyncio.wait_for(task.start(config), timeout=30)
    try:
        protocol = str(
            getattr(task.initialize_result, "protocolVersion", "")
            or getattr(task.initialize_result, "protocol_version", "")
        )
        listed = await asyncio.wait_for(task.session.list_tools(), timeout=15)
        names = [tool.name for tool in listed.tools]
        if names != list(TOOLS):
            raise RuntimeError("AA2C2_HERMES_TOOL_LIST_MISMATCH")
        for name, arguments in TOOLS.items():
            result = await asyncio.wait_for(task.session.call_tool(name, arguments=arguments), timeout=15)
            if bool(getattr(result, "isError", False)):
                raise RuntimeError(f"AA2C2_HERMES_TOOL_FAILED:{name}")
        await asyncio.sleep(3)
        refreshed = await asyncio.wait_for(task.session.list_tools(), timeout=15)
        if [tool.name for tool in refreshed.tools] != list(TOOLS):
            raise RuntimeError("AA2C2_HERMES_REFRESH_TOOL_LIST_MISMATCH")
        return {
            "ok": True,
            "client": "hermes",
            "version": "0.18.2",
            "protocol": protocol,
            "tools": len(names),
            "tool_calls": len(TOOLS),
        }
    finally:
        await task.shutdown()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: agent-access-hermes-client-fixture.py <loopback-mcp-url>")
    result = asyncio.run(_run(sys.argv[1]))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
