import hashlib
import tempfile
import time
import unittest
from pathlib import Path

from acquisition_service.jobs import JobError, JobRegistry
from acquisition_service.receipts import issue_plan_token


class FakeBackend:
    def prepare(self, *, plan, option, job_dir, cancel_event, progress):
        progress("DOWNLOADING", 3, 6)
        if cancel_event.is_set():
            raise JobError("JOB_CANCELED")
        output = Path(job_dir) / "prepared.mp4"
        output.write_bytes(b"abcdef")
        progress("VERIFYING", 6, 6)
        return output, "video/mp4", "youtube-wJgtBgZvQnU-720p.mp4"


def plan_token(secret="s" * 32, subject="owner-1"):
    return issue_plan_token(secret, {
        "sub": subject,
        "video_id": "wJgtBgZvQnU",
        "canonical_url": "https://www.youtube.com/watch?v=wJgtBgZvQnU",
        "duration_seconds": 10,
        "plan_sha256": "a" * 64,
        "options": [{"id": "video-720", "kind": "video", "quality": 720, "container": "mp4",
                     "size_bytes": 6, "format_ids": ["136", "140"], "delivery": "merge"}],
    }, now=int(time.time()))


class JobTests(unittest.TestCase):
    def test_prepare_hash_receipt_and_terminal_cleanup(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            ready = registry.wait(created["job_id"], timeout=2)
            self.assertEqual(ready["state"], "READY")
            self.assertEqual(ready["output_sha256"], hashlib.sha256(b"abcdef").hexdigest())
            output = registry.open_stream(subject="owner-1", job_id=created["job_id"])
            self.assertEqual(output.path.read_bytes(), b"abcdef")
            registry.open_stream(subject="owner-1", job_id=created["job_id"])
            registry.open_stream(subject="owner-1", job_id=created["job_id"])
            with self.assertRaisesRegex(JobError, "STREAM_RETRY_LIMIT"):
                registry.open_stream(subject="owner-1", job_id=created["job_id"])
            receipt = registry.confirm_device(subject="owner-1", job_id=created["job_id"],
                                              sha256=ready["output_sha256"], size_bytes=6)
            self.assertTrue(receipt["stored_in_studio_opfs"])
            self.assertTrue(receipt["deletion_receipt"]["deleted"])
            self.assertFalse(output.path.exists())

    def test_subject_rights_and_hash_mismatch_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            with self.assertRaisesRegex(JobError, "RIGHTS_REQUIRED"):
                registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720", rights_basis={})
            with self.assertRaisesRegex(JobError, "PLAN_SUBJECT_MISMATCH"):
                registry.create(subject="owner-2", plan_token=plan_token(), option_id="video-720",
                                rights_basis={"kind": "rights_holder_permission"})
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            ready = registry.wait(created["job_id"], timeout=2)
            with self.assertRaisesRegex(JobError, "DEVICE_HASH_MISMATCH"):
                registry.confirm_device(subject="owner-1", job_id=created["job_id"], sha256="0" * 64, size_bytes=6)
            self.assertEqual(registry.status("owner-1", created["job_id"])["state"], "READY")

    def test_registry_allows_one_active_and_one_waiting_only(self):
        class BlockingBackend(FakeBackend):
            def prepare(self, **kwargs):
                time.sleep(0.15)
                return super().prepare(**kwargs)
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=BlockingBackend())
            first = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                    rights_basis={"kind": "rights_holder_permission"})
            second = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                     rights_basis={"kind": "rights_holder_permission"})
            with self.assertRaisesRegex(JobError, "QUEUE_FULL"):
                registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                rights_basis={"kind": "rights_holder_permission"})
            self.assertIn(registry.status("owner-1", first["job_id"])["state"], {"PREPARING", "READY"})
            self.assertEqual(registry.status("owner-1", second["job_id"])["state"], "QUEUED")

    def test_unconfirmed_ready_outputs_are_part_of_the_two_job_bound(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend())
            first = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                    rights_basis={"kind": "rights_holder_permission"})
            registry.wait(first["job_id"], timeout=2)
            second = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                     rights_basis={"kind": "rights_holder_permission"})
            registry.wait(second["job_id"], timeout=2)
            with self.assertRaisesRegex(JobError, "QUEUE_FULL"):
                registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                rights_basis={"kind": "rights_holder_permission"})

    def test_terminal_records_are_evicted_after_ttl(self):
        with tempfile.TemporaryDirectory() as root:
            registry = JobRegistry(secret="s" * 32, root=root, backend=FakeBackend(), ttl_seconds=60)
            created = registry.create(subject="owner-1", plan_token=plan_token(), option_id="video-720",
                                      rights_basis={"kind": "rights_holder_permission"})
            ready = registry.wait(created["job_id"], timeout=2)
            registry.confirm_device(subject="owner-1", job_id=created["job_id"],
                                    sha256=ready["output_sha256"], size_bytes=6)
            registry.cleanup(now=created["expires_at"] + 1)
            with self.assertRaisesRegex(JobError, "JOB_NOT_FOUND"):
                registry.status("owner-1", created["job_id"])


if __name__ == "__main__":
    unittest.main()
