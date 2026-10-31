import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { resolveDocumentBinary } from "@/app/_infrastructure/server/document-binaries";
import { limiter } from "@/app/_infrastructure/server/limiter";
import { cachedFile } from "@/app/_infrastructure/server/pdf-cache";
import { getSupabaseClientForToken, supabaseServerConfigured } from "@/app/_infrastructure/supabase/server";

const run = promisify(execFile);
const SOURCE_BUCKET = "course-materials";
/** Same shape `/api/pdf` accepts: `{owner uuid}/{upload uuid}/source.pdf`. */
const SOURCE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.pdf$/;
/** Long edge in pixels: thumbnails and the stage/presentation. Only these two, so the cache stays two files per page. */
const WIDTHS = new Set([640, 1920]);
/** pdftoppm is CPU-bound and shares the server with live lectures. */
const renderSlot: ReturnType<typeof limiter> = ((globalThis as { pdfPageRender?: ReturnType<typeof limiter> }).pdfPageRender ??= limiter(2));

/**
 * One source PDF page as a JPEG (docs/frontend-performance-audit.md, 2026-10-31).
 *
 * Like `/api/pdf`, every request reads the Storage metadata with the caller's JWT, so the owner-or-live RLS gate
 * applies each time even when the image is cached. The source shares `/api/pdf`'s disk cache key; the page is
 * rendered once per server and size, then served from disk.
 */
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const client = token && supabaseServerConfigured ? getSupabaseClientForToken(token) : null;
  if (!client) return Response.json({ error: "Authentication required" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sourcePath = params.get("path") ?? "", page = Number(params.get("page")), width = Number(params.get("w"));
  if (!SOURCE_PATH.test(sourcePath) || !Number.isInteger(page) || page < 1 || page > 10_000 || !WIDTHS.has(width)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const bucket = client.storage.from(SOURCE_BUCKET);
  const { data: info, error } = await bucket.info(sourcePath);
  if (error || !info) return Response.json({ error: "Not available" }, { status: 403 });

  try {
    const image = await cachedFile(`${sourcePath}#p${page}@${width}`, async () => {
      const pdf = await cachedFile(sourcePath, async () => {
        const { data, error: downloadError } = await bucket.download(sourcePath).asStream();
        if (downloadError || !data) throw downloadError ?? new Error("PDF download failed");
        return data;
      });
      const pdftoppm = await resolveDocumentBinary("pdftoppm");
      const { stdout } = await renderSlot(() => run(pdftoppm, ["-jpeg", "-jpegopt", "quality=82", "-singlefile", "-f", String(page), "-l", String(page), "-scale-to", String(width), pdf],
        { encoding: "buffer", maxBuffer: 32 * 1024 ** 2, timeout: 60_000 }));
      return new Blob([new Uint8Array(stdout)]).stream();
    });
    return new Response(Readable.toWeb(createReadStream(image)) as ReadableStream, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (failure) {
    // pdftoppm exits 99 for a page past the end of the document.
    if ((failure as { code?: unknown }).code === 99) return Response.json({ error: "Page not found" }, { status: 404 });
    console.error("PDF page render failed", failure);
    return Response.json({ error: "Render failed" }, { status: 502 });
  }
}
