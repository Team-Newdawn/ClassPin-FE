import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultQuestionCategorySettings,
  enabledQuestionCategories,
  normalizeQuestionCategorySettings,
  questionCategoryLabel
} from "./types.ts";

test("legacy 피드백과 커스텀 카테고리를 정규화해 활성 목록을 보존한다", () => {
  const settings = normalizeQuestionCategorySettings({
    praise: { label: "", enabled: true, archived: false },
    "custom-speed": { label: "진행 속도", enabled: true, archived: false },
    hidden: { label: "숨김", enabled: false, archived: false }
  });

  assert.deepEqual(enabledQuestionCategories(settings), ["praise", "custom-speed"]);
  assert.equal(questionCategoryLabel(settings, "custom-speed", (key) => key), "진행 속도");
});

test("활성 카테고리가 없으면 기본 질문 카테고리를 복구한다", () => {
  const settings = normalizeQuestionCategorySettings({
    retired: { label: "종료", enabled: false, archived: true }
  });

  assert.deepEqual(enabledQuestionCategories(settings), Object.keys(defaultQuestionCategorySettings()));
});
