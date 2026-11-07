import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { PAGE_WIDTHS, pdfPageImage, warmPdfPages } from "@/app/_infrastructure/server/pdf-page";
import { getSupabaseClientForToken, supabaseServerConfigured } from "@/app/_infrastructure/supabase/server";

const SOURCE_BUCKET = "course-materials";
/** Same shape `/api/pdf` accepts: `{owner uuid}/{upload uuid}/source.pdf`. */
const SOURCE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.pdf$/;

/**
 * One source PDF page as a JPEG (docs/frontend-performance-audit.md, 2026-10-31).
 *
 * Like `/api/pdf`, every request reads the Storage metadata with the caller's JWT, so the owner-or-live RLS gate
 * applies each time even when the image is cached (`pdfPageImage` renders each page once per server and size).
 */
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const client = token && supabaseServerConfigured ? getSupabaseClientForToken(token) : null;
  if (!client) return Response.json({ error: "Authentication required" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sourcePath = params.get("path") ?? "", page = Number(params.get("page")), width = Number(params.get("w"));
  if (!SOURCE_PATH.test(sourcePath) || !Number.isInteger(page) || page < 1 || page > 10_000 || !PAGE_WIDTHS.has(width)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const bucket = client.storage.from(SOURCE_BUCKET);
  const { data: info, error } = await bucket.info(sourcePath);
  if (error || !info) return Response.json({ error: "Not available" }, { status: 403 });

  const download = async () => {
    const { data, error: downloadError } = await bucket.download(sourcePath).asStream();
    if (downloadError || !data) throw downloadError ?? new Error("PDF download failed");
    return data;
  };
  // Only a request that passed the RLS check starts the deck's warm-up (docs/frontend-performance-audit.md, 2026-11-07).
  warmPdfPages(sourcePath, page, download);
  try {
    const image = await pdfPageImage(sourcePath, page, width, download);
    return new Response(Readable.toWeb(createReadStream(image)) as ReadableStream, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (failure) {
    // pdftoppm exits 99 for a page past the end of the document.
    if ((failure as { code?: unknown }).code === 99) return Response.json({ error: "Page not found" }, { status: 404 });
    console.error("PDF page render failed", failure);
    return Response.json({ error: "Render failed" }, { status: 502 });
  }
}
