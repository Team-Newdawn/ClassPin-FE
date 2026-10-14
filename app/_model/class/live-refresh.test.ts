import assert from "node:assert/strict";
import { test } from "node:test";
import { coalesceRefresh } from "./live-refresh.ts";

test("coalesceRefresh runs one refresh at a time and folds queued requests into one", async () => {
  const calls: boolean[] = [];
  let release!: () => void;
  const request = coalesceRefresh((full) => {
    calls.push(full);
    return new Promise<void>((resolve) => { release = resolve; });
  });
  request(false);
  request(false);
  request(true);
  request(false);
  assert.deepEqual(calls, [false]);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [false, true]);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [false, true]);
});
