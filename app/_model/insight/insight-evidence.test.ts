import assert from "node:assert/strict";
import test from "node:test";
import { insightCrop, prepareInsightEvidence } from "./insight-evidence.ts";
import type { InsightQuestion } from "./insight-evidence.ts";

const question = (id: string, overrides: Partial<InsightQuestion> = {}): InsightQuestion => ({
  id, slideId: "s1", anchor: { kind: "point", x: 0.51, y: 0.51 },
  status: "unanswered", reactions: 0, answerCount: 0, ...overrides,
});


test("crop preserves source anchors and handles all image edges, box, path and missing coordinates", () => {
  assert.deepEqual(insightCrop(null), null);
  assert.deepEqual(insightCrop({ kind: "point", x: 0, y: 0 }), { left: 0, top: 0, right: 0.4, bottom: 0.4 });
  assert.deepEqual(insightCrop({ kind: "point", x: 1, y: 1 }), { left: 0.6, top: 0.6, right: 1, bottom: 1 });
  const box = { kind: "box" as const, x: 0.2, y: 0.3, width: 0.5, height: 0.2 };
  const before = structuredClone(box);
  const crop = insightCrop(box)!;
  assert.ok(Math.abs(crop.left - 0.1) < 1e-10);
  assert.ok(Math.abs(crop.right - 0.8) < 1e-10);
  assert.ok(Math.abs(crop.bottom - crop.top - 0.4) < 1e-10);
  assert.deepEqual(box, before);
  assert.deepEqual(insightCrop({ kind: "path", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
    { left: 0, top: 0, right: 1, bottom: 1 });
  for (const x of [-0.01, 1.01, NaN, Infinity]) assert.throws(() => insightCrop({ kind: "point", x, y: 0.5 }));
  assert.throws(() => insightCrop({ kind: "box", x: 0.8, y: 0.2, width: 0.3, height: 0.1 }));
  assert.throws(() => insightCrop({ kind: "box", x: 0, y: 0, width: 0, height: 0.1 }));
  assert.throws(() => insightCrop({ kind: "path", points: [] }));
});

test("snapshot references and metrics reject corrupt input; empty slides remain present", () => {
  const questions = [question("q1", { reactions: 8, answerCount: 3 }), question("q2", { status: "resolved", anchor: null })];
  const result = prepareInsightEvidence(["s2", "s1"], questions);
  assert.deepEqual(result[0].metrics, { questions: 2, positioned: 1, unanswered: 1, answered: 0, resolved: 1, reactions: 8, answers: 3 });
  assert.equal(result[1].metrics.questions, 0);
  assert.deepEqual(result, prepareInsightEvidence(["s1", "s2"], [...questions].reverse()));
  assert.throws(() => prepareInsightEvidence(["s1", "s1"], []));
  assert.throws(() => prepareInsightEvidence(["s1"], [question("q1", { slideId: "deleted" })]));
  assert.throws(() => prepareInsightEvidence(["s1"], [question("q1"), question("q1")]));
  for (const reactions of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => prepareInsightEvidence(["s1"], [question("q1", { reactions })]));
  }
  assert.throws(() => prepareInsightEvidence(["s1"], [question("q1", { reactions: Number.MAX_SAFE_INTEGER }), question("q2", { reactions: 1 })]));
  assert.throws(() => prepareInsightEvidence(["s1"], Array.from({ length: 101 }, (_, i) => question(`q${i}`))));
});
