"use client";

import { pdfPageImagePath } from "@/app/_model/upload";
import { getSupabaseClient } from "@/app/_infrastructure/supabase/client";
import { acquirePdfDocument, PDF_PAGE_WIDTHS } from "./pdf-document";

const started = new Set<string>();

/**
 * The owner's browser renders each page of a source PDF once with pdf.js and stores it beside the source, so
 * `/api/pdf/page` serves it without rendering on the server (docs/frontend-performance-audit.md, 2026-11-07: the
 * 2 GB EC2 host stalled on photo-heavy pages). One page renders at a time.
 *
 * `sourcePath` may still be uploading (a promise): pages render meanwhile and upload once it resolves, so an upload
 * waits for at most the longer of the two. With a known path only the missing `pages` (1-based) render, and a deck
 * already complete never opens the PDF. Resolves false on any failure; the server renders what is missing.
 */
export async function storePdfPageImages(url: string, sourcePath: string | Promise<string>, pages?: readonly number[]) {
  const client = getSupabaseClient();
  if (!client || started.has(url)) return false;
  started.add(url);
  const bucket = client.storage.from("course-materials");
  let lease: ReturnType<typeof acquirePdfDocument> | undefined;
  try {
    let have = new Set<string>();
    if (typeof sourcePath === "string") {
      const folder = pdfPageImagePath(sourcePath, 0).replace(/\/0\.jpg$/, "");
      const { data, error } = await bucket.list(folder, { limit: 10_000 });
      if (error) throw error;
      have = new Set(data.map((file) => `${folder}/${file.name}`));
      if (pages?.every((page) => have.has(pdfPageImagePath(sourcePath, page)))) return true;
    }
    lease = acquirePdfDocument(url);
    const pdf = await lease.promise;
    let uploads = Promise.resolve();
    for (const number of pages ?? Array.from({ length: pdf.numPages }, (_, index) => index + 1)) {
      if (typeof sourcePath === "string" && have.has(pdfPageImagePath(sourcePath, number))) continue;
      const image = await renderPage(pdf, number);
      uploads = uploads.then(async () => {
        const { error } = await bucket.upload(pdfPageImagePath(await sourcePath, number), image, { contentType: "image/jpeg", upsert: false });
        // Another tab of the same owner may have stored this page first.
        if (error && !/exists|duplicate/i.test(error.message)) throw error;
      });
    }
    await uploads;
    return true;
  } catch (error) {
    started.delete(url);
    console.warn("PDF page images not stored", error);
    return false;
  } finally {
    void lease?.release();
  }
}

async function renderPage(pdf: Awaited<ReturnType<typeof acquirePdfDocument>["promise"]>, number: number) {
  const page = await pdf.getPage(number), base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: PDF_PAGE_WIDTHS.full / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  page.cleanup();
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  canvas.width = canvas.height = 0;
  if (!image) throw new Error("PAGE_IMAGE_ENCODE_FAILED");
  return image;
}
