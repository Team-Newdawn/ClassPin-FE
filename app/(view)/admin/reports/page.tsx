"use client";

import Link from "next/link";
import { Suspense } from "react";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { FileText, Folder, Sparkles, Trash2 } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { REPORT_REQUEST_MAX, reportAge } from "@/app/_model/report";
import { useReportHomeController } from "./controller";
import { ReportConfirmDialog } from "./component/report-confirm-dialog";
import shell from "../insights/shell.module.css";
import styles from "./page.module.css";

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
          <legend>{step(2, "원하는 리포트를 설명해 주세요", true)}</legend>
          {/* RPT-031/036: the format is fixed; the prompt shapes the AI-written sections between the overview and the evidence. */}
          <p id="report-prompt-hint" className={styles.hint}>개요 · 슬라이드별 PIN 질문 흐름 · 질문 유형별 분석 · 슬라이드별 분석은 항상 들어가요. 요청은 AI가 쓰는 본문(독자·관점·분량·문체·꼭 넣을 내용)에 반영돼요.</p>
          <div className={styles.prompt}>
            <textarea value={c.request} onChange={(event) => c.setRequest(event.target.value)} maxLength={REPORT_REQUEST_MAX} rows={4} aria-label="원하는 리포트 설명" aria-describedby="report-prompt-hint"
              placeholder="예) 학과장님께 보고할 문서로, 개조식으로 짧게 써 줘. P.8에 질문이 몰린 이유와 다음 강의 개선안 3개는 꼭 넣어 줘." />
            <button type="submit" className="btn primary large" disabled={!c.materialId || c.report.busy}>
              <Sparkles aria-hidden="true" />{c.report.busy ? "만드는 중…" : "AI로 리포트 만들기"}</button>
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
                    <small>{c.folderOf(row)}</small>
                    <small>{STATUS[row.status] ? <em>{STATUS[row.status]}</em> : null}{reportAge(row.updatedAt)}</small>
                  </span>
                </Link>
              </li>)}</ul>}
      </section>
    </div>
    {c.deleteTarget && <ReportConfirmDialog title={`‘${c.deleteTarget.title}’ 리포트를 삭제할까요?`} saving={c.deleting} error={c.deleteError}
      description="리포트 문서와 AI 대화가 모두 지워지고 되돌릴 수 없어요. 강의 데이터는 그대로 남아 다시 만들 수 있어요." confirm={{ label: "삭제", saving: "삭제하는 중…" }}
      onClose={() => c.askDelete(null)} onConfirm={() => void c.confirmDelete()} />}
  </main>;
}

// useSearchParams needs a Suspense boundary for the static shell.
export default function ReportHomePage() {
  return <Suspense fallback={<LoadingScreen />}><ReportHome /></Suspense>;
}
