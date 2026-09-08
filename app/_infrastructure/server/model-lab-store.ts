import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { AdminApiError } from "./admin-api";
import type { LabSelection } from "@/app/_model/model-lab";
import { modelLabMetrics } from "@/app/_model/model-lab-metrics";

const ROOT = path.join(process.cwd(), "output/model-lab");
const DATA = path.join(process.cwd(), "output/model-benchmark-final-v1");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Meta = LabSelection & { id: string; ownerId: string; reportId: string; createdAt: string; status: string; mode: string; error?: string | null };
async function json(file: string) { return JSON.parse(await readFile(file, "utf8")); }

export async function labJobs(ownerId: string) {
  await mkdir(ROOT, { recursive: true });
  const names = (await readdir(ROOT)).filter(id => UUID.test(id));
  const rows: Meta[] = [];
  for (const id of names) {
    try { const meta = await json(path.join(ROOT, id, "meta.json")); if (meta.ownerId === ownerId) rows.push(meta); }
    catch { /* A newly created run may not have committed metadata yet. */ }
  }
  return rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(publicMeta);
}

function publicMeta(meta: Meta) {
  const { ownerId, ...row } = meta;
  void ownerId;
  return row;
}

export async function labJob(id: string, ownerId: string) {
  if (!UUID.test(id)) throw new AdminApiError(400, "INVALID_JOB");
  let meta: Meta;
  try { meta = await json(path.join(ROOT, id, "meta.json")); }
  catch { throw new AdminApiError(404, "JOB_NOT_FOUND"); }
  if (meta.ownerId !== ownerId) throw new AdminApiError(404, "JOB_NOT_FOUND");
  let run;
  try { run = await json(path.join(ROOT, id, "run.json")); } catch { /* Partial writes are retried on next poll. */ }
  const safe = publicMeta(meta);
  const [ocr, layout] = await Promise.all([meta.ocr,meta.layout].map(engine => json(path.join(DATA,engine,"result.json")).catch(()=>null)));
  return { ...safe, metrics: modelLabMetrics(meta,ocr,layout,run), completed: run?.records?.length ?? 0, run: meta.status === "complete" ? run : undefined };
}

export async function createLabJob(selection: LabSelection, mode: "cached" | "fresh", ownerId: string, reportId: string) {
  for (const engine of [selection.ocr, selection.layout]) {
    try { const stage = await json(path.join(DATA, engine, "result.json")); if (stage.status !== "complete" || stage.pages.length !== 15) throw Error(); }
    catch { throw new AdminApiError(409, "PREPROCESSING_MISSING"); }
  }
  let cached;
  if (mode === "cached") {
    for (const name of ["base", "ocr-easy", "ocr-paddle", "llm-small", "llm-granite"]) {
      const r = await json(path.join(DATA, `${name}.json`)).catch(() => null);
      if (r?.status === "complete" && r.ocr === selection.ocr && r.layout === selection.layout && r.llm === selection.llm) { cached = r; break; }
    }
    if (!cached) throw new AdminApiError(404, "NO_SAVED_COMBINATION");
  }
  const python = process.env.CLASSPIN_LAB_PYTHON || path.join(process.cwd(), ".local/model-benchmark-venv/Scripts/python.exe");
  const script = path.join(process.cwd(), "experiments/semantic_regions/model_lab.py");
  if (mode === "fresh") {
    try { await access(python); await access(script); }
    catch { throw new AdminApiError(409, "LOCAL_RUNTIME_MISSING"); }
    const active = (await labJobs(ownerId)).some(row => row.status === "running" && Date.now() - Date.parse(row.createdAt) < 21*60_000);
    if (active) throw new AdminApiError(409, "ANOTHER_RUN_ACTIVE");
  }
  const id = randomUUID(); const folder = path.join(ROOT, id);
  await mkdir(folder, { recursive: true });
  const meta: Meta = { ...selection, id, ownerId, reportId, mode, status: cached ? "complete" : "running", createdAt: new Date().toISOString() };
  await writeFile(path.join(folder, "meta.json"), JSON.stringify(meta));
  if (cached) {
    const stage = await json(path.join(DATA, selection.layout, "result.json"));
    await writeFile(path.join(folder, "run.json"), JSON.stringify({ ...cached, id, layoutRegionCounts: Object.fromEntries(stage.pages.map((p: {pageNumber:number;regions:unknown[]}) => [p.pageNumber, p.regions.length])) }));
  } else {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
    for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HF_HUB_CACHE", "CLASSPIN_LLAMA_SERVER"]) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { PYTHONUTF8: "1", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", OMP_NUM_THREADS: "4" });
    // Development-only external runtime; do not trace the repository into production output.
    const child = spawn(/* turbopackIgnore: true */ python, [script, "--job", id], { cwd: process.cwd(), env, windowsHide: true, stdio: "ignore" });
    const fail = async () => {
      try { const current = await json(path.join(folder, "meta.json")); if (current.status === "running") await writeFile(path.join(folder, "meta.json"), JSON.stringify({ ...current, status: "failed", error: "RUNNER_STOPPED" })); } catch { /* Keep the original file for diagnosis. */ }
    };
    child.on("error", () => { void fail(); });
    child.on("exit", () => { void fail(); });
  }
  return labJob(id, ownerId);
}
