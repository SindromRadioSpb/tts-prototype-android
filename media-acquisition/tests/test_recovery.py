import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from acquisition_service.jobs import JobError, JobRegistry, classify_provider_error
from tests.test_jobs import FakeBackend, plan_token


class RecoveryTests(unittest.TestCase):
    def test_tampered_manifest_cannot_restore_a_job_or_touch_unrelated_data(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            registry.wait(created["job_id"], timeout=2)
            unrelated = Path(root) / "owner-file.txt"
            unrelated.write_text("preserve")
            manifest = Path(root) / created["job_id"] / "handoff.json"
            manifest.write_text(manifest.read_text().replace('"size": 6', '"size": 7'))
            restarted = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            with self.assertRaisesRegex(JobError, "JOB_NOT_FOUND"):
                restarted.status("owner-1", created["job_id"])
            self.assertEqual(unrelated.read_text(), "preserve")

    def test_complete_receipt_survives_restart_without_retaining_media(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            ready = registry.wait(created["job_id"], timeout=2)
            args = dict(subject="owner-1", job_id=created["job_id"], sha256=ready["output_sha256"], size_bytes=6)
            receipt = registry.confirm_device(**args)
            restarted = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            self.assertEqual(restarted.confirm_device(**args), receipt)
            self.assertEqual([p.name for p in (Path(root) / created["job_id"]).iterdir()], ["handoff.json"])

    def test_cancel_during_hash_cannot_resurrect_ready(self):
        class CancellingBackend(FakeBackend):
            def prepare(self, **kwargs):
                self.event = kwargs['cancel_event']
                return super().prepare(**kwargs)
        backend = CancellingBackend()
        def cancelled_hash(_path):
            backend.event.set()
            return hashlib.sha256(b"abcdef").hexdigest(), 6
        with tempfile.TemporaryDirectory() as root, patch('acquisition_service.jobs._hash_file', cancelled_hash):
            registry = JobRegistry(secret="s" * 32, root=root, backend=backend)
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            self.assertEqual(registry.wait(created["job_id"], timeout=2)["state"], "CANCELED")
            self.assertFalse((Path(root) / created["job_id"]).exists())

    def test_provider_errors_are_classified_without_exposing_exception_text(self):
        for message, code in [
            ("Sign in to confirm you're not a bot: secret-url", "SOURCE_BOT_BLOCKED"),
            ("The uploader has not made this video available in your country", "SOURCE_REGION_BLOCKED"),
            ("Video unavailable", "SOURCE_UNAVAILABLE"),
            ("Requested format is not available", "FORMAT_UNAVAILABLE"),
            ("HTTP Error 429: Too Many Requests", "SOURCE_RATE_LIMIT"),
            ("private video, sign in", "LOGIN_REQUIRED"),
            ("arbitrary private exception text", "SOURCE_FAILED"),
        ]:
            self.assertEqual(classify_provider_error(Exception(message)), code)

    def test_retried_creation_and_receipt_do_not_duplicate_or_lose_the_job(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            token = plan_token()
            args = dict(subject="owner-1", plan_token=token, option_id="video-720",
                        rights_basis={"kind": "rights_holder_permission"}, request_id="a" * 32)
            first = registry.create(**args)
            ready = registry.wait(first["job_id"], timeout=2)
            self.assertEqual(registry.create(**args)["job_id"], first["job_id"])
            with self.assertRaisesRegex(JobError, "REQUEST_CONFLICT"):
                registry.create(**{**args, "option_id": "changed"})
            receipt_args = dict(subject="owner-1", job_id=first["job_id"],
                                sha256=ready["output_sha256"], size_bytes=6)
            receipt = registry.confirm_device(**receipt_args)
            self.assertEqual(registry.confirm_device(**receipt_args), receipt)
            with self.assertRaisesRegex(JobError, "DEVICE_HASH_MISMATCH"):
                registry.confirm_device(**{**receipt_args, "sha256": "0" * 64})
            with self.assertRaisesRegex(JobError, "JOB_NOT_FOUND"):
                registry.status("other-user", first["job_id"])

    def test_prepared_output_is_recoverable_across_worker_restart(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            ready = registry.wait(created["job_id"], timeout=2)
            restarted = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            recovered = restarted.status("owner-1", created["job_id"])
            self.assertEqual(recovered["output_sha256"], ready["output_sha256"])
            self.assertEqual(restarted.open_stream(subject="owner-1", job_id=created["job_id"]).path.read_bytes(), b"abcdef")
            with self.assertRaisesRegex(JobError, "JOB_NOT_FOUND"):
                restarted.status("other-user", created["job_id"])
            # Recovered bytes are still checked before a client may confirm them.
            self.assertEqual(recovered["output_sha256"], hashlib.sha256(b"abcdef").hexdigest())


if __name__ == "__main__":
    unittest.main()
