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
