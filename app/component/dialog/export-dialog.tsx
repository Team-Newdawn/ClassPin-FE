"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { acquirePdfDocument } from "@/app/_infrastructure/browser/pdf-document";
import { PdfPage } from "@/app/component/pdf-page";
import { ArrowRight, X } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import type { TranslationKey } from "@/app/_model/i18n";
import styles from "./export-dialog.module.css";

/** Figma ClassPin 2236:2842. */
const formats = [
  { value: "pdf", label: "PDF", badge: "PDF", description: "export.pdf", preview: "export.sizePdf" },
  { value: "pptx", label: "PPT", badge: "PPT", description: "export.pptx", preview: "export.sizePptx" },
  { value: "docx", label: "DOCX", badge: "DOC", description: "export.docx", preview: "export.sizeDocx" },
  { value: "md", label: "MD", badge: "MD", description: "export.md", preview: null },
] as const satisfies readonly { value: string; label: string; badge: string; description: TranslationKey; preview: TranslationKey | null }[];
export type ExportFormat = typeof formats[number]["value"];
type Preview = { fileUrl: string; documentUrl?: string; text?: string };
/** A failure is ours (a key, translated when shown) or the server's own message. */
type Failure = { key: TranslationKey } | { text: string };

function PdfPreview({ url, onReady, onError }: { url: string; onReady: () => void; onError: () => void }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState({ pages: 0, ratio: 210 / 297 });
  const [page, setPage] = useState(1);
  const activeThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const document = acquirePdfDocument(url);
    let stopped = false;
    void document.promise.then(async (pdf) => {
      const first = await pdf.getPage(1), bounds = first.getViewport({ scale: 1 });
      if (!stopped) { setInfo({ pages: pdf.numPages, ratio: bounds.width / bounds.height }); onReady(); }
    }).catch(() => { if (!stopped) onError(); });
    return () => { stopped = true; document.release(); };
  }, [url, onReady, onError]);
  useEffect(() => { activeThumbnail.current?.scrollIntoView({ block: "nearest" }); }, [page]);

  if (!info.pages) return <div className={styles.state} role="status">{t("export.pagesLoading")}</div>;
  return <div className={styles.document} style={{ "--page-ratio": info.ratio } as CSSProperties}>
    <div className={styles.documentBody}>
      <nav className={styles.thumbnails} aria-label={t("export.pages")}>
        {Array.from({ length: info.pages }, (_, index) => <button type="button" key={index} ref={page === index + 1 ? activeThumbnail : undefined}
          aria-label={t("export.viewPage", { number: index + 1 })} aria-current={page === index + 1 ? "page" : undefined} onClick={() => setPage(index + 1)}>
          <span className={styles.thumbnailPage}><PdfPage url={url} pageNumber={index + 1} label={t("export.thumbnail", { number: index + 1 })} /></span><span>{index + 1}</span>
        </button>)}
      </nav>
      <div className={styles.paperStage}><div className={styles.paper}><PdfPage url={url} pageNumber={page} label={t("export.page", { number: page })} eager /></div></div>
    </div>
    <nav className={styles.pagination} aria-label={t("export.pageNav")}>
      <button type="button" aria-label={t("export.previousPage")} disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
      <span>{page} / {info.pages}</span>
      <button type="button" aria-label={t("export.nextPage")} disabled={page === info.pages} onClick={() => setPage(page + 1)}>›</button>
    </nav>
  </div>;
}

/**
 * Shared by the report editor (RPT-060..064) and the analysis dashboard (DSH-042). `load` returns the server's
 * `preview=1` response (file + rendered preview); a new `reloadKey` asks for a fresh preview.
 */
export function ExportDialog({ title, subtitle, load, reloadKey = "", options, note, actions, onClose }: {
  title: string; subtitle?: string; load: (format: ExportFormat, signal: AbortSignal) => Promise<Response>; reloadKey?: string;
  /** Settings below the format choice. */ options?: ReactNode; note?: ReactNode; actions?: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useLanguage();
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [attempt, setAttempt] = useState(0);
  // Results are tagged with the request they answer, so a format, item or retry change shows "loading" without resetting state.
  const request = `${format}|${attempt}|${reloadKey}`;
  const [result, setResult] = useState<{ request: string; preview?: Preview; error?: Failure }>({ request: "" });
  const [readyFor, setReadyFor] = useState("");
  const preview = result.request === request ? result.preview ?? null : null, failure = result.request === request ? result.error : undefined;
  const error = !failure ? "" : "key" in failure ? t(failure.key) : failure.text;
  const ready = readyFor === request;
  const setReady = useCallback(() => setReadyFor(request), [request]);
  const setError = useCallback(() => setResult({ request, error: { key: "export.pageError" } }), [request]);
  const selected = formats.find((item) => item.value === format)!;
  const fetchPreview = useEffectEvent(load);
  useEffect(() => {
    const node = dialog.current!, previous = document.activeElement as HTMLElement | null;
    node.showModal(); node.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(), urls: string[] = [];
    const objectUrl = (file: Blob) => { const url = URL.createObjectURL(file); urls.push(url); return url; };
    void (async () => {
      const response = await fetchPreview(format, controller.signal);
      const files = await response.formData(), file = files.get("file"), rendered = files.get("preview");
      if (!(file instanceof Blob) || !file.size) return setResult({ request, error: { key: "export.fileFailed" } });
      if ((format === "pptx" || format === "docx") && (!(rendered instanceof Blob) || rendered.type !== "application/pdf" || !rendered.size)) return setResult({ request, error: { key: "export.previewFailed" } });
      const text = format === "md" ? await file.text() : undefined;
      if (controller.signal.aborted) return;
      const fileUrl = objectUrl(file);
      setResult({ request, preview: { fileUrl, text, documentUrl: format === "pdf" ? fileUrl : rendered instanceof Blob ? objectUrl(rendered) : undefined } });
      if (format === "md") setReadyFor(request);
    })().catch((failure: unknown) => { if (!controller.signal.aborted) setResult({ request, error: failure instanceof Error ? { text: failure.message } : { key: "export.previewLoadFailed" } }); });
    return () => { controller.abort(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [format, request]);

  return <dialog ref={dialog} className={styles.root} aria-labelledby="export-title" aria-describedby={subtitle ? "export-description" : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className={styles.header}><div><h2 id="export-title">{title}</h2>
      {subtitle && <p id="export-description">{subtitle}</p>}</div>
      <button data-close type="button" className={styles.close} aria-label={t("export.close")} onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <div className={styles.body}>
      <section className={styles.preview} aria-label={t("export.previewOf", { format: selected.label })} aria-busy={!ready && !error}>
        <div className={styles.previewHeader}><h3>{t("export.preview")}</h3><span>{selected.label} · {selected.preview ? t(selected.preview) : "Markdown"}</span></div>
        {error ? <div className={styles.state}><p role="alert">{error}</p><button type="button" className="btn secondary" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div>
          : !preview ? <div className={styles.state} role="status">{t("export.making", { format: selected.label })}</div>
            : format === "md" ? <article className={styles.markdown} tabIndex={0} aria-label={t("export.previewMarkdown")}>
              {/* exportReport's Markdown only uses #, ##, one table and blank-line paragraphs. */}
              {preview.text!.split(/\n{2,}/).map((block, index) => block.startsWith("## ") ? <h5 key={index}>{block.slice(3)}</h5>
                : block.startsWith("# ") ? <h4 key={index}>{block.slice(2)}</h4> : <p key={index}>{block}</p>)}</article>
              : <PdfPreview key={preview.documentUrl} url={preview.documentUrl!} onReady={setReady} onError={setError} />}
      </section>
      <aside className={styles.settings}>
        <fieldset className={styles.formats}><legend>{t("export.formats")}</legend><div>
          {formats.map((item) => <label key={item.value} data-selected={format === item.value}><input type="radio" name="export-format" value={item.value}
            checked={format === item.value} onChange={() => setFormat(item.value)} />
            <i data-format={item.value} aria-hidden="true">{item.badge}</i><span><b>{item.label}</b><small>{t(item.description)}</small></span></label>)}
        </div></fieldset>
        {options}
      </aside>
    </div>
    <footer className={styles.footer}>
      <p>{note}</p>
      {actions}
      <button type="button" className="btn primary" disabled={!preview || !ready || Boolean(error)} onClick={() => {
        if (!preview || !ready || error) return;
        const link = document.createElement("a"); link.href = preview.fileUrl; link.download = `report.${format}`; link.click();
      }}>{t("export.submit")} <ArrowRight aria-hidden="true" /></button>
    </footer>
  </dialog>;
}
