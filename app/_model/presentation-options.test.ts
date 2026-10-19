import assert from "node:assert/strict";
import test from "node:test";
import { clampQrSize, presentationOptions, QR_POSITIONS } from "./presentation-options.ts";
import type { ClassSession } from "./types.ts";

const session = { showQuestionPins: true, showQuestionLabels: false, presentationQrPosition: "bottom-right" } as ClassSession;

test("QR supports six positions and clamps manual size and placement", () => {
  for (const qrPosition of QR_POSITIONS) {
    assert.equal(presentationOptions(session, { qrPosition, qrBasePosition: "bottom-right" }).qrPosition, qrPosition);
  }
  assert.deepEqual([64, 96, 160, 0, 500, NaN].map(clampQrSize), [64, 96, 160, 64, 160, 96]);
  assert.deepEqual(presentationOptions(session, { qrBasePosition: "bottom-right", qrOffset: { x: -1, y: 2 } }).qrOffset, { x: 0, y: 1 });
  assert.equal(presentationOptions(session, { qrBasePosition: "bottom-right", qrOffset: { x: NaN, y: 0 } }).qrOffset, null);
});

test("remote position changes supersede a browser center override", () => {
  assert.equal(presentationOptions({ ...session, presentationQrPosition: "top-left" }, { qrPosition: "top-center", qrBasePosition: "bottom-right" }).qrPosition, "top-left");
});

test("question modes respect server visibility and label controls", () => {
  assert.equal(presentationOptions(session, {}).questionMode, "pins");
  assert.equal(presentationOptions({ ...session, showQuestionLabels: true }, {}).questionMode, "questions");
  assert.equal(presentationOptions({ ...session, showQuestionLabels: true }, { questionBubbles: true }).questionMode, "bubbles");
  assert.equal(presentationOptions({ ...session, showQuestionPins: false }, { questionBubbles: true }).questionMode, "off");
  assert.equal(presentationOptions(session, { questionBubbles: true }).questionMode, "pins");
});
