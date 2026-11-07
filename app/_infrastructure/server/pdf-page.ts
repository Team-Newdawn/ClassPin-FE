import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDocumentBinary } from "./document-binaries.ts";
import { limiter } from "./limiter.ts";
import { cachedFile } from "./pdf-cache.ts";

const run = promisify(execFile);
/** Long edge in pixels: thumbnails and the stage/presentation (and report exports). Only these two, so the cache stays two files per page. */
export const PAGE_WIDTHS = new Set([640, 1920]);
/** pdftoppm is CPU-bound and shares the server with live lectures. */
const renderSlot: ReturnType<typeof limiter> = ((globalThis as { pdfPageRender?: ReturnType<typeof limiter> }).pdfPageRender ??= limiter(2));

/**
 * One source PDF page as a JPEG on disk, rendered once per server and size (docs/frontend-performance-audit.md, 2026-10-31).
 * `/api/pdf/page` and report exports (RPT-060) share these files, so a slide seen in the player exports without re-rendering.
 * The caller checks access first; `download` streams the source PDF, which shares `/api/pdf`'s cache key.
 * A page past the end rejects with pdftoppm's exit code 99. `slot` bounds concurrent renders; the default two keep live
 * lectures responsive when many viewers miss the cache at once.
 */
export function pdfPageImage(sourcePath: string, page: number, width: number, download: () => Promise<ReadableStream>, slot = renderSlot) {
  return cachedFile(`${sourcePath}#p${page}@${width}`, async () => {
    const pdf = await cachedFile(sourcePath, download);
    const pdftoppm = await resolveDocumentBinary("pdftoppm");
    const { stdout } = await slot(() => run(pdftoppm, ["-jpeg", "-jpegopt", "quality=82", "-singlefile", "-f", String(page), "-l", String(page), "-scale-to", String(width), pdf],
      { encoding: "buffer", maxBuffer: 32 * 1024 ** 2, timeout: 60_000 }));
    return new Blob([new Uint8Array(stdout)]).stream();
  });
}
