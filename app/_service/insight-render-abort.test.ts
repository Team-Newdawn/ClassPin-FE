import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";

const serverOnly = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(serverOnly)} : specifier, context); }`), import.meta.url);
const { renderSlidePages } = await import("./insight-request.ts");

test("aborting an export render stops poppler instead of rendering the whole deck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "render-abort-"));
  try {
    const doc = await PDFDocument.create();
    for (let page = 0; page < 300; page += 1) doc.addPage([960, 540]).drawText(`slide ${page + 1}`, { x: 40, y: 260, size: 48 });
    const pdf = join(dir, "deck.pdf");
    await writeFile(pdf, await doc.save());
    const out = await mkdtemp(join(dir, "out-")), stop = new AbortController();
    const started = Date.now();
    setTimeout(() => stop.abort(), 150);
    await assert.rejects(renderSlidePages(pdf, out, undefined, stop.signal), { name: "AbortError" });
    assert.ok(Date.now() - started < 2_000, "returns as soon as it is aborted");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = (await readdir(out)).length;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal((await readdir(out)).length, after, "no poppler process keeps writing pages");
    assert.ok(after < 300);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
