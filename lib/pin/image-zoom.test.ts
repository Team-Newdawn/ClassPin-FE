import assert from "node:assert/strict";
import test from "node:test";
import { imageZoomFromPinch } from "./image-zoom.ts";

test("이미지 핀치 배율을 1배에서 2.5배 사이로 제한한다", () => {
  assert.equal(imageZoomFromPinch(1, 100, 180), 1.8);
  assert.equal(imageZoomFromPinch(2, 100, 200), 2.5);
  assert.equal(imageZoomFromPinch(1.5, 100, 20), 1);
});
