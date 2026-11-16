import assert from "node:assert/strict";
import test from "node:test";
import { clusterPins } from "./pin-clusters.ts";

const ids = (groups: { id: string }[][]) => groups.map((group) => group.map((pin) => pin.id).sort()).sort();

test("PINs join a group only within 32 screen pixels of its center", () => {
  const pins = [{id: "a", x: .1, y: .1}, {id: "b", x: .16, y: .1}, {id: "c", x: .13, y: .1}, {id: "d", x: .8, y: .8}];
  assert.deepEqual(ids(clusterPins(pins, 1000, 562)), [["a", "c"], ["b"], ["d"]]);
  assert.equal(clusterPins(pins, 2000, 1124).length, 4);
  assert.deepEqual(ids(clusterPins([...pins].reverse(), 1000, 562)), [["a", "c"], ["b"], ["d"]]);
  assert.deepEqual(pins.map((pin) => pin.id), ["a", "b", "c", "d"]);
});

test("a chain of evenly spaced PINs does not collapse into one group", () => {
  const chain = Array.from({ length: 6 }, (_, index) => ({ id: String(index), x: .1 + index * .025, y: .5 }));
  assert.ok(clusterPins(chain, 1000, 562).every((group) => group.length <= 2));
});

test("unpositioned and invalid PINs are excluded; an unmeasured canvas does not cluster", () => {
  const pins = [{id: "a", x: .1, y: .1}, {id: "b", x: .1, y: .1}, {id: "null", x: null, y: .1}, {id: "nan", x: NaN, y: .1}];
  assert.equal(clusterPins(pins, 0, 0).length, 2);
  assert.equal(clusterPins(pins, 400, 200).length, 1);
});
