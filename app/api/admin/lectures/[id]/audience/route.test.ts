import assert from "node:assert/strict";
import { register } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// Next resolves `server-only` and the extensionless `next/server` at build time; map them for plain Node here.
const serverOnly = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(serverOnly)} : specifier === "next/server" ? "next/server.js" : specifier, context); }`), import.meta.url);
const { POST } = await import("./route.ts");

const id = "5a000000-0000-4000-8000-000000000001";
const env = { NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p", SUPABASE_SERVICE_ROLE_KEY: "s", REST_API_URL: "http://localhost:9" };
const body = { audience: 3, peakAudience: 5, startedAt: "2026-10-29T01:00:00Z", endedAt: "2026-10-29T02:00:00Z",
  samples: [{ at: "2026-10-29T01:01:00Z", audience: 3, slide: 1 }], slideChanges: [{ at: "2026-10-29T01:00:30Z", slide: 2 }] };

// Supabase and the REST backend are faked at fetch level; `owned` decides what the lecture state endpoint returns.
function fake(owned: boolean) {
  const upserts: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) return Response.json({ id: "owner", aud: "authenticated", is_anonymous: false });
    if (target.includes("/rest/v1/profiles")) return Response.json({ role: "admin" });
    if (target.includes(`/api/instructor/lectures/${id}/state`)) return owned ? Response.json({ id }) : new Response("", { status: 200 });
    if (target.includes("/rest/v1/lecture_audience_records") && init?.method === "POST") { upserts.push(JSON.parse(String(init.body))); return new Response(null, { status: 201 }); }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return upserts;
}
const call = (payload: unknown) => POST(new Request(`http://local/api/admin/lectures/${id}/audience`, { method: "POST", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(payload) }),
  { params: Promise.resolve({ id }) });

test("an owned lecture stores the timeline; a flush while LIVE has endedAt null", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    let upserts = fake(true);
    assert.equal((await call(body)).status, 204);
    assert.deepEqual(upserts[0].samples, [{ at: "2026-10-29T01:01:00.000Z", audience: 3, slide: 1 }]);
    assert.deepEqual(upserts[0].slide_changes, [{ at: "2026-10-29T01:00:30.000Z", slide: 2 }]);
    upserts = fake(true);
    assert.equal((await call({ ...body, endedAt: null })).status, 204);
    assert.equal(upserts[0].ended_at, null);
  } finally { globalThis.fetch = realFetch; }
});

test("someone else's lecture is 404 and out-of-range timelines are 400, never stored", async () => {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  try {
    let upserts = fake(false);
    assert.equal((await call(body)).status, 404);
    assert.equal(upserts.length, 0);
    upserts = fake(true);
    const sample = body.samples[0];
    for (const bad of [{ samples: Array(1441).fill(sample) }, { samples: [{ ...sample, slide: 0 }] }, { samples: [{ ...sample, at: "not a date" }] },
      { slideChanges: [{ at: null, slide: 1 }] }, { slideChanges: Array(5001).fill(body.slideChanges[0]) }, { samples: undefined }]) {
      const response = await call({ ...body, ...bad });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "INVALID_REQUEST");
    }
    assert.equal(upserts.length, 0);
  } finally { globalThis.fetch = realFetch; }
});
