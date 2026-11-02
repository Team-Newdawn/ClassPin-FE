"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { acquirePdfDocument } from "@/app/_infrastructure/browser/pdf-document";
import { PdfPage } from "@/app/component/pdf-page";
import { ArrowRight, X } from "@/app/component/icons";
import styles from "./export-dialog.module.css";

/** Figma ClassPin 2236:2842. */
const formats = [
  { value: "pdf", label: "PDF", badge: "PDF", description: "보기 좋은 문서", preview: "A4 세로" },
  { value: "pptx", label: "PPT", badge: "PPT", description: "발표 자료로 활용", preview: "16:9 슬라이드" },
  { value: "docx", label: "DOCX", badge: "DOC", description: "Word에서 편집", preview: "A4 문서" },
  { value: "md", label: "MD", badge: "MD", description: "노트에 붙여넣기", preview: "Markdown" },
] as const;
export type ExportFormat = typeof formats[number]["value"];
type Preview = { fileUrl: string; documentUrl?: string; text?: string };

function PdfPreview({ url, onReady, onError }: { url: string; onReady: () => void; onError: (message: string) => void }) {
  const [info, setInfo] = useState({ pages: 0, ratio: 210 / 297 });
  const [page, setPage] = useState(1);
  const activeThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const document = acquirePdfDocument(url);
    let stopped = false;
    void document.promise.then(async (pdf) => {
      const first = await pdf.getPage(1), bounds = first.getViewport({ scale: 1 });
      if (!stopped) { setInfo({ pages: pdf.numPages, ratio: bounds.width / bounds.height }); onReady(); }
    }).catch(() => { if (!stopped) onError("페이지 미리보기를 표시하지 못했습니다. 다시 시도해 주세요."); });
    return () => { stopped = true; document.release(); };
  }, [url, onReady, onError]);
  useEffect(() => { activeThumbnail.current?.scrollIntoView({ block: "nearest" }); }, [page]);

  if (!info.pages) return <div className={styles.state} role="status">페이지를 불러오는 중입니다…</div>;
  return <div className={styles.document} style={{ "--page-ratio": info.ratio } as CSSProperties}>
    <div className={styles.documentBody}>
      <nav className={styles.thumbnails} aria-label="미리보기 페이지">
        {Array.from({ length: info.pages }, (_, index) => <button type="button" key={index} ref={page === index + 1 ? activeThumbnail : undefined}
          aria-label={`${index + 1}페이지 보기`} aria-current={page === index + 1 ? "page" : undefined} onClick={() => setPage(index + 1)}>
          <span className={styles.thumbnailPage}><PdfPage url={url} pageNumber={index + 1} label={`${index + 1}페이지 썸네일`} /></span><span>{index + 1}</span>
        </button>)}
      </nav>
      <div className={styles.paperStage}><div className={styles.paper}><PdfPage url={url} pageNumber={page} label={`${page}페이지`} eager /></div></div>
    </div>
    <nav className={styles.pagination} aria-label="미리보기 페이지 탐색">
      <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
      <span>{page} / {info.pages}</span>
      <button type="button" aria-label="다음 페이지" disabled={page === info.pages} onClick={() => setPage(page + 1)}>›</button>
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
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [attempt, setAttempt] = useState(0);
  // Results are tagged with the request they answer, so a format, item or retry change shows "loading" without resetting state.
  const request = `${format}|${attempt}|${reloadKey}`;
  const [result, setResult] = useState<{ request: string; preview?: Preview; error?: string }>({ request: "" });
  const [readyFor, setReadyFor] = useState("");
  const preview = result.request === request ? result.preview ?? null : null, error = result.request === request ? result.error ?? "" : "";
  const ready = readyFor === request;
  const setReady = useCallback(() => setReadyFor(request), [request]);
  const setError = useCallback((message: string) => setResult({ request, error: message }), [request]);
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
      if (!(file instanceof Blob) || !file.size) throw new Error("내보낼 파일을 만들지 못했습니다.");
      if ((format === "pptx" || format === "docx") && (!(rendered instanceof Blob) || rendered.type !== "application/pdf" || !rendered.size)) throw new Error("미리보기를 만들지 못했습니다.");
      const text = format === "md" ? await file.text() : undefined;
      if (controller.signal.aborted) return;
      const fileUrl = objectUrl(file);
      setResult({ request, preview: { fileUrl, text, documentUrl: format === "pdf" ? fileUrl : rendered instanceof Blob ? objectUrl(rendered) : undefined } });
      if (format === "md") setReadyFor(request);
    })().catch((failure: unknown) => { if (!controller.signal.aborted) setResult({ request, error: failure instanceof Error ? failure.message : "미리보기를 불러오지 못했습니다." }); });
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
      <button data-close type="button" className={styles.close} aria-label="내보내기 닫기" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <div className={styles.body}>
      <section className={styles.preview} aria-label={`${selected.label} 미리보기`} aria-busy={!ready && !error}>
        <div className={styles.previewHeader}><h3>미리보기</h3><span>{selected.label} · {selected.preview}</span></div>
        {error ? <div className={styles.state}><p role="alert">{error}</p><button type="button" className="btn secondary" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button></div>
          : !preview ? <div className={styles.state} role="status">{selected.label} 미리보기를 만드는 중입니다…</div>
            : format === "md" ? <article className={styles.markdown} tabIndex={0} aria-label="내보낼 Markdown 미리보기">
              {/* exportReport's Markdown only uses #, ##, one table and blank-line paragraphs. */}
              {preview.text!.split(/\n{2,}/).map((block, index) => block.startsWith("## ") ? <h5 key={index}>{block.slice(3)}</h5>
                : block.startsWith("# ") ? <h4 key={index}>{block.slice(2)}</h4> : <p key={index}>{block}</p>)}</article>
              : <PdfPreview key={preview.documentUrl} url={preview.documentUrl!} onReady={setReady} onError={setError} />}
      </section>
      <aside className={styles.settings}>
        <fieldset className={styles.formats}><legend>내보내기 형식</legend><div>
          {formats.map((item) => <label key={item.value} data-selected={format === item.value}><input type="radio" name="export-format" value={item.value}
            checked={format === item.value} onChange={() => setFormat(item.value)} />
            <i data-format={item.value} aria-hidden="true">{item.badge}</i><span><b>{item.label}</b><small>{item.description}</small></span></label>)}
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
      }}>내보내기 <ArrowRight aria-hidden="true" /></button>
    </footer>
  </dialog>;
}
