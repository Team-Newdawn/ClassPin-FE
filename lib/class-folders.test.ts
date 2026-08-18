import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_FOLDER_NAME_MAX, normalizeClassFolderName } from "./types.ts";

test("강의 폴더 이름을 trim하고 1~80자로 제한한다", () => {
  assert.equal(normalizeClassFolderName("  1주차  "), "1주차");
  assert.equal(normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX)), "가".repeat(CLASS_FOLDER_NAME_MAX));
  assert.throws(() => normalizeClassFolderName("   "));
  assert.throws(() => normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX + 1)));
});
