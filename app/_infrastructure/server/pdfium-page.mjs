// One PDF page through PDFium (WebAssembly, Apache-2.0; npm @embedpdf/pdfium, MIT), run as its own process by pdf-page.ts.
// Usage: node pdfium-page.mjs <pdf> <page> <long edge px>. Writes raw RGBA to stdout and "<width>x<height>" to stderr;
// exits 99 past the last page, like pdftoppm. A separate process so its memory (the whole PDF plus decoded images,
// up to ~500 MB on a 51 MB photo deck) is returned to the system when it ends (docs/frontend-performance-audit.md, 2026-11-07).
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { init } from "@embedpdf/pdfium";

const [pdf, pageArg, edgeArg] = process.argv.slice(2);
const pdfium = await init({ wasmBinary: await readFile(createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm")) });
pdfium.PDFiumExt_Init();
const bytes = await readFile(pdf), memory = pdfium.pdfium.wasmExports.malloc(bytes.length);
pdfium.pdfium.HEAPU8.set(bytes, memory);
const doc = pdfium.FPDF_LoadMemDocument(memory, bytes.length, "");
if (!doc) throw new Error(`PDFium could not open the document (error ${pdfium.FPDF_GetLastError()})`);
const index = Number(pageArg) - 1;
if (index >= pdfium.FPDF_GetPageCount(doc)) process.exit(99);
const page = pdfium.FPDF_LoadPage(doc, index), pageWidth = pdfium.FPDF_GetPageWidthF(page), pageHeight = pdfium.FPDF_GetPageHeightF(page);
const scale = Number(edgeArg) / Math.max(pageWidth, pageHeight), width = Math.round(pageWidth * scale), height = Math.round(pageHeight * scale);
const bitmap = pdfium.FPDFBitmap_Create(width, height, 0);
pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
// FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER: draw annotations, RGBA instead of BGRA.
pdfium.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 0x01 | 0x10);
const pixels = pdfium.FPDFBitmap_GetBuffer(bitmap);
process.stderr.write(`${width}x${height}`);
process.stdout.write(pdfium.pdfium.HEAPU8.subarray(pixels, pixels + width * height * 4));
