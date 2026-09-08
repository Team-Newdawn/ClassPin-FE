from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import subprocess
import tempfile
from collections import Counter, defaultdict
from io import StringIO
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageOps


RULE_VERSION = "pii-redaction.v2"
PRIVACY_PASSES = (
    {"name": "color-native", "scale": 1, "psm": 11},
    {"name": "grayscale-2x", "scale": 2, "psm": 11},
)

# Ordered from the most structurally specific secrets to broader personal data.
PATTERN_SPECS = (
    (
        "jwt",
        r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{6,}\s*\.\s*"
        r"eyJ[A-Za-z0-9_-]{6,}\s*\.\s*[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])",
        0,
    ),
    (
        "github_token",
        r"(?<![A-Za-z0-9_])(?:gh[pousr]\s*_\s*[A-Za-z0-9]{20,}|"
        r"github\s*_\s*pat\s*_\s*[A-Za-z0-9_]{20,})(?![A-Za-z0-9_])",
        re.IGNORECASE,
    ),
    (
        "openai_api_key",
        r"(?<![A-Za-z0-9])sk\s*-\s*(?:proj\s*-\s*)?[A-Za-z0-9_-]{16,}"
        r"(?![A-Za-z0-9_-])",
        re.IGNORECASE,
    ),
    (
        "google_api_key",
        r"(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])",
        0,
    ),
    (
        "aws_access_key",
        r"(?<![A-Z0-9])AKIA[A-Z0-9]{16}(?![A-Z0-9])",
        0,
    ),
    (
        "uuid",
        r"(?<![0-9A-Fa-f])[0-9A-Fa-f]{8}(?:\s*-\s*[0-9A-Fa-f]{4}){3}"
        r"\s*-\s*[0-9A-Fa-f]{12}(?![0-9A-Fa-f])",
        0,
    ),
    (
        "email",
        r"(?<![\w.+-])[\w.+-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+(?![\w.-])",
        re.IGNORECASE,
    ),
    (
        "phone_kr",
        r"(?<!\d)(?:(?:\+?82)\s*[-.]?\s*)?0?1[016789]\s*[-.]?\s*"
        r"\d{3,4}\s*[-.]?\s*\d{4}(?!\d)",
        0,
    ),
)
PII_PATTERNS = tuple((kind, re.compile(pattern, flags)) for kind, pattern, flags in PATTERN_SPECS)


def rule_fingerprint() -> str:
    serialized = json.dumps(
        {"patterns": PATTERN_SPECS, "privacyPasses": PRIVACY_PASSES},
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def parse_tesseract_tsv(raw_tsv: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(StringIO(raw_tsv), delimiter="\t")
    required = {
        "level",
        "page_num",
        "block_num",
        "par_num",
        "line_num",
        "word_num",
        "left",
        "top",
        "width",
        "height",
        "conf",
        "text",
    }
    if reader.fieldnames is None or not required.issubset(reader.fieldnames):
        raise ValueError("Tesseract TSV is missing required columns.")

    words: list[dict[str, Any]] = []
    for row_index, row in enumerate(reader):
        text = str(row.get("text") or "").strip()
        if row.get("level") != "5" or not text:
            continue
        try:
            left = int(row["left"])
            top = int(row["top"])
            width = int(row["width"])
            height = int(row["height"])
            confidence = float(row["conf"])
            line_key = (
                int(row["page_num"]),
                int(row["block_num"]),
                int(row["par_num"]),
                int(row["line_num"]),
            )
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid Tesseract TSV row {row_index + 2}.") from error
        if width <= 0 or height <= 0:
            continue
        words.append(
            {
                "index": row_index,
                "text": text,
                "bboxPx": (left, top, left + width, top + height),
                "confidence": confidence,
                "lineKey": line_key,
            }
        )
    return words


def find_sensitive_spans(text: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for priority, (kind, pattern) in enumerate(PII_PATTERNS):
        for match in pattern.finditer(text):
            candidates.append(
                {
                    "type": kind,
                    "start": match.start(),
                    "end": match.end(),
                    "priority": priority,
                }
            )

    selected: list[dict[str, Any]] = []
    for candidate in sorted(
        candidates,
        key=lambda item: (item["start"], item["priority"], -(item["end"] - item["start"])),
    ):
        if any(
            candidate["start"] < existing["end"] and existing["start"] < candidate["end"]
            for existing in selected
        ):
            continue
        selected.append(candidate)
    return sorted(selected, key=lambda item: (item["start"], item["end"], item["type"]))


def redact_text(text: str) -> tuple[str, Counter[str]]:
    spans = find_sensitive_spans(text)
    counts: Counter[str] = Counter(span["type"] for span in spans)
    redacted = text
    for span in reversed(spans):
        placeholder = f"[REDACTED:{span['type']}]"
        redacted = redacted[: span["start"]] + placeholder + redacted[span["end"] :]
    return redacted, counts


def _line_text_and_offsets(words: list[dict[str, Any]]) -> tuple[str, list[tuple[int, int]]]:
    pieces: list[str] = []
    offsets: list[tuple[int, int]] = []
    cursor = 0
    for word in words:
        if pieces:
            pieces.append(" ")
            cursor += 1
        start = cursor
        pieces.append(word["text"])
        cursor += len(word["text"])
        offsets.append((start, cursor))
    return "".join(pieces), offsets


def _union_bbox(words: Iterable[dict[str, Any]], padding: int = 3) -> tuple[int, int, int, int]:
    selected = list(words)
    return (
        min(word["bboxPx"][0] for word in selected) - padding,
        min(word["bboxPx"][1] for word in selected) - padding,
        max(word["bboxPx"][2] for word in selected) + padding,
        max(word["bboxPx"][3] for word in selected) + padding,
    )


def _normalize_pixel_bbox(
    bbox: tuple[int, int, int, int], image_width: int, image_height: int
) -> dict[str, float]:
    if image_width <= 0 or image_height <= 0:
        raise ValueError("Image dimensions must be positive.")
    x1, y1, x2, y2 = bbox
    return {
        "x1": round(max(0, min(image_width, x1)) / image_width, 6),
        "y1": round(max(0, min(image_height, y1)) / image_height, 6),
        "x2": round(max(0, min(image_width, x2)) / image_width, 6),
        "y2": round(max(0, min(image_height, y2)) / image_height, 6),
    }


def build_image_redactions(
    words: Iterable[dict[str, Any]], image_width: int, image_height: int
) -> list[dict[str, Any]]:
    by_line: dict[tuple[int, int, int, int], list[dict[str, Any]]] = defaultdict(list)
    for word in words:
        by_line[word["lineKey"]].append(word)

    redactions: list[dict[str, Any]] = []
    for line_key in sorted(by_line):
        line_words = sorted(by_line[line_key], key=lambda word: (word["bboxPx"][0], word["index"]))
        line_text, offsets = _line_text_and_offsets(line_words)
        for span in find_sensitive_spans(line_text):
            matched_words = [
                word
                for word, (start, end) in zip(line_words, offsets)
                if span["start"] < end and start < span["end"]
            ]
            if not matched_words:
                continue
            bbox_px = _union_bbox(matched_words)
            redactions.append(
                {
                    "type": span["type"],
                    "bboxPx": bbox_px,
                    "bboxNorm": _normalize_pixel_bbox(bbox_px, image_width, image_height),
                    "source": "tesseract-ocr",
                }
            )
    return sorted(
        redactions,
        key=lambda item: (
            item["bboxNorm"]["y1"],
            item["bboxNorm"]["x1"],
            item["type"],
        ),
    )


def _bbox_overlap_over_smaller(left: dict[str, float], right: dict[str, float]) -> float:
    width = max(0.0, min(left["x2"], right["x2"]) - max(left["x1"], right["x1"]))
    height = max(0.0, min(left["y2"], right["y2"]) - max(left["y1"], right["y1"]))
    intersection = width * height
    left_area = (left["x2"] - left["x1"]) * (left["y2"] - left["y1"])
    right_area = (right["x2"] - right["x1"]) * (right["y2"] - right["y1"])
    smaller = min(left_area, right_area)
    return intersection / smaller if smaller > 0 else 0.0


def merge_image_redactions(
    *groups: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    candidates = sorted(
        (item for group in groups for item in group),
        key=lambda item: (
            item["bboxNorm"]["y1"],
            item["bboxNorm"]["x1"],
            item["type"],
            item["source"],
        ),
    )
    for candidate in candidates:
        duplicate = any(
            existing["type"] == candidate["type"]
            and _bbox_overlap_over_smaller(existing["bboxNorm"], candidate["bboxNorm"]) >= 0.60
            for existing in merged
        )
        if not duplicate:
            merged.append(candidate)
    return merged


def detect_grayscale_sensitive_image_redactions(
    source: Path,
    executable: str,
    languages: str,
    tessdata_dir: Path | None,
    scale: int = 2,
) -> list[dict[str, Any]]:
    if scale < 1:
        raise ValueError("Privacy OCR scale must be at least 1.")
    with Image.open(source) as opened:
        original_width, original_height = opened.size
        grayscale = ImageOps.grayscale(opened)
        scaled = grayscale.resize(
            (original_width * scale, original_height * scale),
            Image.Resampling.LANCZOS,
        )

    temporary = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    temporary_path = Path(temporary.name)
    temporary.close()
    try:
        scaled.save(temporary_path)
        raw_tsv = run_tesseract_tsv(executable, temporary_path, languages, tessdata_dir)
        words = parse_tesseract_tsv(raw_tsv)
        detected = build_image_redactions(words, scaled.width, scaled.height)
    finally:
        temporary_path.unlink(missing_ok=True)

    redactions: list[dict[str, Any]] = []
    for item in detected:
        bbox = item["bboxNorm"]
        redactions.append(
            {
                "type": item["type"],
                "bboxPx": (
                    max(0, math.floor(bbox["x1"] * original_width)),
                    max(0, math.floor(bbox["y1"] * original_height)),
                    min(original_width, math.ceil(bbox["x2"] * original_width)),
                    min(original_height, math.ceil(bbox["y2"] * original_height)),
                ),
                "bboxNorm": bbox,
                "source": f"tesseract-ocr-grayscale-{scale}x",
            }
        )
    return redactions


def mask_image(source: Path, target: Path, redactions: Iterable[dict[str, Any]]) -> None:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    draw = ImageDraw.Draw(image)
    for redaction in redactions:
        x1, y1, x2, y2 = redaction["bboxPx"]
        draw.rectangle(
            (
                max(0, x1),
                max(0, y1),
                min(image.width, x2),
                min(image.height, y2),
            ),
            fill="black",
        )
    image.save(target, quality=92)


def run_tesseract_tsv(
    executable: str,
    image_path: Path,
    languages: str,
    tessdata_dir: Path | None = None,
) -> str:
    command = [executable, str(image_path), "stdout"]
    if tessdata_dir is not None:
        command.extend(["--tessdata-dir", str(tessdata_dir)])
    command.extend(["-l", languages, "--psm", "11", "tsv"])
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        timeout=180,
    )
    return completed.stdout.decode("utf-8", errors="replace")


def tesseract_version(executable: str) -> str:
    completed = subprocess.run(
        [executable, "--version"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    first_line = completed.stdout.decode("utf-8", errors="replace").splitlines()
    if not first_line:
        raise RuntimeError("Tesseract did not report a version.")
    return first_line[0].strip()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def engine_fingerprint(executable: str, languages: str, tessdata_dir: Path | None) -> str:
    language_models: dict[str, str] = {}
    for language in languages.split("+"):
        model = tessdata_dir / f"{language}.traineddata" if tessdata_dir is not None else None
        language_models[language] = _sha256_file(model) if model is not None and model.is_file() else "system"
    payload = {
        "engine": tesseract_version(executable),
        "languageModels": language_models,
    }
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def redact_page_image(
    source: Path,
    target: Path,
    executable: str,
    languages: str,
    tessdata_dir: Path | None,
) -> list[dict[str, Any]]:
    raw_tsv = run_tesseract_tsv(executable, source, languages, tessdata_dir)
    words = parse_tesseract_tsv(raw_tsv)
    with Image.open(source) as image:
        image_width, image_height = image.size
    primary_redactions = build_image_redactions(words, image_width, image_height)
    privacy_redactions = detect_grayscale_sensitive_image_redactions(
        source,
        executable,
        languages,
        tessdata_dir,
    )
    redactions = merge_image_redactions(primary_redactions, privacy_redactions)
    mask_image(source, target, redactions)
    return redactions


def redact_regions(regions: list[dict[str, Any]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for region in regions:
        redacted, found = redact_text(str(region.get("text") or ""))
        counts.update(found)
        region["text"] = redacted
        region["textRedacted"] = redacted
        region["summary"] = redacted[:240]
    return counts


def redaction_state(enabled: bool, expected_pages: int, successful_pages: int) -> dict[str, Any]:
    applied = enabled and expected_pages > 0 and successful_pages == expected_pages
    return {
        "redactionStatus": "applied" if applied else ("failed" if enabled else "not-applied"),
        "safeForExternalAi": applied,
    }
