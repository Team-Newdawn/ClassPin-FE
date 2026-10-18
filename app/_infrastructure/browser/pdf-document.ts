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

function createDocument(url: string, key: string, httpHeaders?: Record<string, string>): CachedDocument {
  const entry = { disposed: false, refs: 0 } as CachedDocument;
  entry.promise = import("pdfjs-dist/webpack.mjs")
    .then((pdfjs) => {
      if (entry.disposed) throw new Error("PDF 로드가 취소됐습니다.");
      const loadingTask = pdfjs.getDocument({
        url,
        httpHeaders,
        cMapUrl: "/pdfjs/cmaps/",
        iccUrl: "/pdfjs/iccs/",
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        // 모든 화면이 같은 문서/worker를 사용하고, 현재 페이지에 필요한 구간만 받는다.
        worker: pdfjs.PDFWorker.create({ port: pdfjs.GlobalWorkerOptions.workerPort! }),
        disableStream: true,
        disableAutoFetch: true,
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

/** 썸네일과 큰 화면이 같은 URL·토큰의 문서를 공유한다. */
export function acquirePdfDocument(url: string) {
  // 페이지를 바꿀 때 현재 토큰을 확인한다. 긴 강의에서 갱신 전 JWT로 Range를 요청하지 않는다.
  const lease = pdfRequestHeaders(url).then((headers) => {
    const key = `${url}#${headers?.Authorization ?? ""}`;
    let entry = documents.get(key);
    if (!entry) {
      entry = createDocument(url, key, headers);
      documents.set(key, entry);
    }
    if (entry.cleanup) clearTimeout(entry.cleanup);
    entry.refs += 1;
    return { key, entry };
  });
  let released = false;
  return {
    promise: lease.then(({ entry }) => entry.promise),
    release() {
      if (released) return;
      released = true;
      return lease.then(({ key, entry }) => {
        entry.refs -= 1;
        if (entry.refs > 0) return;
        entry.cleanup = setTimeout(() => {
          if (entry.refs > 0 || documents.get(key) !== entry) return;
          entry.disposed = true;
          documents.delete(key);
          void entry.loadingTask?.destroy();
        }, CLEANUP_DELAY_MS);
      }).catch(() => { /* 인증 조회가 실패하면 정리할 문서가 없다. */ });
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
