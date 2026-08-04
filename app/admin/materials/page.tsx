"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { useLanguage } from "@/components/language-context";
import { FileText, MessageCircleQuestion, Plus, Search, Upload } from "@/components/icons";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";
import { SlidePreview } from "@/components/slide-preview";
import { UploadProgress } from "@/components/upload-progress";
import { useSlideUpload } from "@/components/use-slide-upload";
import { countBy } from "@/lib/stats";
import type { ClassSession } from "@/lib/types";

type Filter = "all" | ClassSession["status"];

export default function MaterialsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions, ready } = useSessions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const filterLabel: Record<Filter, string> = { all: t("common.all"), live: t("common.live"), ended: t("common.ended") };
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload();
  // 파일을 잡는 즉시 input 을 비워, 같은 파일을 다시 골라도 onChange 가 뜨게 한다.
  const pick = (file?: File) => { if (inputRef.current) inputRef.current.value = ""; void start(file); };

  const visible = useMemo(
    () => sessions.filter((session) => (filter === "all" || session.status === filter) && `${session.title} ${session.fileName}`.toLowerCase().includes(query.toLowerCase())),
    [filter, query, sessions]
  );

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  return (
    <AdminShell>
      <div className="admin-page">
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />
        <div className="page-head">
          <div><h1>{t("nav.materials")}</h1><p>{t("materials.description")}</p></div>
          <div className="page-actions"><button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <span className="spinner" /> : <Plus />}{busy ? t("materials.converting") : t("materials.upload")}</button></div>
        </div>

        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
        {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
        {showPreview && <SlidePreview slides={slides} total={total} />}

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("materials.search")} /></div>
          <div className="filter-tabs">{(Object.keys(filterLabel) as Filter[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{filterLabel[key]}</button>)}</div>
          <button className="btn secondary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />{t("home.chooseFile")}</button>
        </div>

        {visible.length ? (
          <div className="material-grid">
            {visible.map((session) => {
              const open = countBy(session.questions, "unanswered");
              return (
                <button className="material-card" key={session.id} onClick={() => router.push(`/admin/session/${session.id}`)}>
                  <span className="material-thumb"><SlideCanvas slide={session.slides[0]} compact /><em className={`live-badge ${session.status}`}><i />{session.status === "live" ? t("common.live") : t("common.ended")}</em></span>
                  <span className="material-body">
                    <b>{session.title}</b>
                    <small><FileText />{session.fileName}</small>
                    <span className="material-stats"><span><b>{session.slides.length}</b>{t("common.slide")}</span><span><b>{session.questions.length}</b>{t("common.question")}</span><span className={open ? "alert" : ""}><b>{open}</b>{t("status.unanswered")}</span></span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-empty">
              <MessageCircleQuestion />
              <b>{sessions.length ? t("materials.noMatch") : t("materials.none")}</b>
              <span>{sessions.length ? t("materials.changeSearch") : t("materials.emptyHint")}</span>
              {!sessions.length && <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />{t("materials.upload")}</button>}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
