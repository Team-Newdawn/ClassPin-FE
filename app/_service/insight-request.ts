import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { cachedFile } from "../_infrastructure/server/pdf-cache.ts";
import { pdfPageImage } from "../_infrastructure/server/pdf-page.ts";
import { resolveDocumentBinary } from "../_infrastructure/server/document-binaries.ts";
import { restOrigin } from "../_infrastructure/server/rest-origin.ts";
import { MAX_PAGES, imageEdge, readableText, type SlidePage } from "./insight-ai.ts";
import { limiter } from "../_infrastructure/server/limiter.ts";
import { inspectInsightSource } from "./insight-source.ts";
import { CLASS_FOLDER_NAME_MAX, classFolderPurposeLine, normalizeClassFolderPurpose, normalizeClassFolderPurposeLabel, type ClassFolderPurpose } from "../_model/types.ts";
// The folder screen's Korean purpose names (app/_model/i18n.ts folders.purpose*).
const PURPOSE_NAMES: Record<ClassFolderPurpose, string> = { qa: "Q&A", feedback: "피드백", education: "교육", brainstorming: "브레인스토밍", other: "기타" };

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
  const origin = restOrigin();
  if (!origin) throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
  const get = (path: string) => fetch(`${origin}/api/instructor/${path}`, { headers: { Authorization: authorization },
    cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  // Folder purpose only steers the prompt, so a failed folder read analyzes without it.
  const [response, folders] = await Promise.all([get("courses"),
    get("folders").then((res) => res.ok ? boundedJson(res.body, 1024 * 1024) : [], () => [])]);
  if (!response.ok) throw new InsightRequestError("SOURCE_UNAVAILABLE", 502);
  const purposes = new Map((Array.isArray(folders) ? folders : []).map((folder: Record<string, unknown>) => {
    const purpose = normalizeClassFolderPurpose(folder?.purpose);
    // RPT-035: the folder name hints at the material kind (e.g. "창업 캠프"); it is instructor text, so quoted as data.
    const name = typeof folder?.name === "string" ? folder.name.replace(/\s+/g, " ").replaceAll("\"", "").trim().slice(0, CLASS_FOLDER_NAME_MAX) : "";
    return [String(folder?.id).toLowerCase(), `${name ? `이 자료가 속한 폴더 이름: "${name}".` : ""}${classFolderPurposeLine(purpose, normalizeClassFolderPurposeLabel(purpose, folder?.purpose_label), "ko")}`.trim()];
  }));
  // RPT-036 보고용 개요: "폴더 이름 · 사용 목적" as plain display text.
  const folderLabels = new Map((Array.isArray(folders) ? folders : []).map((folder: Record<string, unknown>) => {
    const purpose = normalizeClassFolderPurpose(folder?.purpose), name = typeof folder?.name === "string" ? folder.name.trim().slice(0, CLASS_FOLDER_NAME_MAX) : "";
    const label = purpose === "other" ? normalizeClassFolderPurposeLabel(purpose, folder?.purpose_label) ?? PURPOSE_NAMES.other : PURPOSE_NAMES[purpose];
    return [String(folder?.id).toLowerCase(), [name, label].filter(Boolean).join(" · ")];
  }));
  try { return { ...inspectInsightSource(await boundedJson(response.body, 32 * 1024 * 1024), selection), purposes, folderLabels }; }
  catch (error) {
    const missing = error instanceof Error && error.message === "SOURCE_NOT_FOUND";
    // The response keeps one code; the log keeps the check that failed (ORPHAN_QUESTION, SOURCE_LIMIT, ...).
    if (!missing) console.error("Insight source rejected", error instanceof Error ? error.message : "UNKNOWN");
    throw new InsightRequestError(missing ? "SOURCE_NOT_FOUND" : "INVALID_SOURCE", missing ? 404 : 422);
  }
}

export function insightStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new InsightRequestError("REPORT_STORAGE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" }) } });
}

/** A run still `running` after this long was cut off (server restart/deploy); analysis itself finishes in under ~9 minutes. */
export const STALE_RUN_MS = 15 * 60_000;
/** Report id → abort for analyses running in this server process; on globalThis so every route bundle sees the same map.
 * ponytail: per-process; with several servers a stop still marks the report failed but the other server's run finishes unseen. */
export const runningAnalyses: Map<string, AbortController> = ((globalThis as { insightRuns?: Map<string, AbortController> }).insightRuns ??= new Map());
/** One deck rasterizes at a time per server (CPU-bound, shares the box with live lectures), whether for analysis or export. */
export const oneRenderAtATime: ReturnType<typeof limiter> = ((globalThis as { insightRender?: ReturnType<typeof limiter> }).insightRender ??= limiter(1));
/** Chat slide views get their own one-at-a-time queue: a few pages must not wait minutes behind a whole-deck analysis. */
export const oneChatRenderAtATime: ReturnType<typeof limiter> = ((globalThis as { insightChatRender?: ReturnType<typeof limiter> }).insightChatRender ??= limiter(1));

const run = promisify(execFile);
/** Extracted page text kept for the AI: trimmed to 4000 chars, dropped when it is mostly garbage glyphs. */
const slideText = (raw: string) => { const text = raw.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000); return readableText(text) ? text : ""; };

const SOURCE_BYTES = 200 * 1024 ** 2;
type Material = ReturnType<typeof inspectInsightSource>["materials"][number];

/**
 * RPT-060: slide images for a report export, from the page images `/api/pdf/page` keeps on disk (1920px, the stage size),
 * so a slide already seen, or a second format of the same export, is not rendered again. Image slides and anything the
 * cache cannot serve go through renderMaterialSlides. No slide text is extracted; exports do not use it.
 * The caller has already checked the report owner's access to the material.
 */
// One export renders at a time (oneRenderAtATime); within it, half the cores like the draft render, not the viewers' two slots.
const exportSlot: ReturnType<typeof limiter> = ((globalThis as { exportPageRender?: ReturnType<typeof limiter> }).exportPageRender ??= limiter(Math.min(8, Math.max(1, Math.floor(availableParallelism() / 2)))));
export async function exportSlideImages(material: Material, dir: string, pages: readonly number[], signal?: AbortSignal) {
  const wanted = material.slides.filter((slide) => pages.includes(slide.pageIndex + 1)), bucket = insightStorage().storage.from("course-materials");
  const fromPdf = wanted.filter((slide) => slide.sourcePageIndex !== null);
  // Size gate before the source reaches the disk cache.
  const download = async () => {
    const info = await bucket.info(material.sourcePath);
    if (info.error || typeof info.data?.size !== "number") throw new Error("SOURCE_DOWNLOAD_FAILED");
    if (info.data.size > SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
    const file = await bucket.download(material.sourcePath).asStream();
    if (file.error || !file.data) throw new Error("SOURCE_DOWNLOAD_FAILED");
    return file.data;
  };
  const cached = await Promise.all(fromPdf.map(async (slide) => {
    signal?.throwIfAborted();
    const file = await pdfPageImage(material.sourcePath, slide.sourcePageIndex! + 1, 1920, download, exportSlot);
    const { width = 1, height = 1 } = await sharp(file).metadata();
    return { page: slide.pageIndex + 1, width, height, file, text: "" };
  }));
  const rest = wanted.filter((slide) => slide.sourcePageIndex === null).map((slide) => slide.pageIndex + 1);
  return { pages: [...cached, ...rest.length ? await renderMaterialSlides(material, dir, rest, signal) : []], pdf: fromPdf.length ? await cachedFile(material.sourcePath, download) : null };
}

/**
 * RPT-121: slide images for the shared analysis from the same 1920px page cache the player and exports use, shrunk to the
 * AI size, with the PDF's extracted text. A slide seen in the player is not rendered again (15 pages, 2026-11-05: 16 s with
 * pdftoppm → 0.2 s from the cache); pages the cache lacks render one by one and stay cached for the player.
 */
export async function analysisSlideImages(material: Material, dir: string, signal?: AbortSignal, only?: readonly number[]): Promise<SlidePage[]> {
  if (material.slides.length > MAX_PAGES) throw new Error("SOURCE_TOO_LARGE");
  const { pages, pdf } = await exportSlideImages(material, dir, only ?? material.slides.map((slide) => slide.pageIndex + 1), signal);
  const sourcePage = new Map(material.slides.flatMap((slide) => slide.sourcePageIndex === null ? [] : [[slide.pageIndex + 1, slide.sourcePageIndex + 1] as const]));
  // Text of the shown source pages only, so a chat's few slides do not extract the whole PDF.
  const used = pages.flatMap((page) => sourcePage.get(page.page) ?? []), first = Math.min(...used);
  const pdftotext = pdf && used.length && path.join(/* turbopackIgnore: true */ path.dirname(await resolveDocumentBinary("pdftoppm")), "pdftotext");
  const texts = pdftotext ? (await run(pdftotext, ["-layout", "-f", String(first), "-l", String(Math.max(...used)), pdf!, "-"], { timeout: 120_000, maxBuffer: 256 * 1024 ** 2, signal })).stdout.split("\f") : [];
  // sharp jobs hold libuv threads that /api/pdf disk reads also need, so two at a time, as in renderMaterialSlides.
  const slot = limiter(2);
  return Promise.all(pages.map((page) => slot(async () => {
    const source = sourcePage.get(page.page);
    // Image slides come from renderMaterialSlides already at the AI size.
    if (!source) return page;
    const edge = imageEdge([page]), out = path.join(dir, `ai-${page.page}.jpg`);
    const saved = await sharp(page.file).resize(edge, edge, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(out);
    return { page: page.page, width: saved.width, height: saved.height, file: out, text: slideText(texts[source - first] ?? "") };
  })));
}

/** Image slides (older PDF uploads, PPT/PPTX; all, or `only` these slide numbers) as Claude-ready JPEGs from their stored image.
 * PDF-page slides come from the page cache (exportSlideImages), so an image-only deck never downloads its source. */
export async function renderMaterialSlides(material: Material, dir: string, only?: readonly number[], signal?: AbortSignal): Promise<SlidePage[]> {
  if (material.slides.length > MAX_PAGES) throw new Error("SOURCE_TOO_LARGE");
  const db = insightStorage(), fromImage = material.slides.filter((slide) => slide.sourcePageIndex === null && (!only || only.includes(slide.pageIndex + 1)));
  // sharp jobs hold libuv threads that /api/pdf disk reads and DNS lookups also need, so keep two images in flight.
  const slot = limiter(2);
  return Promise.all(fromImage.map((slide) => slot(async (): Promise<SlidePage> => {
    signal?.throwIfAborted();
    const file = await db.storage.from("lecture-slides").download(slide.imagePath!);
    if (file.error || !file.data) throw new Error("SOURCE_DOWNLOAD_FAILED");
    const image = sharp(Buffer.from(await file.data.arrayBuffer())), { width = 1, height = 1 } = await image.metadata(), edge = imageEdge([{ width, height }]);
    const out = path.join(dir, `slide-${slide.pageIndex + 1}.jpg`);
    const saved = await image.resize(edge, edge, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(out);
    return { page: slide.pageIndex + 1, width: saved.width, height: saved.height, file: out, text: "" };
  })));
}
