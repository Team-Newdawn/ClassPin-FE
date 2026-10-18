import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pipeToNodeResponse } from "next/dist/server/pipe-readable.js";

test("PDF headers and ranges do not wait for the full cache; cached bytes still require RLS", { timeout: 10_000 }, async () => {
  const sourcePath = `${randomUUID()}/${randomUUID()}/source.pdf`;
  const smallSourcePath = `${randomUUID()}/${randomUUID()}/source.pdf`;
  const bytes = Buffer.from(Array.from({ length: 600_000 }, (_, i) => i % 251));
  let allowed = true;
  let fullFetches = 0;
  let rangeFetches = 0;
  const complete = Promise.withResolvers();
  const started = Promise.withResolvers();
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer caller");
    const fileBytes = req.url.includes(smallSourcePath) ? bytes.subarray(0, 200_000) : bytes;
    if (req.url?.includes("/object/info/")) {
      res.writeHead(allowed ? 200 : 403, { "Content-Type": "application/json" });
      res.end(JSON.stringify(allowed ? { size: fileBytes.length } : { message: "denied", statusCode: "403" }));
      return;
    }
    if (req.headers.range) {
      rangeFetches += 1;
      assert.ok(["bytes=0-524287", "bytes=524288-599999"].includes(req.headers.range));
      const [start, end] = req.headers.range.slice(6).split("-").map(Number);
      res.writeHead(206, { "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${bytes.length}` });
      res.end(bytes.subarray(start, end + 1));
      return;
    }
    fullFetches += 1;
    res.writeHead(200, { "Content-Length": fileBytes.length });
    res.write(fileBytes.subarray(0, 100));
    started.resolve();
    await complete.promise;
    res.end(fileBytes.subarray(100));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const previousMode = process.env.NEXT_PUBLIC_DATA_MODE;
  process.env.NEXT_PUBLIC_DATA_MODE = "rest";
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return next(specifier.startsWith("@/") ? new URL(`../../../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
    },
  });
  const request = (range, token = "caller", source = sourcePath) => new Request(`http://localhost/api/pdf?path=${source}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(range ? { Range: range } : {}) },
  });
  let appServer;
  try {
    const { GET } = await import("./route.ts");
    appServer = createServer(async (req, res) => {
      try {
        const response = await GET(new Request(`http://localhost${req.url}`, { headers: req.headers }));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        await pipeToNodeResponse(response.body, res);
      } catch (error) { res.destroy(error); }
    });
    await new Promise(resolve => appServer.listen(0, "127.0.0.1", resolve));
    const aborter = new AbortController();
    const deadline = setTimeout(() => aborter.abort(), 2000);
    let probe;
    try {
      probe = await fetch(`http://127.0.0.1:${appServer.address().port}/api/pdf?path=${sourcePath}`, {
        headers: { Authorization: "Bearer caller" }, signal: aborter.signal,
      });
    } finally { clearTimeout(deadline); }
    assert.equal(probe.status, 200);
    assert.equal(probe.headers.get("Cache-Control"), "no-store");
    assert.equal(probe.headers.get("Content-Length"), String(bytes.length));
    const fullBody = probe.arrayBuffer();
    await started.promise;

    const partials = await Promise.all([GET(request("bytes=10-99")), GET(request("bytes=10-99"))]);
    for (const response of partials) {
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("Content-Range"), `bytes 10-99/${bytes.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(10, 100));
    }
    assert.equal(rangeFetches, 1, "coalesce the same range while the full download is blocked");
    const spanning = await GET(request("bytes=524280-524299"));
    assert.equal(spanning.status, 206);
    assert.deepEqual(Buffer.from(await spanning.arrayBuffer()), bytes.subarray(524280, 524300));
    assert.equal(rangeFetches, 2, "split a crossing range into bounded reusable blocks");
    complete.resolve();
    assert.deepEqual(Buffer.from(await fullBody), bytes);
    const warm = await GET(request("bytes=10-99"));
    assert.deepEqual(Buffer.from(await warm.arrayBuffer()), bytes.subarray(10, 100));
    assert.equal(rangeFetches, 2);
    assert.equal(fullFetches, 1);
    const small = await GET(request(undefined, "caller", smallSourcePath));
    assert.equal(small.headers.get("Accept-Ranges"), "none", "avoid range negotiation for small PDFs");
    assert.deepEqual(Buffer.from(await small.arrayBuffer()), bytes.subarray(0, 200_000));

    assert.equal((await GET(request("bytes=600000-"))).status, 416);
    assert.equal((await GET(request("bytes=99-10"))).status, 416);
    assert.equal((await GET(request(undefined, ""))).status, 401);
    assert.equal((await GET(request(undefined, "caller", "../source.pdf"))).status, 400);
    allowed = false;
    assert.equal((await GET(request())).status, 403, "a complete disk cache cannot bypass revocation");
    assert.equal((await GET(request("bytes=10-99"))).status, 403);
  } finally {
    complete.resolve();
    hooks.deregister();
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = previousMode;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    appServer?.closeAllConnections();
    if (appServer) await new Promise(resolve => appServer.close(() => resolve()));
    server.closeAllConnections();
    await new Promise(resolve => server.close(() => resolve()));
    for (const key of [sourcePath, smallSourcePath, `${sourcePath}#0-524287`, `${sourcePath}#524288-599999`]) {
      await rm(path.join(os.tmpdir(), "ohpin-pdf-cache", createHash("sha1").update(key).digest("hex")), { force: true });
    }
  }
});
