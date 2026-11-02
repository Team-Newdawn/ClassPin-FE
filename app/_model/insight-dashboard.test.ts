import assert from "node:assert/strict";
import test from "node:test";
import { exportSections, lectureSpan, participationCounts, questionFlow, rememberView } from "./insight-dashboard.ts";

const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const q = (seconds: number) => ({ createdAt: at(seconds) });

test("강의 구간은 시작 없으면 null, 종료 없으면 마지막 질문까지다", () => {
  assert.equal(lectureSpan(null, at(60), []), null);
  assert.deepEqual(lectureSpan(at(0), at(300), [q(900)]), { start: T0, end: T0 + 300_000 });
  assert.deepEqual(lectureSpan(at(0), null, [q(90), q(30)]), { start: T0, end: T0 + 90_000 });
  assert.deepEqual(lectureSpan(at(0), null, []), { start: T0, end: T0 });
});

test("시간대별 질문은 최대 6칸으로 나누고 구간 밖 질문은 빼며 끝 시각은 마지막 칸에 넣는다", () => {
  const flow = questionFlow([q(10), q(250), q(239), q(24 * 60), q(-5), q(25 * 60)], { start: T0, end: T0 + 24 * 60_000 });
  assert.equal(flow.size, 4);
  assert.deepEqual(flow.buckets.map((bucket) => [bucket.start, bucket.end, bucket.count]), [[0, 4, 2], [4, 8, 1], [8, 12, 0], [12, 16, 0], [16, 20, 0], [20, 24, 1]]);
  // 7 minutes → 2-minute buckets, the last one shorter.
  assert.deepEqual(questionFlow([], { start: T0, end: T0 + 7 * 60_000 }).buckets.map((bucket) => bucket.end), [2, 4, 6, 7]);
  assert.deepEqual(questionFlow([q(0)], { start: T0, end: T0 }).buckets, [{ start: 0, end: 1, count: 1 }]);
  // 5:00.033 is a 5-minute lecture; a question at its last moment lands in the last bucket.
  assert.deepEqual(questionFlow([q(300.033)], { start: T0, end: T0 + 300_033 }).buckets.map((bucket) => [bucket.end, bucket.count]), [[1, 0], [2, 0], [3, 0], [4, 0], [5, 1]]);
});

test("내보내기 구역은 한도를 넘으면 줄 단위로 (2), (3)에 이어 쓴다", () => {
  assert.deepEqual(exportSections("질문", ["aaaa", "bbbb", "cc"], 10), [{ title: "질문", text: "aaaa\nbbbb" }, { title: "질문 (2)", text: "cc" }]);
  assert.deepEqual(exportSections("요약", [], 10), [{ title: "요약", text: "" }]);
  assert.deepEqual(exportSections("긴 줄", ["x".repeat(12)], 10), [{ title: "긴 줄", text: "x".repeat(10) }]);
});

test("참여 집계는 행이 아니라 사람을 세고, 작성자 없는 질문은 빼며, 핀은 위치 있는 질문의 작성자만이다", () => {
  const questions = [{ authorId: "a", pinned: true }, { authorId: "a", pinned: false }, { authorId: "b", pinned: false }, { authorId: null, pinned: true }];
  assert.deepEqual(participationCounts(questions, ["c", "c", "b"]), { questionAuthors: 2, engaged: 3, reactorsOrPinAuthors: 3 });
  assert.deepEqual(participationCounts([], []), { questionAuthors: 0, engaged: 0, reactorsOrPinAuthors: 0 });
});

test("최근 연 분석은 다시 열면 시각만 바뀌고 최신 20개만 남는다", () => {
  const viewed = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`l${i}`, at(i)]));
  const next = rememberView(viewed, "new", at(100));
  assert.equal(Object.keys(next).length, 20);
  assert.equal(next.new, at(100));
  assert.equal(next.l0, undefined);
  assert.deepEqual(rememberView({ a: at(1), b: at(2) }, "a", at(3)), { a: at(3), b: at(2) });
});
