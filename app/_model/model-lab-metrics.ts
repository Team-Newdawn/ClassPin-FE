type StageInput = { processMs?: number; peakRssMiB?: number; status?: string; pages?: unknown[] };
type RunInput = {
  reportStageMs?: number; peakRssMiB?: number; readyMs?: number;
  promptTokens?: number; completionTokens?: number;
  records?: {alias?: string; page?: number; elapsedMs?: number; displayable?: boolean}[];
};
type JobInput = {mode: string; status: string; createdAt: string};
const measured = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function modelLabMetrics(job: JobInput, ocr: StageInput | null, layout: StageInput | null, run?: RunInput, now = Date.now()) {
  const records = run?.records ?? [];
  const stage = (key: "ocr" | "layout", source: StageInput | null) => ({
    key, status: source?.status === "complete" ? "cached" : "unavailable",
    measuredMs: measured(source?.processMs), peakRssMiB: measured(source?.peakRssMiB),
    completed: source?.pages?.length ?? 0, total: 15, apiCostKrw: 0,
  });
  return {
    stages: [stage("ocr", ocr), stage("layout", layout), {
      key: "llm", status: job.mode === "cached" ? "cached" : job.status,
      measuredMs: measured(run?.reportStageMs), peakRssMiB: measured(run?.peakRssMiB),
      completed: records.length, total: 17, apiCostKrw: 0,
    }],
    requestElapsedMs: job.status === "running" ? measured(Math.max(0, now - Date.parse(job.createdAt))) : null,
    readyMs: measured(run?.readyMs), promptTokens: measured(run?.promptTokens), completionTokens: measured(run?.completionTokens),
    apiCostKrw: 0, operatingCostKrw: null,
    pins: records.map((r,index) => ({alias:r.alias ?? `PIN ${index+1}`,page:r.page,elapsedMs:measured(r.elapsedMs),passed:r.displayable === true})),
  };
}
export type LabMetrics = ReturnType<typeof modelLabMetrics>;
export function labSeconds(ms: number | null) { return ms === null ? "미측정" : `${(ms / 1000).toLocaleString("ko-KR", {maximumFractionDigits:1})}초`; }
