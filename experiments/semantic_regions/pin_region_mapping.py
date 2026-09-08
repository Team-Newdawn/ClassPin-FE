from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Iterable


BBox = tuple[float, float, float, float]
DEFAULT_MAX_POINT_DISTANCE = 0.06
DEFAULT_MIN_OVERLAP = 0.20


def bbox_area(bbox: BBox) -> float:
    return max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1])


def bbox_from_region(region: dict[str, Any]) -> BBox:
    bbox = region["bboxNorm"]
    return (float(bbox["x1"]), float(bbox["y1"]), float(bbox["x2"]), float(bbox["y2"]))


def contains_point(bbox: BBox, point: tuple[float, float]) -> bool:
    return bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3]


def point_distance_to_bbox(point: tuple[float, float], bbox: BBox) -> float:
    x, y = point
    dx = max(bbox[0] - x, 0.0, x - bbox[2])
    dy = max(bbox[1] - y, 0.0, y - bbox[3])
    return math.hypot(dx, dy)


def intersection_area(left: BBox, right: BBox) -> float:
    width = max(0.0, min(left[2], right[2]) - max(left[0], right[0]))
    height = max(0.0, min(left[3], right[3]) - max(left[1], right[1]))
    return width * height


def bbox_iou(left: BBox, right: BBox) -> float:
    intersection = intersection_area(left, right)
    union = bbox_area(left) + bbox_area(right) - intersection
    return intersection / union if union > 0 else 0.0


def validate_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number.")
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1.")
    return number


def point_from_coords(coords: dict[str, Any]) -> tuple[float, float]:
    return (validate_number(coords.get("x"), "x"), validate_number(coords.get("y"), "y"))


def box_from_coords(coords: dict[str, Any]) -> BBox:
    x, y = point_from_coords(coords)
    width = validate_number(coords.get("width"), "width")
    height = validate_number(coords.get("height"), "height")
    if width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        raise ValueError("box must have positive size and stay within normalized bounds.")
    return (x, y, x + width, y + height)


def path_points_from_coords(coords: dict[str, Any]) -> list[tuple[float, float]]:
    raw_points = coords.get("points")
    if not isinstance(raw_points, list) or not 2 <= len(raw_points) <= 512:
        raise ValueError("path points must be an array with 2 to 512 entries.")
    points: list[tuple[float, float]] = []
    for index, point in enumerate(raw_points):
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError(f"points[{index}] must be [x, y].")
        points.append(
            (
                validate_number(point[0], f"points[{index}][0]"),
                validate_number(point[1], f"points[{index}][1]"),
            )
        )
    return points


def path_bbox(points: Iterable[tuple[float, float]]) -> BBox:
    materialized = list(points)
    xs = [point[0] for point in materialized]
    ys = [point[1] for point in materialized]
    return (min(xs), min(ys), max(xs), max(ys))


def prefer_content_regions(scored: list[tuple[dict[str, Any], float, str]]) -> list[tuple[dict[str, Any], float, str]]:
    content = [entry for entry in scored if entry[0].get("type") != "footer"]
    return content or scored


def sort_scored(scored: list[tuple[dict[str, Any], float, str]]) -> list[tuple[dict[str, Any], float, str]]:
    def key(entry: tuple[dict[str, Any], float, str]) -> tuple[float, float, float, str]:
        region, score, method = entry
        area = bbox_area(bbox_from_region(region))
        reading_order = float(region.get("readingOrder") or 0)
        # A point inside nested regions should choose the smallest precise target.
        # Equal overlap/path candidates represent a reading sequence, so their
        # order must not change because of tiny normalized-area differences.
        first_tie, second_tie = (area, reading_order) if method == "contains" else (reading_order, area)
        return (-score, first_tie, second_tie, str(region["alias"]))

    return sorted(
        scored,
        key=key,
    )


def references(scored: list[tuple[dict[str, Any], float, str]]) -> list[dict[str, Any]]:
    ordered = sort_scored(prefer_content_regions(scored))
    return [
        {
            "regionAlias": region["alias"],
            "role": "primary" if index == 0 else "supporting",
            "method": method,
            "score": round(score, 6),
        }
        for index, (region, score, method) in enumerate(ordered)
    ]


def map_point(
    coords: dict[str, Any],
    regions: list[dict[str, Any]],
    max_distance: float,
) -> tuple[list[dict[str, Any]], str | None]:
    point = point_from_coords(coords)
    containing = [
        (region, 1.0, "contains")
        for region in regions
        if contains_point(bbox_from_region(region), point)
    ]
    if containing:
        return references(containing), None

    nearest_candidates = [region for region in regions if region.get("type") != "footer"] or regions
    nearest = sorted(
        ((region, point_distance_to_bbox(point, bbox_from_region(region))) for region in nearest_candidates),
        key=lambda entry: (
            entry[1],
            bbox_area(bbox_from_region(entry[0])),
            int(entry[0].get("readingOrder") or 0),
            str(entry[0]["alias"]),
        ),
    )
    if not nearest or nearest[0][1] > max_distance:
        return [], "no-region-within-distance"
    region, distance = nearest[0]
    score = max(0.0, 1.0 - distance / max_distance)
    return references([(region, score, "nearest")]), None


def map_box(
    coords: dict[str, Any],
    regions: list[dict[str, Any]],
    min_overlap: float,
) -> tuple[list[dict[str, Any]], str | None]:
    anchor = box_from_coords(coords)
    anchor_area = bbox_area(anchor)
    scored: list[tuple[dict[str, Any], float, str]] = []
    for region in regions:
        region_bbox = bbox_from_region(region)
        intersection = intersection_area(anchor, region_bbox)
        coverage = intersection / anchor_area if anchor_area > 0 else 0.0
        score = max(coverage, bbox_iou(anchor, region_bbox))
        if score >= min_overlap:
            scored.append((region, score, "overlap"))
    return (references(scored), None) if scored else ([], "no-region-overlap")


def map_path(
    coords: dict[str, Any],
    regions: list[dict[str, Any]],
    min_overlap: float,
) -> tuple[list[dict[str, Any]], str | None]:
    points = path_points_from_coords(coords)
    anchor_bbox = path_bbox(points)
    scored: list[tuple[dict[str, Any], float, str]] = []
    for region in regions:
        region_bbox = bbox_from_region(region)
        inside_ratio = sum(contains_point(region_bbox, point) for point in points) / len(points)
        score = max(inside_ratio, bbox_iou(anchor_bbox, region_bbox))
        if score >= min_overlap:
            scored.append((region, score, "path-overlap"))
    return (references(scored), None) if scored else ([], "no-region-overlap")


def map_anchor(
    anchor: dict[str, Any],
    regions: list[dict[str, Any]],
    max_point_distance: float = DEFAULT_MAX_POINT_DISTANCE,
    min_overlap: float = DEFAULT_MIN_OVERLAP,
) -> dict[str, Any]:
    question_alias = str(anchor.get("questionAlias") or "")
    kind = str(anchor.get("kind") or "")
    coords = anchor.get("coords")
    base = {"questionAlias": question_alias, "anchorKind": kind}
    if not question_alias:
        return {**base, "mappingStatus": "invalid", "regionRefs": [], "reason": "missing-question-alias"}
    if not isinstance(coords, dict):
        return {**base, "mappingStatus": "invalid", "regionRefs": [], "reason": "invalid-coords"}

    try:
        if kind == "point":
            region_refs, reason = map_point(coords, regions, max_point_distance)
        elif kind == "box":
            region_refs, reason = map_box(coords, regions, min_overlap)
        elif kind == "path":
            region_refs, reason = map_path(coords, regions, min_overlap)
        else:
            return {**base, "mappingStatus": "invalid", "regionRefs": [], "reason": "unsupported-anchor-kind"}
    except (KeyError, TypeError, ValueError):
        return {**base, "mappingStatus": "invalid", "regionRefs": [], "reason": "invalid-coords"}

    if not region_refs:
        return {**base, "mappingStatus": "unmapped", "regionRefs": [], "reason": reason}
    return {**base, "mappingStatus": "mapped", "regionRefs": region_refs}


def page_regions(manifest: dict[str, Any], page_number: int) -> list[dict[str, Any]]:
    for page in manifest.get("pages") or []:
        if page.get("pageNumber") == page_number:
            return list(page.get("regions") or [])
    raise ValueError(f"Page {page_number} was not found in the manifest.")


def map_deck_anchors(
    manifest: dict[str, Any],
    anchors: list[dict[str, Any]],
    max_point_distance: float = DEFAULT_MAX_POINT_DISTANCE,
    min_overlap: float = DEFAULT_MIN_OVERLAP,
) -> list[dict[str, Any]]:
    mappings: list[dict[str, Any]] = []
    for anchor in anchors:
        slide_number = anchor.get("slideNumber")
        if isinstance(slide_number, bool) or not isinstance(slide_number, int) or slide_number < 1:
            mappings.append(
                {
                    "questionAlias": str(anchor.get("questionAlias") or ""),
                    "slideNumber": slide_number,
                    "anchorKind": str(anchor.get("kind") or ""),
                    "mappingStatus": "invalid",
                    "regionRefs": [],
                    "reason": "invalid-slide-number",
                }
            )
            continue
        try:
            regions = page_regions(manifest, slide_number)
        except ValueError:
            mappings.append(
                {
                    "questionAlias": str(anchor.get("questionAlias") or ""),
                    "slideNumber": slide_number,
                    "anchorKind": str(anchor.get("kind") or ""),
                    "mappingStatus": "invalid",
                    "regionRefs": [],
                    "reason": "slide-not-found",
                }
            )
            continue
        mappings.append(
            {
                "slideNumber": slide_number,
                **map_anchor(anchor, regions, max_point_distance, min_overlap),
            }
        )
    return mappings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Map normalized ClassPin anchors to extracted slide regions.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("anchors", type=Path)
    parser.add_argument(
        "--page",
        type=int,
        help="Map every anchor to one page. Omit when anchors contain slideNumber.",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-point-distance", type=float, default=DEFAULT_MAX_POINT_DISTANCE)
    parser.add_argument("--min-overlap", type=float, default=DEFAULT_MIN_OVERLAP)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.output.exists():
        raise FileExistsError(f"Output already exists: {args.output}")
    if not 0 < args.max_point_distance <= 1:
        raise ValueError("max-point-distance must be greater than 0 and at most 1.")
    if not 0 < args.min_overlap <= 1:
        raise ValueError("min-overlap must be greater than 0 and at most 1.")

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    anchor_document = json.loads(args.anchors.read_text(encoding="utf-8"))
    anchors = (
        anchor_document.get("anchors") or anchor_document.get("questions")
        if isinstance(anchor_document, dict)
        else anchor_document
    )
    if not isinstance(anchors, list):
        raise ValueError("Anchor file must be an array or an object with an anchors array.")

    if args.page is None:
        mappings = map_deck_anchors(
            manifest,
            anchors,
            args.max_point_distance,
            args.min_overlap,
        )
    else:
        regions = page_regions(manifest, args.page)
        mappings = [
            map_anchor(anchor, regions, args.max_point_distance, args.min_overlap)
            for anchor in anchors
        ]
    result = {
        "schemaVersion": "pin-region-mapping.v1",
        "pipelineVersion": manifest.get("pipelineVersion"),
        "sourceSha256": manifest.get("sourceSha256"),
        "pageNumber": args.page,
        "maxPointDistance": args.max_point_distance,
        "minOverlap": args.min_overlap,
        "mappings": mappings,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "mappingCount": len(result["mappings"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
