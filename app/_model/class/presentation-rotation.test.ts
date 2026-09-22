import assert from "node:assert/strict";
import test from "node:test";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, findNewestIncomingPin, nextPresentationSlide, presentationAutoplayDelay, rectanglesOverlap, resolvePinDisplayPositions, resolveVisiblePresentationLabelIds, slideIndexFromPageNumber } from "./presentation-rotation.ts";

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

test("새 PIN부터 다시 시작하면 기존 PIN도 모두 순환한 뒤 완료한다", () => {
  const pins = [
    { id: "incoming", x: 0.5, y: 0.5 },
    { id: "first", x: 0.1, y: 0.1 },
    { id: "second", x: 0.9, y: 0.9 }
  ];
  let shownPinIds = ["incoming"];
  for (let count = 1; count < pins.length; count += 1) {
    assert.equal(canRotatePinPlayback(true, pins.length, shownPinIds.length, null), true);
    shownPinIds = advancePinPlayback(pins, shownPinIds).shownPinIds;
    assert.equal(shownPinIds.length, count + 1);
  }
  assert.deepEqual(new Set(shownPinIds), new Set(pins.map((pin) => pin.id)));
  assert.equal(canRotatePinPlayback(true, pins.length, shownPinIds.length, null), false);
});

test("선택 중이거나 현재 슬라이드의 PIN이 모두 보이면 PIN 순차 노출을 멈춘다", () => {
  assert.equal(canRotatePinPlayback(true, 2, 1, null), true);
  assert.equal(canRotatePinPlayback(true, 2, 2, null), false);
  assert.equal(canRotatePinPlayback(true, 2, 1, "selected"), false);
  assert.equal(canRotatePinPlayback(false, 2, 1, null), false);
  assert.equal(canRotatePinPlayback(true, 1, 1, null), false);
});

test("발표 슬라이드를 순환하고 기존 snapshot에 없던 최신 PIN을 고른다", () => {
  const pins = [{ id: "new", slideIndex: 2 }, { id: "known", slideIndex: 0 }];

  assert.equal(nextPresentationSlide(0, 3), 1);
  assert.equal(nextPresentationSlide(2, 3), 0);
  assert.equal(nextPresentationSlide(0, 0), 0);
  assert.equal(findNewestIncomingPin(pins, ["known"]), pins[0]);
  assert.equal(findNewestIncomingPin(pins, pins.map((pin) => pin.id)), null);
});

test("자동 넘김은 설정·PIN 노출·상세 dialog 상태에 맞는 지연만 반환한다", () => {
  assert.equal(presentationAutoplayDelay(false, true, 1, 1, 2, false), null);
  assert.equal(presentationAutoplayDelay(true, true, 2, 1, 2, false), null);
  assert.equal(presentationAutoplayDelay(true, true, 2, 2, 2, false), 1000);
  assert.equal(presentationAutoplayDelay(true, true, 0, 0, 2, false), 3000);
  assert.equal(presentationAutoplayDelay(true, false, 2, 0, 2, false), 3000);
  assert.equal(presentationAutoplayDelay(true, false, 0, 0, 1, false), null);
  assert.equal(presentationAutoplayDelay(true, false, 0, 0, 2, true), null);
});

test("직접 입력한 1-based 슬라이드 번호 문자열이 범위 안의 정수일 때만 index로 바꾼다", () => {
  assert.equal(slideIndexFromPageNumber("1", 10), 0);
  assert.equal(slideIndexFromPageNumber("10", 10), 9);
  assert.equal(slideIndexFromPageNumber("", 10), null);
  assert.equal(slideIndexFromPageNumber("0", 10), null);
  assert.equal(slideIndexFromPageNumber("11", 10), null);
  assert.equal(slideIndexFromPageNumber("1.5", 10), null);
  assert.equal(slideIndexFromPageNumber("invalid", 10), null);
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
        assert.ok(Math.abs(position.x - other.x) * width >= 40 || Math.abs(position.y - other.y) * height >= 40);
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
