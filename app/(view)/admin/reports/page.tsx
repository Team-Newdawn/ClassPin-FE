"use client";

import Link from "next/link";
import { Suspense } from "react";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { BarChart3, FileText, Folder, Plus, Sparkles, Trash2, Zap } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { REPORT_REQUEST_MAX, REPORT_TEMPLATES, reportAge, type ReportTemplate } from "@/app/_model/report";
import { useReportHomeController } from "./controller";
import { ReportDeleteDialog } from "./component/report-delete-dialog";
import shell from "../insights/shell.module.css";
import styles from "./page.module.css";

const ICONS: Record<ReportTemplate, typeof Zap> = { executive: Zap, improvement: BarChart3, summary: FileText, blank: Plus };
const STATUS = { drafting: "작성 중", failed: "초안 실패", ready: "" } as const;

/** Figma ClassPin 2227:2258 (RPT-011/036). */
function ReportHome() {
  const c = useReportHomeController();
  if (!c.ready) return <LoadingScreen />;
  const step = (n: number, title: string, optional?: boolean) => <h2 className={styles.step}><span aria-hidden="true">{n}</span>{title}{optional && <small>선택</small>}</h2>;

  return <main className={`${shell.shell} ${c.sidebarOpen ? "" : shell.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    <div className={shell.root}>
      <header className={shell.head}><h1>리포트</h1><p>강의 데이터를 바탕으로 AI와 함께 리포트를 만들고 다듬어요</p></header>

      <form className={styles.card} onSubmit={(event) => { event.preventDefault(); c.create(); }}>
        <section>
          {step(1, "어떤 자료로 만들까요?")}
          <div className={styles.selectors}>
            <label><span>폴더</span><span className={styles.select}><Folder aria-hidden="true" />
              <select value={c.folderId} onChange={(event) => c.setFolder(event.target.value)}>
                {c.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                <option value="">미분류</option>
              </select></span></label>
            <label><span>자료</span><span className={styles.select}><FileText aria-hidden="true" />
              <select value={c.materialId} onChange={(event) => c.setMaterial(event.target.value)} disabled={!c.inFolder.length}>
                {!c.inFolder.length && <option value="">이 폴더에 자료가 없어요</option>}
                {/* LECTURE_NOT_ENDED: a lecture still before or in LIVE cannot have a report yet. */}
                {c.inFolder.map((session) => <option key={session.id} value={session.materialId!} disabled={session.status !== "ended"}>
                  {session.title}{session.status !== "ended" ? " (강의 종료 후 가능)" : ""}</option>)}
              </select></span></label>
          </div>
        </section>

        <fieldset>
          <legend>{step(2, "어떤 형태로 만들까요?")}</legend>
          <div className={styles.templates}>
            {(Object.keys(REPORT_TEMPLATES) as ReportTemplate[]).map((key) => {
              const Icon = ICONS[key];
              return <label key={key} className={styles.template}>
                <input type="radio" name="report-template" value={key} checked={c.template === key} onChange={() => c.setTemplate(key)} />
                <i aria-hidden="true"><Icon /></i><b>{REPORT_TEMPLATES[key].label}</b><small>{REPORT_TEMPLATES[key].hint}</small>
              </label>;
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>{step(3, "추가로 요청할 내용", true)}</legend>
          <div className={styles.prompt}>
            <input value={c.request} onChange={(event) => c.setRequest(event.target.value)} maxLength={REPORT_REQUEST_MAX} disabled={c.template === "blank"} aria-label="추가로 요청할 내용"
              placeholder={c.template === "blank" ? "빈 문서는 AI 초안 없이 시작해요. 요청은 편집 화면의 AI 챗에 남겨 주세요." : "예) P.8에 질문이 몰린 이유를 꼭 넣어주고, 마지막에 다음 강의 제안은 3개로 정리해줘"} />
            <button type="submit" className="btn primary large" disabled={!c.materialId || c.report.busy}>
              <Sparkles aria-hidden="true" />{c.report.busy ? "만드는 중…" : c.template === "blank" ? "빈 문서로 만들기" : "AI로 리포트 만들기"}</button>
          </div>
        </fieldset>
        {c.report.error && <p className={shell.error} role="alert">{c.report.error}</p>}
      </form>

      <section aria-labelledby="my-reports">
        <div className={styles.listHead}><h2 id="my-reports">내 리포트 <span>{c.reports?.length ?? ""}</span></h2><small>최근 수정순</small></div>
        {c.listError ? <p className={shell.error} role="alert">{c.listError}</p>
          : !c.reports ? <p className={shell.empty} role="status">리포트를 불러오는 중…</p>
            : !c.reports.length ? <p className={shell.empty}>아직 만든 리포트가 없어요. 위에서 자료를 골라 만들어 보세요.</p>
              : <ul className={styles.grid}>{c.reports.map((row) => <li key={row.id}>
                <button type="button" className={styles.delete} onClick={() => c.askDelete(row)}
                  aria-label={`${row.title} 리포트 삭제`} title="삭제"><Trash2 aria-hidden="true" /></button>
                <Link className={styles.report} href={`/admin/reports/${row.id}`}>
                  <span className={styles.thumb} aria-hidden="true"><i /></span>
                  <span className={styles.info}>
                    <b title={row.title}>{row.title}</b>
                    <small>{[row.template ? REPORT_TEMPLATES[row.template].label : "자료 맞춤", c.folderOf(row)].join(" · ")}</small>
                    <small>{STATUS[row.status] ? <em>{STATUS[row.status]}</em> : null}{reportAge(row.updatedAt)}</small>
                  </span>
                </Link>
              </li>)}</ul>}
      </section>
    </div>
    {c.deleteTarget && <ReportDeleteDialog title={c.deleteTarget.title} saving={c.deleting} error={c.deleteError}
      onClose={() => c.askDelete(null)} onDelete={() => void c.confirmDelete()} />}
  </main>;
}

// useSearchParams needs a Suspense boundary for the static shell.
export default function ReportHomePage() {
  return <Suspense fallback={<LoadingScreen />}><ReportHome /></Suspense>;
}
