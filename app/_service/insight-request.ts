import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { resolveDocumentBinary } from "../_infrastructure/server/document-binaries.ts";
import { renderPdfPages } from "../_infrastructure/server/pdf-render.ts";
import { MAX_PAGES, readableText, slideImageEdge, type SlidePage } from "./insight-claude.ts";
import { inspectInsightSource } from "./insight-source.ts";
import { classFolderPurposeLine, normalizeClassFolderPurpose, normalizeClassFolderPurposeLabel } from "../_model/types.ts";
import type { InsightReportBody, InsightReportView } from "../_model/insight-report.ts";

export class InsightRequestError extends Error {
  status: number;
  constructor(code: string, status: number) { super(code); this.status = status; }
}

export function insightResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function insightFailure(error: unknown) {
  return insightResponse({ error: error instanceof InsightRequestError ? error.message : "SERVICE_UNAVAILABLE" },
    error instanceof InsightRequestError ? error.status : 503);
}

export async function insightOwner(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) throw new InsightRequestError("AUTH_REQUIRED", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal }) } });
  const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer /i, ""));
  if (error && ![400, 401, 403].includes(error.status ?? 0)) throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
  if (error || !data.user || data.user.is_anonymous) throw new InsightRequestError("AUTH_REQUIRED", 401);
  const profile = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (profile.error || profile.data?.role !== "admin") throw new InsightRequestError("ACCESS_DENIED", 403);
  return { ownerId: data.user.id, authorization };
}

export async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error("EMPTY_BODY");
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new InsightRequestError("INPUT_LIMIT", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new InsightRequestError("INVALID_JSON", 400); }
}

export async function readOwnedInsightSource(authorization: string, selection: readonly string[], signal: AbortSignal) {
  const origin = new URL(process.env.REST_API_URL || "https://ohpinbe.newdawn.co.kr");
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) {
    throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
  }
  const get = (path: string) => fetch(`${origin.origin}/api/instructor/${path}`, { headers: { Authorization: authorization },
    cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  // Folder purpose only steers the prompt, so a failed folder read analyzes without it.
  const [response, folders] = await Promise.all([get("courses"),
    get("folders").then((res) => res.ok ? boundedJson(res.body, 1024 * 1024) : [], () => [])]);
  if (!response.ok) throw new InsightRequestError("SOURCE_UNAVAILABLE", 502);
  const purposes = new Map((Array.isArray(folders) ? folders : []).map((folder: Record<string, unknown>) => {
    const purpose = normalizeClassFolderPurpose(folder?.purpose);
    return [String(folder?.id).toLowerCase(), classFolderPurposeLine(purpose, normalizeClassFolderPurposeLabel(purpose, folder?.purpose_label), "ko").trim()];
  }));
  try { return { ...inspectInsightSource(await boundedJson(response.body, 32 * 1024 * 1024), selection), purposes }; }
  catch (error) {
    const missing = error instanceof Error && error.message === "SOURCE_NOT_FOUND";
    throw new InsightRequestError(missing ? "SOURCE_NOT_FOUND" : "INVALID_SOURCE", missing ? 404 : 422);
  }
}

export function insightStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new InsightRequestError("REPORT_STORAGE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" }) } });
}

export function reportView(row: { id: string; material_id: string; status: InsightReportView["status"]; error: string | null; created_at: string; body?: unknown; messages?: unknown }): InsightReportView {
  return { id: row.id, materialIds: [row.material_id], status: row.status, error: row.error, createdAt: row.created_at,
    body: (row.body as InsightReportBody | null) ?? null, ...(row.messages ? { messages: row.messages as InsightReportView["messages"] } : {}) };
}

const run = promisify(execFile);
/**
 * Renders the source PDF's pages (all, or `only` these 1-based pages) into `dir` as JPEGs sized for Claude so PIN
 * pixel coordinates line up, and extracts each page's text with poppler, which the runtime image already ships.
 * The size is computed from every page, so analysis and chat see the same image for a page.
 */
export async function renderSlidePages(file: string, dir: string, only?: readonly number[]): Promise<SlidePage[]> {
  const pdftoppm = await resolveDocumentBinary("pdftoppm"), poppler = (name: string) => path.join(/* turbopackIgnore: true */ path.dirname(pdftoppm), name);
  const { stdout: info } = await run(poppler("pdfinfo"), ["-f", "1", "-l", String(MAX_PAGES + 1), file], { timeout: 60_000, maxBuffer: 16 * 1024 ** 2 });
  const total = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
  if (!total || total > MAX_PAGES) throw new Error("SOURCE_TOO_LARGE");
  const sizes = Array.from({ length: total }, () => ({ width: 1, height: 1, rot: 0 }));
  for (const [, page, key, value] of info.matchAll(/^Page\s+(\d+) (size|rot):\s+(.+)$/gm)) {
    const item = sizes[Number(page) - 1];
    if (item && key === "rot") item.rot = Number(value);
    else if (item) [item.width, item.height] = value.split(" x ").map(parseFloat);
  }
  const shapes = sizes.map(({ width, height, rot }) => rot % 180 ? { width: height, height: width } : { width, height });
  const edge = slideImageEdge(shapes);
  const pages = only ? [...new Set(only)].filter((page) => page >= 1 && page <= total) : shapes.map((_, index) => index + 1);
  const args = ["-jpeg", "-scale-to", String(edge), "-jpegopt", "quality=90"], textOf = (from: number, to: number) =>
    run(poppler("pdftotext"), ["-layout", "-f", String(from), "-l", String(to), file, "-"], { timeout: 120_000, maxBuffer: 256 * 1024 ** 2 }).then(({ stdout }) => stdout.split("\f"));
  const texts = new Map<number, string>();
  if (only) {
    await Promise.all(pages.map(async (page) => {
      const [[text]] = await Promise.all([textOf(page, page), run(pdftoppm, [...args, "-f", String(page), "-l", String(page), file, path.join(dir, "page")], { timeout: 60_000 })]);
      texts.set(page, text);
    }));
  } else {
    const [all] = await Promise.all([textOf(1, total),
      // Image-heavy decks take seconds per page to rasterize, so use the cores like slide conversion does.
      renderPdfPages({ pdftoppm, pdf: file, outDir: dir, total, maxEdge: edge, quality: 90, maxWorkers: Math.min(8, Math.max(2, availableParallelism())), timeoutMs: 240_000 })]);
    all.forEach((text, index) => texts.set(index + 1, text));
  }
  const files = new Map((await readdir(dir)).flatMap((name) => { const page = /^page-0*(\d+)\.jpg$/.exec(name)?.[1]; return page ? [[Number(page), path.join(dir, name)] as const] : []; }));
  return pages.map((page) => {
    const image = files.get(page), { width, height } = shapes[page - 1], scale = edge / Math.max(width, height);
    if (!image) throw new Error("SOURCE_RENDER_FAILED");
    const text = (texts.get(page) ?? "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
    return { page, width: Math.round(width * scale), height: Math.round(height * scale), file: image, text: readableText(text) ? text : "" };
  });
}
