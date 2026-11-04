import assert from "node:assert/strict";
import test from "node:test";
import { questionGroups, slideSummaries } from "./insight-ai.ts";

test("질문 묶음은 번호를 id로 바꾸고, 중복·범위 밖 번호는 버리며, 빠진 질문은 기타로 모은다", () => {
  const questions = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(questionGroups([
    { title: "출처", summary: "근거", title_en: "Sources", summary_en: "Evidence", questions: [1, 2, 9, 1.5] },
    { title: "중복", summary: "", questions: [2] },
    { title: "", summary: "제목 없음", questions: [3] },
  ], questions), [
    { title: "출처", summary: "근거", questionIds: ["a", "b"], en: { title: "Sources", summary: "Evidence" } },
    { title: "기타 질문", summary: "", questionIds: ["c", "d"], en: { title: "Other questions", summary: "" } },
  ]);
  assert.deepEqual(questionGroups("not a list", [{ id: "a" }]), [{ title: "기타 질문", summary: "", questionIds: ["a"], en: { title: "Other questions", summary: "" } }]);
});

test("슬라이드 분석은 번호를 슬라이드 id로 바꾸고, 범위 밖·중복·빈 요약은 버린다", () => {
  assert.deepEqual(slideSummaries([
    { slide: 2, summary: "출처를 묻는다", summary_en: "Asks for sources" }, { slide: 2, summary: "중복" }, { slide: 3, summary: "범위 밖" }, { slide: 1, summary: " " }, { slide: 1.5, summary: "소수" },
  ], ["s1", "s2"]), [{ slideId: "s2", summary: "출처를 묻는다", en: "Asks for sources" }]);
  assert.deepEqual(slideSummaries(null, ["s1"]), []);
});
