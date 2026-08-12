import assert from "node:assert/strict";
import test from "node:test";
import { feedbackPinMarkerEmoji, normalizeFeedbackPinMarker, normalizeFeedbackPinReactionCount } from "./types.ts";

test("DB의 PIN 모양과 공감 수는 허용된 값만 복원한다", () => {
  assert.equal(normalizeFeedbackPinMarker("smile"), "smile");
  assert.equal(normalizeFeedbackPinMarker("unknown"), "pin");
  assert.equal(normalizeFeedbackPinReactionCount("5"), 5);
  assert.equal(normalizeFeedbackPinReactionCount(-1), 0);
  assert.equal(normalizeFeedbackPinReactionCount(1.5), 0);
  assert.equal(feedbackPinMarkerEmoji("pin"), null);
  assert.equal(feedbackPinMarkerEmoji("question"), "❓");
  assert.equal(feedbackPinMarkerEmoji("smile"), "🙂");
  assert.equal(feedbackPinMarkerEmoji("idea"), "💡");
});
