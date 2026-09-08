"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { labRequest, type LabJob } from "@/app/_service/model-lab-service";
import type { LabSelection } from "@/app/_model/model-lab";

export function useModelLab() {
  const [selection, setSelection] = useState<LabSelection>({ ocr:"paddleocr", layout:"ppv3", llm:"qwen4" });
  const [job, setJob] = useState<LabJob | null>(null);
  const [history, setHistory] = useState<LabJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef(0);
  const inFlight = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await labRequest<{jobs:LabJob[]}>(undefined,undefined,undefined,signal);
    setHistory(data.jobs);
    return data.jobs;
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void labRequest<{jobs:LabJob[]}>(undefined,undefined,undefined,abort.signal).then(({jobs}) => {
      if (abort.signal.aborted) return;
      setHistory(jobs);
      const active = jobs.find(j => j.status === "running");
      if (active && operation.current === 0) { setJob(active); setSelection({ocr:active.ocr,layout:active.layout,llm:active.llm}); }
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, []);
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await labRequest<LabJob>(jobId,undefined,undefined,abort.signal);
        if (abort.signal.aborted) return;
        setJob(next);
        if (next.status !== "running") { await refresh(abort.signal); return; }
      } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
      if (!abort.signal.aborted) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1500);
    return () => { abort.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus, refresh]);
  async function execute(mode: "cached" | "fresh") {
    if (inFlight.current) return;
    inFlight.current = true;
    const revision = ++operation.current; setBusy(true); setError("");
    try {
      const result = await labRequest<LabJob>(undefined,selection,mode);
      if (revision !== operation.current) return;
      setJob(result); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); inFlight.current = false; }
  }
  async function open(id: string) {
    const revision = ++operation.current; setError("");
    try {
      const next = await labRequest<LabJob>(id);
      if (revision !== operation.current) return;
      setJob(next); setSelection({ocr:next.ocr,layout:next.layout,llm:next.llm});
    } catch (e) { if (revision===operation.current) setError((e as Error).message); }
  }
  return { selection, setSelection, job, history, busy, error, execute, open };
}
