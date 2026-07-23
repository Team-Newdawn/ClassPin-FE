import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { availableParallelism, homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSupabaseClientForToken } from "@/lib/supabase/server";
import type { Slide } from "@/lib/types";

export const runtime = "nodejs";
const run = promisify(execFile);

// 1 vCPU 에서 실제 강의 자료를 렌더링하면 60 초로는 어림도 없다. Cloud Run 의
// 요청 제한(300초) 안에서 최대한 여유를 두되, 그보다 먼저 끝나도록 잡는다.
const RENDER_TIMEOUT_MS = 240_000;
const SOFFICE_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 20_000;
/**
 * 페이지 구간을 나눠 동시에 렌더링할 pdftoppm 프로세스 수.
 *
 * 래스터화는 CPU 바운드라 vCPU 수를 넘겨봐야 서로 뺏기만 한다. 컨테이너에
 * 할당된 코어 수를 따라가되, 실측상 8 워커를 넘으면 효율이 급격히 떨어진다.
 */
const RENDER_WORKERS = Number(process.env.RENDER_WORKERS) || Math.min(8, Math.max(2, availableParallelism()));
/** Storage 업로드 동시 실행 수. 순차로 올리면 장수만큼 왕복이 쌓인다. */
const UPLOAD_CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY) || 12;

/** 배열을 동시 실행 수 제한을 둔 채로 매핑한다. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

/**
 * PDF 를 JPEG 로 렌더링한다.
 *
 * pdftoppm 은 페이지를 순차 처리하므로, 페이지 구간을 나눠 여러 프로세스로
 * 동시에 돌린다. 파일명이 페이지 번호로 정해져 구간끼리 충돌하지 않는다.
 */
async function renderPages(pdftoppm: string, pdf: string, outDir: string) {
  const args = ["-jpeg", "-r", "120", "-jpegopt", "quality=86"];
  const prefix = path.join(outDir, "slide");

  let total = 0;
  try {
    const { stdout } = await run(path.join(/* turbopackIgnore: true */ path.dirname(pdftoppm), "pdfinfo"), [pdf], { timeout: 30_000 });
    total = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 0);
  } catch { /* 페이지 수를 못 세면 아래에서 통째로 렌더링한다. */ }

  // 워커 하나가 최소 두 장은 맡게 해서, 장수가 적을 때 프로세스 띄우는 비용이
  // 렌더링 시간보다 커지지 않도록 한다. 워커 수를 고정하면 15 장짜리처럼 흔한
  // 크기에서 병렬화가 통째로 꺼져 버린다.
  const workers = Math.min(RENDER_WORKERS, Math.ceil(total / 2));
  if (!total || workers <= 1) {
    await run(pdftoppm, [...args, pdf, prefix], { timeout: RENDER_TIMEOUT_MS });
    return;
  }

  const size = Math.ceil(total / workers);
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= total; start += size) ranges.push([start, Math.min(start + size - 1, total)]);
  await Promise.all(ranges.map(([first, last]) =>
    run(pdftoppm, [...args, "-f", String(first), "-l", String(last), pdf, prefix], { timeout: RENDER_TIMEOUT_MS })
  ));
}

async function resolveBinary(name: "pdftoppm" | "soffice") {
  const envName = name === "pdftoppm" ? "PDFTOPPM_PATH" : "SOFFICE_PATH";
  // LibreOffice 에는 -v 가 없다. 물어보면 사용법을 뱉으며 비정상 종료하므로,
  // 멀쩡히 설치된 soffice 가 "없음" 으로 판정되어 PPT 변환이 통째로 막힌다.
  const versionFlag = name === "pdftoppm" ? "-v" : "--version";
  const pathCandidates = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((directory) => path.join(/* turbopackIgnore: true */ directory, name));
  const candidates = [
    process.env[envName],
    ...pathCandidates,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(/* turbopackIgnore: true */ homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override", name),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      // soffice 는 첫 실행에서 프로필을 만드느라 몇 초씩 걸린다.
      await run(candidate, [versionFlag], { timeout: PROBE_TIMEOUT_MS });
      return candidate;
    } catch { /* Try the next known runtime location. */ }
  }
  throw new Error(`${name} 실행 파일을 찾을 수 없습니다.`);
}

export async function POST(request: Request) {
  let work: string | null = null;
  let localDir: string | null = null;
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
      const soffice = await resolveBinary("soffice");
      await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", work, source], { timeout: SOFFICE_TIMEOUT_MS });
      pdf = path.join(work, "source.pdf");
    }

    const pages = path.join(work, "pages");
    await mkdir(pages, { recursive: true });
    const pdftoppm = await resolveBinary("pdftoppm");
    await renderPages(pdftoppm, pdf, pages);
    const images = (await readdir(pages)).filter((name) => name.endsWith(".jpg")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!images.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");

    // 컨테이너 디스크는 인스턴스가 죽으면 같이 사라지고 인스턴스끼리 공유되지도
    // 않는다. 변환한 자리에서 바로 Storage 에 올려야 재접속·재배포 후에도 남는다.
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const client = token ? getSupabaseClientForToken(token) : null;
    if (client) {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) return NextResponse.json({ error: "로그인 정보가 만료되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 401 });

      const uploadId = crypto.randomUUID();
      const bucket = client.storage.from("lecture-slides");
      const slides = await mapWithLimit(images, UPLOAD_CONCURRENCY, async (name, index) => {
        const id = crypto.randomUUID();
        // storage 정책이 첫 폴더명을 소유자로 검증한다. 경로 모양을 바꾸면 업로드가 막힌다.
        const imagePath = `${auth.user.id}/${uploadId}/${id}.jpg`;
        const { error: uploadError } = await bucket.upload(imagePath, await readFile(path.join(pages, name)), { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        return { id, pageIndex: index, title: `Slide ${index + 1}`, imagePath, imageUrl: bucket.getPublicUrl(imagePath).data.publicUrl } satisfies Slide;
      });
      return NextResponse.json({ slides });
    }

    // Supabase 를 설정하지 않은 로컬 데모 전용 경로. 배포 환경에서는 쓰이지 않는다.
    const outputId = crypto.randomUUID();
    localDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
    await mkdir(localDir, { recursive: true });
    const slides: Slide[] = [];
    for (const [index, name] of images.entries()) {
      await copyFile(path.join(pages, name), path.join(localDir, name));
      slides.push({ id: crypto.randomUUID(), pageIndex: index, title: `Slide ${index + 1}`, imageUrl: `/generated/${outputId}/${name}` });
    }
    return NextResponse.json({ slides });
  } catch (error) {
    if (localDir) await rm(localDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.";
    console.error("Slide conversion failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
