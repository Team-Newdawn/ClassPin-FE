"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Sparkles } from "@/app/component/icons";
import { aiReportProgressPercent } from "@/app/_model/ai-report";
import { useAiReportHistoryController } from "../controller";

export function AiReportHistory() {
  const { t, timeAgo, configured, reports, loading, error, refresh } = useAiReportHistoryController();

  if (!configured) return null;

  return (
    <section className="panel ai-report-history" aria-labelledby="ai-report-history-title">
      <div className="panel-head">
        <div><h2 id="ai-report-history-title">{t("aiReport.recentReports")}</h2><p>{t("aiReport.recentReportsHint")}</p></div>
        {error && <button type="button" className="ai-report-history-refresh" onClick={refresh}>{t("aiReport.refreshReports")}</button>}
      </div>

      {loading && !reports.length ? (
        <div className="ai-report-history-loading" role="status"><span className="spinner" />{t("aiReport.loadingReports")}</div>
      ) : reports.length ? (
        <div className="ai-report-history-list">
          {reports.slice(0, 8).map((report) => {
            const progress = aiReportProgressPercent(report.progressCompleted, report.progressTotal);
            return (
              <Link key={report.id} className="ai-report-history-row" href={`/admin/ai-reports/${report.id}`}>
                <span className="ai-report-history-icon"><Sparkles /></span>
                <span className="ai-report-history-copy">
                  <b>{t("aiReport.historyScope", { materials: report.materialCount, slides: report.slideCount, questions: report.questionCount })}</b>
                  <small><Clock3 />{timeAgo(report.createdAt)}</small>
                </span>
                <span className={`ai-report-history-status ${report.productStatus}`}>
                  {t(`aiReport.status.${report.productStatus}`)}
                  {(report.productStatus === "queued" || report.productStatus === "analyzing") && <small>{progress}%</small>}
                </span>
                <ArrowRight />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="ai-report-history-empty"><Sparkles /><b>{t("aiReport.noReports")}</b><span>{t("aiReport.noReportsHint")}</span></div>
      )}
      {error && reports.length > 0 && <p className="ai-report-history-error" role="alert">{t("aiReport.historyLoadFailed")}</p>}
    </section>
  );
}
