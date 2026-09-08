import assert from "node:assert/strict";
import test from "node:test";
import {
  aiReportProductStatus,
  aiReportProgressPercent,
  aiReportSelectionKind,
  normalizeAiReportMaterialIds,
} from "./ai-report.ts";

const A = "3373b744-a42f-4e89-b71e-07ffe1b3b245";
const B = "2373b744-a42f-4e89-b71e-07ffe1b3b245";

test("AI report material selection is validated, deduplicated, and deterministic", () => {
  assert.deepEqual(normalizeAiReportMaterialIds([A.toUpperCase(), B, A]), [B, A]);
  assert.throws(() => normalizeAiReportMaterialIds([]));
  assert.throws(() => normalizeAiReportMaterialIds(["../not-a-uuid"]));
});

test("internal worker stages collapse to the approved product status", () => {
  assert.equal(aiReportProductStatus("queued"), "queued");
  assert.equal(aiReportProductStatus("preparing"), "analyzing");
  assert.equal(aiReportProductStatus("criticizing"), "analyzing");
  assert.equal(aiReportProductStatus("ready"), "ready");
});

test("report progress and selection labels remain bounded", () => {
  assert.equal(aiReportProgressPercent(4, 10), 40);
  assert.equal(aiReportProgressPercent(12, 10), 100);
  assert.equal(aiReportProgressPercent(0, 0), 0);
  assert.equal(aiReportSelectionKind(1, false), "material");
  assert.equal(aiReportSelectionKind(2, false), "materials");
  assert.equal(aiReportSelectionKind(2, true), "folder");
});
