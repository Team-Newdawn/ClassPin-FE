import assert from "node:assert/strict";
import { register } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// Next resolves `server-only` and the extensionless `next/server` at build time; map them for plain Node here.
const serverOnly = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(serverOnly)} : specifier === "next/server" ? "next/server.js" : specifier, context); }`), import.meta.url);
const { claude } = await import("../../../../_service/insight-providers/claude.ts");
const { GET, PATCH, POST } = await import("./route.ts");

const id = "3f2b8c1e-0d4a-4e6b-9a7c-1b2c3d4e5f60", materialId = "6a000000-0000-4000-8000-000000000001", lectureId = "5a000000-0000-4000-8000-000000000001";
const versionId = "7a000000-0000-4000-8000-000000000001", slideId = "8a000000-0000-4000-8000-000000000001";
const metrics = { at: "", slides: 1, questions: 0, pins: 0, reactions: 0, durationMinutes: null, audience: null, peakAudience: null };
const document = { title: "리포트", metrics, sections: [{ id: "sec-a", title: "개요", text: "본문" }] };
const graph = [{ folder_id: null, lectures: [{ id: lectureId, title: "강의", status: "ended", questions: [], materials: [{ id: materialId, file_name: "a.pdf",
  material_versions: [{ id: versionId, version_no: 1, source_path: "o/a.pdf", slides: [{ id: slideId, material_version_id: versionId, page_index: 0, image_path: "o/1.jpg", source_page_index: null }] }] }] }] }];
type Turn = { role: string; text: string; cleared?: boolean; pending?: boolean; proposal?: unknown };
const updatedAt = "2026-10-27T00:00:00.000000+00:00";

// Supabase and the REST backend are faked at fetch level: the stored row (null = not the caller's) and every PATCH of it.
function fake(messages: Turn[] | null, redrafts = 0) {
  const row = messages && { redrafts, id, owner_id: "owner", material_id: materialId, lecture_id: lectureId, title: "강의", file_name: "a.pdf", status: "ready", error: null,
    document, previous_document: null, messages, created_at: updatedAt, updated_at: updatedAt, drafted_at: null };
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return Response.json({ id: "owner", aud: "authenticated", is_anonymous: false });
    if (target.includes("/rest/v1/profiles")) return Response.json({ role: "admin" });
    if (target.includes("/api/instructor/courses")) return Response.json(graph);
    if (target.includes("/api/instructor/folders")) return Response.json([]);
    if (init?.method === "PATCH") {
      const values = JSON.parse(String(init.body));
      writes.push(values); Object.assign(row!, values);
      return Response.json([row]);
    }
    return Response.json(row ? [row] : []);
  }) as typeof fetch;
  return writes;
}
const call = (method: "GET" | "PATCH" | "POST", body?: unknown, headers: Record<string, string> = { Authorization: "Bearer owner" }, reportId = id) => {
  const request = new Request(`http://local/api/admin/reports/${reportId}`, { method, headers, ...body === undefined ? {} : { body: JSON.stringify(body) } });
  return ({ GET, PATCH, POST })[method](request, { params: Promise.resolve({ id: reportId }) });
};
const chat = () => call("POST", { action: "chat", message: "요약해 줘" });
const env = { NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p", SUPABASE_SERVICE_ROLE_KEY: "s", CLAUDE_API_KEY: "c", REST_API_URL: "http://localhost:9" };

test("reports are owner-only: no token is 401, a bad id or someone else's report is 404", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    fake([]);
    assert.equal((await call("GET", undefined, {})).status, 401);
    assert.equal((await call("GET", undefined, undefined, "not-a-uuid")).status, 404);
    assert.equal((await call("GET")).status, 200);
    fake(null);
    assert.equal((await call("GET")).status, 404);
    assert.equal((await chat()).status, 404);
  } finally { globalThis.fetch = realFetch; }
});

test("a save with a stale updatedAt is refused with 409 and the current report, never written", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    let writes = fake([]);
    const stale = await call("PATCH", { document, updatedAt: "2026-10-26T00:00:00Z" });
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.deepEqual([body.error, body.report.updatedAt], ["REPORT_CONFLICT", updatedAt]);
    assert.equal(writes.length, 0);
    writes = fake([]);
    const saved = await call("PATCH", { document: { ...document, sections: [{ id: "sec-a", title: "개요", text: "고친 본문" }] }, updatedAt });
    assert.equal(saved.status, 200);
    assert.equal((writes[0].document as typeof document).sections[0].text, "고친 본문");
  } finally { globalThis.fetch = realFetch; }
});

test("a chat question is reserved first, refunded on failure, kept when stopped, limited to 5, and saves the model's proposal", async () => {
  const realFetch = globalThis.fetch, realChat = claude.chat;
  Object.assign(process.env, env);
  try {
    // Answered with a proposal: the reservation becomes the saved question and an answer carrying the validated proposal.
    let writes = fake([]);
    claude.chat = async function* ({ runTool }) {
      await runTool("propose_document", { replace: [{ id: "sec-a", title: "개요", text: "새 본문" }], insert: [], remove: [] });
      yield "답";
    };
    assert.equal(await (await chat()).text(), "답");
    assert.equal((writes[0].messages as Turn[]).at(-1)?.pending, true);
    const saved = writes.at(-1)!.messages as Turn[];
    assert.deepEqual(saved.map((turn) => [turn.role, turn.text]), [["user", "요약해 줘"], ["assistant", "답"]]);
    assert.deepEqual(saved[1].proposal, { replace: [{ id: "sec-a", title: "개요", text: "새 본문" }], insert: [], remove: [] });

    // AI failure: the question is refunded.
    writes = fake([]);
    claude.chat = async function* () { throw new Error("AI down"); };
    await assert.rejects((await chat()).text());
    assert.deepEqual(writes.at(-1)!.messages, []);

    // Stopped by the instructor: the question stays spent, its text is not kept, and a second tab is refused meanwhile.
    writes = fake([]);
    let release!: () => void;
    claude.chat = async function* ({ signal }) {
      yield "부분";
      await new Promise<void>((resolve) => { release = resolve; signal?.addEventListener("abort", () => resolve()); });
      signal?.throwIfAborted();
    };
    const reader = (await chat()).body!.getReader();
    await reader.read();
    const busy = await chat();
    assert.equal(busy.status, 409);
    assert.equal((await busy.json()).error, "CHAT_BUSY");
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual((writes.at(-1)!.messages as Turn[]).map((turn) => [turn.role, turn.text, turn.cleared, turn.pending]), [["user", "", true, undefined]]);
    release?.();

    // A reservation left by a server restart is dropped, so 4 asked + 1 stale pending still allows a 5th question; 5 asked is the limit.
    const asked = (n: number) => [...Array(n)].map((): Turn => ({ role: "user", text: "q" }));
    fake([...asked(4), { role: "user", text: "", cleared: true, pending: true }]);
    claude.chat = async function* () { yield "답"; };
    assert.equal((await chat()).status, 200);
    fake(asked(5));
    const limited = await chat();
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, "CHAT_LIMIT");
  } finally {
    globalThis.fetch = realFetch;
    claude.chat = realChat;
  }
});

test("an AI redraft over a document stops at 2 per report and refuses before any AI or storage work", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    const writes = fake([], 2), limited = await call("POST", { action: "redraft" });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, "REDRAFT_LIMIT");
    assert.deepEqual(writes, []);
  } finally { globalThis.fetch = realFetch; }
});
