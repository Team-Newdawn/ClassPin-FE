import assert from "node:assert/strict";
import test from "node:test";
import { audienceSeries, keywords, lectureSpan, pinsPerMinute, slideIntervals, slideStats, slideTimeline, type DashboardQuestion } from "./insight-dashboard.ts";

const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const q = (id: string, slideIndex: number, seconds: number, pinned = true, reactionCount = 0, text = ""): DashboardQuestion => ({
  id, slideIndex, x: pinned ? 0.5 : null, y: pinned ? 0.5 : null, text, reactionCount, createdAt: at(seconds)
});

test("강의 구간은 시작 없으면 null, 종료 없으면 마지막 질문까지다", () => {
  assert.equal(lectureSpan(null, at(60), []), null);
  assert.deepEqual(lectureSpan(at(0), at(300), [q("a", 0, 900)]), { start: T0, end: T0 + 300_000 });
  assert.deepEqual(lectureSpan(at(0), null, [q("a", 0, 90), q("b", 0, 30)]), { start: T0, end: T0 + 90_000 });
  assert.deepEqual(lectureSpan(at(0), null, []), { start: T0, end: T0 });
});

test("분당 PIN은 위치 있는 구간 안 질문만 세고 끝 시각은 마지막 분에 넣는다", () => {
  const span = { start: T0, end: T0 + 180_000 };
  const result = pinsPerMinute([q("a", 0, 10), q("b", 0, 70, false), q("c", 1, 75), q("d", 0, 180), q("e", 0, -5), q("f", 0, 400)], span);
  assert.deepEqual(result, [{ minute: 0, pins: 1 }, { minute: 1, pins: 1 }, { minute: 2, pins: 1 }]);
  assert.deepEqual(pinsPerMinute([q("a", 0, 0)], { start: T0, end: T0 }), [{ minute: 0, pins: 1 }]);
});

test("참여자 표본은 구간 안만 분으로 옮겨 시간순으로 낸다", () => {
  const span = { start: T0, end: T0 + 120_000 };
  const samples = [{ at: at(70), audience: 5, slide: 2 }, { at: at(-10), audience: 1, slide: 1 }, { at: at(10), audience: 3, slide: 1 }];
  assert.deepEqual(audienceSeries(samples, span), [{ minute: 0, audience: 3, slide: 1 }, { minute: 1, audience: 5, slide: 2 }]);
});

test("슬라이드 구간은 전환을 구간으로 자르고 전환이 없으면 표본으로 근사한다", () => {
  const span = { start: T0, end: T0 + 300_000 };
  const changes = [{ at: at(120), slide: 2 }, { at: at(-30), slide: 1 }, { at: at(200), slide: 1 }, { at: at(400), slide: 3 }];
  assert.deepEqual(slideIntervals(changes, [], span), [
    { slide: 1, start: T0, end: T0 + 120_000 },
    { slide: 2, start: T0 + 120_000, end: T0 + 200_000 },
    { slide: 1, start: T0 + 200_000, end: T0 + 300_000 }
  ]);
  const samples = [{ at: at(0), audience: 2, slide: 1 }, { at: at(60), audience: 3, slide: 2 }];
  assert.deepEqual(slideIntervals([], samples, span), [
    { slide: 1, start: T0, end: T0 + 60_000 },
    { slide: 2, start: T0 + 60_000, end: T0 + 300_000 }
  ]);
  assert.deepEqual(slideIntervals([], [], span), []);
});

test("슬라이드 통계는 노출 시간 0이면 분당 PIN을 내지 않는다", () => {
  const intervals = [{ slide: 1, start: T0, end: T0 + 60_000 }, { slide: 2, start: T0 + 60_000, end: T0 + 150_000 }, { slide: 1, start: T0 + 150_000, end: T0 + 180_000 }];
  const stats = slideStats(3, [q("a", 0, 10, true, 2), q("b", 0, 20, false, 1), q("c", 1, 70, true, 0), q("d", 1, 80), q("e", 2, 90, true, 4)], intervals);
  assert.deepEqual(stats, [
    { slide: 1, seconds: 90, pins: 1, reactions: 3, pinsPerMinute: 0.67 },
    { slide: 2, seconds: 90, pins: 2, reactions: 0, pinsPerMinute: 1.33 },
    { slide: 3, seconds: 0, pins: 1, reactions: 4, pinsPerMinute: null }
  ]);
});

test("슬라이드 타임라인은 그 슬라이드가 보인 분의 참여자와 PIN을 낸다", () => {
  const span = { start: T0, end: T0 + 240_000 };
  const intervals = [{ slide: 2, start: T0 + 30_000, end: T0 + 120_000 }, { slide: 1, start: T0 + 120_000, end: T0 + 180_000 }, { slide: 2, start: T0 + 180_000, end: T0 + 240_000 }];
  const samples = [{ at: at(0), audience: 4, slide: 1 }, { at: at(60), audience: 6, slide: 2 }, { at: at(240), audience: 7, slide: 2 }];
  const questions = [q("a", 1, 40), q("b", 1, 50), q("c", 1, 65, false), q("d", 0, 70), q("e", 1, 240)];
  assert.deepEqual(slideTimeline(2, intervals, samples, questions, span), [
    { minute: 0, audience: 4, pins: 2 },
    { minute: 1, audience: 6, pins: 0 },
    { minute: 3, audience: 7, pins: 1 }
  ]);
  assert.deepEqual(slideTimeline(3, intervals, samples, questions, span), []);
});

test("키워드는 조사를 떼고 불용어·한 글자·숫자를 빼며 동률은 먼저 나온 순서다", () => {
  const result = keywords([
    "행렬에서 역행렬은 어떻게 구하나요?",
    "The matrix 역행렬을 왜 써요 123 2024",
    "Matrix와 벡터의 차이, 그리고 행렬이 뭐예요",
    "수 좀 더 설명 왜요 있나요 이것"
  ]);
  assert.deepEqual(result.slice(0, 3), [{ word: "행렬", count: 2 }, { word: "역행렬", count: 2 }, { word: "matrix", count: 2 }]);
  const words = result.map((entry) => entry.word);
  for (const dropped of ["어떻게", "the", "왜", "123", "2024", "그리고", "수", "좀", "왜요", "있나요", "이것"]) assert.ok(!words.includes(dropped), dropped);
  assert.ok(words.includes("벡터") && words.includes("설명"));
  assert.deepEqual(keywords(["에서 강의"]), [{ word: "에서", count: 1 }, { word: "강의", count: 1 }]);
  assert.equal(keywords(["가나 다라 마바", "가나"], 1).length, 1);
});

test("slide rate counts only PINs of this LIVE run when a span is given; keywords drop question endings and plurals", () => {
  const span = { start: Date.parse("2026-10-29T01:00:00Z"), end: Date.parse("2026-10-29T01:10:00Z") };
  const q = (id: string, createdAt: string) => ({ id, slideIndex: 0, x: 0.5, y: 0.5, text: "", reactionCount: 0, createdAt });
  const questions = [q("old", "2026-10-15T01:00:00Z"), q("now", "2026-10-29T01:05:00Z")];
  const intervals = [{ slide: 1, start: span.start, end: span.start + 120_000 }];
  assert.deepEqual(slideStats(1, questions, intervals, span).map((row) => [row.pins, row.pinsPerMinute]), [[2, 0.5]]);
  assert.deepEqual(slideStats(1, questions, intervals).map((row) => row.pinsPerMinute), [1]);
  assert.deepEqual(keywords(["판단 기준이 무엇인지 궁금해요", "영역들을 어떻게 나눌 건가요?", "영역 기준은?"]).map((k) => k.word).slice(0, 3), ["기준", "영역", "판단"]);
});

test("keywords drop verb and question forms and keep the noun of 'X한'", () => {
  const words = keywords(["185억은 어떻게 측정한 수치인가요?", "근거가 있을까요? 설명해주세요", "명확한 근거라는 것을 알 수 있나", "수치에 대한 근거"]).map((k) => k.word);
  assert.deepEqual(words.slice(0, 2), ["근거", "수치"]);
  for (const noise of ["있을까", "라는", "근거라", "대한", "것을", "있나"]) assert.ok(!words.includes(noise), noise);
  assert.ok(words.includes("측정") && words.includes("명확"));
});
