import assert from "node:assert/strict";
import test from "node:test";
import { defaultQuestionCategorySettings, type ClassSession } from "../core/types.ts";
import { formatElapsed, normalizeSessions, patchSession, serializeSessionsForFailureCache } from "./session.ts";

const session = (id: string): ClassSession => ({
  id,
  folderId: null,
  code: id,
  title: id,
  fileName: `${id}.pdf`,
  status: "live",
  currentSlide: 0,
  presentationInteractions: true,
  presentationAutoplay: false,
  showQuestionPins: true,
  showPresentationQr: true,
  presentationQrPosition: "bottom-right",
  allowQuestionReactions: true,
  allowEmojiReactions: true,
  startedAt: null,
  questionCategories: defaultQuestionCategorySettings(),
  createdAt: "2026-08-29T00:00:00.000Z",
  slides: [],
  questions: []
});

test("기존 저장본은 자동 넘김을 끈 상태로 정규화한다", () => {
  const legacy = { ...session("legacy") } as Partial<ClassSession>;
  delete legacy.presentationAutoplay;
  assert.equal(normalizeSessions([legacy as ClassSession])[0].presentationAutoplay, false);
});

test("Supabase 실패 캐시에는 발표자 메모를 직렬화하지 않는다", () => {
  const source = session("private-note");
  source.slides = [{ id: "slide", pageIndex: 0, title: "Slide 1", speakerNote: "owner only" }];
  const cached = serializeSessionsForFailureCache([source]);
  assert.doesNotMatch(cached, /speakerNote|owner only/);
});

test("세션 중복을 제거하고 이미 정규화된 배열은 그대로 반환한다", () => {
  const list = [session("one")];
  assert.equal(normalizeSessions(list), list);
  assert.deepEqual(normalizeSessions([list[0], session("one"), session("two")]).map(({ id }) => id), ["one", "two"]);
});

test("LIVE 경과 시간은 한 시간 전까지 mm:ss, 이후 h:mm:ss 이고 음수는 0이다", () => {
  assert.deepEqual([5_000, 3_599_999, 3_723_000, -2_000].map(formatElapsed), ["00:05", "59:59", "1:02:03", "00:00"]);
});

test("같은 내용의 재조회는 같은 배열을 돌려주고, 바뀐 강의만 새 객체로 바꾼다", () => {
  const live = { ...session("live"), questions: [{ id: "q", slideIndex: 0, text: "왜?", reactionCount: 1 }] } as ClassSession;
  const other = session("other");
  const sessions = [other, live];
  // 5초 재조회처럼 내용은 같고 객체만 새로 만든 경우
  assert.equal(patchSession(sessions, "live", (item) => ({ ...item, questions: item.questions.map((q) => ({ ...q })) })), sessions);
  assert.equal(patchSession(sessions, "missing", (item) => ({ ...item, title: "x" })), sessions);

  const moved = patchSession(sessions, "live", (item) => ({ ...item, currentSlide: 2 }));
  assert.notEqual(moved, sessions);
  assert.equal(moved[0], other, "다른 강의 객체는 그대로 둔다");
  assert.equal(moved[1].currentSlide, 2);
  const reacted = patchSession(sessions, "live", (item) => ({ ...item, questions: [{ ...item.questions[0], reactionCount: 2 }] }));
  assert.equal(reacted[1].questions[0].reactionCount, 2, "질문 안의 값이 바뀌어도 알아챈다");
});
