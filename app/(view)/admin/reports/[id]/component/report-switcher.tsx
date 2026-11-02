"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reportRequest } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { REPORT_TEMPLATES, reportAge } from "@/app/_model/report";
import type { ReportSummary } from "../../controller";
import styles from "./report-switcher.module.css";

const icon = (name: string, size = 16) => <Image src={`/assets/design/report-editor/${name}.svg`} alt="" width={size} height={size} />;

/**
 * RPT-110 (Figma ClassPin 2227:2667): the editor title opens this material's reports, the other ended materials
 * (their latest report, else a new one on /admin/reports), and "new report". Esc and an outside click close it.
 */
export function ReportSwitcher({ reportId, materialId, title }: { reportId: string; materialId: string; title: string }) {
  const { sessions, folders } = useSessions();
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [reports, setReports] = useState<ReportSummary[] | null>(null), [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || reports) return;
    const controller = new AbortController();
    reportRequest("/api/admin/reports", { signal: controller.signal }).then((response) => response.json())
      .then((body: { reports: ReportSummary[] }) => setReports(body.reports), (failure: Error) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [open, reports]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const material = sessions.find((session) => session.materialId === materialId);
  const folderName = new Map(folders.map((folder) => [folder.id, folder.name]));
  const own = (reports ?? []).filter((row) => row.materialId === materialId);
  // The API lists reports newest first, so the first match is a material's latest report.
  const latest = (id: string) => reports?.find((row) => row.materialId === id);
  const needle = query.trim().normalize("NFC").toLowerCase();
  const others = sessions.filter((session) => session.materialId && session.materialId !== materialId && session.status === "ended"
    && session.title.normalize("NFC").toLowerCase().includes(needle));
  const close = () => setOpen(false);

  return <div ref={root} className={styles.root} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); toggle.current?.focus(); } }}>
    <h1><button ref={toggle} type="button" className={styles.toggle} aria-expanded={open} aria-controls="report-switcher" onClick={() => setOpen(!open)}>
      <span>{title}</span>{icon("chev")}<span className="sr-only">리포트 바꾸기</span>
    </button></h1>
    {open && <div id="report-switcher" className={styles.panel}>
      <p className={styles.group}>이 자료의 리포트{material ? ` · ${material.title.normalize("NFC")}` : ""}</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : !reports ? <p role="status" className={styles.empty}>불러오는 중…</p>
        : <ul>{own.map((row) => <li key={row.id}>
          <Link href={`/admin/reports/${row.id}`} className={styles.option} aria-current={row.id === reportId ? "page" : undefined} onClick={close}>
            {icon(row.id === reportId ? "doc-active" : "doc")}
            <span><b>{row.title}</b><small>{row.template ? REPORT_TEMPLATES[row.template].label : "자료 맞춤"} · {reportAge(row.updatedAt)}</small></span>
            {row.id === reportId && icon("check")}
          </Link></li>)}</ul>}
      <hr />
      <p className={styles.group}>다른 자료로 새 리포트</p>
      <input type="search" className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="자료 검색" aria-label="자료 검색" />
      <ul className={styles.materials}>{others.map((session) => {
        const report = latest(session.materialId!);
        return <li key={session.id}>
          <Link className={styles.option} onClick={close}
            href={report ? `/admin/reports/${report.id}` : `/admin/reports?material=${session.materialId}`}>
            {icon("folder")}
            <span><b>{session.title.normalize("NFC")}</b><small>{folderName.get(session.folderId ?? "") ?? "미분류"}{report ? " · 리포트 열기" : ""}</small></span>
          </Link></li>;
      })}</ul>
      {!others.length && <p className={styles.empty}>{needle ? "찾는 자료가 없어요." : "강의를 마친 다른 자료가 없어요."}</p>}
      <hr />
      <Link href="/admin/reports" className={`${styles.option} ${styles.create}`} onClick={close}>{icon("plus")}새 리포트 만들기 (자료·템플릿 선택)</Link>
    </div>}
  </div>;
}
