import assert from "node:assert/strict";
import test from "node:test";
import { exportSections, lectureSpan, rememberView } from "./insight-dashboard.ts";

const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const q = (seconds: number) => ({ createdAt: at(seconds) });

test("강의 구간은 시작 없으면 null, 종료 없으면 마지막 질문까지다", () => {
  assert.equal(lectureSpan(null, at(60), []), null);
  assert.deepEqual(lectureSpan(at(0), at(300), [q(900)]), { start: T0, end: T0 + 300_000 });
  assert.deepEqual(lectureSpan(at(0), null, [q(90), q(30)]), { start: T0, end: T0 + 90_000 });
  assert.deepEqual(lectureSpan(at(0), null, []), { start: T0, end: T0 });
});

test("내보내기 구역은 한도를 넘으면 줄 단위로 (2), (3)에 이어 쓴다", () => {
  assert.deepEqual(exportSections("질문", ["aaaa", "bbbb", "cc"], 10), [{ title: "질문", text: "aaaa\nbbbb" }, { title: "질문 (2)", text: "cc" }]);
  assert.deepEqual(exportSections("요약", [], 10), [{ title: "요약", text: "" }]);
  assert.deepEqual(exportSections("긴 줄", ["x".repeat(12)], 10), [{ title: "긴 줄", text: "x".repeat(10) }]);
});

test("최근 연 분석은 다시 열면 시각만 바뀌고 최신 20개만 남는다", () => {
  const viewed = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`l${i}`, at(i)]));
  const next = rememberView(viewed, "new", at(100));
  assert.equal(Object.keys(next).length, 20);
  assert.equal(next.new, at(100));
  assert.equal(next.l0, undefined);
  assert.deepEqual(rememberView({ a: at(1), b: at(2) }, "a", at(3)), { a: at(3), b: at(2) });
});
