import assert from "node:assert/strict";
import test from "node:test";
import { initialEmpathyCounts, receivedEmpathyCount, withPinReaction } from "./empathy.ts";
import type { FeedbackPin } from "./types.ts";

const pin = (values: Partial<FeedbackPin> = {}): FeedbackPin => ({
  id: "pin-1",
  campaignId: "campaign-1",
  pageIndex: 0,
  authorId: "author-1",
  x: 0.5,
  y: 0.5,
  category: "praise",
  body: "좋아요",
  marker: "pin",
  reactionCount: 2,
  reactedByMe: false,
  hidden: false,
  createdAt: "2026-08-13T00:00:00.000Z",
  ...values,
});

test("공감 토글은 내 상태가 실제로 바뀔 때만 수를 한 번 조정한다", () => {
  const reacted = withPinReaction(pin(), true);
  assert.equal(reacted.reactionCount, 3);
  assert.equal(withPinReaction(reacted, true), reacted);
  assert.equal(withPinReaction(reacted, false).reactionCount, 2);
});

test("열린 화면에서는 기존 PIN의 증가분과 새 PIN이 이미 받은 공감을 합친다", () => {
  const previous = new Map([["pin-1", 2], ["pin-2", 5], ["other", 1]]);
  const pins = [
    { id: "pin-1", reactionCount: 4 },
    { id: "pin-2", reactionCount: 3 },
    { id: "pin-3", reactionCount: 7 },
    { id: "other", reactionCount: 8 },
  ];
  assert.equal(receivedEmpathyCount(previous, pins, new Set(["pin-1", "pin-2", "pin-3"])), 9);
});

test("최초 기준값은 기존 숨김 PIN을 보존하고 새 내 PIN은 0부터 계산한다", () => {
  const counts = initialEmpathyCounts(
    [{ id: "hidden-existing", reactionCount: 4 }],
    [{ id: "hidden-existing", reactionCount: 4 }, { id: "new-own", reactionCount: 1 }],
    [{ id: "new-own", reactionCount: 1 }, { id: "other", reactionCount: 7 }],
  );

  assert.deepEqual([...counts], [["hidden-existing", 4], ["other", 7]]);
});
