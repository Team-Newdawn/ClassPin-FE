import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { pdfPageImagePath } from "../../_model/upload.ts";
import { resolveDocumentBinary } from "./document-binaries.ts";
import { limiter } from "./limiter.ts";
import { cachedFile } from "./pdf-cache.ts";

const run = promisify(execFile);
/** Long edge in pixels: thumbnails and the stage/presentation (and report exports). Only these two, so the cache stays two files per page. */
export const PAGE_WIDTHS = new Set([640, 1920]);
const FULL_WIDTH = 1920;
type Slot = ReturnType<typeof limiter>;
const slots = globalThis as { pdfPageRender?: Slot; pdfium?: Slot };
/** pdftoppm is CPU-bound and shares the server with live lectures. */
const renderSlot = slots.pdfPageRender ??= limiter(2);
/**
 * PDFium draws photo-heavy pages 5-9x faster than pdftoppm (2026-11-07, 51 MB deck: 8.6 s → 1.0 s) but holds the whole PDF
 * and its decoded images in memory (250-500 MB there), so one runs at a time per server and larger sources go to pdftoppm.
 */
const pdfiumSlot = slots.pdfium ??= limiter(1);
const PDFIUM_MAX_SOURCE_BYTES = 150 * 1024 ** 2;
/**
 * PDFium only when this much memory is free for the process (host and container limit, Node's `availableMemory`).
 * 2026-11-07: on the 2 GB swapless EC2 host (~400 MB free, 1 GiB container) PDFium plus a warm-up ran it out of memory and
 * the backend stopped answering, so there it always falls back to pdftoppm (~90 MB) until the host or the cap grows.
 */
const PDFIUM_MIN_FREE_BYTES = 1024 ** 3;
const pdfiumScript = path.join(/* turbopackIgnore: true */ process.cwd(), "app/_infrastructure/server/pdfium-page.mjs");
const PAST_LAST_PAGE = 99;
/** A stored page image is the owner's 1920px JPEG (~150-350 KB); anything else is ignored and the page is rendered. */
const MAX_STORED_BYTES = 5 * 1024 ** 2;

async function storedPageImage(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [], reader = stream.getReader();
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.length;
    if (size > MAX_STORED_BYTES) { void reader.cancel(); return null; }
    chunks.push(part.value);
  }
  const image = Buffer.concat(chunks), meta = await sharp(image).metadata().catch(() => null);
  return meta?.format === "jpeg" && Math.max(meta.width ?? Infinity, meta.height ?? Infinity) <= FULL_WIDTH ? image : null;
}

/**
 * One source PDF page as a JPEG on disk, rendered once per server and size (docs/frontend-performance-audit.md, 2026-10-31).
 * `/api/pdf/page` and report exports (RPT-060) share these files, so a slide seen in the player exports without re-rendering.
 * The caller checks access first; `download()` streams the source PDF, which shares `/api/pdf`'s cache key, and
 * `download(path)` another object of that folder: the page image the owner's browser stored (2026-11-07), used first.
 * A page past the end rejects with exit code 99 (PDFium script and pdftoppm alike). `slot` bounds concurrent renders; the default two keep live
 * lectures responsive when many viewers miss the cache at once.
 */
export function pdfPageImage(sourcePath: string, page: number, width: number, download: (path?: string) => Promise<ReadableStream>, slot = renderSlot): Promise<string> {
  return cachedFile(`${sourcePath}#p${page}@${width}`, async () => {
    // pdftoppm takes nearly as long at 640px as at 1920px (2026-11-07: 8.2 s vs 8.8 s on a heavy page), so a thumbnail is the full page shrunk.
    if (width !== FULL_WIDTH) {
      const full = await pdfPageImage(sourcePath, page, FULL_WIDTH, download, slot);
      return new Blob([new Uint8Array(await sharp(full).resize(width, width, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer())]).stream();
    }
    const stored = await download(pdfPageImagePath(sourcePath, page)).then(storedPageImage, () => null);
    if (stored) return new Blob([new Uint8Array(stored)]).stream();
    const pdf = await cachedFile(sourcePath, () => download());
    const options = { encoding: "buffer" as const, maxBuffer: 32 * 1024 ** 2, timeout: 60_000 };
    if (process.availableMemory() >= PDFIUM_MIN_FREE_BYTES && (await stat(pdf)).size <= PDFIUM_MAX_SOURCE_BYTES) {
      try {
        const { stdout, stderr } = await slot(() => pdfiumSlot(() => run(process.execPath, [pdfiumScript, pdf, String(page), String(width)], options)));
        const [pixelWidth, pixelHeight] = String(stderr).split("x").map(Number);
        const jpeg = await sharp(stdout, { raw: { width: pixelWidth, height: pixelHeight, channels: 4 } }).removeAlpha().jpeg({ quality: 82 }).toBuffer();
        return new Blob([new Uint8Array(jpeg)]).stream();
      } catch (error) {
        if ((error as { code?: unknown }).code === PAST_LAST_PAGE) throw error;
        // Killed for memory, a timeout or a PDF PDFium cannot read: pdftoppm still draws it, only slower.
        console.error("PDFium page render failed; using pdftoppm", (error as Error).message?.slice(0, 200));
      }
    }
    const pdftoppm = await resolveDocumentBinary("pdftoppm");
    const { stdout } = await slot(() => run(pdftoppm, ["-jpeg", "-jpegopt", "quality=82", "-singlefile", "-f", String(page), "-l", String(page), "-scale-to", String(width), pdf], options));
    return new Blob([new Uint8Array(stdout)]).stream();
  });
}

