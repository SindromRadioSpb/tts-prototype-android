"""Offline contract tests; none of these certify iOS, WebKit or Chrome."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import hashlib
import io
import sys
from contextlib import redirect_stdout

SOURCE = Path(__file__).resolve().parents[1] / "iphone-media-probe.py"
spec = importlib.util.spec_from_file_location("iphone_probe", SOURCE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def test_source_is_only_a_video_id(self):
        self.assertEqual(probe.source_url("dH_OkB7Uym4"), "https://www.youtube.com/watch?v=dH_OkB7Uym4")
        for value in ["https://example.org", "../test", "x;open foo", "x" * 12, "dH_OkB7Uym4\n"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                probe.source_url(value)

    def test_chrome_return_cannot_carry_arbitrary_url_or_command(self):
        job = "a" * 32
        self.assertEqual(probe.chrome_return_url(job),
                         "googlechromes://linguistpro.kolosei.com/#lp-local-probe=" + job)
        for value in ["../secret", "a" * 32 + "&token=foo", "https://example.org", "A" * 32]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                probe.chrome_return_url(value)

    def test_archive_traversal_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "bad.whl"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("ok.txt", "ok")
                output.writestr("../escape.txt", "bad")
            with self.assertRaises(ValueError):
                probe.unpack_wheel(archive, root / "runtime")
            self.assertFalse((root / "runtime" / "ok.txt").exists())
            self.assertFalse((root / "escape.txt").exists())

    def test_archive_symlinks_and_backslashes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, mode in [("a\\b", 0), ("/absolute", 0), ("C:/file", 0), ("link", 0o120777 << 16)]:
                archive = root / "bad.whl"
                with zipfile.ZipFile(archive, "w") as output:
                    info = zipfile.ZipInfo(name)
                    info.filename = name  # ZipInfo normalizes Windows separators on construction.
                    info.external_attr = mode
                    output.writestr(info, "bad")
                with self.subTest(name=name), self.assertRaises(ValueError):
                    probe.unpack_wheel(archive, root / "runtime")

    def test_good_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "ok.whl"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("module/file.py", "VALUE = 1")
            probe.unpack_wheel(archive, root / "runtime")
            self.assertEqual((root / "runtime/module/file.py").read_text(), "VALUE = 1")

    def test_runtime_install_never_overwrites_existing_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "runtime-v1").mkdir()
            (root / "runtime-v1/owner.txt").write_text("owner")
            with patch.object(probe, "fetch_wheel") as fetch:
                with self.assertRaises(FileExistsError):
                    probe.install_runtime(root)
                fetch.assert_not_called()
            self.assertEqual((root / "runtime-v1/owner.txt").read_text(), "owner")

    def test_wrong_wheel_digest_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wheel.whl"
            path.write_bytes(b"unexpected")
            with self.assertRaises(ValueError):
                probe.check_digest(path, "0" * 64)

    def test_non_ios_cannot_pass_native_gate(self):
        with patch.object(probe, "is_ios", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "IOS_REQUIRED"):
                probe.native_preflight()

    def test_report_has_no_provider_message_or_absolute_path(self):
        report = probe.failure_report("NATIVE_PREFLIGHT", RuntimeError("token=secret /owner/data"), "a" * 32)
        rendered = json.dumps(report)
        self.assertNotIn("secret", rendered)
        self.assertNotIn("/owner", rendered)
        self.assertEqual(report["status"], "FAIL")
        self.assertEqual(report["iphone_acceptance"], "NOT_TESTED")
        self.assertEqual(probe.failure_report("TEST", RuntimeError("SECRET_TOKEN"), "a" * 32)["error_code"], "PROBE_FAILED")

    def test_download_requires_explicit_rights_even_before_preflight(self):
        with patch.object(probe, "native_preflight") as native:
            with self.assertRaisesRegex(ValueError, "RIGHTS_REQUIRED"):
                probe.run_download(Path("unused"), "dH_OkB7Uym4", "audio", 360, None, "a" * 32)
            native.assert_not_called()

    def test_failed_install_has_no_runnable_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(probe, "fetch_wheel", side_effect=ValueError("DEPENDENCY_HASH_MISMATCH")):
                with self.assertRaises(ValueError):
                    probe.install_runtime(root)
            self.assertFalse((root / "runtime-v1").exists())
            self.assertEqual(list(root.iterdir()), [])

    def test_package_reuses_identical_engine_bytes_and_hashes(self):
        build_spec = importlib.util.spec_from_file_location("build_iphone_probe", SOURCE.with_name("build-iphone-media-probe.py"))
        builder = importlib.util.module_from_spec(build_spec)
        build_spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory(prefix="iphone-probe-test-", dir=builder.ROOT / ".tmp") as directory:
            target = Path(directory) / "probe.zip"
            manifest = builder.build(target)
            first = target.read_bytes()
            builder.build(target)
            self.assertEqual(first, target.read_bytes())
            with zipfile.ZipFile(target) as package:
                for name, digest in manifest["files"].items():
                    data = package.read("LinguistPro-iPhone-probe/" + name)
                    self.assertEqual(hashlib.sha256(data).hexdigest(), digest)
                    if name.startswith("acquisition_service/"):
                        self.assertEqual(data, (builder.ROOT / "media-acquisition" / name).read_bytes())

    def test_download_report_is_local_evidence_not_a_remote_receipt(self):
        sys.path.insert(0, str(SOURCE.parents[2] / "media-acquisition"))

        class FakeBackend:
            @staticmethod
            def _base_options():
                return {"js_runtimes": {"deno": {}}}

            def resolve(self, url):
                self.options = self._base_options()
                assert self.options["js_runtimes"] == {}
                assert self.options["remote_components"] == []
                return {"id": "dH_OkB7Uym4", "title": "Fixture", "duration": 60,
                        "formats": [{"format_id": "140", "vcodec": "none", "acodec": "mp4a.40.2",
                                     "ext": "m4a", "filesize": 5, "protocol": "https"}]}

            def prepare(self, *, job_dir, progress, **kwargs):
                output = job_dir / "verified.m4a"
                output.write_bytes(b"test!")
                progress("VERIFYING", 5, 5)
                return output, "audio/mp4", "fixture.m4a", {"method": "TEST_FIXTURE_ONLY"}

        with tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()) as captured:
            with patch.object(probe, "native_preflight", return_value={"native_webkit": "TEST_FIXTURE_ONLY"}), \
                    patch("acquisition_service.jobs.YtDlpBackend", FakeBackend):
                report = probe.run_download(Path(directory), "dH_OkB7Uym4", "audio", 360, "permission", "a" * 32)
            self.assertEqual(report["sha256"], hashlib.sha256(b"test!").hexdigest())
            self.assertEqual(report["chrome_file_import"], "NOT_TESTED")
            self.assertEqual(report["iphone_acceptance"], "NOT_TESTED")
            self.assertNotIn("plan_token", json.dumps(report))
            resolved = json.loads(captured.getvalue().splitlines()[0])
            self.assertEqual(resolved["title"], "Fixture")
            self.assertEqual(resolved["duration_seconds"], 60)
            self.assertTrue((Path(directory) / "results" / ("a" * 32) / "report.json").is_file())


if __name__ == "__main__":
    unittest.main()
