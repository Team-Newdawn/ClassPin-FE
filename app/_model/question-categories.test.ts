import assert from "node:assert/strict";
import test from "node:test";
import { categoryBreakdown } from "./stats.ts";
import {
  defaultQuestionCategorySettings,
  enabledQuestionCategories,
  isValidQuestionCategorySettings,
  normalizeQuestionCategorySettings,
  questionCategoryClass,
  questionCategoryLabel,
  type Question
} from "./types.ts";

test("legacy 피드백과 커스텀 카테고리를 정규화해 활성 목록을 보존한다", () => {
  const settings = normalizeQuestionCategorySettings({
    praise: { label: "", enabled: true, archived: false },
    "custom-speed": { label: "진행 속도", enabled: true, archived: false },
    hidden: { label: "숨김", enabled: false, archived: false }
  });

  assert.deepEqual(enabledQuestionCategories(settings), ["praise", "custom-speed"]);
  assert.equal(questionCategoryLabel(settings, "custom-speed", (key) => key), "진행 속도");
  assert.equal(questionCategoryClass(settings, "praise"), "praise");
  assert.equal(questionCategoryClass(settings, "custom-speed"), "custom-0");
  assert.equal(isValidQuestionCategorySettings(settings), true);
});

test("활성 카테고리가 없으면 기본 질문 카테고리를 복구한다", () => {
  const settings = normalizeQuestionCategorySettings({
    retired: { label: "종료", enabled: false, archived: true }
  });

  assert.deepEqual(enabledQuestionCategories(settings), Object.keys(defaultQuestionCategorySettings()));
});

test("카테고리 통계는 고정 목록 밖의 질문도 집계한다", () => {
  const base: Question = {
    id: "question-1",
    sessionId: "session-1",
    slideIndex: 0,
    x: 0.5,
    y: 0.5,
    category: "custom-speed",
    marker: "idea",
    text: "조금 빠릅니다",
    status: "unanswered",
    isMine: false,
    reactionCount: 0,
    reactedByMe: false,
    createdAt: "2026-08-19T00:00:00.000Z"
  };

  assert.deepEqual(categoryBreakdown([base, { ...base, id: "question-2" }], (key) => key), [
    { key: "custom-speed", label: "custom-speed", count: 2 }
  ]);
});
