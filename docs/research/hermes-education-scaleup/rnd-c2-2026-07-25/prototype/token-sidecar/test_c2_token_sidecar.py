import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import c2_token_sidecar as sidecar  # noqa: E402


class FakeResponse:
    def __enter__(self): return self
    def __exit__(self, *_args): return None
    def read(self): return json.dumps({"name": "auth_tokens/test"}).encode()


class TokenSidecarTests(unittest.TestCase):
    def test_key_from_environment(self):
        with patch.dict(sidecar.os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            self.assertEqual(sidecar._read_key(), "test-key")

    def test_cached_key_has_priority(self):
        with patch.object(sidecar, "_CACHED_API_KEY", "startup-key"):
            with patch.object(sidecar, "_read_key", return_value="late-key") as read_key:
                self.assertEqual(sidecar._get_key(), "startup-key")
                read_key.assert_not_called()

    def test_non_root_startup_caches_without_privilege_change(self):
        with patch.object(sidecar, "_CACHED_API_KEY", ""):
            with patch.object(sidecar, "_read_key", return_value="startup-key"):
                with patch.object(sidecar.os, "geteuid", return_value=1000, create=True):
                    sidecar._cache_key_then_drop_privileges()
                    self.assertEqual(sidecar._CACHED_API_KEY, "startup-key")

    def test_token_is_one_use_and_model_locked(self):
        captured = {}
        def open_request(request, timeout):
            captured["body"] = json.loads(request.data)
            captured["timeout"] = timeout
            return FakeResponse()
        with patch.object(sidecar.urllib.request, "urlopen", open_request):
            token = sidecar._create_token("secret")
        self.assertEqual(token["token"], "auth_tokens/test")
        self.assertEqual(captured["body"]["uses"], 1)
        self.assertEqual(captured["body"]["fieldMask"], "model")
        self.assertEqual(captured["body"]["bidiGenerateContentSetup"]["model"], f"models/{sidecar.MODEL}")
        self.assertNotIn("liveConnectConstraints", captured["body"])
        self.assertIn("/v1alpha/auth_tokens", sidecar.TOKEN_URL)
        self.assertEqual(captured["timeout"], 12)

    def test_no_raw_content_fields_in_token_request(self):
        captured = {}
        def open_request(request, timeout):
            captured["body"] = request.data.decode()
            return FakeResponse()
        with patch.object(sidecar.urllib.request, "urlopen", open_request):
            sidecar._create_token("secret")
        for forbidden in ("transcript", "audio", "personal", "review_log", "FSRS"):
            self.assertNotIn(forbidden, captured["body"])

    def test_result_schema_contains_only_content_free_counts(self):
        result = sidecar._result_from_query({
            "run": ["RT2"], "durationSec": ["480"], "turns": ["7"],
            "breakdowns": ["1"], "transportIncidents": ["0"], "status": ["COMPLETE"],
        })
        self.assertEqual(result["surface"], "iphone_web")
        self.assertIsNone(result["actualCostUsd"])
        for forbidden in ("transcript", "audio", "text", "utterance"):
            self.assertNotIn(forbidden, result)

    def test_result_rejects_unregistered_run(self):
        with self.assertRaisesRegex(ValueError, "C2_RUN_NOT_PREREGISTERED"):
            sidecar._result_from_query({"run": ["RT4"]})

    def test_product_practice_token_is_allowed(self):
        self.assertTrue(sidecar._token_request_allowed({"purpose": ["practice"]}))

    def test_unknown_token_purpose_is_rejected(self):
        self.assertFalse(sidecar._token_request_allowed({"purpose": ["personal-text"]}))


if __name__ == "__main__":
    unittest.main()
