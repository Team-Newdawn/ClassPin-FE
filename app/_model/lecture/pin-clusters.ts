type PinPoint = { id: string; x: number | null; y: number | null };

/**
 * 화면에 그려진 거리로 PIN을 묶는다. 묶음은 소속 PIN의 평균 위치(중앙)에 표시하고,
 * PIN은 가장 가까운 묶음 중심에서 `distance`px 이내일 때만 합류한다.
 * 중심 기준이라 PIN이 줄지어 있어도 묶음이 끝없이 번지지 않는다.
 */
export function clusterPins<T extends PinPoint>(pins: readonly T[], width: number, height: number, distance = 32): T[][] {
  type Group = { pins: T[]; x: number; y: number; order: number };
  const groups: Group[] = [];
  const cells = new Map<string, Set<Group>>();
  const indexed = width > 0 && height > 0 && distance > 0 && Number.isFinite(distance) && Number.isFinite(width) && Number.isFinite(height);
  const cellKey = (x: number, y: number) => `${Math.floor(x * width / distance)}:${Math.floor(y * height / distance)}`;
  function* nearby(pin: T) {
    if (!indexed) { yield* groups; return; }
    const x = Math.floor(pin.x! * width / distance), y = Math.floor(pin.y! * height / distance);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      const cell = cells.get(`${x + dx}:${y + dy}`);
      if (cell) yield* cell;
    }
  }
  const valid = pins
    .filter((pin) => pin.x !== null && pin.y !== null && Number.isFinite(pin.x) && Number.isFinite(pin.y))
    .sort((a, b) => a.x! - b.x! || a.y! - b.y! || a.id.localeCompare(b.id));
  for (const pin of valid) {
    let nearest: Group | undefined;
    let nearestDistance = distance;
    if (width > 0 && height > 0) for (const group of nearby(pin)) {
      const gap = Math.hypot((pin.x! - group.x) * width, (pin.y! - group.y) * height);
      // Preserve the original "last group wins" tie even when cell iteration changes the order.
      if (gap < nearestDistance || (gap === nearestDistance && (!nearest || group.order > nearest.order))) {
        nearest = group;
        nearestDistance = gap;
      }
    }
    if (!nearest) {
      nearest = { pins: [pin], x: pin.x!, y: pin.y!, order: groups.length };
      groups.push(nearest);
    } else {
      if (indexed) {
        const oldKey = cellKey(nearest.x, nearest.y);
        const oldCell = cells.get(oldKey)!;
        oldCell.delete(nearest);
        if (!oldCell.size) cells.delete(oldKey);
      }
      nearest.pins.push(pin);
      nearest.x += (pin.x! - nearest.x) / nearest.pins.length;
      nearest.y += (pin.y! - nearest.y) / nearest.pins.length;
    }
    if (indexed) {
      const key = cellKey(nearest.x, nearest.y);
      let cell = cells.get(key);
      if (!cell) { cell = new Set(); cells.set(key, cell); }
      cell.add(nearest);
    }
  }
  return groups.map((group) => group.pins);
}
