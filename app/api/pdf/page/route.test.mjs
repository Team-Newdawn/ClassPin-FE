import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

test("page images prefer the owner's stored JPEG, render once per page otherwise, thumbnails shrink the full page, and RLS is checked on every request", { timeout: 30_000 }, async () => {
  const sourcePath = `${randomUUID()}/${randomUUID()}/source.pdf`;
  const pdf = await PDFDocument.create();
  for (let page = 0; page < 3; page++) pdf.addPage([960, 540]);
  const bytes = Buffer.from(await pdf.save());
  // Page 3 has a stored image from the owner's browser; page 1 has a broken one that must be ignored.
  const stored = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const pages = { 3: stored, 1: Buffer.from("not a jpeg") };
  let allowed = true, downloads = 0;
  const storage = createServer((req, res) => {
    const page = /\/pages\/(\d+)\.jpg$/.exec(req.url ?? "")?.[1];
    if (page) {
      const body = pages[page];
      res.writeHead(body ? 200 : 400, { "Content-Type": body ? "image/jpeg" : "application/json" });
      res.end(body ?? JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }));
      return;
    }
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
  const cacheFile = (key) => path.join(os.tmpdir(), "ohpin-pdf-cache", createHash("sha1").update(key).digest("hex"));
  const cached = (page, width) => cacheFile(`${sourcePath}#p${page}@${width}`);
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
    assert.deepEqual([(await sharp(jpeg).metadata()).width, (await stat(cached(2, 1920))).isFile()], [640, true], "the thumbnail is the full page shrunk");
    assert.deepEqual(Buffer.from(await (await GET(request("page=3&w=1920"))).arrayBuffer()), stored, "the stored page image is served as is");
    assert.equal((await GET(request("page=1&w=1920"))).status, 200);
    assert.equal(downloads, 1, "the source downloads once and stays in the disk cache; a broken stored image is rendered instead");

    assert.equal((await GET(request("page=4&w=640"))).status, 404, "past the last page");
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
    for (const file of [cacheFile(sourcePath), cached(2, 640), ...[1, 2, 3].map((page) => cached(page, 1920))]) await rm(file, { force: true });
  }
});
