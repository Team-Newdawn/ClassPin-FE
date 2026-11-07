import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analysisSlideImages, insightStorage, InsightRequestError, oneRenderAtATime, STALE_RUN_MS, type readOwnedInsightSource } from "./insight-request.ts";
import { analyzeSlides, groupQuestions, translateForDashboard, type InsightAi, type SharedAnalysis } from "./insight-ai.ts";

type Db = ReturnType<typeof insightStorage>;
type Source = Awaited<ReturnType<typeof readOwnedInsightSource>>;
type Material = Source["materials"][number];
type Progress = { step: "render" } | { step: "slides"; done: number; total: number };
export type DashboardExtra = { en: Awaited<ReturnType<typeof translateForDashboard>> };
export type AnalysisRow = { material_id: string; owner_id: string; fingerprint: string; status: "running" | "ready" | "failed"; error: string | null;
  slides: Omit<SharedAnalysis, "groups"> | null; groups: SharedAnalysis["groups"] | null; dashboard: DashboardExtra | null; started_at: string };

const TABLE = "material_analyses";
/** Bump when the shared-analysis prompts change, so stored results are made again (RPT-124). */
export const ANALYSIS_VERSION = 1;

/**
 * RPT-124: what a stored analysis was made from. Reaction counts and answer status are not in any prompt, so they are left out
 * and a new empathy click does not re-run the AI.
 */
export const analysisFingerprint = (material: Pick<Material, "versionId" | "slides" | "questions">, purpose: string, ai: Pick<InsightAi, "name" | "model">) =>
  createHash("sha256").update(JSON.stringify([ANALYSIS_VERSION, ai.name, ai.model(), purpose, material.versionId, material.slides.map((slide) => slide.id),
    material.questions.map((q) => [q.id, q.slideId, q.text, q.anchor, q.answers.map((answer) => answer.body)])])).digest("hex");

/**
 * RPT-125: reuse a ready result made from the same inputs, join this server's run of them, or start a new run (none yet, inputs
 * changed, failed, or a `running` row whose run is gone after a restart).
 */
export const nextStep = (row: Pick<AnalysisRow, "fingerprint" | "status"> | null, fingerprint: string, runningHere: boolean) =>
  row?.fingerprint !== fingerprint ? "run" : row.status === "ready" ? "use" : runningHere ? "wait" : "run";

/** What the dashboard reads (RPT-125 GET): the parts done so far; a run cut off for 15 minutes shows as failed. */
export function analysisView(row: AnalysisRow | null) {
  if (!row) return { status: "none" as const, error: null, slides: null, groups: null, en: null };
  const stale = row.status === "running" && Date.now() - Date.parse(row.started_at) > STALE_RUN_MS;
  return { status: stale ? "failed" as const : row.status, error: stale ? "ANALYSIS_INTERRUPTED" : row.error,
    slides: row.slides?.slides.flatMap((slide) => slide.slideId && slide.questionSummary ? [{ slideId: slide.slideId, summary: slide.questionSummary }] : []) ?? null,
    groups: row.groups, en: row.dashboard?.en ?? null };
}
export type AnalysisView = ReturnType<typeof analysisView>;

type Run = { fingerprint: string; progress: Progress; listeners: Set<(progress: Progress) => void>; ready: Promise<SharedAnalysis>; settled: Promise<unknown> };
// ponytail: in-memory, one server, like runningAnalyses. Two tabs or a report and a dashboard share one run; use a DB lease on more servers.
const runs: Map<string, Run> = ((globalThis as { materialAnalysisRuns?: Map<string, Run> }).materialAnalysisRuns ??= new Map());
const code = (error: unknown) => error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ANALYSIS_FAILED";

export async function readAnalysis(db: Db, ownerId: string, materialId: string) {
  const { data, error } = await db.from(TABLE).select("*").eq("material_id", materialId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  return data as AnalysisRow | null;
}

/**
 * RPT-120..125: the material's shared analysis. `ready` resolves with the result (stored, joined, or new); `run` is the run this
 * server is doing for it, null when the stored result was reused. The caller keeps `run.settled` alive (Next `after()`): it also
 * covers the dashboard-only translation, which never delays `ready`.
 */
export function ensureAnalysis(db: Db, ai: InsightAi, ownerId: string, source: Source, material: Material) {
  // `runs` is set only after the row is read and saved, so two first requests inside that window would both start a run
  // (2026-11-06: within ~80 ms locally). One check per material at a time; the second then joins the first run.
  const turn = (checking.get(material.id) ?? Promise.resolve()).catch(() => {}).then(() => startAnalysis(db, ai, ownerId, source, material));
  checking.set(material.id, turn);
  turn.catch(() => {}).finally(() => { if (checking.get(material.id) === turn) checking.delete(material.id); });
  return turn;
}
const checking = new Map<string, Promise<unknown>>();

async function startAnalysis(db: Db, ai: InsightAi, ownerId: string, source: Source, material: Material) {
  const purpose = source.purposes.get(material.folderId ?? "") ?? "", fingerprint = analysisFingerprint(material, purpose, ai);
  const row = await readAnalysis(db, ownerId, material.id), here = runs.get(material.id);
  const step = nextStep(row, fingerprint, here?.fingerprint === fingerprint);
  if (step === "use") return { row: row!, ready: Promise.resolve({ ...row!.slides!, groups: row!.groups ?? [] }), run: null };
  if (step === "wait") return { row: row!, ready: here!.ready, run: here! };

  const startedAt = new Date().toISOString();
  const saved = await db.from(TABLE).upsert({ material_id: material.id, owner_id: ownerId, fingerprint, status: "running", error: null, slides: null, groups: null,
    dashboard: null, provider: ai.name, model: ai.model(), started_at: startedAt, updated_at: startedAt }, { onConflict: "material_id" }).select("*").single();
  if (saved.error || !saved.data) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  // Only the run that owns the row writes, so an older run still unwinding never overwrites a newer one.
  const save = async (values: Record<string, unknown>) => {
    const { error } = await db.from(TABLE).update({ ...values, updated_at: new Date().toISOString() }).eq("material_id", material.id).eq("started_at", startedAt);
    if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  };
  const run: Run = { fingerprint, progress: { step: "render" }, listeners: new Set(), ready: Promise.resolve(null!), settled: Promise.resolve() };
  const tell = (progress: Progress) => { run.progress = progress; run.listeners.forEach((listen) => listen(progress)); };
  // Same ceiling the report draft had for its analysis; the grouping call runs beside the slide calls and is saved first.
  const signal = AbortSignal.timeout(280_000), pageOf = new Map(material.slides.map((slide) => [slide.id, slide.pageIndex + 1]));
  run.ready = (async () => {
    const work = await mkdtemp(path.join(tmpdir(), "analysis-"));
    try {
      const [groups, slides] = await Promise.all([
        groupQuestions(ai, material.questions.map((q) => ({ id: q.id, text: q.text, page: pageOf.get(q.slideId)! })), signal).then(async (groups) => { await save({ groups }); return groups; }),
        oneRenderAtATime(() => analysisSlideImages(material, work, signal))
          .then((pages) => analyzeSlides(ai, source, material, pages, purpose, signal, (done, total) => tell({ step: "slides", done, total })))
          .then(async (slides) => { await save({ slides }); return slides; }),
      ]);
      await save({ status: "ready" });
      return { ...slides, groups };
    } finally { await rm(work, { recursive: true, force: true }); }
  })();
  run.settled = run.ready.then(
    // RPT-122 dashboard-only: English after the shared result; a failure leaves the dashboard on Korean.
    (result) => translateForDashboard(ai, { groups: result.groups, slides: result.slides }, AbortSignal.timeout(90_000)).then((en) => save({ dashboard: { en } }))
      .catch((error) => console.error("Dashboard translation failed", code(error))),
    (error) => save({ status: "failed", error: code(error) }).catch(() => {}),
  ).finally(() => { if (runs.get(material.id) === run) runs.delete(material.id); });
  runs.set(material.id, run);
  return { row: saved.data as AnalysisRow, ready: run.ready, run };
}
