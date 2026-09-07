"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

type CachedDocument = {
  cleanup?: ReturnType<typeof setTimeout>;
  disposed: boolean;
  loadingTask?: PDFDocumentLoadingTask;
  promise: Promise<PDFDocumentProxy>;
  refs: number;
};

const documents = new Map<string, CachedDocument>();
const CLEANUP_DELAY_MS = 30_000;

function createDocument(url: string): CachedDocument {
  const entry = { disposed: false, refs: 0 } as CachedDocument;
  entry.promise = import("pdfjs-dist/webpack.mjs")
    .then((pdfjs) => {
      if (entry.disposed) throw new Error("PDF 로드가 취소됐습니다.");
      const loadingTask = pdfjs.getDocument({
        url,
        cMapUrl: "/pdfjs/cmaps/",
        iccUrl: "/pdfjs/iccs/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
      });
      entry.loadingTask = loadingTask;
      return loadingTask.promise;
    })
    .catch((error) => {
      if (documents.get(url) === entry) documents.delete(url);
      throw error;
    });
  return entry;
}

export function acquirePdfDocument(url: string) {
  let entry = documents.get(url);
  if (!entry) {
    entry = createDocument(url);
    documents.set(url, entry);
  }
  if (entry.cleanup) clearTimeout(entry.cleanup);
  entry.refs += 1;

  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      entry!.refs -= 1;
      if (entry!.refs > 0) return;
      entry!.cleanup = setTimeout(() => {
        if (entry!.refs > 0 || documents.get(url) !== entry) return;
        entry!.disposed = true;
        documents.delete(url);
        void entry!.loadingTask?.destroy();
      }, CLEANUP_DELAY_MS);
    },
  };
}

export async function getPdfPageCount(url: string) {
  const document = acquirePdfDocument(url);
  try {
    return (await document.promise).numPages;
  } finally {
    document.release();
  }
}
