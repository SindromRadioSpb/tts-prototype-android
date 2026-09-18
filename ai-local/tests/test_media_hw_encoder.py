"""GPU encoding is an option, and its absence must never break a machine.

Owner request 2026-09-18, after a measurement on the owner's own source: the compatible-copy
step runs entirely on libx264 while an RTX 3070 sits idle. h264_nvenc encoded the same 120 s
in 11.2 s against 29.1 s for libx264 - 2.6x - at roughly 35% more bytes.

The rule the owner asked for: make it an option, and do not lose reproducibility on machines
without NVIDIA. So the default stays libx264, opting in is explicit, and a request that the
machine cannot honour falls back instead of failing - while saying which encoder actually ran,
because a silently different encoder is a silently different artifact.
"""

from ai_local.media_compat import select_video_encoder


def test_default_keeps_the_cpu_encoder_and_does_not_even_probe():
    probed = []

    def probe():
        probed.append(1)
        return True

    choice = select_video_encoder("off", probe=probe)
    assert choice["encoder"] == "libx264"
    assert probed == [], "the default path must not depend on a GPU probe"


def test_opting_in_uses_the_gpu_when_the_machine_can():
    choice = select_video_encoder("auto", probe=lambda: True)
    assert choice["encoder"] == "h264_nvenc"
    assert choice["fallback_reason"] is None


def test_opting_in_on_a_machine_without_nvidia_falls_back_and_says_so():
    choice = select_video_encoder("auto", probe=lambda: False)
    assert choice["encoder"] == "libx264"
    assert choice["fallback_reason"], "a silent fallback would hide which encoder ran"


def test_a_probe_that_blows_up_is_a_fallback_not_a_failure():
    def probe():
        raise OSError("no nvidia driver")

    choice = select_video_encoder("auto", probe=probe)
    assert choice["encoder"] == "libx264"
    assert choice["fallback_reason"]


def test_quality_arguments_match_the_encoder_that_will_run():
    cpu = select_video_encoder("off", probe=lambda: False)["quality_args"]
    gpu = select_video_encoder("auto", probe=lambda: True)["quality_args"]
    assert "-crf" in cpu, "libx264 keeps the constant-quality flag it has always used"
    assert "-crf" not in gpu, "h264_nvenc rejects -crf; it takes -cq"
    assert "-cq" in gpu
    # x264 preset names are not NVENC preset names; mixing them makes ffmpeg fail at runtime.
    assert "medium" in cpu and "medium" not in gpu


def test_every_choice_still_targets_the_contract_profile():
    for mode, ok in (("off", False), ("auto", True)):
        choice = select_video_encoder(mode, probe=lambda: ok)
        args = choice["quality_args"]
        assert "-profile:v" in args and "main" in args, "the mobile contract wants H.264 Main"


def test_an_unknown_mode_is_treated_as_off():
    choice = select_video_encoder("turbo", probe=lambda: True)
    assert choice["encoder"] == "libx264"
