"""Pure YouTube URL and complete-media format planner."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

from .receipts import issue_plan_token, sha256_hex


MAX_OUTPUT_BYTES = 300 * 1024 * 1024
MAX_DURATION_SECONDS = 3 * 60 * 60
TARGET_HEIGHTS = (360, 480, 720, 1080)
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


class PlannerError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class CanonicalSource:
    video_id: str
    url: str


def canonicalize_youtube_url(raw_url: str) -> CanonicalSource:
    try:
        parsed = urlparse(str(raw_url or "").strip())
    except Exception as exc:
        raise PlannerError("BAD_URL") from exc
    if parsed.scheme != "https":
        raise PlannerError("BAD_SCHEME")
    host = (parsed.hostname or "").lower().rstrip(".")
    if host not in YOUTUBE_HOSTS or parsed.port not in (None, 443):
        raise PlannerError("HOST_UNSUPPORTED")
    if parsed.username or parsed.password:
        raise PlannerError("BAD_URL")
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif parsed.path.rstrip("/") == "/watch":
        values = parse_qs(parsed.query, keep_blank_values=False).get("v", [])
        video_id = values[0] if len(values) == 1 else ""
    elif parsed.path.startswith("/shorts/"):
        video_id = parsed.path.split("/", 3)[2]
    else:
        video_id = ""
    if not VIDEO_ID_RE.fullmatch(video_id or ""):
        raise PlannerError("VIDEO_ID_INVALID")
    return CanonicalSource(video_id=video_id, url=f"https://www.youtube.com/watch?v={video_id}")


def _size(item: dict[str, Any]) -> int | None:
    value = item.get("filesize") or item.get("filesize_approx")
    return int(value) if isinstance(value, (int, float)) and value > 0 else None


def _is_h264(value: Any) -> bool:
    return str(value or "").lower().startswith(("avc1", "h264"))


def _is_aac(value: Any) -> bool:
    return str(value or "").lower().startswith(("mp4a", "aac"))


def _pick_audio(formats: list[dict[str, Any]]) -> dict[str, Any] | None:
    choices = [item for item in formats if item.get("vcodec") in (None, "none") and _is_aac(item.get("acodec"))
               and item.get("ext") in ("m4a", "mp4") and item.get("protocol") in (None, "https", "m3u8_native")]
    choices.sort(key=lambda item: ((_size(item) or -1), str(item.get("format_id"))), reverse=True)
    return choices[0] if choices else None


def _video_options(formats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    audio = _pick_audio(formats)
    out: list[dict[str, Any]] = []
    for height in TARGET_HEIGHTS:
        candidates: list[tuple[int | None, list[str], str]] = []
        for item in formats:
            if int(item.get("height") or 0) != height or item.get("ext") != "mp4" or not _is_h264(item.get("vcodec")):
                continue
            size = _size(item)
            if _is_aac(item.get("acodec")):
                candidates.append((size, [str(item["format_id"])], "progressive"))
            elif item.get("acodec") in (None, "none") and audio:
                audio_size = _size(audio)
                candidates.append((size + audio_size if size is not None and audio_size is not None else None,
                                   [str(item["format_id"]), str(audio["format_id"])], "merge"))
        candidates = [row for row in candidates if row[0] is None or row[0] <= MAX_OUTPUT_BYTES]
        if not candidates:
            continue
        candidates.sort(key=lambda row: (row[0] is None, row[0] or MAX_OUTPUT_BYTES + 1, row[2] != "progressive"))
        size, format_ids, delivery = candidates[0]
        out.append({
            "id": f"video-{height}",
            "kind": "video",
            "quality": height,
            "container": "mp4",
            "video_codec": "h264",
            "audio_codec": "aac",
            "has_audio": True,
            "size_bytes": size,
            "format_ids": format_ids,
            "delivery": delivery,
            "recommended": False,
        })
    preferred = next((item for item in out if item["quality"] == 720), None)
    if not preferred:
        preferred = next((item for item in reversed(out) if item["quality"] <= 720), out[0] if out else None)
    if preferred:
        preferred["recommended"] = True
    return out


def _audio_options(formats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    audio = _pick_audio(formats)
    if not audio:
        return []
    size = _size(audio)
    if size is not None and size > MAX_OUTPUT_BYTES:
        return []
    return [{
        "id": "audio-m4a",
        "kind": "audio",
        "container": "m4a",
        "audio_codec": "aac",
        "has_audio": True,
        "size_bytes": size,
        "format_ids": [str(audio["format_id"])],
        "delivery": "audio",
        "recommended": False,
    }]


def _caption_options(info: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for field, source_kind in (("subtitles", "manual"), ("automatic_captions", "auto")):
        tracks = info.get(field) or {}
        for provider_code in ("he", "iw"):
            rows = tracks.get(provider_code) or []
            if not any(str(row.get("ext")) in ("vtt", "srv3", "json3") for row in rows if isinstance(row, dict)):
                continue
            key = ("he", source_kind)
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "id": f"captions-he-{source_kind}",
                "kind": "captions",
                "language": "he",
                "provider_language": provider_code,
                "source_kind": source_kind,
                "container": "vtt",
                "size_bytes": None,
                "format_ids": [],
                "recommended": False,
            })
    return out


def build_resolved_source(info: dict[str, Any], *, canonical_url: str, subject: str, secret: str,
                          now: int | None = None) -> dict[str, Any]:
    canonical = canonicalize_youtube_url(canonical_url)
    video_id = str(info.get("id") or "")
    if not VIDEO_ID_RE.fullmatch(video_id):
        raise PlannerError("EXTRACTOR_ID_INVALID")
    if video_id != canonical.video_id:
        raise PlannerError("EXTRACTOR_ID_MISMATCH")
    if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
        raise PlannerError("LIVE_UNSUPPORTED")
    duration = int(info.get("duration") or 0)
    if duration <= 0:
        raise PlannerError("DURATION_UNKNOWN")
    if duration > MAX_DURATION_SECONDS:
        raise PlannerError("DURATION_LIMIT")
    availability = str(info.get("availability") or "public")
    if availability not in {"public", "needs_auth"} or availability == "needs_auth":
        raise PlannerError("LOGIN_REQUIRED")
    formats = [item for item in (info.get("formats") or []) if isinstance(item, dict)]
    options = _video_options(formats) + _audio_options(formats) + _caption_options(info)
    if not options:
        raise PlannerError("NO_COMPATIBLE_FORMAT")
    plan_options = [{key: value for key, value in item.items() if key != "recommended"} for item in options]
    plan = {
        "sub": str(subject),
        "video_id": video_id,
        "canonical_url": str(canonical_url),
        "duration_seconds": duration,
        "options": plan_options,
    }
    plan["plan_sha256"] = sha256_hex(plan)
    return {
        "schema_version": "lp_media_resolve.1.0.0",
        "source": {
            "provider": "youtube",
            "video_id": video_id,
            "canonical_url": str(canonical_url),
            "title": str(info.get("title") or "")[:600],
            "duration_seconds": duration,
            # Fixed provider path: no extractor-supplied signed/tracking URL crosses the boundary.
            "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        },
        "options": options,
        "plan_sha256": plan["plan_sha256"],
        "plan_token": issue_plan_token(secret, plan, now=now),
    }
