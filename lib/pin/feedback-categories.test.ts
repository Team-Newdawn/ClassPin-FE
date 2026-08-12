import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptsFeedbackCategory,
  analyzedFeedbackCategories,
  configuredFeedbackCategories,
  configuredFeedbackCategoryLabel,
  defaultFeedbackCategorySettings,
  enabledFeedbackCategories,
  isValidFeedbackCategorySettings,
  normalizeFeedbackCategorySettings,
  type FeedbackPin,
} from "./types.ts";

const pin = (category: FeedbackPin["category"]): FeedbackPin => ({
  id: String(category),
  campaignId: "campaign",
  authorId: null,
  pageIndex: 0,
  x: 0.5,
  y: 0.5,
  category,
  body: "feedback",
  hidden: false,
  createdAt: "2026-08-08T00:00:00.000Z",
});

test("DB 카테고리 설정은 동적 키와 길이 제한으로 정규화한다", () => {
  const settings = normalizeFeedbackCategorySettings({
    praise: { label: "  칭찬  ", enabled: false },
    "custom-event": { label: "  행사 운영  ", enabled: true },
    "INVALID KEY": { label: "제외", enabled: true },
  });

  assert.deepEqual(settings.praise, { label: "칭찬", enabled: false, archived: false });
  assert.deepEqual(settings["custom-event"], { label: "행사 운영", enabled: true, archived: false });
  assert.equal(settings["INVALID KEY"], undefined);
  assert.deepEqual(enabledFeedbackCategories(settings), ["custom-event"]);
  assert.deepEqual(normalizeFeedbackCategorySettings(null), defaultFeedbackCategorySettings());
  assert.deepEqual(enabledFeedbackCategories(defaultFeedbackCategorySettings()), ["praise", "improve", "confusing", "bug", "idea"]);
});

test("카테고리가 하나도 없으면 null 카테고리의 본문 응답만 허용한다", () => {
  const settings = normalizeFeedbackCategorySettings({});

  assert.deepEqual(settings, {});
  assert.equal(isValidFeedbackCategorySettings(settings), true);
  assert.equal(acceptsFeedbackCategory(settings, null), true);
  assert.equal(acceptsFeedbackCategory(settings, "praise"), false);
});

test("동적 카테고리는 추가할 수 있고 이름·활성 상태를 검증한다", () => {
  const settings = { "custom-session": { label: "세션 운영", enabled: true, archived: false } };

  assert.equal(isValidFeedbackCategorySettings(settings), true);
  assert.equal(acceptsFeedbackCategory(settings, "custom-session"), true);
  assert.equal(acceptsFeedbackCategory(settings, null), false);
  assert.equal(isValidFeedbackCategorySettings({ "custom-session": { label: "", enabled: true, archived: false } }), false);
  assert.equal(isValidFeedbackCategorySettings(Object.fromEntries(
    Array.from({ length: 21 }, (_, index) => [`custom-${index}`, { label: `Category ${index}`, enabled: false, archived: false }])
  )), false);
});

test("삭제한 카테고리와 카테고리 없는 과거 응답도 관리자 분석에 남긴다", () => {
  const settings = {
    bug: { label: "기능 문제", enabled: false, archived: true },
    idea: { label: "", enabled: false, archived: false },
  };
  const pins = [pin("bug"), pin(null), pin("custom-deleted")];
  const categories = analyzedFeedbackCategories(settings, pins);

  assert.equal(configuredFeedbackCategoryLabel(settings, "bug", () => "오류"), "기능 문제");
  assert.deepEqual(configuredFeedbackCategories(settings), ["idea"]);
  assert.deepEqual(categories, ["bug", null, "custom-deleted"]);
});
