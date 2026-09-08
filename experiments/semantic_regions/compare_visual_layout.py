"""Local, reproducible document-layout versus dense-caption experiment.

Model weights are downloaded; lecture images are never uploaded. Outputs are
evaluation artifacts, not approved instructor-report claims.
"""
from __future__ import annotations

import argparse
import gc
import json
import math
import time
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

from probe_florence2 import PeakMemoryMonitor, sha256_file
from semantic_region_v2 import require_safe_baseline

LAYOUT_MODEL = "PaddlePaddle/PP-DocLayoutV3_safetensors"
LAYOUT_REVISION = "97d101e6db2642e162a1d05392d1b0231c91033e"


def normalized_box(box, width, height):
    values = [float(v) for v in box]
    if len(values) != 4 or not all(math.isfinite(v) for v in values):
        raise ValueError("Invalid model box")
    x1, y1, x2, y2 = values
    # Detectors can extend slightly beyond image edges; preserve raw output too.
    result = dict(zip(("x1", "y1", "x2", "y2"),
                      (max(0, min(1, x1 / width)), max(0, min(1, y1 / height)),
                       max(0, min(1, x2 / width)), max(0, min(1, y2 / height)))))
    if result["x1"] >= result["x2"] or result["y1"] >= result["y2"]:
        raise ValueError("Empty model box")
    return result


def attach_ocr(box, regions):
    """Attach observed text by center containment; never infer missing text."""
    selected = []
    for region in regions:
        b = region["bboxNorm"]
        x, y = (b["x1"] + b["x2"]) / 2, (b["y1"] + b["y2"]) / 2
        if box["x1"] <= x <= box["x2"] and box["y1"] <= y <= box["y2"]:
            selected.append(region)
    selected.sort(key=lambda r: r.get("readingOrder", 0))
    return "\n".join(r.get("textRedacted", "") for r in selected), [r["alias"] for r in selected]


def draw_overlay(source, regions, destination):
    canvas = source.copy()
    draw = ImageDraw.Draw(canvas)
    colors = {"table": "#ca8a04", "image": "#9333ea", "chart": "#e11d48"}
    for region in regions:
        b = region["bboxNorm"]
        xy = (b["x1"] * canvas.width, b["y1"] * canvas.height,
              b["x2"] * canvas.width, b["y2"] * canvas.height)
        color = colors.get(region["label"], "#2563eb")
        draw.rectangle(xy, outline=color, width=3)
        label = f'{region["alias"]} {region["label"]} {region["score"]:.2f}'
        draw.text((xy[0] + 3, xy[1] + 3), label, fill=color, stroke_width=1, stroke_fill="white")
    canvas.save(destination)


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(args):
    baseline = json.loads(args.manifest.read_text(encoding="utf-8"))
    require_safe_baseline(baseline)
    if args.output.exists():
        raise FileExistsError("Use a new output directory to preserve prior runs")
    args.output.mkdir(parents=True)
    import torch
    from transformers import AutoImageProcessor, AutoModelForObjectDetection

    torch.set_num_threads(args.threads)
    monitor = PeakMemoryMonitor()
    monitor.start()
    start = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(LAYOUT_MODEL, revision=LAYOUT_REVISION)
    model = AutoModelForObjectDetection.from_pretrained(LAYOUT_MODEL, revision=LAYOUT_REVISION).eval()
    load_ms = round((time.perf_counter() - start) * 1000)
    result = {"schemaVersion": "visual-layout-comparison.v1", "evaluationOnly": True,
              "model": LAYOUT_MODEL, "revision": LAYOUT_REVISION, "license": "Apache-2.0",
              "torch": torch.__version__, "device": "cpu", "threads": args.threads,
              "threshold": args.threshold, "modelLoadMs": load_ms, "status": "running", "pages": []}
    try:
        for page in baseline["pages"]:
            if args.pages and page["pageNumber"] not in args.pages:
                continue
            image_path = (args.manifest.parent / page["renderedImage"]).resolve()
            image_path.relative_to(args.manifest.parent.resolve())
            with Image.open(image_path) as source:
                image = source.convert("RGB")
            started = time.perf_counter()
            inputs = processor(images=image, return_tensors="pt")
            with torch.inference_mode():
                output = model(**inputs)
            detections = processor.post_process_object_detection(
                output, threshold=args.threshold, target_sizes=[(image.height, image.width)])[0]
            elapsed = round((time.perf_counter() - started) * 1000)
            regions = []
            for box, label, score, polygon in zip(detections["boxes"], detections["labels"], detections["scores"], detections["polygon_points"]):
                bbox = normalized_box(box.tolist(), image.width, image.height)
                text, members = attach_ocr(bbox, page["regions"])
                regions.append({"alias": f"R{len(regions)+1:03d}",
                                "label": model.config.id2label[int(label)],
                                "score": round(float(score), 4), "bboxNorm": bbox,
                                "rawBoxPx": box.tolist(),
                                "polygonNorm": [[max(0., min(1., float(x) / image.width)), max(0., min(1., float(y) / image.height))] for x, y in polygon],
                                "textRedacted": text, "ocrMembers": members})
            filename = f'slide-{page["pageNumber"]:03d}.layout.jpg'
            draw_overlay(image, regions, args.output / filename)
            record = {"pageNumber": page["pageNumber"], "sourceSha256": sha256_file(image_path),
                      "inferenceMs": elapsed, "baselineRegionCount": len(page["regions"]),
                      "baselineTypes": dict(Counter(r["type"] for r in page["regions"])),
                      "types": dict(Counter(r["label"] for r in regions)),
                      "overlay": filename, "regions": regions}
            result["pages"].append(record)
            save(args.output / "layout.json", result)
            print(json.dumps({k: record[k] for k in ("pageNumber", "inferenceMs", "types")}), flush=True)
            del output, inputs, detections
        result["peakRssBytes"] = monitor.peak_rss_bytes
        result["status"] = "complete"
        result["totalMs"] = round((time.perf_counter() - start) * 1000)
        save(args.output / "layout.json", result)
    finally:
        monitor.stop()
    del model, processor
    gc.collect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pages", type=int, nargs="+")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--threshold", type=float, default=0.45)
    args = parser.parse_args()
    if args.threads < 1 or not 0 < args.threshold < 1:
        parser.error("Invalid threads or threshold")
    run(args)
