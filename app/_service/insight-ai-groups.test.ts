import assert from "node:assert/strict";
import test from "node:test";
import { groupQuestions, questionGroups, translateForDashboard, type InsightAi } from "./insight-ai.ts";

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

const fake = (answer: unknown, seen: unknown[] = []): InsightAi => ({ name: "fake", model: () => "fake", configured: () => true, imageEdge: () => 100,
  async json({ content }) { seen.push(content); return answer; }, async* chat() { yield ""; } });

test("RPT-121: 질문 묶기는 실제 슬라이드 번호로 보내고, 질문이 없으면 AI를 부르지 않는다", async () => {
  const seen: unknown[] = [];
  const groups = await groupQuestions(fake({ groups: [{ title: "출처", summary: "근거", questions: [1] }] }, seen), [{ id: "q1", text: "출처는?", page: 7 }]);
  assert.deepEqual(groups, [{ title: "출처", summary: "근거", questionIds: ["q1"] }]);
  assert.match(JSON.stringify(seen), /1\. \[슬라이드 7\] 출처는\?/);
  assert.deepEqual(await groupQuestions(fake(null, seen), []), []);
  assert.equal(seen.length, 1);
});

test("RPT-122: 대시보드 영어는 번호로 원래 항목에 붙고, 빠지거나 빈 번역은 한국어로 남는다", async () => {
  const en = await translateForDashboard(fake({ groups: [{ n: 2, title: "Sources", summary: "" }, { n: 9, title: "x", summary: "x" }], slides: [{ n: 1, summary: "Asks for the source" }, { n: 2, summary: " " }] }),
    { groups: [{ title: "개념", summary: "뜻" }, { title: "출처", summary: "근거" }],
      slides: [{ slideId: "s1", questionSummary: "출처를 묻는다" }, { slideId: "s2", questionSummary: "" }, { slideId: "s3", questionSummary: "기준을 묻는다" }] });
  assert.deepEqual(en, { groups: [{ title: "개념", summary: "뜻" }, { title: "Sources", summary: "근거" }], slides: [{ slideId: "s1", summary: "Asks for the source" }] });
  assert.deepEqual(await translateForDashboard(fake(null), { groups: [], slides: [] }), { groups: [], slides: [] });
});
