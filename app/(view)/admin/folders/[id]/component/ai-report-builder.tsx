"use client";

import { Check, FileText, Sparkles, X } from "@/app/component/icons";
import type { ClassSession } from "@/app/_model/types";
import { useAiReportCreationController } from "../controller";

export function AiReportBuilder({ sessions, folderId }: { sessions: ClassSession[]; folderId: string | null }) {
  const {
    t, configured, availableSessions, selectedIds, selectedCount, selectedSlideCount,
    selectedQuestionCount, preflight, busy, error, toggle, selectAll, clear,
    closePreflight, requestPreflight, create,
  } = useAiReportCreationController(sessions, folderId);

  return (
    <section className="panel ai-report-builder" aria-labelledby="ai-report-builder-title">
      <div className="ai-report-builder-head">
        <div><span className="ai-report-eyebrow"><Sparkles />AI INSTRUCTOR REPORT</span><h2 id="ai-report-builder-title">{t("aiReport.builderTitle")}</h2><p>{t("aiReport.builderDescription")}</p></div>
        <div className="ai-report-selection-actions"><button type="button" onClick={selectAll}>{t("aiReport.selectAll")}</button><button type="button" onClick={clear}>{t("aiReport.clear")}</button></div>
      </div>

      {availableSessions.length ? (
        <div className="ai-report-material-list">
          {availableSessions.map((session) => {
            const materialId = session.materialId as string;
            const checked = selectedIds.has(materialId);
            return (
              <label key={materialId} className={checked ? "selected" : ""}>
                <input type="checkbox" checked={checked} onChange={() => toggle(materialId)} />
                <span className="ai-report-check" aria-hidden="true">{checked && <Check />}</span>
                <span><b>{session.title}</b><small>{t("aiReport.materialMeta", { slides: session.slides.length, questions: session.questions.length })}</small></span>
              </label>
            );
          })}
        </div>
      ) : <div className="panel-empty"><FileText /><b>{t("aiReport.noMaterials")}</b><span>{t("aiReport.noMaterialsHint")}</span></div>}

      <div className="ai-report-builder-foot">
        <p>{t("aiReport.selectionSummary", { materials: selectedCount, slides: selectedSlideCount, questions: selectedQuestionCount })}</p>
        <button type="button" className="btn primary" disabled={!configured || !selectedCount || busy} onClick={() => void requestPreflight()}>{busy ? <span className="spinner" /> : <Sparkles />}{configured ? t("aiReport.preflight") : t("aiReport.requiresSupabase")}</button>
      </div>
      {selectedCount > 0 && selectedQuestionCount === 0 && <p className="ai-report-evidence-warning">{t("aiReport.noPinWarning")}</p>}
      {error && <div className="login-error" role="alert">{error}</div>}

      {preflight && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreflight(); }}>
          <section className="ai-report-preflight" role="dialog" aria-modal="true" aria-labelledby="ai-report-preflight-title" onKeyDown={(event) => { if (event.key === "Escape") closePreflight(); }}>
            <button type="button" className="modal-close" disabled={busy} onClick={closePreflight} aria-label={t("common.cancel")}><X /></button>
            <span className="ai-report-modal-icon"><Sparkles /></span>
            <h2 id="ai-report-preflight-title">{t("aiReport.preflightTitle")}</h2>
            <p>{t("aiReport.preflightDescription")}</p>
            <dl>
              <div><dt>{t("aiReport.materials")}</dt><dd>{preflight.materialCount}</dd></div>
              <div><dt>{t("aiReport.slides")}</dt><dd>{preflight.slideCount}</dd></div>
              <div><dt>PIN</dt><dd>{preflight.questionCount}</dd></div>
              <div><dt>{t("aiReport.estimatedCost")}</dt><dd>${preflight.estimatedCostMinUsd.toFixed(2)}–${preflight.estimatedCostMaxUsd.toFixed(2)}</dd></div>
            </dl>
            <p className="ai-report-privacy-note">{t("aiReport.privacyNotice")}</p>
            {preflight.requiresCostConfirmation && <p className="ai-report-cost-warning">{t("aiReport.costConfirmation")}</p>}
            {error && <div className="login-error" role="alert">{error}</div>}
            <div className="ai-report-modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={closePreflight}>{t("common.cancel")}</button><button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>{busy ? <span className="spinner" /> : <Sparkles />}{t("aiReport.create")}</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
