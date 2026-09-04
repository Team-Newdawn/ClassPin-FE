import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_FOLDER_NAME_MAX, classFolderColorIndexForOrder, normalizeClassFolderColorIndex, normalizeClassFolderName } from "./types.ts";

test("강의 폴더 이름을 trim하고 1~80자로 제한한다", () => {
  assert.equal(normalizeClassFolderName("  1주차  "), "1주차");
  assert.equal(normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX)), "가".repeat(CLASS_FOLDER_NAME_MAX));
  assert.throws(() => normalizeClassFolderName("   "));
  assert.throws(() => normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX + 1)));
});

test("폴더 색상은 최초 순서로 정하고 저장된 값은 순서와 무관하게 유지한다", () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => classFolderColorIndexForOrder(index)), [0, 1, 2, 3, 4, 5, 0, 1]);
  assert.equal(normalizeClassFolderColorIndex(4, 0), 4);
  assert.equal(normalizeClassFolderColorIndex(undefined, 7), 1);
});
