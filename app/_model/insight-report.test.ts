import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInsightReport, type InsightReportBody } from "./insight-report.ts";

test("duplicate hotspot pages keep distinct reasons and rank, and the five-slide limit follows deduplication", () => {
  const body: InsightReportBody = { schemaVersion: 2, model: "test", slides: [], questions: [], groups: [],
    overall: { summary: "요약", suggestions: ["제안"], hotspots: [
      { page: 2, reason: "비교 기준" }, { page: 1, reason: "용어 설명" },
      { page: 2, reason: "단위 설명" }, { page: 2, reason: "비교 기준" },
      ...[3, 4, 5, 6].map((page) => ({ page, reason: `설명 ${page}` })),
    ] } };
  const before = structuredClone(body);
  const result = normalizeInsightReport(body);
  assert.deepEqual(result.overall.hotspots, [
    { page: 2, reason: "비교 기준\n단위 설명" }, { page: 1, reason: "용어 설명" },
    ...[3, 4, 5].map((page) => ({ page, reason: `설명 ${page}` })),
  ]);
  assert.equal(new Set(result.overall.hotspots.map((item) => item.page)).size, result.overall.hotspots.length);
  assert.deepEqual(body, before);
  assert.deepEqual(normalizeInsightReport(result), result);
  assert.deepEqual(normalizeInsightReport({ ...body, overall: { ...body.overall, hotspots: [] } }).overall.hotspots, []);
});
