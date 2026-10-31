import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { resolveDocumentBinary } from "@/app/_infrastructure/server/document-binaries";
import { getPdfPageCount, renderPdfPages } from "@/app/_infrastructure/server/pdf-render";
import { supabaseServerConfigured } from "@/app/_infrastructure/supabase/server";
import type { Slide } from "@/app/_model/types";
import { createPdfSlides, MAX_SOURCE_FILE_BYTES, SOURCE_FILE_TOO_LARGE_ERROR, sourceFileExtension } from "@/app/_model/upload";

export const runtime = "nodejs";
const run = promisify(execFile);

// 큰 자료도 처리할 수 있도록 Cloud Run 요청 제한(60분)보다 먼저 끝나게 잡는다.
const RENDER_TIMEOUT_MS = 3_300_000;
const SOFFICE_TIMEOUT_MS = 900_000;
/**
 * 페이지 구간을 나눠 동시에 렌더링할 pdftoppm 프로세스 수.
 *
 * 래스터화는 CPU 바운드라 vCPU 수를 넘겨봐야 서로 뺏기만 한다. 컨테이너에
 * 할당된 코어 수를 따라가되, 실측상 8 워커를 넘으면 효율이 급격히 떨어진다.
 */
const RENDER_WORKERS = Number(process.env.RENDER_WORKERS) || Math.min(8, Math.max(2, availableParallelism()));
/** 슬라이드 이미지 긴 변의 최대 픽셀 수. 렌더 비용과 전송량을 함께 좌우한다. */
const SLIDE_MAX_EDGE = Number(process.env.SLIDE_MAX_EDGE) || 3840;

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
    quality: 100,
    maxWorkers: RENDER_WORKERS,
    timeoutMs: RENDER_TIMEOUT_MS,
  });
}

/** 렌더된 슬라이드 한 장을 Storage 에 올리고 Slide 로 만든다. */
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
/**
 * 변환 진행을 NDJSON 으로 흘려보낸다. 한 줄에 한 이벤트:
 *   {"type":"meta","total":N} → {"type":"slide","slide":{…}} × N → {"type":"done"}
 * 실패하면 {"type":"error","error":"…"} 를 마지막에 보낸다. 응답 시작 전에 검증·인증을
 * 끝냈으므로 여기서는 200 스트림만 다룬다. work 정리 책임도 이 스트림이 가진다.
 */
export async function POST(request: Request) {
  // 로그인한 앱은 /api/rest/convert(백엔드)로 변환한다. 이 라우트는 Supabase 를
  // 설정하지 않은 로컬 데모 전용이라, 서버 비밀이 있는 배포 환경에서는 닫는다.
  if (supabaseServerConfigured) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let work: string | null = null;
  try {
    const encodedName = request.headers.get("x-file-name");
    if (!encodedName || !request.body) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    let fileName: string;
    try { fileName = decodeURIComponent(encodedName); }
    catch { return NextResponse.json({ error: "파일 이름이 올바르지 않습니다." }, { status: 400 }); }
    const sourceExtension = sourceFileExtension(fileName);
    if (!sourceExtension) return NextResponse.json({ error: "PDF 또는 PPT 파일만 지원합니다." }, { status: 415 });
    const declaredSize = Number(request.headers.get("content-length"));
    if (declaredSize > MAX_SOURCE_FILE_BYTES) return NextResponse.json({ error: SOURCE_FILE_TOO_LARGE_ERROR }, { status: 413 });
    work = await mkdtemp(path.join(tmpdir(), "pin-class-"));
    const source = path.join(work, `source${sourceExtension}`);
    await pipeline(Readable.fromWeb(request.body as unknown as NodeReadableStream), createWriteStream(source));
    if ((await stat(/* turbopackIgnore: true */ source)).size > MAX_SOURCE_FILE_BYTES) return NextResponse.json({ error: SOURCE_FILE_TOO_LARGE_ERROR }, { status: 413 });

    let pdf = source;
    if (sourceExtension !== ".pdf") {
      const soffice = await resolveDocumentBinary("soffice");
      await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", work, source], { timeout: SOFFICE_TIMEOUT_MS });
      pdf = path.join(work, "source.pdf");
      await rm(source);
    }

    const pdftoppm = await resolveDocumentBinary("pdftoppm");
    const total = await getPdfPageCount(pdftoppm, pdf);

    if (sourceExtension === ".pdf") {
      const outputId = crypto.randomUUID();
      const localDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
      await mkdir(localDir, { recursive: true });
      await copyFile(pdf, path.join(/* turbopackIgnore: true */ localDir, "source.pdf"));
      return NextResponse.json({ slides: createPdfSlides(total, `/generated/${outputId}/source.pdf`) });
    }

    const pages = path.join(work, "pages");
    await mkdir(pages, { recursive: true });
    let localDir: string | null = null;
    try {
      await renderPages(pdftoppm, pdf, pages, total);
      const images = (await readdir(pages)).filter((name) => name.endsWith(".jpg")).sort(byPageNumber);
      if (!images.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");
      const outputId = crypto.randomUUID();
      localDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
      await mkdir(localDir, { recursive: true });
      const slides = await Promise.all(images.map(async (name) => {
        await copyFile(path.join(pages, name), path.join(/* turbopackIgnore: true */ localDir!, name));
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
