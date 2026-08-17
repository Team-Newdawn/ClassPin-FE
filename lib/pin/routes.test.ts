import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPlayerPath } from "./routes.ts";

test("피드백 플레이어 경로만 관리자 로그인 가드를 통과한다", () => {
  assert.equal(isPublicPlayerPath("/pin/admin/campaign-id/present"), true);
  assert.equal(isPublicPlayerPath("/pin/admin/campaign-id"), false);
  assert.equal(isPublicPlayerPath("/pin/admin"), false);
  assert.equal(isPublicPlayerPath("/pin/admin/campaign-id/report"), false);
  assert.equal(isPublicPlayerPath("/pin/admin/campaign-id/present/settings"), false);
});
