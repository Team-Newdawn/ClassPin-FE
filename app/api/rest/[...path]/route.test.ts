import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { POST } from "./route.ts";

test("REST proxy drops browser Origin/cookies, preserves JWT/body and streams NDJSON", async () => {
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.origin, undefined);
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers.authorization, "Bearer caller");
    assert.equal(req.url, "/api/convert");
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.deepEqual(JSON.parse(body), { sourcePath: "owner/source.pptx", fileName: "deck.pptx" });
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.write('{"type":"meta","total":1}\n');
    setTimeout(() => res.end('{"type":"done"}\n'), 10);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const originalUrl = process.env.REST_API_URL;
  process.env.REST_API_URL = `http://127.0.0.1:${address.port}`;
  try {
    const response = await POST(new Request("http://localhost:3001/api/rest/convert", {
      method: "POST", headers: { Authorization: "Bearer caller", Origin: "http://localhost:3001", Cookie: "private=session", "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePath: "owner/source.pptx", fileName: "deck.pptx" }),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/x-ndjson");
    assert.equal(await response.text(), '{"type":"meta","total":1}\n{"type":"done"}\n');
    assert.equal((await POST(new Request("http://localhost/api/rest/convert", { method: "POST" }))).status, 401);
    process.env.REST_API_URL = "http://unsafe.example";
    assert.equal((await POST(new Request("http://localhost/api/rest/convert", { method: "POST", headers: { Authorization: "Bearer caller" } }))).status, 502);
  } finally {
    if (originalUrl === undefined) delete process.env.REST_API_URL;
    else process.env.REST_API_URL = originalUrl;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
