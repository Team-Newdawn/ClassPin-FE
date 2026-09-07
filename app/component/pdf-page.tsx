"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import { acquirePdfDocument } from "@/app/_infrastructure/browser/pdf-document";
import styles from "./slide-canvas.module.css";

export function PdfPage({ url, pageNumber, label }: { url: string; pageNumber: number; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!visible || !canvas || !container) return;

    const document = acquirePdfDocument(url);
    let cancelled = false;
    let frame = 0;
    let sequence = 0;

    const render = async () => {
      const current = ++sequence;
      setReady(false);
      const previousTask = renderTaskRef.current;
      previousTask?.cancel();
      try { await previousTask?.promise; } catch { /* a newer size/page replaces this render */ }
      if (cancelled || current !== sequence) return;

      try {
        const pdf = await document.promise;
        if (cancelled || current !== sequence) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled || current !== sequence) return;
        const initial = page.getViewport({ scale: 1 });
        const bounds = container.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const fit = Math.min(bounds.width / initial.width, bounds.height / initial.height);
        const viewport = page.getViewport({ scale: fit * Math.min(window.devicePixelRatio || 1, 2) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const renderTask = page.render({ canvas, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
        if (!cancelled && current === sequence) setReady(true);
      } catch (error) {
        if (!cancelled && current === sequence) console.error("PDF page rendering failed", error);
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
      document.release();
    };
  }, [pageNumber, url, visible]);

  return <canvas ref={canvasRef} className={styles.pdfPage} data-ready={ready} role="img" aria-label={label} />;
}
