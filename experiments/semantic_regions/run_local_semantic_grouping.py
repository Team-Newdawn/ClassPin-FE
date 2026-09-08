from __future__ import annotations

import argparse
import hashlib
import json
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any

import psutil

try:
    from experiments.semantic_regions.pin_region_mapping import map_deck_anchors
    from experiments.semantic_regions.pin_semantic_analysis import (
        apply_pin_semantic_quality_gate,
        build_pin_semantic_schema,
        validate_pin_semantic_analysis,
    )
    from experiments.semantic_regions.ocr_redaction import redact_text
    from experiments.semantic_regions.semantic_grouping import (
        GROUPING_PIPELINE_VERSION,
        build_grouped_slide_artifact,
    )
    from experiments.semantic_regions.semantic_region_v2 import require_safe_baseline, select_pages
    from experiments.semantic_regions.spatial_candidate_enrichment import (
        ENRICHMENT_PROMPT_VERSION,
        ENRICHMENT_SCHEMA_VERSION,
        apply_grounding_quality_gate,
        build_single_candidate_schema,
        build_spatial_candidates,
        build_summary_schema,
        merge_enrichment,
        validate_enrichment,
    )
except ModuleNotFoundError:
    from pin_region_mapping import map_deck_anchors  # type: ignore[no-redef]
    from pin_semantic_analysis import (  # type: ignore[no-redef]
        apply_pin_semantic_quality_gate,
        build_pin_semantic_schema,
        validate_pin_semantic_analysis,
    )
    from ocr_redaction import redact_text  # type: ignore[no-redef]
    from semantic_grouping import (  # type: ignore[no-redef]
        GROUPING_PIPELINE_VERSION,
        build_grouped_slide_artifact,
    )
    from semantic_region_v2 import require_safe_baseline, select_pages  # type: ignore[no-redef]
    from spatial_candidate_enrichment import (  # type: ignore[no-redef]
        ENRICHMENT_PROMPT_VERSION,
        ENRICHMENT_SCHEMA_VERSION,
        apply_grounding_quality_gate,
        build_single_candidate_schema,
        build_spatial_candidates,
        build_summary_schema,
        merge_enrichment,
        validate_enrichment,
    )


MODEL_PROFILES = {
    "da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4": {
        "name": "Qwen3-0.6B-GGUF Q4_0",
        "source": "ggml-org/Qwen3-0.6B-GGUF",
        "revision": "b5f37287796e5be0ea3dab2e7430873fb3f73e49",
        "file": "Qwen3-0.6B-Q4_0.gguf",
        "sha256": "da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4",
        "license": "Apache-2.0",
    },
    "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5": {
        "name": "Qwen3-1.7B-GGUF Q4_K_M",
        "source": "ggml-org/Qwen3-1.7B-GGUF",
        "revision": "daeb8e2d528a760970442092f6bf1e55c3b659eb",
        "file": "Qwen3-1.7B-Q4_K_M.gguf",
        "sha256": "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5",
        "license": "Apache-2.0",
    },
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_slide_input(page: dict[str, Any], slide_alias: str) -> dict[str, Any]:
    elements = []
    for region in page.get("regions") or []:
        bbox = region["bboxNorm"]
        elements.append(
            {
                "alias": region["alias"],
                "bbox": [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]],
                "text": str(region.get("textRedacted") or region.get("summary") or "")[:500],
            }
        )
    return {"slideAlias": slide_alias, "elements": elements}


def build_runtime_schema(aliases: list[str], slide_alias: str) -> dict[str, Any]:
    alias_items = {"type": "string", "enum": aliases}
    group = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "type",
            "memberAliases",
            "summary",
            "concepts",
            "importance",
            "confidence",
        ],
        "properties": {
            "type": {
                "enum": [
                    "title",
                    "paragraph",
                    "table",
                    "chart",
                    "formula",
                    "code",
                    "image",
                    "diagram",
                    "callout",
                    "footer",
                    "other",
                ]
            },
            "memberAliases": {
                "type": "array",
                "minItems": 1,
                "maxItems": len(aliases),
                "items": alias_items,
            },
            "summary": {"type": "string", "minLength": 1, "maxLength": 500},
            "concepts": {
                "type": "array",
                "maxItems": 4,
                "items": {"type": "string", "minLength": 1, "maxLength": 80},
            },
            "importance": {"enum": ["low", "medium", "high"]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "schemaVersion",
            "promptVersion",
            "slideAlias",
            "slideSummary",
            "keyConcepts",
            "groups",
            "ignoredMemberAliases",
        ],
        "properties": {
            "schemaVersion": {"const": "semantic-region-grouping.v1"},
            "promptVersion": {"const": "semantic-region-grouping.v1"},
            "slideAlias": {"const": slide_alias},
            "slideSummary": {"type": "string", "minLength": 1, "maxLength": 800},
            "keyConcepts": {
                "type": "array",
                "maxItems": 12,
                "items": {"type": "string", "minLength": 1, "maxLength": 80},
            },
            "groups": {"type": "array", "minItems": 3, "maxItems": 12, "items": group},
            "ignoredMemberAliases": {
                "type": "array",
                "maxItems": len(aliases),
                "items": alias_items,
            },
        },
    }


def extract_grouping_json(output: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    objects: list[dict[str, Any]] = []
    for index, character in enumerate(output):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(output[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            objects.append(value)
            if value.get("schemaVersion") == "semantic-region-grouping.v1":
                return value
    tail = output[-2000:].strip()
    raise ValueError(
        "llama.cpp output did not contain a semantic-region-grouping.v1 object "
        f"({len(objects)} other JSON objects found). Output tail:\n{tail}"
    )


def repair_partition(raw: dict[str, Any], aliases: list[str]) -> tuple[dict[str, Any], list[str]]:
    """Repair only duplicate/missing membership; never invent semantic content."""
    repaired = json.loads(json.dumps(raw, ensure_ascii=False))
    repairs: list[str] = []
    assigned: set[str] = set()
    for index, group in enumerate(repaired.get("groups") or []):
        members = group.get("memberAliases")
        if not isinstance(members, list):
            continue
        unique = []
        for alias in members:
            if alias in assigned:
                repairs.append(f"removed duplicate {alias} from groups[{index}]")
                continue
            assigned.add(alias)
            unique.append(alias)
        group["memberAliases"] = unique

    ignored = repaired.get("ignoredMemberAliases")
    if not isinstance(ignored, list):
        return repaired, repairs
    unique_ignored = []
    for alias in ignored:
        if alias in assigned or alias in unique_ignored:
            repairs.append(f"removed duplicate {alias} from ignoredMemberAliases")
            continue
        unique_ignored.append(alias)
    missing = [alias for alias in aliases if alias not in assigned and alias not in unique_ignored]
    if missing:
        unique_ignored.extend(missing)
        repairs.append(f"accounted for {len(missing)} omitted aliases as ignored")
    repaired["ignoredMemberAliases"] = unique_ignored
    return repaired, repairs


class PeakTreeMemory:
    def __init__(self) -> None:
        self.peak_bytes = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, pid: int) -> None:
        def sample() -> None:
            try:
                process = psutil.Process(pid)
            except psutil.Error:
                return
            while not self._stop.is_set():
                total = 0
                try:
                    candidates = [process, *process.children(recursive=True)]
                    for candidate in candidates:
                        try:
                            total += candidate.memory_info().rss
                        except psutil.Error:
                            continue
                except psutil.Error:
                    break
                self.peak_bytes = max(self.peak_bytes, total)
                self._stop.wait(0.05)

        self._thread = threading.Thread(target=sample, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)


def _available_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_server(url: str, process: subprocess.Popen[str], timeout_seconds: float = 90) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"llama-server exited before becoming ready ({process.returncode}).")
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=1) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.2)
    raise TimeoutError("llama-server did not become ready within 90 seconds.")


def _post_chat_completion(
    url: str,
    prompt: str,
    schema: dict[str, Any],
    max_tokens: int,
) -> dict[str, Any]:
    body = json.dumps(
        {
            "model": "local",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a strict JSON semantic-layout analyzer. Follow the user rules and schema.",
                },
                {"role": "user", "content": f"{prompt}\n/no_think"},
            ],
            "temperature": 0,
            "seed": 42,
            "max_tokens": max_tokens,
            "reasoning_format": "none",
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "semantic_region_grouping",
                    "strict": True,
                    "schema": schema,
                },
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{url}/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        return json.loads(response.read().decode("utf-8"))


def run_llama_server_batch(
    llama_server: Path,
    model: Path,
    requests: list[tuple[str, dict[str, Any]]],
    *,
    threads: int,
    context_size: int,
    max_tokens: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    port = _available_local_port()
    url = f"http://127.0.0.1:{port}"
    command = [
        str(llama_server),
        "-m",
        str(model),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "-c",
        str(context_size),
        "-t",
        str(threads),
        "-np",
        "1",
        "--jinja",
        "--no-warmup",
    ]
    logs: deque[str] = deque(maxlen=200)
    started = time.perf_counter()
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    memory = PeakTreeMemory()
    memory.start(process.pid)

    def drain_logs() -> None:
        if process.stdout is None:
            return
        for line in process.stdout:
            logs.append(line.rstrip())

    log_thread = threading.Thread(target=drain_logs, daemon=True)
    log_thread.start()
    try:
        _wait_for_server(url, process)
        responses = [
            _post_chat_completion(url, prompt, schema, max_tokens)
            for prompt, schema in requests
        ]
    except Exception as error:
        log_tail = "\n".join(logs)
        raise RuntimeError(f"Local llama-server request failed: {error}\n{log_tail}") from error
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        memory.stop()
        log_thread.join(timeout=2)

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    parsed: list[dict[str, Any]] = []
    usages: list[dict[str, Any]] = []
    timings: list[dict[str, Any]] = []
    for response_index, response in enumerate(responses):
        choices = response.get("choices") or []
        if not choices or not isinstance(choices[0], dict):
            raise ValueError("llama-server response did not contain a completion choice.")
        content = ((choices[0].get("message") or {}).get("content"))
        if not isinstance(content, str):
            raise ValueError("llama-server response did not contain text content.")
        try:
            value = json.loads(content)
        except json.JSONDecodeError as error:
            finish_reason = choices[0].get("finish_reason")
            raise ValueError(
                f"llama-server response {response_index} was not complete JSON "
                f"(finish_reason={finish_reason}, chars={len(content)}): {content[-500:]}"
            ) from error
        if not isinstance(value, dict):
            raise ValueError("llama-server content must be one JSON object.")
        parsed.append(value)
        usages.append(response.get("usage") if isinstance(response.get("usage"), dict) else {})
        timings.append(response.get("timings") if isinstance(response.get("timings"), dict) else {})
    return parsed, {
        "elapsedMs": elapsed_ms,
        "peakProcessTreeRssMb": round(memory.peak_bytes / 1024 / 1024, 1),
        "threads": threads,
        "contextSize": context_size,
        "requestCount": len(requests),
        "maxGeneratedTokensPerRequest": max_tokens,
        "promptTokens": sum(int(usage.get("prompt_tokens") or 0) for usage in usages),
        "completionTokens": sum(int(usage.get("completion_tokens") or 0) for usage in usages),
        "generatedTokensPerSecond": round(
            sum(float(timing.get("predicted_per_second") or 0) for timing in timings)
            / len(timings),
            3,
        ),
    }


def load_anchors(path: Path | None, page_number: int) -> list[dict[str, Any]]:
    if path is None:
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    anchors = document.get("anchors") or document.get("questions")
    if not isinstance(anchors, list):
        raise ValueError("Anchor file must contain an anchors or questions array.")
    return [anchor for anchor in anchors if anchor.get("slideNumber") == page_number]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use a pinned local Qwen model to group OCR elements, then validate and compute geometry."
    )
    parser.add_argument("baseline_manifest", type=Path)
    parser.add_argument("--page", type=int, required=True)
    parser.add_argument("--llama-server", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--anchors", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--context-size", type=int, default=8192)
    parser.add_argument("--max-tokens", type=int, default=256)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = args.output.resolve()
    if output_path.exists():
        raise FileExistsError(f"Output already exists: {output_path}")
    if args.page < 1 or args.threads < 1 or args.context_size < 1024 or args.max_tokens < 256:
        raise ValueError("page/threads/context-size/max-tokens arguments are out of range.")

    llama_server = args.llama_server.resolve()
    model = args.model.resolve()
    if not llama_server.is_file():
        raise FileNotFoundError(f"llama-server was not found: {llama_server}")
    if not model.is_file():
        raise FileNotFoundError(f"Model was not found: {model}")
    model_sha256 = sha256_file(model)
    model_profile = MODEL_PROFILES.get(model_sha256)
    if model_profile is None:
        raise ValueError(f"Model is not an approved hash-pinned profile: {model_sha256}")

    baseline_path = args.baseline_manifest.resolve()
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    require_safe_baseline(baseline)
    page = select_pages(baseline, [args.page])[0]
    slide_alias = f"S{args.page:03d}"
    spatial_grouping, candidates = build_spatial_candidates(page, slide_alias=slide_alias)
    candidate_aliases = [candidate["candidateAlias"] for candidate in candidates]
    _, preliminary_artifact = build_grouped_slide_artifact(
        spatial_grouping,
        page,
        slide_alias=slide_alias,
    )
    anchors = load_anchors(args.anchors.resolve() if args.anchors else None, args.page)
    preliminary_mappings = (
        map_deck_anchors({"pages": [preliminary_artifact]}, anchors) if anchors else []
    )
    compact_context = [
        {
            "candidateAlias": candidate["candidateAlias"],
            "bboxNorm": candidate["bboxNorm"],
            "textRedacted": candidate["textRedacted"],
        }
        for candidate in candidates
    ]
    context_json = json.dumps(
        {"slideAlias": slide_alias, "regions": compact_context},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    summary_prompt = (
        "다음은 한 강의 슬라이드의 공간별 OCR이다. 실제 OCR 문구를 근거로 슬라이드의 "
        "구체적인 핵심 메시지를 한국어 한 문장으로 요약하고 핵심 개념을 뽑아라. "
        "'강의 주제를 설명한다' 같은 일반 문장과 type 이름 나열은 금지한다. "
        f"입력: {context_json}"
    )
    candidate_requests: list[tuple[str, dict[str, Any]]] = [
        (summary_prompt, build_summary_schema())
    ]
    for candidate in candidates:
        candidate_requests.append(
            (
                "다음 슬라이드 맥락에서 target 후보 하나만 분석하라. OCR에 실제로 보이는 고유 문구를 "
                "근거로 이 영역이 무엇을 말하는지 한국어로 구체적으로 요약하라. "
                "'강의 주제를 설명한다' 같은 일반 문장, type 이름 자체를 concept로 쓰는 것, "
                "근거 없는 내용은 금지한다. OCR이 불명확하면 위치와 보이는 단어까지만 쓰고 confidence를 낮춰라. "
                f"슬라이드 맥락: {context_json} target: "
                + json.dumps(candidate, ensure_ascii=False, separators=(",", ":")),
                build_single_candidate_schema(candidate["candidateAlias"]),
            )
        )
    pin_request_descriptors: list[tuple[str, str]] = []
    anchors_by_alias = {str(anchor.get("questionAlias") or ""): anchor for anchor in anchors}
    preliminary_regions = {
        str(region["alias"]): region for region in preliminary_artifact["regions"]
    }
    for mapping in preliminary_mappings:
        refs = mapping.get("regionRefs") or []
        if mapping.get("mappingStatus") != "mapped" or not refs:
            continue
        question_alias = str(mapping["questionAlias"])
        region_alias = str(refs[0]["regionAlias"])
        anchor = anchors_by_alias[question_alias]
        question, _ = redact_text(str(anchor.get("question") or ""))
        category, _ = redact_text(str(anchor.get("category") or ""))
        region = preliminary_regions[region_alias]
        candidate_requests.append(
            (
                "학습자가 슬라이드의 특정 위치에 남긴 PIN 질문과 그 위치의 OCR 영역 사이 의미 관계를 분석하라. "
                "asks_clarification=설명 요청, requests_evidence=근거 요청, "
                "challenges_assumption=전제나 타당성 이의, suggests_improvement=구체적 개선 제안, "
                "confirms=동의/확인, unrelated=위치와 무관. 강사가 다음 발표를 개선할 수 있는 구체적 행동도 제안하라. "
                "analysis와 instructorAction은 각각 한국어 한 문장, 100자 이내로 쓴다. "
                f"질문: {json.dumps({'questionAlias': question_alias, 'text': question, 'category': category}, ensure_ascii=False)} "
                f"위치 영역: {json.dumps({'regionAlias': region_alias, 'textRedacted': region['textRedacted']}, ensure_ascii=False)}",
                build_pin_semantic_schema(question_alias, region_alias),
            )
        )
        pin_request_descriptors.append((question_alias, region_alias))
    responses, metrics = run_llama_server_batch(
        llama_server,
        model,
        candidate_requests,
        threads=args.threads,
        context_size=args.context_size,
        max_tokens=args.max_tokens,
    )
    semantic_response_count = 1 + len(candidates)
    summary_response = responses[0]
    region_responses = responses[1:semantic_response_count]
    pin_responses = responses[semantic_response_count:]
    raw_enrichment = {
        "schemaVersion": ENRICHMENT_SCHEMA_VERSION,
        "promptVersion": ENRICHMENT_PROMPT_VERSION,
        "slideAlias": slide_alias,
        "slideSummary": summary_response.get("slideSummary"),
        "keyConcepts": summary_response.get("keyConcepts"),
        "regions": region_responses,
    }
    enrichment = validate_enrichment(
        raw_enrichment,
        expected_slide_alias=slide_alias,
        candidate_aliases=candidate_aliases,
    )
    grounded_enrichment, quality_warnings = apply_grounding_quality_gate(enrichment, candidates)
    enriched_grouping = merge_enrichment(spatial_grouping, grounded_enrichment, candidates)
    proposal, artifact = build_grouped_slide_artifact(
        enriched_grouping,
        page,
        slide_alias=slide_alias,
    )
    mappings = map_deck_anchors({"pages": [artifact]}, anchors) if anchors else []
    final_regions = {str(region["alias"]): region for region in artifact["regions"]}
    pin_semantic_analyses = []
    pin_semantic_quality_warnings = []
    for descriptor, response in zip(pin_request_descriptors, pin_responses):
        question_alias, region_alias = descriptor
        validated_pin = validate_pin_semantic_analysis(
            response,
            question_alias=question_alias,
            region_alias=region_alias,
        )
        question, _ = redact_text(str(anchors_by_alias[question_alias].get("question") or ""))
        grounded_pin, warning = apply_pin_semantic_quality_gate(
            validated_pin,
            question_text=question,
            region_summary=str(final_regions[region_alias]["summary"]),
        )
        pin_semantic_analyses.append(grounded_pin)
        if warning:
            pin_semantic_quality_warnings.append(
                {"questionAlias": question_alias, "regionAlias": region_alias, "reason": warning}
            )
    result = {
        "schemaVersion": "local-semantic-grouping-run.v1",
        "evaluationOnly": True,
        "model": model_profile,
        "pipelineVersion": GROUPING_PIPELINE_VERSION,
        "slideAlias": slide_alias,
        "baselineSourceSha256": page.get("sourceSha256"),
        "inputElementCount": len(page.get("regions") or []),
        "semanticRegionCount": len(artifact["regions"]),
        "ignoredElementCount": len(enriched_grouping["ignoredMemberAliases"]),
        "partitionRepairs": [],
        "metrics": metrics,
        "spatialCandidates": candidates,
        "semanticEnrichment": grounded_enrichment,
        "semanticQualityWarnings": quality_warnings,
        "grouping": enriched_grouping,
        "trustedProposal": proposal,
        "artifact": artifact,
        "pinMappings": mappings,
        "pinSemanticAnalyses": pin_semantic_analyses,
        "pinSemanticQualityWarnings": pin_semantic_quality_warnings,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(output_path),
                "semanticRegionCount": result["semanticRegionCount"],
                "ignoredElementCount": result["ignoredElementCount"],
                "partitionRepairCount": 0,
                "pinMappingCount": len(mappings),
                **metrics,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
