"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import { acquirePdfDocument } from "@/app/_infrastructure/browser/pdf-document";
import styles from "./slide-canvas.module.css";

const renderPriorities = new Map<string, Promise<void>>();
const pagePreviews = new Map<string, HTMLCanvasElement>();
const MAX_PREVIEWS = 24;
const PREVIEW_WIDTH = 320;

function previewKey(url: string, pageNumber: number) {
  return `${url}#${pageNumber}`;
}

function restorePreview(url: string, pageNumber: number, canvas: HTMLCanvasElement) {
  const key = previewKey(url, pageNumber);
  const preview = pagePreviews.get(key);
  if (!preview) return false;
  canvas.width = preview.width;
  canvas.height = preview.height;
  canvas.getContext("2d")?.drawImage(preview, 0, 0);
  return true;
}

function rememberPreview(url: string, pageNumber: number, canvas: HTMLCanvasElement) {
  const scale = Math.min(1, PREVIEW_WIDTH / canvas.width);
  const preview = canvas.ownerDocument.createElement("canvas");
  preview.width = Math.ceil(canvas.width * scale);
  preview.height = Math.ceil(canvas.height * scale);
  preview.getContext("2d")?.drawImage(canvas, 0, 0, preview.width, preview.height);
  const key = previewKey(url, pageNumber);
  const previous = pagePreviews.get(key);
  if (previous && previous.width * previous.height >= preview.width * preview.height) return;
  pagePreviews.set(key, preview);
  if (pagePreviews.size > MAX_PREVIEWS) pagePreviews.delete(pagePreviews.keys().next().value!);
}

function acquireRenderPriority(url: string) {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  renderPriorities.set(url, promise);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (renderPriorities.get(url) === promise) renderPriorities.delete(url);
    resolve();
  };
}

export function PdfPage({ url, pageNumber, label, eager = false }: { url: string; pageNumber: number; label: string; eager?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const releasePriorityRef = useRef<(() => void) | null>(null);
  const previewReadyRef = useRef(false);
  const [visible, setVisible] = useState(eager);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const restored = Boolean(canvas && restorePreview(url, pageNumber, canvas));
    previewReadyRef.current = restored;
    setReady(restored);
  }, [pageNumber, url]);

  useLayoutEffect(() => {
    if (!eager) return;
    const release = acquireRenderPriority(url);
    releasePriorityRef.current = release;
    return () => {
      release();
      if (releasePriorityRef.current === release) releasePriorityRef.current = null;
    };
  }, [eager, url]);

  useEffect(() => {
    if (eager) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!visible || !canvas || !container) return;

    const documentHandle = acquirePdfDocument(url);
    let cancelled = false;
    let frame = 0;
    let sequence = 0;

    const render = async () => {
      const current = ++sequence;
      if (!previewReadyRef.current) setReady(false);
      const previousTask = renderTaskRef.current;
      previousTask?.cancel();
      try { await previousTask?.promise; } catch { /* a newer size/page replaces this render */ }
      if (cancelled || current !== sequence) return;

      try {
        if (!eager) await renderPriorities.get(url);
        if (cancelled || current !== sequence) return;
        const pdf = await documentHandle.promise;
        if (cancelled || current !== sequence) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled || current !== sequence) return;
        const initial = page.getViewport({ scale: 1 });
        const bounds = container.getBoundingClientRect();
        if (!bounds.width || !bounds.height) {
          releasePriorityRef.current?.();
          releasePriorityRef.current = null;
          return;
        }
        const fit = Math.min(bounds.width / initial.width, bounds.height / initial.height);
        const viewport = page.getViewport({ scale: fit * Math.min(window.devicePixelRatio || 1, 2) });
        const renderCanvas = previewReadyRef.current ? canvas.ownerDocument.createElement("canvas") : canvas;
        renderCanvas.width = Math.ceil(viewport.width);
        renderCanvas.height = Math.ceil(viewport.height);
        const renderTask = page.render({ canvas: renderCanvas, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
        if (!cancelled && current === sequence) {
          rememberPreview(url, pageNumber, renderCanvas);
          if (renderCanvas !== canvas) {
            canvas.width = renderCanvas.width;
            canvas.height = renderCanvas.height;
            canvas.getContext("2d")?.drawImage(renderCanvas, 0, 0);
          }
          previewReadyRef.current = true;
          setReady(true);
          releasePriorityRef.current?.();
          releasePriorityRef.current = null;
        }
      } catch (error) {
        if (!cancelled && current === sequence) {
          releasePriorityRef.current?.();
          releasePriorityRef.current = null;
          console.error("PDF page rendering failed", error);
        }
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void render());
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    schedule();

    return () => {
      cancelled = true;
      sequence += 1;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderTaskRef.current?.cancel();
      documentHandle.release();
    };
  }, [eager, pageNumber, url, visible]);

  return <canvas ref={canvasRef} className={styles.pdfPage} data-ready={ready} role="img" aria-label={label} />;
}
