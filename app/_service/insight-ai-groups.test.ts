import assert from "node:assert/strict";
import test from "node:test";
import { questionGroups } from "./insight-ai.ts";

test("질문 묶음은 번호를 id로 바꾸고, 중복·범위 밖 번호는 버리며, 빠진 질문은 기타로 모은다", () => {
  const questions = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(questionGroups([
    { title: "출처", summary: "근거", questions: [1, 2, 9, 1.5] },
    { title: "중복", summary: "", questions: [2] },
    { title: "", summary: "제목 없음", questions: [3] },
  ], questions), [
    { title: "출처", summary: "근거", questionIds: ["a", "b"] },
    { title: "기타 질문", summary: "", questionIds: ["c", "d"] },
  ]);
  assert.deepEqual(questionGroups("not a list", [{ id: "a" }]), [{ title: "기타 질문", summary: "", questionIds: ["a"] }]);
});
