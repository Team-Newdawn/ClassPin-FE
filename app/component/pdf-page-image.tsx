"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { loadedPdfPageImage, loadPdfPageImage, PDF_PAGE_WIDTHS } from "@/app/_infrastructure/browser/pdf-document";
import styles from "./slide-canvas.module.css";

/**
 * A source PDF page rendered by the server (`/api/pdf/page`). The stage asks for the full size and shows the
 * thumbnail meanwhile when it already has one; thumbnails load once they scroll into view.
 */
export function PdfPageImage({ url, pageNumber, label, eager = false }: { url: string; pageNumber: number; label: string; eager?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const width = eager ? PDF_PAGE_WIDTHS.full : PDF_PAGE_WIDTHS.thumbnail;
  const [visible, setVisible] = useState(eager);
  const [, setLoaded] = useState("");
  const src = loadedPdfPageImage(url, pageNumber, width) ?? loadedPdfPageImage(url, pageNumber, PDF_PAGE_WIDTHS.thumbnail);

  useEffect(() => {
    const image = ref.current;
    if (eager || !image) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "200px" });
    observer.observe(image);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || loadedPdfPageImage(url, pageNumber, width)) return;
    let active = true;
    loadPdfPageImage(url, pageNumber, width).then((blobUrl) => { if (active) setLoaded(blobUrl); }, (error) => console.error("PDF page image failed", error));
    return () => { active = false; };
  }, [url, pageNumber, width, visible]);

  return <img ref={ref} className={styles.pdfPage} src={src} alt={label} data-ready={Boolean(src)} />;
}
