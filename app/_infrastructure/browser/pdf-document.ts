"use client";

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { getAccessToken } from "@/app/_infrastructure/supabase/client";

type CachedDocument = {
  cleanup?: ReturnType<typeof setTimeout>;
  disposed: boolean;
  loadingTask?: PDFDocumentLoadingTask;
  promise: Promise<PDFDocumentProxy>;
  refs: number;
};

const documents = new Map<string, CachedDocument>();
const CLEANUP_DELAY_MS = 30_000;

/** 같은 origin 의 PDF 프록시는 세션 토큰으로 인증한다. blob: URL 등 그 밖의 원본은 헤더 없이 읽는다. */
async function pdfRequestHeaders(url: string) {
  if (!url.startsWith("/api/pdf?")) return undefined;
  const token = await getAccessToken(new URL(url, location.origin).searchParams.has("audience"));
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function createDocument(url: string, key: string, thumbnail: boolean): CachedDocument {
  const entry = { disposed: false, refs: 0 } as CachedDocument;
  entry.promise = Promise.all([import("pdfjs-dist/webpack.mjs"), pdfRequestHeaders(url)])
    .then(([pdfjs, httpHeaders]) => {
      if (entry.disposed) throw new Error("PDF 로드가 취소됐습니다.");
      const loadingTask = pdfjs.getDocument({
        url,
        httpHeaders,
        cMapUrl: "/pdfjs/cmaps/",
        iccUrl: "/pdfjs/iccs/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        // 썸네일은 그릴 페이지에 필요한 구간만 Range 로 받는다. 기본값은 파일 전체를 계속 내려받는다.
        ...(thumbnail ? { disableStream: true, disableAutoFetch: true } : {}),
      });
      entry.loadingTask = loadingTask;
      return loadingTask.promise;
    })
    .catch((error) => {
      if (documents.get(key) === entry) documents.delete(key);
      throw error;
    });
  return entry;
}

/** 썸네일은 같은 url 의 전체 문서가 이미 열려 있으면 그것을 같이 쓰고, 없을 때만 따로 연다. */
export function acquirePdfDocument(url: string, thumbnail = false) {
  const key = thumbnail && !documents.has(url) ? `${url}#thumbnail` : url;
  let entry = documents.get(key);
  if (!entry) {
    entry = createDocument(url, key, key !== url);
    documents.set(key, entry);
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
        if (entry!.refs > 0 || documents.get(key) !== entry) return;
        entry!.disposed = true;
        documents.delete(key);
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
