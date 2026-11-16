import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("summary requests share in-flight work, isolate tokens, retry failures and bound memory", async () => {
  let token = "owner-a";
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("app/_service/question-summary-service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  new Function("require", "exports", code)(() => ({ getUploadSession: async () => ({ accessToken: token }) }), exports);
  const summarize = exports.summarizeQuestions as (items: unknown[], locale: string, folder: null) => Promise<string>;
  const original = globalThis.fetch;
  let calls = 0, fail = false;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    return fail ? new Response(null, { status: 503 }) : Response.json({ summary: "summary" });
  };
  const items = [{ page: 1, text: "Question", reactions: 0 }];
  try {
    assert.deepEqual(await Promise.all([summarize(items, "ko", null), summarize(items, "ko", null)]), ["summary", "summary"]);
    assert.equal(calls, 1);
    token = "owner-b";
    await summarize(items, "ko", null);
    assert.equal(calls, 2);
    token = "owner-a";
    await summarize(items, "ko", null);
    assert.equal(calls, 2);
    fail = true;
    await assert.rejects(summarize(items, "en", null));
    fail = false;
    await summarize(items, "en", null);
    assert.equal(calls, 4);
    for (let id = 0; id < 50; id += 1) await summarize([{ ...items[0], text: String(id) }], "ko", null);
    const before = calls;
    await summarize(items, "ko", null);
    assert.equal(calls, before + 1, "old summaries must be evicted instead of growing forever");
  } finally { globalThis.fetch = original; }
});

test("summary refresh counts new, edited and deleted questions but not reactions", () => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("app/_service/question-summary-service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  new Function("require", "exports", code)(() => ({}), exports);
  const count = exports.countSummaryChanges as (a: { id: string; text: string }[], b: { id: string; text: string }[]) => number;
  const base = [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }];
  assert.equal(count(base, base.map((q) => ({ ...q, reactionCount: 9 }))), 0);
  assert.equal(count(base, [...base, { id: "d", text: "D" }, { id: "e", text: "E" }]), 2);
  assert.equal(count(base, [{ id: "a", text: "A edited" }, { id: "b", text: "B" }]), 2);
  assert.equal(count([], base), 3);
});
