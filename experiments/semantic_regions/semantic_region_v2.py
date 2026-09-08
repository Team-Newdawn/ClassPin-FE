from __future__ import annotations

import math
from typing import Any, Iterable

try:
    from experiments.semantic_regions.extract_regions import REGION_TYPES
    from experiments.semantic_regions.ocr_redaction import find_sensitive_spans
except ModuleNotFoundError:
    from extract_regions import REGION_TYPES  # type: ignore[no-redef]
    from ocr_redaction import find_sensitive_spans  # type: ignore[no-redef]


PROPOSAL_SCHEMA_VERSION = "semantic-region-proposal.v2"
ARTIFACT_SCHEMA_VERSION = "slide-artifact.v2"
PIPELINE_VERSION = "multimodal-semantic-region.v2"
PROMPT_VERSION = "semantic-region-proposal.v1"
MIN_REGIONS = 3
MAX_REGIONS = 12

_PROPOSAL_KEYS = {
    "schemaVersion",
    "promptVersion",
    "slideAlias",
    "slideSummary",
    "keyConcepts",
    "regions",
}
_REGION_KEYS = {
    "type",
    "bboxNorm",
    "polygonNorm",
    "readingOrder",
    "textRedacted",
    "summary",
    "concepts",
    "importance",
    "confidence",
}
_BBOX_KEYS = {"x1", "y1", "x2", "y2"}
_IMPORTANCE = {"low", "medium", "high"}


class ProposalValidationError(ValueError):
    """Raised when an untrusted multimodal proposal violates the v2 contract."""


def _require_object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProposalValidationError(f"{path} must be an object.")
    return value


def _require_exact_keys(value: dict[str, Any], expected: set[str], path: str) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing:
        raise ProposalValidationError(f"{path} is missing fields: {', '.join(missing)}")
    if unknown:
        raise ProposalValidationError(f"{path} has unknown fields: {', '.join(unknown)}")


def _require_string(value: Any, path: str, *, min_length: int = 1, max_length: int) -> str:
    if not isinstance(value, str):
        raise ProposalValidationError(f"{path} must be a string.")
    if not min_length <= len(value) <= max_length:
        raise ProposalValidationError(
            f"{path} length must be between {min_length} and {max_length}."
        )
    if find_sensitive_spans(value):
        raise ProposalValidationError(f"{path} contains unredacted sensitive text.")
    return value


def _require_number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProposalValidationError(f"{path} must be a number.")
    number = float(value)
    if not math.isfinite(number) or not 0.0 <= number <= 1.0:
        raise ProposalValidationError(f"{path} must be a finite number between 0 and 1.")
    return number


def _validate_string_list(
    value: Any,
    path: str,
    *,
    max_items: int,
    max_length: int,
) -> list[str]:
    if not isinstance(value, list) or len(value) > max_items:
        raise ProposalValidationError(f"{path} must be an array with at most {max_items} items.")
    strings = [
        _require_string(item, f"{path}[{index}]", max_length=max_length)
        for index, item in enumerate(value)
    ]
    if len(strings) != len(set(strings)):
        raise ProposalValidationError(f"{path} must not contain duplicates.")
    return strings


def _validate_bbox(value: Any, path: str) -> dict[str, float]:
    bbox = _require_object(value, path)
    _require_exact_keys(bbox, _BBOX_KEYS, path)
    normalized = {key: _require_number(bbox[key], f"{path}.{key}") for key in _BBOX_KEYS}
    if normalized["x1"] >= normalized["x2"] or normalized["y1"] >= normalized["y2"]:
        raise ProposalValidationError(f"{path} must have positive width and height.")
    if normalized["x2"] - normalized["x1"] < 0.005:
        raise ProposalValidationError(f"{path} is too narrow to be a top-level semantic region.")
    if normalized["y2"] - normalized["y1"] < 0.005:
        raise ProposalValidationError(f"{path} is too short to be a top-level semantic region.")
    return {key: round(normalized[key], 6) for key in ("x1", "y1", "x2", "y2")}


def _validate_polygon(value: Any, bbox: dict[str, float], path: str) -> list[list[float]] | None:
    if value is None:
        return None
    if not isinstance(value, list) or not 3 <= len(value) <= 64:
        raise ProposalValidationError(f"{path} must be null or contain 3 to 64 points.")
    points: list[list[float]] = []
    for index, point in enumerate(value):
        if not isinstance(point, list) or len(point) != 2:
            raise ProposalValidationError(f"{path}[{index}] must be [x, y].")
        x = _require_number(point[0], f"{path}[{index}][0]")
        y = _require_number(point[1], f"{path}[{index}][1]")
        if not bbox["x1"] <= x <= bbox["x2"] or not bbox["y1"] <= y <= bbox["y2"]:
            raise ProposalValidationError(f"{path}[{index}] must stay inside bboxNorm.")
        points.append([round(x, 6), round(y, 6)])
    if len({tuple(point) for point in points}) < 3:
        raise ProposalValidationError(f"{path} must contain at least 3 distinct points.")
    return points


def _bbox_iou(left: dict[str, float], right: dict[str, float]) -> float:
    width = max(0.0, min(left["x2"], right["x2"]) - max(left["x1"], right["x1"]))
    height = max(0.0, min(left["y2"], right["y2"]) - max(left["y1"], right["y1"]))
    intersection = width * height
    left_area = (left["x2"] - left["x1"]) * (left["y2"] - left["y1"])
    right_area = (right["x2"] - right["x1"]) * (right["y2"] - right["y1"])
    union = left_area + right_area - intersection
    return intersection / union if union else 0.0


def _validate_region(raw: Any, index: int) -> dict[str, Any]:
    path = f"proposal.regions[{index}]"
    region = _require_object(raw, path)
    _require_exact_keys(region, _REGION_KEYS, path)

    region_type = region["type"]
    if not isinstance(region_type, str) or region_type not in REGION_TYPES:
        raise ProposalValidationError(f"{path}.type is not supported.")
    bbox = _validate_bbox(region["bboxNorm"], f"{path}.bboxNorm")
    polygon = _validate_polygon(region["polygonNorm"], bbox, f"{path}.polygonNorm")
    reading_order = region["readingOrder"]
    if isinstance(reading_order, bool) or not isinstance(reading_order, int) or reading_order < 1:
        raise ProposalValidationError(f"{path}.readingOrder must be a positive integer.")
    importance = region["importance"]
    if not isinstance(importance, str) or importance not in _IMPORTANCE:
        raise ProposalValidationError(f"{path}.importance is not supported.")

    return {
        "type": region_type,
        "bboxNorm": bbox,
        "polygonNorm": polygon,
        "readingOrder": reading_order,
        "textRedacted": _require_string(
            region["textRedacted"], f"{path}.textRedacted", min_length=0, max_length=2000
        ),
        "summary": _require_string(region["summary"], f"{path}.summary", max_length=500),
        "concepts": _validate_string_list(
            region["concepts"], f"{path}.concepts", max_items=8, max_length=80
        ),
        "importance": importance,
        "confidence": _require_number(region["confidence"], f"{path}.confidence"),
    }


def validate_proposal(
    raw: Any,
    *,
    expected_slide_alias: str,
    expected_prompt_version: str = PROMPT_VERSION,
) -> dict[str, Any]:
    proposal = _require_object(raw, "proposal")
    _require_exact_keys(proposal, _PROPOSAL_KEYS, "proposal")
    if proposal["schemaVersion"] != PROPOSAL_SCHEMA_VERSION:
        raise ProposalValidationError("proposal.schemaVersion does not match the v2 contract.")
    if proposal["promptVersion"] != expected_prompt_version:
        raise ProposalValidationError("proposal.promptVersion does not match the configured prompt.")
    if proposal["slideAlias"] != expected_slide_alias:
        raise ProposalValidationError("proposal.slideAlias does not match the requested slide.")

    raw_regions = proposal["regions"]
    if not isinstance(raw_regions, list) or not MIN_REGIONS <= len(raw_regions) <= MAX_REGIONS:
        raise ProposalValidationError(
            f"proposal.regions must contain between {MIN_REGIONS} and {MAX_REGIONS} items."
        )
    regions = [_validate_region(region, index) for index, region in enumerate(raw_regions)]
    expected_order = list(range(1, len(regions) + 1))
    actual_order = sorted(region["readingOrder"] for region in regions)
    if actual_order != expected_order:
        raise ProposalValidationError("proposal.regions readingOrder must be a complete 1..N sequence.")

    for left_index, left in enumerate(regions):
        for right_index in range(left_index + 1, len(regions)):
            if _bbox_iou(left["bboxNorm"], regions[right_index]["bboxNorm"]) >= 0.98:
                raise ProposalValidationError(
                    f"proposal.regions[{left_index}] duplicates proposal.regions[{right_index}]."
                )

    return {
        "schemaVersion": PROPOSAL_SCHEMA_VERSION,
        "promptVersion": expected_prompt_version,
        "slideAlias": expected_slide_alias,
        "slideSummary": _require_string(
            proposal["slideSummary"], "proposal.slideSummary", max_length=800
        ),
        "keyConcepts": _validate_string_list(
            proposal["keyConcepts"], "proposal.keyConcepts", max_items=12, max_length=80
        ),
        "regions": sorted(regions, key=lambda region: region["readingOrder"]),
    }


def build_slide_artifact(
    raw_proposal: Any,
    baseline_page: dict[str, Any],
    *,
    slide_alias: str,
    region_source: str = "multimodal",
    pipeline_version: str = PIPELINE_VERSION,
) -> dict[str, Any]:
    proposal = validate_proposal(raw_proposal, expected_slide_alias=slide_alias)
    if not isinstance(region_source, str) or not region_source.strip():
        raise ProposalValidationError("region_source must be a non-empty string.")
    if not isinstance(pipeline_version, str) or not pipeline_version.strip():
        raise ProposalValidationError("pipeline_version must be a non-empty string.")
    width = baseline_page.get("widthPx")
    height = baseline_page.get("heightPx")
    source_sha256 = baseline_page.get("sourceSha256")
    page_number = baseline_page.get("pageNumber")
    if isinstance(width, bool) or not isinstance(width, int) or width <= 0:
        raise ProposalValidationError("baseline page widthPx must be a positive integer.")
    if isinstance(height, bool) or not isinstance(height, int) or height <= 0:
        raise ProposalValidationError("baseline page heightPx must be a positive integer.")
    if not isinstance(source_sha256, str) or len(source_sha256) != 64:
        raise ProposalValidationError("baseline page sourceSha256 is invalid.")
    if isinstance(page_number, bool) or not isinstance(page_number, int) or page_number < 1:
        raise ProposalValidationError("baseline page pageNumber is invalid.")

    regions = []
    for alias_number, region in enumerate(proposal["regions"], start=1):
        regions.append(
            {
                "alias": f"R{alias_number:03d}",
                **region,
                "source": region_source,
            }
        )
    return {
        "schemaVersion": ARTIFACT_SCHEMA_VERSION,
        "pipelineVersion": pipeline_version,
        "promptVersion": proposal["promptVersion"],
        "slideAlias": slide_alias,
        "pageNumber": page_number,
        "sourceSha256": source_sha256,
        "widthPx": width,
        "heightPx": height,
        "slideSummary": proposal["slideSummary"],
        "keyConcepts": proposal["keyConcepts"],
        "regions": regions,
    }


def require_safe_baseline(manifest: dict[str, Any]) -> None:
    if manifest.get("safeForExternalAi") is not True:
        raise ProposalValidationError("baseline manifest is not approved for external AI input.")
    if manifest.get("redactionStatus") != "applied":
        raise ProposalValidationError("baseline redactionStatus must be applied.")
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ProposalValidationError("baseline manifest must contain pages.")


def select_pages(manifest: dict[str, Any], page_numbers: Iterable[int]) -> list[dict[str, Any]]:
    pages_by_number = {page.get("pageNumber"): page for page in manifest.get("pages") or []}
    selected: list[dict[str, Any]] = []
    seen: set[int] = set()
    for page_number in page_numbers:
        if isinstance(page_number, bool) or not isinstance(page_number, int) or page_number < 1:
            raise ProposalValidationError("selected page numbers must be positive integers.")
        if page_number in seen:
            raise ProposalValidationError(f"selected page {page_number} is duplicated.")
        page = pages_by_number.get(page_number)
        if page is None:
            raise ProposalValidationError(f"selected page {page_number} was not found.")
        seen.add(page_number)
        selected.append(page)
    if not selected:
        raise ProposalValidationError("at least one page must be selected.")
    return selected
