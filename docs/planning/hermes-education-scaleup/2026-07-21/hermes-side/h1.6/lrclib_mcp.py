"""Read-only LRCLIB MCP wrapper for the LinguistPro Hermes host."""

from __future__ import annotations

import json
import os
import socket
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from mcp.server.fastmcp import FastMCP


BASE_URL = os.environ.get("LRCLIB_BASE_URL", "https://lrclib.net").rstrip("/")
TIMEOUT_SECONDS = 10
MIN_REQUEST_INTERVAL_SECONDS = 1.0
USER_AGENT = (
    "LinguistPro-Hermes-LRCLIB/1.0 "
    "(+https://github.com/SindromRadioSpb/tts-prototype-android)"
)
MAX_SEARCH_RESULTS = 10

_rate_lock = threading.Lock()
_last_request_at = 0.0
mcp = FastMCP("lrclib-readonly")


class UpstreamUnavailable(Exception):
    """LRCLIB could not be reached or returned an invalid response."""


def _error(code: str, message: str, retryable: bool) -> dict[str, Any]:
    return {
        "ok": False,
        "source": "LRCLIB",
        "error": {"code": code, "message": message, "retryable": retryable},
    }


def _normalized(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.casefold().split())


def _wait_for_rate_slot() -> None:
    global _last_request_at
    with _rate_lock:
        now = time.monotonic()
        wait = MIN_REQUEST_INTERVAL_SECONDS - (now - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _get_json(path: str, params: dict[str, str]) -> Any:
    _wait_for_rate_slot()
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{BASE_URL}{path}?{query}",
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.load(response)
    except (
        TimeoutError,
        socket.timeout,
        urllib.error.URLError,
        urllib.error.HTTPError,
        json.JSONDecodeError,
    ) as exc:
        raise UpstreamUnavailable(type(exc).__name__) from exc


def _summary(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "artist": record.get("artistName"),
        "track": record.get("trackName"),
        "duration": record.get("duration"),
        "has_synced": bool(record.get("syncedLyrics")),
    }


@mcp.tool()
def search_lyrics(
    artist: str | None = None,
    track: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    """Search LRCLIB using only public metadata; results are external and unverified."""
    artist = artist.strip() if artist else None
    track = track.strip() if track else None
    q = q.strip() if q else None
    if not q and not track:
        return _error(
            "INVALID_ARGUMENT", "Provide q or track; artist alone is insufficient.", False
        )

    params: dict[str, str] = {}
    if q:
        params["q"] = q
    else:
        params["track_name"] = track or ""
        if artist:
            params["artist_name"] = artist
    try:
        records = _get_json("/api/search", params)
    except UpstreamUnavailable:
        return _error("UPSTREAM_UNAVAILABLE", "LRCLIB is unavailable.", True)
    if not isinstance(records, list):
        return _error("UPSTREAM_UNAVAILABLE", "LRCLIB returned an invalid response.", True)
    if not records:
        return _error("NOT_FOUND", "No matching lyrics were found in LRCLIB.", False)
    return {
        "ok": True,
        "source": "LRCLIB",
        "external_unverified": True,
        "results": [_summary(record) for record in records[:MAX_SEARCH_RESULTS]],
    }


@mcp.tool()
def get_synced_lyrics(
    artist: str,
    track: str,
    duration: float | None = None,
) -> dict[str, Any]:
    """Return external unverified LRCLIB text; cite source/timestamps and never persist it."""
    artist = artist.strip()
    track = track.strip()
    if not artist or not track or (duration is not None and duration <= 0):
        return _error("INVALID_ARGUMENT", "artist, track and duration must be valid.", False)

    try:
        records = _get_json(
            "/api/search", {"artist_name": artist, "track_name": track}
        )
    except UpstreamUnavailable:
        return _error("UPSTREAM_UNAVAILABLE", "LRCLIB is unavailable.", True)
    if not isinstance(records, list):
        return _error("UPSTREAM_UNAVAILABLE", "LRCLIB returned an invalid response.", True)

    exact = [
        record
        for record in records
        if _normalized(str(record.get("artistName", ""))) == _normalized(artist)
        and _normalized(str(record.get("trackName", ""))) == _normalized(track)
    ]
    if duration is not None:
        exact = [
            record
            for record in exact
            if isinstance(record.get("duration"), (int, float))
            and abs(float(record["duration"]) - duration) <= 2.0
        ]
        exact.sort(key=lambda record: abs(float(record["duration"]) - duration))
    else:
        exact.sort(key=lambda record: not bool(record.get("syncedLyrics")))

    if not exact:
        return _error("NOT_FOUND", "Exact lyrics were not found in LRCLIB.", False)
    record = exact[0]
    if not record.get("plainLyrics") and not record.get("syncedLyrics"):
        return _error("NOT_FOUND", "The LRCLIB record has no lyrics.", False)
    return {
        "ok": True,
        "source": "LRCLIB",
        "external_unverified": True,
        "not_found": False,
        "id": record.get("id"),
        "artist": record.get("artistName"),
        "track": record.get("trackName"),
        "duration": record.get("duration"),
        "plain": record.get("plainLyrics"),
        "synced_lrc": record.get("syncedLyrics"),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
