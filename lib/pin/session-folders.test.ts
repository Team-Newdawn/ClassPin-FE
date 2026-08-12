import assert from "node:assert/strict";
import test from "node:test";
import { isSessionFolderName, SESSION_FOLDER_NAME_MAX } from "./types.ts";

test("세션 폴더 이름은 공백과 최대 길이를 검증한다", () => {
  assert.equal(isSessionFolderName("행사 폴더"), true);
  assert.equal(isSessionFolderName(""), false);
  assert.equal(isSessionFolderName(" 앞뒤 공백 "), false);
  assert.equal(isSessionFolderName("가".repeat(SESSION_FOLDER_NAME_MAX)), true);
  assert.equal(isSessionFolderName("가".repeat(SESSION_FOLDER_NAME_MAX + 1)), false);
});
