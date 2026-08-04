#!/usr/bin/env python3
"""Reproducible L4.0a Hebrew<->Russian MT benchmark harness.

The runner deliberately keeps benchmark assets and model outputs separate from
the Studio runtime.  It does not change provider defaults and never writes to
production storage.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


TSV_FIELDS = [
    "id",
    "domain",
    "subdomain",
    "source_lang",
    "target_lang",
    "source_text",
    "reference_text",
    "provenance_id",
    "source_sha256",
    "stress_kind",
    "parent_id",
]

OUTPUT_FIELDS = TSV_FIELDS + [
    "system",
    "hypothesis",
    "source_tokens",
    "output_tokens",
    "thinking_tokens",
    "provider_failure",
    "truncated",
    "elapsed_sec",
]

BLIND_FIELDS = [
    "blind_item_id",
    "source_id",
    "domain",
    "source_lang",
    "target_lang",
    "source_text",
    "reference_text",
    "candidate_text",
    "meaning_adequacy_1_5",
    "missing_meaning_yes_no",
    "added_meaning_yes_no",
    "pedagogical_suitability_1_5",
    "notes",
]

HEBREW_RE = re.compile(r"[\u0590-\u05ff]")
CYRILLIC_RE = re.compile(r"[\u0400-\u04ff]")
NIQQUD_RE = re.compile(r"[\u0591-\u05c7]")
PUNCT_RE = re.compile(r"[\.,!?;:\-–—…׳״'\"()\[\]{}]")
SPACE_RE = re.compile(r"\s+")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…׃])\s+|\n+")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_space(text: str) -> str:
    return SPACE_RE.sub(" ", str(text or "").replace("\ufeff", " ")).strip()


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return [dict(row) for row in csv.DictReader(stream, delimiter="\t")]


def write_tsv(path: Path, rows: Iterable[dict[str, Any]], fields: Sequence[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            delimiter="\t",
            fieldnames=list(fields),
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
    for attempt in range(5):
        try:
            os.replace(temporary, path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")


def load_canon_library(canon_zip: Path) -> dict[str, Any]:
    with zipfile.ZipFile(canon_zip) as archive:
        with archive.open("library/library.json") as stream:
            return json.load(stream)


def split_literary_segments(text: str) -> list[str]:
    candidates: list[str] = []
    for piece in SENTENCE_SPLIT_RE.split(text.replace("\r", "\n")):
        piece = normalize_space(piece)
        words = piece.split()
        if not 5 <= len(words) <= 45:
            continue
        if not 25 <= len(piece) <= 360:
            continue
        if len(HEBREW_RE.findall(piece)) < max(8, len(piece) // 5):
            continue
        if piece.isdigit() or re.fullmatch(r"[IVXLCDM]+", piece):
            continue
        candidates.append(piece)
    return candidates


def prepare_in_domain(
    asr_manifest: Path,
    canon_zip: Path,
    output: Path,
    asr_limit: int = 50,
    literary_limit: int = 150,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    with asr_manifest.open("r", encoding="utf-8-sig", newline="") as stream:
        for source in csv.DictReader(stream, delimiter="\t"):
            if source.get("condition") != "NORMAL":
                continue
            text = normalize_space(source.get("sentence", ""))
            if not text or text in seen:
                continue
            seen.add(text)
            rows.append(
                {
                    "id": f"ID-ASR-{len(rows) + 1:03d}",
                    "domain": "in-domain",
                    "subdomain": "asr-style-human-gold",
                    "source_lang": "he",
                    "target_lang": "ru",
                    "source_text": text,
                    "reference_text": "",
                    "provenance_id": f"{asr_manifest.as_posix()}#{source['id']}",
                    "source_sha256": sha256_text(text),
                    "stress_kind": "none",
                    "parent_id": "",
                }
            )
            if sum(row["subdomain"] == "asr-style-human-gold" for row in rows) >= asr_limit:
                break

    asr_count = len(rows)
    if asr_count < asr_limit:
        raise ValueError(f"ASR manifest yielded {asr_count}, expected {asr_limit}")

    library = load_canon_library(canon_zip)
    by_genre: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    for item in sorted(library.get("texts", []), key=lambda value: value.get("text_id", "")):
        corpus = item.get("corpus") or {}
        genre = str(corpus.get("genre") or "unknown")
        if genre not in {"article", "poetry", "prose"}:
            continue
        for index, text in enumerate(split_literary_segments(item.get("source_text", "")), start=1):
            if text in seen:
                continue
            by_genre[genre].append((item.get("text_id", "unknown"), index, text))

    genre_order = ("article", "prose", "poetry")
    genre_cursor = {genre: 0 for genre in genre_order}
    literary: list[tuple[str, str, int, str]] = []
    while len(literary) < literary_limit:
        progressed = False
        for genre in genre_order:
            cursor = genre_cursor[genre]
            if cursor >= len(by_genre[genre]):
                continue
            text_id, index, text = by_genre[genre][cursor]
            genre_cursor[genre] += 1
            if text in seen:
                continue
            seen.add(text)
            literary.append((genre, text_id, index, text))
            progressed = True
            if len(literary) >= literary_limit:
                break
        if not progressed:
            break

    if len(literary) < literary_limit:
        raise ValueError(f"Canon yielded {len(literary)}, expected {literary_limit}")

    for sequence, (genre, text_id, index, text) in enumerate(literary, start=1):
        rows.append(
            {
                "id": f"ID-LIT-{sequence:03d}",
                "domain": "in-domain",
                "subdomain": f"reading-room-{genre}",
                "source_lang": "he",
                "target_lang": "ru",
                "source_text": text,
                "reference_text": "",
                "provenance_id": f"{canon_zip.as_posix()}#library/{text_id}:{index}",
                "source_sha256": sha256_text(text),
                "stress_kind": "none",
                "parent_id": "",
            }
        )

    write_tsv(output, rows, TSV_FIELDS)
    counts = defaultdict(int)
    for row in rows:
        counts[row["subdomain"]] += 1
    return {
        "schema": "l4-mt-in-domain-selection-v1",
        "output": output.as_posix(),
        "output_sha256": sha256_file(output),
        "rows": len(rows),
        "counts": dict(sorted(counts.items())),
        "sources": {
            "asr_manifest": {"path": asr_manifest.as_posix(), "sha256": sha256_file(asr_manifest)},
            "reading_room_canon": {"path": canon_zip.as_posix(), "sha256": sha256_file(canon_zip)},
        },
        "reference_status": "OWNER_REQUIRED",
    }


def validate_gold(path: Path, require_references: bool) -> dict[str, Any]:
    rows = read_tsv(path)
    errors: list[str] = []
    ids: set[str] = set()
    hashes: set[str] = set()
    for line, row in enumerate(rows, start=2):
        missing = [field for field in TSV_FIELDS if field not in row]
        if missing:
            errors.append(f"line {line}: missing columns {missing}")
            continue
        source = normalize_space(row["source_text"])
        if not source:
            errors.append(f"line {line}: empty source")
        if row["id"] in ids:
            errors.append(f"line {line}: duplicate id {row['id']}")
        ids.add(row["id"])
        actual_hash = sha256_text(source)
        if row["source_sha256"] != actual_hash:
            errors.append(f"line {line}: source hash mismatch for {row['id']}")
        if actual_hash in hashes:
            errors.append(f"line {line}: duplicate source for {row['id']}")
        hashes.add(actual_hash)
        if require_references and not normalize_space(row["reference_text"]):
            errors.append(f"line {line}: owner reference missing for {row['id']}")
        if row["source_lang"] not in {"he", "ru"} or row["target_lang"] not in {"he", "ru"}:
            errors.append(f"line {line}: invalid language pair")
        if row["source_lang"] == row["target_lang"]:
            errors.append(f"line {line}: identical source/target language")
    return {
        "ok": not errors,
        "path": path.as_posix(),
        "sha256": sha256_file(path),
        "rows": len(rows),
        "references_complete": all(normalize_space(row.get("reference_text", "")) for row in rows),
        "errors": errors,
    }


def fetch_url(url: str, destination: Path, token: str) -> None:
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)


def get_hf_token() -> str:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
    if token:
        return token
    try:
        from huggingface_hub import get_token

        token = get_token()
    except (ImportError, OSError):
        token = None
    if not token:
        raise RuntimeError(
            "Hugging Face authentication is required after accepting the gated resource terms"
        )
    return token


def extract_flores_text(record: dict[str, Any]) -> str:
    for key in ("text", "sentence", "raw", "translation"):
        value = record.get(key)
        if isinstance(value, str):
            return normalize_space(value)
    raise ValueError(f"No sentence field in FLORES+ record keys={sorted(record)}")


def fetch_flores(revision: str, output_dir: Path, combined_output: Path) -> dict[str, Any]:
    token = get_hf_token()
    base = f"https://huggingface.co/datasets/openlanguagedata/flores_plus/resolve/{revision}/devtest"
    files: dict[str, Path] = {}
    for language in ("heb_Hebr", "rus_Cyrl"):
        destination = output_dir / f"{language}.jsonl"
        fetch_url(f"{base}/{language}.jsonl", destination, token)
        files[language] = destination

    data: dict[str, list[dict[str, Any]]] = {}
    for language, path in files.items():
        records = []
        with path.open("r", encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    records.append(json.loads(line))
        data[language] = records
    if len(data["heb_Hebr"]) != len(data["rus_Cyrl"]):
        raise ValueError("FLORES+ language files have different row counts")

    rows: list[dict[str, Any]] = []
    for index, (he_record, ru_record) in enumerate(zip(data["heb_Hebr"], data["rus_Cyrl"]), start=1):
        he = extract_flores_text(he_record)
        ru = extract_flores_text(ru_record)
        shared_id = f"FLORES-shared-{index:04d}"
        upstream_ids = f"heb={he_record.get('id', '')};rus={ru_record.get('id', '')}"
        for source_lang, target_lang, source, reference in (
            ("he", "ru", he, ru),
            ("ru", "he", ru, he),
        ):
            rows.append(
                {
                    "id": f"FLORES-{source_lang}-{target_lang}-{index:04d}",
                    "domain": "flores-plus-v4.6-devtest",
                    "subdomain": "evaluation",
                    "source_lang": source_lang,
                    "target_lang": target_lang,
                    "source_text": source,
                    "reference_text": reference,
                    "provenance_id": (
                        f"openlanguagedata/flores_plus@{revision}#devtest-{index:04d};"
                        f"{upstream_ids}"
                    ),
                    "source_sha256": sha256_text(source),
                    "stress_kind": "none",
                    "parent_id": shared_id,
                }
            )
    write_tsv(combined_output, rows, TSV_FIELDS)
    return {
        "schema": "l4-mt-flores-plus-local-manifest-v2",
        "dataset": "openlanguagedata/flores_plus",
        "version": "4.6",
        "revision": revision,
        "license": "CC-BY-SA-4.0",
        "terms": "official gated evaluation data; accepted by owner; evaluation use only",
        "redistribution": "raw and combined files stay gitignored-local",
        "rows_per_language": len(data["heb_Hebr"]),
        "combined_rows": len(rows),
        "files": {
            language: {"path": path.as_posix(), "sha256": sha256_file(path), "bytes": path.stat().st_size}
            for language, path in files.items()
        },
        "combined": {
            "path": combined_output.as_posix(),
            "sha256": sha256_file(combined_output),
            "bytes": combined_output.stat().st_size,
        },
    }


def sample_flores_stage_a(
    input_path: Path,
    output_path: Path,
    shared_ids: int,
    seed: str,
) -> dict[str, Any]:
    """Select complete bilingual FLORES pairs before any system output is read."""
    rows = read_tsv(input_path)
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("domain") != "flores-plus-v4.6-devtest":
            raise ValueError(f"Unexpected domain in FLORES input: {row.get('domain')}")
        shared_id = row.get("parent_id", "")
        if not shared_id:
            match = re.fullmatch(r"FLORES-(?:he-ru|ru-he)-(\d{4})", row.get("id", ""))
            if not match:
                raise ValueError(f"Missing shared parent_id for {row.get('id')}")
            shared_id = f"FLORES-shared-{match.group(1)}"
        grouped[shared_id].append(row)

    if not 0 < shared_ids <= len(grouped):
        raise ValueError(f"shared_ids must be in 1..{len(grouped)}")
    required_directions = {("he", "ru"), ("ru", "he")}
    for provenance_id, pair in grouped.items():
        directions = {(row["source_lang"], row["target_lang"]) for row in pair}
        if len(pair) != 2 or directions != required_directions:
            raise ValueError(
                f"FLORES shared pair {provenance_id} must contain exactly he-ru and ru-he"
            )

    ranked = sorted(
        grouped,
        key=lambda value: (sha256_text(f"{seed}\0{value}"), value),
    )
    selected_ids = set(ranked[:shared_ids])
    selected_rows = []
    for row in rows:
        shared_id = row.get("parent_id", "")
        if not shared_id:
            match = re.fullmatch(r"FLORES-(?:he-ru|ru-he)-(\d{4})", row.get("id", ""))
            shared_id = f"FLORES-shared-{match.group(1)}" if match else ""
        if shared_id in selected_ids:
            selected_rows.append(row)
    write_tsv(output_path, selected_rows, TSV_FIELDS)
    return {
        "schema": "l4-mt-flores-stage-a-selection-v2",
        "authority": "owner GO 2026-08-04 / Benchmark Manifest v2",
        "algorithm": "sort shared devtest parent IDs by sha256(seed + NUL + shared_id), tie-break by ID",
        "seed": seed,
        "requested_shared_ids": shared_ids,
        "selected_shared_ids": len(selected_ids),
        "selected_rows": len(selected_rows),
        "directions": {
            direction: sum(
                f"{row['source_lang']}-{row['target_lang']}" == direction
                for row in selected_rows
            )
            for direction in ("he-ru", "ru-he")
        },
        "input": {
            "path": input_path.as_posix(),
            "sha256": sha256_file(input_path),
            "rows": len(rows),
            "shared_ids": len(grouped),
        },
        "output": {
            "path": output_path.as_posix(),
            "sha256": sha256_file(output_path),
            "bytes": output_path.stat().st_size,
        },
        "selected_id_set_sha256": sha256_text("\n".join(sorted(selected_ids)) + "\n"),
        "redistribution": "selected rows stay gitignored-local; manifest metadata may be committed",
    }


def fetch_cometkiwi(repo_id: str, revision: str, output_dir: Path) -> dict[str, Any]:
    from huggingface_hub import snapshot_download

    token = get_hf_token()
    snapshot_download(
        repo_id=repo_id,
        revision=revision,
        local_dir=output_dir,
        token=token,
    )
    files = []
    for path in sorted(output_dir.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(output_dir).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )
    return {
        "schema": "l4-mt-cometkiwi-local-manifest-v1",
        "repo_id": repo_id,
        "revision": revision,
        "license": "CC-BY-NC-SA-4.0",
        "use": "supplementary research/gate signal only",
        "output_dir": output_dir.as_posix(),
        "files": files,
    }


class GpuSampler:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled
        self.samples: list[tuple[int, int]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _sample(self) -> None:
        while not self._stop.is_set():
            try:
                output = subprocess.check_output(
                    [
                        "nvidia-smi",
                        "--query-gpu=memory.used,utilization.gpu",
                        "--format=csv,noheader,nounits",
                    ],
                    text=True,
                    stderr=subprocess.DEVNULL,
                    timeout=3,
                ).splitlines()[0]
                memory, utilization = [int(value.strip()) for value in output.split(",")]
                self.samples.append((memory, utilization))
            except (OSError, subprocess.SubprocessError, ValueError, IndexError):
                pass
            self._stop.wait(0.25)

    def __enter__(self) -> "GpuSampler":
        if not self.enabled:
            return self
        self._thread = threading.Thread(target=self._sample, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_: Any) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def summary(self) -> dict[str, Any]:
        if not self.enabled:
            return {"sampled": False, "reason": "candidate is cloud or CPU-only"}
        if not self.samples:
            return {"sampled": True, "samples": 0, "memory_used_mib_peak": None, "gpu_utilization_pct_peak": None}
        return {
            "sampled": True,
            "samples": len(self.samples),
            "memory_used_mib_start": self.samples[0][0],
            "memory_used_mib_peak": max(sample[0] for sample in self.samples),
            "gpu_utilization_pct_peak": max(sample[1] for sample in self.samples),
            "gpu_utilization_pct_mean": round(sum(sample[1] for sample in self.samples) / len(self.samples), 3),
        }


@dataclass
class Translation:
    text: str
    source_tokens: int
    output_tokens: int
    thinking_tokens: int = 0
    provider_failure: str = ""
    truncated: bool = False


class Ct2SentencePieceAdapter:
    def __init__(
        self,
        model_dir: Path,
        device: str,
        compute_type: str,
        beam_size: int,
        prefix_style: str,
    ) -> None:
        import ctranslate2
        import sentencepiece as spm

        self.translator = ctranslate2.Translator(str(model_dir), device=device, compute_type=compute_type)
        source_path = model_dir / "source.spm"
        if not source_path.exists():
            source_path = model_dir / "spiece.model"
        self.source_sp = spm.SentencePieceProcessor(model_file=str(source_path))
        target_path = model_dir / "target.spm"
        self.target_sp = spm.SentencePieceProcessor(
            model_file=str(target_path if target_path.exists() else source_path)
        )
        self.beam_size = beam_size
        self.prefix_style = prefix_style

    def translate(self, rows: Sequence[dict[str, str]]) -> list[Translation]:
        encoded = []
        for row in rows:
            prefix_token = None
            if self.prefix_style == "madlad":
                source_tokens = self.source_sp.encode(
                    f"<2{row['target_lang']}> {row['source_text']}", out_type=str
                )
            elif self.prefix_style == "opus-target" and row["target_lang"] == "ru":
                # Tatoeba-MT preprocesses the sentence with SentencePiece first,
                # then prepends the raw language control token.
                prefix_token = ">>rus<<"
                source_tokens = self.source_sp.encode(row["source_text"], out_type=str)
            else:
                source_tokens = self.source_sp.encode(row["source_text"], out_type=str)
            if prefix_token:
                source_tokens.insert(0, prefix_token)
            encoded.append(source_tokens)
        results = self.translator.translate_batch(
            encoded,
            beam_size=self.beam_size,
            # Match the existing Studio MADLAD runtime and bound runaway
            # literary generations. The same cap is applied to OPUS for a
            # comparable operational measurement.
            max_decoding_length=256,
            max_batch_size=len(rows),
        )
        translated = []
        for source_tokens, result in zip(encoded, results):
            output_tokens = result.hypotheses[0]
            translated.append(
                Translation(
                    text=self.target_sp.decode(output_tokens),
                    source_tokens=len(source_tokens),
                    output_tokens=len(output_tokens),
                )
            )
        return translated


class NllbCt2Adapter:
    LANG_CODES = {"he": "heb_Hebr", "ru": "rus_Cyrl"}

    def __init__(self, model_dir: Path, device: str, compute_type: str, beam_size: int) -> None:
        import ctranslate2
        from transformers import AutoTokenizer

        self.translator = ctranslate2.Translator(str(model_dir), device=device, compute_type=compute_type)
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.beam_size = beam_size

    def translate(self, rows: Sequence[dict[str, str]]) -> list[Translation]:
        all_results: list[Translation] = []
        for row in rows:
            self.tokenizer.src_lang = self.LANG_CODES[row["source_lang"]]
            ids = self.tokenizer(row["source_text"], add_special_tokens=True).input_ids
            truncated = len(ids) > 512
            ids = ids[:512]
            source_tokens = self.tokenizer.convert_ids_to_tokens(ids)
            target_token = self.LANG_CODES[row["target_lang"]]
            result = self.translator.translate_batch(
                [source_tokens],
                target_prefix=[[target_token]],
                beam_size=self.beam_size,
                max_decoding_length=1024,
            )[0]
            output_tokens = result.hypotheses[0]
            output_ids = self.tokenizer.convert_tokens_to_ids(output_tokens)
            all_results.append(
                Translation(
                    text=self.tokenizer.decode(output_ids, skip_special_tokens=True),
                    source_tokens=len(source_tokens),
                    output_tokens=len(output_tokens),
                    truncated=truncated,
                )
            )
        return all_results


class HyMtAdapter:
    LANGUAGE_NAMES = {"he": "Hebrew", "ru": "Russian"}

    def __init__(self, model_path: str, revision: str, dtype: str) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        torch_dtype = {"float16": torch.float16, "bfloat16": torch.bfloat16}[dtype]
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_path, revision=revision, trust_remote_code=True
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            model_path,
            revision=revision,
            dtype=torch_dtype,
            device_map="auto",
            trust_remote_code=True,
        )
        self.model.eval()

    def translate(self, rows: Sequence[dict[str, str]]) -> list[Translation]:
        import torch

        translations = []
        for row in rows:
            target = self.LANGUAGE_NAMES[row["target_lang"]]
            prompt = (
                f"Translate the following text into {target}. Note that you should only output "
                f"the translated result without any additional explanation:\n\n{row['source_text']}"
            )
            messages = [{"role": "user", "content": prompt}]
            inputs = self.tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                return_tensors="pt",
                return_dict=True,
            ).to(self.model.device)
            with torch.inference_mode():
                outputs = self.model.generate(**inputs, max_new_tokens=1024, do_sample=False)
            generated = outputs[0][inputs["input_ids"].shape[-1] :]
            translations.append(
                Translation(
                    text=self.tokenizer.decode(generated, skip_special_tokens=True).strip(),
                    source_tokens=int(inputs["input_ids"].shape[-1]),
                    output_tokens=int(generated.shape[-1]),
                )
            )
        return translations


class GeminiAdapter:
    LANGUAGE_NAMES = {"he": "Hebrew", "ru": "Russian"}

    def __init__(self, model: str, api_key: str, thinking_level: str, max_attempts: int) -> None:
        self.model = model
        self.api_key = api_key
        self.thinking_level = thinking_level
        self.max_attempts = max_attempts

    def translate(self, rows: Sequence[dict[str, str]]) -> list[Translation]:
        translations = []
        for row in rows:
            target = self.LANGUAGE_NAMES[row["target_lang"]]
            prompt = (
                f"Translate the following text into {target}. Return only the translation, "
                f"without commentary or quotation marks.\n\n{row['source_text']}"
            )
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
                f"?key={self.api_key}"
            )
            payload = json.dumps(
                {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "thinkingConfig": {"thinkingLevel": self.thinking_level}
                    },
                }
            ).encode("utf-8")
            request = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            last_error: Exception | None = None
            for attempt in range(self.max_attempts):
                try:
                    with urllib.request.urlopen(request, timeout=120) as response:
                        body = json.load(response)
                    usage = body.get("usageMetadata", {})
                    candidates = body.get("candidates") or []
                    parts = (
                        candidates[0].get("content", {}).get("parts", [])
                        if candidates
                        else []
                    )
                    if not candidates or not parts or "text" not in parts[0]:
                        failure = {
                            "kind": "no_candidate_or_text",
                            "prompt_block_reason": body.get("promptFeedback", {}).get("blockReason"),
                            "finish_reason": candidates[0].get("finishReason") if candidates else None,
                            "safety_ratings": (
                                candidates[0].get("safetyRatings")
                                if candidates
                                else body.get("promptFeedback", {}).get("safetyRatings")
                            ),
                        }
                        translations.append(
                            Translation(
                                text="",
                                source_tokens=int(usage.get("promptTokenCount", 0)),
                                output_tokens=int(usage.get("candidatesTokenCount", 0)),
                                thinking_tokens=int(usage.get("thoughtsTokenCount", 0)),
                                provider_failure=json.dumps(
                                    failure, ensure_ascii=False, separators=(",", ":")
                                ),
                            )
                        )
                        break
                    text = parts[0]["text"].strip()
                    translations.append(
                        Translation(
                            text=text,
                            source_tokens=int(usage.get("promptTokenCount", 0)),
                            output_tokens=int(usage.get("candidatesTokenCount", 0)),
                            thinking_tokens=int(usage.get("thoughtsTokenCount", 0)),
                        )
                    )
                    break
                except urllib.error.HTTPError as error:
                    last_error = error
                    try:
                        error_body = json.loads(error.read().decode("utf-8", errors="replace"))
                        error_detail = normalize_space(error_body.get("error", {}).get("message", ""))
                    except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
                        error_detail = normalize_space(str(error.reason))
                    retry_after = error.headers.get("Retry-After")
                    wait = min(60, 2**attempt)
                    if retry_after:
                        try:
                            wait = max(wait, min(120, int(retry_after)))
                        except ValueError:
                            pass
                    retryable_codes = {408, 429, 500, 502, 503, 504}
                    if error.code not in retryable_codes or attempt == self.max_attempts - 1:
                        raise RuntimeError(
                            f"Gemini HTTP {error.code} after {attempt + 1} attempts"
                            + (f": {error_detail[:300]}" if error_detail else "")
                        ) from error
                    time.sleep(wait)
                except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as error:
                    last_error = error
                    if attempt == self.max_attempts - 1:
                        raise RuntimeError(f"Gemini failed after retries: {error}") from error
                    time.sleep(min(60, 2**attempt))
            if last_error and len(translations) < 1:
                raise RuntimeError(str(last_error))
        return translations


def make_adapter(args: argparse.Namespace) -> Any:
    if args.system == "madlad-400-10b-ct2-int8":
        return Ct2SentencePieceAdapter(
            args.model_dir, args.device, args.compute_type, args.beam_size, "madlad"
        )
    if args.system == "opus-mt-transformer-big-ct2-int8":
        return None  # direction-specific adapters are created by run_system
    if args.system == "nllb-200-distilled-1.3b-ct2-int8":
        return NllbCt2Adapter(args.model_dir, args.device, args.compute_type, args.beam_size)
    if args.system == "hy-mt2-1.8b":
        return HyMtAdapter(args.model_path, args.model_revision, args.dtype)
    if args.system == "gemini-3.6-flash":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is required; it is never written to artifacts")
        return GeminiAdapter(
            args.gemini_model,
            key,
            args.gemini_thinking_level,
            args.cloud_max_attempts,
        )
    raise ValueError(f"Unsupported system: {args.system}")


def validate_resume_rows(
    input_rows: Sequence[dict[str, str]],
    output_rows: Sequence[dict[str, str]],
    system: str,
) -> set[str]:
    input_by_id = {row["id"]: row for row in input_rows}
    if len(input_by_id) != len(input_rows):
        raise ValueError("Input contains duplicate ids")
    completed_ids: set[str] = set()
    for row in output_rows:
        row_id = row.get("id", "")
        if row_id in completed_ids:
            raise ValueError(f"Resume checkpoint contains duplicate id: {row_id}")
        source = input_by_id.get(row_id)
        if source is None:
            raise ValueError(f"Resume checkpoint id is absent from input: {row_id}")
        if row.get("source_sha256") != source.get("source_sha256"):
            raise ValueError(f"Resume source drift for {row_id}")
        if row.get("system") != system:
            raise ValueError(f"Resume system mismatch for {row_id}")
        completed_ids.add(row_id)
    return completed_ids


def run_system(args: argparse.Namespace) -> dict[str, Any]:
    rows = read_tsv(args.input)
    if args.limit:
        rows = rows[: args.limit]
    if args.direction:
        source, target = args.direction.split("-", 1)
        rows = [row for row in rows if row["source_lang"] == source and row["target_lang"] == target]
    if not rows:
        raise ValueError("No rows selected")

    partial_path = args.output.with_suffix(".partial.tsv")
    output_rows: list[dict[str, Any]] = []
    completed_ids: set[str] = set()
    if args.resume and partial_path.exists():
        output_rows = read_tsv(partial_path)
        completed_ids = validate_resume_rows(rows, output_rows, args.system)
        rows = [row for row in rows if row["id"] not in completed_ids]
    selected_rows = len(rows) + len(output_rows)
    adapter = make_adapter(args)
    adapters: dict[str, Any] = {}
    start_wall = time.perf_counter()
    start_cpu = time.process_time()
    sample_gpu = args.system not in {
        "opus-mt-transformer-big-ct2-int8",
        "gemini-3.6-flash",
    } and args.device == "cuda"
    with GpuSampler(sample_gpu) as gpu:
        for offset in range(0, len(rows), args.batch_size):
            batch = rows[offset : offset + args.batch_size]
            active = adapter
            if args.system == "opus-mt-transformer-big-ct2-int8":
                direction = f"{batch[0]['source_lang']}-{batch[0]['target_lang']}"
                if any(f"{row['source_lang']}-{row['target_lang']}" != direction for row in batch):
                    raise ValueError("OPUS batches must contain one direction; use --direction")
                if direction not in adapters:
                    subdir = "heb-sla-ct2-int8" if direction == "he-ru" else "sla-heb-ct2-int8"
                    prefix = "opus-target" if direction == "he-ru" else "none"
                    adapters[direction] = Ct2SentencePieceAdapter(
                        args.model_dir / subdir,
                        args.device,
                        args.compute_type,
                        args.beam_size,
                        prefix,
                    )
                active = adapters[direction]
            batch_start = time.perf_counter()
            translations = active.translate(batch)
            batch_elapsed = time.perf_counter() - batch_start
            per_row_elapsed = batch_elapsed / len(batch)
            for source, translation in zip(batch, translations):
                output_rows.append(
                    {
                        **source,
                        "system": args.system,
                        "hypothesis": translation.text,
                        "source_tokens": translation.source_tokens,
                        "output_tokens": translation.output_tokens,
                        "thinking_tokens": translation.thinking_tokens,
                        "provider_failure": translation.provider_failure,
                        "truncated": str(translation.truncated).lower(),
                        "elapsed_sec": f"{per_row_elapsed:.9f}",
                    }
                )
            # Durable checkpoint: cloud quota/network failures must not discard
            # completed and potentially billed translations.
            write_tsv(partial_path, output_rows, OUTPUT_FIELDS)
            if args.system == "gemini-3.6-flash" and args.cloud_cost_cap_usd is not None:
                cloud_cost = sum(
                    int(row.get("source_tokens") or 0) * 1.5 / 1_000_000
                    + (
                        int(row.get("output_tokens") or 0)
                        + int(row.get("thinking_tokens") or 0)
                    )
                    * 7.5
                    / 1_000_000
                    for row in output_rows
                )
                if cloud_cost > args.cloud_cost_cap_usd:
                    raise RuntimeError(
                        f"Gemini estimated list cost ${cloud_cost:.6f} exceeded "
                        f"cap ${args.cloud_cost_cap_usd:.6f}; checkpoint preserved"
                    )
    elapsed = time.perf_counter() - start_wall
    cpu = time.process_time() - start_cpu
    write_tsv(args.output, output_rows, OUTPUT_FIELDS)
    total_source_tokens = sum(int(row["source_tokens"]) for row in output_rows)
    total_output_tokens = sum(int(row["output_tokens"]) for row in output_rows)
    total_thinking_tokens = sum(int(row.get("thinking_tokens") or 0) for row in output_rows)
    recorded_elapsed = sum(float(row["elapsed_sec"]) for row in output_rows)
    manifest = {
        "schema": "l4-mt-system-run-v2",
        "system": args.system,
        "input": {
            "path": args.input.as_posix(),
            "sha256": sha256_file(args.input),
            "rows": selected_rows,
            "resumed_rows": len(completed_ids),
        },
        "output": {"path": args.output.as_posix(), "sha256": sha256_file(args.output)},
        "configuration": {
            "model_dir": args.model_dir.as_posix() if args.model_dir else None,
            "model_path": args.model_path,
            "model_revision": args.model_revision,
            "device": args.device,
            "compute_type": args.compute_type,
            "dtype": args.dtype,
            "beam_size": args.beam_size,
            "batch_size": args.batch_size,
            "gemini_model": args.gemini_model if args.system.startswith("gemini") else None,
            "gemini_thinking_level": (
                args.gemini_thinking_level if args.system.startswith("gemini") else None
            ),
            "cloud_max_attempts": (
                args.cloud_max_attempts if args.system.startswith("gemini") else None
            ),
        },
        "performance": {
            "current_session_wall_sec": round(elapsed, 6),
            "current_session_cpu_process_sec": round(cpu, 6),
            "recorded_row_elapsed_sec_total": round(recorded_elapsed, 6),
            "segments_per_recorded_sec": round(len(output_rows) / recorded_elapsed, 6),
            "output_tokens_per_recorded_sec": round(total_output_tokens / recorded_elapsed, 6),
            "total_source_tokens": total_source_tokens,
            "total_output_tokens": total_output_tokens,
            "total_thinking_tokens": total_thinking_tokens,
            "truncated_rows": sum(row["truncated"] == "true" for row in output_rows),
            "provider_failure_rows": sum(
                bool(normalize_space(row.get("provider_failure", ""))) for row in output_rows
            ),
            "gpu": gpu.summary(),
        },
        "secrets": "none recorded",
    }
    if args.system == "gemini-3.6-flash":
        manifest["cloud"] = {
            "source_uploaded": True,
            "segments_uploaded": len(rows),
            "pricing_basis_usd_per_million": {"input": 1.5, "output": 7.5},
            "estimated_list_price_usd": round(
                total_source_tokens * 1.5 / 1_000_000
                + (total_output_tokens + total_thinking_tokens) * 7.5 / 1_000_000,
                6,
            ),
            "cost_cap_usd": args.cloud_cost_cap_usd,
            "actual_account_charge": "unknown",
        }
    manifest_path = args.output.with_suffix(".manifest.json")
    write_json(manifest_path, manifest)
    return manifest


def bootstrap_metric_intervals(
    hypotheses: Sequence[str],
    references: Sequence[str],
    chrf: Any,
    bleu: Any,
    samples: int,
    seed: str,
) -> dict[str, Any]:
    if samples <= 0:
        return {"samples": 0, "chrf_plus_plus": None, "spbleu": None}
    rng = random.Random(seed)
    size = len(hypotheses)
    # sacreBLEU's pinned metric implementations expose additive per-segment
    # sufficient statistics. Extract them once so bootstrap resampling does not
    # repeat FLORES tokenization for every replicate. Aggregating a resampled
    # statistics list is mathematically identical to corpus_score on the same
    # resampled sentences (including duplicate draws).
    reference_streams = [list(references)]
    chrf_stats = chrf._extract_corpus_statistics(list(hypotheses), reference_streams)
    bleu_stats = bleu._extract_corpus_statistics(list(hypotheses), reference_streams)
    chrf_scores: list[float] = []
    bleu_scores: list[float] = []
    for _ in range(samples):
        indices = [rng.randrange(size) for _ in range(size)]
        chrf_scores.append(
            chrf._aggregate_and_compute([chrf_stats[index] for index in indices]).score
        )
        bleu_scores.append(
            bleu._aggregate_and_compute([bleu_stats[index] for index in indices]).score
        )

    def interval(values: list[float]) -> dict[str, float]:
        ordered = sorted(values)
        lower = ordered[max(0, int(samples * 0.025) - 1)]
        upper = ordered[min(samples - 1, int(samples * 0.975))]
        return {"low": round(lower, 4), "high": round(upper, 4)}

    return {
        "samples": samples,
        "confidence": 0.95,
        "seed": seed,
        "chrf_plus_plus": interval(chrf_scores),
        "spbleu": interval(bleu_scores),
    }


def score_outputs(
    output_paths: Sequence[Path],
    destination: Path,
    bootstrap_samples: int = 1000,
    bootstrap_seed: str = "l4.0-manifest-v2-bootstrap-2026-08-04",
) -> dict[str, Any]:
    try:
        from sacrebleu.metrics import BLEU, CHRF
    except ImportError as error:
        raise RuntimeError("Install pinned requirements-l4.txt before scoring") from error

    chrf = CHRF(word_order=2)
    bleu = BLEU(tokenize="flores200", effective_order=True)
    report: dict[str, Any] = {
        "schema": "l4-mt-metrics-v2",
        "bootstrap": {"samples": bootstrap_samples, "seed": bootstrap_seed},
        "systems": {},
    }
    for path in output_paths:
        rows = read_tsv(path)
        if not rows:
            raise ValueError(f"Empty output: {path}")
        system = rows[0]["system"]
        groups: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
        for row in rows:
            if normalize_space(row["reference_text"]):
                groups[(row["domain"], f"{row['source_lang']}-{row['target_lang']}")].append(row)
        system_metrics = {
            "artifact": {"path": path.as_posix(), "sha256": sha256_file(path)},
            "groups": {},
        }
        for (domain, direction), group in sorted(groups.items()):
            hypotheses = [row["hypothesis"] for row in group]
            references = [[row["reference_text"] for row in group]]
            system_metrics["groups"][f"{domain}/{direction}"] = {
                "segments": len(group),
                "chrf_plus_plus": round(chrf.corpus_score(hypotheses, references).score, 4),
                "spbleu": round(bleu.corpus_score(hypotheses, references).score, 4),
                "bootstrap_95": bootstrap_metric_intervals(
                    hypotheses,
                    references[0],
                    chrf,
                    bleu,
                    bootstrap_samples,
                    f"{bootstrap_seed}:{system}:{domain}:{direction}",
                ),
                "empty_hypotheses": sum(not normalize_space(value) for value in hypotheses),
                "truncated": sum(row.get("truncated") == "true" for row in group),
            }
        report["systems"][system] = system_metrics
    write_json(destination, report)
    return report


def diagnose_outputs(output_paths: Sequence[Path], destination: Path) -> dict[str, Any]:
    try:
        from sacrebleu.metrics import BLEU, CHRF
    except ImportError as error:
        raise RuntimeError("Install pinned requirements-l4.txt before diagnostics") from error

    chrf = CHRF(word_order=2)
    bleu = BLEU(tokenize="flores200", effective_order=True)
    report: dict[str, Any] = {"schema": "l4-mt-diagnostics-v1", "systems": {}}
    for path in output_paths:
        rows = read_tsv(path)
        if not rows:
            raise ValueError(f"Empty output: {path}")
        system = rows[0]["system"]
        word_counts = sorted(len(normalize_space(row["source_text"]).split()) for row in rows)
        long_threshold = word_counts[max(0, int(len(word_counts) * 0.9) - 1)]
        strata: dict[str, list[dict[str, str]]] = defaultdict(list)
        flags: list[dict[str, str]] = []
        for row in rows:
            source = normalize_space(row["source_text"])
            hypothesis = normalize_space(row["hypothesis"])
            has_niqqud = bool(NIQQUD_RE.search(source))
            punctuation_count = len(PUNCT_RE.findall(source))
            source_words = len(source.split())
            hypothesis_words = re.findall(r"\w+", hypothesis.lower(), flags=re.UNICODE)
            strata[f"niqqud/{'present' if has_niqqud else 'absent'}"].append(row)
            strata[f"punctuation/{'heavy_ge_3' if punctuation_count >= 3 else 'light_lt_3'}"].append(row)
            strata[f"length/{'top_decile' if source_words >= long_threshold else 'lower_90pct'}"].append(row)

            kinds = []
            if not hypothesis:
                kinds.append("empty_hypothesis")
            if source == hypothesis:
                kinds.append("exact_source_echo")
            if row["target_lang"] == "ru" and not CYRILLIC_RE.search(hypothesis):
                kinds.append("target_script_missing")
            if row["target_lang"] == "he" and not HEBREW_RE.search(hypothesis):
                kinds.append("target_script_missing")
            if row.get("truncated") == "true":
                kinds.append("source_truncated")
            if normalize_space(row.get("provider_failure", "")):
                kinds.append("provider_failure")
            if (
                len(hypothesis_words) >= 8
                and len(set(hypothesis_words)) / len(hypothesis_words) <= 0.35
            ):
                kinds.append("degenerate_repetition")
            for kind in kinds:
                flags.append({"id": row["id"], "kind": kind})

        scored_strata = {}
        for name, group in sorted(strata.items()):
            references = [row["reference_text"] for row in group]
            hypotheses = [row["hypothesis"] for row in group]
            if len(group) < 10 or any(not normalize_space(value) for value in references):
                continue
            scored_strata[name] = {
                "segments": len(group),
                "chrf_plus_plus": round(chrf.corpus_score(hypotheses, [references]).score, 4),
                "spbleu": round(bleu.corpus_score(hypotheses, [references]).score, 4),
            }
        source_token_values = sorted(int(row.get("source_tokens") or 0) for row in rows)
        output_token_values = sorted(int(row.get("output_tokens") or 0) for row in rows)
        report["systems"][system] = {
            "artifact": {"path": path.as_posix(), "sha256": sha256_file(path)},
            "rows": len(rows),
            "natural_strata": scored_strata,
            "long_source_word_threshold": long_threshold,
            "source_tokens": {
                "maximum": max(source_token_values),
                "p95": source_token_values[min(len(source_token_values) - 1, int(len(source_token_values) * 0.95))],
            },
            "output_tokens": {
                "maximum": max(output_token_values),
                "p95": output_token_values[min(len(output_token_values) - 1, int(len(output_token_values) * 0.95))],
            },
            "critical_flags": flags,
        }
    write_json(destination, report)
    return report


def intervals_overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    return float(first["low"]) <= float(second["high"]) and float(second["low"]) <= float(first["high"])


def evaluate_adaptive_gates(
    metrics_path: Path,
    destination: Path,
    local_systems: Sequence[str],
    cloud_system: str,
    cometkiwi_path: Path | None = None,
    diagnostics_paths: Sequence[Path] | None = None,
) -> dict[str, Any]:
    """Evaluate Manifest-v2 expansion triggers from reproducible metric reports.

    The primary comparison is the macro-average across the two FLORES
    directions.  Direction-level deltas and confidence intervals are retained
    and are deliberately conservative: one close direction or one overlapping
    interval is enough to trigger Stage B.
    """
    with metrics_path.open("r", encoding="utf-8") as stream:
        metrics = json.load(stream)
    systems = metrics.get("systems", {})
    missing = [system for system in local_systems if system not in systems]
    if missing:
        raise ValueError(f"Metrics report lacks local systems: {', '.join(missing)}")

    common_groups: set[str] | None = None
    for system in local_systems:
        groups = set(systems[system].get("groups", {}))
        common_groups = groups if common_groups is None else common_groups & groups
    flores_groups = sorted(group for group in (common_groups or set()) if group.startswith("flores"))
    if not flores_groups:
        raise ValueError("No common FLORES metric groups across local systems")

    macro: dict[str, dict[str, float]] = {}
    for system in local_systems:
        macro[system] = {
            metric: statistics.fmean(
                float(systems[system]["groups"][group][metric]) for group in flores_groups
            )
            for metric in ("chrf_plus_plus", "spbleu")
        }
    chrf_ranking = sorted(local_systems, key=lambda system: (-macro[system]["chrf_plus_plus"], system))
    bleu_ranking = sorted(local_systems, key=lambda system: (-macro[system]["spbleu"], system))
    if len(chrf_ranking) < 2:
        raise ValueError("Adaptive gate requires at least two local systems")
    top, runner_up = chrf_ranking[:2]

    macro_delta = macro[top]["chrf_plus_plus"] - macro[runner_up]["chrf_plus_plus"]
    direction_deltas = {
        group: float(systems[top]["groups"][group]["chrf_plus_plus"])
        - float(systems[runner_up]["groups"][group]["chrf_plus_plus"])
        for group in flores_groups
    }
    close_delta = macro_delta < 2.0 or any(delta < 2.0 for delta in direction_deltas.values())

    overlap_groups = []
    for group in flores_groups:
        top_interval = systems[top]["groups"][group]["bootstrap_95"]["chrf_plus_plus"]
        runner_interval = systems[runner_up]["groups"][group]["bootstrap_95"]["chrf_plus_plus"]
        if intervals_overlap(top_interval, runner_interval):
            overlap_groups.append(group)

    metric_conflicts: list[str] = []
    if chrf_ranking != bleu_ranking:
        metric_conflicts.append("local macro chrF++ and spBLEU rankings differ")
    comet_ranking: list[str] | None = None
    if cometkiwi_path is not None:
        with cometkiwi_path.open("r", encoding="utf-8") as stream:
            comet = json.load(stream)
        comet_systems = comet.get("systems", {})
        missing_comet = [system for system in local_systems if system not in comet_systems]
        if missing_comet:
            raise ValueError(f"CometKiwi report lacks local systems: {', '.join(missing_comet)}")
        comet_ranking = sorted(
            local_systems,
            key=lambda system: (-float(comet_systems[system]["mean"]), system),
        )
        if comet_ranking != chrf_ranking:
            metric_conflicts.append("local macro chrF++ and CometKiwi rankings differ")

    critical_flags = []
    for system in list(local_systems) + ([cloud_system] if cloud_system in systems else []):
        for group, values in systems[system].get("groups", {}).items():
            if int(values.get("empty_hypotheses", 0)):
                critical_flags.append(
                    {"system": system, "group": group, "kind": "empty_hypothesis", "count": int(values["empty_hypotheses"])}
                )
            if int(values.get("truncated", 0)):
                critical_flags.append(
                    {"system": system, "group": group, "kind": "truncated", "count": int(values["truncated"])}
                )
    for diagnostics_path in diagnostics_paths or []:
        with diagnostics_path.open("r", encoding="utf-8") as stream:
            diagnostics = json.load(stream)
        for system, values in diagnostics.get("systems", {}).items():
            for flag in values.get("critical_flags", []):
                critical_flags.append(
                    {"system": system, "diagnostics": diagnostics_path.as_posix(), **flag}
                )

    triggers = {
        "top_local_delta_chrf_below_2": close_delta,
        "bootstrap_95_overlap": bool(overlap_groups),
        "metric_rankings_conflict": bool(metric_conflicts),
        "critical_failure_flags": bool(critical_flags),
    }
    expand = any(triggers.values())
    report = {
        "schema": "l4-mt-manifest-v2-adaptive-gate-v1",
        "metrics": {"path": metrics_path.as_posix(), "sha256": sha256_file(metrics_path)},
        "cometkiwi": None
        if cometkiwi_path is None
        else {"path": cometkiwi_path.as_posix(), "sha256": sha256_file(cometkiwi_path)},
        "diagnostics": [
            {"path": path.as_posix(), "sha256": sha256_file(path)}
            for path in diagnostics_paths or []
        ],
        "flores_groups": flores_groups,
        "local_macro_scores": {
            system: {metric: round(value, 6) for metric, value in values.items()}
            for system, values in macro.items()
        },
        "rankings": {
            "chrf_plus_plus": chrf_ranking,
            "spbleu": bleu_ranking,
            "cometkiwi": comet_ranking,
        },
        "top_two_local_by_chrf": [top, runner_up],
        "chrf_delta": {
            "macro": round(macro_delta, 6),
            "by_group": {group: round(delta, 6) for group, delta in direction_deltas.items()},
            "threshold": 2.0,
            "rule": "trigger if macro or either direction is below threshold",
        },
        "bootstrap_overlap_groups": overlap_groups,
        "metric_conflicts": metric_conflicts,
        "critical_flags": critical_flags,
        "triggers": triggers,
        "expand_to_full_devtest": expand,
        "stage_b_systems": [cloud_system, top, runner_up] if expand else [],
    }
    write_json(destination, report)
    return report


def attach_references(gold_paths: Sequence[Path], output_paths: Sequence[Path], destination: Path) -> dict[str, Any]:
    references: dict[str, dict[str, str]] = {}
    for gold_path in gold_paths:
        for row in read_tsv(gold_path):
            if row["id"] in references:
                raise ValueError(f"Duplicate gold id across inputs: {row['id']}")
            if not normalize_space(row["reference_text"]):
                raise ValueError(f"Missing reference for {row['id']} in {gold_path}")
            references[row["id"]] = row

    destination.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for output_path in output_paths:
        rows = read_tsv(output_path)
        for row in rows:
            gold = references.get(row["id"])
            if gold is None:
                raise ValueError(f"No gold row for output id {row['id']}")
            if row["source_sha256"] != gold["source_sha256"]:
                raise ValueError(f"Source drift for {row['id']}")
            row["reference_text"] = gold["reference_text"]
        target = destination / output_path.name
        write_tsv(target, rows, OUTPUT_FIELDS)
        artifacts.append(
            {
                "source": output_path.as_posix(),
                "output": target.as_posix(),
                "sha256": sha256_file(target),
                "rows": len(rows),
            }
        )
    return {"schema": "l4-mt-reference-attachment-v1", "artifacts": artifacts}


def score_cometkiwi(
    checkpoint: Path,
    output_paths: Sequence[Path],
    destination: Path,
    batch_size: int,
) -> dict[str, Any]:
    try:
        from comet import load_from_checkpoint
    except ImportError as error:
        raise RuntimeError("Install requirements-l4-comet.txt in an isolated overlay") from error

    model = load_from_checkpoint(str(checkpoint))
    report: dict[str, Any] = {
        "schema": "l4-mt-cometkiwi-v1",
        "checkpoint": {"path": checkpoint.as_posix(), "sha256": sha256_file(checkpoint)},
        "role": "supplementary signal only; not a winner oracle",
        "systems": {},
    }
    for output_path in output_paths:
        rows = read_tsv(output_path)
        system = rows[0]["system"]
        data = [{"src": row["source_text"], "mt": row["hypothesis"]} for row in rows]
        prediction = model.predict(data, batch_size=batch_size, gpus=1)
        raw_scores = prediction.scores
        if hasattr(raw_scores, "tolist"):
            raw_scores = raw_scores.tolist()
        scores = [float(value) for value in raw_scores]
        grouped: dict[str, list[float]] = defaultdict(list)
        for row, value in zip(rows, scores):
            grouped[f"{row['domain']}/{row['subdomain']}"].append(value)
        report["systems"][system] = {
            "artifact": {"path": output_path.as_posix(), "sha256": sha256_file(output_path)},
            "rows": len(rows),
            "mean": round(statistics.fmean(scores), 6),
            "median": round(statistics.median(scores), 6),
            "minimum": round(min(scores), 6),
            "maximum": round(max(scores), 6),
            "groups": {
                key: {
                    "rows": len(values),
                    "mean": round(statistics.fmean(values), 6),
                    "median": round(statistics.median(values), 6),
                }
                for key, values in sorted(grouped.items())
            },
        }
        # Durable system-level checkpoint: a late GPU/runtime failure must not
        # discard earlier supplementary scores.
        write_json(destination, report)
    write_json(destination, report)
    return report


def select_blind_ids(rows: Sequence[dict[str, str]], per_stratum: int, seed: int) -> list[str]:
    strata: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if row["domain"].startswith("flores"):
            stratum = f"flores/{row['source_lang']}-{row['target_lang']}"
        else:
            stratum = "in-domain/he-ru"
        strata[stratum].append(row["id"])
    rng = random.Random(seed)
    selected = []
    for stratum in sorted(strata):
        values = sorted(set(strata[stratum]))
        rng.shuffle(values)
        selected.extend(values[: min(per_stratum, len(values))])
    return selected


def make_blind_packet(
    output_paths: Sequence[Path],
    packet: Path,
    key_path: Path,
    per_stratum: int,
    seed: int,
) -> dict[str, Any]:
    systems: dict[str, dict[str, dict[str, str]]] = {}
    canonical_rows: list[dict[str, str]] | None = None
    for path in output_paths:
        rows = read_tsv(path)
        if not rows:
            raise ValueError(f"Empty output: {path}")
        system = rows[0]["system"]
        systems[system] = {row["id"]: row for row in rows}
        canonical_rows = canonical_rows or rows
    assert canonical_rows is not None
    selected = select_blind_ids(canonical_rows, per_stratum, seed)
    if len(selected) < 40:
        raise ValueError(f"Blind sample has {len(selected)} sources; at least 40 required")
    rng = random.Random(seed)
    packet_rows: list[dict[str, Any]] = []
    key: dict[str, Any] = {
        "schema": "l4-mt-blind-key-v1",
        "seed": seed,
        "selected_source_ids": selected,
        "items": {},
    }
    counter = 0
    for source_id in selected:
        candidates = []
        for system, by_id in systems.items():
            if source_id not in by_id:
                raise ValueError(f"{system} lacks selected id {source_id}")
            candidates.append((system, by_id[source_id]))
        rng.shuffle(candidates)
        for system, row in candidates:
            counter += 1
            blind_id = f"B{counter:04d}"
            packet_rows.append(
                {
                    "blind_item_id": blind_id,
                    "source_id": source_id,
                    "domain": row["domain"],
                    "source_lang": row["source_lang"],
                    "target_lang": row["target_lang"],
                    "source_text": row["source_text"],
                    "reference_text": row["reference_text"],
                    "candidate_text": row["hypothesis"],
                    "meaning_adequacy_1_5": "",
                    "missing_meaning_yes_no": "",
                    "added_meaning_yes_no": "",
                    "pedagogical_suitability_1_5": "",
                    "notes": "",
                }
            )
            key["items"][blind_id] = {"system": system, "source_id": source_id}
    write_tsv(packet, packet_rows, BLIND_FIELDS)
    write_json(key_path, key)
    return {
        "sources": len(selected),
        "systems": len(systems),
        "rating_rows": len(packet_rows),
        "packet_sha256": sha256_file(packet),
        "key_sha256": sha256_file(key_path),
    }


def validate_blind(packet: Path) -> dict[str, Any]:
    rows = read_tsv(packet)
    errors = []
    for line, row in enumerate(rows, start=2):
        for field in ("meaning_adequacy_1_5", "pedagogical_suitability_1_5"):
            try:
                value = int(row.get(field, ""))
                if value not in range(1, 6):
                    raise ValueError
            except ValueError:
                errors.append(f"line {line}: {field} must be integer 1..5")
        for field in ("missing_meaning_yes_no", "added_meaning_yes_no"):
            if row.get(field, "").strip().lower() not in {"yes", "no"}:
                errors.append(f"line {line}: {field} must be yes/no")
    source_count = len({row.get("source_id") for row in rows})
    if source_count < 40:
        errors.append(f"only {source_count} unique sources; need >=40")
    return {"ok": not errors, "rows": len(rows), "sources": source_count, "errors": errors}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare-in-domain")
    prepare.add_argument("--asr-manifest", type=Path, required=True)
    prepare.add_argument("--canon-zip", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    prepare.add_argument("--manifest", type=Path, required=True)
    prepare.add_argument("--asr-limit", type=int, default=50)
    prepare.add_argument("--literary-limit", type=int, default=150)

    validate = subparsers.add_parser("validate-gold")
    validate.add_argument("--input", type=Path, required=True)
    validate.add_argument("--require-references", action="store_true")

    flores = subparsers.add_parser("fetch-flores")
    flores.add_argument("--revision", required=True)
    flores.add_argument("--output-dir", type=Path, required=True)
    flores.add_argument("--combined-output", type=Path, required=True)
    flores.add_argument("--manifest", type=Path, required=True)

    stage_a = subparsers.add_parser("sample-flores-stage-a")
    stage_a.add_argument("--input", type=Path, required=True)
    stage_a.add_argument("--output", type=Path, required=True)
    stage_a.add_argument("--manifest", type=Path, required=True)
    stage_a.add_argument("--shared-ids", type=int, default=506)
    stage_a.add_argument("--seed", default="l4.0-manifest-v2-stage-a-2026-08-04")

    comet_fetch = subparsers.add_parser("fetch-cometkiwi")
    comet_fetch.add_argument("--repo-id", default="Unbabel/wmt22-cometkiwi-da")
    comet_fetch.add_argument(
        "--revision", default="1ad785194e391eebc6c53e2d0776cada8f83179a"
    )
    comet_fetch.add_argument("--output-dir", type=Path, required=True)
    comet_fetch.add_argument("--manifest", type=Path, required=True)

    run = subparsers.add_parser("run")
    run.add_argument("--system", required=True, choices=[
        "madlad-400-10b-ct2-int8",
        "opus-mt-transformer-big-ct2-int8",
        "nllb-200-distilled-1.3b-ct2-int8",
        "hy-mt2-1.8b",
        "gemini-3.6-flash",
    ])
    run.add_argument("--input", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--model-dir", type=Path)
    run.add_argument("--model-path", default="tencent/Hy-MT2-1.8B")
    run.add_argument(
        "--model-revision",
        default="9a341cd1b679d3efd23b46e847b01745a71ed792",
    )
    run.add_argument("--device", default="cuda")
    run.add_argument("--compute-type", default="int8_float16")
    run.add_argument("--dtype", choices=["float16", "bfloat16"], default="float16")
    run.add_argument("--beam-size", type=int, default=4)
    run.add_argument("--batch-size", type=int, default=8)
    run.add_argument("--gemini-model", default="gemini-3.6-flash")
    run.add_argument(
        "--gemini-thinking-level",
        choices=["minimal", "low", "medium", "high"],
        default="medium",
    )
    run.add_argument("--cloud-cost-cap-usd", type=float)
    run.add_argument("--cloud-max-attempts", type=int, choices=range(1, 11), default=10)
    run.add_argument("--direction", choices=["he-ru", "ru-he"])
    run.add_argument("--limit", type=int)
    run.add_argument("--resume", action="store_true")

    score = subparsers.add_parser("score")
    score.add_argument("--outputs", type=Path, nargs="+", required=True)
    score.add_argument("--destination", type=Path, required=True)
    score.add_argument("--bootstrap-samples", type=int, default=1000)
    score.add_argument(
        "--bootstrap-seed", default="l4.0-manifest-v2-bootstrap-2026-08-04"
    )

    diagnostics = subparsers.add_parser("diagnose")
    diagnostics.add_argument("--outputs", type=Path, nargs="+", required=True)
    diagnostics.add_argument("--destination", type=Path, required=True)

    adaptive = subparsers.add_parser("evaluate-adaptive-gates")
    adaptive.add_argument("--metrics", type=Path, required=True)
    adaptive.add_argument("--destination", type=Path, required=True)
    adaptive.add_argument("--local-systems", nargs="+", required=True)
    adaptive.add_argument("--cloud-system", default="gemini-3.6-flash")
    adaptive.add_argument("--cometkiwi", type=Path)
    adaptive.add_argument("--diagnostics", type=Path, nargs="+")

    attach = subparsers.add_parser("attach-references")
    attach.add_argument("--gold", type=Path, nargs="+", required=True)
    attach.add_argument("--outputs", type=Path, nargs="+", required=True)
    attach.add_argument("--destination", type=Path, required=True)

    comet_score = subparsers.add_parser("score-cometkiwi")
    comet_score.add_argument("--checkpoint", type=Path, required=True)
    comet_score.add_argument("--outputs", type=Path, nargs="+", required=True)
    comet_score.add_argument("--destination", type=Path, required=True)
    comet_score.add_argument("--batch-size", type=int, default=8)

    blind = subparsers.add_parser("blind-packet")
    blind.add_argument("--outputs", type=Path, nargs="+", required=True)
    blind.add_argument("--packet", type=Path, required=True)
    blind.add_argument("--key", type=Path, required=True)
    blind.add_argument("--per-stratum", type=int, default=20)
    blind.add_argument("--seed", type=int, default=4072026)

    validate_packet = subparsers.add_parser("validate-blind")
    validate_packet.add_argument("--packet", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "prepare-in-domain":
            payload = prepare_in_domain(
                args.asr_manifest,
                args.canon_zip,
                args.output,
                args.asr_limit,
                args.literary_limit,
            )
            write_json(args.manifest, payload)
        elif args.command == "validate-gold":
            payload = validate_gold(args.input, args.require_references)
            if not payload["ok"]:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
                return 2
        elif args.command == "fetch-flores":
            payload = fetch_flores(args.revision, args.output_dir, args.combined_output)
            write_json(args.manifest, payload)
        elif args.command == "sample-flores-stage-a":
            payload = sample_flores_stage_a(
                args.input, args.output, args.shared_ids, args.seed
            )
            write_json(args.manifest, payload)
        elif args.command == "fetch-cometkiwi":
            payload = fetch_cometkiwi(args.repo_id, args.revision, args.output_dir)
            write_json(args.manifest, payload)
        elif args.command == "run":
            payload = run_system(args)
        elif args.command == "score":
            payload = score_outputs(
                args.outputs,
                args.destination,
                args.bootstrap_samples,
                args.bootstrap_seed,
            )
        elif args.command == "diagnose":
            payload = diagnose_outputs(args.outputs, args.destination)
        elif args.command == "evaluate-adaptive-gates":
            payload = evaluate_adaptive_gates(
                args.metrics,
                args.destination,
                args.local_systems,
                args.cloud_system,
                args.cometkiwi,
                args.diagnostics,
            )
        elif args.command == "attach-references":
            payload = attach_references(args.gold, args.outputs, args.destination)
        elif args.command == "score-cometkiwi":
            payload = score_cometkiwi(
                args.checkpoint, args.outputs, args.destination, args.batch_size
            )
        elif args.command == "blind-packet":
            payload = make_blind_packet(
                args.outputs, args.packet, args.key, args.per_stratum, args.seed
            )
        elif args.command == "validate-blind":
            payload = validate_blind(args.packet)
            if not payload["ok"]:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
                return 2
        else:
            raise AssertionError(args.command)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
