import assert from "node:assert/strict";
import test from "node:test";
import { isParticipantPointAnchor } from "./types.ts";

test("참여자 신규 질문은 정규화된 point anchor만 허용한다", () => {
  assert.equal(isParticipantPointAnchor({ anchorKind: "point", x: 0.25, y: 0.75, width: null, height: null, path: null }), true);
  assert.equal(isParticipantPointAnchor({ anchorKind: "path", x: 0.25, y: 0.75, width: null, height: null, path: [{ x: 0.25, y: 0.75 }, { x: 0.5, y: 0.5 }] }), false);
  assert.equal(isParticipantPointAnchor({ anchorKind: "box", x: 0.25, y: 0.75, width: 0.2, height: 0.2, path: null }), false);
  assert.equal(isParticipantPointAnchor({ anchorKind: "point", x: 1.1, y: 0.75, width: null, height: null, path: null }), false);
});
