#!/usr/bin/env python3
"""Content-free RMA-M0 egress probe.

This file is deliberately outside the shipped ``acquisition_service`` package. It is a
lab-only proof harness for comparing direct IPv4, a sticky IPv6 address, and an explicitly
AUP-approved managed proxy without placing source URLs, egress addresses, or credentials in
the evidence stream.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping
from urllib.parse import urlparse


WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

from acquisition_service.jobs import YtDlpBackend  # noqa: E402
from acquisition_service.planner import (  # noqa: E402
    MAX_OUTPUT_BYTES,
    build_resolved_source,
    canonicalize_youtube_url,
)
from acquisition_service.receipts import verify_plan_token  # noqa: E402


SCHEMA_VERSION = "lp_media_egress_probe.1.0.0"
GATE_SCHEMA_VERSION = "lp_media_egress_gate.1.0.0"
ROUTE_CLASSES = {"direct_ipv4", "ipv6_prefix", "managed_proxy"}
FIXTURE_CLASSES = {"owner", "control"}
PHASES = {"resolve", "prepare"}
PROVIDER_REVISION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
IP_CHECK_URL = "https://api64.ipify.org?format=json"


class ProbeError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class RouteConfig:
    route_class: str
    region: str
    provider_revision: str
    source_address: str | None = field(repr=False)
    proxy_url: str | None = field(repr=False)
    report_salt: str = field(repr=False)

    @classmethod
    def from_env(cls, route_class: str, env: Mapping[str, str] | None = None) -> "RouteConfig":
        values = os.environ if env is None else env
        route_class = str(route_class or "")
        if route_class not in ROUTE_CLASSES:
            raise ProbeError("ROUTE_CLASS_INVALID")
        region = str(values.get("LP_MEDIA_M0_REGION") or "IL").upper()
        if region != "IL":
            raise ProbeError("ROUTE_REGION_INVALID")
        revision = str(values.get("LP_MEDIA_M0_PROVIDER_REVISION") or "")
        if not PROVIDER_REVISION_RE.fullmatch(revision):
            raise ProbeError("PROVIDER_REVISION_INVALID")
        report_salt = str(values.get("LP_MEDIA_M0_REPORT_SALT") or "")
        if len(report_salt) < 32:
            raise ProbeError("REPORT_SALT_REQUIRED")

        source_address = None
        proxy_url = None
        if route_class == "direct_ipv4":
            source_address = "0.0.0.0"
        elif route_class == "ipv6_prefix":
            source_address = str(values.get("LP_MEDIA_M0_SOURCE_ADDRESS") or "")
            try:
                parsed = ipaddress.ip_address(source_address)
            except ValueError as exc:
                raise ProbeError("IPV6_SOURCE_ADDRESS_REQUIRED") from exc
            if parsed.version != 6 or parsed.is_loopback or parsed.is_link_local or parsed.is_multicast:
                raise ProbeError("IPV6_SOURCE_ADDRESS_REQUIRED")
            source_address = parsed.compressed
        else:
            if values.get("LP_MEDIA_M0_AUP_CONFIRMATION") != "accepted":
                raise ProbeError("MANAGED_EGRESS_AUP_REQUIRED")
            proxy_url = str(values.get("LP_MEDIA_M0_PROXY_URL") or "")
            parsed = urlparse(proxy_url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ProbeError("MANAGED_PROXY_URL_REQUIRED")
            if parsed.query or parsed.fragment:
                raise ProbeError("MANAGED_PROXY_URL_INVALID")

        return cls(
            route_class=route_class,
            region=region,
            provider_revision=revision,
            source_address=source_address,
            proxy_url=proxy_url,
            report_salt=report_salt,
        )

    def public_summary(self) -> dict[str, str]:
        return {
            "route_class": self.route_class,
            "region": self.region,
            "provider_revision": self.provider_revision,
        }


class RoutedYtDlpBackend(YtDlpBackend):
    """The existing fixed backend with one lab-owned route added to every request."""

    def __init__(self, route: RouteConfig):
        super().__init__()
        self.route = route

    def _base_options(self) -> dict[str, Any]:
        options = super()._base_options()
        if self.route.source_address:
            options["source_address"] = self.route.source_address
        if self.route.proxy_url:
            options["proxy"] = self.route.proxy_url
        return options


def resolve_egress_address(route: RouteConfig) -> str:
    """Return the raw diagnostic address to the in-process caller only."""
    import requests
    from requests.adapters import HTTPAdapter

    class SourceAddressAdapter(HTTPAdapter):
        def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
            if route.source_address:
                pool_kwargs["source_address"] = (route.source_address, 0)
            return super().init_poolmanager(connections, maxsize, block=block, **pool_kwargs)

        def proxy_manager_for(self, proxy, **proxy_kwargs):
            if route.source_address:
                proxy_kwargs["source_address"] = (route.source_address, 0)
            return super().proxy_manager_for(proxy, **proxy_kwargs)

    session = requests.Session()
    session.trust_env = False
    session.mount("http://", SourceAddressAdapter())
    session.mount("https://", SourceAddressAdapter())
    proxies = None
    if route.proxy_url:
        proxies = {"http": route.proxy_url, "https": route.proxy_url}
    response = session.get(
        IP_CHECK_URL,
        headers={"User-Agent": "LinguistPro-RMA-M0/1.0"},
        proxies=proxies,
        timeout=20,
    )
    response.raise_for_status()
    value = response.json().get("ip")
    try:
        return ipaddress.ip_address(str(value)).compressed
    except ValueError as exc:
        raise ProbeError("EGRESS_FINGERPRINT_INVALID") from exc
    finally:
        response.close()
        session.close()


def _fingerprint(address: str, salt: str) -> str:
    return hashlib.sha256((salt + "\0" + address).encode("utf-8")).hexdigest()[:24]


def _hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_OUTPUT_BYTES:
                raise ProbeError("OUTPUT_SIZE_LIMIT")
            digest.update(chunk)
    return digest.hexdigest(), size


def classify_provider_error(error: Exception) -> str:
    text = str(error or "").lower()
    if "not a bot" in text or "confirm you" in text and "sign in" in text:
        return "BOT_ATTESTATION_REQUIRED"
    if "not made this video available in your country" in text or "geo" in text and "restrict" in text:
        return "REGION_UNAVAILABLE"
    if any(marker in text for marker in ("private video", "video is private", "login required", "age-restricted")):
        return "LOGIN_REQUIRED"
    if any(marker in text for marker in ("timed out", "timeout", "connection refused", "temporary failure")):
        return "PROVIDER_UNAVAILABLE"
    code = getattr(error, "code", None)
    if isinstance(code, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", code):
        return code
    return "PROVIDER_FAILED"


def _recommended_video(resolved: dict[str, Any]) -> dict[str, Any]:
    options = [item for item in resolved.get("options", []) if item.get("kind") == "video"]
    option = next((item for item in options if item.get("recommended")), options[0] if options else None)
    if not option:
        raise ProbeError("NO_COMPLETE_VIDEO_OPTION")
    return option


def run_sample(
    *,
    route: RouteConfig,
    fixture_class: str,
    source_url: str,
    phase: str,
    backend: Any | None = None,
    fingerprint_resolver: Callable[[RouteConfig], str] = resolve_egress_address,
    temp_root: str | os.PathLike[str] | None = None,
    now: Callable[[], float] = time.time,
    monotonic: Callable[[], float] = time.monotonic,
) -> dict[str, Any]:
    if fixture_class not in FIXTURE_CLASSES:
        raise ProbeError("FIXTURE_CLASS_INVALID")
    if phase not in PHASES:
        raise ProbeError("PROBE_PHASE_INVALID")
    canonical = canonicalize_youtube_url(source_url)
    backend = backend or RoutedYtDlpBackend(route)
    started_at = float(now())
    started_clock = float(monotonic())
    report: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "at": int(started_at),
        **route.public_summary(),
        "fixture_class": fixture_class,
        "phase": phase,
        "ok": False,
        "resolve_ok": False,
        "prepare_ok": False,
        "continuity_ok": False,
        "lease_fingerprint": None,
        "output_bytes": None,
        "output_sha256": None,
        "latency_ms": None,
        "error_code": None,
    }

    try:
        before = fingerprint_resolver(route)
        report["lease_fingerprint"] = _fingerprint(before, route.report_salt)
        info = backend.resolve(canonical.url)
        after_resolve = fingerprint_resolver(route)
        if before != after_resolve:
            raise ProbeError("EGRESS_CONTINUITY_LOST")
        report["continuity_ok"] = True
        plan_secret = hashlib.sha256((route.report_salt + "\0plan").encode("utf-8")).hexdigest()
        resolved = build_resolved_source(
            info,
            canonical_url=canonical.url,
            subject="m0-probe",
            secret=plan_secret,
            now=int(started_at),
        )
        report["resolve_ok"] = True

        if phase == "prepare":
            selected = _recommended_video(resolved)
            plan = verify_plan_token(resolved["plan_token"], plan_secret, now=int(started_at))
            option = next(item for item in plan["options"] if item.get("id") == selected.get("id"))
            parent = Path(temp_root).resolve() if temp_root else None
            if parent:
                parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="lp-rma-m0-", dir=str(parent) if parent else None) as job_dir:
                output, _mime, _name = backend.prepare(
                    plan=plan,
                    option=option,
                    job_dir=Path(job_dir),
                    cancel_event=threading.Event(),
                    progress=lambda _phase, _done, _total: None,
                )
                after_prepare = fingerprint_resolver(route)
                if before != after_prepare:
                    report["continuity_ok"] = False
                    raise ProbeError("EGRESS_CONTINUITY_LOST")
                output = Path(output).resolve()
                if Path(job_dir).resolve() not in output.parents or not output.is_file():
                    raise ProbeError("OUTPUT_PATH_INVALID")
                digest, size = _hash_file(output)
                report["output_sha256"] = digest
                report["output_bytes"] = size
                report["prepare_ok"] = True

        report["ok"] = True
    except Exception as error:
        report["error_code"] = classify_provider_error(error)
        if report["error_code"] == "EGRESS_CONTINUITY_LOST":
            report["continuity_ok"] = False
    finally:
        report["latency_ms"] = max(0, round((float(monotonic()) - started_clock) * 1000))
    return report


def evaluate_gate(records: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    rows = [dict(row) for row in records if row.get("schema_version") == SCHEMA_VERSION]
    route_keys = {
        (row.get("route_class"), row.get("region"), row.get("provider_revision")) for row in rows
    }
    times = [int(row["at"]) for row in rows if isinstance(row.get("at"), int)]
    span = max(times) - min(times) if len(times) >= 2 else 0
    resolve_passes = sum(bool(row.get("resolve_ok")) for row in rows)
    prepare_passes = sum(bool(row.get("prepare_ok")) for row in rows)
    failures = sum(not bool(row.get("ok")) for row in rows)
    per_fixture = {
        fixture: {
            "resolve_passes": sum(bool(row.get("resolve_ok")) for row in rows if row.get("fixture_class") == fixture),
            "prepare_passes": sum(bool(row.get("prepare_ok")) for row in rows if row.get("fixture_class") == fixture),
        }
        for fixture in sorted(FIXTURE_CLASSES)
    }
    balanced = all(value["resolve_passes"] >= 10 and value["prepare_passes"] >= 5
                   for value in per_fixture.values())
    continuity = bool(rows) and all(bool(row.get("continuity_ok")) for row in rows)
    passes = (
        len(route_keys) == 1
        and failures == 0
        and continuity
        and resolve_passes >= 20
        and prepare_passes >= 10
        and span >= 86_400
        and balanced
    )
    route = next(iter(route_keys)) if len(route_keys) == 1 else (None, None, None)
    return {
        "schema_version": GATE_SCHEMA_VERSION,
        "passes": passes,
        "route_class": route[0],
        "region": route[1],
        "provider_revision": route[2],
        "samples": len(rows),
        "resolve_passes": resolve_passes,
        "prepare_passes": prepare_passes,
        "failures": failures,
        "continuity_ok": continuity,
        "campaign_span_seconds": span,
        "per_fixture": per_fixture,
    }


def campaign_schedule(*, samples: int, duration_seconds: int, prepare_samples: int) -> list[dict[str, Any]]:
    samples = int(samples)
    duration_seconds = int(duration_seconds)
    prepare_samples = int(prepare_samples)
    if samples < 20 or prepare_samples < 10 or prepare_samples > samples or duration_seconds < 86_400:
        raise ProbeError("CAMPAIGN_GATE_TOO_SMALL")
    return [
        {
            "fixture_class": "owner" if index % 2 == 0 else "control",
            "phase": "prepare" if index < prepare_samples else "resolve",
            "offset_seconds": round(index * duration_seconds / (samples - 1)),
        }
        for index in range(samples)
    ]


def run_campaign(
    *,
    route: RouteConfig,
    owner_url: str,
    control_url: str,
    output_path: str | os.PathLike[str],
    temp_root: str | os.PathLike[str] | None = None,
    samples: int = 20,
    prepare_samples: int = 10,
    duration_seconds: int = 86_400,
) -> dict[str, Any]:
    schedule = campaign_schedule(
        samples=samples,
        duration_seconds=duration_seconds,
        prepare_samples=prepare_samples,
    )
    urls = {"owner": owner_url, "control": control_url}
    for fixture_class, source_url in urls.items():
        if not source_url:
            raise ProbeError(f"{fixture_class.upper()}_SOURCE_FIXTURE_REQUIRED")
        canonicalize_youtube_url(source_url)
    destination = Path(output_path).resolve()
    if destination.exists():
        raise ProbeError("EVIDENCE_ALREADY_EXISTS")
    destination.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    records: list[dict[str, Any]] = []
    with destination.open("x", encoding="utf-8", newline="\n") as stream:
        for item in schedule:
            target = started + item["offset_seconds"]
            while True:
                remaining = target - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(30, remaining))
            report = run_sample(
                route=route,
                fixture_class=item["fixture_class"],
                source_url=urls[item["fixture_class"]],
                phase=item["phase"],
                temp_root=temp_root,
            )
            records.append(report)
            stream.write(json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
    return evaluate_gate(records)


def _load_json_lines(path: str | os.PathLike[str]) -> list[dict[str, Any]]:
    rows = []
    with Path(path).open("r", encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ProbeError("EVIDENCE_ROW_INVALID")
                rows.append(value)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LinguistPro RMA-M0 content-free egress probe")
    commands = parser.add_subparsers(dest="command", required=True)
    sample = commands.add_parser("sample", help="Run one resolve or resolve+prepare sample")
    sample.add_argument("--route", choices=sorted(ROUTE_CLASSES), required=True)
    sample.add_argument("--fixture", choices=sorted(FIXTURE_CLASSES), required=True)
    sample.add_argument("--phase", choices=sorted(PHASES), required=True)
    sample.add_argument("--temp-root")
    campaign = commands.add_parser("campaign", help="Run the balanced 24-hour M0 campaign")
    campaign.add_argument("--route", choices=sorted(ROUTE_CLASSES), required=True)
    campaign.add_argument("--output", required=True)
    campaign.add_argument("--temp-root")
    campaign.add_argument("--samples", type=int, default=20)
    campaign.add_argument("--prepare-samples", type=int, default=10)
    campaign.add_argument("--duration-seconds", type=int, default=86_400)
    gate = commands.add_parser("evaluate", help="Evaluate a JSONL campaign against the M0 gate")
    gate.add_argument("--input", required=True)
    args = parser.parse_args(argv)

    if args.command == "evaluate":
        verdict = evaluate_gate(_load_json_lines(args.input))
        print(json.dumps(verdict, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        return 0 if verdict["passes"] else 3

    if args.command == "campaign":
        route = RouteConfig.from_env(args.route)
        verdict = run_campaign(
            route=route,
            owner_url=os.environ.get("LP_MEDIA_M0_OWNER_URL", ""),
            control_url=os.environ.get("LP_MEDIA_M0_CONTROL_URL", ""),
            output_path=args.output,
            temp_root=args.temp_root,
            samples=args.samples,
            prepare_samples=args.prepare_samples,
            duration_seconds=args.duration_seconds,
        )
        print(json.dumps(verdict, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        return 0 if verdict["passes"] else 3

    route = RouteConfig.from_env(args.route)
    env_name = "LP_MEDIA_M0_OWNER_URL" if args.fixture == "owner" else "LP_MEDIA_M0_CONTROL_URL"
    source_url = os.environ.get(env_name, "")
    if not source_url:
        raise ProbeError("SOURCE_FIXTURE_REQUIRED")
    report = run_sample(
        route=route,
        fixture_class=args.fixture,
        source_url=source_url,
        phase=args.phase,
        temp_root=args.temp_root,
    )
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProbeError as error:
        print(json.dumps({"schema_version": SCHEMA_VERSION, "ok": False, "error_code": error.code},
                         separators=(",", ":")))
        raise SystemExit(2)
