import assert from "node:assert/strict";
import test from "node:test";
import { buildReportSignals } from "./report.ts";
import type { FeedbackPin } from "./types.ts";

const pin = (id: string, category: FeedbackPin["category"], pageIndex: number, hidden = false): FeedbackPin => ({
  id,
  campaignId: "campaign",
  authorId: null,
  pageIndex,
  x: 0.5,
  y: 0.5,
  category,
  body: id,
  hidden,
  createdAt: "2026-08-08T00:00:00.000Z",
});

test("리포트 개선 신호는 숨긴 의견을 빼고 오류부터 정렬한다", () => {
  const signals = buildReportSignals([
    pin("idea", "idea", 2),
    pin("bug-a", "bug", 1),
    pin("bug-b", "bug", 0),
    pin("hidden-bug", "bug", 3, true),
    pin("praise", "praise", 0),
  ]);

  assert.deepEqual(signals.map(({ key }) => key), ["bug", "idea"]);
  assert.equal(signals[0].share, 50);
  assert.deepEqual(signals[0].pins.map(({ id }) => id), ["bug-a", "bug-b"]);
});
