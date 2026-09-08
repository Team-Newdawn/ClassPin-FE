import assert from "node:assert/strict";
import test from "node:test";
import { validateTask } from "../src/server.mjs";

const jobId = "3373b744-a42f-4e89-b71e-07ffe1b3b245";

test("worker accepts only minimal non-content task payloads", () => {
  assert.deepEqual(validateTask({ jobId, stage: "slide", unitAlias: "S001" }), { jobId, stage: "slide", unitAlias: "S001" });
  assert.throws(() => validateTask({ jobId, stage: "slide", unitAlias: "S001", question: "must not be queued" }));
  assert.throws(() => validateTask({ jobId, stage: "slide" }));
});
