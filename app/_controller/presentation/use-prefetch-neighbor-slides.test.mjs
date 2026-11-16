import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

test("prefetch waits for the current stage image, then loads next and previous PDF pages only", async () => {
  const state = { calls: [], effect: null, release: null };
  Object.assign(globalThis, { __prefetch: state });
  const react = "export function useEffect(effect){globalThis.__prefetch.effect=effect}";
  const pdf = "export const PDF_PAGE_WIDTHS={thumbnail:640,full:1920};"
    + "export function loadPdfPageImage(url,page,width){const s=globalThis.__prefetch;s.calls.push(`${page}@${width}`);"
    + "return page===2?new Promise((resolve)=>{s.release=resolve}):Promise.resolve('blob:')}";
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "react") return { url: `data:text/javascript,${encodeURIComponent(react)}`, shortCircuit: true };
      if (specifier === "@/app/_infrastructure/browser/pdf-document") return { url: `data:text/javascript,${encodeURIComponent(pdf)}`, shortCircuit: true };
      return next(specifier, context);
    },
  });
  try {
    const { usePrefetchNeighborSlides } = await import("./use-prefetch-neighbor-slides.ts");
    const url = "/api/pdf?path=deck";
    const slides = [
      { id: "a", pageIndex: 0, title: "", pdfUrl: url, sourcePageIndex: 0 },
      { id: "b", pageIndex: 1, title: "", pdfUrl: url, sourcePageIndex: 1 },
      { id: "c", pageIndex: 2, title: "", pdfUrl: url, sourcePageIndex: 4 },
      { id: "d", pageIndex: 3, title: "", imageUrl: "/slide.jpg" },
    ];
    usePrefetchNeighborSlides(slides, 1);
    state.effect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(state.calls, ["2@1920"], "neighbors wait until the current page is loaded");
    state.release("blob:");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(state.calls, ["2@1920", "5@1920", "1@1920"], "next (its own source page) first, then previous");

    state.calls.length = 0;
    usePrefetchNeighborSlides(slides, 3);
    state.effect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(state.calls, ["5@1920"], "an image slide loads nothing itself; its PDF neighbor still loads");
  } finally {
    hooks.deregister();
  }
});
