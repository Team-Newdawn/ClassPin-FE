"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { aiReportProgressPercent, type AiReportDetailDto, type AiReportEvidenceDto, type AiReportEvidenceLevel } from "@/app/_model/ai-report";
import { AiReportServiceError, fetchAiReport, fetchAiReportEvidence, retryAiReport } from "@/app/_service/ai-report-service";
import {experimentReport,type ExperimentRun} from "./experiment-model";

type ReportView = "evidence" | "narrative";
type ReportSection = { id: string; title: string; body: string; evidenceLevel: AiReportEvidenceLevel; evidenceRefs: string[] };
type MaterialDetail = { alias: string; title: string; slides: Array<{ alias: string; number: number; title: string; summary: string; regions: number; pins: number }> };

const TERMINAL = new Set(["ready", "failed", "confirmed", "deleting"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown) {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

function evidenceLevel(value: unknown): AiReportEvidenceLevel {
  return value === "sufficient" || value === "limited" || value === "insufficient" ? value : "insufficient";
}

function sections(value: unknown, prefix: string): ReportSection[] {
  const list = Array.isArray(value) ? value : [];
  return list.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `${prefix}-${index}`, title: "", body: item.trim(), evidenceLevel: "insufficient" as const, evidenceRefs: [] }];
    }
    const source = record(item);
    if (!source) return [];
    const body = text(source.body) || text(source.summary) || text(source.analysis) || text(source.description);
    if (!body) return [];
    return [{
      id: text(source.id) || `${prefix}-${index}`,
      title: text(source.title) || text(source.label),
      body,
      evidenceLevel: evidenceLevel(source.evidenceLevel ?? source.evidence_level),
      evidenceRefs: textList(source.evidenceRefs ?? source.evidence_refs),
    }];
  });
}

function materialDetails(value: unknown, snapshots: AiReportDetailDto["materials"]): MaterialDetail[] {
  const source = record(value);
  const rawMaterials = Array.isArray(source?.materials) ? source.materials : [];
  const parsed = rawMaterials.flatMap((item): MaterialDetail[] => {
    const material = record(item);
    if (!material) return [];
    const rawSlides = Array.isArray(material.slides) ? material.slides : [];
    const slides = rawSlides.flatMap((slide, index) => {
      const row = record(slide);
      if (!row) return [];
      return [{
        alias: text(row.slideAlias ?? row.slide_alias) || `S${String(index + 1).padStart(3, "0")}`,
        number: typeof row.slideNumber === "number" ? row.slideNumber : index + 1,
        title: text(row.title),
        summary: text(row.summary ?? row.slideSummary ?? row.slide_summary),
        regions: Array.isArray(row.regions) ? row.regions.length : Number(row.regionCount ?? 0),
        pins: Array.isArray(row.pins) ? row.pins.length : Number(row.pinCount ?? 0),
      }];
    });
    return [{ alias: text(material.materialAlias ?? material.material_alias), title: text(material.title), slides }];
  });
  if (parsed.length) return parsed;
  return snapshots.map((item) => ({ alias: item.material_alias, title: item.title_snapshot, slides: [] }));
}

export function useAiReportController(experiment?:ExperimentRun) {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const [savedReport, setReport] = useState<AiReportDetailDto | null>(null);
  const report=useMemo(()=>savedReport&&experiment?experimentReport(savedReport,experiment):savedReport,[savedReport,experiment]);
  const [view, setView] = useState<ReportView>("evidence");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<AiReportEvidenceDto | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const etag = useRef<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchAiReport(id, { signal, etag: etag.current });
      if (!result.notModified && result.data) {
        etag.current = result.etag;
        setReport(result.data);
      }
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof AiReportServiceError && cause.code === "AI_REPORT_NOT_FOUND" ? t("aiReport.notFound") : t("aiReport.loadFailed"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!report || TERMINAL.has(report.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        await load();
        if (!cancelled) schedule();
      }, document.visibilityState === "hidden" ? 10_000 : 2_000);
    };
    schedule();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [load, report]);

  const currentDisplay = useMemo(() => {
    const currentRevision = report?.revisions.find((item) => item.id === report.current_revision_id);
    return record(currentRevision?.display_result) ?? record(report?.canonical_result);
  }, [report]);
  const canonical = record(report?.canonical_result);
  const overallEvidence = evidenceLevel(canonical?.overallEvidenceLevel ?? canonical?.overall_evidence_level);
  const narrative = record(currentDisplay?.narrative);

  const openEvidence = useCallback(async (evidenceRef: string) => {
    setEvidenceLoading(true);
    setEvidenceError(null);
    try { setEvidence(await fetchAiReportEvidence(id, evidenceRef)); }
    catch { setEvidenceError(t("aiReport.evidenceLoadFailed")); }
    finally { setEvidenceLoading(false); }
  }, [id, t]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await retryAiReport(id, crypto.randomUUID());
      etag.current = null;
      await load();
    } catch {
      setError(t("aiReport.retryFailed"));
    } finally {
      setRetrying(false);
    }
  }, [id, load, retrying, t]);

  return {
    t,
    locale,
    report,
    view,
    setView,
    loading,
    error,
    reload: () => { setLoading(true); etag.current = null; void load(); },
    progress: report ? aiReportProgressPercent(report.progress_completed, report.progress_total) : 0,
    backHref: report?.folder_id ? `/admin/folders/${report.folder_id}?tab=insights` : "/admin/dashboard",
    overallEvidence,
    summary: sections(currentDisplay?.executiveSummary ?? currentDisplay?.executive_summary ?? canonical?.executiveSummary ?? canonical?.executive_summary, "summary"),
    confusion: sections(currentDisplay?.confusionPoints ?? currentDisplay?.confusion_points ?? canonical?.confusionPoints ?? canonical?.confusion_points, "confusion"),
    unanswered: sections(currentDisplay?.unansweredQuestions ?? currentDisplay?.unanswered_questions ?? canonical?.unansweredQuestions ?? canonical?.unanswered_questions, "unanswered"),
    priorities: sections(currentDisplay?.improvementPriorities ?? currentDisplay?.improvement_priorities ?? canonical?.improvementPriorities ?? canonical?.improvement_priorities, "priority"),
    narrativeTitle: text(narrative?.title),
    narrativeParagraphs: textList(narrative?.paragraphs ?? currentDisplay?.narrativeParagraphs ?? currentDisplay?.narrative_paragraphs),
    materials: report ? materialDetails(currentDisplay ?? canonical, report.materials) : [],
    evidence,
    evidenceLoading,
    evidenceError,
    openEvidence,
    closeEvidence: () => { setEvidence(null); setEvidenceError(null); },
    retrying,
    retry,
  };
}
