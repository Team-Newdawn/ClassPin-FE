type PinPoint = { id: string; x: number | null; y: number | null };

/**
 * 화면에 그려진 거리로 PIN을 묶는다. 묶음은 소속 PIN의 평균 위치(중앙)에 표시하고,
 * PIN은 가장 가까운 묶음 중심에서 `distance`px 이내일 때만 합류한다.
 * 중심 기준이라 PIN이 줄지어 있어도 묶음이 끝없이 번지지 않는다.
 */
export function clusterPins<T extends PinPoint>(pins: readonly T[], width: number, height: number, distance = 32): T[][] {
  const groups: { pins: T[]; x: number; y: number }[] = [];
  const valid = pins
    .filter((pin) => pin.x !== null && pin.y !== null && Number.isFinite(pin.x) && Number.isFinite(pin.y))
    .sort((a, b) => a.x! - b.x! || a.y! - b.y! || a.id.localeCompare(b.id));
  for (const pin of valid) {
    let nearest: (typeof groups)[number] | undefined;
    let nearestDistance = distance;
    if (width > 0 && height > 0) for (const group of groups) {
      const gap = Math.hypot((pin.x! - group.x) * width, (pin.y! - group.y) * height);
      if (gap <= nearestDistance) [nearest, nearestDistance] = [group, gap];
    }
    if (!nearest) {
      groups.push({ pins: [pin], x: pin.x!, y: pin.y! });
      continue;
    }
    nearest.pins.push(pin);
    nearest.x += (pin.x! - nearest.x) / nearest.pins.length;
    nearest.y += (pin.y! - nearest.y) / nearest.pins.length;
  }
  return groups.map((group) => group.pins);
}
