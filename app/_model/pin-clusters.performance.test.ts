import assert from "node:assert/strict";
import test from "node:test";
import { clusterPins } from "./pin-clusters.ts";
type PinPoint = Parameters<typeof clusterPins>[0][number];

function reference<T extends PinPoint>(pins: readonly T[], width: number, height: number, distance = 32): T[][] {
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

test("spatial clustering matches the original centers, order and ties", () => {
  let seed = 8147;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  for (let run = 0; run < 100; run += 1) {
    const pins = Array.from({ length: 100 + run }, (_, id) => ({
      id: String(id), x: Math.round(random() * 50) / 50, y: Math.round(random() * 50) / 50
    }));
    const width = 100 + random() * 2000, height = 100 + random() * 1000;
    const distance = run % 9 === 0 ? 0 : run % 11 === 0 ? Infinity : 32;
    assert.deepEqual(clusterPins(pins, width, height, distance), reference(pins, width, height, distance));
  }
  // The middle PIN ties with two existing centers; the later group still wins.
  const ties = [{id:"a",x:.125,y:.125},{id:"b",x:.125,y:.1875},{id:"c",x:.126953125,y:.15625}];
  assert.deepEqual(clusterPins(ties, 1000, 1000).map((group) => group.map((pin) => pin.id)), [["a"], ["b", "c"]]);
  assert.deepEqual(clusterPins(ties, 1000, 1000), reference(ties, 1000, 1000));
  const moving = Array.from({ length: 60 }, (_, id) => ({ id: String(id), x: .03 + id * .002, y: .03 }));
  assert.deepEqual(clusterPins(moving, 1000, 1000), reference(moving, 1000, 1000));
});

test("sparse PINs check nearby cells instead of every previous group", () => {
  const pins = Array.from({ length: 1000 }, (_, id) => ({ id: String(id), x: (id % 40) / 40, y: Math.floor(id / 40) / 25 }));
  const hypot = Math.hypot;
  let comparisons = 0;
  Math.hypot = (...values) => { comparisons += 1; return hypot(...values); };
  try {
    assert.equal(clusterPins(pins, 1600, 1000).length, pins.length);
    assert.ok(comparisons < pins.length * 8, `unexpected global scan: ${comparisons}`);
  } finally { Math.hypot = hypot; }
});
