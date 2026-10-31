"use client";

import Link from "next/link";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { Folder, Search } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { SlideCanvas } from "@/app/component/slide-canvas";
import type { ClassSession } from "@/app/_model/types";
import { lectureDate, useInsightListController } from "./controller";
import shell from "./shell.module.css";
import styles from "./page.module.css";

const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));

export default function InsightListPage() {
  const c = useInsightListController();
  if (!c.ready) return <LoadingScreen />;
  // DSH-054: the same two actions on both sections.
  const actions = (session: ClassSession) => <div className={styles.actions}>
    <Link className="btn secondary" href={`/admin/insights/${session.id}`} aria-label={`${session.title} 인사이트 보기`}>인사이트 보기</Link>
    {session.materialId && <button type="button" className="btn primary" disabled={c.report.busy} aria-label={`${session.title} 리포트 보기`}
      onClick={() => void c.report.open(session.materialId!)}>리포트 보기</button>}
  </div>;
  const thumb = (session: ClassSession) => <span className={styles.thumb}>{session.slides[0] && <SlideCanvas slide={session.slides[0]} compact />}</span>;

  return <main className={`${shell.shell} ${c.sidebarOpen ? "" : shell.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    <div className={`${shell.root} ${styles.root}`}>
      <header className={styles.header}>
        <h1>인사이트</h1>
        <label className={styles.search}><Search aria-hidden="true" />
          <input type="search" value={c.query} onChange={(event) => c.setQuery(event.target.value)} placeholder="자료 · 폴더 검색" aria-label="자료 · 폴더 검색" />
        </label>
      </header>
      {c.report.error && <p className={shell.error} role="alert">{c.report.error}</p>}

      {c.recent.length > 0 && <section aria-labelledby="recent-title">
        <div className={styles.sectionHead}><h2 id="recent-title">최근 인사이트 <span>{c.recent.length}</span></h2></div>
        <ul className={styles.grid}>{c.recent.map((session) => <li key={session.id} className={styles.card}>
          {thumb(session)}
          <div className={styles.cardBody}>
            <b title={session.title}>{session.title}</b>
            <small>{[c.folderName.get(session.folderId ?? ""), `질문 ${session.questions.length}`, day(lectureDate(session))].filter(Boolean).join(" · ")}</small>
            {actions(session)}
          </div>
        </li>)}</ul>
      </section>}

      <section aria-labelledby="files-title">
        <div className={styles.sectionHead}><h2 id="files-title">자료별 인사이트 <span>{c.files.length}</span></h2></div>
        <div className={styles.filters}>
          <label className={styles.folder}><Folder aria-hidden="true" />
            <select value={c.folderId} onChange={(event) => c.setFolderId(event.target.value)} aria-label="폴더 선택">
              <option value="all">전체 폴더</option>
              {c.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              <option value="">미분류</option>
            </select>
          </label>
          <span className={styles.sort}>최근 강의순</span>
        </div>
        {c.files.length ? <ul className={styles.files}>{c.files.map((session) => <li key={session.id} className={styles.file}>
          {thumb(session)}
          <div className={styles.info}><b title={session.title}>{session.title}</b><small>질문 {session.questions.length}건 · {day(lectureDate(session))}</small></div>
          {actions(session)}
        </li>)}</ul>
          : <p className={shell.empty}>{c.empty ? "폴더에 자료를 올리면 인사이트를 볼 수 있어요." : "조건에 맞는 자료가 없습니다."}</p>}
      </section>
    </div>
  </main>;
}
