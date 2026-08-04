import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFeedbackRotation } from "./presentation-rotation.ts";

test("새 실시간 피드백을 지도와 설명 카드의 활성 항목으로 즉시 선택한다", () => {
  const result = reconcileFeedbackRotation({
    previousIds: ["old-a", "old-b"],
    visibleIds: ["new", "old-a", "old-b"],
    currentId: "old-a",
    random: () => 0
  });

  assert.equal(result.activeId, "new");
  assert.deepEqual(new Set(result.queue), new Set(["old-a", "old-b"]));
});

test("새 피드백이 없으면 현재 설명을 유지하고 남은 항목만 순환 큐에 넣는다", () => {
  const result = reconcileFeedbackRotation({
    previousIds: ["a", "b", "c"],
    visibleIds: ["a", "b", "c"],
    currentId: "b",
    random: () => 0
  });

  assert.equal(result.activeId, "b");
  assert.deepEqual(new Set(result.queue), new Set(["a", "c"]));
});
