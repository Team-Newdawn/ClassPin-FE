import assert from "node:assert/strict";
import test from "node:test";
import { questionsByEmpathy, questionsByNewest, withQuestionReaction } from "./question-reactions.ts";
import type { Question } from "./types.ts";

const question = (values: Partial<Question> = {}): Question => ({
  id: "question-1",
  sessionId: "session-1",
  slideIndex: 0,
  x: 0.5,
  y: 0.5,
  category: "concept",
  marker: "pin",
  text: "질문",
  status: "unanswered",
  isMine: false,
  reactionCount: 2,
  reactedByMe: false,
  createdAt: "2026-08-18T00:00:00.000Z",
  ...values,
});

test("공감 desired state는 상태가 실제로 바뀔 때만 수를 한 번 조정한다", () => {
  const reacted = withQuestionReaction(question(), true);
  assert.equal(reacted.reactionCount, 3);
  assert.equal(withQuestionReaction(reacted, true), reacted);
  assert.equal(withQuestionReaction(reacted, false).reactionCount, 2);
});

test("질문은 공감 수, 최신 작성 시각 순으로 계속 정렬된다", () => {
  const sorted = questionsByEmpathy([
    question({ id: "old-popular", reactionCount: 5, createdAt: "2026-08-17T00:00:00.000Z" }),
    question({ id: "new-popular", reactionCount: 5, createdAt: "2026-08-18T00:00:00.000Z" }),
    question({ id: "new", reactionCount: 1, createdAt: "2026-08-19T00:00:00.000Z" }),
  ]);

  assert.deepEqual(sorted.map(({ id }) => id), ["new-popular", "old-popular", "new"]);
});

test("최신순은 공감 수와 관계없이 작성 시각과 id로 결정된다", () => {
  const sorted = questionsByNewest([
    question({ id: "old-popular", reactionCount: 99, createdAt: "2026-08-17T00:00:00.000Z" }),
    question({ id: "new-b", reactionCount: 0, createdAt: "2026-08-19T00:00:00.000Z" }),
    question({ id: "new-a", reactionCount: 1, createdAt: "2026-08-19T00:00:00.000Z" }),
  ]);

  assert.deepEqual(sorted.map(({ id }) => id), ["new-a", "new-b", "old-popular"]);
});
