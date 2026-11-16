import assert from "node:assert/strict";
import test from "node:test";
import { createPdfSlides, MAX_SOURCE_FILE_BYTES, sourceFileExtension } from "./upload.ts";

test("강의 자료 확장자와 1GiB 상한을 판별한다", () => {
  assert.equal(MAX_SOURCE_FILE_BYTES, 1_073_741_824);
  assert.equal(sourceFileExtension("lecture.PDF"), ".pdf");
  assert.equal(sourceFileExtension("lecture.pptx"), ".pptx");
  assert.equal(sourceFileExtension("lecture.zip"), null);
});

test("PDF 원본 페이지를 이미지 경로 없는 슬라이드로 매핑한다", () => {
  const slides = createPdfSlides(2, "blob:lecture");

  assert.deepEqual(slides.map(({ pageIndex, sourcePageIndex, pdfUrl, imagePath }) => ({ pageIndex, sourcePageIndex, pdfUrl, imagePath })), [
    { pageIndex: 0, sourcePageIndex: 0, pdfUrl: "blob:lecture", imagePath: undefined },
    { pageIndex: 1, sourcePageIndex: 1, pdfUrl: "blob:lecture", imagePath: undefined },
  ]);
  assert.equal(createPdfSlides(1)[0].pdfUrl, undefined);
  assert.throws(() => createPdfSlides(0, "blob:lecture"), /PDF/);
});
