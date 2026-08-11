import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "lab" / "egress_probe.py"
SPEC = importlib.util.spec_from_file_location("m0_egress_probe", MODULE_PATH)
PROBE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROBE
SPEC.loader.exec_module(PROBE)


OWNER_URL = "https://www.youtube.com/watch?v=nNQhzD-T85M"
CONTROL_URL = "https://www.youtube.com/watch?v=wJgtBgZvQnU"


class FakeBackend:
    def __init__(self):
        self.prepare_calls = 0

    def resolve(self, canonical_url):
        video_id = canonical_url.split("v=", 1)[1]
        return {
            "id": video_id,
            "title": "must never enter the report",
            "duration": 120,
            "availability": "public",
            "formats": [
                {
                    "format_id": "18",
                    "ext": "mp4",
                    "height": 360,
                    "vcodec": "avc1.42001E",
                    "acodec": "mp4a.40.2",
                    "filesize": 6,
                    "protocol": "https",
                }
            ],
        }

    def prepare(self, *, plan, option, job_dir, cancel_event, progress):
        self.prepare_calls += 1
        progress("DOWNLOADING", 3, 6)
        output = Path(job_dir) / "prepared.mp4"
        output.write_bytes(b"abcdef")
        progress("VERIFYING", 6, 6)
        return output, "video/mp4", "prepared.mp4"


class Fingerprints:
    def __init__(self, *values):
        self.values = list(values)

    def __call__(self, route):
        return self.values.pop(0)


class M0EgressProbeTests(unittest.TestCase):
    def route(self, **changes):
        values = {
            "route_class": "managed_proxy",
            "region": "IL",
            "provider_revision": "vendor-a-sticky-v1",
            "source_address": None,
            "proxy_url": "https://secret-user:secret-pass@proxy.example:443",
            "report_salt": "r" * 32,
        }
        values.update(changes)
        return PROBE.RouteConfig(**values)

    def test_route_configuration_requires_explicit_aup_and_never_serializes_secrets(self):
        env = {
            "LP_MEDIA_M0_PROXY_URL": "https://secret-user:secret-pass@proxy.example:443",
            "LP_MEDIA_M0_REPORT_SALT": "r" * 32,
            "LP_MEDIA_M0_PROVIDER_REVISION": "vendor-a-sticky-v1",
        }
        with self.assertRaisesRegex(PROBE.ProbeError, "MANAGED_EGRESS_AUP_REQUIRED"):
            PROBE.RouteConfig.from_env("managed_proxy", env)

        env["LP_MEDIA_M0_AUP_CONFIRMATION"] = "accepted"
        route = PROBE.RouteConfig.from_env("managed_proxy", env)
        public = json.dumps(route.public_summary(), sort_keys=True)
        self.assertEqual(route.region, "IL")
        self.assertNotIn("secret-user", public)
        self.assertNotIn("secret-pass", public)
        self.assertNotIn("proxy.example", public)
        self.assertNotIn("r" * 32, public)

    def test_prepare_sample_is_content_free_and_proves_one_route(self):
        backend = FakeBackend()
        with tempfile.TemporaryDirectory() as root:
            report = PROBE.run_sample(
                route=self.route(),
                fixture_class="owner",
                source_url=OWNER_URL,
                phase="prepare",
                backend=backend,
                fingerprint_resolver=Fingerprints("2a00:a041::10", "2a00:a041::10", "2a00:a041::10"),
                temp_root=root,
                now=lambda: 1_700_000_000.0,
            )

        encoded = json.dumps(report, ensure_ascii=False, sort_keys=True)
        self.assertTrue(report["ok"])
        self.assertTrue(report["continuity_ok"])
        self.assertEqual(report["output_bytes"], 6)
        self.assertEqual(report["output_sha256"], hashlib.sha256(b"abcdef").hexdigest())
        self.assertEqual(backend.prepare_calls, 1)
        for forbidden in (
            OWNER_URL,
            "nNQhzD-T85M",
            "must never enter the report",
            "2a00:a041::10",
            "secret-user",
            "secret-pass",
            "proxy.example",
        ):
            self.assertNotIn(forbidden, encoded)

    def test_changed_egress_fails_closed_before_prepare(self):
        backend = FakeBackend()
        with tempfile.TemporaryDirectory() as root:
            report = PROBE.run_sample(
                route=self.route(),
                fixture_class="control",
                source_url=CONTROL_URL,
                phase="prepare",
                backend=backend,
                fingerprint_resolver=Fingerprints("185.1.1.1", "185.1.1.2"),
                temp_root=root,
                now=lambda: 1_700_000_000.0,
            )
        self.assertFalse(report["ok"])
        self.assertFalse(report["continuity_ok"])
        self.assertEqual(report["error_code"], "EGRESS_CONTINUITY_LOST")
        self.assertEqual(backend.prepare_calls, 0)

    def test_gate_needs_balanced_20_resolves_10_prepares_and_full_24_hours(self):
        start = 1_700_000_000
        rows = []
        for index in range(20):
            fixture = "owner" if index % 2 == 0 else "control"
            phase = "prepare" if index < 10 else "resolve"
            rows.append({
                "schema_version": "lp_media_egress_probe.1.0.0",
                "at": start + round(index * (86_400 / 19)),
                "route_class": "ipv6_prefix",
                "region": "IL",
                "provider_revision": "prefix-node-v1",
                "fixture_class": fixture,
                "phase": phase,
                "ok": True,
                "resolve_ok": True,
                "prepare_ok": phase == "prepare",
                "continuity_ok": True,
                "error_code": None,
            })

        verdict = PROBE.evaluate_gate(rows)
        self.assertTrue(verdict["passes"])
        self.assertEqual(verdict["resolve_passes"], 20)
        self.assertEqual(verdict["prepare_passes"], 10)
        self.assertEqual(verdict["campaign_span_seconds"], 86_400)

        rows[-1] = {**rows[-1], "at": rows[-1]["at"] - 1}
        self.assertFalse(PROBE.evaluate_gate(rows)["passes"])

        rows[-1] = {**rows[-1], "at": start + 86_400, "continuity_ok": False, "ok": False,
                    "error_code": "EGRESS_CONTINUITY_LOST"}
        self.assertFalse(PROBE.evaluate_gate(rows)["passes"])

    def test_campaign_schedule_is_balanced_and_spans_the_full_window(self):
        schedule = PROBE.campaign_schedule(samples=20, duration_seconds=86_400, prepare_samples=10)
        self.assertEqual(len(schedule), 20)
        self.assertEqual(schedule[0]["offset_seconds"], 0)
        self.assertEqual(schedule[-1]["offset_seconds"], 86_400)
        self.assertEqual(sum(row["phase"] == "prepare" for row in schedule), 10)
        for fixture in ("owner", "control"):
            fixture_rows = [row for row in schedule if row["fixture_class"] == fixture]
            self.assertEqual(len(fixture_rows), 10)
            self.assertEqual(sum(row["phase"] == "prepare" for row in fixture_rows), 5)

    def test_error_classifier_never_returns_provider_text(self):
        cases = {
            "Sign in to confirm you're not a bot https://secret.example/watch?v=x": "BOT_ATTESTATION_REQUIRED",
            "The uploader has not made this video available in your country": "REGION_UNAVAILABLE",
            "This video is private": "LOGIN_REQUIRED",
            "timed out while connecting to upstream": "PROVIDER_UNAVAILABLE",
        }
        for raw, expected in cases.items():
            self.assertEqual(PROBE.classify_provider_error(RuntimeError(raw)), expected)


if __name__ == "__main__":
    unittest.main()
