import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { restRequest } from "./request.ts";

const client = (token: string | null, anonymous = false) => ({
  auth: { getSession: async () => ({ data: { session: token ? {
    access_token: token, user: { is_anonymous: anonymous },
  } : null }, error: null }) },
}) as unknown as SupabaseClient;

test("REST forwards the caller JWT and JSON; empty success and API errors are handled", async () => {
  const requests: { url?: string; token?: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, token: req.headers.authorization, body });
    if (req.url?.endsWith("/denied")) {
      res.writeHead(403, { "Content-Type": "application/json" }).end('{"error":"Access denied"}');
    } else if (req.url?.endsWith("/missing")) res.writeHead(404).end("Not found");
    else if (req.url?.endsWith("/failed")) {
      res.writeHead(502).end("upstream unavailable");
    } else if (req.method === "PATCH") res.writeHead(204).end();
    else res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"folder"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => originalFetch(`http://127.0.0.1:${address.port}${input}`, init);
  try {
    assert.deepEqual(await restRequest(client("owner"), "/instructor/folders", "POST", { purpose: "education" }), { id: "folder" });
    assert.equal(await restRequest(client("owner"), "/instructor/folders/folder", "PATCH", { name: "Updated" }), undefined);
    await restRequest(client("audience", true), "/participant/experience", "POST", { code: "PIN123" });
    assert.deepEqual(requests[0], { url: "/api/rest/instructor/folders", token: "Bearer owner", body: '{"purpose":"education"}' });
    assert.equal(requests[2].token, "Bearer audience");
    await assert.rejects(restRequest(client("owner"), "/instructor/denied"), /Access denied/);
    await assert.rejects(restRequest(client("owner"), "/instructor/failed"), /502.*upstream unavailable/);
    await assert.rejects(restRequest(client("owner"), "/instructor/missing"), (error: Error & { status?: number }) => error.status === 404 && /404.*Not found/.test(error.message));
    const count = requests.length;
    await assert.rejects(restRequest(client(null), "/instructor/folders"), /session/i);
    await assert.rejects(restRequest(client("audience", true), "/instructor/folders"), /instructor/i);
    await assert.rejects(restRequest(client("owner"), "/participant/experience"), /participant/i);
    assert.equal(requests.length, count, "invalid identities must fail before a network request");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
