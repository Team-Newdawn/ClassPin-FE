import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDocumentBinary } from "@/lib/server/document-binaries";
import { getPdfPageCount, renderPdfPages } from "@/lib/server/pdf-render";
import { getSupabaseClientForToken } from "@/lib/supabase/server";
import type { Slide } from "@/lib/types";

export const runtime = "nodejs";
const run = promisify(execFile);

// 1 vCPU 에서 실제 강의 자료를 렌더링하면 60 초로는 어림도 없다. Cloud Run 의
// 요청 제한(300초) 안에서 최대한 여유를 두되, 그보다 먼저 끝나도록 잡는다.
const RENDER_TIMEOUT_MS = 240_000;
const SOFFICE_TIMEOUT_MS = 180_000;
/**
 * 페이지 구간을 나눠 동시에 렌더링할 pdftoppm 프로세스 수.
 *
 * 래스터화는 CPU 바운드라 vCPU 수를 넘겨봐야 서로 뺏기만 한다. 컨테이너에
 * 할당된 코어 수를 따라가되, 실측상 8 워커를 넘으면 효율이 급격히 떨어진다.
 */
const RENDER_WORKERS = Number(process.env.RENDER_WORKERS) || Math.min(8, Math.max(2, availableParallelism()));
/** Storage 업로드 동시 실행 수. 순차로 올리면 장수만큼 왕복이 쌓인다. */
const UPLOAD_CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY) || 12;
/** 슬라이드 이미지 긴 변의 최대 픽셀 수. 렌더 비용과 전송량을 함께 좌우한다. */
const SLIDE_MAX_EDGE = Number(process.env.SLIDE_MAX_EDGE) || 1600;

/** slide-01.jpg, slide-10.jpg … 를 페이지 번호 순서로 정렬한다. */
const byPageNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
/** slide-07.jpg → 6 (0-기반). pdftoppm 은 파일명에 절대 페이지 번호를 박는다. */
const pageIndexOf = (name: string) => Number(/(\d+)\.jpg$/.exec(name)?.[1] ?? 0) - 1;

/**
 * PDF 를 JPEG 로 렌더링한다.
 *
 * pdftoppm 은 페이지를 순차 처리하므로, 페이지 구간을 나눠 여러 프로세스로
 * 동시에 돌린다. 파일명이 페이지 번호로 정해져 구간끼리 충돌하지 않는다.
 */
function renderPages(pdftoppm: string, pdf: string, outDir: string, total: number) {
  return renderPdfPages({
    pdftoppm,
    pdf,
    outDir,
    total,
    maxEdge: SLIDE_MAX_EDGE,
    quality: 86,
    maxWorkers: RENDER_WORKERS,
    timeoutMs: RENDER_TIMEOUT_MS,
  });
}

type UploadTarget = { bucket: ReturnType<SupabaseClient["storage"]["from"]>; ownerId: string; uploadId: string };

/** 렌더된 슬라이드 한 장을 Storage 에 올리고 Slide 로 만든다. */
async function uploadSlide(dir: string, name: string, target: UploadTarget): Promise<Slide> {
  const id = crypto.randomUUID();
  // storage 정책이 첫 폴더명을 소유자로 검증한다. 경로 모양을 바꾸면 업로드가 막힌다.
  const imagePath = `${target.ownerId}/${target.uploadId}/${id}.jpg`;
  const { error } = await target.bucket.upload(imagePath, await readFile(path.join(dir, name)), { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const pageIndex = pageIndexOf(name);
  return { id, pageIndex, title: `Slide ${pageIndex + 1}`, imagePath, imageUrl: target.bucket.getPublicUrl(imagePath).data.publicUrl };
}

/**
 * 렌더링과 Storage 업로드를 겹친다.
 *
 * 예전엔 모든 페이지를 다 그린 뒤 한꺼번에 올려, 업로드 몇 초가 렌더 시간 뒤에
 * 통째로 붙었다. 여기서는 pdftoppm 이 파일을 쓰는 족족 감지해서 바로 올리고,
 * 올라간 슬라이드를 onSlide 로 흘려보낸다 — 업로드가 렌더 뒤로 숨고, 첫 슬라이드가
 * 전체 완료를 기다리지 않고 먼저 도착한다.
 *
 * "다 써진 파일"은 두 번 연속 크기가 같은지로 판별한다. 렌더가 끝난 뒤 마지막으로
 * 한 번 훑어 아직 안 올린 파일을 마저 처리한다.
 */
async function renderUploadStream(
  pdftoppm: string, pdf: string, dir: string, total: number, target: UploadTarget,
  onSlide: (slide: Slide) => void,
): Promise<Slide[]> {
  const rendering = renderPages(pdftoppm, pdf, dir, total);
  let renderError: unknown = null;
  const done = rendering.then(() => true, (error) => { renderError = error; return true; });

  const sizes = new Map<string, number>();
  const seen = new Set<string>();
  const slides: Slide[] = [];
  const inflight = new Set<Promise<void>>();
  const enqueue = (name: string) => {
    seen.add(name);
    const task = uploadSlide(dir, name, target).then((slide) => { slides.push(slide); onSlide(slide); });
    const tracked = task.finally(() => inflight.delete(tracked));
    inflight.add(tracked);
  };

  let finished = false;
  while (!finished) {
    finished = await Promise.race([done, sleep(150).then(() => false)]);
    const files = (await readdir(dir)).filter((name) => name.endsWith(".jpg")).sort(byPageNumber);
    for (const name of files) {
      if (seen.has(name)) continue;
      if (!finished) {
        // 크기가 두 번 연속 같아야 다 써진 것으로 본다. 렌더가 끝난 뒤엔 남은 파일이 모두 완성됐다.
        const size = (await stat(path.join(dir, name))).size;
        const prev = sizes.get(name);
        sizes.set(name, size);
        if (prev === undefined || prev !== size || size === 0) continue;
      }
      if (inflight.size >= UPLOAD_CONCURRENCY) await Promise.race(inflight);
      enqueue(name);
    }
  }
  await Promise.all(inflight);
  if (renderError) throw renderError;
  if (!slides.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");
  slides.sort((a, b) => a.pageIndex - b.pageIndex);
  return slides;
}

/**
 * 변환 진행을 NDJSON 으로 흘려보낸다. 한 줄에 한 이벤트:
 *   {"type":"meta","total":N} → {"type":"slide","slide":{…}} × N → {"type":"done"}
 * 실패하면 {"type":"error","error":"…"} 를 마지막에 보낸다. 응답 시작 전에 검증·인증을
 * 끝냈으므로 여기서는 200 스트림만 다룬다. work 정리 책임도 이 스트림이 가진다.
 */
function streamConversion(pdftoppm: string, pdf: string, pages: string, total: number, target: UploadTarget, workDir: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        emit({ type: "meta", total });
        await renderUploadStream(pdftoppm, pdf, pages, total, target, (slide) => emit({ type: "slide", slide }));
        emit({ type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.";
        console.error("Slide conversion failed:", message);
        emit({ type: "error", error: message });
      } finally {
        controller.close();
        await rm(workDir, { recursive: true, force: true });
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // 프록시가 스트림을 모아두지 않고 그대로 흘리게 한다.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  let work: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "파일이 40MB를 초과합니다. 더 작은 파일로 다시 시도해 주세요." }, { status: 413 });

    const extension = path.extname(file.name).toLowerCase();
    if (![".pdf", ".ppt", ".pptx"].includes(extension)) return NextResponse.json({ error: "PDF 또는 PPT 파일만 지원합니다." }, { status: 415 });

    work = await mkdtemp(path.join(tmpdir(), "pin-class-"));
    const source = path.join(work, `source${extension}`);
    await writeFile(source, Buffer.from(await file.arrayBuffer()));
    let pdf = source;
    if (extension !== ".pdf") {
      const soffice = await resolveDocumentBinary("soffice");
      await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", work, source], { timeout: SOFFICE_TIMEOUT_MS });
      pdf = path.join(work, "source.pdf");
    }

    const pages = path.join(work, "pages");
    await mkdir(pages, { recursive: true });
    const pdftoppm = await resolveDocumentBinary("pdftoppm");
    const total = await getPdfPageCount(pdftoppm, pdf);

    // 컨테이너 디스크는 인스턴스가 죽으면 같이 사라지고 인스턴스끼리 공유되지도
    // 않는다. 변환한 자리에서 바로 Storage 에 올려야 재접속·재배포 후에도 남는다.
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const client = token ? getSupabaseClientForToken(token) : null;
    if (client) {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) return NextResponse.json({ error: "로그인 정보가 만료되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 401 });
      const target: UploadTarget = { bucket: client.storage.from("lecture-slides"), ownerId: auth.user.id, uploadId: crypto.randomUUID() };
      const workDir = work;
      work = null; // 정리 책임을 스트림에 넘긴다 — 아래 finally 는 건드리지 않는다.
      return streamConversion(pdftoppm, pdf, pages, total, target, workDir);
    }

    // Supabase 를 설정하지 않은 로컬 데모 전용 경로. 배포 환경에서는 쓰이지 않는다.
    let localDir: string | null = null;
    try {
      await renderPages(pdftoppm, pdf, pages, total);
      const images = (await readdir(pages)).filter((name) => name.endsWith(".jpg")).sort(byPageNumber);
      if (!images.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");
      const outputId = crypto.randomUUID();
      localDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
      await mkdir(localDir, { recursive: true });
      const slides = await Promise.all(images.map(async (name) => {
        await copyFile(path.join(pages, name), path.join(localDir!, name));
        const pageIndex = pageIndexOf(name);
        return { id: crypto.randomUUID(), pageIndex, title: `Slide ${pageIndex + 1}`, imageUrl: `/generated/${outputId}/${name}` } satisfies Slide;
      }));
      slides.sort((a, b) => a.pageIndex - b.pageIndex);
      return NextResponse.json({ slides });
    } catch (error) {
      if (localDir) await rm(localDir, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.";
    console.error("Slide conversion failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
