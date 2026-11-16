import type { Slide } from "./types.ts";

export const MAX_SOURCE_FILE_BYTES = 1024 ** 3;
export const SOURCE_FILE_TOO_LARGE_ERROR = "파일이 1GB를 초과합니다. 더 작은 파일로 다시 시도해 주세요.";

export const SOURCE_CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export type SourceFileExtension = keyof typeof SOURCE_CONTENT_TYPES;

export function sourceFileExtension(fileName: string): SourceFileExtension | null {
  const match = /\.(pdf|pptx?)$/i.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` as SourceFileExtension : null;
}

/**
 * 원본 PDF 는 서명 URL 대신 같은 origin 의 프록시로 읽는다. 참여자마다 다른 토큰의 서명 URL 은
 * CDN·브라우저 캐시를 전혀 타지 못해 사람 수만큼 Storage egress 가 나갔다. 프록시는 요청마다
 * 요청자 토큰으로 RLS(소유자 또는 live 강의 참여자)를 다시 통과시키고 서버 디스크에 한 번만 받는다.
 */
export const pdfProxyUrl = (sourcePath: string, audience: boolean) =>
  `/api/pdf?path=${encodeURIComponent(sourcePath)}${audience ? "&audience=1" : ""}`;

/**
 * Where the owner's browser stores a page image of a source PDF (docs/frontend-performance-audit.md, 2026-11-07):
 * `{owner}/{upload}/pages/{page}.jpg` beside `{owner}/{upload}/source.pdf`, 1-based like `/api/pdf/page`.
 */
export const pdfPageImagePath = (sourcePath: string, page: number) => sourcePath.replace(/source\.pdf$/, `pages/${page}.jpg`);

export function createPdfSlides(total: number, pdfUrl?: string): Slide[] {
  if (!Number.isInteger(total) || total < 1) throw new Error("PDF에서 페이지를 찾지 못했습니다.");
  return Array.from({ length: total }, (_, pageIndex) => ({
    id: crypto.randomUUID(),
    pageIndex,
    sourcePageIndex: pageIndex,
    ...(pdfUrl ? { pdfUrl } : {}),
    title: `Slide ${pageIndex + 1}`,
  }));
}
