type PositionedPin = { x: number; y: number };
type Rectangle = { left: number; right: number; top: number; bottom: number };
type PositionedRectangle = { id: string; bounds: Rectangle };

const PIN_SIZE = 40;
const PIN_COLLISION_STEP = 48;

export function crossedPinMilestone(previousCount: number, currentCount: number) {
  const previousMilestone = Math.floor(Math.max(0, previousCount) / 10);
  const currentMilestone = Math.floor(Math.max(0, currentCount) / 10);
  return currentMilestone > previousMilestone ? currentMilestone * 10 : null;
}

export function resolvePinDisplayPositions<T extends PositionedPin & { id: string }>(pins: readonly T[], width: number, height: number) {
  const positions = new Map<string, PositionedPin>();
  if (width <= 0 || height <= 0) return positions;
  const offsets = [{ x: 0, y: 0 }];
  // ponytail: 캔버스 수용량을 넘으면 일부 겹침을 허용한다. 실제 문제가 생길 때만 클러스터로 바꾼다.
  const searchRings = Math.max(4, Math.ceil(Math.sqrt(pins.length)));
  for (let ring = 1; ring <= searchRings; ring += 1) {
    for (let y = -ring; y <= ring; y += 1) {
      for (let x = -ring; x <= ring; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) === ring) offsets.push({ x, y });
      }
    }
  }
  offsets.sort((first, second) => first.x ** 2 + first.y ** 2 - second.x ** 2 - second.y ** 2);

  const occupied: Rectangle[] = [];
  for (const pin of pins) {
    const origin = { x: pin.x * width, y: pin.y * height };
    let anchor = {
      x: Math.max(0, Math.min(width - PIN_SIZE, origin.x)),
      y: Math.max(PIN_SIZE, Math.min(height, origin.y))
    };
    for (const offset of offsets) {
      const candidate = {
        x: Math.max(0, Math.min(width - PIN_SIZE, origin.x + offset.x * PIN_COLLISION_STEP)),
        y: Math.max(PIN_SIZE, Math.min(height, origin.y + offset.y * PIN_COLLISION_STEP))
      };
      const bounds = { left: candidate.x, right: candidate.x + PIN_SIZE, top: candidate.y - PIN_SIZE, bottom: candidate.y };
      if (occupied.every((other) => !rectanglesOverlap(bounds, other))) {
        anchor = candidate;
        break;
      }
    }
    occupied.push({ left: anchor.x, right: anchor.x + PIN_SIZE, top: anchor.y - PIN_SIZE, bottom: anchor.y });
    positions.set(pin.id, { x: anchor.x / width, y: anchor.y / height });
  }
  return positions;
}

function pickMostDistantPin<T extends PositionedPin>(candidates: readonly T[], visiblePins: readonly PositionedPin[]) {
  if (!candidates.length) return undefined;
  if (!visiblePins.length) return candidates[0];

  return candidates.reduce((best, candidate) => {
    const nearestVisibleDistance = Math.min(...visiblePins.map((pin) => (candidate.x - pin.x) ** 2 + (candidate.y - pin.y) ** 2));
    const bestNearestDistance = Math.min(...visiblePins.map((pin) => (best.x - pin.x) ** 2 + (best.y - pin.y) ** 2));
    return nearestVisibleDistance > bestNearestDistance ? candidate : best;
  });
}

export function advancePinPlayback<T extends PositionedPin & { id: string }>(pins: readonly T[], shownPinIds: readonly string[]) {
  if (!pins.length) return { shownPinIds: [], activePinId: null };
  const shown = new Set(shownPinIds);
  const visiblePins = pins.filter((pin) => shown.has(pin.id));
  const nextPin = pickMostDistantPin(pins.filter((pin) => !shown.has(pin.id)), visiblePins);
  if (nextPin) return { shownPinIds: [...visiblePins.map((pin) => pin.id), nextPin.id], activePinId: nextPin.id };

  return { shownPinIds: [pins[0].id], activePinId: pins[0].id };
}

export function canRotatePinPlayback(showPins: boolean, pinCount: number, shownPinCount: number, selectedPinId: string | null) {
  return showPins && shownPinCount < pinCount && selectedPinId === null;
}

export function nextPresentationSlide(currentSlide: number, slideCount: number) {
  return slideCount > 0 ? (currentSlide + 1) % slideCount : 0;
}

export function presentationAutoplayDelay(
  enabled: boolean,
  showPins: boolean,
  pinCount: number,
  shownPinCount: number,
  slideCount: number,
  detailOpen: boolean
) {
  if (!enabled || slideCount < 2 || detailOpen) return null;
  if (showPins && shownPinCount < pinCount) return null;
  return showPins && pinCount > 0 ? 1000 : 3000;
}

export function slideIndexFromPageNumber(pageNumber: string, slideCount: number) {
  if (!pageNumber.trim()) return null;
  const parsed = Number(pageNumber);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= slideCount ? parsed - 1 : null;
}

export function findNewestIncomingPin<T extends { id: string }>(pins: readonly T[], previousPinIds: readonly string[]) {
  const previous = new Set(previousPinIds);
  return pins.find((pin) => !previous.has(pin.id)) ?? null;
}

export function rectanglesOverlap(first: Rectangle, second: Rectangle) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

export type BubbleShape = { width: number; height: number };
export type BubbleRequest = { id: string; x: number; y: number; shapes: readonly BubbleShape[]; pin: Rectangle };
const BUBBLE_GAP = 6;
// 이보다 멀면 어느 PIN의 말풍선인지 알아보기 어렵다. 그 너머의 빈자리보다 PIN 옆에서 조금 겹치는 쪽을 고른다.
const BUBBLE_MAX_DISTANCE = 120;

const overlapArea = (first: Rectangle, second: Rectangle) =>
  Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
  * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

type Candidate = Rectangle & { shape: number };

/** PIN에 닿는 자리들. 옆(좌우)은 위아래로, 위·아래는 좌우로 밀어 본 자리까지 포함하며 앞쪽일수록 우선한다. */
function adjacentCandidates({ x, y, pin, shapes }: BubbleRequest, width: number, height: number): Candidate[] {
  const candidates: (Candidate & { rank: number })[] = [];
  shapes.forEach(({ width: w, height: h }, shape) => {
    const sides = x > width * .58 ? [pin.left - BUBBLE_GAP - w, pin.right + BUBBLE_GAP] : [pin.right + BUBBLE_GAP, pin.left - BUBBLE_GAP - w];
    const sideTops = [y - h / 2, pin.top, pin.bottom - h, pin.top - h + BUBBLE_GAP, pin.bottom - BUBBLE_GAP];
    const capLefts = [x - w / 2, pin.left, pin.right - w, pin.left - w + BUBBLE_GAP, pin.right - BUBBLE_GAP];
    const add = (left: number, top: number, rank: number) => {
      if (left >= 0 && top >= 0 && left + w <= width && top + h <= height) candidates.push({ left, top, right: left + w, bottom: top + h, shape, rank: shape * 100 + rank });
    };
    sideTops.forEach((top, sample) => sides.forEach((left, side) => add(left, top, sample * 4 + side)));
    capLefts.forEach((left, sample) => [pin.top - BUBBLE_GAP - h, pin.bottom + BUBBLE_GAP].forEach((top, side) => add(left, top, sample * 4 + 2 + side)));
  });
  return candidates.sort((first, second) => first.rank - second.rank);
}

/** PIN 옆에 빈자리가 전혀 없을 때 쓰는 자리들. PIN에서 BUBBLE_MAX_DISTANCE 안을 격자로 훑어 가까운 순서로 정렬한다. */
function distantCandidates({ pin, shapes }: BubbleRequest, width: number, height: number): Candidate[] {
  const candidates: (Candidate & { rank: number })[] = [];
  shapes.forEach(({ width: w, height: h }, shape) => {
    const steps = (size: number, step: number) => [...Array.from({ length: Math.max(0, Math.floor(size / step)) + 1 }, (_, index) => index * step).filter((value) => value <= size), size];
    for (const top of steps(height - h, h / 2)) {
      for (const left of steps(width - w, 20)) {
        const gap = Math.max(0, left - pin.right, pin.left - left - w) + Math.max(0, top - pin.bottom, pin.top - top - h);
        if (gap > BUBBLE_MAX_DISTANCE) continue;
        candidates.push({ left, top, right: left + w, bottom: top + h, shape, rank: gap * shapes.length + shape });
      }
    }
  });
  return candidates.sort((first, second) => first.rank - second.rank);
}

/**
 * 말풍선을 자기 PIN에 붙여, 다른 말풍선·모든 PIN(자기 PIN 포함)과 겹치지 않게 둔다.
 * 1) activeId 말풍선이 먼저 자리를 잡는다. 2) 남은 말풍선 중 PIN에 붙을 빈자리가 가장 적은 것부터 자리를 잡아,
 *    PIN이 몰린 곳의 말풍선이 옆자리를 빼앗기지 않게 한다. 기본 모양을 먼저, 안 맞으면 shapes 뒤쪽의 작은 모양을 쓴다.
 * 3) 붙을 자리가 없으면, 그 자리를 막은 말풍선 하나를 그 PIN의 다른 옆자리로 옮겨 자리를 만든다.
 * 4) 그래도 없으면 PIN에서 BUBBLE_MAX_DISTANCE 안의 가장 가까운 빈자리를 찾고, 없으면 PIN 옆 자리 중 겹침이 가장 적은 곳에 둔다. 말풍선은 숨기지 않는다.
 * 반환값은 고른 모양 번호와, 말풍선 기준점(x, y)에서 왼쪽 위 모서리까지의 거리다.
 */
export function placeBubbles(bubbles: readonly BubbleRequest[], pins: readonly PositionedRectangle[], width: number, height: number, activeId: string | null) {
  const boxes = new Map<string, Candidate>();
  const pinCost = (box: Rectangle) => pins.reduce((sum, other) => sum + overlapArea(box, other.bounds), 0);
  const cost = (box: Rectangle, ignoreId?: string) => {
    let sum = pinCost(box);
    for (const [id, other] of boxes) if (id !== ignoreId) sum += overlapArea(box, other);
    return sum;
  };
  const items = new Map(bubbles.map((bubble) => [bubble.id, { bubble, adjacent: adjacentCandidates(bubble, width, height) }]));
  // 겹침 여부만 보면 되는 곳은 첫 겹침에서 멈춘다. 격자 후보가 수천 개라 면적 합산보다 훨씬 싸다.
  const blocked = (box: Rectangle) => {
    if (pins.some((other) => rectanglesOverlap(box, other.bounds))) return true;
    for (const other of boxes.values()) if (rectanglesOverlap(box, other)) return true;
    return false;
  };
  const placeAnywhere = ({ bubble, adjacent }: { bubble: BubbleRequest; adjacent: Candidate[] }) => {
    const adjacentOpen = adjacent.find((candidate) => !blocked(candidate));
    if (adjacentOpen) { boxes.set(bubble.id, adjacentOpen); return; }
    const distant = distantCandidates(bubble, width, height);
    const open = distant.find((candidate) => !blocked(candidate));
    // 빈자리가 슬라이드 어디에도 없으면 PIN 옆 자리 중 겹침이 가장 적은 곳에 둔다.
    const fallback = () => (adjacent.length ? adjacent : distant).reduce((best, candidate) => cost(candidate) < cost(best) ? candidate : best);
    boxes.set(bubble.id, open ?? fallback());
  };
  // 이 말풍선이 들어갈 옆자리를 막은 말풍선이 하나뿐이고, 그 말풍선이 자기 PIN의 다른 옆자리로 옮길 수 있으면 옮긴다.
  const makeRoom = ({ bubble, adjacent }: { bubble: BubbleRequest; adjacent: Candidate[] }) => {
    for (const candidate of adjacent) {
      if (pinCost(candidate)) continue;
      const blockers = [...boxes].filter(([, other]) => rectanglesOverlap(candidate, other));
      if (blockers.length !== 1 || blockers[0][0] === activeId) continue;
      const [blockerId] = blockers[0];
      boxes.set(bubble.id, candidate);
      const moved = items.get(blockerId)!.adjacent.find((other) => !cost(other, blockerId));
      if (moved) {
        boxes.set(blockerId, moved);
        return true;
      }
      boxes.delete(bubble.id);
    }
    return false;
  };

  let remaining = [...items.values()];
  const active = activeId ? items.get(activeId) : undefined;
  if (active) {
    placeAnywhere(active);
    remaining = remaining.filter((item) => item !== active);
  }
  // 빈 옆자리 목록은 한 번만 계산하고, 말풍선이 놓일 때마다 그 말풍선과 겹치는 후보만 지운다.
  const free = new Map(remaining.map((item) => [item, item.adjacent.filter((candidate) => !cost(candidate))]));
  while (remaining.length) {
    const next = remaining.reduce<(typeof remaining)[number] | undefined>((best, item) =>
      free.get(item)!.length && (!best || free.get(item)!.length < free.get(best)!.length) ? item : best, undefined);
    if (!next) break;
    const box = free.get(next)![0];
    boxes.set(next.bubble.id, box);
    remaining = remaining.filter((item) => item !== next);
    for (const item of remaining) free.set(item, free.get(item)!.filter((candidate) => !rectanglesOverlap(candidate, box)));
  }
  for (const item of remaining) if (!makeRoom(item)) placeAnywhere(item);

  const placements = new Map<string, { x: number; y: number; shape: number }>();
  for (const [id, box] of boxes) {
    const { bubble } = items.get(id)!;
    placements.set(id, { x: box.left - bubble.x, y: box.top - bubble.y, shape: box.shape });
  }
  return placements;
}
