import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { resolveDocumentBinary } from "./document-binaries.ts";
import { limiter } from "./limiter.ts";
import { cachedFile } from "./pdf-cache.ts";

const run = promisify(execFile);
/** Long edge in pixels: thumbnails and the stage/presentation (and report exports). Only these two, so the cache stays two files per page. */
export const PAGE_WIDTHS = new Set([640, 1920]);
const FULL_WIDTH = 1920;
type Slot = ReturnType<typeof limiter>;
const slots = globalThis as { pdfPageRender?: Slot; pdfPageWarm?: Slot; pdfium?: Slot };
/** pdftoppm is CPU-bound and shares the server with live lectures. */
const renderSlot = slots.pdfPageRender ??= limiter(2);
/** Warm-up renders run one at a time beside the two request slots, at the lowest CPU priority. */
const warmSlot = slots.pdfPageWarm ??= limiter(1);
/**
 * PDFium draws photo-heavy pages 5-9x faster than pdftoppm (2026-11-07, 51 MB deck: 8.6 s → 1.0 s) but holds the whole PDF
 * and its decoded images in memory (250-500 MB there), so one runs at a time per server and larger sources go to pdftoppm.
 */
const pdfiumSlot = slots.pdfium ??= limiter(1);
const PDFIUM_MAX_SOURCE_BYTES = 150 * 1024 ** 2;
const pdfiumScript = path.join(/* turbopackIgnore: true */ process.cwd(), "app/_infrastructure/server/pdfium-page.mjs");
const PAST_LAST_PAGE = 99;

/**
 * One source PDF page as a JPEG on disk, rendered once per server and size (docs/frontend-performance-audit.md, 2026-10-31).
 * `/api/pdf/page` and report exports (RPT-060) share these files, so a slide seen in the player exports without re-rendering.
 * The caller checks access first; `download` streams the source PDF, which shares `/api/pdf`'s cache key.
 * A page past the end rejects with exit code 99 (PDFium script and pdftoppm alike). `slot` bounds concurrent renders; the default two keep live
 * lectures responsive when many viewers miss the cache at once.
 */
export function pdfPageImage(sourcePath: string, page: number, width: number, download: () => Promise<ReadableStream>, slot = renderSlot): Promise<string> {
  return cachedFile(`${sourcePath}#p${page}@${width}`, async () => {
    // pdftoppm takes nearly as long at 640px as at 1920px (2026-11-07: 8.2 s vs 8.8 s on a heavy page), so a thumbnail is the full page shrunk.
    if (width !== FULL_WIDTH) {
      const full = await pdfPageImage(sourcePath, page, FULL_WIDTH, download, slot);
      return new Blob([new Uint8Array(await sharp(full).resize(width, width, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer())]).stream();
    }
    const pdf = await cachedFile(sourcePath, download);
    const low = slot === warmSlot, options = { encoding: "buffer" as const, maxBuffer: 32 * 1024 ** 2, timeout: 60_000 };
    const command = (file: string, args: string[]) => low ? run("nice", ["-n", "19", file, ...args], options) : run(file, args, options);
    if ((await stat(pdf)).size <= PDFIUM_MAX_SOURCE_BYTES) {
      try {
        const { stdout, stderr } = await slot(() => pdfiumSlot(() => command(process.execPath, [pdfiumScript, pdf, String(page), String(width)])));
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
    const { stdout } = await slot(() => command(pdftoppm, ["-jpeg", "-jpegopt", "quality=82", "-singlefile", "-f", String(page), "-l", String(page), "-scale-to", String(width), pdf]));
    return new Blob([new Uint8Array(stdout)]).stream();
  });
}

const warmed = new Set<string>();
/**
 * After a page of a source is asked for, renders the whole deck at full size once per server process: from that page to the
 * end, then the pages before it, so later slides are ready before anyone opens them. Cached pages cost one `stat`.
 * ponytail: once per process; a deck evicted from the disk cache while the process lives renders on view again.
 */
export function warmPdfPages(sourcePath: string, from: number, download: () => Promise<ReadableStream>) {
  if (warmed.has(sourcePath)) return;
  warmed.add(sourcePath);
  void (async () => {
    // pdftoppm's 99 past the last page ends the first pass; any other failure (source gone, timeout) ends the warm-up.
    // Starts at the asked page itself: a thumbnail served from an older cache never rendered its full size (seen 2026-11-07).
    for (let page = from; ; page++) if (!await pdfPageImage(sourcePath, page, FULL_WIDTH, download, warmSlot).then(() => true, () => false)) break;
    for (let page = 1; page < from; page++) await pdfPageImage(sourcePath, page, FULL_WIDTH, download, warmSlot);
  })().catch(() => {});
}
