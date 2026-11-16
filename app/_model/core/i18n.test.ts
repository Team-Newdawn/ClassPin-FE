import assert from "node:assert/strict";
import test from "node:test";
import { timeAgo, translate } from "./i18n.ts";

test("대시보드 업로드 버튼은 간결한 문구를 사용한다", () => {
  assert.equal(translate("ko", "folders.uploadUnfiled"), "업로드");
  assert.equal(translate("en", "folders.uploadUnfiled"), "Upload");
  assert.equal(translate("ko", "upload.tooLarge"), "파일이 1GB를 초과합니다. 더 작은 파일로 다시 시도해 주세요.");
});

test("24시간부터 상대 시간을 일 단위로 표시한다", () => {
  const realNow = Date.now;
  const now = new Date("2026-08-28T00:00:00.000Z").getTime();
  Date.now = () => now;
  try {
    assert.equal(timeAgo("ko", new Date(now - 23 * 60 * 60 * 1000).toISOString()), "23시간 전");
    assert.equal(timeAgo("ko", new Date(now - 24 * 60 * 60 * 1000).toISOString()), "1일 전");
    assert.equal(timeAgo("ko", new Date(now - 833 * 60 * 60 * 1000).toISOString()), "34일 전");
  } finally {
    Date.now = realNow;
  }
});
