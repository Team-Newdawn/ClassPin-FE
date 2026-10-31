import assert from "node:assert/strict";
import { register } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// Next resolves `server-only` at build time; map it for plain Node here.
const serverOnly = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(serverOnly)} : specifier, context); }`), import.meta.url);
const { GET } = await import("./route.ts");

const id = "5a000000-0000-4000-8000-000000000001", reportId = "3f2b8c1e-0d4a-4e6b-9a7c-1b2c3d4e5f60";
const env = { NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p", SUPABASE_SERVICE_ROLE_KEY: "s", REST_API_URL: "http://localhost:9" };
const stored = { started_at: "2026-10-29T01:00:00+00:00", ended_at: null, audience: 3, peak_audience: 5, samples: [{ at: "2026-10-29T01:01:00.000Z", audience: 3, slide: 1 }], slide_changes: [] };
const group = { title: "주제", summary: "요약", questionIds: ["q1"], extra: "dropped" };

// Supabase is faked at fetch level: each table returns its row only when the request filters by the caller's owner_id.
function fake(record: unknown, analysis: unknown) {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return Response.json({ id: "owner", aud: "authenticated", is_anonymous: false });
    if (target.includes("/rest/v1/profiles")) return Response.json({ role: "admin" });
    urls.push(target);
    const mine = target.includes("owner_id=eq.owner");
    if (target.includes("/rest/v1/lecture_audience_records")) return Response.json(mine && record ? [record] : []);
    if (target.includes("/rest/v1/instructor_reports")) return Response.json(mine && analysis !== undefined ? [{ id: reportId, analysis }] : []);
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return urls;
}
const call = (lectureId = id) => GET(new Request(`http://local/api/admin/lectures/${lectureId}/insights`, { headers: { Authorization: "Bearer owner" } }),
  { params: Promise.resolve({ id: lectureId }) });

test("no record and no report read as nulls; a bad id is 404", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    fake(null, undefined);
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { record: null, topics: null, reportId: null });
    assert.equal((await call("not-a-uuid")).status, 404);
  } finally { globalThis.fetch = realFetch; }
});

test("the record and topics come from the caller's rows only", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    const urls = fake(stored, { groups: [group] });
    assert.deepEqual(await (await call()).json(), {
      record: { startedAt: stored.started_at, endedAt: null, audience: 3, peakAudience: 5, samples: stored.samples, slideChanges: [] },
      topics: [{ title: "주제", summary: "요약", questionIds: ["q1"] }], reportId });
    assert.equal(urls.length, 2);
    for (const url of urls) assert.ok(url.includes("owner_id=eq.owner") && url.includes(`lecture_id=eq.${id}`), url);
    fake(stored, null);
    assert.deepEqual((await (await call()).json()).topics, null);
  } finally { globalThis.fetch = realFetch; }
});
