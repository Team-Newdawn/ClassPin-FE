from __future__ import annotations

import argparse
import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

from PIL import Image


MODEL_ID = "florence-community/Florence-2-base-ft"
MODEL_REVISION = "0b03b6f15a4a211370fb204aee4e7dd48887ea37"
MODEL_LICENSE = "MIT"
TASKS = {
    "detailedCaption": ("<MORE_DETAILED_CAPTION>", 256),
    "denseRegionCaption": ("<DENSE_REGION_CAPTION>", 768),
}


class PeakMemoryMonitor:
    """Best-effort RSS monitor kept outside the model/provider contract."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.peak_rss_bytes: int | None = None

    def start(self) -> None:
        try:
            import psutil
        except ImportError:
            return

        process = psutil.Process(os.getpid())

        def sample() -> None:
            while not self._stop.wait(0.05):
                rss = process.memory_info().rss
                self.peak_rss_bytes = max(self.peak_rss_bytes or 0, rss)

        self._thread = threading.Thread(target=sample, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_task(
    *,
    model: Any,
    processor: Any,
    image: Image.Image,
    task_prompt: str,
    max_new_tokens: int,
    torch: Any,
) -> dict[str, Any]:
    inputs = processor(text=task_prompt, images=image, return_tensors="pt")
    started = time.perf_counter()
    with torch.inference_mode():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=max_new_tokens,
            do_sample=False,
            num_beams=1,
        )
    latency_ms = round((time.perf_counter() - started) * 1000)
    # Florence-2 is encoder-decoder, so generated_ids contains decoder output
    # only; subtracting encoder input length would yield a negative count.
    generated_token_count = int(generated_ids.shape[-1])
    generated_text = processor.batch_decode(
        generated_ids, skip_special_tokens=False
    )[0]
    parsed = processor.post_process_generation(
        generated_text,
        task=task_prompt,
        image_size=(image.width, image.height),
    )
    return {
        "task": task_prompt,
        "latencyMs": latency_ms,
        "generatedTokenCount": generated_token_count,
        "parsed": parsed,
    }


def probe(image_path: Path, task_names: list[str]) -> dict[str, Any]:
    # Imports stay lazy so the CLI can validate paths before allocating model memory.
    import torch
    from transformers import AutoProcessor, Florence2ForConditionalGeneration

    monitor = PeakMemoryMonitor()
    monitor.start()
    total_started = time.perf_counter()
    load_started = time.perf_counter()
    processor = AutoProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = Florence2ForConditionalGeneration.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    ).eval()
    model_load_ms = round((time.perf_counter() - load_started) * 1000)

    try:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        results = []
        for name in task_names:
            task_prompt, max_new_tokens = TASKS[name]
            results.append(
                run_task(
                    model=model,
                    processor=processor,
                    image=image,
                    task_prompt=task_prompt,
                    max_new_tokens=max_new_tokens,
                    torch=torch,
                )
            )
        return {
            "schemaVersion": "local-model-probe.v1",
            "provider": "local-transformers",
            "model": MODEL_ID,
            "modelRevision": MODEL_REVISION,
            "modelLicense": MODEL_LICENSE,
            "device": "cpu",
            "sourceSha256": sha256_file(image_path),
            "image": {"widthPx": image.width, "heightPx": image.height},
            "modelLoadMs": model_load_ms,
            "totalLatencyMs": round((time.perf_counter() - total_started) * 1000),
            "peakRssBytes": monitor.peak_rss_bytes,
            "results": results,
        }
    finally:
        monitor.stop()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a pinned local Florence-2 probe on one already-redacted slide."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--task",
        action="append",
        choices=sorted(TASKS),
        dest="tasks",
        help="Task to run. Repeat to select multiple tasks; defaults to both.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image_path = args.image.resolve()
    output_path = args.output.resolve()
    if not image_path.is_file():
        raise FileNotFoundError(f"Input image was not found: {image_path}")
    if output_path.exists():
        raise FileExistsError(f"Output already exists: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = probe(image_path, args.tasks or list(TASKS))
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "model": result["model"],
                "modelRevision": result["modelRevision"],
                "totalLatencyMs": result["totalLatencyMs"],
                "peakRssBytes": result["peakRssBytes"],
                "taskCount": len(result["results"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
