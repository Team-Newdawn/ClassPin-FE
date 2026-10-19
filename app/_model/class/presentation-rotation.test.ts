import assert from "node:assert/strict";
import test from "node:test";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, findIncomingPins, findNewestIncomingPin, nextPresentationSlide, presentationAutoplayDelay, rectanglesOverlap, resolvePinDisplayPositions, placeBubbles, slideIndexFromPageNumber } from "./presentation-rotation.ts";

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
  const batch = [{ id: "newer", slideIndex: 1 }, ...pins];
  assert.deepEqual(findIncomingPins(batch, ["known"]), batch.slice(0, 2));
  assert.deepEqual(findIncomingPins(batch.map((pin) => ({ ...pin, reactionCount: 5 })), batch.map((pin) => pin.id)), []);
  assert.deepEqual(findIncomingPins([], ["known"]), []);
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

test("말풍선은 겹치지 않게 자기 PIN에 붙이고, 빈자리가 없어도 숨기지 않는다", () => {
  const pin = (id: string, x: number, y: number) => ({ id, bounds: { left: x - 10, right: x + 10, top: y - 10, bottom: y + 10 } });
  const box = (request: { x: number; y: number; width: number; height: number }, offset: { x: number; y: number }) =>
    ({ left: request.x + offset.x, top: request.y + offset.y, right: request.x + offset.x + request.width, bottom: request.y + offset.y + request.height });
  const pins = ["a", "b", "c", "d"].map((id, index) => pin(id, 100, 100 + index * 20));
  const requests = pins.map((item) => ({ id: item.id, x: 100, y: (item.bounds.top + item.bounds.bottom) / 2, width: 80, height: 24, shapes: [{ width: 80, height: 24 }], pin: item.bounds }));
  const placed = placeBubbles(requests, pins, 400, 300, null);
  const boxes = requests.map((request) => box(request, placed.get(request.id)!));
  const gap = (first: { left: number; right: number; top: number; bottom: number }, second: typeof first) =>
    Math.max(0, first.left - second.right, second.left - first.right) + Math.max(0, first.top - second.bottom, second.top - first.bottom);
  boxes.forEach((first, index) => {
    assert.ok(gap(first, pins[index].bounds) <= 6, `${pins[index].id} 말풍선은 자기 PIN에 붙어 있다`);
    boxes.slice(index + 1).forEach((second) => assert.equal(rectanglesOverlap(first, second), false));
    pins.forEach((item) => assert.equal(rectanglesOverlap(first, item.bounds), false));
    assert.ok(first.left >= 0 && first.top >= 0 && first.right <= 400 && first.bottom <= 300);
  });

  const crowded = placeBubbles(requests, pins, 120, 100, "d");
  assert.equal(crowded.size, 4);
  const active = box(requests[3], crowded.get("d")!);
  assert.ok(active.left >= 0 && active.top >= 0 && active.right <= 120 && active.bottom <= 100);

  // 넓은 모양이 PIN 옆에 안 들어가면 멀리 보내지 않고 좁은 여러 줄 모양으로 PIN 옆에 둔다.
  const edge = pin("e", 150, 25);
  const narrow = placeBubbles([{ id: "e", x: 150, y: 25, pin: edge.bounds, shapes: [{ width: 200, height: 24 }, { width: 90, height: 44 }] }], [edge], 260, 50, null);
  assert.deepEqual(narrow.get("e"), { x: 16, y: -22, shape: 1 });
});

test("긴 말풍선은 전체 높이로 측정하고 공간 부족을 호출자에 알린다", () => {
  const pin = { id: "anchor", bounds: { left: 140, right: 160, top: 90, bottom: 110 } };
  const requests = [0, 1, 2].map((index) => ({
    id: String(index), x: 150, y: 100, pin: pin.bounds,
    shapes: [{ width: 180, height: 500 }, { width: 280, height: 240 }],
  }));
  const placed = placeBubbles(requests, [pin], 300, 180, "0");
  const boxes = requests.map((request) => {
    const { x, y, shape } = placed.get(request.id)!;
    return { left: request.x + x, top: request.y + y, right: request.x + x + request.shapes[shape].width, bottom: request.y + y + request.shapes[shape].height };
  });
  for (const [index, box] of boxes.entries()) {
    assert.ok(box.left >= 0 && box.right <= 300);
    assert.equal(rectanglesOverlap(box, pin.bounds), false);
    for (const other of boxes.slice(index + 1)) assert.equal(rectanglesOverlap(box, other), false);
  }
  assert.ok(boxes[2].bottom > 180, "공간 부족을 알려 더 작은 크기로 재배치할 수 있다");
  const smaller = requests.map((request) => ({ ...request, shapes: request.shapes.map(({ width, height }) => ({ width: width / 5, height: height / 5 })) }));
  const fitted = placeBubbles(smaller, [pin], 300, 180, "0");
  const fittedBoxes = smaller.map((request) => {
    const { x, y, shape } = fitted.get(request.id)!;
    return { left: request.x + x, top: request.y + y, right: request.x + x + request.shapes[shape].width, bottom: request.y + y + request.shapes[shape].height };
  });
  for (const [index, box] of fittedBoxes.entries()) {
    assert.ok(box.left >= 0 && box.right <= 300 && box.top >= 0 && box.bottom <= 180);
    assert.equal(rectanglesOverlap(box, pin.bounds), false);
    for (const other of fittedBoxes.slice(index + 1)) assert.equal(rectanglesOverlap(box, other), false);
  }
});
