import test from "node:test";
import assert from "node:assert/strict";
import { groupReportPins } from "./ai-report-categories.ts";

test("categories count each evidence once and retain unknown categories", () => {
  const pins = [
    { evidenceRef: "M001/S001/Q001", category: "why", text: "왜?", page: 1 },
    { evidenceRef: "M001/S001/Q001", category: "concept", text: "duplicate", page: 1 },
    { evidenceRef: "M002/S001/Q001", category: "custom", text: "질문", page: 1 },
  ];
  const groups = groupReportPins(pins);
  assert.deepEqual(groups.map((group) => [group.category, group.pins.length]), [["why", 1], ["other", 1]]);
  assert.equal(groups[1].pins[0].text, "질문");
  assert.deepEqual(groupReportPins([]), []);
});
