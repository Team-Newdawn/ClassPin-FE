import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

test("page images render once per size, are cached on disk, and still check RLS on every request", { timeout: 30_000 }, async () => {
  const sourcePath = `${randomUUID()}/${randomUUID()}/source.pdf`;
  const pdf = await PDFDocument.create();
  pdf.addPage([960, 540]);
  pdf.addPage([960, 540]);
  const bytes = Buffer.from(await pdf.save());
  let allowed = true, downloads = 0;
  const storage = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer caller");
    if (req.url?.includes("/object/info/")) {
      res.writeHead(allowed ? 200 : 403, { "Content-Type": "application/json" });
      res.end(JSON.stringify(allowed ? { size: bytes.length } : { message: "denied", statusCode: "403" }));
      return;
    }
    downloads += 1;
    res.writeHead(200, { "Content-Length": bytes.length });
    res.end(bytes);
  });
  await new Promise((resolve) => storage.listen(0, "127.0.0.1", resolve));
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, mode: process.env.NEXT_PUBLIC_DATA_MODE };
  process.env.NEXT_PUBLIC_DATA_MODE = "rest";
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${storage.address().port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") return next(new URL("../../../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, context);
      return next(specifier.startsWith("@/") ? new URL(`../../../../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
    },
  });
  const request = (query, token = "caller") => new Request(`http://localhost/api/pdf/page?path=${sourcePath}&${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try {
    const { GET } = await import("./route.ts");
    const [first, same] = await Promise.all([GET(request("page=2&w=640")), GET(request("page=2&w=640"))]);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Content-Type"), "image/jpeg");
    assert.equal(first.headers.get("Cache-Control"), "no-store");
    const jpeg = Buffer.from(await first.arrayBuffer());
    assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8], "a JPEG");
    assert.deepEqual(Buffer.from(await same.arrayBuffer()), jpeg, "concurrent requests share one render");
    assert.equal((await GET(request("page=1&w=1920"))).status, 200);
    assert.equal(downloads, 1, "the source downloads once and stays in the disk cache");

    assert.equal((await GET(request("page=3&w=640"))).status, 404, "past the last page");
    assert.equal((await GET(request("page=1&w=800"))).status, 400, "only the two sizes");
    assert.equal((await GET(request("page=0&w=640"))).status, 400);
    assert.equal((await GET(request("page=1&w=640", ""))).status, 401);
    allowed = false;
    assert.equal((await GET(request("page=2&w=640"))).status, 403, "a cached image cannot bypass revocation");
  } finally {
    hooks.deregister();
    for (const [name, value] of [["NEXT_PUBLIC_SUPABASE_URL", previous.url], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previous.key], ["NEXT_PUBLIC_DATA_MODE", previous.mode]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    storage.closeAllConnections();
    await new Promise((resolve) => storage.close(() => resolve()));
    for (const key of [sourcePath, `${sourcePath}#p2@640`, `${sourcePath}#p1@1920`]) {
      await rm(path.join(os.tmpdir(), "ohpin-pdf-cache", createHash("sha1").update(key).digest("hex")), { force: true });
    }
  }
});
