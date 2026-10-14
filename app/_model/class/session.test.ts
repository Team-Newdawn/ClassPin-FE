import assert from "node:assert/strict";
import test from "node:test";
import { defaultQuestionCategorySettings, type ClassSession } from "../types.ts";
import { formatElapsed, normalizeSessions, serializeSessionsForFailureCache } from "./session.ts";

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
