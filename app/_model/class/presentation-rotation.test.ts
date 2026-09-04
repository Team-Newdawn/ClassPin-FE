import assert from "node:assert/strict";
import test from "node:test";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, rectanglesOverlap, resolvePinDisplayPositions, resolveVisiblePresentationLabelIds } from "./presentation-rotation.ts";

test("PIN 총합이 새 10단위를 넘으면 건너뛴 구간 중 가장 높은 값을 고른다", () => {
  assert.equal(crossedPinMilestone(9, 10), 10);
  assert.equal(crossedPinMilestone(9, 31), 30);
  assert.equal(crossedPinMilestone(20, 29), null);
  assert.equal(crossedPinMilestone(10, 10), null);
  assert.equal(crossedPinMilestone(31, 29), null);
});

test("공감 여부와 관계없이 모든 PIN을 하나씩 누적한 뒤 첫 PIN부터 다시 시작한다", () => {
  const pins = Array.from({ length: 13 }, (_, index) => ({ id: `${index}`, x: (index % 4) / 4, y: Math.floor(index / 4) / 4, reactionCount: index < 5 ? 5 : 0 }));
  let state = { shownPinIds: [] as string[], activePinId: null as string | null };

  for (let count = 1; count <= pins.length; count += 1) {
    state = advancePinPlayback(pins, state.shownPinIds);
    assert.equal(state.shownPinIds.length, count);
  }
  assert.deepEqual(new Set(state.shownPinIds), new Set(pins.map((pin) => pin.id)));

  state = advancePinPlayback(pins, state.shownPinIds);
  assert.deepEqual(state.shownPinIds, [pins[0].id]);
});

test("현재 표시된 PIN과 가장 멀리 떨어진 PIN을 다음으로 고른다", () => {
  const pins = [
    { id: "center", x: 0.5, y: 0.5 },
    { id: "near", x: 0.55, y: 0.5 },
    { id: "far", x: 0.05, y: 0.05 }
  ];

  assert.equal(advancePinPlayback(pins, ["center"]).activePinId, "far");
});

test("사용자가 PIN을 선택한 동안 자동 순환을 멈춘다", () => {
  assert.equal(canRotatePinPlayback(true, 2, null), true);
  assert.equal(canRotatePinPlayback(true, 2, "selected"), false);
  assert.equal(canRotatePinPlayback(false, 2, null), false);
  assert.equal(canRotatePinPlayback(true, 1, null), false);
});

test("중앙이나 가장자리에 겹친 PIN 30개를 화면 안의 겹치지 않는 위치로 펼친다", () => {
  const width = 800;
  const height = 450;
  for (const [x, y] of [[0.5, 0.5], [0, 0], [1, 1]]) {
    const pins = Array.from({ length: 30 }, (_, index) => ({ id: `${index}`, x, y }));
    const positions = [...resolvePinDisplayPositions(pins, width, height).values()];

    assert.equal(positions.length, pins.length);
    positions.forEach((position, index) => {
      assert.ok(position.x >= 0 && position.x <= 1);
      assert.ok(position.y >= 0 && position.y <= 1);
      positions.slice(index + 1).forEach((other) => {
        assert.ok(Math.abs(position.x - other.x) * width >= 30 || Math.abs(position.y - other.y) * height >= 30);
      });
    });
  }
});

test("말풍선과 PIN의 실제 사각형이 겹칠 때만 충돌로 판단한다", () => {
  const first = { left: 0, right: 20, top: 0, bottom: 20 };
  assert.equal(rectanglesOverlap(first, { left: 10, right: 30, top: 10, bottom: 30 }), true);
  assert.equal(rectanglesOverlap(first, { left: 20, right: 40, top: 0, bottom: 20 }), false);
});

test("새 이모티콘 PIN이 이전 말풍선과 겹치면 새 말풍선만 남긴다", () => {
  const labels = [
    { id: "old", bounds: { left: 0, right: 80, top: 0, bottom: 40 } },
    { id: "new-emoji", bounds: { left: 90, right: 170, top: 0, bottom: 40 } }
  ];
  const pins = [
    { id: "old", bounds: { left: 0, right: 30, top: 50, bottom: 80 } },
    { id: "new-emoji", bounds: { left: 40, right: 70, top: 10, bottom: 40 } }
  ];

  assert.deepEqual([...resolveVisiblePresentationLabelIds(labels, pins, "new-emoji")], ["new-emoji"]);
  assert.deepEqual(resolveVisiblePresentationLabelIds([
    labels[0],
    { id: "new-emoji", bounds: { left: 60, right: 140, top: 10, bottom: 50 } }
  ], pins.map((pin) => ({ ...pin, bounds: { ...pin.bounds, top: 50, bottom: 80 } })), "new-emoji"), ["new-emoji"]);
});
