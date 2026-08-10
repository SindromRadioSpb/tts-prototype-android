import json
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from acquisition_service.main import WorkerApplication, WorkerServer
from acquisition_service.receipts import issue_capability


class MetadataBackend:
    def resolve(self, canonical_url):
        return {
            "id": "wJgtBgZvQnU",
            "title": "Hebrew interview",
            "duration": 2260,
            "availability": "public",
            "formats": [
                {"format_id": "18", "ext": "mp4", "height": 360, "vcodec": "avc1.42001E",
                 "acodec": "mp4a.40.2", "filesize": 100, "protocol": "https"},
            ],
            "automatic_captions": {"iw": [{"ext": "vtt", "url": "https://signed.invalid/caption"}]},
        }


class HttpBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.secret = "s" * 32
        self.origin = "https://linguistpro.example"
        app = WorkerApplication(secret=self.secret, allowed_origins={self.origin}, temp_root=self.temp.name,
                                backend=MetadataBackend())
        self.server = WorkerServer(("127.0.0.1", 0), app)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def request(self, path, *, origin=None, token=None, body=None, method=None):
        headers = {}
        if origin:
            headers["Origin"] = origin
        if token:
            headers["Authorization"] = "Bearer " + token
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers,
                                         method=method or ("POST" if body is not None else "GET"))
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                raw = response.read()
                return response.status, dict(response.headers), json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            status, response_headers, payload = error.code, dict(error.headers), json.loads(error.read())
            error.close()
            return status, response_headers, payload

    def test_metadata_resolve_is_capability_and_origin_bound(self):
        token = issue_capability(self.secret, subject="owner-1", origin=self.origin, scopes=["resolve"],
                                 now=int(time.time()), nonce="test-nonce")
        status, headers, body = self.request("/v1/resolve", origin=self.origin, token=token,
                                             body={"url": "https://www.youtube.com/watch?v=wJgtBgZvQnU"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), self.origin)
        self.assertEqual(body["source"]["video_id"], "wJgtBgZvQnU")
        self.assertNotIn("signed.invalid", repr(body))

        status, _, body = self.request("/v1/resolve", origin="https://evil.example", token=token,
                                        body={"url": "https://www.youtube.com/watch?v=wJgtBgZvQnU"})
        self.assertEqual(status, 403)
        self.assertEqual(body["error_code"], "CAPABILITY_ORIGIN")

        status, headers, _ = self.request("/v1/resolve", origin=self.origin, method="OPTIONS")
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), self.origin)
        self.assertIn("Authorization", headers.get("Access-Control-Allow-Headers", ""))

    def test_health_is_content_free_and_runtime_report_is_authenticated(self):
        status, _, body = self.request("/healthz")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "media-acquisition")
        self.assertNotIn("runtime", body)
        token = issue_capability(self.secret, subject="owner-1", origin=self.origin, scopes=["resolve"],
                                 now=int(time.time()), nonce="runtime-nonce")
        status, _, body = self.request("/v1/runtime", origin=self.origin, token=token)
        self.assertEqual(status, 200)
        self.assertIn("yt_dlp", body["worker_runtime"])


if __name__ == "__main__":
    unittest.main()
