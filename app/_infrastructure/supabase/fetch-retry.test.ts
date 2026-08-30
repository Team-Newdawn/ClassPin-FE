import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithAbortedTransactionRetry } from "./fetch-retry.ts";

test("PostgREST 25P02만 재시도하고 정상 응답을 반환한다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls < 3
      ? Response.json({ code: "25P02", message: "current transaction is aborted" }, { status: 500 })
      : Response.json({ id: "lecture-1" });
  };

  const response = await fetchWithAbortedTransactionRetry("https://example.test/lectures", { method: "PATCH" });

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test("권한 오류는 재시도하지 않는다", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ code: "42501", message: "permission denied" }, { status: 403 });
  };

  const response = await fetchWithAbortedTransactionRetry("https://example.test/lectures", { method: "PATCH" });

  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});
