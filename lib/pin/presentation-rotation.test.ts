import assert from "node:assert/strict";
import test from "node:test";
import { advancePinBatch, createSpatialPinBatches, rectanglesOverlap, resolvePinDisplayPositions } from "./presentation-rotation.ts";

test("PIN을 최대 10개씩 묶고 첫 배치를 서로 다른 화면 구역에서 고른다", () => {
  const pins = Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`,
    x: ((index % 4) + 0.5) / 4,
    y: (Math.floor(index / 4) + 0.5) / 3
  }));
  const batches = createSpatialPinBatches(pins);

  assert.deepEqual(batches.map((batch) => batch.length), [10, 2]);
  assert.equal(new Set(batches[0].map((pin) => `${Math.floor(pin.x * 4)}:${Math.floor(pin.y * 3)}`)).size, 10);
  assert.deepEqual(batches.flat().map((pin) => pin.id).sort(), pins.map((pin) => pin.id).sort());
});

test("10개 미만이거나 마지막에 남은 PIN만 실제 개수로 묶는다", () => {
  const pins = Array.from({ length: 17 }, (_, index) => ({ id: `${index}`, x: 0.5, y: 0.5 }));

  assert.deepEqual(createSpatialPinBatches(pins).map((batch) => batch.length), [10, 7]);
  assert.deepEqual(createSpatialPinBatches(pins.slice(0, 6)).map((batch) => batch.length), [6]);
});

test("한 묶음을 하나씩 누적한 뒤 기존 묶음을 지우고 다음 묶음을 시작한다", () => {
  const batches = [
    Array.from({ length: 10 }, (_, index) => ({ id: `first-${index}`, x: index / 10, y: 0 })),
    Array.from({ length: 3 }, (_, index) => ({ id: `second-${index}`, x: index / 3, y: 1 }))
  ];
  let state = { shownPinIds: [] as string[], activePinId: null as string | null };

  for (let count = 1; count <= 10; count += 1) {
    state = advancePinBatch(batches, state.shownPinIds) ?? state;
    assert.equal(state.shownPinIds.length, count);
    assert.equal(state.shownPinIds.every((id) => id.startsWith("first-")), true);
  }

  state = advancePinBatch(batches, state.shownPinIds) ?? state;
  assert.deepEqual(state.shownPinIds, ["second-0"]);
});

test("한 이미지에 PIN이 10개 이하면 모두 나온 뒤 그대로 유지한다", () => {
  const batches = [[
    { id: "first", x: 0.2, y: 0.2 },
    { id: "second", x: 0.8, y: 0.8 }
  ]];
  const first = advancePinBatch(batches, []);
  const second = advancePinBatch(batches, first?.shownPinIds ?? []);

  assert.deepEqual(second?.shownPinIds, ["first", "second"]);
  assert.equal(advancePinBatch(batches, second?.shownPinIds ?? []), null);
});

test("현재 표시된 PIN과 가장 멀리 떨어진 PIN을 다음으로 고른다", () => {
  const batch = [[
    { id: "center", x: 0.5, y: 0.5 },
    { id: "near", x: 0.55, y: 0.5 },
    { id: "far", x: 0.05, y: 0.05 }
  ]];

  assert.equal(advancePinBatch(batch, ["center"])?.activePinId, "far");
});

test("중앙이나 가장자리에 겹친 PIN 10개를 화면 안의 겹치지 않는 위치로 펼친다", () => {
  const width = 800;
  const height = 450;
  for (const [x, y] of [[0.5, 0.5], [0, 0], [1, 1]]) {
    const pins = Array.from({ length: 10 }, (_, index) => ({ id: `${index}`, x, y }));
    const positions = [...resolvePinDisplayPositions(pins, width, height).values()];

    assert.equal(positions.length, 10);
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
