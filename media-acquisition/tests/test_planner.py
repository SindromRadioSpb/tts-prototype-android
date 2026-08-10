import time
import unittest

from acquisition_service.planner import (
    MAX_OUTPUT_BYTES,
    PlannerError,
    build_resolved_source,
    canonicalize_youtube_url,
)
from acquisition_service.receipts import verify_plan_token


MIB = 1024 * 1024


def fmt(format_id, *, ext="mp4", vcodec="none", acodec="none", height=None, size=None):
    return {
        "format_id": str(format_id),
        "ext": ext,
        "vcodec": vcodec,
        "acodec": acodec,
        "height": height,
        "filesize": size,
        "filesize_approx": None,
        "protocol": "https",
    }


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.info = {
            "id": "wJgtBgZvQnU",
            "title": "Hebrew interview",
            "duration": 2260,
            "is_live": False,
            "availability": "public",
            "thumbnail": "https://i.ytimg.com/vi/wJgtBgZvQnU/hqdefault.jpg",
            "formats": [
                fmt("18", vcodec="avc1.42001E", acodec="mp4a.40.2", height=360, size=int(96.98 * MIB)),
                fmt("135", vcodec="avc1.4d401f", height=480, size=int(33.52 * MIB)),
                fmt("136", vcodec="avc1.4d401f", height=720, size=int(50.26 * MIB)),
                fmt("137", vcodec="avc1.640028", height=1080, size=int(215.46 * MIB)),
                fmt("399", vcodec="av01.0.08M.08", height=1080, size=int(120 * MIB)),
                fmt("140", acodec="mp4a.40.2", size=int(34.87 * MIB)),
                fmt("251", ext="webm", acodec="opus", size=int(31 * MIB)),
            ],
            "subtitles": {"he": [{"ext": "vtt", "url": "https://signed.invalid/manual"}]},
            "automatic_captions": {"iw": [{"ext": "vtt", "url": "https://signed.invalid/auto"}]},
        }

    def test_owner_watch_url_ignores_playlist_parameters(self):
        out = canonicalize_youtube_url(
            "https://www.youtube.com/watch?v=nNQhzD-T85M&list=PLACmvHcJM5hc&index=2"
        )
        self.assertEqual(out.video_id, "nNQhzD-T85M")
        self.assertEqual(out.url, "https://www.youtube.com/watch?v=nNQhzD-T85M")

    def test_rejects_non_https_non_youtube_and_playlist_only(self):
        for value in (
            "http://www.youtube.com/watch?v=wJgtBgZvQnU",
            "https://example.com/watch?v=wJgtBgZvQnU",
            "https://www.youtube.com/playlist?list=PLACmvHcJM5hc",
        ):
            with self.subTest(value=value), self.assertRaises(PlannerError):
                canonicalize_youtube_url(value)

    def test_complete_format_matrix_is_h264_aac_and_recommends_720(self):
        resolved = build_resolved_source(
            self.info,
            canonical_url="https://www.youtube.com/watch?v=wJgtBgZvQnU",
            subject="owner-1",
            secret="s" * 32,
            now=int(time.time()),
        )
        video = [item for item in resolved["options"] if item["kind"] == "video"]
        self.assertEqual([item["quality"] for item in video], [360, 480, 720, 1080])
        self.assertTrue(all(item["has_audio"] and item["container"] == "mp4" for item in video))
        self.assertEqual(next(item for item in video if item["recommended"])["quality"], 720)
        self.assertLess(next(item for item in video if item["quality"] == 720)["size_bytes"],
                        next(item for item in video if item["quality"] == 360)["size_bytes"])
        self.assertTrue(all(item["size_bytes"] <= MAX_OUTPUT_BYTES for item in video))

    def test_caption_language_normalizes_iw_without_leaking_signed_urls(self):
        resolved = build_resolved_source(
            self.info,
            canonical_url="https://www.youtube.com/watch?v=wJgtBgZvQnU",
            subject="owner-1",
            secret="s" * 32,
            now=int(time.time()),
        )
        captions = [item for item in resolved["options"] if item["kind"] == "captions"]
        self.assertEqual({item["language"] for item in captions}, {"he"})
        self.assertEqual({item["source_kind"] for item in captions}, {"manual", "auto"})
        self.assertNotIn("signed.invalid", repr(resolved))
        token = verify_plan_token(resolved["plan_token"], "s" * 32, now=int(time.time()))
        self.assertNotIn("signed.invalid", repr(token))

    def test_live_and_overlong_sources_fail_closed(self):
        for update, code in (({"is_live": True}, "LIVE_UNSUPPORTED"), ({"duration": 10801}, "DURATION_LIMIT")):
            info = dict(self.info)
            info.update(update)
            with self.subTest(code=code), self.assertRaisesRegex(PlannerError, code):
                build_resolved_source(info, canonical_url="https://www.youtube.com/watch?v=wJgtBgZvQnU",
                                      subject="owner-1", secret="s" * 32, now=int(time.time()))

    def test_extractor_identity_must_match_the_canonical_request(self):
        with self.assertRaisesRegex(PlannerError, "EXTRACTOR_ID_MISMATCH"):
            build_resolved_source(self.info, canonical_url="https://www.youtube.com/watch?v=nNQhzD-T85M",
                                  subject="owner-1", secret="s" * 32, now=int(time.time()))


if __name__ == "__main__":
    unittest.main()
