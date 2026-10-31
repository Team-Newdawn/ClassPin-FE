import { getAccessToken } from "../_infrastructure/supabase/client";

export type ReportApiError = Error & { status: number; code?: string; body: Record<string, unknown> };

/** Instructor-JWT call to a same-origin admin API. A failure throws with the HTTP status, error code and body; the caller words it. */
export async function reportApi(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  if (!token) throw new Error("UNAUTHENTICATED");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { ...init?.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (response.ok) return response;
  const body = await response.json().catch(() => ({}));
  throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status, code: body.error, body }) as ReportApiError;
}

let audienceQueue = Promise.resolve();

/** Sends lecture audience records one at a time, so an in-flight periodic record never overwrites the final one. Demo mode has no server record. */
export function recordAudience(lectureId: string, record: unknown) {
  const run = audienceQueue.then(async () => {
    if (!await getAccessToken()) return;
    const body = JSON.stringify(record);
    // keepalive bodies are capped at 64KB.
    await reportApi(`/api/admin/lectures/${encodeURIComponent(lectureId)}/audience`, { method: "POST", keepalive: body.length < 60_000, body });
  });
  audienceQueue = run.catch(() => {});
  return run;
}
