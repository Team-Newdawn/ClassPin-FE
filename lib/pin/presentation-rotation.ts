type PositionedPin = { x: number; y: number };
type Rectangle = { left: number; right: number; top: number; bottom: number };

const ZONE_COLUMNS = 4;
const ZONE_ROWS = 3;
const BATCH_SIZE = 10;
const PIN_SIZE = 30;
const PIN_COLLISION_STEP = 38;

export function createSpatialPinBatches<T extends PositionedPin>(pins: readonly T[]) {
  const buckets = Array.from({ length: ZONE_COLUMNS * ZONE_ROWS }, () => [] as T[]);
  for (const pin of pins) {
    const column = Math.max(0, Math.min(ZONE_COLUMNS - 1, Math.floor(pin.x * ZONE_COLUMNS)));
    const row = Math.max(0, Math.min(ZONE_ROWS - 1, Math.floor(pin.y * ZONE_ROWS)));
    buckets[row * ZONE_COLUMNS + column].push(pin);
  }

  const offsets = buckets.map(() => 0);
  const batches: T[][] = [];
  let remaining = pins.length;
  let cursor = 0;
  while (remaining) {
    const batch: T[] = [];
    while (batch.length < BATCH_SIZE && remaining) {
      for (let step = 0; step < buckets.length; step += 1) {
        const bucketIndex = (cursor + step) % buckets.length;
        const pin = buckets[bucketIndex][offsets[bucketIndex]];
        if (!pin) continue;
        batch.push(pin);
        offsets[bucketIndex] += 1;
        remaining -= 1;
        cursor = (bucketIndex + 1) % buckets.length;
        break;
      }
    }
    batches.push(batch);
  }
  return batches;
}

export function resolvePinDisplayPositions<T extends PositionedPin & { id: string }>(pins: readonly T[], width: number, height: number) {
  const positions = new Map<string, PositionedPin>();
  if (width <= 0 || height <= 0) return positions;
  const offsets = [{ x: 0, y: 0 }];
  // ponytail: 한 묶음은 최대 10개라 네 겹의 근거리 탐색이면 충분하다. 묶음 크기가 커지면 클러스터로 바꾼다.
  for (let ring = 1; ring <= 4; ring += 1) {
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

export function advancePinBatch<T extends PositionedPin & { id: string }>(batches: readonly (readonly T[])[], shownPinIds: readonly string[]) {
  if (!batches.length) return { shownPinIds: [], activePinId: null };
  const shown = new Set(shownPinIds);
  const foundIndex = batches.findIndex((batch) => batch.some((pin) => shown.has(pin.id)));
  const currentIndex = foundIndex < 0 ? 0 : foundIndex;
  const currentBatch = batches[currentIndex];
  const visiblePins = currentBatch.filter((pin) => shown.has(pin.id));
  const nextPin = pickMostDistantPin(currentBatch.filter((pin) => !shown.has(pin.id)), visiblePins);
  if (nextPin) return { shownPinIds: [...visiblePins.map((pin) => pin.id), nextPin.id], activePinId: nextPin.id };
  if (batches.length === 1) return null;

  const nextPinId = batches[(currentIndex + 1) % batches.length][0]?.id ?? null;
  return { shownPinIds: nextPinId ? [nextPinId] : [], activePinId: nextPinId };
}

export function rectanglesOverlap(first: Rectangle, second: Rectangle) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}
