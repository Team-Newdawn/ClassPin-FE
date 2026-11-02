"use client";

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { acquirePdfDocument } from "@/app/_infrastructure/browser/pdf-document";
import { PdfPage } from "@/app/component/pdf-page";
import styles from "./report-export-dialog.module.css";

const formats = [
  { value: "pdf", label: "PDF", description: "공유·인쇄용", preview: "문서 미리보기" },
  { value: "pptx", label: "PPTX", description: "슬라이드 편집용", preview: "16:9 슬라이드 미리보기" },
  { value: "docx", label: "DOCX", description: "문서 편집용", preview: "문서 미리보기" },
  { value: "md", label: "MD", description: "텍스트 원문", preview: "Markdown 미리보기" },
] as const;
type Format = typeof formats[number]["value"];
type Preview = { fileUrl: string; documentUrl?: string; text?: string };

function PdfPreview({ url, onReady, onError }: { url: string; onReady: (ready: boolean) => void; onError: (message: string) => void }) {
  const [info, setInfo] = useState({ pages: 0, ratio: 210 / 297 });
  const [page, setPage] = useState(1);
  const activeThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const document = acquirePdfDocument(url);
    let stopped = false;
    void document.promise.then(async (pdf) => {
      const first = await pdf.getPage(1), bounds = first.getViewport({ scale: 1 });
      if (!stopped) { setInfo({ pages: pdf.numPages, ratio: bounds.width / bounds.height }); onReady(true); }
    }).catch(() => { if (!stopped) onError("페이지 미리보기를 표시하지 못했습니다. 다시 시도해 주세요."); });
    return () => { stopped = true; document.release(); };
  }, [url, onReady, onError]);
  useEffect(() => { activeThumbnail.current?.scrollIntoView({ block: "nearest" }); }, [page]);

  if (!info.pages) return <div className={styles.state} role="status">페이지를 불러오는 중입니다…</div>;
  return <div className={styles.document} style={{ "--page-ratio": info.ratio } as CSSProperties}>
    <div className={styles.documentBody}>
      <nav className={styles.thumbnails} aria-label="리포트 페이지">
        {Array.from({ length: info.pages }, (_, index) => <button type="button" key={index} ref={page === index + 1 ? activeThumbnail : undefined}
          aria-label={`${index + 1}페이지 보기`} aria-current={page === index + 1 ? "page" : undefined} onClick={() => setPage(index + 1)}>
          <span className={styles.thumbnailPage}><PdfPage url={url} pageNumber={index + 1} label={`${index + 1}페이지 썸네일`} /></span><span>{index + 1}</span>
        </button>)}
      </nav>
      <div className={styles.paperStage}><div className={styles.paper}><PdfPage url={url} pageNumber={page} label={`리포트 ${page}페이지`} eager /></div></div>
    </div>
    <nav className={styles.pagination} aria-label="미리보기 페이지 탐색">
      <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
      <span>{page} / {info.pages}</span>
      <button type="button" aria-label="다음 페이지" disabled={page === info.pages} onClick={() => setPage(page + 1)}>›</button>
    </nav>
  </div>;
}

export function ReportExportDialog({ reportId, title, request, beforeExport, onClose }: {
  reportId: string; title: string; request: (path: string, init?: RequestInit) => Promise<Response>;
  /** Saves unsaved edits first, so the export is the document on screen (RPT-060). Throw to stop with that message. */
  beforeExport?: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<Format>("pdf");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const selected = formats.find((item) => item.value === format)!;
  const save = useEffectEvent(async () => { await beforeExport?.(); });
  useEffect(() => {
    const node = dialog.current!, previous = document.activeElement as HTMLElement | null;
    node.showModal(); node.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(), urls: string[] = [];
    const objectUrl = (file: Blob) => { const url = URL.createObjectURL(file); urls.push(url); return url; };
    void (async () => {
      await save();
      if (controller.signal.aborted) return;
      const response = await request(`/api/admin/reports/${reportId}/export?format=${format}&preview=1`, { signal: controller.signal });
      const files = await response.formData(), file = files.get("file"), rendered = files.get("preview");
      if (!(file instanceof Blob) || !file.size) throw new Error("내보낼 파일을 만들지 못했습니다.");
      if ((format === "pptx" || format === "docx") && (!(rendered instanceof Blob) || rendered.type !== "application/pdf" || !rendered.size)) throw new Error("미리보기를 만들지 못했습니다.");
      const text = format === "md" ? await file.text() : undefined;
      if (controller.signal.aborted) return;
      const fileUrl = objectUrl(file);
      setPreview({ fileUrl, text, documentUrl: format === "pdf" ? fileUrl : rendered instanceof Blob ? objectUrl(rendered) : undefined });
      if (format === "md") setReady(true);
    })().catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "미리보기를 불러오지 못했습니다."); });
    return () => { controller.abort(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [format, attempt, reportId, request]);
  const reset = () => { setPreview(null); setError(""); setReady(false); };

  return <dialog ref={dialog} className={styles.root} aria-labelledby="report-export-title" aria-describedby="report-export-description"
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className={styles.header}><div><h2 id="report-export-title">리포트 내보내기</h2>
      <p id="report-export-description">{title}</p></div>
      <button data-close type="button" className={styles.close} aria-label="내보내기 닫기" onClick={onClose}>×</button>
    </header>
    <div className={styles.body}>
      <section className={styles.preview} aria-label={`${selected.label} 리포트 미리보기`} aria-busy={!ready && !error}>
        <div className={styles.previewHeader}><h3>리포트 미리보기</h3><span>{selected.label} · {selected.preview}</span></div>
        {error ? <div className={styles.state}><p role="alert">{error}</p><button type="button" className="btn secondary" onClick={() => { reset(); setAttempt((value) => value + 1); }}>다시 시도</button></div>
          : !preview ? <div className={styles.state} role="status">{selected.label} 미리보기를 만드는 중입니다…</div>
            : format === "md" ? <article className={styles.markdown} tabIndex={0} aria-label="내보낼 Markdown 미리보기">
              {/* exportReport's Markdown only uses #, ##, one table and blank-line paragraphs. */}
              {preview.text!.split(/\n{2,}/).map((block, index) => block.startsWith("## ") ? <h5 key={index}>{block.slice(3)}</h5>
                : block.startsWith("# ") ? <h4 key={index}>{block.slice(2)}</h4> : <p key={index}>{block}</p>)}</article>
              : <PdfPreview key={preview.documentUrl} url={preview.documentUrl!} onReady={setReady} onError={setError} />}
      </section>
      <aside className={styles.settings}>
        <fieldset className={styles.formats}><legend>내보내기 형식</legend><div>
          {formats.map((item) => <label key={item.value} data-selected={format === item.value}><input type="radio" name="report-export-format" value={item.value}
            checked={format === item.value} onChange={() => { reset(); setFormat(item.value); }} /><span><b>{item.label}</b><small>{item.description}</small></span></label>)}
        </div></fieldset>
        <section className={styles.design}><h3>리포트 디자인</h3><div><b>기본 디자인</b><p>현재 리포트 디자인을 그대로 사용합니다.</p></div></section>
      </aside>
    </div>
    <footer className={styles.footer}><button type="button" className="btn primary" disabled={!preview || !ready || Boolean(error)} onClick={() => {
      if (!preview || !ready || error) return;
      const link = document.createElement("a"); link.href = preview.fileUrl; link.download = `report.${format}`; link.click();
    }}>리포트 내보내기 →</button></footer>
  </dialog>;
}
