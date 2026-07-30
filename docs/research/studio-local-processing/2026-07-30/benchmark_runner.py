#!/usr/bin/env python3
"""Provider-neutral Studio Ingest L0 ASR benchmark.

Research-only. It never imports product modules, changes provider defaults, or writes
outside --work-dir/--out-dir. Raw transcripts remain in the ignored work directory;
committable run manifests contain hashes and metrics, not transcript text.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_WORK = ROOT / ".tmp" / "studio-local-processing-l0"
DEFAULT_OUT = Path(__file__).resolve().parent
HEBREW_MARKS = re.compile(r"[\u0591-\u05c7]")
TOKEN_RE = re.compile(r"[\u05d0-\u05ea]+|[A-Za-z0-9]+", re.UNICODE)
ASR_PROMPT = """Transcribe the Hebrew speech in this audio. Return ONLY a JSON array.
Each item must be {\"start\": seconds, \"end\": seconds, \"text\": Hebrew text}.
Timestamps are relative to the supplied audio bytes. Do not translate or summarize.
If speech is unclear, transcribe only what is actually audible."""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def run(cmd: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, encoding="utf-8", errors="replace",
                          capture_output=capture)


def ffprobe(path: Path) -> dict[str, Any]:
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size,bit_rate",
             "-of", "json", str(path)])
    f = json.loads(p.stdout)["format"]
    return {"duration_sec": float(f["duration"]), "bytes": int(f["size"]),
            "bit_rate": int(f.get("bit_rate") or 0)}


def norm_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = HEBREW_MARKS.sub("", text)
    return " ".join(TOKEN_RE.findall(text.lower()))


def tokens(text: str) -> list[str]:
    return norm_text(text).split()


def edit_distance(a: list[str] | str, b: list[str] | str) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(cur[-1] + 1, prev[j] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def error_rates(reference: str, hypothesis: str) -> dict[str, Any]:
    rw, hw = tokens(reference), tokens(hypothesis)
    rc, hc = list(norm_text(reference).replace(" ", "")), list(norm_text(hypothesis).replace(" ", ""))
    return {
        "reference_words": len(rw), "hypothesis_words": len(hw),
        "wer": edit_distance(rw, hw) / max(1, len(rw)),
        "cer": edit_distance(rc, hc) / max(1, len(rc)),
        "word_count_ratio": len(hw) / max(1, len(rw)),
    }


def duplicate_shingle_rate(text: str, n: int = 4) -> float:
    w = tokens(text)
    if len(w) < n:
        return 0.0
    grams = [tuple(w[i:i+n]) for i in range(len(w) - n + 1)]
    return (len(grams) - len(set(grams))) / len(grams)


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, math.ceil(q * len(s)) - 1)]


def read_dotenv_key() -> str | None:
    value = os.environ.get("INGEST_SMOKE_GEMINI_KEY") or os.environ.get("GEMINI_API_KEY")
    if value:
        return value
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return None


def request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
                 body: bytes | None = None, timeout: int = 600) -> tuple[dict[str, Any], Any]:
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return dict(res.headers), json.loads(res.read().decode("utf-8"))


class ResourceSampler:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.peak_vram_mb = 0
        self.peak_rss_mb = 0.0
        self.baseline_vram_mb = self._vram()
        self.thread = threading.Thread(target=self._loop, daemon=True)

    @staticmethod
    def _vram() -> int:
        try:
            p = run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"])
            return int(p.stdout.strip().splitlines()[0])
        except Exception:
            return 0

    @staticmethod
    def _rss() -> float:
        try:
            import psutil
            return psutil.Process().memory_info().rss / 1024 / 1024
        except Exception:
            return 0.0

    def _loop(self) -> None:
        while not self.stop_event.wait(1.0):
            self.peak_vram_mb = max(self.peak_vram_mb, self._vram())
            self.peak_rss_mb = max(self.peak_rss_mb, self._rss())

    def __enter__(self) -> "ResourceSampler":
        self.peak_vram_mb = self.baseline_vram_mb
        self.peak_rss_mb = self._rss()
        self.thread.start()
        return self

    def __exit__(self, *_: Any) -> None:
        self.stop_event.set()
        self.thread.join(timeout=2)


@dataclass
class Transcript:
    segments: list[dict[str, Any]]
    provider_meta: dict[str, Any]

    @property
    def text(self) -> str:
        return " ".join(str(s.get("text") or "").strip() for s in self.segments).strip()


class LocalProvider:
    def __init__(self, model_path: str, model_id: str, revision: str, compute_type: str) -> None:
        self.model_path, self.model_id, self.revision = model_path, model_id, revision
        self.compute_type = compute_type
        self.model = None
        self.load_sec = None

    def load(self) -> None:
        from faster_whisper import WhisperModel
        started = time.perf_counter()
        self.model = WhisperModel(self.model_path, device="cuda", compute_type=self.compute_type)
        self.load_sec = time.perf_counter() - started

    def transcribe(self, path: Path) -> Transcript:
        if self.model is None:
            self.load()
        started = time.perf_counter()
        stream, info = self.model.transcribe(str(path), language="he", beam_size=5,
                                             condition_on_previous_text=False,
                                             vad_filter=False, word_timestamps=False)
        segs = [{"id": i, "start": float(s.start), "end": float(s.end), "text": s.text.strip()}
                for i, s in enumerate(stream)]
        return Transcript(segs, {"elapsed_sec": time.perf_counter() - started,
                                 "language": info.language,
                                 "language_probability": info.language_probability,
                                 "model_load_sec": self.load_sec})


class GeminiProvider:
    def __init__(self, model: str) -> None:
        self.key = read_dotenv_key()
        if not self.key:
            raise RuntimeError("Gemini key unavailable (environment or project .env)")
        self.model = model

    def _upload(self, path: Path) -> dict[str, Any]:
        meta = ffprobe(path)
        mime = "audio/wav" if path.suffix.lower() == ".wav" else "audio/mpeg"
        url = "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + urllib.parse.quote(self.key)
        req = urllib.request.Request(url, method="POST", headers={
            "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(meta["bytes"]),
            "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json",
        }, data=json.dumps({"file": {"display_name": "l0-benchmark"}}).encode())
        with urllib.request.urlopen(req, timeout=60) as res:
            upload_url = res.headers["X-Goog-Upload-URL"]
        with path.open("rb") as f:
            body = f.read()
        _, uploaded = request_json(upload_url, method="POST", headers={
            "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize",
            "Content-Length": str(len(body)), "Content-Type": mime,
        }, body=body, timeout=600)
        file_obj = uploaded.get("file", uploaded)
        for _ in range(120):
            state = str(file_obj.get("state", "ACTIVE"))
            if state == "ACTIVE":
                return file_obj
            if state == "FAILED":
                raise RuntimeError(f"Gemini file processing failed: {file_obj.get('error')}")
            time.sleep(1)
            _, file_obj = request_json("https://generativelanguage.googleapis.com/v1beta/" +
                                       file_obj["name"] + "?key=" + urllib.parse.quote(self.key))
        raise TimeoutError("Gemini file did not become ACTIVE")

    def transcribe(self, path: Path) -> Transcript:
        started = time.perf_counter()
        f = self._upload(path)
        payload = {"contents": [{"parts": [{"fileData": {"mimeType": f["mimeType"],
                    "fileUri": f["uri"]}}, {"text": ASR_PROMPT}]}],
                   "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
        url = ("https://generativelanguage.googleapis.com/v1beta/models/" + self.model +
               ":generateContent?key=" + urllib.parse.quote(self.key))
        try:
            _, result = request_json(url, method="POST", headers={"Content-Type": "application/json"},
                                     body=json.dumps(payload).encode(), timeout=600)
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
            data = json.loads(text)
            if isinstance(data, dict):
                data = data.get("segments") or data.get("items") or []
            segs = [{"id": i, "start": float(s.get("start", 0)),
                     "end": float(s.get("end", s.get("start", 0))),
                     "text": str(s.get("text", "")).strip()} for i, s in enumerate(data)]
            return Transcript(segs, {"elapsed_sec": time.perf_counter() - started,
                                     "usage_metadata": result.get("usageMetadata", {}),
                                     "actual_model": result.get("modelVersion", self.model),
                                     "uploaded_bytes": path.stat().st_size})
        finally:
            try:
                req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/" +
                                             f["name"] + "?key=" + urllib.parse.quote(self.key),
                                             method="DELETE")
                urllib.request.urlopen(req, timeout=30).close()
            except Exception:
                pass


def resolve_inputs(work: Path) -> dict[str, Any]:
    manifest_path = ROOT / "docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv"
    rows = list(csv.DictReader(manifest_path.open(encoding="utf-8"), delimiter="\t"))
    owner_audio = ROOT / ".tmp/h3-c1-owner-audio"
    downloads = Path.home() / "Downloads"
    s12 = next(downloads.glob("*31.7.18.mp3"), None)
    mia = next(downloads.glob("Freed Israeli hostage Mia Schem*.mp3"), None)
    podcast = ROOT / ".tmp/longmedia-sample.mp3"
    required = [s12, mia, podcast]
    if not all(p and p.exists() for p in required):
        raise FileNotFoundError("Required local long-media source missing; see README input inventory")
    prepared = work / "inputs"
    prepared.mkdir(parents=True, exist_ok=True)
    noisy = prepared / "noisy-short.wav"
    if not noisy.exists():
        run(["ffmpeg", "-y", "-v", "error", "-i", str(owner_audio / rows[4]["audio_file"]),
             "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.08:seed=20260730",
             "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.45",
             "-ar", "16000", "-ac", "1", str(noisy)], capture=False)
    long_boundary = prepared / "long-boundary-3h.mp3"
    if not long_boundary.exists():
        run(["ffmpeg", "-y", "-v", "error", "-i", str(s12), "-i", str(mia), "-i", str(podcast),
             "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]", "-map", "[out]",
             "-ar", "16000", "-ac", "1", "-b:a", "64k", str(long_boundary)], capture=False)
    cases = [
        {"id": "clean-short", "kind": "gold", "path": owner_audio / rows[0]["audio_file"],
         "reference": rows[0]["sentence"], "chunk_sec": 0},
        {"id": "noisy-short", "kind": "gold-noisy", "path": noisy,
         "reference": rows[4]["sentence"], "chunk_sec": 0},
        {"id": "conversation-multispeaker", "kind": "subtitle-oracle", "path": mia,
         "oracle": work / "oracles/mia.iw-orig.json3", "chunk_sec": 900},
        {"id": "s12-117min", "kind": "s12-independent", "path": s12, "chunk_sec": 900},
        {"id": "long-boundary-3h", "kind": "boundary", "path": long_boundary, "chunk_sec": 900},
        {"id": "batch-20", "kind": "batch-gold", "members": [
            {"path": owner_audio / r["audio_file"], "reference": r["sentence"], "id": r["id"]}
            for r in rows if r["condition"] == "NORMAL"
        ][:20]},
    ]
    return {"cases": cases, "sources": {"c1_manifest": manifest_path}}


def make_chunks(path: Path, chunk_sec: int, work: Path) -> list[tuple[Path, float, float]]:
    meta = ffprobe(path)
    if not chunk_sec or meta["duration_sec"] <= chunk_sec:
        return [(path, 0.0, meta["duration_sec"])]
    out = work / "chunks" / sha256(path)[:16]
    out.mkdir(parents=True, exist_ok=True)
    chunks = []
    start = 0.0
    while start < meta["duration_sec"] - 0.01:
        dur = min(chunk_sec, meta["duration_sec"] - start)
        target = out / f"{int(start):06d}.wav"
        if not target.exists():
            run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(dur),
                 "-i", str(path), "-ar", "16000", "-ac", "1", target.as_posix()], capture=False)
        chunks.append((target, start, dur))
        start += chunk_sec
    return chunks


def parse_json3(path: Path) -> tuple[str, list[tuple[str, float]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    timed: list[tuple[str, float]] = []
    for event in data.get("events", []):
        text = "".join(s.get("utf8", "") for s in event.get("segs", []))
        start = float(event.get("tStartMs", 0)) / 1000
        for word in tokens(text):
            timed.append((word, start))
    return " ".join(w for w, _ in timed), timed


def timestamp_oracle(segments: list[dict[str, Any]], oracle: Path) -> dict[str, Any] | None:
    if not oracle.exists():
        return None
    _, ref = parse_json3(oracle)
    hyp: list[tuple[str, float]] = []
    for seg in segments:
        ws = tokens(str(seg.get("text", "")))
        a = float(seg.get("start", 0))
        b = float(seg.get("end", a))
        for i, w in enumerate(ws):
            hyp.append((w, a + (b - a) * i / max(1, len(ws))))
    sm = difflib.SequenceMatcher(a=[w for w, _ in ref], b=[w for w, _ in hyp], autojunk=False)
    errors = []
    for a, b, n in sm.get_matching_blocks():
        for i in range(n):
            errors.append(abs(ref[a+i][1] - hyp[b+i][1]))
    return {"matched_words": len(errors), "timestamp_abs_error_p50_sec": percentile(errors, .5),
            "timestamp_abs_error_p95_sec": percentile(errors, .95)}


def summarize_segments(segments: list[dict[str, Any]], duration: float, chunk_rows: list[dict[str, Any]]) -> dict[str, Any]:
    text = " ".join(str(s.get("text", "")) for s in segments)
    starts = [float(s.get("start", 0)) for s in segments]
    ends = [float(s.get("end", 0)) for s in segments]
    compressed = [r for r in chunk_rows if r["duration_sec"] >= 300 and r["clock_span_ratio"] < .85]
    expanded = [r for r in chunk_rows if r["duration_sec"] >= 300 and r["clock_span_ratio"] > 1.15]
    return {"words": len(tokens(text)), "segments": len(segments),
            "duplicate_4gram_rate": duplicate_shingle_rate(text),
            "timestamp_monotonic": all(starts[i] >= starts[i-1] for i in range(1, len(starts))),
            "clock_span_ratio": (max(ends) - min(starts)) / max(1, duration) if starts else 0,
            "zero_text_chunks": sum(r["words"] == 0 and r["duration_sec"] >= 30 for r in chunk_rows),
            "chunks_total": len(chunk_rows), "short_tail_chunks": sum(r["duration_sec"] < 30 for r in chunk_rows),
            "clock_compressed_chunks": len(compressed), "clock_expanded_chunks": len(expanded),
            "clock_distorted_chunks": len(compressed) + len(expanded)}


def run_case(provider: Any, case: dict[str, Any], work: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if case["kind"] == "batch-gold":
        member_runs, texts, refs, elapsed, total_duration, provider_meta = [], [], [], 0.0, 0.0, []
        for m in case["members"]:
            t = provider.transcribe(Path(m["path"]))
            duration = ffprobe(Path(m["path"]))["duration_sec"]
            member_runs.append({"id": m["id"], **error_rates(m["reference"], t.text),
                                "elapsed_sec": t.provider_meta["elapsed_sec"], "duration_sec": duration})
            texts.append(t.text); refs.append(m["reference"]); elapsed += t.provider_meta["elapsed_sec"]
            total_duration += duration; provider_meta.append(t.provider_meta)
        raw = {"members": member_runs, "text": texts, "provider": provider_meta}
        scored = error_rates(" ".join(refs), " ".join(texts))
        scored.update({"elapsed_sec": elapsed, "items": len(member_runs),
                       "duration_sec": total_duration, "rtf": elapsed / max(1, total_duration),
                       "item_wer_p50": percentile([x["wer"] for x in member_runs], .5),
                       "item_wer_p95": percentile([x["wer"] for x in member_runs], .95)})
        return raw, scored
    path = Path(case["path"])
    chunks = make_chunks(path, int(case.get("chunk_sec") or 0), work)
    segments, chunk_rows, provider_rows = [], [], []
    for chunk, offset, duration in chunks:
        t = provider.transcribe(chunk)
        shifted = [{**s, "start": float(s["start"]) + offset, "end": float(s["end"]) + offset}
                   for s in t.segments]
        segments.extend(shifted)
        local_starts = [float(s["start"]) for s in t.segments]
        local_ends = [float(s["end"]) for s in t.segments]
        chunk_rows.append({"offset_sec": offset, "duration_sec": duration,
                           "words": len(tokens(t.text)), "segments": len(t.segments),
                           "clock_span_ratio": ((max(local_ends) - min(local_starts)) / max(1, duration))
                           if local_starts else 0, "elapsed_sec": t.provider_meta["elapsed_sec"]})
        provider_rows.append(t.provider_meta)
    meta = ffprobe(path)
    raw = {"segments": segments, "chunks": chunk_rows, "provider": provider_rows}
    scored = summarize_segments(segments, meta["duration_sec"], chunk_rows)
    scored.update({"duration_sec": meta["duration_sec"],
                   "elapsed_sec": sum(r["elapsed_sec"] for r in chunk_rows),
                   "rtf": sum(r["elapsed_sec"] for r in chunk_rows) / meta["duration_sec"],
                   "input_sha256": sha256(path), "input_bytes": meta["bytes"]})
    text = " ".join(str(s.get("text", "")) for s in segments)
    if case.get("reference"):
        scored.update(error_rates(case["reference"], text))
    oracle = timestamp_oracle(segments, Path(case["oracle"])) if case.get("oracle") else None
    if oracle:
        scored["timestamp_oracle"] = oracle
        ref_text, _ = parse_json3(Path(case["oracle"]))
        scored["oracle_text"] = error_rates(ref_text, text)
    usage = {"promptTokenCount": 0, "candidatesTokenCount": 0, "totalTokenCount": 0}
    for row in provider_rows:
        for key in usage:
            usage[key] += int(row.get("usage_metadata", {}).get(key, 0) or 0)
    if any(usage.values()):
        scored["usage_metadata"] = usage
    loads = [r.get("model_load_sec") for r in provider_rows if r.get("model_load_sec") is not None]
    if loads:
        scored["cold_model_load_sec"] = loads[0]
    return raw, scored


def score_existing(case: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    if case["kind"] == "batch-gold":
        refs = [m["reference"] for m in case["members"]]
        texts = raw["text"]
        rows = raw["members"]
        scored = error_rates(" ".join(refs), " ".join(texts))
        duration = sum(float(x.get("duration_sec", 0)) for x in rows)
        elapsed = sum(float(x.get("elapsed_sec", 0)) for x in rows)
        scored.update({"elapsed_sec": elapsed, "items": len(rows), "duration_sec": duration,
                       "rtf": elapsed / max(1, duration),
                       "item_wer_p50": percentile([x["wer"] for x in rows], .5),
                       "item_wer_p95": percentile([x["wer"] for x in rows], .95)})
        return scored
    path = Path(case["path"])
    meta = ffprobe(path)
    segments, chunk_rows = raw["segments"], raw["chunks"]
    scored = summarize_segments(segments, meta["duration_sec"], chunk_rows)
    elapsed = sum(float(r.get("elapsed_sec", 0)) for r in chunk_rows)
    scored.update({"duration_sec": meta["duration_sec"], "elapsed_sec": elapsed,
                   "rtf": elapsed / meta["duration_sec"], "input_sha256": sha256(path),
                   "input_bytes": meta["bytes"]})
    text = " ".join(str(s.get("text", "")) for s in segments)
    if case.get("reference"):
        scored.update(error_rates(case["reference"], text))
    oracle = timestamp_oracle(segments, Path(case["oracle"])) if case.get("oracle") else None
    if oracle:
        scored["timestamp_oracle"] = oracle
        ref_text, _ = parse_json3(Path(case["oracle"]))
        scored["oracle_text"] = error_rates(ref_text, text)
    usage = {"promptTokenCount": 0, "candidatesTokenCount": 0, "totalTokenCount": 0}
    for row in raw.get("provider", []):
        for key in usage:
            usage[key] += int(row.get("usage_metadata", {}).get(key, 0) or 0)
    if any(usage.values()): scored["usage_metadata"] = usage
    loads = [r.get("model_load_sec") for r in raw.get("provider", []) if r.get("model_load_sec") is not None]
    if loads: scored["cold_model_load_sec"] = loads[0]
    return scored


def command_prepare(args: argparse.Namespace) -> None:
    resolved = resolve_inputs(args.work_dir)
    rows = []
    for c in resolved["cases"]:
        if c.get("path"):
            p = Path(c["path"]); m = ffprobe(p)
            rows.append({"id": c["id"], "kind": c["kind"], "sha256": sha256(p), **m,
                         "location": "external-local-only" if ROOT not in p.parents else "gitignored-local"})
        else:
            rows.append({"id": c["id"], "kind": c["kind"], "members": len(c["members"]),
                         "sha256": hashlib.sha256("".join(sha256(Path(x["path"])) for x in c["members"]).encode()).hexdigest(),
                         "location": "gitignored-local"})
    json_dump(args.work_dir / "resolved-inputs.json", {"cases": rows})
    print(json.dumps({"prepared": rows}, ensure_ascii=False, indent=2))


def command_run(args: argparse.Namespace) -> None:
    resolved = resolve_inputs(args.work_dir)
    selected = [c for c in resolved["cases"] if not args.case or c["id"] in args.case]
    if args.provider == "gemini":
        provider = GeminiProvider(args.gemini_model)
        provider_desc = {"provider": "gemini", "model": args.gemini_model, "upload": True}
    else:
        provider = LocalProvider(args.model_path, args.model_id, args.model_revision, args.compute_type)
        provider_desc = {"provider": "local-faster-whisper", "model": args.model_id,
                         "revision": args.model_revision, "compute_type": args.compute_type,
                         "upload": False}
    out_root = args.work_dir / "runs" / args.run_id
    out_root.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with ResourceSampler() as sampler:
        results = []
        for case in selected:
            t0 = time.perf_counter()
            raw_path = out_root / f"{case['id']}.raw.json"
            if args.reuse_raw and raw_path.exists():
                raw = json.loads(raw_path.read_text(encoding="utf-8"))
                scored = score_existing(case, raw)
            else:
                raw, scored = run_case(provider, case, args.work_dir)
                json_dump(raw_path, raw)
            results.append({"case": case["id"], "kind": case["kind"], "metrics": scored,
                            "wall_sec": time.perf_counter() - t0,
                            "raw_sha256": sha256(raw_path), "raw_location": "gitignored-local"})
            print(f"{case['id']}: {results[-1]['wall_sec']:.1f}s", flush=True)
    raw_provider_rows = [row for c in selected for row in
                         json.loads((out_root / f"{c['id']}.raw.json").read_text(encoding="utf-8")).get("provider", [])]
    actual_models = sorted({str(x["actual_model"]) for x in raw_provider_rows if x.get("actual_model")})
    if args.provider == "gemini":
        provider_desc["actual_models"] = actual_models
    total_uploaded = sum(int(x.get("uploaded_bytes", 0) or 0) for x in raw_provider_rows)
    prompt_tokens = sum(int(x.get("usage_metadata", {}).get("promptTokenCount", 0) or 0)
                        for x in raw_provider_rows)
    output_tokens = sum(int(x.get("usage_metadata", {}).get("candidatesTokenCount", 0) or 0)
                        for x in raw_provider_rows)
    cost = None
    pricing = None
    if args.provider == "gemini":
        if actual_models == ["gemini-3.6-flash"]:
            cost = prompt_tokens * 1.5 / 1_000_000 + output_tokens * 7.5 / 1_000_000
            pricing = "Gemini 3.6 Flash standard paid-list price checked 2026-07-30: input $1.50/M tokens; output $7.50/M. Actual free-tier/account charge unavailable."
        else:
            pricing = "No price assigned: actual model set was absent, mixed, or unrecognized."
    manifest = {"schema": "studio-local-processing-run-v1", "run_id": args.run_id,
                "started_unix": started, "finished_unix": time.time(), "provider": provider_desc,
                "results": results, "resources": ({"measurement": "not_remeasured_reuse_raw"}
                if args.reuse_raw else {"vram_baseline_mb": sampler.baseline_vram_mb,
                "vram_peak_total_mb": sampler.peak_vram_mb,
                "vram_peak_delta_mb": max(0, sampler.peak_vram_mb - sampler.baseline_vram_mb),
                "ram_peak_process_mb": sampler.peak_rss_mb}),
                "privacy": {"bytes_uploaded": total_uploaded, "source_uploaded": args.provider == "gemini"},
                "cost": {"estimated_list_price_usd": cost, "prompt_tokens": prompt_tokens,
                         "output_tokens": output_tokens, "basis": pricing,
                         "local_api_cost_usd": 0 if args.provider == "local" else None},
                "raw_outputs": "gitignored-local; hashes above"}
    stable = args.out_dir / f"run-manifest-{args.run_id}.json"
    json_dump(stable, manifest)
    print(stable)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--work-dir", type=Path, default=DEFAULT_WORK)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare")
    r = sub.add_parser("run")
    r.add_argument("--provider", choices=["local", "gemini"], required=True)
    r.add_argument("--run-id", required=True)
    r.add_argument("--case", action="append")
    r.add_argument("--model-path")
    r.add_argument("--model-id", default="")
    r.add_argument("--model-revision", default="")
    r.add_argument("--compute-type", default="float16")
    r.add_argument("--gemini-model", default="gemini-flash-latest")
    r.add_argument("--reuse-raw", action="store_true")
    return p


def main() -> None:
    args = build_parser().parse_args()
    args.work_dir = args.work_dir.resolve(); args.out_dir = args.out_dir.resolve()
    if args.command == "prepare": command_prepare(args)
    elif args.command == "run": command_run(args)


if __name__ == "__main__":
    main()
